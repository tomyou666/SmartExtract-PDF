"""LLM API キーの Fernet 暗号化。"""

from cryptography.fernet import Fernet, InvalidToken
from injector import inject

from app.config.settings import Settings


class LlmApiKeyCipher:
    @inject
    def __init__(self, settings: Settings) -> None:
        raw = (settings.llm_settings_fernet_key or "").strip()
        if not raw:
            raise ValueError(
                "llm_settings_fernet_key (LLM_SETTINGS_FERNET_KEY) is required"
            )
        self._fernet = Fernet(raw.encode("ascii"))

    def encrypt(self, plaintext: str | None) -> str | None:
        if plaintext is None:
            return None
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")

    def decrypt(self, ciphertext: str | None) -> str | None:
        if ciphertext is None or ciphertext == "":
            return None
        try:
            return self._fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")
        except InvalidToken as e:
            raise ValueError("Could not decrypt LLM API key") from e
