from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ChatMessageSnapshot(BaseModel):
    """前端提交的单条消息快照。"""

    agent_message_id: str = Field(min_length=1)
    role: Literal["user", "assistant", "system", "tool"]
    content: str = Field(min_length=1)
    status: Literal["streaming", "completed", "failed"] = "completed"
    model: str = ""
    metadata: dict[str, object] = Field(default_factory=dict)


class ChatSessionSnapshot(BaseModel):
    """前端提交的完整会话快照。"""

    title: str | None = None
    messages: list[ChatMessageSnapshot] = Field(default_factory=list)


class ChatSessionRead(BaseModel):
    """会话保存后的基础信息。"""

    id: UUID
    agent_thread_id: str
    title: str
    message_count: int
    last_message_at: datetime | None


class ChatSessionListItem(BaseModel):
    """历史会话列表项。"""

    id: UUID
    agent_thread_id: str
    title: str
    pinned: bool
    message_count: int
    last_message_at: datetime | None
    updated_at: datetime
