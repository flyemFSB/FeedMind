from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import get_settings
from app.db import get_session
from app.main import create_app
from app.models import ChatMessage, ChatSession


def test_save_chat_session_snapshot_upserts_messages(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'chat-session-test.db'}")
    get_settings.cache_clear()
    app = create_app()

    with TestClient(app) as client:
        response = client.put(
            "/api/chat-sessions/thread-1",
            json={
                "messages": [
                    {
                        "agent_message_id": "msg-user-1",
                        "role": "user",
                        "content": "帮我总结趋势",
                    },
                    {
                        "agent_message_id": "msg-ai-1",
                        "role": "assistant",
                        "content": "这是趋势摘要",
                    },
                ],
            },
        )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["title"] == "帮我总结趋势"
        assert data["message_count"] == 2

        list_response = client.get("/api/chat-sessions")
        assert list_response.status_code == 200
        listed_sessions = list_response.json()["data"]
        assert listed_sessions[0]["agent_thread_id"] == "thread-1"
        assert listed_sessions[0]["title"] == "帮我总结趋势"

        replace_response = client.put(
            "/api/chat-sessions/thread-1",
            json={
                "messages": [
                    {
                        "agent_message_id": "msg-user-1",
                        "role": "user",
                        "content": "新的问题",
                    },
                ],
            },
        )

        assert replace_response.status_code == 200
        assert replace_response.json()["data"]["message_count"] == 1

        get_response = client.get("/api/chat-sessions/thread-1")
        assert get_response.status_code == 200
        assert get_response.json()["data"]["agent_thread_id"] == "thread-1"

    with get_session() as session:
        chat_session = session.scalar(
            select(ChatSession).where(ChatSession.agent_thread_id == "thread-1")
        )
        assert chat_session is not None
        messages = session.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == chat_session.id)
            .order_by(ChatMessage.agent_message_id.asc())
        ).all()
        assert [(message.agent_message_id, message.content, message.status) for message in messages] == [
            ("msg-ai-1", "这是趋势摘要", "failed"),
            ("msg-user-1", "新的问题", "completed"),
        ]

    get_settings.cache_clear()


def test_delete_chat_session_removes_snapshot(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'chat-session-delete-test.db'}")
    get_settings.cache_clear()
    app = create_app()

    with TestClient(app) as client:
        response = client.put(
            "/api/chat-sessions/thread-delete",
            json={
                "messages": [
                    {
                        "agent_message_id": "msg-user-delete",
                        "role": "user",
                        "content": "删除这个会话",
                    },
                ],
            },
        )
        assert response.status_code == 200

        delete_response = client.delete("/api/chat-sessions/thread-delete")
        assert delete_response.status_code == 200
        assert delete_response.json()["data"]["agent_thread_id"] == "thread-delete"

        get_response = client.get("/api/chat-sessions/thread-delete")
        assert get_response.status_code == 404

    get_settings.cache_clear()
