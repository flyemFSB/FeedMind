import asyncio
from contextlib import suppress
from uuid import UUID

from loguru import logger
from sqlalchemy import select

from app.db import get_session
from app.models import WikiSource
from app.services.wiki_ingest import auto_ingest

_IN_FLIGHT = ("analyzing", "generating")
NOT_QUEUED = "__not_queued__"
_worker_task: asyncio.Task | None = None
_wake_event: asyncio.Event | None = None


def _event() -> asyncio.Event:
    global _wake_event
    if _wake_event is None:
        _wake_event = asyncio.Event()
    return _wake_event


def enqueue_sources(source_ids: list[UUID]) -> None:
    """Persist sources as pending and wake the background ingest worker."""
    if not source_ids:
        return
    with get_session() as session:
        sources = session.scalars(select(WikiSource).where(WikiSource.id.in_(source_ids))).all()
        for source in sources:
            source.status = "pending"
            source.error_message = ""
            source.page_count = 0
    _event().set()


def reset_interrupted_sources() -> int:
    """Return sources interrupted mid-ingest to pending for startup recovery."""
    with get_session() as session:
        sources = session.scalars(select(WikiSource).where(WikiSource.status.in_(_IN_FLIGHT))).all()
        for source in sources:
            source.status = "pending"
            source.error_message = ""
        return len(sources)


def pending_source_count() -> int:
    with get_session() as session:
        return len(
            session.scalars(
                select(WikiSource.id).where(
                    WikiSource.status == "pending",
                    WikiSource.error_message != NOT_QUEUED,
                )
            ).all()
        )


def _next_pending_source_id() -> UUID | None:
    with get_session() as session:
        source = session.scalar(
            select(WikiSource)
            .where(WikiSource.status == "pending", WikiSource.error_message != NOT_QUEUED)
            .order_by(WikiSource.created_at.asc())
            .limit(1)
        )
        return source.id if source else None


async def process_pending_once() -> bool:
    """Process one pending source. Returns True when work was done."""
    source_id = _next_pending_source_id()
    if source_id is None:
        return False
    try:
        await auto_ingest(source_id)
    except Exception as exc:
        logger.warning("[ingest-queue] source {} failed: {}", source_id, exc)
        with get_session() as session:
            source = session.get(WikiSource, source_id)
            if source is not None and source.status != "failed":
                source.status = "failed"
                source.error_message = str(exc)[:500]
    return True


async def drain_pending_sources(limit: int | None = None) -> int:
    """Process pending sources until empty; primarily useful for tests."""
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
    """Start a single background worker for queued wiki ingestions."""
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
    """Stop the background worker during app shutdown."""
    global _worker_task, _wake_event
    if _worker_task is None:
        _wake_event = None
        return
    _worker_task.cancel()
    with suppress(asyncio.CancelledError):
        await _worker_task
    _worker_task = None
    _wake_event = None
