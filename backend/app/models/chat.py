from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """所有 ORM 模型共享的声明式基类。"""

    pass


class ChatSession(Base):
    """聊天会话表，用于驱动历史会话列表。"""

    __tablename__ = "chat_sessions"

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        default=uuid4,
        comment="会话ID",
    )
    aegra_thread_id: Mapped[str] = mapped_column(
        Text,
        unique=True,
        nullable=False,
        comment="Aegra线程ID",
    )
    title: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="新会话",
        comment="会话标题",
    )
    pinned: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="是否置顶",
    )
    message_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="消息数量",
    )
    last_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        comment="最后消息时间",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="创建时间",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        comment="更新时间",
    )

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        Index("idx_chat_sessions_updated_at", "updated_at"),
        Index("idx_chat_sessions_pinned_updated_at", "pinned", "updated_at"),
    )


class ChatMessage(Base):
    """聊天消息表，保存每轮用户和助手消息。"""

    __tablename__ = "chat_messages"

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        default=uuid4,
        comment="消息ID",
    )
    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        comment="所属会话ID",
    )
    aegra_message_id: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Aegra消息ID",
    )
    role: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="消息角色",
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="消息内容",
    )
    status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="completed",
        comment="消息状态",
    )
    model: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        comment="使用模型",
    )
    metadata_: Mapped[dict] = mapped_column(
        "metadata",
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=dict,
        comment="扩展数据",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="创建时间",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        comment="更新时间",
    )

    session: Mapped[ChatSession] = relationship(back_populates="messages")

    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'assistant', 'system', 'tool')",
            name="ck_chat_messages_role",
        ),
        CheckConstraint(
            "status IN ('streaming', 'completed', 'failed')",
            name="ck_chat_messages_status",
        ),
        UniqueConstraint("session_id", "aegra_message_id", name="uq_chat_messages_session_aegra_id"),
        Index("idx_chat_messages_session_created_at", "session_id", "created_at"),
    )
