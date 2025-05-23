import asyncio
import logging
import os
import shutil
import time

from app.api.api import api_router
from app.core.config import settings
from app.manager import manager
from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title=settings.PROJECT_NAME, openapi_url=f"{settings.API_STR}/openapi.json"
)

# Set all CORS enabled origins
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


app.include_router(api_router, prefix=settings.API_STR)

UPLOADS_DIR = "../uploads"


@app.get("/")
async def root():
    return {"message": "Hello World"}


retention_period = 60 * 60 * 24 * 7


async def remove_expired_sessions():
    while True:
        current_time = time.time()

        for session_folder in os.listdir(UPLOADS_DIR):
            session_path = os.path.join(UPLOADS_DIR, session_folder)

            try:
                session_creation_time = os.path.getctime(session_path)
                age = current_time - session_creation_time
                if age >= retention_period:
                    shutil.rmtree(session_path)
                    manager.remove_session_data(session_folder)
                    logging.info(f"Removed expired session: {session_folder}")
            except Exception as e:
                logging.error(f"Error removing session {session_folder}: {e}")
        await asyncio.sleep(60 * 60 * 24)


@app.on_event("startup")
async def start_remove_expired_sessions_task():
    if not os.path.exists(UPLOADS_DIR):
        os.makedirs(UPLOADS_DIR, exist_ok=True)
        logging.info(f"Created uploads directory at {UPLOADS_DIR}")

    asyncio.create_task(remove_expired_sessions())
