from loguru import logger
from sqlalchemy.exc import IntegrityError

from app.core.crypto import decrypt_value, encrypt_value
from app.db import get_session
from app.models import ModelConfig
from app.repositories.model_config_repository import ModelConfigRepository
from app.schemas.llm_model import (
    LLMModelCreate,
    LLMModelRead,
    LLMModelRuntimeRead,
    LLMModelUpdate,
    SelectedModelRead,
    SelectedModelUpdate,
)


class ModelConfigDuplicateError(Exception):
    """模型名称已存在。"""

    detail = "model_name already exists"


class ModelConfigNotFoundError(Exception):
    """请求的模型配置不存在。"""

    detail = "model not found"


class SelectedModelNotFoundError(Exception):
    """当前没有选中的模型配置。"""

    detail = "selected model not found"


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


class LLMModelService:
    """承载模型配置业务规则、事务边界和密钥加解密。"""

    def list_models(self) -> list[LLMModelRead]:
        """返回全部模型配置。"""
        with get_session() as session:
            repository = ModelConfigRepository(session)
            rows = repository.list_model_configs()

        logger.debug("已读取模型配置列表 count={}", len(rows))
        return [_to_model_read(row) for row in rows]

    def create_llm_model(self, payload: LLMModelCreate) -> LLMModelRead:
        """创建模型配置，api_key 加密写入且不回显。"""
        encrypted_key = encrypt_value(payload.api_key) if payload.api_key else ""
        with get_session() as session:
            repository = ModelConfigRepository(session)
            try:
                model = repository.create_model_config(
                    provider=payload.provider,
                    model_name=payload.model_name,
                    base_url=payload.base_url,
                    encrypted_api_key=encrypted_key,
                )
            except IntegrityError as exc:
                logger.warning("创建模型配置失败，模型名称重复 model_name={}", payload.model_name)
                raise ModelConfigDuplicateError from exc

            result = _to_model_read(model)

        logger.info("已创建模型配置 id={} model_name={}", result.id, result.model_name)
        return result

    def update_llm_model(self, model_id: int, payload: LLMModelUpdate) -> LLMModelRead:
        """更新模型配置；空 api_key 表示保留原密钥。"""
        encrypted_key = encrypt_value(payload.api_key) if payload.api_key else None
        with get_session() as session:
            repository = ModelConfigRepository(session)
            model = repository.get_model_config(model_id)
            if model is None:
                logger.warning("更新模型配置失败，模型不存在 id={}", model_id)
                raise ModelConfigNotFoundError

            try:
                updated = repository.update_model_config(
                    model,
                    provider=payload.provider,
                    model_name=payload.model_name,
                    base_url=payload.base_url,
                    encrypted_api_key=encrypted_key,
                )
            except IntegrityError as exc:
                logger.warning(
                    "更新模型配置失败，模型名称重复 id={} model_name={}",
                    model_id,
                    payload.model_name,
                )
                raise ModelConfigDuplicateError from exc

            result = _to_model_read(updated)

        logger.info("已更新模型配置 id={} model_name={}", result.id, result.model_name)
        return result

    def delete_llm_model(self, model_id: int) -> dict[str, bool]:
        """删除指定模型配置。"""
        with get_session() as session:
            repository = ModelConfigRepository(session)
            model = repository.get_model_config(model_id)
            if model is None:
                logger.warning("删除模型配置失败，模型不存在 id={}", model_id)
                raise ModelConfigNotFoundError
            repository.delete_model_config(model)

        logger.info("已删除模型配置 id={}", model_id)
        return {"deleted": True}

    def get_selected_llm_model(self) -> SelectedModelRead:
        """读取当前选中的默认模型。"""
        with get_session() as session:
            repository = ModelConfigRepository(session)
            model_id = repository.get_selected_model_id()

        if model_id is None:
            logger.warning("读取默认模型失败，暂无模型配置")
            raise SelectedModelNotFoundError

        return SelectedModelRead(id=model_id)

    def get_llm_model_runtime(self, model_id: int) -> LLMModelRuntimeRead:
        """读取 Agent 调用 LLM 所需的运行时配置，并解密密钥。"""
        with get_session() as session:
            repository = ModelConfigRepository(session)
            model = repository.get_model_config(model_id)
            if model is None:
                logger.warning("读取模型运行配置失败，模型不存在 id={}", model_id)
                raise ModelConfigNotFoundError

            api_key = decrypt_value(model.encrypted_api_key) if model.encrypted_api_key else ""
            result = LLMModelRuntimeRead(
                model_name=model.model_name,
                base_url=model.base_url,
                api_key=api_key,
            )

        logger.debug("已读取模型运行配置 id={} model_name={}", model_id, result.model_name)
        return result

    def set_selected_llm_model(self, payload: SelectedModelUpdate) -> SelectedModelRead:
        """设置默认模型，清除其他模型的选中标记。"""
        with get_session() as session:
            repository = ModelConfigRepository(session)
            model = repository.get_model_config(payload.id)
            if model is None:
                logger.warning("设置默认模型失败，模型不存在 id={}", payload.id)
                raise ModelConfigNotFoundError

            repository.clear_selected_models()
            repository.set_model_selected(model)

        logger.info("已设置默认模型 id={}", payload.id)
        return SelectedModelRead(id=payload.id)
