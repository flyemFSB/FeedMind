from contextlib import contextmanager
from collections.abc import Iterator

from loguru import logger
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.models import Base

_engine: Engine | None = None
_engine_url = ""

# 模块级 Session 工厂，避免每次请求重复创建。
_SessionFactory: sessionmaker | None = None


def get_engine() -> Engine:
    """按当前 DATABASE_URL 懒加载数据库引擎，便于测试切换连接。"""
    global _engine, _engine_url

    database_url = get_settings().database_url
    if _engine is None or _engine_url != database_url:
        logger.info("初始化数据库引擎")
        if database_url.startswith("sqlite"):
            _engine = create_engine(
                database_url,
                connect_args={"check_same_thread": False},
                poolclass=StaticPool,
            )
        else:
            _engine = create_engine(
                database_url,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
            )
        _engine_url = database_url
        # 引擎变化时重置 Session 工厂
        _rebuild_session_factory()
    return _engine


def _rebuild_session_factory() -> None:
    """根据当前引擎重建模块级 Session 工厂。"""
    global _SessionFactory
    _SessionFactory = sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_session_factory() -> sessionmaker:
    """获取模块级 Session 工厂（懒初始化）。"""
    global _SessionFactory
    if _SessionFactory is None:
        _rebuild_session_factory()
    return _SessionFactory


@contextmanager
def get_session() -> Iterator[Session]:
    """提供带自动提交和回滚的数据库会话边界。"""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        logger.exception("数据库会话执行失败，已回滚")
        session.rollback()
        raise
    finally:
        session.close()


def check_db_connection() -> bool:
    """检查数据库是否可达，用于健康探活。"""
    try:
        with get_session() as session:
            session.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("数据库连接检查失败")
        return False


def init_db() -> None:
    """应用启动时创建缺失的数据表。"""
    logger.info("开始初始化数据库表")
    Base.metadata.create_all(get_engine())
    logger.info("数据库表初始化完成")
