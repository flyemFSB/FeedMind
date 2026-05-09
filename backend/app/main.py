from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.api.router import api_router
from app.core.config import get_settings
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """管理 FastAPI 生命周期，在服务启动时准备数据库。"""
    logger.info("FeedMind Backend 启动中")
    init_db()
    try:
        yield
    finally:
        logger.info("FeedMind Backend 已停止")


def create_app() -> FastAPI:
    """创建 FastAPI 应用并挂载中间件与业务路由。"""
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

    # 前端开发环境需要跨域访问后端 REST API。
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Agent 聊天流由 Aegra 承接；FastAPI 只暴露普通业务 REST API。
    app.include_router(api_router, prefix="/api")
    return app


# ASGI 服务器默认加载的应用实例。
app = create_app()
