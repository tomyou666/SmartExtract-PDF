"""ストレージ（local / S3）の抽象と fsspec 実装。"""

import os
import tempfile
from pathlib import Path
from typing import BinaryIO, Protocol, runtime_checkable

import fsspec  # type: ignore[import-untyped]
from injector import inject

from app.config import Settings


@runtime_checkable
class IFileStorage(Protocol):
    def ensure_ready(self) -> None: ...

    def save_bytes(self, key: str, data: bytes) -> str: ...

    def open_read(self, path_or_key: str) -> BinaryIO: ...

    def exists(self, path_or_key: str) -> bool: ...

    def delete(self, path_or_key: str) -> None: ...

    def download_to_temp(self, path_or_key: str) -> Path: ...


class FsspecFileStorage:
    """fsspec による local / S3 ストレージ実装。"""

    @inject
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.backend = settings.storage_backend.lower()
        self.base_path = settings.storage_base_path.strip()
        self._protocol, self._storage_options = self._build_backend_config()
        self.fs = fsspec.filesystem(self._protocol, **self._storage_options)
        if self.backend == "local":
            self._ensure_local_base_dir()

    def _build_backend_config(self) -> tuple[str, dict]:
        if self.backend == "s3":
            if not self._settings.s3_bucket:
                raise RuntimeError("S3 backend requires S3_BUCKET")
            options: dict = {}
            if self._settings.aws_access_key_id:
                options["key"] = self._settings.aws_access_key_id
            if self._settings.aws_secret_access_key:
                options["secret"] = self._settings.aws_secret_access_key
            client_kwargs: dict = {}
            if self._settings.aws_region:
                client_kwargs["region_name"] = self._settings.aws_region
            if self._settings.aws_endpoint_url:
                client_kwargs["endpoint_url"] = self._settings.aws_endpoint_url
            if client_kwargs:
                options["client_kwargs"] = client_kwargs
            return "s3", options
        return "file", {}

    def _ensure_local_base_dir(self) -> None:
        base_dir = self._local_base_dir()
        base_dir.mkdir(parents=True, exist_ok=True)

    def ensure_ready(self) -> None:
        if self.backend == "local":
            self._ensure_local_base_dir()

    def _local_base_dir(self) -> Path:
        base = Path(self.base_path or str(self._settings.upload_dir))
        if base.is_absolute():
            return base
        server_root = Path(__file__).resolve().parent.parent.parent
        return (server_root / base).resolve()

    def _s3_base_prefix(self) -> str:
        prefix = self._settings.s3_prefix.strip().strip("/")
        if self.base_path:
            extra = self.base_path.strip().strip("/")
            prefix = f"{prefix}/{extra}" if prefix else extra
        return prefix

    def build_storage_path(self, key: str) -> str:
        key = key.lstrip("/")
        if self.backend == "s3":
            base_prefix = self._s3_base_prefix()
            object_key = f"{base_prefix}/{key}" if base_prefix else key
            return f"s3://{self._settings.s3_bucket}/{object_key}"
        return str((self._local_base_dir() / key).resolve())

    def save_bytes(self, key: str, data: bytes) -> str:
        storage_path = self.build_storage_path(key)
        with self.fs.open(storage_path, "wb") as fp:
            fp.write(data)
        return storage_path

    def open_read(self, path_or_key: str) -> BinaryIO:
        resolved = self.resolve_path(path_or_key)
        return self.fs.open(resolved, "rb")

    def exists(self, path_or_key: str) -> bool:
        resolved = self.resolve_path(path_or_key)
        return bool(self.fs.exists(resolved))

    def delete(self, path_or_key: str) -> None:
        resolved = self.resolve_path(path_or_key)
        if self.fs.exists(resolved):
            self.fs.rm(resolved)

    def resolve_path(self, path_or_key: str) -> str:
        value = path_or_key.strip()
        if "://" in value:
            return value
        if os.path.isabs(value):
            return value
        return self.build_storage_path(value)

    def download_to_temp(self, path_or_key: str) -> Path:
        resolved = self.resolve_path(path_or_key)
        suffix = Path(resolved).suffix or ".bin"
        fd, tmp_path = tempfile.mkstemp(prefix="storage_", suffix=suffix)
        try:
            with os.fdopen(fd, "wb") as out_fp:
                with self.fs.open(resolved, "rb") as in_fp:
                    out_fp.write(in_fp.read())
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
        return Path(tmp_path)
