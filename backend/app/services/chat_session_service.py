from datetime import UTC, datetime

from loguru import logger
from sqlalchemy.exc import IntegrityError

from app.db import get_session
from app.models import ChatSession
from app.repositories import chat_session_repository as repository
from app.schemas.chat_session import ChatSessionListItem, ChatSessionRead, ChatSessionSnapshot


class ChatSessionNotFoundError(Exception):
    """会话不存在。"""

    detail = "会话不存在"


def _default_title(payload: ChatSessionSnapshot) -> str:
    """用第一条用户消息生成最小可读标题。"""
    first_user_message = next(
        (message.content.strip() for message in payload.messages if message.role == "user"),
        "",
    )
    return first_user_message[:30] or "新会话"


def _to_read(chat_session: ChatSession) -> ChatSessionRead:
    """把会话 ORM 对象转换为详情响应。"""
    return ChatSessionRead(
        id=chat_session.id,
        agent_thread_id=chat_session.agent_thread_id,
        title=chat_session.title,
        message_count=chat_session.message_count,
        last_message_at=chat_session.last_message_at,
    )


def _to_list_item(chat_session: ChatSession) -> ChatSessionListItem:
    """把会话 ORM 对象转换为列表项响应。"""
    return ChatSessionListItem(
        id=chat_session.id,
        agent_thread_id=chat_session.agent_thread_id,
        title=chat_session.title,
        pinned=chat_session.pinned,
        message_count=chat_session.message_count,
        last_message_at=chat_session.last_message_at,
        updated_at=chat_session.updated_at,
    )


def list_chat_sessions() -> list[ChatSessionListItem]:
    """返回可恢复的历史会话列表。"""
    with get_session() as session:
        chat_sessions = repository.list_chat_sessions(session)

    logger.debug("已读取会话列表 count={}", len(chat_sessions))
    return [_to_list_item(chat_session) for chat_session in chat_sessions]


def get_chat_session(session_id: str) -> ChatSessionRead:
    """按 Agent 线程 ID 读取会话。"""
    with get_session() as session:
        chat_session = repository.get_chat_session_by_thread_id(session, session_id)
        if chat_session is None:
            raise ChatSessionNotFoundError
        result = _to_read(chat_session)

    return result


def save_chat_session(
    session_id: str,
    payload: ChatSessionSnapshot,
) -> ChatSessionRead:
    """保存会话快照，重复消息更新，缺失旧消息标记为 failed。"""
    now = datetime.now(UTC)

    with get_session() as session:
        chat_session = repository.get_chat_session_by_thread_id(session, session_id)
        if chat_session is None:
            try:
                chat_session = repository.create_chat_session(session, session_id)
            except IntegrityError:
                session.rollback()
                chat_session = repository.get_chat_session_by_thread_id(session, session_id)
                if chat_session is None:
                    raise

        chat_session.title = (payload.title or "").strip() or _default_title(payload)
        chat_session.message_count = len(payload.messages)
        chat_session.last_message_at = now if payload.messages else None
        chat_session.updated_at = now

        existing_messages = repository.list_chat_messages(session, chat_session.id)
        message_by_agent_id = {
            message.agent_message_id: message for message in existing_messages
        }
        incoming_agent_ids = {message.agent_message_id for message in payload.messages}

        for message in payload.messages:
            chat_message = message_by_agent_id.get(message.agent_message_id)
            if chat_message is None:
                chat_message = repository.create_chat_message(
                    session,
                    session_id=chat_session.id,
                    agent_message_id=message.agent_message_id,
                )
                message_by_agent_id[message.agent_message_id] = chat_message

            # 同一 Agent 消息重复保存时只更新内容，不产生重复行。
            chat_message.role = message.role
            chat_message.content = message.content
            chat_message.status = message.status
            chat_message.model = message.model
            chat_message.metadata_ = message.metadata

        stale_ids = set(message_by_agent_id) - incoming_agent_ids
        inactive_at = now.isoformat()
        for stale_id in stale_ids:
            stale_message = message_by_agent_id[stale_id]
            stale_message.status = "failed"
            stale_message.metadata_ = {
                **(stale_message.metadata_ or {}),
                "branch_status": "inactive",
                "inactive_at": inactive_at,
            }

        session.flush()
        chat_session.message_count = repository.count_active_messages(session, chat_session.id)
        session.flush()
        result = _to_read(chat_session)

    logger.info("已保存会话 session_id={} message_count={}", session_id, result.message_count)
    return result


def delete_chat_session(session_id: str) -> ChatSessionRead:
    """删除指定 Agent 线程对应的会话。"""
    with get_session() as session:
        chat_session = repository.get_chat_session_by_thread_id(session, session_id)
        if chat_session is None:
            raise ChatSessionNotFoundError

        result = _to_read(chat_session)
        repository.delete_chat_session(session, chat_session)

    logger.info("已删除会话 session_id={}", session_id)
    return result
