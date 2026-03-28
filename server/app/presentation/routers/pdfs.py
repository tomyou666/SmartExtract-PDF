import app.share.global_value as g
from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.use_cases.pdf_use_cases import (
    DeletePdfUseCase,
    GeneratePdfTocUseCase,
    GetPdfFileUseCase,
    GetPdfTocUseCase,
    ListPdfsUseCase,
    UploadPdfUseCase,
)
from app.db import get_db
from app.schemas.pdf import PdfOut

router = APIRouter(prefix="/api/pdfs", tags=["pdfs"])


@router.post("", response_model=PdfOut)
async def upload_pdf(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
) -> PdfOut:
    uc: UploadPdfUseCase = g.injector.resolve(UploadPdfUseCase)
    return await uc.execute(db, file)


@router.get("", response_model=list[PdfOut])
async def list_pdfs(
    db: AsyncSession = Depends(get_db),
) -> list[PdfOut]:
    uc: ListPdfsUseCase = g.injector.resolve(ListPdfsUseCase)
    return await uc.execute(db)


@router.delete("/{pdf_id}", status_code=204)
async def delete_pdf(
    pdf_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    uc: DeletePdfUseCase = g.injector.resolve(DeletePdfUseCase)
    await uc.execute(db, pdf_id)


@router.post("/{pdf_id}/toc")
async def generate_pdf_toc(
    pdf_id: int,
    db: AsyncSession = Depends(get_db),
):
    """指定したPDFをLLMに渡して目次を抽出し、DBに保存してJSONで返す。"""
    uc: GeneratePdfTocUseCase = g.injector.resolve(GeneratePdfTocUseCase)
    return await uc.execute(db, pdf_id)


@router.get("/{pdf_id}/toc")
async def get_pdf_toc(
    pdf_id: int,
    db: AsyncSession = Depends(get_db),
):
    """保存済みの目次JSONを返す。未生成の場合は404。"""
    uc: GetPdfTocUseCase = g.injector.resolve(GetPdfTocUseCase)
    return await uc.execute(db, pdf_id)


@router.get("/{pdf_id}")
async def get_pdf_file(
    pdf_id: int,
    db: AsyncSession = Depends(get_db),
):
    uc: GetPdfFileUseCase = g.injector.resolve(GetPdfFileUseCase)
    content_disposition, file_obj = await uc.execute(db, pdf_id)

    def _iter_stream():
        try:
            while True:
                chunk = file_obj.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            file_obj.close()

    return StreamingResponse(
        _iter_stream(),
        media_type="application/pdf",
        headers={"Content-Disposition": content_disposition},
    )
