from fastapi import APIRouter

from app.api.endpoints import targeted
from app.api.endpoints import untargeted


api_router = APIRouter()
api_router.include_router(targeted.router, prefix="/targeted", tags=["targeted"])
api_router.include_router(untargeted.router, prefix="/untargeted", tags=["untargeted"])
