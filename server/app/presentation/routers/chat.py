import app.share.global_value as g
from fastapi import APIRouter, Body, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.use_cases.chat_use_cases import (
    CreateSessionUseCase,
    DeleteConversationTurnUseCase,
    DeleteSessionUseCase,
    GenerateSessionTitleUseCase,
    GetSessionUseCase,
    ListMessagesUseCase,
    ListSessionsUseCase,
    PostMessageStreamUseCase,
    UpdateSessionUseCase,
)
from app.db import get_db
from app.schemas.chat import SessionCreate, SessionOut, SessionUpdate, MessageOut

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
) -> list[SessionOut]:
    uc: ListSessionsUseCase = g.injector.resolve(ListSessionsUseCase)
    return await uc.execute(db)


@router.post("/sessions", response_model=SessionOut)
async def create_session(
    db: AsyncSession = Depends(get_db),
    body: SessionCreate | None = None,
) -> SessionOut:
    uc: CreateSessionUseCase = g.injector.resolve(CreateSessionUseCase)
    return await uc.execute(db, body)


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    uc: GetSessionUseCase = g.injector.resolve(GetSessionUseCase)
    return await uc.execute(db, session_id)


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def list_messages(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[MessageOut]:
    uc: ListMessagesUseCase = g.injector.resolve(ListMessagesUseCase)
    return await uc.execute(db, session_id)


@router.delete("/sessions/{session_id}/messages/{message_id}", status_code=204)
async def delete_conversation_turn(
    session_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    """指定したメッセージを含む1会話（user+assistantの1ターン）を削除する。"""
    uc: DeleteConversationTurnUseCase = g.injector.resolve(
        DeleteConversationTurnUseCase
    )
    await uc.execute(db, session_id, message_id)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    uc: DeleteSessionUseCase = g.injector.resolve(DeleteSessionUseCase)
    await uc.execute(db, session_id)


@router.patch("/sessions/{session_id}", response_model=SessionOut)
async def update_session(
    session_id: str,
    body: SessionUpdate,
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    uc: UpdateSessionUseCase = g.injector.resolve(UpdateSessionUseCase)
    return await uc.execute(db, session_id, body)


@router.post("/sessions/{session_id}/messages")
async def post_message_stream(
    session_id: str,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Stream LLM response as plain text. Body: { messages: UIMessage[] }."""
    uc: PostMessageStreamUseCase = g.injector.resolve(PostMessageStreamUseCase)
    return StreamingResponse(
        uc.stream_response(db, session_id, body),
        media_type="text/plain; charset=utf-8",
    )


@router.post("/sessions/{session_id}/title")
async def generate_session_title(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Generate a short title from the first user message using LLM."""
    uc: GenerateSessionTitleUseCase = g.injector.resolve(GenerateSessionTitleUseCase)
    return await uc.execute(db, session_id)
