from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.models import ChatMessage, ChatSession


def list_chat_sessions(session: Session) -> list[ChatSession]:
    """按置顶和更新时间读取会话列表。"""
    return list(
        session.scalars(
            select(ChatSession).order_by(
                desc(ChatSession.pinned),
                desc(ChatSession.updated_at),
            )
        ).all()
    )


def get_chat_session_by_thread_id(
    session: Session,
    agent_thread_id: str,
) -> ChatSession | None:
    """通过 Agent 线程 ID 读取单个会话。"""
    return session.scalar(
        select(ChatSession).where(ChatSession.agent_thread_id == agent_thread_id)
    )


def create_chat_session(session: Session, agent_thread_id: str) -> ChatSession:
    """创建会话并 flush，便于上层拿到主键。"""
    chat_session = ChatSession(agent_thread_id=agent_thread_id)
    session.add(chat_session)
    session.flush()
    return chat_session


def list_chat_messages(session: Session, session_id: str) -> list[ChatMessage]:
    """读取指定会话下的所有消息。"""
    return list(
        session.scalars(
            select(ChatMessage).where(ChatMessage.session_id == session_id)
        ).all()
    )


def create_chat_message(
    session: Session,
    *,
    session_id: str,
    agent_message_id: str,
) -> ChatMessage:
    """创建消息占位行，具体内容由 service 填充。"""
    chat_message = ChatMessage(
        session_id=session_id,
        agent_message_id=agent_message_id,
    )
    session.add(chat_message)
    return chat_message


def count_active_messages(session: Session, session_id: str) -> int:
    """统计未失败的消息数量。"""
    return (
        session.scalar(
            select(func.count()).select_from(ChatMessage).where(
                ChatMessage.session_id == session_id,
                ChatMessage.status != "failed",
            )
        )
        or 0
    )


def delete_chat_session(session: Session, chat_session: ChatSession) -> None:
    """删除会话并触发 ORM 级消息级联，避免 SQLite 残留孤儿消息。"""
    session.delete(chat_session)
