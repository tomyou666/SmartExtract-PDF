"""チャット関連ユースケース。"""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session_maker
from app.infrastructure.gateways.litellm_gateway import ILlmCompletionGateway
from app.share.util import apply_llm_provider_api_key
from app.infrastructure.persistence.chat_repository import IChatRepository
from app.infrastructure.persistence.llm_settings_repository import (
    ILlmSettingsRepository,
)
from app.schemas.chat import SessionCreate, SessionOut, SessionUpdate, MessageOut
from app.service.llm_service import ILlmMessageService
from injector import inject


def parse_session_id(session_id: str) -> UUID:
    try:
        return UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")


def parse_message_id(message_id: str) -> UUID:
    try:
        return UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message ID")


def merge_messages_with_history(
    request_messages: list, db_rows: list, llm_messages: ILlmMessageService
) -> list:
    """クライアントが全文を送った場合はそのまま、1件以下なら DB 履歴を前置。"""
    if len(request_messages) > 1:
        return request_messages
    history = [
        llm_messages.db_row_to_ui_message(r["role"], r["content_json"]) for r in db_rows
    ]
    return history + request_messages


class ListSessionsUseCase:
    @inject
    def __init__(self, chat_repo: IChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(self, session: AsyncSession) -> list[SessionOut]:
        rows = await self._chat_repo.list_sessions(session)
        return [
            SessionOut(
                id=r["id"],
                pdf_id=r["pdf_id"],
                title=r["title"],
                created_at=r["created_at"],
                updated_at=r["updated_at"],
            )
            for r in rows
        ]


class CreateSessionUseCase:
    @inject
    def __init__(self, chat_repo: IChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(
        self, session: AsyncSession, body: SessionCreate | None
    ) -> SessionOut:
        body = body or SessionCreate()
        row = await self._chat_repo.insert_session(
            session, pdf_id=body.pdf_id, title=body.title
        )
        await session.commit()
        return SessionOut(
            id=row["id"],
            pdf_id=row["pdf_id"],
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


class GetSessionUseCase:
    @inject
    def __init__(self, chat_repo: IChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(self, session: AsyncSession, session_id: str) -> SessionOut:
        sid = parse_session_id(session_id)
        row = await self._chat_repo.get_session_by_id(session, sid)
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        return SessionOut(
            id=row["id"],
            pdf_id=row["pdf_id"],
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


class ListMessagesUseCase:
    @inject
    def __init__(self, chat_repo: IChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(self, session: AsyncSession, session_id: str) -> list[MessageOut]:
        sid = parse_session_id(session_id)
        rows = await self._chat_repo.list_messages(session, sid)
        return [
            MessageOut(
                id=r["id"],
                session_id=r["session_id"],
                role=r["role"],
                content_json=r["content_json"],
                created_at=r["created_at"],
            )
            for r in rows
        ]


class DeleteConversationTurnUseCase:
    @inject
    def __init__(self, chat_repo: IChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(
        self, session: AsyncSession, session_id: str, message_id: str
    ) -> None:
        sid = parse_session_id(session_id)
        mid = parse_message_id(message_id)
        if not await self._chat_repo.session_exists(session, sid):
            raise HTTPException(status_code=404, detail="Session not found")
        msg_row = await self._chat_repo.get_message_role(session, sid, mid)
        if not msg_row:
            raise HTTPException(status_code=404, detail="Message not found")
        role = msg_row["role"]
        ordered = await self._chat_repo.list_message_ids_ordered(session, sid)
        idx = next((i for i, r in enumerate(ordered) if str(r["id"]) == str(mid)), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Message not found")
        ids_to_delete: list[str] = []
        if role == "user":
            ids_to_delete.append(str(ordered[idx]["id"]))
            if idx + 1 < len(ordered) and ordered[idx + 1]["role"] == "assistant":
                ids_to_delete.append(str(ordered[idx + 1]["id"]))
        else:
            if idx - 1 >= 0 and ordered[idx - 1]["role"] == "user":
                ids_to_delete.append(str(ordered[idx - 1]["id"]))
            ids_to_delete.append(str(ordered[idx]["id"]))
        for id_val in ids_to_delete:
            await self._chat_repo.delete_message_by_id(session, id_val)
        await self._chat_repo.touch_session_updated_at(session, sid)
        await session.commit()


class DeleteSessionUseCase:
    @inject
    def __init__(self, chat_repo: IChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(self, session: AsyncSession, session_id: str) -> None:
        sid = parse_session_id(session_id)
        if not await self._chat_repo.session_exists(session, sid):
            raise HTTPException(status_code=404, detail="Session not found")
        await self._chat_repo.delete_messages_for_session(session, sid)
        await self._chat_repo.delete_session_by_id(session, sid)
        await session.commit()


class UpdateSessionUseCase:
    @inject
    def __init__(self, chat_repo: IChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(
        self, session: AsyncSession, session_id: str, body: SessionUpdate
    ) -> SessionOut:
        sid = parse_session_id(session_id)
        row = await self._chat_repo.update_session_title(session, sid, body.title)
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        await session.commit()
        return SessionOut(
            id=row["id"],
            pdf_id=row["pdf_id"],
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


class ChatStreamService:
    """ストリーム応答の内部ロジック（ジェネレータ用）。"""

    @inject
    def __init__(
        self,
        chat_repo: IChatRepository,
        llm_settings_repo: ILlmSettingsRepository,
        llm_messages: ILlmMessageService,
        llm_gateway: ILlmCompletionGateway,
    ) -> None:
        self._chat_repo = chat_repo
        self._llm_settings_repo = llm_settings_repo
        self._llm_messages = llm_messages
        self._llm_gateway = llm_gateway

    async def stream_chat(self, session_id: str, messages: list, db: AsyncSession):
        """Yield text chunks from LLM gateway and then save messages to DB."""
        model_string, provider, api_key = await self._llm_settings_repo.get_llm_config(
            db
        )
        sid = parse_session_id(session_id)
        apply_llm_provider_api_key(provider, api_key)
        litellm_messages = self._llm_messages.build_litellm_messages(messages)
        if not litellm_messages or (messages and messages[-1].get("role") != "user"):
            yield "No messages to send."
            return
        full_content: list[str] = []
        try:
            async for delta in self._llm_gateway.stream_chat_completion(
                model=model_string,
                messages=litellm_messages,
            ):
                full_content.append(delta)
                yield delta
        except Exception as e:
            yield f"\n[Error: {e!s}]"
            return
        assistant_text = "".join(full_content)
        last_msg = messages[-1] if messages else None
        content_json: dict | None = None
        if last_msg and last_msg.get("role") == "user":
            user_content = last_msg.get("parts") or last_msg.get("content") or []
            content_json = (
                {"parts": user_content}
                if isinstance(user_content, list)
                else {"text": str(user_content)}
            )
        async with async_session_maker() as write_session:
            await self._chat_repo.append_stream_messages(
                write_session,
                sid,
                user_content_json=content_json,
                assistant_text=assistant_text,
            )
            await write_session.commit()


class PostMessageStreamUseCase:
    @inject
    def __init__(
        self,
        chat_repo: IChatRepository,
        stream_service: ChatStreamService,
        llm_messages: ILlmMessageService,
    ) -> None:
        self._chat_repo = chat_repo
        self._stream_service = stream_service
        self._llm_messages = llm_messages

    async def stream_response(
        self, session: AsyncSession, session_id: str, request: dict
    ):
        sid = parse_session_id(session_id)
        if not await self._chat_repo.session_exists(session, sid):
            raise HTTPException(status_code=404, detail="Session not found")
        request_messages = request.get("messages") or []
        if len(request_messages) <= 1:
            db_rows = await self._chat_repo.list_messages_for_merge(session, sid)
            messages = merge_messages_with_history(
                request_messages, db_rows, self._llm_messages
            )
        else:
            messages = request_messages
        async for chunk in self._stream_service.stream_chat(
            session_id, messages, session
        ):
            yield chunk


class GenerateSessionTitleUseCase:
    @inject
    def __init__(
        self,
        chat_repo: IChatRepository,
        llm_settings_repo: ILlmSettingsRepository,
        llm_gateway: ILlmCompletionGateway,
    ) -> None:
        self._chat_repo = chat_repo
        self._llm_settings_repo = llm_settings_repo
        self._llm_gateway = llm_gateway

    async def execute(self, session: AsyncSession, session_id: str) -> dict:
        sid = parse_session_id(session_id)
        row = await self._chat_repo.first_user_message_content(session, sid)
        if not row:
            raise HTTPException(status_code=404, detail="No user message in session")
        content = row["content_json"] or {}
        text_part = content.get("text") or ""
        if isinstance(content.get("parts"), list):
            for p in content["parts"]:
                if p.get("type") == "text":
                    text_part = p.get("text", "")
                    break
        model_string, provider, api_key = await self._llm_settings_repo.get_llm_config(
            session
        )
        apply_llm_provider_api_key(provider, api_key)
        prompt = (
            "Generate a very short title (under 50 characters, no quotes) for a chat "
            f"that starts with: {text_part[:300]}"
        )
        try:
            raw_title = await self._llm_gateway.complete_chat_text(
                model=model_string,
                messages=[{"role": "user", "content": prompt}],
            )
            title = raw_title.strip().strip('"')[:50] if raw_title else "新規チャット"
        except Exception:
            title = "新規チャット"
        updated = await self._chat_repo.update_session_title(session, sid, title)
        if not updated:
            raise HTTPException(status_code=404, detail="Session not found")
        await session.commit()
        return {"title": title}
