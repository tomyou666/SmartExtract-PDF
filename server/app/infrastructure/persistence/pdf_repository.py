"""pdfs テーブルへのアクセス。"""

from typing import Any, Protocol, runtime_checkable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@runtime_checkable
class IPdfRepository(Protocol):
    async def insert_pdf(
        self, session: AsyncSession, *, filename: str, storage_path: str
    ) -> dict[str, Any]: ...

    async def list_pdf_summaries(
        self, session: AsyncSession
    ) -> list[dict[str, Any]]: ...

    async def get_storage_path_by_id(
        self, session: AsyncSession, pdf_id: int
    ) -> dict[str, Any] | None: ...

    async def delete_pdf_by_id(self, session: AsyncSession, pdf_id: int) -> None: ...

    async def get_pdf_for_file(
        self, session: AsyncSession, pdf_id: int
    ) -> dict[str, Any] | None: ...

    async def update_toc_json(
        self, session: AsyncSession, pdf_id: int, toc_json: str
    ) -> None: ...

    async def get_toc_row(
        self, session: AsyncSession, pdf_id: int
    ) -> dict[str, Any] | None: ...


class SqlAlchemyPdfRepository:
    async def insert_pdf(
        self, session: AsyncSession, *, filename: str, storage_path: str
    ) -> dict[str, Any]:
        result = await session.execute(
            text(
                "INSERT INTO pdfs (filename, storage_path) VALUES (:filename, :storage_path) "
                "RETURNING id, filename, created_at"
            ),
            {"filename": filename, "storage_path": storage_path},
        )
        return dict(result.mappings().one())

    async def list_pdf_summaries(self, session: AsyncSession) -> list[dict[str, Any]]:
        result = await session.execute(
            text("SELECT id, filename, created_at FROM pdfs ORDER BY created_at DESC")
        )
        return [dict(r) for r in result.mappings().all()]

    async def get_storage_path_by_id(
        self, session: AsyncSession, pdf_id: int
    ) -> dict[str, Any] | None:
        result = await session.execute(
            text("SELECT id, storage_path FROM pdfs WHERE id = :id"),
            {"id": pdf_id},
        )
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def delete_pdf_by_id(self, session: AsyncSession, pdf_id: int) -> None:
        await session.execute(text("DELETE FROM pdfs WHERE id = :id"), {"id": pdf_id})

    async def get_pdf_for_file(
        self, session: AsyncSession, pdf_id: int
    ) -> dict[str, Any] | None:
        result = await session.execute(
            text("SELECT id, filename, storage_path FROM pdfs WHERE id = :id"),
            {"id": pdf_id},
        )
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def update_toc_json(
        self, session: AsyncSession, pdf_id: int, toc_json: str
    ) -> None:
        await session.execute(
            text("UPDATE pdfs SET toc_json = :toc WHERE id = :id"),
            {"id": pdf_id, "toc": toc_json},
        )

    async def get_toc_row(
        self, session: AsyncSession, pdf_id: int
    ) -> dict[str, Any] | None:
        result = await session.execute(
            text("SELECT id, toc_json FROM pdfs WHERE id = :id"),
            {"id": pdf_id},
        )
        row = result.mappings().one_or_none()
        return dict(row) if row else None
