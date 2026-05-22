from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, JSON, LargeBinary, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.chat import Base


class WikiSpace(Base):
    __tablename__ = "wiki_spaces"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid4()), comment="WIKI空间ID")
    name: Mapped[str] = mapped_column(Text, nullable=False, comment="空间名称")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", comment="空间描述")
    category: Mapped[str] = mapped_column(Text, nullable=False, default="personal", comment="空间分类：personal/team/web/code")
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list, comment="标签列表")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now(), comment="最后更新时间"
    )

    pages: Mapped[list["WikiPage"]] = relationship(
        back_populates="space", cascade="all, delete-orphan", passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint("category IN ('personal', 'team', 'web', 'code')", name="ck_wiki_spaces_category"),
        Index("idx_wiki_spaces_updated_at", "updated_at"),
    )


class WikiPage(Base):
    __tablename__ = "wiki_pages"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid4()), comment="页面ID")
    space_id: Mapped[str] = mapped_column(
        Text, ForeignKey("wiki_spaces.id", ondelete="CASCADE"), nullable=False, comment="所属空间ID"
    )
    title: Mapped[str] = mapped_column(Text, nullable=False, index=True, comment="页面标题")
    content: Mapped[str] = mapped_column(Text, nullable=False, default="", comment="完整 Markdown 正文")
    type: Mapped[str] = mapped_column(Text, nullable=False, default="other", comment="页面类型：entity/concept/source/synthesis/comparison/overview/query/other")
    source: Mapped[str] = mapped_column(Text, nullable=False, default="", comment="主要来源标识")
    status: Mapped[str] = mapped_column(Text, nullable=False, default="indexed", comment="索引状态：pending/indexing/indexed/failed")
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default=dict, comment="扩展元数据")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now(), comment="最后更新时间"
    )

    space: Mapped[WikiSpace] = relationship(back_populates="pages")
    embedding: Mapped["WikiPageEmbedding | None"] = relationship(
        back_populates="page", cascade="all, delete-orphan", passive_deletes=True, uselist=False,
    )
    outgoing_links: Mapped[list["WikiLink"]] = relationship(
        back_populates="source_page", cascade="all, delete-orphan",
        foreign_keys="WikiLink.source_page_id", passive_deletes=True,
    )
    incoming_links: Mapped[list["WikiLink"]] = relationship(
        back_populates="target_page", cascade="all, delete-orphan",
        foreign_keys="WikiLink.target_page_id", passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint("type IN ('entity', 'concept', 'source', 'synthesis', 'comparison', 'overview', 'query', 'other')", name="ck_wiki_pages_type"),
        CheckConstraint("status IN ('pending', 'indexing', 'indexed', 'failed')", name="ck_wiki_pages_status"),
        UniqueConstraint("space_id", "title", name="uq_wiki_pages_space_title"),
        Index("idx_wiki_pages_space_updated_at", "space_id", "updated_at"),
        Index("idx_wiki_pages_space_type", "space_id", "type"),
    )


class WikiPageEmbedding(Base):
    __tablename__ = "wiki_page_embeddings"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid4()), comment="Embedding 记录ID")
    page_id: Mapped[str] = mapped_column(
        Text, ForeignKey("wiki_pages.id", ondelete="CASCADE"), nullable=False, unique=True, comment="关联页面ID（一对一）",
    )
    model: Mapped[str] = mapped_column(Text, nullable=False, comment="生成该向量的模型名称")
    dimension: Mapped[int] = mapped_column(nullable=False, comment="向量维度")
    embedding: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, comment="float32 向量原始字节")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), comment="创建时间")

    page: Mapped[WikiPage] = relationship(back_populates="embedding")

    __table_args__ = (
        CheckConstraint("dimension > 0", name="ck_wiki_page_embeddings_dimension"),
        Index("idx_wiki_page_embeddings_page_id", "page_id"),
    )


class WikiLink(Base):
    __tablename__ = "wiki_links"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid4()), comment="关系ID")
    space_id: Mapped[str] = mapped_column(
        Text, ForeignKey("wiki_spaces.id", ondelete="CASCADE"), nullable=False, comment="所属空间ID",
    )
    source_page_id: Mapped[str] = mapped_column(
        Text, ForeignKey("wiki_pages.id", ondelete="CASCADE"), nullable=False, comment="源页面ID",
    )
    target_page_id: Mapped[str] = mapped_column(
        Text, ForeignKey("wiki_pages.id", ondelete="CASCADE"), nullable=False, comment="目标页面ID",
    )
    relation_type: Mapped[str] = mapped_column(Text, nullable=False, default="wikilink", comment="关系类型（如 wikilink / citation / reference）")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), comment="创建时间")

    source_page: Mapped[WikiPage] = relationship(back_populates="outgoing_links", foreign_keys=[source_page_id])
    target_page: Mapped[WikiPage] = relationship(back_populates="incoming_links", foreign_keys=[target_page_id])

    __table_args__ = (
        CheckConstraint("source_page_id <> target_page_id", name="ck_wiki_links_not_self"),
        UniqueConstraint("space_id", "source_page_id", "target_page_id", "relation_type", name="uq_wiki_links_space_source_target_type"),
        Index("idx_wiki_links_space_id", "space_id"),
        Index("idx_wiki_links_source_page_id", "source_page_id"),
        Index("idx_wiki_links_target_page_id", "target_page_id"),
    )


class WikiSource(Base):
    __tablename__ = "wiki_sources"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid4()), comment="来源ID")
    space_id: Mapped[str] = mapped_column(Text, ForeignKey("wiki_spaces.id", ondelete="CASCADE"), nullable=False, comment="所属空间ID")
    filename: Mapped[str] = mapped_column(Text, nullable=False, comment="原始文件名")
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="提取后的文本内容")
    content_hash: Mapped[str] = mapped_column(Text, nullable=False, comment="SHA256 内容哈希，用于幂等跳过")
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending", comment="pending/analyzing/generating/completed/failed")
    error_message: Mapped[str] = mapped_column(Text, nullable=False, default="", comment="失败原因")
    page_count: Mapped[int] = mapped_column(nullable=False, default=0, comment="生成的 Wiki 页面数")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'analyzing', 'generating', 'completed', 'failed')", name="ck_wiki_sources_status"),
        Index("idx_wiki_sources_space_status", "space_id", "status"),
    )
