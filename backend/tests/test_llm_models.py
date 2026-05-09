import os

from fastapi.testclient import TestClient
import pytest

from app.core.config import get_settings
from app.main import create_app


def test_llm_model_crud_and_selection(monkeypatch) -> None:
    database_url = os.getenv("TEST_DATABASE_URL")
    if database_url is None:
        pytest.skip("TEST_DATABASE_URL is required for Postgres-backed tests")

    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    app = create_app()

    with TestClient(app) as client:
        list_response = client.get("/api/llm-models")

        assert list_response.status_code == 200
        assert list_response.json()["data"] == []

        create_response = client.post(
            "/api/llm-models",
            json={
                "provider": "OpenAI",
                "model_name": "test-model",
                "base_url": "https://example.com/v1",
                "api_key": "sk-test",
            },
        )

        assert create_response.status_code == 201
        created = create_response.json()["data"]
        assert created["model_name"] == "test-model"
        assert created["has_api_key"] is True
        assert "api_key" not in created
        model_id = created["id"]

        update_response = client.put(
            f"/api/llm-models/{model_id}",
            json={
                "provider": "DeepSeek",
                "model_name": "deepseek-chat",
                "base_url": "https://api.deepseek.com",
                "api_key": "sk-updated",
            },
        )

        assert update_response.status_code == 200
        updated = update_response.json()["data"]
        assert updated["provider"] == "DeepSeek"
        assert updated["model_name"] == "deepseek-chat"

        runtime_response = client.get(
            "/api/llm-models/runtime",
            params={"id": model_id},
        )

        assert runtime_response.status_code == 200
        assert runtime_response.json()["data"] == {
            "model_name": "deepseek-chat",
            "base_url": "https://api.deepseek.com",
            "api_key": "sk-updated",
        }

        keep_key_response = client.put(
            f"/api/llm-models/{model_id}",
            json={
                "provider": "DeepSeek",
                "model_name": "deepseek-chat",
                "base_url": "https://api.deepseek.com",
                "api_key": "",
            },
        )

        assert keep_key_response.status_code == 200
        keep_key_runtime_response = client.get(
            "/api/llm-models/runtime",
            params={"id": model_id},
        )

        assert keep_key_runtime_response.status_code == 200
        assert keep_key_runtime_response.json()["data"]["api_key"] == "sk-updated"

        select_response = client.put(
            "/api/llm-models/selected",
            json={"id": model_id},
        )

        assert select_response.status_code == 200
        assert select_response.json()["data"] == {"id": model_id}

        delete_response = client.delete(f"/api/llm-models/{model_id}")

        assert delete_response.status_code == 200
        assert delete_response.json()["data"] == {"deleted": True}

    get_settings.cache_clear()
