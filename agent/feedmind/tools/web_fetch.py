"""Web Fetch Tool - Fetch web page content using Jina AI Reader with readability extraction."""

import os

import httpx
from langchain_core.tools import tool
from loguru import logger

from feedmind.utils.readability import ReadabilityExtractor

readability_extractor = ReadabilityExtractor()
_api_key_warned = False


class JinaClient:
    def crawl(self, url: str, return_format: str = "html", timeout: int = 10) -> str:
        global _api_key_warned
        headers = {
            "Content-Type": "application/json",
            "X-Return-Format": return_format,
            "X-Timeout": str(timeout),
        }
        if os.getenv("JINA_API_KEY"):
            headers["Authorization"] = f"Bearer {os.getenv('JINA_API_KEY')}"
        elif not _api_key_warned:
            _api_key_warned = True
            logger.warning("Jina API key is not set. Provide your own key to access a higher rate limit. See https://jina.ai/reader for more information.")
        data = {"url": url}
        try:
            with httpx.Client() as client:
                response = client.post("https://r.jina.ai/", headers=headers, json=data, timeout=timeout)

            if response.status_code != 200:
                error_message = f"Jina API returned status {response.status_code}: {response.text}"
                logger.error(error_message)
                return f"Error: {error_message}"

            if not response.text or not response.text.strip():
                error_message = "Jina API returned empty response"
                logger.error(error_message)
                return f"Error: {error_message}"

            return response.text
        except Exception as e:
            error_message = f"Request to Jina API failed: {str(e)}"
            logger.exception(error_message)
            return f"Error: {error_message}"


@tool("web_fetch", parse_docstring=True)
def web_fetch(url: str) -> str:
    """Fetch the contents of a web page at a given URL.
    Only fetch EXACT URLs that have been provided directly by the user or have been returned in results from the web_search and web_fetch tools.
    This tool can NOT access content that requires authentication, such as private Google Docs or pages behind login walls.
    Do NOT add www. to URLs that do NOT have them.
    URLs must include the schema: https://example.com is a valid URL while example.com is an invalid URL.

    Args:
        url: The URL to fetch the contents of.
    """
    jina_client = JinaClient()
    timeout = 10
    html_content = jina_client.crawl(url, return_format="html", timeout=timeout)
    if isinstance(html_content, str) and html_content.startswith("Error:"):
        return html_content
    article = readability_extractor.extract_article(html_content)
    return article.to_markdown()[:4096]
