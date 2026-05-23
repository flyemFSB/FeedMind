from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.envelope import ApiEnvelope, ApiError


def _error_response(status_code: int, code: str, message: str, details: dict[str, object] | None = None) -> JSONResponse:
    """按统一响应外壳返回错误，避免不同异常泄露不同结构。"""
    envelope = ApiEnvelope(
        data=None,
        error=ApiError(code=code, message=message, details=details or {}),
    )
    return JSONResponse(status_code=status_code, content=envelope.model_dump())


def register_exception_handlers(app: FastAPI) -> None:
    """注册全局异常映射，保持 API 错误格式稳定。"""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        logger.warning(
            "HTTP 请求失败 method={} path={} status={} detail={}",
            request.method,
            request.url.path,
            exc.status_code,
            exc.detail,
        )
        message = exc.detail if isinstance(exc.detail, str) else "请求处理失败"
        return _error_response(exc.status_code, "HTTP_ERROR", message)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        logger.warning(
            "请求参数校验失败 method={} path={} errors={}",
            request.method,
            request.url.path,
            exc.errors(),
        )
        return _error_response(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            "请求参数校验失败",
            {"errors": exc.errors()},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "未处理异常 method={} path={}",
            request.method,
            request.url.path,
        )
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "INTERNAL_SERVER_ERROR",
            "服务器暂时不可用",
        )
