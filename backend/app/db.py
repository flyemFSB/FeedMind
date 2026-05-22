from contextlib import contextmanager
from collections.abc import Iterator

from loguru import logger
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.models import Base
from app.services.wiki_seed import seed_demo_wiki

_engine: Engine | None = None
_engine_url = ""
_SessionFactory: sessionmaker | None = None


def get_engine() -> Engine:
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


def _rebuild_session_factory() -> None:
    global _SessionFactory
    _SessionFactory = sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_session_factory() -> sessionmaker:
    global _SessionFactory
    if _SessionFactory is None:
        _rebuild_session_factory()
    return _SessionFactory


@contextmanager
def get_session() -> Iterator[Session]:
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
    try:
        with get_session() as session:
            session.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("数据库连接检查失败")
        return False


def init_db() -> None:
    logger.info("开始初始化数据库表")
    engine = get_engine()
    Base.metadata.create_all(engine)
    with get_session() as session:
        seed_demo_wiki(session)
    logger.info("数据库表初始化完成")
