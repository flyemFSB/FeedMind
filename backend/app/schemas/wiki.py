from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WikiSpaceRead(BaseModel):
    """前端空间列表项。"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    category: str
    page_count: int
    source_count: int
    chunk_count: int
    updated_at: datetime
    tags: list[str]


class WikiPageRead(BaseModel):
    """前端页面列表项。"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    space_id: str
    title: str
    type: str
    source: str
    status: str
    chunk_count: int
    relation_count: int
    updated_at: datetime


class WikiPageSearchRead(WikiPageRead):
    """搜索结果包含正文，供查询端直接读取命中页面。"""

    content: str


class WikiGraphNode(BaseModel):
    """知识图谱节点，对应一个 WikiPage。"""

    id: str
    title: str
    type: str
    status: str
    source: str
    link_count: int


class WikiGraphEdgeSignals(BaseModel):
    """边权重的四个来源信号。"""

    direct_link: float  # 直接链接数量
    source_overlap: float  # 来源重叠度
    common_neighbor: float  # 公共邻居对数占比
    type_affinity: float  # 类型亲和度


class WikiGraphEdge(BaseModel):
    """知识图谱边，表示两节点间的关联强度。"""

    source: str
    target: str
    weight: float  # 综合权重，由四个信号加权求和
    signals: WikiGraphEdgeSignals
    relation_type: str


class WikiGraphStats(BaseModel):
    """图谱统计信息。"""

    node_count: int
    edge_count: int
    page_count: int
    source_count: int


class WikiGraphResponse(BaseModel):
    """完整知识图谱响应，不含 embedding 二进制数据。"""

    nodes: list[WikiGraphNode]
    edges: list[WikiGraphEdge]
    stats: WikiGraphStats


class WikiSourceRead(BaseModel):
    """来源列表项，包含最近任务和页面关联摘要。"""

    model_config = ConfigDict(from_attributes=True)
    id: str
    space_id: str
    filename: str
    mime_type: str
    import_kind: str
    original_uri: str
    content_size: int
    version: int
    last_job_id: str | None = None
    status: str
    error_message: str
    page_count: int
    related_page_count: int = 0
    last_job: "WikiIngestJobRead | None" = None
    created_at: datetime
    updated_at: datetime


class WikiSourceCreate(BaseModel):
    """创建文本来源的请求体。"""

    filename: str
    content: str


class WikiIngestRequest(BaseModel):
    """统一摄入请求：一个来源也放进数组，便于后续扩展选项。"""

    source_ids: list[str] = Field(min_length=1)


class WikiIngestResult(BaseModel):
    source_id: str
    job_id: str | None = None
    status: str
    page_count: int
    written_paths: list[str]
    error: str | None = None


class WikiIngestJobRead(BaseModel):
    """来源摄入任务的前端展示模型。"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    space_id: str
    source_id: str
    job_type: str
    status: str
    stage: str
    progress_current: int
    progress_total: int
    error_message: str
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime


class WikiSourcePageRead(BaseModel):
    """来源关联页面的轻量视图。"""

    id: str
    title: str
    type: str
    relation: str
    job_id: str | None = None
    updated_at: datetime


class WikiSourceDetailRead(WikiSourceRead):
    """来源详情，包含页面和任务链路。"""

    pages: list[WikiSourcePageRead]
    jobs: list[WikiIngestJobRead]


class WikiSourceDeleteImpact(BaseModel):
    """删除来源前的影响范围预览。"""

    source_id: str
    filename: str
    related_page_count: int
    orphan_page_count: int
    pages: list[WikiSourcePageRead]


class WikiIngestJobUpdate(BaseModel):
    """任务状态更新请求；当前只允许请求取消。"""

    status: Literal["canceled"]
