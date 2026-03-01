"""PDFから目次をLLMで抽出するサービス。"""

import base64
import os
from pathlib import Path

import litellm
from litellm.utils import supports_pdf_input
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.toc import TocResponse
from app.services.llm import get_llm_config

# 目次抽出に渡す最大テキスト長（テキスト抽出フォールバック時・トークン節約）
MAX_TEXT_FOR_TOC = 30_000

# PDF入力対応プロバイダ: Vertex AI, Bedrock, Anthropic API, OpenAI API, Mistral(file_idのみ)
# https://docs.litellm.ai/docs/completion/document_understanding


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


async def extract_toc_with_llm(
    pdf_path: Path,
    db: AsyncSession,
) -> dict:
    """
    LLMで目次を抽出し、指定のJSON形式で返す。
    プロバイダがPDF入力をサポートしていればファイルをそのまま渡し、
    そうでなければテキスト抽出してフォールバックする。
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

    try:
        response = await litellm.acompletion(
            model=model_string,
            messages=messages,
            stream=False,
            response_format=TocResponse,
        )
    except Exception as e:
        raise RuntimeError(f"LLM目次抽出エラー: {e!s}") from e

    if not response.choices or not response.choices[0].message.content:
        return {"items": []}

    raw = response.choices[0].message.content.strip()
    # マークダウンコードブロックで囲まれている場合は除去
    if raw.startswith("```"):
        lines = raw.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines)
    try:
        parsed = TocResponse.model_validate_json(raw)
    except Exception:
        parsed = TocResponse(items=[])
    return parsed.model_dump(mode="json")
