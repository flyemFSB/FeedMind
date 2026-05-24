from fastapi import APIRouter, HTTPException, status

from app.schemas.envelope import ApiEnvelope
from app.schemas.llm import (
    LLMModelCreate,
    LLMModelRead,
    LLMModelRuntimeRead,
    LLMModelUpdate,
    SelectedModelRead,
    SelectedModelUpdate,
)
from app.services.llm_model_service import (
    LLMModelService,
    ModelConfigDuplicateError,
    ModelConfigNotFoundError,
    SelectedModelNotFoundError,
)

router = APIRouter(prefix="/llms", tags=["llms"])
llm_model_service = LLMModelService()


@router.get("", response_model=ApiEnvelope[list[LLMModelRead]])
def list_llms() -> ApiEnvelope[list[LLMModelRead]]:
    """返回所有模型配置。"""
    return ApiEnvelope(data=llm_model_service.list_models())


@router.post("", response_model=ApiEnvelope[LLMModelRead], status_code=status.HTTP_201_CREATED)
def create_llm(payload: LLMModelCreate) -> ApiEnvelope[LLMModelRead]:
    """创建新的模型配置。"""
    try:
        return ApiEnvelope(data=llm_model_service.create_llm_model(payload))
    except ModelConfigDuplicateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.detail) from exc


@router.put("/{model_id:int}", response_model=ApiEnvelope[LLMModelRead])
def update_llm(model_id: int, payload: LLMModelUpdate) -> ApiEnvelope[LLMModelRead]:
    """更新模型配置。"""
    try:
        return ApiEnvelope(data=llm_model_service.update_llm_model(model_id, payload))
    except ModelConfigNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail) from exc
    except ModelConfigDuplicateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.detail) from exc


@router.delete("/{model_id:int}", response_model=ApiEnvelope[dict[str, bool]])
def delete_llm(model_id: int) -> ApiEnvelope[dict[str, bool]]:
    """删除指定模型配置。"""
    try:
        return ApiEnvelope(data=llm_model_service.delete_llm_model(model_id))
    except ModelConfigNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail) from exc


@router.get("/selected", response_model=ApiEnvelope[SelectedModelRead])
def get_selected_llm() -> ApiEnvelope[SelectedModelRead]:
    """读取当前选中的默认模型。"""
    try:
        return ApiEnvelope(data=llm_model_service.get_selected_llm_model())
    except SelectedModelNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail) from exc


@router.get("/{model_id:int}/runtime", response_model=ApiEnvelope[LLMModelRuntimeRead])
def get_llm_runtime(model_id: int) -> ApiEnvelope[LLMModelRuntimeRead]:
    """返回 Agent 调用 LLM 所需的运行时配置。"""
    try:
        return ApiEnvelope(data=llm_model_service.get_llm_model_runtime(model_id))
    except ModelConfigNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail) from exc


@router.put("/selected", response_model=ApiEnvelope[SelectedModelRead])
def set_selected_llm(payload: SelectedModelUpdate) -> ApiEnvelope[SelectedModelRead]:
    """设置默认模型。"""
    try:
        return ApiEnvelope(data=llm_model_service.set_selected_llm_model(payload))
    except ModelConfigNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail) from exc
