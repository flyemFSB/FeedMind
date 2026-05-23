import hashlib

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.models import WikiIngestJob, WikiPage, WikiSource, WikiSourcePage
from app.schemas.wiki import (
    WikiIngestJobRead,
    WikiSourceDeleteImpact,
    WikiSourceDetailRead,
    WikiSourcePageRead,
    WikiSourceRead,
)
from app.core.constants import NOT_QUEUED


def to_job_read(job: WikiIngestJob) -> WikiIngestJobRead:
    return WikiIngestJobRead.model_validate(job)


def to_source_read(
    source: WikiSource,
    *,
    related_page_count: int = 0,
    last_job: WikiIngestJob | None = None,
) -> WikiSourceRead:
    return WikiSourceRead(
        id=source.id,
        space_id=source.space_id,
        filename=source.filename,
        mime_type=source.mime_type,
        import_kind=source.import_kind,
        original_uri=source.original_uri,
        content_size=source.content_size,
        version=source.version,
        last_job_id=source.last_job_id or None,
        status=source.status,
        error_message="" if source.error_message == NOT_QUEUED else source.error_message,
        page_count=source.page_count,
        related_page_count=related_page_count,
        last_job=to_job_read(last_job) if last_job else None,
        created_at=source.created_at,
        updated_at=source.updated_at,
    )


def create_text_source(session: Session, space_id: str, filename: str, content: str) -> WikiSource:
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    existing = session.scalar(
        select(WikiSource).where(WikiSource.space_id == space_id, WikiSource.content_hash == content_hash)
    )
    if existing:
        return existing

    source = WikiSource(
        space_id=space_id,
        filename=filename,
        content=content,
        content_hash=content_hash,
        mime_type="text/plain",
        import_kind="text",
        original_uri=filename,
        content_size=len(content),
        status="pending",
        error_message=NOT_QUEUED,
    )
    session.add(source)
    session.flush()
    return source


def list_source_reads(session: Session, space_id: str) -> list[WikiSourceRead]:
    sources = session.scalars(
        select(WikiSource).where(WikiSource.space_id == space_id).order_by(desc(WikiSource.created_at))
    ).all()
    source_ids = [source.id for source in sources]
    last_jobs = _last_jobs_by_source(session, sources)
    related_counts = _related_counts_by_source(session, source_ids)
    return [
        to_source_read(
            source,
            related_page_count=related_counts.get(source.id, 0),
            last_job=last_jobs.get(source.id),
        )
        for source in sources
    ]


def get_source_detail_read(session: Session, source: WikiSource) -> WikiSourceDetailRead:
    jobs = session.scalars(
        select(WikiIngestJob)
        .where(WikiIngestJob.source_id == source.id)
        .order_by(desc(WikiIngestJob.created_at))
    ).all()
    pages = source_page_rows(session, source.id)
    base = to_source_read(
        source,
        related_page_count=len(pages),
        last_job=jobs[0] if jobs else None,
    ).model_dump()
    return WikiSourceDetailRead(**base, pages=pages, jobs=[to_job_read(job) for job in jobs])


def get_delete_impact(session: Session, source: WikiSource) -> WikiSourceDeleteImpact:
    pages = source_page_rows(session, source.id)
    return WikiSourceDeleteImpact(
        source_id=source.id,
        filename=source.filename,
        related_page_count=len(pages),
        orphan_page_count=_orphan_page_count(session, pages),
        pages=pages,
    )


def source_page_rows(session: Session, source_id: str) -> list[WikiSourcePageRead]:
    rows = session.execute(
        select(
            WikiPage.id,
            WikiPage.title,
            WikiPage.type,
            WikiSourcePage.relation,
            WikiSourcePage.job_id,
            WikiPage.updated_at,
        )
        .join(WikiSourcePage, WikiSourcePage.page_id == WikiPage.id)
        .where(WikiSourcePage.source_id == source_id, WikiSourcePage.relation != "removed")
        .order_by(desc(WikiSourcePage.created_at))
    ).all()

    seen: set[str] = set()
    pages: list[WikiSourcePageRead] = []
    for page_id, title, page_type, relation, job_id, updated_at in rows:
        if page_id in seen:
            continue
        seen.add(page_id)
        pages.append(
            WikiSourcePageRead(
                id=page_id,
                title=title,
                type=page_type,
                relation=relation,
                job_id=job_id,
                updated_at=updated_at,
            )
        )
    return pages


def _last_jobs_by_source(session: Session, sources: list[WikiSource]) -> dict[str, WikiIngestJob]:
    job_ids = [source.last_job_id for source in sources if source.last_job_id]
    if not job_ids:
        return {}
    jobs = session.scalars(select(WikiIngestJob).where(WikiIngestJob.id.in_(job_ids))).all()
    return {job.source_id: job for job in jobs}


def _related_counts_by_source(session: Session, source_ids: list[str]) -> dict[str, int]:
    if not source_ids:
        return {}
    return dict(
        session.execute(
            select(WikiSourcePage.source_id, func.count(func.distinct(WikiSourcePage.page_id)))
            .where(WikiSourcePage.source_id.in_(source_ids), WikiSourcePage.relation != "removed")
            .group_by(WikiSourcePage.source_id)
        ).all()
    )


def _orphan_page_count(session: Session, pages: list[WikiSourcePageRead]) -> int:
    page_ids = [str(page.id) for page in pages]
    if not page_ids:
        return 0
    source_counts = session.execute(
        select(WikiSourcePage.page_id, func.count(func.distinct(WikiSourcePage.source_id)))
        .where(WikiSourcePage.page_id.in_(page_ids), WikiSourcePage.relation != "removed")
        .group_by(WikiSourcePage.page_id)
    ).all()
    return sum(1 for _, count in source_counts if count == 1)
