from langchain.agents import create_agent
from langchain_core.runnables import ConfigurableField
from loguru import logger

from feedmind.config import get_settings
from feedmind.model import FeedMindResponsesModel
from feedmind.prompts import DEFAULT_SYSTEM_PROMPT


def build_agent():
    """构建可被 Aegra 加载的 LangChain Agent。"""
    settings = get_settings()
    system_prompt = settings.feedmind_system_prompt or DEFAULT_SYSTEM_PROMPT
    logger.info("开始构建 FeedMind Agent default_model={}", settings.feedmind_model or "<empty>")

    model = FeedMindResponsesModel(
        model=settings.feedmind_model,
        backend_api_url=settings.backend_api_url,
        api_base=settings.openai_compatible_api_base,
        api_key=settings.openai_compatible_api_key,
        temperature=settings.feedmind_temperature,
    ).configurable_fields(
        model=ConfigurableField(
            id="model",
            name="Model configuration",
            description="Model configuration id selected by the UI.",
        )
    )

    # 暂不挂载工具，保持对话链路稳定。
    return create_agent(
        model=model,
        tools=[],
        system_prompt=system_prompt,
    )


# Aegra 直接加载该 runnable。
# 模型由 config["configurable"]["model"] 动态覆盖。
agent = build_agent()
