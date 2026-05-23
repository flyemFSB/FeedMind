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
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/feedmind"
    encryption_key: str = ""

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """统一本机数据库地址，避免 localhost 在不同环境解析不一致。"""
        return value.replace("localhost", "127.0.0.1")

    @property
    def is_production(self) -> bool:
        """判断是否运行在生产环境，用于启用更严格的启动门禁。"""
        return self.app_env.strip().lower() in {"prod", "production"}

    def validate_runtime(self) -> None:
        """校验当前环境能否安全启动应用。"""
        if self.is_production and not self.encryption_key.strip():
            raise RuntimeError("ENCRYPTION_KEY must be set in production.")


@lru_cache
def get_settings() -> Settings:
    """缓存配置对象，避免每次请求重复解析环境变量。"""
    return Settings()
