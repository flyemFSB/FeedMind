"""
联网搜索工具：Tavily（需 API Key）→ DuckDuckGo（零配置回退）。
"""

from __future__ import annotations

import time
from typing import Any

from langchain_core.tools import tool
from loguru import logger

from feedmind.config import get_settings

_tavily_client: Any = None


def _get_tavily_client():
    global _tavily_client
    if _tavily_client is None:
        from tavily import TavilyClient

        _tavily_client = TavilyClient(api_key=get_settings().tavily_api_key)
    return _tavily_client


def _tavily_search(
    query: str,
    max_results: int = 5,
    time_range: str = "",
    search_depth: str = "basic",
) -> tuple[list[dict[str, Any]], str]:
    """Tavily 搜索，返回 (results, answer) 元组。"""
    try:
        client = _get_tavily_client()

        tavily_time = {"d": "day", "w": "week", "m": "month", "y": "year"}.get(time_range)

        kwargs: dict[str, Any] = {
            "query": query,
            "max_results": max_results,
            "search_depth": search_depth,
            "include_answer": True,
            "include_raw_content": "markdown" if search_depth == "advanced" else False,
            "timeout": 30,
        }
        if tavily_time:
            kwargs["time_range"] = tavily_time

        response = client.search(**kwargs)

        results = []
        for item in response.get("results", []):
            entry: dict[str, Any] = {
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "content": item.get("content", ""),
                "score": item.get("score", 0),
            }
            if item.get("raw_content"):
                entry["raw_content"] = item["raw_content"][:500]
            if entry["score"] >= 0.5:
                results.append(entry)

        answer = response.get("answer", "")

        logger.info("Tavily 搜索成功 query={} results={}", query, len(results))
        return results, answer

    except Exception as e:
        logger.warning("Tavily 搜索失败，将回退 DuckDuckGo: {}", e)
        return [], ""


def _ddg_search(
    query: str,
    max_results: int = 5,
    time_range: str = "",
) -> list[dict[str, str]]:
    """DuckDuckGo 搜索，含指数退避重试。"""
    from duckduckgo_search import DDGS

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
    }
    timelimit = time_range if time_range in ("d", "w", "m", "y") else None

    for attempt in range(3):
        try:
            with DDGS(headers=headers, timeout=15) as ddgs:
                raw = list(
                    ddgs.text(
                        query,
                        region="wt-wt",
                        safesearch="moderate",
                        timelimit=timelimit,
                        max_results=max_results,
                    )
                )

            results = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "content": r.get("body", ""),
                }
                for r in raw
            ]
            logger.info("DDG 搜索成功 query={} results={}", query, len(results))
            return results

        except Exception as e:
            logger.warning("DDG 搜索第 {} 次失败: {}", attempt + 1, e)
            if attempt == 2:
                return []
            time.sleep(2 ** (attempt + 1) if "Ratelimit" in type(e).__name__ else 1)

    return []


@tool
def web_search(
    query: str,
    max_results: int = 5,
    time_range: str = "",
    search_depth: str = "basic",
) -> dict[str, Any]:
    """搜索互联网获取最新信息。当用户询问实时、最新或不在知识范围内的问题时使用。

    Args:
        query: 搜索关键词，建议使用中文或英文关键词。
        max_results: 返回结果数量（1-10，默认 5）。
        time_range: 时间范围。可选: "d"（一天内）、"w"（一周内）、"m"（一月内）、"y"（一年内），空字符串不限。
        search_depth: 搜索深度。"basic"（标准）或 "advanced"（深度，含原始内容，仅 Tavily 生效）。
    """
    settings = get_settings()

    if settings.tavily_api_key:
        results, answer = _tavily_search(query, max_results, time_range, search_depth)
        if results:
            return _payload(query, "tavily", results, answer, has_score=True)

    results = _ddg_search(query, max_results, time_range)
    if results:
        return _payload(query, "duckduckgo", results)
    return _payload(query, "none", [], message="未搜索到相关结果。")


def _fmt(
    results: list[dict[str, Any]],
    answer: str = "",
    has_score: bool = False,
) -> str:
    """统一格式化搜索结果。"""
    parts: list[str] = []

    if answer:
        parts.append(f"[AI 摘要] {answer}\n")

    parts.append(f"找到 {len(results)} 条搜索结果：\n")
    for i, r in enumerate(results, 1):
        parts.append(f"{i}. {r['title']}")
        parts.append(f"   链接: {r['url']}")
        content = r.get("raw_content") or r.get("content", "")
        if content:
            parts.append(f"   摘要: {content[:200]}")
        if has_score and r.get("score", 0) > 0:
            parts.append(f"   相关性: {r['score']:.0%}")
        parts.append("")

    return "\n".join(parts)


def _payload(
    query: str,
    provider: str,
    results: list[dict[str, Any]],
    answer: str = "",
    has_score: bool = False,
    message: str = "",
) -> dict[str, Any]:
    """返回给模型和前端工具 UI 的统一结构。"""
    return {
        "query": query,
        "provider": provider,
        "answer": answer,
        "results": results,
        "result_count": len(results),
        "summary": message or _fmt(results, answer, has_score),
    }
