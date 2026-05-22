from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from loguru import logger
from sqlalchemy import delete, desc, func, select

from app.db import get_session
from app.models import ChatMessage, ChatSession
from app.schemas.chat_session import ChatSessionListItem, ChatSessionRead, ChatSessionSnapshot
from app.schemas.envelope import ApiEnvelope

router = APIRouter(prefix="/chat-sessions", tags=["chat-sessions"])


def _default_title(payload: ChatSessionSnapshot) -> str:
    """用第一条用户消息生成最小可读标题。"""
    first_user_message = next(
        (message.content.strip() for message in payload.messages if message.role == "user"),
        "",
    )
    return first_user_message[:30] or "新会话"


def _to_read(chat_session: ChatSession) -> ChatSessionRead:
    return ChatSessionRead(
        id=chat_session.id,
        agent_thread_id=chat_session.agent_thread_id,
        title=chat_session.title,
        message_count=chat_session.message_count,
        last_message_at=chat_session.last_message_at,
    )


def _to_list_item(chat_session: ChatSession) -> ChatSessionListItem:
    return ChatSessionListItem(
        id=chat_session.id,
        agent_thread_id=chat_session.agent_thread_id,
        title=chat_session.title,
        pinned=chat_session.pinned,
        message_count=chat_session.message_count,
        last_message_at=chat_session.last_message_at,
        updated_at=chat_session.updated_at,
    )


@router.get("", response_model=ApiEnvelope[list[ChatSessionListItem]])
async def list_chat_sessions() -> ApiEnvelope[list[ChatSessionListItem]]:
    """返回可恢复的历史会话列表。"""
    with get_session() as session:
        chat_sessions = session.scalars(
            select(ChatSession).order_by(
                desc(ChatSession.pinned),
                desc(ChatSession.updated_at),
            )
        ).all()
        data = [_to_list_item(chat_session) for chat_session in chat_sessions]

    return ApiEnvelope(data=data)


@router.get("/{session_id}", response_model=ApiEnvelope[ChatSessionRead])
async def get_chat_session(session_id: str) -> ApiEnvelope[ChatSessionRead]:
    """按路径中的 session_id 读取会话，当前值仍对应 Agent 线程 ID。"""
    with get_session() as session:
        chat_session = session.scalar(
            select(ChatSession).where(ChatSession.agent_thread_id == session_id)
        )
        if chat_session is None:
            raise HTTPException(status_code=404, detail="会话不存在")
        data = _to_read(chat_session)

    return ApiEnvelope(data=data)


@router.put("/{session_id}", response_model=ApiEnvelope[ChatSessionRead])
async def save_chat_session(
    session_id: str,
    payload: ChatSessionSnapshot,
) -> ApiEnvelope[ChatSessionRead]:
    """按路径中的 session_id 保存快照，当前值仍对应 Agent 线程 ID。"""
    now = datetime.now(UTC)

    with get_session() as session:
        chat_session = session.scalar(
            select(ChatSession).where(ChatSession.agent_thread_id == session_id)
        )
        if chat_session is None:
            chat_session = ChatSession(agent_thread_id=session_id)
            session.add(chat_session)
            session.flush()

        chat_session.title = (payload.title or "").strip() or _default_title(payload)
        chat_session.message_count = len(payload.messages)
        chat_session.last_message_at = now if payload.messages else None
        chat_session.updated_at = now

        existing_messages = session.scalars(
            select(ChatMessage).where(ChatMessage.session_id == chat_session.id)
        ).all()
        message_by_agent_id = {
            message.agent_message_id: message for message in existing_messages
        }

        for message in payload.messages:
            chat_message = message_by_agent_id.get(message.agent_message_id)
            if chat_message is None:
                chat_message = ChatMessage(
                    session_id=chat_session.id,
                    agent_message_id=message.agent_message_id,
                )
                session.add(chat_message)

            # 同一 Agent 消息重复保存时只更新内容，不产生重复行。
            chat_message.role = message.role
            chat_message.content = message.content
            chat_message.status = message.status
            chat_message.model = message.model
            chat_message.metadata_ = message.metadata

        stale_ids = set(message_by_agent_id) - {
            message.agent_message_id for message in payload.messages
        }
        for stale_id in stale_ids:
            message_by_agent_id[stale_id].status = "failed"
            message_by_agent_id[stale_id].metadata_ = {
                **message_by_agent_id[stale_id].metadata_,
                "branch_status": "inactive",
                "inactive_at": datetime.now(UTC).isoformat(),
            }

        session.flush()
        chat_session.message_count = session.scalar(
            select(func.count()).select_from(ChatMessage).where(
                ChatMessage.session_id == chat_session.id,
                ChatMessage.status != "failed",
            )
        ) or 0
        session.flush()

        data = _to_read(chat_session)

    logger.info("已保存会话 session_id={} message_count={}", session_id, data.message_count)
    return ApiEnvelope(data=data)


@router.delete("/{session_id}", response_model=ApiEnvelope[ChatSessionRead])
async def delete_chat_session(session_id: str) -> ApiEnvelope[ChatSessionRead]:
    """按路径中的 session_id 删除快照，当前值仍对应 Agent 线程 ID。"""
    with get_session() as session:
        chat_session = session.scalar(
            select(ChatSession).where(ChatSession.agent_thread_id == session_id)
        )
        if chat_session is None:
            raise HTTPException(status_code=404, detail="会话不存在")

        data = _to_read(chat_session)
        session.execute(delete(ChatSession).where(ChatSession.id == chat_session.id))

    logger.info("已删除会话 session_id={}", session_id)
    return ApiEnvelope(data=data)
