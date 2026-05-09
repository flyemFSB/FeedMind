from typing import Generic, TypeVar

from pydantic import BaseModel, Field

DataT = TypeVar("DataT")


class ApiError(BaseModel):
    """统一错误结构，便于前端按 code 和 message 展示失败原因。"""

    code: str
    message: str
    details: dict[str, object] = Field(default_factory=dict)


class ApiEnvelope(BaseModel, Generic[DataT]):
    """统一响应外壳，成功时写 data，失败时写 error。"""

    data: DataT | None = None
    error: ApiError | None = None
