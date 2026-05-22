from typing import Any, Iterator

import httpx
from langchain_core.callbacks.manager import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGenerationChunk, ChatResult
from langchain_openai import ChatOpenAI
from langchain_openai.chat_models import base as openai_chat_base
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type


def _extract_reasoning_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, list):
        return "".join(_extract_reasoning_text(item) for item in payload)
    if not isinstance(payload, dict):
        return ""

    for key in (
        "reasoning_content",
        "reasoning",
        "reasoning_details",
        "summary",
        "thinking",
        "text",
    ):
        value = payload.get(key)
        if isinstance(value, str):
            return value
        if isinstance(value, (dict, list)):
            text = _extract_reasoning_text(value)
            if text:
                return text
    return ""


def _patch_openai_compatible_reasoning() -> None:
    """Preserve reasoning fields emitted by OpenAI-compatible chat endpoints."""

    if getattr(openai_chat_base, "_feedmind_reasoning_patch", False):
        return

    original_convert_delta_to_message_chunk = openai_chat_base._convert_delta_to_message_chunk
    original_convert_dict_to_message = openai_chat_base._convert_dict_to_message

    def convert_delta_to_message_chunk(_dict: Any, default_class: Any) -> Any:
        chunk = original_convert_delta_to_message_chunk(_dict, default_class)
        reasoning_content = _extract_reasoning_text(_dict)
        if reasoning_content and isinstance(chunk, AIMessageChunk):
            chunk.additional_kwargs["reasoning_content"] = reasoning_content
        return chunk

    def convert_dict_to_message(_dict: Any) -> BaseMessage:
        message = original_convert_dict_to_message(_dict)
        reasoning_content = _extract_reasoning_text(_dict)
        if reasoning_content and isinstance(message, AIMessage):
            message.additional_kwargs["reasoning_content"] = reasoning_content
        return message

    openai_chat_base._convert_delta_to_message_chunk = convert_delta_to_message_chunk
    openai_chat_base._convert_dict_to_message = convert_dict_to_message
    openai_chat_base._feedmind_reasoning_patch = True


_patch_openai_compatible_reasoning()


class FeedMindResponsesModel(BaseChatModel):
    """通过 Backend 模型配置表动态创建 ChatOpenAI 客户端。"""

    model: str
    temperature: float = 0.2
    backend_api_url: str = "http://localhost:8000"
    api_base: str | None = None
    api_key: str | None = None

    # 按 (model_name, base_url) 缓存 ChatOpenAI 实例，避免每次调用重建。
    _client_cache: dict[str, ChatOpenAI] = {}
    # bind_tools 存储（create_agent 传入 tools 时设置）
    _bound_tools: list = []
    _bound_tool_kwargs: dict = {}

    @property
    def _llm_type(self) -> str:
        return "feedmind-responses"

    # ── bind_tools（create_agent 传入 tools 时调用） ────────────

    def bind_tools(self, tools, **kwargs):
        """绑定工具，调用时委托给 ChatOpenAI。"""
        self._bound_tools = list(tools)
        self._bound_tool_kwargs = kwargs
        return self

    # ── 运行时配置 ────────────────────────────────────────────

    def _resolve_model_id(self) -> str:
        """获取当前模型 ID。

        优先级:
          1. self.model（来自 .env 或 agent.py 构造时传入）
          2. get_config().configurable.model（Agent API 在 invoke 时传入）
        """
        if self.model:
            return self.model
        try:
            from langgraph.config import get_config

            cfg = get_config()
            model_id = cfg.get("configurable", {}).get("model", "")
            if model_id:
                return model_id
        except RuntimeError:
            pass  # 不在 LangGraph 执行上下文中
        return ""

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException, httpx.ConnectError)),
    )
    def _resolve_runtime_config(self) -> dict[str, str]:
        """从 Backend 读取当前模型的 base_url、api_key 和真实模型名。带重试。"""
        model_id = self._resolve_model_id()
        if not model_id:
            logger.error("模型调用失败，尚未选择模型")
            raise RuntimeError("No model is selected. Add and select a model in model settings first.")

        params = {"id": model_id}
        url = f"{self.backend_api_url.rstrip('/')}/api/models/runtime"
        logger.debug("请求模型运行配置 model_id={} url={}", model_id, url)

        with httpx.Client(timeout=3.0) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()

        data = payload.get("data")
        if not isinstance(data, dict):
            logger.error("模型运行配置响应格式无效 model_id={}", self.model)
            raise RuntimeError("Backend returned an invalid model runtime response.")
        logger.debug("模型运行配置读取完成 model_id={} model_name={}", self.model, data.get("model_name"))
        return data

    def _client_cache_key(self, runtime_config: dict) -> str:
        return f"{runtime_config.get('model_name', self.model)}|{runtime_config.get('base_url', '')}"

    def _build_client_kwargs(self, runtime_config: dict) -> dict[str, Any]:
        """构造 ChatOpenAI 初始化参数。"""
        kwargs: dict[str, Any] = {
            "model": runtime_config.get("model_name") or self.model,
            "temperature": self.temperature,
        }
        base_url = self._normalize_base_url(runtime_config.get("base_url") or self.api_base)
        api_key = runtime_config.get("api_key") or self.api_key
        if base_url:
            kwargs["base_url"] = base_url
        if api_key:
            kwargs["api_key"] = api_key
        return kwargs

    def _get_or_create_client(self, runtime_config: dict) -> ChatOpenAI:
        """缓存或创建 ChatOpenAI 实例（不含 tool binding）。"""
        cache_key = self._client_cache_key(runtime_config)
        cached = self._client_cache.get(cache_key)
        if cached is not None:
            return cached

        client = ChatOpenAI(**self._build_client_kwargs(runtime_config))
        self._client_cache[cache_key] = client
        return client

    def _get_bound_client_and_kwargs(self, runtime_config: dict) -> tuple[ChatOpenAI, dict[str, Any]]:
        client = self._get_or_create_client(runtime_config)
        if not self._bound_tools:
            return client, {}

        binding = client.bind_tools(self._bound_tools, **self._bound_tool_kwargs)
        return binding.bound, dict(binding.kwargs)

    def _normalize_base_url(self, base_url: str | None) -> str | None:
        if not base_url:
            return None
        base_url = base_url.rstrip("/")
        if base_url.startswith(("http://", "https://")):
            return base_url
        return f"https://{base_url}"

    # ── 模型调用（_generate / _stream） ────────────────────────

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        """非流式调用。有工具时委托给 ChatOpenAI.bind_tools().invoke()。"""
        logger.info("开始非流式模型调用 message_count={}", len(messages))
        runtime_config = self._resolve_runtime_config()

        client, bound_kwargs = self._get_bound_client_and_kwargs(runtime_config)
        return client._generate(
            messages,
            stop=stop,
            run_manager=run_manager,
            **{**bound_kwargs, **kwargs},
        )

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        """流式调用。有工具时委托给 ChatOpenAI.bind_tools().stream()。"""
        logger.info("开始流式模型调用 message_count={}", len(messages))
        runtime_config = self._resolve_runtime_config()

        client, bound_kwargs = self._get_bound_client_and_kwargs(runtime_config)
        yield from client._stream(
            messages,
            stop=stop,
            run_manager=run_manager,
            **{**bound_kwargs, **kwargs},
        )
