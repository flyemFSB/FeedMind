from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentSettings(BaseSettings):
    """Agent 运行配置，供 Aegra 加载图时读取。"""

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    feedmind_model: str = ""
    feedmind_temperature: float = 0.2
    feedmind_system_prompt: str | None = None
    openai_compatible_api_base: str | None = None
    openai_compatible_api_key: str | None = None
    backend_api_url: str = "http://localhost:8000"


@lru_cache
def get_settings() -> AgentSettings:
    """缓存环境配置，避免每次模型调用重复解析 .env。"""
    return AgentSettings()
