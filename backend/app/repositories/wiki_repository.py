from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from app.models import WikiIngestJob, WikiLink, WikiPage, WikiSpace, WikiSource


class WikiRepository:
    """封装 WIKI 空间、页面、来源和任务的数据库访问。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def list_spaces(self) -> list[WikiSpace]:
        """按更新时间倒序读取全部 WIKI 空间。"""
        return list(
            self.session.scalars(select(WikiSpace).order_by(desc(WikiSpace.updated_at))).all()
        )

    def get_space(self, space_id: str) -> WikiSpace | None:
        """按 ID 读取单个 WIKI 空间。"""
        return self.session.get(WikiSpace, space_id)

    def list_pages_by_space_ids(self, space_ids: list[str]) -> list[WikiPage]:
        """批量读取多个空间下的页面，用于空间列表汇总。"""
        if not space_ids:
            return []
        return list(
            self.session.scalars(select(WikiPage).where(WikiPage.space_id.in_(space_ids))).all()
        )

    def list_pages(self, space_id: str) -> list[WikiPage]:
        """读取空间内页面，前端按更新时间和标题展示。"""
        return list(
            self.session.scalars(
                select(WikiPage)
                .where(WikiPage.space_id == space_id)
                .order_by(desc(WikiPage.updated_at), WikiPage.title.asc())
            ).all()
        )

    def search_pages(self, space_id: str, keyword: str) -> list[WikiPage]:
        """按标题或 Markdown 正文模糊搜索页面。"""
        return list(
            self.session.scalars(
                select(WikiPage)
                .where(
                    WikiPage.space_id == space_id,
                    or_(WikiPage.title.ilike(keyword), WikiPage.content.ilike(keyword)),
                )
                .order_by(desc(WikiPage.updated_at), WikiPage.title.asc())
            ).all()
        )

    def count_page_relations(self, space_id: str) -> dict[str, int]:
        """统计空间内每个页面的正向与反向关系数。"""
        return dict(
            self.session.execute(
                select(WikiPage.id, func.count(WikiLink.id))
                .outerjoin(
                    WikiLink,
                    or_(
                        WikiLink.source_page_id == WikiPage.id,
                        WikiLink.target_page_id == WikiPage.id,
                    ),
                )
                .where(WikiPage.space_id == space_id)
                .group_by(WikiPage.id)
            ).all()
        )

    def count_page_relations_by_page_ids(self, page_ids: list[str]) -> dict[str, int]:
        """统计指定页面集合的正向与反向关系数。"""
        if not page_ids:
            return {}
        return dict(
            self.session.execute(
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

    def get_source(self, source_id: str) -> WikiSource | None:
        """按 ID 读取 WIKI 来源。"""
        return self.session.get(WikiSource, source_id)

    def list_sources_by_ids(self, space_id: str, source_ids: list[str]) -> list[WikiSource]:
        """读取空间内指定来源集合。"""
        if not source_ids:
            return []
        return list(
            self.session.scalars(
                select(WikiSource).where(
                    WikiSource.space_id == space_id,
                    WikiSource.id.in_(source_ids),
                )
            ).all()
        )

    def list_active_jobs_by_source_ids(self, space_id: str, source_ids: list[str]) -> list[WikiIngestJob]:
        """读取指定来源上尚未结束的摄入任务。"""
        if not source_ids:
            return []
        return list(
            self.session.scalars(
                select(WikiIngestJob).where(
                    WikiIngestJob.space_id == space_id,
                    WikiIngestJob.source_id.in_(source_ids),
                    WikiIngestJob.status.in_(("queued", "running", "cancel_requested")),
                )
            ).all()
        )

    def delete_source(self, source: WikiSource) -> None:
        """删除来源记录，关联行由数据库外键级联处理。"""
        self.session.delete(source)

    def list_recent_jobs(self, space_id: str, limit: int = 50) -> list[WikiIngestJob]:
        """读取空间内最近的摄入任务。"""
        return list(
            self.session.scalars(
                select(WikiIngestJob)
                .where(WikiIngestJob.space_id == space_id)
                .order_by(desc(WikiIngestJob.created_at))
                .limit(limit)
            ).all()
        )

    def get_job(self, job_id: str) -> WikiIngestJob | None:
        """按 ID 读取摄入任务。"""
        return self.session.get(WikiIngestJob, job_id)
