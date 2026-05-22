from app.models import WikiPage


def chunk_count(page: WikiPage) -> int:
    raw_value = page.metadata_.get("chunk_count", 0) if page.metadata_ else 0
    return raw_value if isinstance(raw_value, int) else 0


def page_sources(page: WikiPage) -> frozenset[str]:
    """提取页面的所有来源（主来源 + metadata 中额外来源列表）。"""
    sources: set[str] = set()
    if page.source:
        sources.add(page.source)
    raw_sources = page.metadata_.get("sources", []) if page.metadata_ else []
    if isinstance(raw_sources, list):
        sources.update(str(source) for source in raw_sources if str(source))
    return frozenset(sources)


def source_count(pages: list[WikiPage]) -> int:
    """统计页面集合中去重后的来源总数。"""
    all_sources: set[str] = set()
    for page in pages:
        all_sources.update(page_sources(page))
    return len(all_sources)
