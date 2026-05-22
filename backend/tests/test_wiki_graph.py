import asyncio

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.config import get_settings
from app.db import get_session, init_db
from app.main import create_app
from app.models import WikiLink, WikiPage, WikiPageEmbedding, WikiSource, WikiSpace
from app.services.wiki_ingest import _write_blocks
from app.services.wiki_seed import DEMO_SPACE_ID


def _use_sqlite_database(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'wiki-test.db'}")
    get_settings.cache_clear()


def test_demo_wiki_seed_is_idempotent(monkeypatch, tmp_path) -> None:
    _use_sqlite_database(monkeypatch, tmp_path)

    init_db()
    init_db()

    with get_session() as session:
        assert session.scalar(select(func.count()).select_from(WikiSpace)) == 1
        assert session.scalar(select(func.count()).select_from(WikiPage)) == 6
        assert session.scalar(select(func.count()).select_from(WikiPageEmbedding)) == 6
        assert session.scalar(select(func.count()).select_from(WikiLink)) == 6

    get_settings.cache_clear()


def test_wiki_embedding_uses_blob_for_sqlite_and_roundtrips_bytes(monkeypatch, tmp_path) -> None:
    _use_sqlite_database(monkeypatch, tmp_path)
    init_db()

    with get_session() as session:
        embedding = session.scalar(select(WikiPageEmbedding))
        assert embedding is not None
        assert isinstance(embedding.embedding, bytes)
        assert len(embedding.embedding) == embedding.dimension * 4

    get_settings.cache_clear()


def test_wiki_graph_api_returns_weighted_edges(monkeypatch, tmp_path) -> None:
    _use_sqlite_database(monkeypatch, tmp_path)
    app = create_app()

    with TestClient(app) as client:
        spaces_response = client.get("/api/wiki-spaces")
        assert spaces_response.status_code == 200
        spaces = spaces_response.json()["data"]
        assert len(spaces) == 1
        assert spaces[0]["page_count"] == 6

        pages_response = client.get(f"/api/wiki-spaces/{DEMO_SPACE_ID}/pages")
        assert pages_response.status_code == 200
        assert len(pages_response.json()["data"]) == 6

        graph_response = client.get(f"/api/wiki-spaces/{DEMO_SPACE_ID}/graph")
        assert graph_response.status_code == 200
        graph = graph_response.json()["data"]

    assert graph["stats"]["node_count"] == 6
    assert graph["stats"]["edge_count"] == 6
    assert len(graph["nodes"]) == 6
    assert len(graph["edges"]) == 6

    strongest_edge = graph["edges"][0]
    assert strongest_edge["weight"] > 0
    assert strongest_edge["signals"]["direct_link"] == 3.0
    assert "embedding" not in strongest_edge

    get_settings.cache_clear()


def test_wiki_graph_api_returns_404_for_missing_space(monkeypatch, tmp_path) -> None:
    _use_sqlite_database(monkeypatch, tmp_path)
    app = create_app()

    with TestClient(app) as client:
        response = client.get("/api/wiki-spaces/10000000-0000-4000-8000-000000009999/graph")

    assert response.status_code == 404
    get_settings.cache_clear()


def test_wiki_ingest_saves_content_and_generates_wikilinks(monkeypatch, tmp_path) -> None:
    _use_sqlite_database(monkeypatch, tmp_path)
    init_db()

    with get_session() as session:
        source = WikiSource(
            space_id=DEMO_SPACE_ID,
            filename="wikilink-note.md",
            content="原始材料",
            content_hash="wikilink-note",
            status="pending",
        )
        session.add(source)
        session.flush()

    alpha_content = """---
type: concept
title: Alpha 页面
sources: [wikilink-note.md]
---

Alpha 正文包含 [[Beta 页面]] 和 [[不存在页面]]。"""
    beta_content = """---
type: entity
title: Beta 页面
sources: [wikilink-note.md]
---

Beta 正文。"""

    written = asyncio.run(
        _write_blocks(
            source,
            [
                {"path": "wiki/concepts/alpha.md", "content": alpha_content},
                {"path": "wiki/entities/beta.md", "content": beta_content},
            ],
        )
    )

    with get_session() as session:
        alpha = session.scalar(select(WikiPage).where(WikiPage.title == "Alpha 页面"))
        beta = session.scalar(select(WikiPage).where(WikiPage.title == "Beta 页面"))
        assert written == ["wiki/concepts/alpha.md", "wiki/entities/beta.md"]
        assert alpha is not None and beta is not None
        assert alpha.content == alpha_content
        assert alpha.type == "concept"

        link = session.scalar(
            select(WikiLink).where(
                WikiLink.space_id == DEMO_SPACE_ID,
                WikiLink.source_page_id == alpha.id,
                WikiLink.target_page_id == beta.id,
                WikiLink.relation_type == "wikilink",
            )
        )
        assert link is not None

    get_settings.cache_clear()


def test_wiki_search_matches_page_content(monkeypatch, tmp_path) -> None:
    _use_sqlite_database(monkeypatch, tmp_path)
    app = create_app()

    with TestClient(app) as client:
        with get_session() as session:
            source = WikiSource(
                space_id=DEMO_SPACE_ID,
                filename="search-note.md",
                content="原始材料",
                content_hash="search-note",
                status="pending",
            )
            session.add(source)
            session.flush()

        asyncio.run(
            _write_blocks(
                source,
                [
                    {
                        "path": "wiki/concepts/search-only.md",
                        "content": """---
type: concept
title: 搜索标题不含关键词
sources: [search-note.md]
---

只有正文包含 独特检索词。""",
                    }
                ],
            )
        )

        response = client.get(f"/api/wiki-spaces/{DEMO_SPACE_ID}/search?q=独特检索词")

    assert response.status_code == 200
    results = response.json()["data"]
    titles = [page["title"] for page in results]
    assert titles == ["搜索标题不含关键词"]
    assert "独特检索词" in results[0]["content"]
    get_settings.cache_clear()


def test_wiki_ingest_api_accepts_one_or_many_sources(tmp_path, monkeypatch) -> None:
    _use_sqlite_database(monkeypatch, tmp_path)
    app = create_app()

    with TestClient(app) as client:
        created_ids = []
        for filename in ("one.md", "two.md"):
            response = client.post(
                f"/api/wiki-spaces/{DEMO_SPACE_ID}/sources",
                json={"filename": filename, "content": filename},
            )
            assert response.status_code == 201
            created_ids.append(response.json()["data"]["id"])

        single_response = client.post(
            f"/api/wiki-spaces/{DEMO_SPACE_ID}/ingestions",
            json={"source_ids": [created_ids[0]]},
        )
        many_response = client.post(
            f"/api/wiki-spaces/{DEMO_SPACE_ID}/ingestions",
            json={"source_ids": created_ids},
        )

    assert single_response.status_code == 200
    assert [item["source_id"] for item in single_response.json()["data"]] == [created_ids[0]]
    assert single_response.json()["data"][0]["status"] == "pending"
    assert many_response.status_code == 200
    assert [item["source_id"] for item in many_response.json()["data"]] == created_ids
    get_settings.cache_clear()


def test_wiki_ingest_queue_persists_and_processes_pending_sources(monkeypatch, tmp_path) -> None:
    _use_sqlite_database(monkeypatch, tmp_path)
    init_db()

    processed = []

    async def fake_auto_ingest(source_id) -> list[str]:
        processed.append(source_id)
        with get_session() as session:
            source = session.get(WikiSource, source_id)
            source.status = "completed"
            source.page_count = 1
        return [f"wiki/sources/{source_id}.md"]

    monkeypatch.setattr("app.services.wiki_ingest_queue.auto_ingest", fake_auto_ingest)

    with get_session() as session:
        source = WikiSource(
            space_id=DEMO_SPACE_ID,
            filename="queued.md",
            content="原始材料",
            content_hash="queued",
            status="pending",
        )
        session.add(source)
        session.flush()
        source_id = source.id

    from app.services.wiki_ingest_queue import drain_pending_sources

    assert asyncio.run(drain_pending_sources()) == 1
    assert processed == [source_id]

    with get_session() as session:
        source = session.get(WikiSource, source_id)
        assert source.status == "completed"
        assert source.page_count == 1

    get_settings.cache_clear()
