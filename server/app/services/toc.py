"""PDFから目次をLLMで抽出するサービス。"""

import base64
import json
import math
import os
import shutil
import tempfile
from pathlib import Path

import litellm
from litellm.utils import supports_pdf_input
from pypdf import PdfReader, PdfWriter
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.toc import TocResponse
from app.services.llm import get_llm_config

# 目次抽出に渡す最大テキスト長（テキスト抽出フォールバック時・トークン節約）
MAX_TEXT_FOR_TOC = 30_000

# 分割判定: 元サイズ + 1MB で 50MB 超なら分割（オーバーヘッド考慮）
CHUNK_MAX_BYTES = 50 * 1024 * 1024  # 50MB
SPLIT_THRESHOLD_BYTES = CHUNK_MAX_BYTES + 1 * 1024 * 1024  # 51MB

# PDF入力対応プロバイダ: Vertex AI, Bedrock, Anthropic API, OpenAI API, Mistral(file_idのみ)
# https://docs.litellm.ai/docs/completion/document_understanding


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
        for p in range(start, end):
            writer.add_page(reader.pages[p])
        chunk_path = temp_dir / f"chunk_{i}.pdf"
        with open(chunk_path, "wb") as f:
            writer.write(f)
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
        "あなたは複数の部分目次を1つにまとめるアシスタントです。"
        "重複を除き、ページ番号の昇順で整列した最終目次を、"
        "指定されたJSON形式（items: list of {title, page, level}）のみで答えてください。"
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
        "あなたはPDFから目次を抽出するアシスタントです。"
        "見出し（章・節・項など）とそのページ番号を階層レベル付きで抽出し、"
        "指定されたJSON形式のみで答えてください。"
        "ページ番号は1始まりの整数にしてください。"
        "目次らしきものが見つからない場合は空のitemsで返してください。"
    )
    user_text_prompt = (
        "このPDFの目次を抽出し、"
        "各項目について title（見出し）, page（ページ番号）, level（1=章, 2=節, 3=項...）"
        "を持つJSON形式で返してください。"
    )
    use_pdf_input = supports_pdf_input(model=model_string)

    file_size = pdf_path.stat().st_size
    if file_size > SPLIT_THRESHOLD_BYTES:
        num_chunks = math.ceil(file_size / CHUNK_MAX_BYTES)
        chunks, temp_dir = _split_pdf_into_chunks(pdf_path, num_chunks)
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
                pdf_path,
                model_string,
                system_prompt,
                user_text_prompt,
                use_pdf_input,
            )
        except Exception as e:
            raise RuntimeError(f"LLM目次抽出エラー: {e!s}") from e
