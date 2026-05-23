from fastapi import APIRouter

from app.api.v1.endpoints.chat_sessions import router as chat_sessions_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.model_configs import router as model_configs_router
from app.api.v1.endpoints.wiki_spaces import router as wiki_spaces_router

api_v1_router = APIRouter()

# v1 只负责聚合业务端点，具体 HTTP 细节留在 endpoints 模块。
api_v1_router.include_router(health_router)
api_v1_router.include_router(model_configs_router)
api_v1_router.include_router(chat_sessions_router)
api_v1_router.include_router(wiki_spaces_router)
