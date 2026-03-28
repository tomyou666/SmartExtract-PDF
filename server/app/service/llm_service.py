"""LiteLLM integration: build messages for completion (DB 非依存)。"""

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ILlmMessageService(Protocol):
    def db_row_to_ui_message(
        self, role: str, content_json: dict[str, Any] | None
    ) -> dict[str, Any]: ...

    def build_litellm_messages(
        self, ui_messages: list[dict[str, Any]]
    ) -> list[dict[str, Any]]: ...


class LlmMessageService:
    """UI / DB メッセージ形式と LiteLLM 用メッセージの変換。"""

    def db_row_to_ui_message(
        self, role: str, content_json: dict[str, Any] | None
    ) -> dict[str, Any]:
        """DB メッセージ行 (role, content_json) を build_litellm_messages 用 UI 形式へ。"""
        content_json = content_json or {}
        parts = content_json.get("parts")
        text_val = content_json.get("text")
        if parts is not None:
            return {"role": role, "parts": parts}
        if text_val is not None:
            return {"role": role, "parts": [{"type": "text", "text": text_val}]}
        return {"role": role, "parts": [{"type": "text", "text": ""}]}

    def build_litellm_messages(
        self, ui_messages: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Vercel AI SDK 形式の UI メッセージを LiteLLM 用に変換する。
        過去メッセージの画像は送らず、最新のメッセージの画像のみ含める。"""
        out: list[dict[str, Any]] = []
        last_index = len(ui_messages) - 1
        for i, msg in enumerate(ui_messages):
            role = msg.get("role")
            if role not in ("user", "assistant", "system"):
                continue
            is_last_message = i == last_index
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
