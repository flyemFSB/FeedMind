import asyncio
from contextlib import suppress
from datetime import datetime, timezone
from uuid import UUID

from loguru import logger
from sqlalchemy import func, select, update

from app.core.constants import NOT_QUEUED
from app.db import get_session
from app.models import WikiIngestJob, WikiSource
from app.services.wiki_ingest import WikiIngestCanceled, auto_ingest

_IN_FLIGHT = ("analyzing", "generating")
_worker_task: asyncio.Task | None = None
_wake_event: asyncio.Event | None = None


def _event() -> asyncio.Event:
    global _wake_event
    if _wake_event is None:
        _wake_event = asyncio.Event()
    return _wake_event


def _now() -> datetime:
    return datetime.now(timezone.utc)


def enqueue_sources(source_ids: list[UUID | str], job_type: str = "ingest") -> list[WikiIngestJob]:
    """创建持久化任务并唤醒后台 worker。"""
    source_keys = [str(source_id) for source_id in source_ids]
    if not source_keys:
        return []
    jobs: list[WikiIngestJob] = []
    with get_session() as session:
        sources = session.scalars(select(WikiSource).where(WikiSource.id.in_(source_keys))).all()
        for source in sources:
            job = WikiIngestJob(
                space_id=source.space_id,
                source_id=source.id,
                job_type=job_type,
                status="queued",
                stage="queued",
                progress_current=0,
                progress_total=4,
            )
            session.add(job)
            session.flush()
            source.status = "pending"
            source.error_message = ""
            source.page_count = 0
            source.last_job_id = job.id
            jobs.append(job)
    _event().set()
    return jobs


def reset_interrupted_sources() -> int:
    """启动时恢复中断的摄入任务，让 worker 可以继续处理。"""
    with get_session() as session:
        sources = session.scalars(select(WikiSource).where(WikiSource.status.in_(_IN_FLIGHT))).all()
        jobs = session.scalars(select(WikiIngestJob).where(WikiIngestJob.status.in_(("running", "cancel_requested")))).all()
        interrupted_source_ids = {job.source_id for job in jobs}
        for source in sources:
            if source.id in interrupted_source_ids:
                source.status = "pending"
                source.error_message = ""
        for job in jobs:
            job.status = "queued"
            job.stage = "queued"
            job.error_message = ""
            job.started_at = None
        return len(sources)


def pending_source_count() -> int:
    with get_session() as session:
        return session.scalar(select(func.count()).select_from(WikiIngestJob).where(WikiIngestJob.status == "queued")) or 0


def _next_pending_job() -> tuple[str, str] | None:
    """原子认领一个 queued 任务，避免多个 worker 重复消费同一 job。"""
    with get_session() as session:
        job_id = session.scalar(
            select(WikiIngestJob.id)
            .where(WikiIngestJob.status == "queued")
            .order_by(WikiIngestJob.created_at.asc())
            .limit(1)
        )
        if job_id is None:
            return None
        now = _now()
        claimed = session.execute(
            update(WikiIngestJob)
            .where(WikiIngestJob.id == job_id, WikiIngestJob.status == "queued")
            .values(
                status="running",
                stage="analyzing",
                progress_current=1,
                started_at=now,
            )
        ).rowcount
        if claimed != 1:
            return None
        job = session.get(WikiIngestJob, job_id)
        if job is None:
            return None
        return job.id, job.source_id


async def process_pending_once() -> bool:
    """处理一个 queued job。返回 True 表示消费过任务。"""
    next_job = _next_pending_job()
    if next_job is None:
        return False
    job_id, source_id = next_job
    try:
        await auto_ingest(source_id, job_id=job_id)
        _complete_job(job_id)
    except WikiIngestCanceled:
        logger.info("[ingest-queue] source {} job {} canceled", source_id, job_id)
    except Exception as exc:
        logger.warning("[ingest-queue] source {} job {} failed: {}", source_id, job_id, exc)
        _fail_job(job_id, source_id, str(exc)[:500])
    return True


def _complete_job(job_id: str) -> None:
    with get_session() as session:
        job = session.get(WikiIngestJob, job_id)
        if job is not None and job.status != "canceled":
            job.status = "completed"
            job.stage = "completed"
            job.progress_current = job.progress_total
            job.finished_at = _now()


def _fail_job(job_id: str, source_id: str, error_message: str) -> None:
    with get_session() as session:
        job = session.get(WikiIngestJob, job_id)
        if job is not None and job.status == "canceled":
            return
        source = session.get(WikiSource, source_id)
        if source is not None:
            source.status = "failed"
            source.error_message = error_message
        if job is not None:
            job.status = "failed"
            job.stage = "failed"
            job.error_message = error_message
            job.finished_at = _now()


async def drain_pending_sources(limit: int | None = None) -> int:
    """持续处理待摄入任务直到队列为空，主要供测试和运维脚本使用。"""
    done = 0
    while limit is None or done < limit:
        if not await process_pending_once():
            break
        done += 1
    return done


async def _worker_loop() -> None:
    logger.info("[ingest-queue] worker started")
    try:
        while True:
            if await process_pending_once():
                continue
            await _event().wait()
            _event().clear()
    finally:
        logger.info("[ingest-queue] worker stopped")


def start_ingest_worker() -> None:
    """启动单个后台 worker 消费 WIKI 摄入队列。"""
    global _worker_task
    reset_count = reset_interrupted_sources()
    pending_count = pending_source_count()
    if reset_count:
        logger.info("[ingest-queue] restored {} interrupted source(s)", reset_count)
    if _worker_task and not _worker_task.done():
        if pending_count:
            _event().set()
        return
    _worker_task = asyncio.create_task(_worker_loop())
    if pending_count:
        _event().set()


async def stop_ingest_worker() -> None:
    """应用关闭时停止后台 worker，避免悬挂任务。"""
    global _worker_task, _wake_event
    if _worker_task is None:
        _wake_event = None
        return
    _worker_task.cancel()
    with suppress(asyncio.CancelledError):
        await _worker_task
    _worker_task = None
    _wake_event = None
