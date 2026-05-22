from dataclasses import dataclass
from math import log
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import WikiLink, WikiPage
from app.schemas.wiki import (
    WikiGraphEdge,
    WikiGraphEdgeSignals,
    WikiGraphNode,
    WikiGraphResponse,
    WikiGraphStats,
)
from app.services.wiki_utils import page_sources

# 四个信号的基权重，调节各信号对最终权重的贡献度
WEIGHTS: dict[str, float] = {
    "direct_link": 3.0,
    "source_overlap": 4.0,
    "common_neighbor": 1.5,
    "type_affinity": 1.0,
}

# 节点类型间的基础亲和度矩阵
TYPE_AFFINITY: dict[str, dict[str, float]] = {
    "entity": {"concept": 1.2, "entity": 0.8, "source": 1.0, "synthesis": 1.0, "query": 0.8},
    "concept": {"entity": 1.2, "concept": 0.8, "source": 1.0, "synthesis": 1.2, "query": 1.0},
    "source": {"entity": 1.0, "concept": 1.0, "source": 0.5, "query": 0.8, "synthesis": 1.0},
    "query": {"concept": 1.0, "entity": 0.8, "synthesis": 1.0, "source": 0.8, "query": 0.5},
    "synthesis": {"concept": 1.2, "entity": 1.0, "source": 1.0, "query": 1.0, "synthesis": 0.8},
    "comparison": {"concept": 1.0, "entity": 0.8, "source": 1.0, "synthesis": 1.2, "comparison": 0.8},
    "overview": {"concept": 1.0, "entity": 1.0, "source": 1.0, "synthesis": 1.0, "overview": 0.5},
}


@dataclass(frozen=True)
class PageGraphContext:
    """单个页面在图谱计算中的缓存上下文，避免重复计算。"""

    page: WikiPage
    neighbors: frozenset[str]
    sources: frozenset[str]


def _type_affinity(source_type: str, target_type: str) -> float:
    """查表获取两个类型之间的亲和度，未知类型对回退 0.5。"""
    return TYPE_AFFINITY.get(source_type, {}).get(target_type, 0.5)


def _edge_signals(
    source: PageGraphContext,
    target: PageGraphContext,
    direct_link_count: int,
    contexts: dict[str, PageGraphContext],
) -> WikiGraphEdgeSignals:
    """计算两个页面节点之间的四维信号向量。"""
    # 信号1：直接链接数 × 权重
    direct_link = direct_link_count * WEIGHTS["direct_link"]

    # 信号2：来源重叠数 × 权重
    source_overlap = len(source.sources & target.sources) * WEIGHTS["source_overlap"]

    # 信号3：公共邻居的度倒数之和 × 权重（Adamic-Adar 相似度思想）
    common_neighbor = 0.0
    for neighbor_id in source.neighbors & target.neighbors:
        degree = len(contexts[neighbor_id].neighbors)
        common_neighbor += 1 / log(max(degree, 2))
    common_neighbor *= WEIGHTS["common_neighbor"]

    # 信号4：类型匹配度 × 权重
    type_affinity = _type_affinity(source.page.type, target.page.type) * WEIGHTS["type_affinity"]

    return WikiGraphEdgeSignals(
        direct_link=round(direct_link, 4),
        source_overlap=round(source_overlap, 4),
        common_neighbor=round(common_neighbor, 4),
        type_affinity=round(type_affinity, 4),
    )


def build_wiki_graph(session: Session, space_id: str) -> WikiGraphResponse:
    """为指定 WIKI 空间构建加权无向知识图谱。"""
    # 一次性加载该空间下所有页面和边
    pages = session.scalars(
        select(WikiPage)
        .where(WikiPage.space_id == space_id)
        .order_by(WikiPage.updated_at.desc(), WikiPage.title.asc())
    ).all()
    links = session.scalars(select(WikiLink).where(WikiLink.space_id == space_id)).all()

    page_ids = {page.id for page in pages}

    # 构建邻接表和边计数
    adjacency: dict[str, set[str]] = {page.id: set() for page in pages}
    direct_counts: dict[tuple[str, str], int] = {}
    relation_types: dict[tuple[str, str], str] = {}

    for link in links:
        if link.source_page_id not in page_ids or link.target_page_id not in page_ids:
            continue
        edge_key = tuple(sorted((link.source_page_id, link.target_page_id), key=str))
        direct_counts[edge_key] = direct_counts.get(edge_key, 0) + 1
        relation_types.setdefault(edge_key, link.relation_type)
        adjacency[link.source_page_id].add(link.target_page_id)
        adjacency[link.target_page_id].add(link.source_page_id)

    # 构建页面上下文缓存，后续遍历边时复用
    contexts = {
        page.id: PageGraphContext(
            page=page,
            neighbors=frozenset(adjacency[page.id]),
            sources=page_sources(page),
        )
        for page in pages
    }

    # 组装节点列表
    nodes = [
        WikiGraphNode(
            id=page.id,
            title=page.title,
            type=page.type,
            status=page.status,
            source=page.source,
            link_count=len(adjacency[page.id]),
        )
        for page in pages
    ]

    # 组装边列表，计算综合权重
    edges: list[WikiGraphEdge] = []
    for (source_id, target_id), direct_link_count in direct_counts.items():
        source = contexts[source_id]
        target = contexts[target_id]
        signals = _edge_signals(source, target, direct_link_count, contexts)
        weight = signals.direct_link + signals.source_overlap + signals.common_neighbor + signals.type_affinity
        edges.append(
            WikiGraphEdge(
                source=source_id,
                target=target_id,
                weight=round(weight, 4),
                signals=signals,
                relation_type=relation_types[(source_id, target_id)],
            )
        )

    # 按权重降序排列，前端优先展示强关联
    edges.sort(key=lambda edge: edge.weight, reverse=True)

    # 从已有 contexts 中统计来源总数，避免重复计算 _page_sources
    source_count = len({s for ctx in contexts.values() for s in ctx.sources})

    return WikiGraphResponse(
        nodes=nodes,
        edges=edges,
        stats=WikiGraphStats(
            node_count=len(nodes),
            edge_count=len(edges),
            page_count=len(pages),
            source_count=source_count,
        ),
    )
