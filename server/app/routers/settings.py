from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.llm import LLMSettingsOut, LLMSettingsIn

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/llm", response_model=LLMSettingsOut)
async def get_llm_settings(db: AsyncSession = Depends(get_db)) -> LLMSettingsOut:
    result = await db.execute(
        text(
            "SELECT provider, api_key_encrypted, model FROM llm_settings WHERE id = 1"
        )
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="LLM settings not found")
    return LLMSettingsOut(
        provider=row["provider"],
        model=row["model"],
        api_key_masked=bool(row["api_key_encrypted"]),
    )


@router.put("/llm", response_model=LLMSettingsOut)
async def put_llm_settings(
    body: LLMSettingsIn,
    db: AsyncSession = Depends(get_db),
) -> LLMSettingsOut:
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
        text(
            "SELECT provider, api_key_encrypted, model FROM llm_settings WHERE id = 1"
        )
    )
    row = result.mappings().one()
    return LLMSettingsOut(
        provider=row["provider"],
        model=row["model"],
        api_key_masked=bool(row["api_key_encrypted"]),
    )
