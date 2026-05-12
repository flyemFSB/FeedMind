"""联网工具：DuckDuckGo 搜索 + Jina Reader 网页读取。"""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlparse

import httpx
from langchain_core.tools import tool
from loguru import logger

JINA_READER_URL = "https://r.jina.ai/"
MAX_FETCH_CHARS = 4096


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
) -> dict[str, Any]:
    """搜索互联网获取最新信息。当用户询问实时、最新或不在知识范围内的问题时使用。

    Args:
        query: 搜索关键词，建议使用中文或英文关键词。
        max_results: 返回结果数量（1-10，默认 5）。
        time_range: 时间范围。可选: "d"（一天内）、"w"（一周内）、"m"（一月内）、"y"（一年内），空字符串不限。
    """
    results = _ddg_search(query, max_results, time_range)
    if results:
        return _payload(query, "duckduckgo", results)
    return _payload(query, "none", [], message="未搜索到相关结果。")


@tool
def web_fetch(url: str, timeout: int = 10) -> dict[str, Any]:
    """读取网页正文。仅用于用户提供或 web_search 返回的完整 URL。

    Args:
        url: 完整网页 URL，必须包含 http:// 或 https://。
        timeout: Jina Reader 请求超时时间，默认 10 秒。
    """
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return _fetch_payload(url, "error", message="URL 无效，必须包含 http:// 或 https://。")

    try:
        response = httpx.post(
            JINA_READER_URL,
            headers={
                "Content-Type": "application/json",
                "X-Return-Format": "markdown",
                "X-Timeout": str(timeout),
            },
            json={"url": url},
            timeout=timeout,
        )
    except Exception as exc:
        logger.warning("Jina 读取失败 url={} error={}", url, exc)
        return _fetch_payload(url, "error", message=f"网页读取失败：{exc}")

    if response.status_code != 200:
        logger.warning("Jina 返回异常 url={} status={}", url, response.status_code)
        return _fetch_payload(
            url,
            "error",
            message=f"Jina 返回状态码 {response.status_code}。",
        )

    content = response.text.strip()
    if not content:
        return _fetch_payload(url, "error", message="网页没有返回可用内容。")

    return _fetch_payload(url, "jina", content=content[:MAX_FETCH_CHARS])


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


def _fetch_summary(content: str) -> str:
    return content[:1000]


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


def _fetch_payload(
    url: str,
    provider: str,
    content: str = "",
    message: str = "",
) -> dict[str, Any]:
    return {
        "url": url,
        "provider": provider,
        "content": content,
        "summary": message or _fetch_summary(content),
    }
