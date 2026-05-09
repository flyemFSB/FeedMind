from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """后端运行配置，优先读取项目根目录或当前目录的 .env。"""

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "FeedMind Backend"
    app_version: str = "0.1.0"
    backend_cors_origins: str = "http://localhost:3000"
    database_url: str = "postgresql+psycopg://feedmind:feedmind@localhost:5432/feedmind"
    encryption_key: str = ""

    @field_validator("backend_cors_origins")
    @classmethod
    def normalize_origins(cls, value: str) -> str:
        return value.strip()

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """缓存配置对象，避免每次请求重复解析环境变量。"""
    return Settings()
