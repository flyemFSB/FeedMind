from datetime import datetime
from zoneinfo import ZoneInfo

from langchain.agents.middleware import dynamic_prompt
from langchain.agents.middleware.types import ModelRequest

from feedmind.config import get_settings
from feedmind.prompts import DEFAULT_SYSTEM_PROMPT

TIMEZONE = "Asia/Shanghai"


def _runtime_context() -> str:
    now = datetime.now(ZoneInfo(TIMEZONE))
    return (
        f"date={now:%Y-%m-%d}。\n"
        "搜索：相对日期按 date 解析；不要给 query 自动加年份，除非用户明确年份或说“今年/本年”。"
    )


@dynamic_prompt
def dynamic_system_prompt(request: ModelRequest) -> str:
    """Append compact runtime context without bloating the static prompt."""
    settings = get_settings()
    base_prompt = settings.feedmind_system_prompt or DEFAULT_SYSTEM_PROMPT
    return f"{base_prompt.rstrip()}\n\n{_runtime_context()}"
