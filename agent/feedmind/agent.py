from langchain.agents import create_agent
from loguru import logger

from feedmind.config import get_settings
from feedmind.middlewares import dynamic_system_prompt, handle_tool_errors
from feedmind.model import FeedMindResponsesModel
from feedmind.tools import web_fetch, web_search


def build_agent():
    """构建可被 Aegra 加载的 LangChain Agent。"""
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

    return create_agent(
        model=model,
        tools=[web_search, web_fetch],
        middleware=[dynamic_system_prompt, handle_tool_errors],
    )


# Aegra 直接加载该 runnable。
# 模型 ID 由 Aegra 通过 get_config().configurable.model 传入。
agent = build_agent()
