import hashlib
from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import desc, func, or_, select

from app.db import get_session
from app.models import WikiLink, WikiPage, WikiSpace, WikiSource
from app.schemas.envelope import ApiEnvelope
from app.schemas.wiki import (
    WikiGraphResponse,
    WikiIngestRequest,
    WikiIngestResult,
    WikiPageRead,
    WikiPageSearchRead,
    WikiSourceCreate,
    WikiSourceRead,
    WikiSpaceRead,
)
from app.services.wiki_graph import build_wiki_graph
from app.services.wiki_ingest_queue import NOT_QUEUED, enqueue_sources
from app.services.wiki_utils import chunk_count, source_count

router = APIRouter(prefix="/wiki-spaces", tags=["wiki"])


def _to_space_read(space: WikiSpace, pages: list[WikiPage]) -> WikiSpaceRead:
    """将空间模型 + 下属页面列表组装为空间响应体。"""
    return WikiSpaceRead(
        id=space.id,
        name=space.name,
        description=space.description,
        category=space.category,
        page_count=len(pages),
        source_count=source_count(pages),
        chunk_count=sum(chunk_count(page) for page in pages),
        updated_at=space.updated_at,
        tags=space.tags,
    )


def _to_page_read(page: WikiPage, relation_count: int) -> WikiPageRead:
    """将页面模型 + 关系数组装为页面响应体。"""
    return WikiPageRead(
        id=page.id,
        space_id=page.space_id,
        title=page.title,
        type=page.type,
        source=page.source,
        status=page.status,
        chunk_count=chunk_count(page),
        relation_count=relation_count,
        updated_at=page.updated_at,
    )


def _to_page_search_read(page: WikiPage, relation_count: int) -> WikiPageSearchRead:
    data = _to_page_read(page, relation_count).model_dump()
    return WikiPageSearchRead(**data, content=page.content)


@router.get("", response_model=ApiEnvelope[list[WikiSpaceRead]])
async def list_wiki_spaces() -> ApiEnvelope[list[WikiSpaceRead]]:
    """返回 WIKI 空间列表（含页面汇总统计）。"""
    with get_session() as session:
        spaces = session.scalars(select(WikiSpace).order_by(desc(WikiSpace.updated_at))).all()

        # 批量查询所有页面，避免 N+1
        space_ids = [s.id for s in spaces]
        if space_ids:
            all_pages = session.scalars(
                select(WikiPage).where(WikiPage.space_id.in_(space_ids))
            ).all()
            pages_by_space: dict[UUID, list[WikiPage]] = defaultdict(list)
            for page in all_pages:
                pages_by_space[page.space_id].append(page)
        else:
            pages_by_space = {}

        data = [_to_space_read(space, pages_by_space.get(space.id, [])) for space in spaces]

    return ApiEnvelope(data=data)


@router.get("/{space_id}/pages", response_model=ApiEnvelope[list[WikiPageRead]])
async def list_wiki_pages(space_id: UUID) -> ApiEnvelope[list[WikiPageRead]]:
    """返回某个 WIKI 空间下的页面列表（含关系数统计）。"""
    space_key = str(space_id)
    with get_session() as session:
        space = session.get(WikiSpace, space_key)
        if space is None:
            raise HTTPException(status_code=404, detail="WIKI 空间不存在")

        pages = session.scalars(
            select(WikiPage)
            .where(WikiPage.space_id == space_key)
            .order_by(desc(WikiPage.updated_at), WikiPage.title.asc())
        ).all()

        # 统计每个页面关联的关系数（正向 + 反向）
        relation_counts = dict(
            session.execute(
                select(WikiPage.id, func.count(WikiLink.id))
                .outerjoin(
                    WikiLink,
                    or_(
                        WikiLink.source_page_id == WikiPage.id,
                        WikiLink.target_page_id == WikiPage.id,
                    ),
                )
                .where(WikiPage.space_id == space_key)
                .group_by(WikiPage.id)
            ).all()
        )
        data = [_to_page_read(page, relation_counts.get(page.id, 0)) for page in pages]

    return ApiEnvelope(data=data)


@router.get("/{space_id}/search", response_model=ApiEnvelope[list[WikiPageSearchRead]])
async def search_wiki_pages(space_id: UUID, q: str = Query(..., min_length=1)) -> ApiEnvelope[list[WikiPageSearchRead]]:
    """按标题或 Markdown 正文做最小关键词搜索。"""
    space_key = str(space_id)
    keyword = f"%{q.strip()}%"
    if keyword == "%%":
        return ApiEnvelope(data=[])

    with get_session() as session:
        if session.get(WikiSpace, space_key) is None:
            raise HTTPException(status_code=404, detail="WIKI 空间不存在")

        pages = session.scalars(
            select(WikiPage)
            .where(
                WikiPage.space_id == space_key,
                or_(WikiPage.title.ilike(keyword), WikiPage.content.ilike(keyword)),
            )
            .order_by(desc(WikiPage.updated_at), WikiPage.title.asc())
        ).all()

        page_ids = [page.id for page in pages]
        relation_counts = {}
        if page_ids:
            relation_counts = dict(
                session.execute(
                    select(WikiPage.id, func.count(WikiLink.id))
                    .outerjoin(
                        WikiLink,
                        or_(
                            WikiLink.source_page_id == WikiPage.id,
                            WikiLink.target_page_id == WikiPage.id,
                        ),
                    )
                    .where(WikiPage.id.in_(page_ids))
                    .group_by(WikiPage.id)
                ).all()
            )
        data = [_to_page_search_read(page, relation_counts.get(page.id, 0)) for page in pages]

    return ApiEnvelope(data=data)


@router.get("/{space_id}/graph", response_model=ApiEnvelope[WikiGraphResponse])
async def get_wiki_graph(space_id: UUID) -> ApiEnvelope[WikiGraphResponse]:
    """返回某个 WIKI 空间的知识图谱（不含 embedding 二进制数据）。"""
    space_key = str(space_id)
    with get_session() as session:
        space = session.get(WikiSpace, space_key)
        if space is None:
            raise HTTPException(status_code=404, detail="WIKI 空间不存在")
        data = build_wiki_graph(session, space_key)

    return ApiEnvelope(data=data)


# ── 来源管理（合并自 wiki_ingest.py） ──────────────────────

def _to_source_read(src: WikiSource) -> WikiSourceRead:
    return WikiSourceRead(
        id=src.id, space_id=src.space_id, filename=src.filename, status=src.status,
        error_message="" if src.error_message == NOT_QUEUED else src.error_message,
        page_count=src.page_count,
        created_at=src.created_at, updated_at=src.updated_at,
    )


@router.get("/{space_id}/sources", response_model=ApiEnvelope[list[WikiSourceRead]])
async def list_wiki_sources(space_id: UUID) -> ApiEnvelope[list[WikiSourceRead]]:
    """返回指定 WIKI 空间下的来源列表。"""
    space_key = str(space_id)
    with get_session() as session:
        if session.get(WikiSpace, space_key) is None:
            raise HTTPException(status_code=404, detail="WIKI 空间不存在")
        sources = session.scalars(select(WikiSource).where(WikiSource.space_id == space_key).order_by(desc(WikiSource.created_at))).all()
    return ApiEnvelope(data=[_to_source_read(s) for s in sources])


@router.post("/{space_id}/sources", response_model=ApiEnvelope[WikiSourceRead], status_code=201)
async def create_wiki_source(space_id: UUID, payload: WikiSourceCreate) -> ApiEnvelope[WikiSourceRead]:
    """创建一个待摄入的 WIKI 来源。"""
    space_key = str(space_id)
    with get_session() as session:
        if session.get(WikiSpace, space_key) is None:
            raise HTTPException(status_code=404, detail="WIKI 空间不存在")
        content_hash = hashlib.sha256(payload.content.encode("utf-8")).hexdigest()
        existing = session.scalar(select(WikiSource).where(WikiSource.space_id == space_key, WikiSource.content_hash == content_hash))
        if existing:
            return ApiEnvelope(data=_to_source_read(existing))
        source = WikiSource(space_id=space_key, filename=payload.filename, content=payload.content, content_hash=content_hash, status="pending", error_message=NOT_QUEUED)
        session.add(source)
        session.flush()
    return ApiEnvelope(data=_to_source_read(source))


@router.post("/{space_id}/ingestions", response_model=ApiEnvelope[list[WikiIngestResult]])
async def ingest_wiki_sources(space_id: UUID, payload: WikiIngestRequest) -> ApiEnvelope[list[WikiIngestResult]]:
    """统一摄入入口：source_ids 支持传入一个或多个来源。"""
    space_key = str(space_id)
    source_ids = list(dict.fromkeys(str(source_id) for source_id in payload.source_ids))
    with get_session() as session:
        sources = session.scalars(
            select(WikiSource).where(WikiSource.space_id == space_key, WikiSource.id.in_(source_ids))
        ).all()
        source_by_id = {source.id: source for source in sources}
        missing_ids = [source_id for source_id in source_ids if source_id not in source_by_id]
        if missing_ids:
            raise HTTPException(status_code=404, detail="来源不存在")
        if any(source.status in ("analyzing", "generating") for source in sources):
            raise HTTPException(status_code=409, detail="存在正在处理中的来源")

    enqueue_sources(source_ids)
    results = [
        WikiIngestResult(source_id=source_id, status="pending", page_count=0, written_paths=[])
        for source_id in source_ids
    ]
    return ApiEnvelope(data=results)


@router.get("/{space_id}/sources/{source_id}", response_model=ApiEnvelope[WikiSourceRead])
async def get_wiki_source(space_id: UUID, source_id: UUID) -> ApiEnvelope[WikiSourceRead]:
    """读取指定 WIKI 来源的元数据。"""
    space_key = str(space_id)
    with get_session() as session:
        source = session.get(WikiSource, str(source_id))
        if source is None or source.space_id != space_key:
            raise HTTPException(status_code=404, detail="来源不存在")
    return ApiEnvelope(data=_to_source_read(source))


@router.delete("/{space_id}/sources/{source_id}", response_model=ApiEnvelope[dict[str, bool]])
async def delete_wiki_source(space_id: UUID, source_id: UUID) -> ApiEnvelope[dict[str, bool]]:
    """删除指定 WIKI 来源记录。"""
    space_key = str(space_id)
    with get_session() as session:
        source = session.get(WikiSource, str(source_id))
        if source is None or source.space_id != space_key:
            raise HTTPException(status_code=404, detail="来源不存在")
        session.delete(source)
    return ApiEnvelope(data={"deleted": True})
