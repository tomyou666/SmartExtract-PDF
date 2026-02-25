from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class SessionCreate(BaseModel):
    pdf_id: int | None = None
    title: str = "新規チャット"


class SessionOut(BaseModel):
    id: UUID
    pdf_id: int | None
    title: str
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    id: UUID
    session_id: UUID
    role: str
    content_json: dict[str, Any]
    created_at: datetime


class MessageIn(BaseModel):
    role: str
    content: list[dict[str, Any]]  # parts: text, image_url, etc.


class SessionUpdate(BaseModel):
    title: str
