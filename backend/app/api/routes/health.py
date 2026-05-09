from fastapi import APIRouter

from app.db import check_db_connection
from app.schemas.envelope import ApiEnvelope

router = APIRouter(tags=["health"])


@router.get("/health", response_model=ApiEnvelope[dict[str, str | bool]])
async def health() -> ApiEnvelope[dict[str, str | bool]]:
    """用于容器和开发环境探活的轻量接口，同时检查数据库可达性。"""
    db_ok = check_db_connection()
    return ApiEnvelope(
        data={
            "status": "ok" if db_ok else "degraded",
            "database": db_ok,
        }
    )
