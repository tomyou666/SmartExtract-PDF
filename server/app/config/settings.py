from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@pdf-viewer-db:5432/pdf-viewer-postgres"
    )
    upload_dir: Path = Path(__file__).resolve().parent.parent.parent / "uploads"
    storage_backend: str = "local"  # local | s3
    storage_base_path: str = "uploads"
    s3_bucket: str | None = None
    s3_prefix: str = ""
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str | None = None
    aws_endpoint_url: str | None = None
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()
