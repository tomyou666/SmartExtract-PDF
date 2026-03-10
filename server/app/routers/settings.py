import litellm
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.llm import LLMSettingsOut, LLMSettingsIn, ProviderOption, ModelsOut

router = APIRouter(prefix="/api/settings", tags=["settings"])

# DB/UI use "google"; LiteLLM model_cost uses "gemini"
_PROVIDER_TO_LITELLM = {"google": "gemini"}
_LITELLM_TO_PROVIDER = {"gemini": "google"}

_PROVIDER_LABELS: dict[str, str] = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google (Gemini)",
    "groq": "Groq",
}


def _get_providers_from_model_cost() -> list[ProviderOption]:
    """Build unique provider list from litellm.model_cost. Expose 'google' instead of 'gemini' for DB/UI."""
    providers: set[str] = set()
    for key, info in litellm.model_cost.items():
        if not isinstance(info, dict):
            continue
        litellm_provider = info.get("litellm_provider")
        if not litellm_provider:
            continue
        # Expose 'google' in API when LiteLLM has 'gemini'
        if litellm_provider in _LITELLM_TO_PROVIDER:
            providers.add(_LITELLM_TO_PROVIDER[litellm_provider])
        else:
            providers.add(litellm_provider)
    result = []
    for value in sorted(providers):
        label = _PROVIDER_LABELS.get(value, value)
        result.append(ProviderOption(value=value, label=label))
    return result


def _get_models_for_provider(provider: str) -> list[str]:
    """Return model names (without provider prefix) for the given provider. Maps google -> gemini."""
    litellm_prefix = _PROVIDER_TO_LITELLM.get(provider, provider)
    models: list[str] = []
    for key, info in litellm.model_cost.items():
        if not isinstance(info, dict) or info.get("litellm_provider") != litellm_prefix:
            continue
        # Key can be "model" or "provider/model"; we want the model name only
        if "/" in key:
            model_name = key.split("/", 1)[1]
            if "/" in model_name:
                continue
        else:
            model_name = key
        models.append(model_name)
    return sorted(set(models))


@router.get("/llm", response_model=LLMSettingsOut)
async def get_llm_settings(db: AsyncSession = Depends(get_db)) -> LLMSettingsOut:
    result = await db.execute(
        text("SELECT provider, api_key_encrypted, model FROM llm_settings WHERE id = 1")
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="LLM settings not found")
    return LLMSettingsOut(
        provider=row["provider"],
        model=row["model"],
        api_key_masked=bool(row["api_key_encrypted"]),
    )


@router.get("/llm/providers", response_model=list[ProviderOption])
async def get_llm_providers() -> list[ProviderOption]:
    """Return provider list from LiteLLM model_cost for LLM settings select."""
    return _get_providers_from_model_cost()


@router.get("/llm/models", response_model=ModelsOut)
async def get_llm_models(provider: str) -> ModelsOut:
    """Return model names for the given provider (e.g. openai, google). Uses LiteLLM model_cost."""
    models = _get_models_for_provider(provider)
    return ModelsOut(models=models)


@router.put("/llm", response_model=LLMSettingsOut)
async def put_llm_settings(
    body: LLMSettingsIn,
    db: AsyncSession = Depends(get_db),
) -> LLMSettingsOut:
    exists = await db.execute(text("SELECT 1 FROM llm_settings WHERE id = 1"))
    if exists.mappings().one_or_none() is None:
        # id=1 が存在しない場合は INSERT
        await db.execute(
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
    else:
        # id=1 が存在する場合は UPDATE
        if body.api_key is not None:
            await db.execute(
                text(
                    "UPDATE llm_settings SET provider = :provider, api_key_encrypted = :api_key, model = :model, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
                ),
                {
                    "provider": body.provider,
                    "api_key": body.api_key,
                    "model": body.model,
                },
            )
        else:
            await db.execute(
                text(
                    "UPDATE llm_settings SET provider = :provider, model = :model, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
                ),
                {"provider": body.provider, "model": body.model},
            )
    await db.commit()
    result = await db.execute(
        text("SELECT provider, api_key_encrypted, model FROM llm_settings WHERE id = 1")
    )
    row = result.mappings().one()
    return LLMSettingsOut(
        provider=row["provider"],
        model=row["model"],
        api_key_masked=bool(row["api_key_encrypted"]),
    )
