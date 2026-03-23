import logging
import sys
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import UserCreate, UserRead, UserUpdate, auth_backend, fastapi_users
from app.config import settings as config_settings
from app.routers import pdfs, settings, chat
from app.services.storage import storage_service

# アプリ全体のログを標準出力に出す
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
    force=True,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    storage_service.ensure_ready()
    yield


app = FastAPI(title="PDF × LLM Chat API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
)
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/auth/jwt",
    tags=["auth"],
)
if config_settings.app_env.lower() == "development":
    app.include_router(
        fastapi_users.get_register_router(UserRead, UserCreate),
        prefix="/api/auth",
        tags=["auth"],
    )
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["users"],
)
app.include_router(pdfs.router, dependencies=[Depends(fastapi_users.current_user())])
app.include_router(
    settings.router, dependencies=[Depends(fastapi_users.current_user())]
)
app.include_router(chat.router, dependencies=[Depends(fastapi_users.current_user())])
