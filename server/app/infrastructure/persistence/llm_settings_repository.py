"""llm_settings テーブルと LiteLLM 用モデル文字列の組み立て。"""

from typing import Any, Protocol, runtime_checkable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.llm import LLMSettingsIn


@runtime_checkable
class ILlmSettingsRepository(Protocol):
    async def get_llm_settings_row(
        self, session: AsyncSession
    ) -> dict[str, Any] | None: ...

    async def get_llm_config(
        self, session: AsyncSession
    ) -> tuple[str, str, str | None]: ...

    async def row_exists(self, session: AsyncSession) -> bool: ...

    async def upsert_llm_settings(
        self, session: AsyncSession, body: LLMSettingsIn
    ) -> dict[str, Any]: ...


class SqlAlchemyLlmSettingsRepository:
    async def get_llm_settings_row(
        self, session: AsyncSession
    ) -> dict[str, Any] | None:
        result = await session.execute(
            text(
                "SELECT provider, api_key_encrypted, model FROM llm_settings WHERE id = 1"
            )
        )
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def get_llm_config(
        self, session: AsyncSession
    ) -> tuple[str, str, str | None]:
        """Return (model_string, provider, api_key). model_string is e.g. openai/gpt-4o."""
        result = await session.execute(
            text(
                "SELECT provider, api_key_encrypted, model FROM llm_settings WHERE id = 1"
            )
        )
        row = result.mappings().one_or_none()
        if not row:
            raise ValueError("LLM settings not found")
        provider = row["provider"] or "openai"
        litellm_provider = (
            "gemini" if (provider or "").lower() == "google" else provider
        )
        model = row["model"] or "gpt-4o"
        api_key = row["api_key_encrypted"]
        model_string = f"{litellm_provider}/{model}"
        return model_string, provider, api_key

    async def row_exists(self, session: AsyncSession) -> bool:
        result = await session.execute(text("SELECT 1 FROM llm_settings WHERE id = 1"))
        return result.mappings().one_or_none() is not None

    async def upsert_llm_settings(
        self, session: AsyncSession, body: LLMSettingsIn
    ) -> dict[str, Any]:
        exists = await self.row_exists(session)
        if not exists:
            await session.execute(
                text(
                    "INSERT INTO llm_settings (id, provider, api_key_encrypted, model, updated_at) "
                    "VALUES (1, :provider, :api_key, :model, CURRENT_TIMESTAMP)"
                ),
                {
                    "provider": body.provider,
                    "api_key": body.api_key,
                    "model": body.model,
                },
            )
        elif body.api_key is not None:
            await session.execute(
                text(
                    "UPDATE llm_settings SET provider = :provider, api_key_encrypted = :api_key, "
                    "model = :model, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
                ),
                {
                    "provider": body.provider,
                    "api_key": body.api_key,
                    "model": body.model,
                },
            )
        else:
            await session.execute(
                text(
                    "UPDATE llm_settings SET provider = :provider, model = :model, "
                    "updated_at = CURRENT_TIMESTAMP WHERE id = 1"
                ),
                {"provider": body.provider, "model": body.model},
            )
        result = await session.execute(
            text(
                "SELECT provider, api_key_encrypted, model FROM llm_settings WHERE id = 1"
            )
        )
        return dict(result.mappings().one())
