"""LiteLLM integration: load settings and build messages for completion."""

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def db_row_to_ui_message(
    role: str, content_json: dict[str, Any] | None
) -> dict[str, Any]:
    """Convert a DB message row (role, content_json) to UI message format for build_litellm_messages."""
    content_json = content_json or {}
    parts = content_json.get("parts")
    text_val = content_json.get("text")
    if parts is not None:
        return {"role": role, "parts": parts}
    if text_val is not None:
        return {"role": role, "parts": [{"type": "text", "text": text_val}]}
    return {"role": role, "parts": [{"type": "text", "text": ""}]}


def build_litellm_messages(ui_messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert UI messages (from Vercel AI SDK format) to LiteLLM message format.
    過去メッセージの画像は送らず、最新のメッセージの画像のみ含める。"""
    out: list[dict[str, Any]] = []
    last_index = len(ui_messages) - 1
    for i, msg in enumerate(ui_messages):
        role = msg.get("role")
        if role not in ("user", "assistant", "system"):
            continue
        is_last_message = i == last_index
        # parts は常にリストにする（content が文字列のときは 1 要素のテキストパートに正規化）
        raw_parts = msg.get("parts")
        if isinstance(raw_parts, list):
            parts = raw_parts
        else:
            text_val = msg.get("content") or msg.get("text") or ""
            parts = [{"type": "text", "text": text_val}] if text_val else []
        content_parts: list[dict[str, Any]] = []
        for part in parts:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "text":
                content_parts.append({"type": "text", "text": part.get("text", "")})
            elif part.get("type") == "file" and is_last_message:
                url = part.get("url") or part.get("data") or part.get("image_url")
                if url:
                    content_parts.append(
                        {
                            "type": "image_url",
                            "image_url": {"url": url},
                        }
                    )
        # 最新のメッセージのみ experimental_attachments（画像添付）を含める
        if is_last_message:
            for att in msg.get("experimental_attachments") or []:
                url = (
                    att.get("url")
                    if isinstance(att, dict)
                    else getattr(att, "url", None)
                )
                if url:
                    content_parts.append(
                        {"type": "image_url", "image_url": {"url": url}}
                    )
        if content_parts:
            out.append({"role": role, "content": content_parts})
        elif not out or out[-1].get("role") != role:
            out.append({"role": role, "content": ""})
    return out


async def get_llm_config(db: AsyncSession) -> tuple[str, str, str | None]:
    """Return (model_string, provider, api_key). model_string is e.g. openai/gpt-4o."""
    result = await db.execute(
        text("SELECT provider, api_key_encrypted, model FROM llm_settings WHERE id = 1")
    )
    row = result.mappings().one_or_none()
    if not row:
        raise ValueError("LLM settings not found")
    provider = row["provider"] or "openai"
    # Google は LiteLLM では gemini プロバイダーを使用
    litellm_provider = "gemini" if (provider or "").lower() == "google" else provider
    model = row["model"] or "gpt-4o"
    api_key = row["api_key_encrypted"]
    # LiteLLM model string: provider/model
    model_string = f"{litellm_provider}/{model}"
    return model_string, provider, api_key
