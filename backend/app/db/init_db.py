from loguru import logger
from sqlalchemy import text

from app.db.base import Base
from app.db.session import get_engine, get_session


def check_db_connection() -> bool:
    """健康检查使用的最小数据库探测。"""
    try:
        with get_session() as session:
            session.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("数据库连接检查失败")
        return False


def init_db() -> None:
    """初始化数据库表结构，不写入任何演示数据。"""
    logger.info("开始初始化数据库表")
    engine = get_engine()
    Base.metadata.create_all(engine)
    logger.info("数据库表初始化完成")
