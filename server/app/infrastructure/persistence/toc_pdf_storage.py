"""目次抽出向けの PDF ファイル操作（pypdf / pikepdf）。"""

import base64
import math
import os
import tempfile
from pathlib import Path
from typing import Protocol, runtime_checkable

from pikepdf import Pdf
from pypdf import PdfReader, PdfWriter


@runtime_checkable
class ITocPdfStorage(Protocol):
    def clean_pdf(self, pdf_path: Path) -> Path:
        """
        未使用オブジェクトとメタデータを削除した PDF を一時ファイルに書き出す。
        返り値のパスは呼び出し側で削除すること。
        """
        ...

    def split_pdf_into_chunks(
        self, pdf_path: Path, num_chunks: int
    ) -> tuple[list[tuple[Path, int]], Path]:
        """
        PDF をページで等分し、各チャンクを一時 PDF として保存する。
        返り値: ((一時 PDF の Path, そのチャンクの先頭ページ 1-based) のリスト, 一時ディレクトリの Path)
        """
        ...

    def extract_text_from_pdf(self, pdf_path: Path, max_chars: int) -> str:
        """PDF からテキストを抽出する（先頭から max_chars 文字まで）。"""
        ...

    def build_messages_with_pdf_file(
        self,
        pdf_path: Path,
        system_prompt: str,
        user_text: str,
    ) -> list[dict]:
        """PDF を Base64 でメッセージに含める（document_understanding 形式）。"""
        ...


class PypdfTocPdfStorage:
    """pypdf / pikepdf による ITocPdfStorage 実装。"""

    def clean_pdf(self, pdf_path: Path) -> Path:
        reader = PdfReader(str(pdf_path))
        writer = PdfWriter()
        writer.append_pages_from_reader(reader)
        writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        writer.metadata = None
        fd, temp_path = tempfile.mkstemp(suffix=".pdf", prefix="toc_cleaned_")
        try:
            with os.fdopen(fd, "wb") as f:
                writer.write(f)
            return Path(temp_path)
        except Exception:
            try:
                os.close(fd)
            except OSError:
                pass
            os.unlink(temp_path)
            raise

    def split_pdf_into_chunks(
        self, pdf_path: Path, num_chunks: int
    ) -> tuple[list[tuple[Path, int]], Path]:
        reader = PdfReader(str(pdf_path))
        total_pages = len(reader.pages)
        pages_per_chunk = math.ceil(total_pages / num_chunks) if num_chunks else 0
        temp_dir = Path(tempfile.mkdtemp(prefix="toc_chunks_"))
        result: list[tuple[Path, int]] = []
        for i in range(num_chunks):
            start = i * pages_per_chunk
            end = min((i + 1) * pages_per_chunk, total_pages)
            if start >= total_pages:
                break
            start_page_1based = start + 1
            writer = PdfWriter()
            writer.append(pdf_path, outline_item=None, pages=(start, end))
            writer.compress_identical_objects(
                remove_identicals=True, remove_orphans=True
            )
            for page in writer.pages:
                page.compress_content_streams()
            chunk_path = temp_dir / f"chunk_{i}.pdf"
            with open(chunk_path, "wb") as f:
                writer.write(f)
            with Pdf.open(chunk_path, allow_overwriting_input=True) as pdf:
                pdf.remove_unreferenced_resources()
                pdf.save(chunk_path)
            result.append((chunk_path, start_page_1based))
        return (result, temp_dir)

    def extract_text_from_pdf(self, pdf_path: Path, max_chars: int) -> str:
        reader = PdfReader(str(pdf_path))
        parts: list[str] = []
        total = 0
        for page in reader.pages:
            if total >= max_chars:
                break
            text = page.extract_text() or ""
            take = min(len(text), max_chars - total)
            if take > 0:
                parts.append(text[:take])
                total += take
        return "\n\n".join(parts)

    def build_messages_with_pdf_file(
        self,
        pdf_path: Path,
        system_prompt: str,
        user_text: str,
    ) -> list[dict]:
        data = pdf_path.read_bytes()
        encoded = base64.b64encode(data).decode("utf-8")
        file_data = f"data:application/pdf;base64,{encoded}"
        file_content = [
            {"type": "text", "text": user_text},
            {
                "type": "file",
                "file": {"file_data": file_data},
            },
        ]
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": file_content},
        ]
