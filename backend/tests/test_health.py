from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


def test_health_returns_ok(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'health-test.db'}")
    get_settings.cache_clear()
    app = create_app()

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"data": {"status": "ok", "database": True}, "error": None}
    get_settings.cache_clear()
