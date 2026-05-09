from typing import Any

import httpx
from langchain_core.callbacks.manager import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatResult
from langchain_openai import ChatOpenAI
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type


class FeedMindResponsesModel(BaseChatModel):
    """通过 Backend 模型配置表动态创建 ChatOpenAI 客户端。"""

    model: str
    temperature: float = 0.2
    backend_api_url: str = "http://localhost:8000"
    api_base: str | None = None
    api_key: str | None = None

    # 按 (model_name, base_url) 缓存 ChatOpenAI 实例，避免每次调用重建。
    _client_cache: dict[str, ChatOpenAI] = {}

    @property
    def _llm_type(self) -> str:
        """LangChain 用于标识自定义模型类型。"""
        return "feedmind-responses"

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException, httpx.ConnectError)),
    )
    def _resolve_runtime_config(self) -> dict[str, str]:
        """从 Backend 读取当前模型的 base_url、api_key 和真实模型名。带重试。"""
        if not self.model:
            logger.error("模型调用失败，尚未选择模型")
            raise RuntimeError("No model is selected. Add and select a model in model settings first.")

        params = {"id": self.model}
        url = f"{self.backend_api_url.rstrip('/')}/api/llm-models/runtime"
        logger.debug("请求模型运行配置 model_id={} url={}", self.model, url)

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
        """生成缓存键：模型名和 base_url 决定唯一客户端。"""
        return f"{runtime_config.get('model_name', self.model)}|{runtime_config.get('base_url', '')}"

    def _get_or_create_client(self, runtime_config: dict) -> ChatOpenAI:
        """缓存或创建 ChatOpenAI 实例。"""
        cache_key = self._client_cache_key(runtime_config)
        cached = self._client_cache.get(cache_key)
        if cached is not None:
            return cached

        client_kwargs: dict[str, Any] = {
            "model": runtime_config.get("model_name") or self.model,
            "temperature": self.temperature,
            "streaming": True,
            "use_responses_api": True,
            "output_version": "responses/v1",
        }

        base_url = self._normalize_base_url(runtime_config.get("base_url") or self.api_base)
        api_key = runtime_config.get("api_key") or self.api_key
        if base_url:
            client_kwargs["base_url"] = base_url
        if api_key:
            client_kwargs["api_key"] = api_key

        logger.debug(
            "创建聊天客户端 model={} has_base_url={} has_api_key={}",
            client_kwargs["model"],
            bool(base_url),
            bool(api_key),
        )
        client = ChatOpenAI(**client_kwargs)
        self._client_cache[cache_key] = client
        return client

    def _normalize_base_url(self, base_url: str | None) -> str | None:
        """允许用户省略 http/https 前缀，统一去除尾随斜杠。"""
        if not base_url:
            return None
        base_url = base_url.rstrip("/")
        if base_url.startswith(("http://", "https://")):
            return base_url
        return f"https://{base_url}"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        """非流式调用入口，主要供兼容场景使用。"""
        logger.info("开始非流式模型调用 message_count={}", len(messages))
        runtime_config = self._resolve_runtime_config()
        return self._get_or_create_client(runtime_config)._generate(
            messages,
            stop=stop,
            run_manager=run_manager,
            **kwargs,
        )

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ):
        """流式调用入口，assistant-ui 的主聊天链路会走这里。"""
        logger.info("开始流式模型调用 message_count={}", len(messages))
        runtime_config = self._resolve_runtime_config()
        yield from self._get_or_create_client(runtime_config)._stream(
            messages,
            stop=stop,
            run_manager=run_manager,
            **kwargs,
        )
