from fastapi import APIRouter

from app.api.v1.endpoints.chats import router as chats_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.llms import router as llms_router
from app.api.v1.endpoints.wikis import router as wikis_router

api_v1_router = APIRouter()

# v1 只负责聚合业务端点，具体 HTTP 细节留在 endpoints 模块。
api_v1_router.include_router(health_router)
api_v1_router.include_router(llms_router)
api_v1_router.include_router(chats_router)
api_v1_router.include_router(wikis_router)
