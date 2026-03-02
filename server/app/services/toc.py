"""PDFから目次をLLMで抽出するサービス。"""

import base64
import json
import logging
import math
import os
import shutil
import tempfile
from pathlib import Path

import litellm
from litellm import completion_cost
from litellm.utils import supports_pdf_input
from pikepdf import Pdf
from pypdf import PdfReader, PdfWriter
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.toc import TocResponse
from app.services.llm import get_llm_config

logger = logging.getLogger(__name__)

# 目次抽出に渡す最大テキスト長（テキスト抽出フォールバック時・トークン節約）
MAX_TEXT_FOR_TOC = 30_000

# 分割判定: 元サイズ 50MB 超なら分割
CHUNK_MAX_BYTES = 50 * 1024 * 1024  # 50MB
SPLIT_THRESHOLD_BYTES = CHUNK_MAX_BYTES

# PDF入力対応プロバイダ: Vertex AI, Bedrock, Anthropic API, OpenAI API, Mistral(file_idのみ)
# https://docs.litellm.ai/docs/completion/document_understanding


def _clean_pdf(pdf_path: Path) -> Path:
    """
    未使用オブジェクトとメタデータ（プロパティ）を削除したPDFを一時ファイルに書き出す。
    返り値のパスは呼び出し側で削除すること。
    """
    reader = PdfReader(str(pdf_path))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    writer.metadata = None  # /Info などのプロパティを削除
    fd, temp_path = tempfile.mkstemp(suffix=".pdf", prefix="toc_cleaned_")
    try:
        with os.fdopen(fd, "wb") as f:
            writer.write(f)
        return Path(temp_path)
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        os.unlink(temp_path)
        raise


def _split_pdf_into_chunks(
    pdf_path: Path,
    num_chunks: int,
) -> tuple[list[tuple[Path, int]], Path]:
    """
    PDFをページで等分し、各チャンクを一時PDFとして保存する。
    返り値: ((一時PDFのPath, そのチャンクの先頭ページ 1-based) のリスト, 一時ディレクトリのPath)
    """
    reader = PdfReader(str(pdf_path))
    total_pages = len(reader.pages)
    pages_per_chunk = math.ceil(total_pages / num_chunks) if num_chunks else 0
    temp_dir = Path(tempfile.mkdtemp(prefix="toc_chunks_"))
    result: list[tuple[Path, int]] = []
    for i in range(num_chunks):
        start = i * pages_per_chunk
        end = min((i + 1) * pages_per_chunk, total_pages)
        if start >= total_pages:
            break
        start_page_1based = start + 1
        writer = PdfWriter()
        # 必要なページのみ取り込むため append を使用（add_page は元のページ情報を引き継ぎやすい）
        writer.append(pdf_path, outline_item=None, pages=(start, end))
        # 未参照オブジェクトの削除と同一オブジェクトの統合でチャンクサイズを削減
        writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        for page in writer.pages:
            page.compress_content_streams()
        chunk_path = temp_dir / f"chunk_{i}.pdf"
        with open(chunk_path, "wb") as f:
            writer.write(f)
        # pikepdf で未使用オブジェクトを削除
        with Pdf.open(chunk_path, allow_overwriting_input=True) as pdf:
            pdf.remove_unreferenced_resources()
            pdf.save(chunk_path)
        result.append((chunk_path, start_page_1based))
    return (result, temp_dir)


def extract_text_from_pdf(pdf_path: Path) -> str:
    """PDFからテキストを抽出する（先頭からMAX_TEXT_FOR_TOC文字まで）。"""
    reader = PdfReader(str(pdf_path))
    parts: list[str] = []
    total = 0
    for page in reader.pages:
        if total >= MAX_TEXT_FOR_TOC:
            break
        text = page.extract_text() or ""
        take = min(len(text), MAX_TEXT_FOR_TOC - total)
        if take > 0:
            parts.append(text[:take])
            total += take
    return "\n\n".join(parts)


def _build_messages_with_pdf_file(
    pdf_path: Path,
    system_prompt: str,
    user_text: str,
) -> list[dict]:
    """PDFをBase64でメッセージに含める（document_understanding形式）。"""
    data = pdf_path.read_bytes()
    encoded = base64.b64encode(data).decode("utf-8")
    file_data = f"data:application/pdf;base64,{encoded}"
    file_content = [
        {"type": "text", "text": user_text},
        {
            "type": "file",
            "file": {"file_data": file_data},
        },
    ]
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": file_content},
    ]


def _parse_toc_response(raw: str) -> dict:
    """LLMの生テキストをパースして TocResponse の dict を返す。"""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    try:
        parsed = TocResponse.model_validate_json(text)
    except Exception:
        parsed = TocResponse(items=[])
    return parsed.model_dump(mode="json")


async def _extract_toc_single(
    pdf_path: Path,
    model_string: str,
    system_prompt: str,
    user_text_prompt: str,
    use_pdf_input: bool,
) -> dict:
    """
    単一PDFの目次をLLMで抽出する。
    messages 組み立て + acompletion + パースまでを行う。
    """
    if use_pdf_input:
        messages = _build_messages_with_pdf_file(
            pdf_path, system_prompt, user_text_prompt
        )
    else:
        pdf_text = extract_text_from_pdf(pdf_path)
        user_content = (
            f"以下のPDFテキストから目次を抽出し、{user_text_prompt}\n\n---\n\n"
            f"{pdf_text[:MAX_TEXT_FOR_TOC]}"
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
    response = await litellm.acompletion(
        model=model_string,
        messages=messages,
        stream=False,
        response_format=TocResponse,
    )
    try:
        cost = completion_cost(completion_response=response)
        logger.info(
            "LLM cost (toc extract): model=%s cost_usd=%.6f",
            model_string,
            float(cost or 0),
        )
    except Exception as cost_err:
        logger.warning("LLM cost logging failed: %s", cost_err, exc_info=True)
    if not response.choices or not response.choices[0].message.content:
        return {"items": []}
    raw = response.choices[0].message.content.strip()
    return _parse_toc_response(raw)


async def _merge_partial_tocs_with_llm(
    partial_tocs_with_info: list[dict],
    model_string: str,
) -> dict:
    """
    補正済み部分目次をマージ用LLMに渡し、最終目次（TocResponse形式）を返す。
    partial_tocs_with_info: 各要素は {"start_page_1based": int, "items": [TocItem...]}
    """
    merge_system = (
        "# 役割\n"
        "あなたは、サイズ制限で複数ブロックに分割して取得した部分目次を、1つにまとめるアシスタントです。\n\n"
        "# 出力フォーマット\n"
        "以下の構造を持つJSONのみを出力してください（説明文や挨拶は一切不要です）。\n"
        '{"items": [{"title": "見出し", "page": ページ番号（1始まりの通し）, "level": 階層レベル（1〜6）}]}\n\n'
        "# マージルール\n"
        "1. **重複の除去**: 同一またはほぼ同一の見出しが複数ブロックに含まれる場合は、1件にまとめてください。\n"
        "2. **並び順**: ページ番号（page）の昇順で整列した目次にしてください。\n"
        "3. **ページ番号**: 入力の各ブロックは既に「元PDFの通しページ番号」で補正済みです。その値をそのまま使用してください。\n"
        "4. **階層の保持**: 各項目の level（1=章, 2=節, 3=項...）は、部分目次で得られた値を維持してください。\n"
        "5. **形式の統一**: 図表タイトルや説明用の行は含めず、見出し構造のみの items にしてください。"
    )
    parts_text = []
    for i, block in enumerate(partial_tocs_with_info):
        start = block.get("start_page_1based", 1)
        items = block.get("items", [])
        parts_text.append(
            f"ブロック{i + 1}（元PDFの{start}ページ目から）:\n{json.dumps(items, ensure_ascii=False)}"
        )
    user_content = (
        "このPDFはサイズ制限のため複数ブロックに分割して取得した目次です。"
        "ページ番号は既に元のPDF通しで補正済みです。"
        "以下を重複除去しページ順に整列した最終目次をJSON形式で出力してください。\n\n"
        + "\n\n".join(parts_text)
    )
    messages = [
        {"role": "system", "content": merge_system},
        {"role": "user", "content": user_content},
    ]
    response = await litellm.acompletion(
        model=model_string,
        messages=messages,
        stream=False,
        response_format=TocResponse,
    )
    try:
        cost = completion_cost(completion_response=response)
        logger.info(
            "LLM cost (toc merge): model=%s cost_usd=%.6f",
            model_string,
            float(cost or 0),
        )
    except Exception as cost_err:
        logger.warning("LLM cost logging failed: %s", cost_err, exc_info=True)
    if not response.choices or not response.choices[0].message.content:
        return {"items": []}
    return _parse_toc_response(response.choices[0].message.content.strip())


async def extract_toc_with_llm(
    pdf_path: Path,
    db: AsyncSession,
) -> dict:
    """
    LLMで目次を抽出し、指定のJSON形式で返す。
    51MB超のPDFは50MB以下に等分分割して各部分の目次を取得し、
    ページずれを補正した上でマージ用LLMで最終目次を生成する。
    """
    model_string, provider, api_key = await get_llm_config(db)
    if api_key:
        env_key = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "google": "GEMINI_API_KEY",
            "gemini": "GEMINI_API_KEY",
            "groq": "GROQ_API_KEY",
        }.get(provider.lower(), "OPENAI_API_KEY")
        os.environ[env_key] = api_key

    system_prompt = (
        "# 役割\n"
        "あなたはアップロードされたPDFを全ページ解析し、その構成（目次）を抽出するアシスタントです。\n\n"
        "# 出力フォーマット\n"
        "以下の構造を持つJSONのみを出力してください（説明文や挨拶は一切不要です）。\n"
        '{"items": [{"title": "見出し（章・節・項の名称）", "page": PDF上の実ページ番号（1始まりの通し）, "level": 階層レベル（数値）}]}\n\n'
        "# 抽出・解析ルール\n"
        "1. **全ページのスキャン**: テキストが含まれる場合はそれを優先し、テキストがない（画像・スキャン）場合は画像解析を用いて、全ページの見出しを特定してください。\n"
        "2. **階層の定義**: 最上位（Part、部、第〇章など）を level: 1、その下の節（1.1、第一節など）を level: 2、さらに下の項（1.1.1など）を level: 3 としてください。\n"
        "3. **ページ番号**: 本文の印刷ページ番号ではなく、PDFビューアで表示される「ファイル先頭からの通し番号」を page に記載してください。\n"
        "4. **目次ページの扱い（※重要）**: PDF内に「目次」ページがある場合は、**その内容は必ず読まずに、続く本文ページから直接内容とページを読み取ってください。**\n"
        "5. **精度**: 途中を省略せず最終ページまで確認し、網羅的な目次にしてください。図表のタイトルは含めず、文章の構造を示す見出しのみを抽出してください。\n"
        "目次らしきものが見つからない場合は空の items で返してください。"
    )
    user_text_prompt = (
        "このPDFを全ページ解析し、上記のルールに従って構成（目次）を抽出し、"
        "指定のJSON形式のみで出力してください。\n"
        "重ねての重要な注意点: 目次ページは必ず読まずに、続く本文ページから直接内容とページを読み取ってください。"
    )
    use_pdf_input = supports_pdf_input(model=model_string)

    # 各処理の前にプロパティ・未使用オブジェクトを削除したPDFを用意する
    cleaned_path = _clean_pdf(pdf_path)
    try:
        file_size = cleaned_path.stat().st_size
        # オーバーヘッド考慮して10%増やして判定
        if file_size * 1.1 > SPLIT_THRESHOLD_BYTES:
            num_chunks = math.ceil(file_size / CHUNK_MAX_BYTES)
            chunks, temp_dir = _split_pdf_into_chunks(cleaned_path, num_chunks)
            try:
                try:
                    partial_tocs_with_info: list[dict] = []
                    for chunk_path, start_page_1based in chunks:
                        toc = await _extract_toc_single(
                            chunk_path,
                            model_string,
                            system_prompt,
                            user_text_prompt,
                            use_pdf_input,
                        )
                        items = toc.get("items", [])
                        for item in items:
                            item["page"] = item["page"] + (start_page_1based - 1)
                        partial_tocs_with_info.append(
                            {"start_page_1based": start_page_1based, "items": items}
                        )
                    return await _merge_partial_tocs_with_llm(
                        partial_tocs_with_info, model_string
                    )
                except Exception as e:
                    raise RuntimeError(f"LLM目次抽出エラー: {e!s}") from e
            finally:
                shutil.rmtree(temp_dir, ignore_errors=True)
        else:
            try:
                return await _extract_toc_single(
                    cleaned_path,
                    model_string,
                    system_prompt,
                    user_text_prompt,
                    use_pdf_input,
                )
            except Exception as e:
                raise RuntimeError(f"LLM目次抽出エラー: {e!s}") from e
    finally:
        cleaned_path.unlink(missing_ok=True)
