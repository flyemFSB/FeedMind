from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from loguru import logger

from app.api.router import api_router
from app.core.config import get_settings
from app.db import init_db
from app.services.wiki_ingest_queue import start_ingest_worker, stop_ingest_worker


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """管理 FastAPI 生命周期，在服务启动时准备数据库。"""
    logger.info("FeedMind Backend 启动中")
    init_db()
    start_ingest_worker()
    try:
        yield
    finally:
        await stop_ingest_worker()
        logger.info("FeedMind Backend 已停止")


def create_app() -> FastAPI:
    """创建 FastAPI 应用并挂载中间件与业务路由。"""
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

    # Agent 聊天流由独立 Agent API 承接；Backend 只暴露普通业务 REST API。
    app.include_router(api_router, prefix="/api")
    return app


# ASGI 服务器默认加载的应用实例。
app = create_app()
