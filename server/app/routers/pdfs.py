import json
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.pdf import PdfOut
from app.services.storage import storage_service
from app.services.toc import extract_toc_with_llm

router = APIRouter(prefix="/api/pdfs", tags=["pdfs"])


@router.post("", response_model=PdfOut)
async def upload_pdf(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
) -> PdfOut:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF file required")
    stem = uuid.uuid4().hex
    safe_name = f"{stem}_{file.filename}"
    storage_key = safe_name
    content = await file.read()
    storage_path = storage_service.save_bytes(storage_key, content)
    result = await db.execute(
        text(
            "INSERT INTO pdfs (filename, storage_path) VALUES (:filename, :storage_path) RETURNING id, filename, created_at"
        ),
        {"filename": file.filename, "storage_path": storage_path},
    )
    row = result.mappings().one()
    await db.commit()
    return PdfOut(id=row["id"], filename=row["filename"], created_at=row["created_at"])


@router.get("", response_model=list[PdfOut])
async def list_pdfs(db: AsyncSession = Depends(get_db)) -> list[PdfOut]:
    result = await db.execute(
        text("SELECT id, filename, created_at FROM pdfs ORDER BY created_at DESC")
    )
    rows = result.mappings().all()
    return [
        PdfOut(id=r["id"], filename=r["filename"], created_at=r["created_at"])
        for r in rows
    ]


@router.delete("/{pdf_id}", status_code=204)
async def delete_pdf(
    pdf_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        text("SELECT id, storage_path FROM pdfs WHERE id = :id"),
        {"id": pdf_id},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="PDF not found")
    storage_service.delete(row["storage_path"])
    await db.execute(text("DELETE FROM pdfs WHERE id = :id"), {"id": pdf_id})
    await db.commit()


@router.post("/{pdf_id}/toc")
async def generate_pdf_toc(
    pdf_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    指定したPDFをLLMに渡して目次を抽出し、DBに保存してJSONで返す。
    """
    result = await db.execute(
        text("SELECT id, storage_path FROM pdfs WHERE id = :id"),
        {"id": pdf_id},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="PDF not found")
    if not storage_service.exists(row["storage_path"]):
        raise HTTPException(status_code=404, detail="PDF file not found on storage")
    temp_pdf_path = storage_service.download_to_temp(row["storage_path"])
    try:
        toc_json = await extract_toc_with_llm(temp_pdf_path, db)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    finally:
        temp_pdf_path.unlink(missing_ok=True)
    await db.execute(
        text("UPDATE pdfs SET toc_json = :toc WHERE id = :id"),
        {"id": pdf_id, "toc": _json_dump(toc_json)},
    )
    await db.commit()
    return toc_json


def _json_dump(obj):
    return json.dumps(obj, ensure_ascii=False)


@router.get("/{pdf_id}/toc")
async def get_pdf_toc(
    pdf_id: int,
    db: AsyncSession = Depends(get_db),
):
    """保存済みの目次JSONを返す。未生成の場合は404。"""
    result = await db.execute(
        text("SELECT id, toc_json FROM pdfs WHERE id = :id"),
        {"id": pdf_id},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="PDF not found")
    toc_json = row["toc_json"]
    if toc_json is None:
        raise HTTPException(
            status_code=404,
            detail="目次が未生成です。POST /api/pdfs/{pdf_id}/toc で生成してください。",
        )
    return toc_json


@router.get("/{pdf_id}")
async def get_pdf_file(
    pdf_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT id, filename, storage_path FROM pdfs WHERE id = :id"),
        {"id": pdf_id},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="PDF not found")
    if not storage_service.exists(row["storage_path"]):
        raise HTTPException(status_code=404, detail="PDF file not found on storage")
    # RFC 5987: filename* で UTF-8 ファイル名を渡す（非ASCII対応、Latin-1 エラー回避）
    encoded_filename = quote(row["filename"], safe="")
    content_disposition = f"inline; filename*=UTF-8''{encoded_filename}"
    file_obj = storage_service.open_read(row["storage_path"])

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
