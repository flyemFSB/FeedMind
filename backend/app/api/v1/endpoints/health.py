from fastapi import APIRouter

from app.db import check_db_connection
from app.schemas.envelope import ApiEnvelope

router = APIRouter(tags=["health"])


@router.get("/health", response_model=ApiEnvelope[dict[str, str | bool]])
def health() -> ApiEnvelope[dict[str, str | bool]]:
    """返回服务健康状态，并用最小查询确认数据库可达。"""
    db_ok = check_db_connection()
    return ApiEnvelope(
        data={
            "status": "ok" if db_ok else "degraded",
            "database": db_ok,
        }
    )
