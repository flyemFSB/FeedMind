from app.models import Base

# 统一暴露 SQLAlchemy metadata，后续接入 Alembic 时只需引用这里。
__all__ = ["Base"]
