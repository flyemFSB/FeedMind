from fastapi import APIRouter, HTTPException, status

from app.schemas.chat_session import ChatSessionListItem, ChatSessionRead, ChatSessionSnapshot
from app.schemas.envelope import ApiEnvelope
from app.services import chat_session_service
from app.services.chat_session_service import ChatSessionNotFoundError

router = APIRouter(prefix="/chat-sessions", tags=["chat-sessions"])


@router.get("", response_model=ApiEnvelope[list[ChatSessionListItem]])
def list_chat_sessions() -> ApiEnvelope[list[ChatSessionListItem]]:
    """返回可恢复的历史会话列表。"""
    return ApiEnvelope(data=chat_session_service.list_chat_sessions())


@router.get("/{session_id}", response_model=ApiEnvelope[ChatSessionRead])
def get_chat_session(session_id: str) -> ApiEnvelope[ChatSessionRead]:
    """按路径中的 session_id 读取会话，当前值仍对应 Agent 线程 ID。"""
    try:
        return ApiEnvelope(data=chat_session_service.get_chat_session(session_id))
    except ChatSessionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=exc.detail,
        ) from exc


@router.put("/{session_id}", response_model=ApiEnvelope[ChatSessionRead])
def save_chat_session(
    session_id: str,
    payload: ChatSessionSnapshot,
) -> ApiEnvelope[ChatSessionRead]:
    """按路径中的 session_id 保存快照，当前值仍对应 Agent 线程 ID。"""
    return ApiEnvelope(data=chat_session_service.save_chat_session(session_id, payload))


@router.delete("/{session_id}", response_model=ApiEnvelope[ChatSessionRead])
def delete_chat_session(session_id: str) -> ApiEnvelope[ChatSessionRead]:
    """按路径中的 session_id 删除快照，当前值仍对应 Agent 线程 ID。"""
    try:
        return ApiEnvelope(data=chat_session_service.delete_chat_session(session_id))
    except ChatSessionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=exc.detail,
        ) from exc
