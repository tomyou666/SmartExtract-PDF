from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings as config_settings
from app.routers import pdfs, settings, chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    config_settings.upload_dir.mkdir(parents=True, exist_ok=True)
    yield


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
