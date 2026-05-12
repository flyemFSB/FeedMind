import time

from langchain.agents.middleware import wrap_tool_call
from langchain_core.messages import ToolMessage
from loguru import logger


@wrap_tool_call
async def handle_tool_errors(request, handler):
    """记录工具调用，并把异常转成模型可处理的 ToolMessage。"""
    tool_call = request.tool_call
    tool_name = tool_call.get("name", "<unknown>")
    started_at = time.monotonic()

    logger.info("工具调用开始 tool={} args={}", tool_name, tool_call.get("args", {}))
    try:
        result = await handler(request)
    except Exception as exc:
        logger.exception("工具调用失败 tool={} elapsed_ms={:.0f}", tool_name, _elapsed_ms(started_at))
        return ToolMessage(
            content=f"工具 {tool_name} 调用失败：{exc}",
            tool_call_id=tool_call["id"],
            name=tool_name,
            status="error",
        )

    logger.info("工具调用完成 tool={} elapsed_ms={:.0f}", tool_name, _elapsed_ms(started_at))
    return result


def _elapsed_ms(started_at: float) -> float:
    return (time.monotonic() - started_at) * 1000
