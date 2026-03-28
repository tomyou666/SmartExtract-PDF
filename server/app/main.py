from contextlib import asynccontextmanager

import app.share.global_value as g
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings as config_settings
from app.config.di import DI
from app.db import engine
from app.presentation.routers import chat, pdfs, settings
from app.infrastructure.persistence.file_storage import FsspecFileStorage
from app.share.logger_util import get_logger

logger = get_logger()

# DI の初期化（tomyou-ea の g.injector と同様、モジュール読み込み時に先に代入）
g.injector = DI()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    g.injector.injector.get(FsspecFileStorage).ensure_ready()
    logger.info("Storage ready")
    yield
    await engine.dispose()


app = FastAPI(title="PDF × LLM Chat API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
)
app.include_router(pdfs.router)
app.include_router(settings.router)
app.include_router(chat.router)
