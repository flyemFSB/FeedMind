from langchain.agents import create_agent
from loguru import logger

from feedmind.config import get_settings
from feedmind.middlewares import dynamic_system_prompt, handle_tool_errors
from feedmind.model import FeedMindResponsesModel
from feedmind.tools import web_fetch, web_search

try:
    from langfuse import Langfuse
    from langfuse.langchain import CallbackHandler

    Langfuse()
    _langfuse_handler = CallbackHandler(update_trace=True)
except Exception:
    _langfuse_handler = None


def build_agent():
    settings = get_settings()
    logger.info("开始构建 FeedMind Agent default_model={}", settings.feedmind_model or "<empty>")

    model = FeedMindResponsesModel(
        model=settings.feedmind_model,
        backend_api_url=settings.backend_api_url,
        api_base=settings.openai_compatible_api_base,
        api_key=settings.openai_compatible_api_key,
        temperature=settings.feedmind_temperature,
    )

    logger.info("联网工具已挂载：web_search=DDGS, web_fetch=Jina")

    agent = create_agent(
        model=model,
        tools=[web_search, web_fetch],
        middleware=[dynamic_system_prompt, handle_tool_errors],
    )

    if _langfuse_handler:
        agent = agent.with_config({"callbacks": [_langfuse_handler]})

    return agent

