from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.chat import Base


class ModelConfig(Base):
    __tablename__ = "models_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, comment="模型ID")
    provider: Mapped[str] = mapped_column(Text, nullable=False, comment="供应商")
    model_name: Mapped[str] = mapped_column(Text, unique=True, nullable=False, comment="模型名称")
    base_url: Mapped[str] = mapped_column(Text, nullable=False, default="", comment="接口地址")
    encrypted_api_key: Mapped[str] = mapped_column(
        Text, nullable=False, default="", comment="加密后的接口密钥"
    )
    is_selected: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, comment="是否当前选中模型"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )
