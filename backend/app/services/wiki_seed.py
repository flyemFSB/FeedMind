import struct
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import WikiLink, WikiPage, WikiPageEmbedding, WikiSpace

# 固定空间ID，确保演示数据幂等
DEMO_SPACE_ID = "10000000-0000-4000-8000-000000000001"

# 演示页面数据，覆盖多数页面类型
DEMO_PAGES = [
    {
        "id": "10000000-0000-4000-8000-000000000101",
        "title": "浏览器 AI 插件趋势",
        "type": "concept",
        "source": "web clip",
        "status": "indexed",
        "metadata": {"chunk_count": 42, "sources": ["web-clip-ai-plugins"]},
    },
    {
        "id": "10000000-0000-4000-8000-000000000102",
        "title": "LangGraph Agent 记忆方案",
        "type": "concept",
        "source": "github",
        "status": "indexed",
        "metadata": {"chunk_count": 28, "sources": ["langgraph-memory-notes"]},
    },
    {
        "id": "10000000-0000-4000-8000-000000000103",
        "title": "竞品研究报告结构",
        "type": "synthesis",
        "source": "manual note",
        "status": "indexed",
        "metadata": {"chunk_count": 19, "sources": ["product-research-template"]},
    },
    {
        "id": "10000000-0000-4000-8000-000000000104",
        "title": "个人知识库图谱",
        "type": "overview",
        "source": "system",
        "status": "indexed",
        "metadata": {"chunk_count": 16, "sources": ["web-clip-ai-plugins", "langgraph-memory-notes"]},
    },
    {
        "id": "10000000-0000-4000-8000-000000000105",
        "title": "多来源引用策略",
        "type": "entity",
        "source": "manual note",
        "status": "indexed",
        "metadata": {"chunk_count": 21, "sources": ["product-research-template", "langgraph-memory-notes"]},
    },
    {
        "id": "10000000-0000-4000-8000-000000000106",
        "title": "向量检索评估",
        "type": "comparison",
        "source": "github",
        "status": "indexed",
        "metadata": {"chunk_count": 25, "sources": ["langgraph-memory-notes"]},
    },
]

# 演示页面之间的关联边
DEMO_LINKS = [
    (DEMO_PAGES[0]["id"], DEMO_PAGES[3]["id"], "wikilink"),
    (DEMO_PAGES[1]["id"], DEMO_PAGES[3]["id"], "wikilink"),
    (DEMO_PAGES[1]["id"], DEMO_PAGES[5]["id"], "wikilink"),
    (DEMO_PAGES[2]["id"], DEMO_PAGES[4]["id"], "wikilink"),
    (DEMO_PAGES[3]["id"], DEMO_PAGES[4]["id"], "wikilink"),
    (DEMO_PAGES[4]["id"], DEMO_PAGES[5]["id"], "wikilink"),
]


def _embedding_bytes(seed: int, dimension: int = 8) -> bytes:
    """生成固定伪随机 float32 字节，用于演示页面嵌入向量。"""
    values = [((seed + index) % 17) / 17 for index in range(dimension)]
    return struct.pack(f"<{dimension}f", *values)


def seed_demo_wiki(session: Session) -> None:
    """创建幂等的 WIKI 演示图谱数据，新环境可直接看到知识图谱。"""
    # 如果已有空间则跳过，保证幂等
    existing_count = session.scalar(select(func.count()).select_from(WikiSpace)) or 0
    if existing_count > 0:
        return

    logger.info("初始化 WIKI 演示图谱数据")
    space = WikiSpace(
        id=DEMO_SPACE_ID,
        name="产品研究 WIKI",
        description="竞品、趋势、网页剪藏与调研结论",
        category="web",
        tags=["前端", "设计", "开源"],
    )
    session.add(space)

    for index, page in enumerate(DEMO_PAGES):
        wiki_page = WikiPage(
            id=page["id"],
            space_id=DEMO_SPACE_ID,
            title=page["title"],
            type=page["type"],
            source=page["source"],
            status=page["status"],
            metadata_=page["metadata"],
        )
        session.add(wiki_page)
        # 为每个页面生成一个示例嵌入向量
        session.add(
            WikiPageEmbedding(
                page_id=page["id"],
                model="demo-float32",
                dimension=8,
                embedding=_embedding_bytes(index + 1),
            )
        )

    for source_id, target_id, relation_type in DEMO_LINKS:
        session.add(
            WikiLink(
                space_id=DEMO_SPACE_ID,
                source_page_id=source_id,
                target_page_id=target_id,
                relation_type=relation_type,
            )
        )

    session.flush()
