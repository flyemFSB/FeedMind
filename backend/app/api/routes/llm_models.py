from fastapi import APIRouter, HTTPException, status
from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.core.crypto import decrypt_value, encrypt_value
from app.db import get_session
from app.models import ModelConfig
from app.schemas.envelope import ApiEnvelope
from app.schemas.llm_model import (
    LLMModelCreate,
    LLMModelRead,
    LLMModelRuntimeRead,
    LLMModelUpdate,
    SelectedModelRead,
    SelectedModelUpdate,
)

router = APIRouter(prefix="/models", tags=["models"])


def _to_model_read(row: ModelConfig) -> LLMModelRead:
    """把 ORM 对象转换为前端可见的模型配置。"""
    return LLMModelRead(
        id=row.id,
        provider=row.provider,
        model_name=row.model_name,
        base_url=row.base_url,
        has_api_key=bool(row.encrypted_api_key),
        is_selected=row.is_selected,
    )


@router.get("", response_model=ApiEnvelope[list[LLMModelRead]])
async def list_llm_models() -> ApiEnvelope[list[LLMModelRead]]:
    """按创建顺序返回所有模型配置。"""
    with get_session() as session:
        rows = session.scalars(select(ModelConfig).order_by(ModelConfig.id.asc())).all()

    logger.debug("已读取模型配置列表 count={}", len(rows))
    return ApiEnvelope(data=[_to_model_read(row) for row in rows])


@router.post("", response_model=ApiEnvelope[LLMModelRead], status_code=status.HTTP_201_CREATED)
async def create_llm_model(payload: LLMModelCreate) -> ApiEnvelope[LLMModelRead]:
    """创建新的模型配置，api_key 加密写入不回显。"""
    with get_session() as session:
        encrypted_key = encrypt_value(payload.api_key) if payload.api_key else ""
        model = ModelConfig(
            provider=payload.provider,
            model_name=payload.model_name,
            base_url=payload.base_url,
            encrypted_api_key=encrypted_key,
        )
        session.add(model)
        try:
            session.flush()
        except IntegrityError as exc:
            logger.warning("创建模型配置失败，模型名称重复 model_name={}", payload.model_name)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="model_name already exists",
            ) from exc

    logger.info("已创建模型配置 id={} model_name={}", model.id, model.model_name)
    return ApiEnvelope(data=_to_model_read(model))


@router.put("/{model_id:int}", response_model=ApiEnvelope[LLMModelRead])
async def update_llm_model(model_id: int, payload: LLMModelUpdate) -> ApiEnvelope[LLMModelRead]:
    """更新模型配置；空 api_key 表示保留原密钥。"""
    with get_session() as session:
        model = session.get(ModelConfig, model_id)
        if model is None:
            logger.warning("更新模型配置失败，模型不存在 id={}", model_id)
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="model not found")

        model.provider = payload.provider
        model.model_name = payload.model_name
        model.base_url = payload.base_url
        if payload.api_key:
            model.encrypted_api_key = encrypt_value(payload.api_key)
        try:
            session.flush()
        except IntegrityError as exc:
            logger.warning("更新模型配置失败，模型名称重复 id={} model_name={}", model_id, payload.model_name)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="model_name already exists",
            ) from exc

    logger.info("已更新模型配置 id={} model_name={}", model.id, model.model_name)
    return ApiEnvelope(data=_to_model_read(model))


@router.delete("/{model_id:int}", response_model=ApiEnvelope[dict[str, bool]])
async def delete_llm_model(model_id: int) -> ApiEnvelope[dict[str, bool]]:
    """删除指定模型配置。"""
    with get_session() as session:
        model = session.get(ModelConfig, model_id)
        if model is None:
            logger.warning("删除模型配置失败，模型不存在 id={}", model_id)
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="model not found")
        session.delete(model)

    logger.info("已删除模型配置 id={}", model_id)
    return ApiEnvelope(data={"deleted": True})


@router.get("/selected", response_model=ApiEnvelope[SelectedModelRead])
async def get_selected_llm_model() -> ApiEnvelope[SelectedModelRead]:
    """读取当前选中的默认模型。"""
    with get_session() as session:
        model_id = session.scalar(
            select(ModelConfig.id).where(ModelConfig.is_selected == True).limit(1)
        )

    if model_id is None:
        logger.warning("读取默认模型失败，暂无模型配置")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="selected model not found")

    return ApiEnvelope(data=SelectedModelRead(id=model_id))


@router.get("/runtime", response_model=ApiEnvelope[LLMModelRuntimeRead])
async def get_llm_model_runtime(id: int) -> ApiEnvelope[LLMModelRuntimeRead]:
    """给 Agent 返回实际调用 LLM 所需的运行时配置（解密密钥）。"""
    with get_session() as session:
        model = session.get(ModelConfig, id)

    if model is None:
        logger.warning("读取模型运行配置失败，模型不存在 id={}", id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="model not found")

    api_key = decrypt_value(model.encrypted_api_key) if model.encrypted_api_key else ""

    logger.debug("已读取模型运行配置 id={} model_name={}", model.id, model.model_name)
    return ApiEnvelope(
        data=LLMModelRuntimeRead(
            model_name=model.model_name,
            base_url=model.base_url,
            api_key=api_key,
        )
    )


@router.put("/selected", response_model=ApiEnvelope[SelectedModelRead])
async def set_selected_llm_model(payload: SelectedModelUpdate) -> ApiEnvelope[SelectedModelRead]:
    """设置默认模型，清除其他模型的选中标记。"""
    with get_session() as session:
        model = session.get(ModelConfig, payload.id)
        if model is None:
            logger.warning("设置默认模型失败，模型不存在 id={}", payload.id)
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="model not found")

        # 清除所有模型的选中标记
        session.execute(update(ModelConfig).values(is_selected=False))
        model.is_selected = True
        session.flush()

    logger.info("已设置默认模型 id={}", payload.id)
    return ApiEnvelope(data=SelectedModelRead(id=payload.id))
