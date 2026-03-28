"""共有ユーティリティ。"""

import os


def apply_llm_provider_api_key(provider: str, api_key: str | None) -> None:
    """DB 由来の API キーをプロセス環境に反映する（LiteLLM が参照）。"""
    if not api_key:
        return
    env_key = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "google": "GEMINI_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "groq": "GROQ_API_KEY",
    }.get(provider.lower(), "OPENAI_API_KEY")
    os.environ[env_key] = api_key
