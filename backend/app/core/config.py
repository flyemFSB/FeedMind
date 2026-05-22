from functools import lru_cache

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
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/feedmind"
    encryption_key: str = ""


@lru_cache
def get_settings() -> Settings:
    """缓存配置对象，避免每次请求重复解析环境变量。"""
    s = Settings()
    s.database_url = s.database_url.replace("localhost", "127.0.0.1")
    return s
