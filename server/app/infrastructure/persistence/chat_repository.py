"""chat_sessions / chat_messages テーブルへのアクセス。"""

import json
from typing import Any, Protocol, runtime_checkable
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@runtime_checkable
class IChatRepository(Protocol):
    async def list_sessions(self, session: AsyncSession) -> list[dict[str, Any]]: ...

    async def insert_session(
        self, session: AsyncSession, *, pdf_id: int | None, title: str
    ) -> dict[str, Any]: ...

    async def get_session_by_id(
        self, session: AsyncSession, sid: UUID
    ) -> dict[str, Any] | None: ...

    async def list_messages(
        self, session: AsyncSession, sid: UUID
    ) -> list[dict[str, Any]]: ...

    async def session_exists(self, session: AsyncSession, sid: UUID) -> bool: ...

    async def get_message_role(
        self, session: AsyncSession, sid: UUID, mid: UUID
    ) -> dict[str, Any] | None: ...

    async def list_message_ids_ordered(
        self, session: AsyncSession, sid: UUID
    ) -> list[dict[str, Any]]: ...

    async def delete_message_by_id(
        self, session: AsyncSession, message_id: str
    ) -> None: ...

    async def touch_session_updated_at(
        self, session: AsyncSession, sid: UUID
    ) -> None: ...

    async def delete_messages_for_session(
        self, session: AsyncSession, sid: UUID
    ) -> None: ...

    async def delete_session_by_id(self, session: AsyncSession, sid: UUID) -> None: ...

    async def update_session_title(
        self, session: AsyncSession, sid: UUID, title: str
    ) -> dict[str, Any] | None: ...

    async def list_messages_for_merge(
        self, session: AsyncSession, sid: UUID
    ) -> list[dict[str, Any]]: ...

    async def first_user_message_content(
        self, session: AsyncSession, sid: UUID
    ) -> dict[str, Any] | None: ...

    async def append_stream_messages(
        self,
        session: AsyncSession,
        sid: UUID,
        *,
        user_content_json: dict[str, Any] | None,
        assistant_text: str,
    ) -> None: ...


_MSG_ORDER = "ORDER BY created_at, CASE role WHEN 'user' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END"


class SqlAlchemyChatRepository:
    async def list_sessions(self, session: AsyncSession) -> list[dict[str, Any]]:
        result = await session.execute(
            text(
                "SELECT id, pdf_id, title, created_at, updated_at FROM chat_sessions "
                "ORDER BY updated_at DESC"
            )
        )
        return [dict(r) for r in result.mappings().all()]

    async def insert_session(
        self, session: AsyncSession, *, pdf_id: int | None, title: str
    ) -> dict[str, Any]:
        result = await session.execute(
            text(
                "INSERT INTO chat_sessions (pdf_id, title) VALUES (:pdf_id, :title) "
                "RETURNING id, pdf_id, title, created_at, updated_at"
            ),
            {"pdf_id": pdf_id, "title": title},
        )
        return dict(result.mappings().one())

    async def get_session_by_id(
        self, session: AsyncSession, sid: UUID
    ) -> dict[str, Any] | None:
        result = await session.execute(
            text(
                "SELECT id, pdf_id, title, created_at, updated_at FROM chat_sessions "
                "WHERE id = :id"
            ),
            {"id": str(sid)},
        )
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def list_messages(
        self, session: AsyncSession, sid: UUID
    ) -> list[dict[str, Any]]:
        result = await session.execute(
            text(
                f"SELECT id, session_id, role, content_json, created_at FROM chat_messages "
                f"WHERE session_id = :sid {_MSG_ORDER}"
            ),
            {"sid": str(sid)},
        )
        return [dict(r) for r in result.mappings().all()]

    async def session_exists(self, session: AsyncSession, sid: UUID) -> bool:
        result = await session.execute(
            text("SELECT id FROM chat_sessions WHERE id = :id"),
            {"id": str(sid)},
        )
        return result.mappings().one_or_none() is not None

    async def get_message_role(
        self, session: AsyncSession, sid: UUID, mid: UUID
    ) -> dict[str, Any] | None:
        result = await session.execute(
            text(
                "SELECT id, role FROM chat_messages WHERE id = :mid AND session_id = :sid"
            ),
            {"mid": str(mid), "sid": str(sid)},
        )
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def list_message_ids_ordered(
        self, session: AsyncSession, sid: UUID
    ) -> list[dict[str, Any]]:
        result = await session.execute(
            text(
                f"SELECT id, role FROM chat_messages WHERE session_id = :sid {_MSG_ORDER}"
            ),
            {"sid": str(sid)},
        )
        return [dict(r) for r in result.mappings().all()]

    async def delete_message_by_id(
        self, session: AsyncSession, message_id: str
    ) -> None:
        await session.execute(
            text("DELETE FROM chat_messages WHERE id = :id"),
            {"id": message_id},
        )

    async def touch_session_updated_at(self, session: AsyncSession, sid: UUID) -> None:
        await session.execute(
            text(
                "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = :id"
            ),
            {"id": str(sid)},
        )

    async def delete_messages_for_session(
        self, session: AsyncSession, sid: UUID
    ) -> None:
        await session.execute(
            text("DELETE FROM chat_messages WHERE session_id = :id"),
            {"id": str(sid)},
        )

    async def delete_session_by_id(self, session: AsyncSession, sid: UUID) -> None:
        await session.execute(
            text("DELETE FROM chat_sessions WHERE id = :id"),
            {"id": str(sid)},
        )

    async def update_session_title(
        self, session: AsyncSession, sid: UUID, title: str
    ) -> dict[str, Any] | None:
        result = await session.execute(
            text(
                "UPDATE chat_sessions SET title = :title, updated_at = CURRENT_TIMESTAMP "
                "WHERE id = :id RETURNING id, pdf_id, title, created_at, updated_at"
            ),
            {"id": str(sid), "title": title},
        )
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def list_messages_for_merge(
        self, session: AsyncSession, sid: UUID
    ) -> list[dict[str, Any]]:
        result = await session.execute(
            text(
                f"SELECT role, content_json FROM chat_messages WHERE session_id = :sid {_MSG_ORDER}"
            ),
            {"sid": str(sid)},
        )
        return [dict(r) for r in result.mappings().all()]

    async def first_user_message_content(
        self, session: AsyncSession, sid: UUID
    ) -> dict[str, Any] | None:
        result = await session.execute(
            text(
                "SELECT id, content_json FROM chat_messages WHERE session_id = :sid AND role = 'user' "
                "ORDER BY created_at LIMIT 1"
            ),
            {"sid": str(sid)},
        )
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def append_stream_messages(
        self,
        session: AsyncSession,
        sid: UUID,
        *,
        user_content_json: dict[str, Any] | None,
        assistant_text: str,
    ) -> None:
        if user_content_json:
            await session.execute(
                text(
                    "INSERT INTO chat_messages (session_id, role, content_json) "
                    "VALUES (:sid, 'user', :content)"
                ),
                {"sid": str(sid), "content": json.dumps(user_content_json)},
            )
        await session.execute(
            text(
                "INSERT INTO chat_messages (session_id, role, content_json) "
                "VALUES (:sid, 'assistant', :content)"
            ),
            {
                "sid": str(sid),
                "content": json.dumps({"text": assistant_text}),
            },
        )
        await session.execute(
            text(
                "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = :id"
            ),
            {"id": str(sid)},
        )
