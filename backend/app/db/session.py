from collections.abc import Iterator
from contextlib import contextmanager

from loguru import logger
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_engine: Engine | None = None
_engine_url = ""
_SessionFactory: sessionmaker | None = None


def get_engine() -> Engine:
    """按当前配置懒加载数据库引擎，测试切库时会自动重建。"""
    global _engine, _engine_url

    database_url = get_settings().database_url
    if _engine is None or _engine_url != database_url:
        logger.info("初始化数据库引擎")
        if database_url.startswith("sqlite"):
            _engine = create_engine(
                database_url,
                connect_args={"check_same_thread": False},
                pool_pre_ping=True,
            )
            _enable_sqlite_foreign_keys(_engine)
        else:
            _engine = create_engine(
                database_url,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
                pool_recycle=300,
            )
        _engine_url = database_url
        _rebuild_session_factory()
    return _engine


def _enable_sqlite_foreign_keys(engine: Engine) -> None:
    """SQLite 默认关闭外键，测试和本地库需要显式开启级联删除。"""

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def _rebuild_session_factory() -> None:
    global _SessionFactory
    _SessionFactory = sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_session_factory() -> sessionmaker:
    """返回统一的 Session 工厂，避免各模块自行创建连接池。"""
    global _SessionFactory
    if _SessionFactory is None:
        _rebuild_session_factory()
    return _SessionFactory


@contextmanager
def get_session() -> Iterator[Session]:
    """提供事务边界：正常提交，异常回滚，并始终关闭会话。"""
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
