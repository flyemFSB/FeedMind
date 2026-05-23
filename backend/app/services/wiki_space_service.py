from collections import defaultdict

from loguru import logger
from sqlalchemy.exc import IntegrityError

from app.db import get_session
from app.models import WikiIngestJob, WikiPage, WikiSpace, WikiSource
from app.repositories.wiki_repository import WikiRepository
from app.schemas.wiki import (
    WikiGraphResponse,
    WikiIngestJobRead,
    WikiIngestResult,
    WikiPageRead,
    WikiPageSearchRead,
    WikiSourceCreate,
    WikiSourceDeleteImpact,
    WikiSourceDetailRead,
    WikiSourceRead,
    WikiSpaceRead,
)
from app.services.wiki_graph import build_wiki_graph
from app.tasks.wiki_ingest_queue import enqueue_sources
from app.services.wiki_sources import (
    create_text_source,
    get_delete_impact,
    get_source_detail_read,
    list_source_reads,
    to_job_read,
    to_source_read,
)
from app.services.wiki_utils import chunk_count, source_count


class WikiSpaceNotFoundError(Exception):
    """WIKI 空间不存在。"""

    detail = "WIKI 空间不存在"


class WikiSourceNotFoundError(Exception):
    """WIKI 来源不存在。"""

    detail = "来源不存在"


class WikiJobNotFoundError(Exception):
    """WIKI 摄入任务不存在。"""

    detail = "任务不存在"


class WikiSourceBusyError(Exception):
    """来源正在处理中，不能重复入队。"""

    detail = "存在正在处理中的来源"


class WikiJobRetryConflictError(Exception):
    """任务状态不允许重试。"""

    detail = "只有失败或取消的任务可以重试"


class WikiJobCancelConflictError(Exception):
    """任务状态不允许取消。"""

    detail = "当前任务状态不可取消"


def _to_space_read(space: WikiSpace, pages: list[WikiPage]) -> WikiSpaceRead:
    """将空间模型和下属页面组装为空间列表响应。"""
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
    """将页面模型和关系数组装为页面列表响应。"""
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
    """在页面列表响应基础上追加正文，保持搜索接口字段兼容。"""
    data = _to_page_read(page, relation_count).model_dump()
    return WikiPageSearchRead(**data, content=page.content)


def _ensure_space(repository: WikiRepository, space_id: str) -> None:
    """统一校验空间存在性，让 endpoint 只关心异常到状态码的映射。"""
    if repository.get_space(space_id) is None:
        raise WikiSpaceNotFoundError


def _get_source_or_raise(repository: WikiRepository, space_id: str, source_id: str) -> WikiSource:
    """读取来源并确认它属于当前空间。"""
    source = repository.get_source(source_id)
    if source is None or source.space_id != space_id:
        raise WikiSourceNotFoundError
    return source


def _get_job_or_raise(repository: WikiRepository, space_id: str, job_id: str) -> WikiIngestJob:
    """读取任务并确认它属于当前空间。"""
    job = repository.get_job(job_id)
    if job is None or job.space_id != space_id:
        raise WikiJobNotFoundError
    return job


def list_wiki_spaces() -> list[WikiSpaceRead]:
    """返回 WIKI 空间列表，包含页面、来源和 chunk 汇总。"""
    with get_session() as session:
        repository = WikiRepository(session)
        spaces = repository.list_spaces()
        pages = repository.list_pages_by_space_ids([space.id for space in spaces])

        # 按空间分组页面，避免空间列表接口产生 N+1 查询。
        pages_by_space: dict[str, list[WikiPage]] = defaultdict(list)
        for page in pages:
            pages_by_space[page.space_id].append(page)

        result = [_to_space_read(space, pages_by_space.get(space.id, [])) for space in spaces]

    logger.debug("已读取 WIKI 空间列表 count={}", len(result))
    return result


def list_wiki_pages(space_id: str) -> list[WikiPageRead]:
    """返回某个 WIKI 空间下的页面列表。"""
    with get_session() as session:
        repository = WikiRepository(session)
        _ensure_space(repository, space_id)
        pages = repository.list_pages(space_id)
        relation_counts = repository.count_page_relations(space_id)
        result = [_to_page_read(page, relation_counts.get(page.id, 0)) for page in pages]

    return result


def search_wiki_pages(space_id: str, query: str) -> list[WikiPageSearchRead]:
    """按标题或 Markdown 正文做最小关键词搜索。"""
    keyword_text = query.strip()
    if not keyword_text:
        return []

    with get_session() as session:
        repository = WikiRepository(session)
        _ensure_space(repository, space_id)
        pages = repository.search_pages(space_id, f"%{keyword_text}%")
        relation_counts = repository.count_page_relations_by_page_ids([page.id for page in pages])
        result = [
            _to_page_search_read(page, relation_counts.get(page.id, 0))
            for page in pages
        ]

    return result


def get_wiki_graph(space_id: str) -> WikiGraphResponse:
    """返回某个 WIKI 空间的知识图谱。"""
    with get_session() as session:
        repository = WikiRepository(session)
        _ensure_space(repository, space_id)
        result = build_wiki_graph(session, space_id)

    return result


def list_wiki_sources(space_id: str) -> list[WikiSourceRead]:
    """返回指定 WIKI 空间下的来源列表。"""
    with get_session() as session:
        repository = WikiRepository(session)
        _ensure_space(repository, space_id)
        result = list_source_reads(session, space_id)

    return result


def create_wiki_source(space_id: str, payload: WikiSourceCreate) -> WikiSourceRead:
    """创建一个待摄入的文本来源。"""
    with get_session() as session:
        repository = WikiRepository(session)
        _ensure_space(repository, space_id)
        source = create_text_source(session, space_id, payload.filename, payload.content)
        result = to_source_read(source)

    logger.info("已创建 WIKI 来源 id={} filename={}", result.id, result.filename)
    return result


def ingest_wiki_sources(space_id: str, source_ids: list[str]) -> list[WikiIngestResult]:
    """校验来源状态并创建摄入队列任务。"""
    unique_source_ids = list(dict.fromkeys(source_ids))

    with get_session() as session:
        repository = WikiRepository(session)
        _ensure_space(repository, space_id)
        sources = repository.list_sources_by_ids(space_id, unique_source_ids)
        source_by_id = {source.id: source for source in sources}
        missing_ids = [source_id for source_id in unique_source_ids if source_id not in source_by_id]
        if missing_ids:
            raise WikiSourceNotFoundError
        active_jobs = repository.list_active_jobs_by_source_ids(space_id, unique_source_ids)
        if active_jobs or any(source.status in ("analyzing", "generating") for source in sources):
            raise WikiSourceBusyError

    try:
        jobs = enqueue_sources(unique_source_ids)
    except IntegrityError as exc:
        # 数据库唯一索引兜底处理并发重复入队，避免同一来源同时生成多个活跃任务。
        raise WikiSourceBusyError from exc
    job_by_source = {job.source_id: job for job in jobs}
    return [
        WikiIngestResult(
            source_id=source_id,
            job_id=job_by_source[source_id].id,
            status="queued",
            page_count=0,
            written_paths=[],
        )
        for source_id in unique_source_ids
    ]


def get_wiki_source(space_id: str, source_id: str) -> WikiSourceDetailRead:
    """读取指定 WIKI 来源的详情、关联页面和任务历史。"""
    with get_session() as session:
        repository = WikiRepository(session)
        source = _get_source_or_raise(repository, space_id, source_id)
        result = get_source_detail_read(session, source)

    return result


def get_wiki_source_delete_impact(space_id: str, source_id: str) -> WikiSourceDeleteImpact:
    """读取删除来源前的影响页面范围。"""
    with get_session() as session:
        repository = WikiRepository(session)
        source = _get_source_or_raise(repository, space_id, source_id)
        result = get_delete_impact(session, source)

    return result


def list_wiki_ingest_jobs(space_id: str) -> list[WikiIngestJobRead]:
    """返回空间内最近的摄入任务。"""
    with get_session() as session:
        repository = WikiRepository(session)
        _ensure_space(repository, space_id)
        jobs = repository.list_recent_jobs(space_id)
        result = [to_job_read(job) for job in jobs]

    return result


def retry_wiki_ingest_job(space_id: str, job_id: str) -> WikiIngestJobRead:
    """基于失败或取消任务的来源重新创建 queued job。"""
    with get_session() as session:
        repository = WikiRepository(session)
        job = _get_job_or_raise(repository, space_id, job_id)
        if job.status not in ("failed", "canceled"):
            raise WikiJobRetryConflictError
        source = repository.get_source(job.source_id)
        if source is None:
            raise WikiSourceNotFoundError
        source_id = source.id
        if repository.list_active_jobs_by_source_ids(space_id, [source_id]):
            raise WikiSourceBusyError

    try:
        new_job = enqueue_sources([source_id], job_type="reingest")[0]
    except IntegrityError as exc:
        raise WikiSourceBusyError from exc
    return to_job_read(new_job)


def cancel_wiki_ingest_job(space_id: str, job_id: str) -> WikiIngestJobRead:
    """请求取消 queued/running 任务；running 任务会在阶段边界生效。"""
    with get_session() as session:
        repository = WikiRepository(session)
        job = _get_job_or_raise(repository, space_id, job_id)
        if job.status == "queued":
            job.status = "canceled"
            job.stage = "canceled"
        elif job.status == "running":
            job.status = "cancel_requested"
        else:
            raise WikiJobCancelConflictError
        result = to_job_read(job)

    return result


def delete_wiki_source(space_id: str, source_id: str) -> dict[str, bool]:
    """删除指定 WIKI 来源记录。"""
    with get_session() as session:
        repository = WikiRepository(session)
        source = _get_source_or_raise(repository, space_id, source_id)
        repository.delete_source(source)

    logger.info("已删除 WIKI 来源 id={}", source_id)
    return {"deleted": True}
