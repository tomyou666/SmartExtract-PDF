import app.share.global_value as g
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.use_cases.settings_use_cases import (
    GetLlmSettingsUseCase,
    ListLlmModelsForProviderUseCase,
    ListLlmProvidersUseCase,
    UpdateLlmSettingsUseCase,
)
from app.db import get_db
from app.schemas.llm import LLMSettingsIn, LLMSettingsOut, ModelsOut, ProviderOption

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/llm", response_model=LLMSettingsOut)
async def get_llm_settings(
    db: AsyncSession = Depends(get_db),
) -> LLMSettingsOut:
    uc: GetLlmSettingsUseCase = g.injector.resolve(GetLlmSettingsUseCase)
    return await uc.execute(db)


@router.get("/llm/providers", response_model=list[ProviderOption])
async def get_llm_providers() -> list[ProviderOption]:
    """Return provider list from LiteLLM model_cost for LLM settings select."""
    uc: ListLlmProvidersUseCase = g.injector.resolve(ListLlmProvidersUseCase)
    return uc.execute()


@router.get("/llm/models", response_model=ModelsOut)
async def get_llm_models(provider: str) -> ModelsOut:
    """Return model names for the given provider (e.g. openai, google). Uses LiteLLM model_cost."""
    uc: ListLlmModelsForProviderUseCase = g.injector.resolve(
        ListLlmModelsForProviderUseCase
    )
    return uc.execute(provider)


@router.put("/llm", response_model=LLMSettingsOut)
async def put_llm_settings(
    body: LLMSettingsIn,
    db: AsyncSession = Depends(get_db),
) -> LLMSettingsOut:
    uc: UpdateLlmSettingsUseCase = g.injector.resolve(UpdateLlmSettingsUseCase)
    return await uc.execute(db, body)
