"""PDF 関連ユースケース。"""

import json
import uuid
from typing import BinaryIO
from urllib.parse import quote

from fastapi import HTTPException, UploadFile
from injector import inject
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.persistence.llm_settings_repository import (
    ILlmSettingsRepository,
)
from app.infrastructure.persistence.pdf_repository import IPdfRepository
from app.infrastructure.persistence.file_storage import IFileStorage
from app.schemas.pdf import PdfOut
from app.service.toc_service import ITocExtractionService


class UploadPdfUseCase:
    @inject
    def __init__(
        self,
        storage: IFileStorage,
        pdf_repo: IPdfRepository,
    ) -> None:
        self._storage = storage
        self._pdf_repo = pdf_repo

    async def execute(self, session: AsyncSession, file: UploadFile) -> PdfOut:
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="PDF file required")
        stem = uuid.uuid4().hex
        safe_name = f"{stem}_{file.filename}"
        content = await file.read()
        storage_path = self._storage.save_bytes(safe_name, content)
        row = await self._pdf_repo.insert_pdf(
            session, filename=file.filename, storage_path=storage_path
        )
        await session.commit()
        return PdfOut(
            id=row["id"],
            filename=row["filename"],
            created_at=row["created_at"],
        )


class ListPdfsUseCase:
    @inject
    def __init__(self, pdf_repo: IPdfRepository) -> None:
        self._pdf_repo = pdf_repo

    async def execute(self, session: AsyncSession) -> list[PdfOut]:
        rows = await self._pdf_repo.list_pdf_summaries(session)
        return [
            PdfOut(id=r["id"], filename=r["filename"], created_at=r["created_at"])
            for r in rows
        ]


class DeletePdfUseCase:
    @inject
    def __init__(
        self,
        storage: IFileStorage,
        pdf_repo: IPdfRepository,
    ) -> None:
        self._storage = storage
        self._pdf_repo = pdf_repo

    async def execute(self, session: AsyncSession, pdf_id: int) -> None:
        row = await self._pdf_repo.get_storage_path_by_id(session, pdf_id)
        if not row:
            raise HTTPException(status_code=404, detail="PDF not found")
        self._storage.delete(row["storage_path"])
        await self._pdf_repo.delete_pdf_by_id(session, pdf_id)
        await session.commit()


class GeneratePdfTocUseCase:
    @inject
    def __init__(
        self,
        storage: IFileStorage,
        pdf_repo: IPdfRepository,
        llm_settings_repo: ILlmSettingsRepository,
        toc_service: ITocExtractionService,
    ) -> None:
        self._storage = storage
        self._pdf_repo = pdf_repo
        self._llm_settings_repo = llm_settings_repo
        self._toc_service = toc_service

    async def execute(self, session: AsyncSession, pdf_id: int) -> dict:
        row = await self._pdf_repo.get_storage_path_by_id(session, pdf_id)
        if not row:
            raise HTTPException(status_code=404, detail="PDF not found")
        storage_path = row["storage_path"]
        if not self._storage.exists(storage_path):
            raise HTTPException(status_code=404, detail="PDF file not found on storage")
        temp_pdf_path = self._storage.download_to_temp(storage_path)
        try:
            toc_json = await self._toc_service.extract_toc_with_llm(
                temp_pdf_path, session, self._llm_settings_repo
            )
        except RuntimeError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        finally:
            temp_pdf_path.unlink(missing_ok=True)
        await self._pdf_repo.update_toc_json(
            session, pdf_id, json.dumps(toc_json, ensure_ascii=False)
        )
        await session.commit()
        return toc_json


class GetPdfTocUseCase:
    @inject
    def __init__(self, pdf_repo: IPdfRepository) -> None:
        self._pdf_repo = pdf_repo

    async def execute(self, session: AsyncSession, pdf_id: int):
        row = await self._pdf_repo.get_toc_row(session, pdf_id)
        if not row:
            raise HTTPException(status_code=404, detail="PDF not found")
        toc_json = row["toc_json"]
        if toc_json is None:
            raise HTTPException(
                status_code=404,
                detail="目次が未生成です。POST /api/pdfs/{pdf_id}/toc で生成してください。",
            )
        return toc_json


class GetPdfFileUseCase:
    @inject
    def __init__(
        self,
        storage: IFileStorage,
        pdf_repo: IPdfRepository,
    ) -> None:
        self._storage = storage
        self._pdf_repo = pdf_repo

    async def execute(self, session: AsyncSession, pdf_id: int) -> tuple[str, BinaryIO]:
        """返り値: (Content-Disposition ヘッダー値, 読み取り用ファイルオブジェクト)。"""
        row = await self._pdf_repo.get_pdf_for_file(session, pdf_id)
        if not row:
            raise HTTPException(status_code=404, detail="PDF not found")
        if not self._storage.exists(row["storage_path"]):
            raise HTTPException(status_code=404, detail="PDF file not found on storage")
        encoded_filename = quote(row["filename"], safe="")
        content_disposition = f"inline; filename*=UTF-8''{encoded_filename}"
        file_obj = self._storage.open_read(row["storage_path"])
        return content_disposition, file_obj
