from fastapi import APIRouter

from app.api.routes.chat_sessions import router as chat_sessions_router
from app.api.routes.health import router as health_router
from app.api.routes.llm_models import router as llm_models_router

api_router = APIRouter()

# 聚合所有 REST 子路由，主应用统一挂载到 /api 前缀下。
api_router.include_router(health_router)
api_router.include_router(llm_models_router)
api_router.include_router(chat_sessions_router)
