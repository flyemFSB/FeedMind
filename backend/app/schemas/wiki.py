from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WikiSpaceRead(BaseModel):
    """前端空间列表项。"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
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

    id: UUID
    space_id: UUID
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

    id: UUID
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

    source: UUID
    target: UUID
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
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    space_id: UUID
    filename: str
    status: str
    error_message: str
    page_count: int
    created_at: datetime
    updated_at: datetime


class WikiSourceCreate(BaseModel):
    filename: str
    content: str


class WikiIngestRequest(BaseModel):
    """统一摄入请求：一个来源也放进数组，便于后续扩展选项。"""

    source_ids: list[UUID] = Field(min_length=1)


class WikiIngestResult(BaseModel):
    source_id: UUID
    status: str
    page_count: int
    written_paths: list[str]
    error: str | None = None
