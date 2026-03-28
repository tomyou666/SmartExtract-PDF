"""PDFから目次をLLMで抽出するサービス。"""

import json
import math
import shutil
from pathlib import Path
from typing import Protocol, runtime_checkable

from injector import inject
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.gateways.litellm_gateway import ILlmCompletionGateway
from app.share.util import apply_llm_provider_api_key
from app.infrastructure.persistence.llm_settings_repository import (
    ILlmSettingsRepository,
)
from app.infrastructure.persistence.toc_pdf_storage import ITocPdfStorage
from app.schemas.toc import TocResponse

# PDF入力対応プロバイダ: Vertex AI, Bedrock, Anthropic API, OpenAI API, Mistral(file_idのみ)
# https://docs.litellm.ai/docs/completion/document_understanding


@runtime_checkable
class ITocExtractionService(Protocol):
    async def extract_toc_with_llm(
        self,
        pdf_path: Path,
        session: AsyncSession,
        llm_settings_repo: ILlmSettingsRepository,
    ) -> dict: ...


class TocExtractionService:
    """LLM で PDF 目次を抽出する。"""

    @inject
    def __init__(
        self,
        llm_gateway: ILlmCompletionGateway,
        toc_pdf_storage: ITocPdfStorage,
    ) -> None:
        self._llm_gateway = llm_gateway
        self._toc_pdf_storage = toc_pdf_storage

    MAX_TEXT_FOR_TOC = 30_000
    CHUNK_MAX_BYTES = 50 * 1024 * 1024  # 50MB
    SPLIT_THRESHOLD_BYTES = CHUNK_MAX_BYTES

    @staticmethod
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
        self,
        pdf_path: Path,
        model_string: str,
        system_prompt: str,
        user_text_prompt: str,
        use_pdf_input: bool,
    ) -> dict:
        """単一PDFの目次をLLMで抽出する。"""
        if use_pdf_input:
            messages = self._toc_pdf_storage.build_messages_with_pdf_file(
                pdf_path, system_prompt, user_text_prompt
            )
        else:
            pdf_text = self._toc_pdf_storage.extract_text_from_pdf(
                pdf_path, self.MAX_TEXT_FOR_TOC
            )
            user_content = (
                f"以下のPDFテキストから目次を抽出し、{user_text_prompt}\n\n---\n\n"
                f"{pdf_text[: self.MAX_TEXT_FOR_TOC]}"
            )
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ]
        raw = await self._llm_gateway.complete_with_response_format(
            model=model_string,
            messages=messages,
            response_format=TocResponse,
            log_label="toc extract",
        )
        if not raw:
            return {"items": []}
        return self._parse_toc_response(raw)

    async def _merge_partial_tocs_with_llm(
        self,
        partial_tocs_with_info: list[dict],
        model_string: str,
    ) -> dict:
        """補正済み部分目次をマージ用LLMに渡し、最終目次（TocResponse形式）を返す。"""
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
        raw = await self._llm_gateway.complete_with_response_format(
            model=model_string,
            messages=messages,
            response_format=TocResponse,
            log_label="toc merge",
        )
        if not raw:
            return {"items": []}
        return self._parse_toc_response(raw)

    async def extract_toc_with_llm(
        self,
        pdf_path: Path,
        session: AsyncSession,
        llm_settings_repo: ILlmSettingsRepository,
    ) -> dict:
        """
        LLMで目次を抽出し、指定のJSON形式で返す。
        51MB超のPDFは50MB以下に等分分割して各部分の目次を取得し、
        ページずれを補正した上でマージ用LLMで最終目次を生成する。
        """
        model_string, provider, api_key = await llm_settings_repo.get_llm_config(
            session
        )
        apply_llm_provider_api_key(provider, api_key)

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
        use_pdf_input = self._llm_gateway.supports_pdf_input(model_string)

        cleaned_path = self._toc_pdf_storage.clean_pdf(pdf_path)
        try:
            file_size = cleaned_path.stat().st_size
            if file_size * 1.1 > self.SPLIT_THRESHOLD_BYTES:
                num_chunks = math.ceil(file_size / self.CHUNK_MAX_BYTES)
                chunks, temp_dir = self._toc_pdf_storage.split_pdf_into_chunks(
                    cleaned_path, num_chunks
                )
                try:
                    try:
                        partial_tocs_with_info: list[dict] = []
                        for chunk_path, start_page_1based in chunks:
                            toc = await self._extract_toc_single(
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
                        return await self._merge_partial_tocs_with_llm(
                            partial_tocs_with_info, model_string
                        )
                    except Exception as e:
                        raise RuntimeError(f"LLM目次抽出エラー: {e!s}") from e
                finally:
                    shutil.rmtree(temp_dir, ignore_errors=True)
            else:
                try:
                    return await self._extract_toc_single(
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
