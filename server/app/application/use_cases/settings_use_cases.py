"""LLM 設定ユースケース。"""

from fastapi import HTTPException
from injector import inject
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.persistence.llm_settings_repository import (
    ILlmSettingsRepository,
)
from app.schemas.llm import LLMSettingsIn, LLMSettingsOut, ModelsOut, ProviderOption
from app.service.llm_catalog_service import ILlmCatalogService


class GetLlmSettingsUseCase:
    @inject
    def __init__(self, llm_settings_repo: ILlmSettingsRepository) -> None:
        self._llm_settings_repo = llm_settings_repo

    async def execute(self, session: AsyncSession) -> LLMSettingsOut:
        row = await self._llm_settings_repo.get_llm_settings_row(session)
        if not row:
            raise HTTPException(status_code=404, detail="LLM settings not found")
        return LLMSettingsOut(
            provider=row["provider"],
            model=row["model"],
            api_key_masked=bool(row["api_key_encrypted"]),
        )


class UpdateLlmSettingsUseCase:
    @inject
    def __init__(self, llm_settings_repo: ILlmSettingsRepository) -> None:
        self._llm_settings_repo = llm_settings_repo

    async def execute(
        self, session: AsyncSession, body: LLMSettingsIn
    ) -> LLMSettingsOut:
        row = await self._llm_settings_repo.upsert_llm_settings(session, body)
        await session.commit()
        return LLMSettingsOut(
            provider=row["provider"],
            model=row["model"],
            api_key_masked=bool(row["api_key_encrypted"]),
        )


class ListLlmProvidersUseCase:
    """LiteLLM model_cost 由来のプロバイダ一覧（DB 非依存）。"""

    @inject
    def __init__(self, llm_catalog: ILlmCatalogService) -> None:
        self._llm_catalog = llm_catalog

    def execute(self) -> list[ProviderOption]:
        return self._llm_catalog.list_provider_options()


class ListLlmModelsForProviderUseCase:
    """プロバイダ別モデル名一覧（DB 非依存）。"""

    @inject
    def __init__(self, llm_catalog: ILlmCatalogService) -> None:
        self._llm_catalog = llm_catalog

    def execute(self, provider: str) -> ModelsOut:
        return ModelsOut(
            models=self._llm_catalog.list_model_names_for_provider(provider)
        )
