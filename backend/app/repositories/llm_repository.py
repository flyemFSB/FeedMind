from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import LLM


class LLMRepository:
    """封装模型配置相关的数据库访问。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def list_llms(self) -> list[LLM]:
        """按创建顺序读取全部模型配置。"""
        return list(self.session.scalars(select(LLM).order_by(LLM.id.asc())).all())

    def get_llm(self, model_id: int) -> LLM | None:
        """按 ID 读取单个模型配置。"""
        return self.session.get(LLM, model_id)

    def create_llm(
        self,
        *,
        provider: str,
        model_name: str,
        base_url: str,
        encrypted_api_key: str,
    ) -> LLM:
        """创建模型配置并 flush，便于上层拿到主键和唯一约束错误。"""
        model = LLM(
            provider=provider,
            model_name=model_name,
            base_url=base_url,
            encrypted_api_key=encrypted_api_key,
        )
        self.session.add(model)
        self.session.flush()
        return model

    def update_llm(
        self,
        model: LLM,
        *,
        provider: str,
        model_name: str,
        base_url: str,
        encrypted_api_key: str | None = None,
    ) -> LLM:
        """更新已有模型配置；密钥为 None 时保持原值。"""
        model.provider = provider
        model.model_name = model_name
        model.base_url = base_url
        if encrypted_api_key is not None:
            model.encrypted_api_key = encrypted_api_key
        self.session.flush()
        return model

    def delete_llm(self, model: LLM) -> None:
        """删除模型配置。"""
        self.session.delete(model)

    def get_selected_id(self) -> int | None:
        """读取当前选中模型 ID。"""
        return self.session.scalar(
            select(LLM.id).where(LLM.is_selected == True).limit(1)
        )

    def clear_selected(self) -> None:
        """清除所有模型的选中标记。"""
        self.session.execute(update(LLM).values(is_selected=False))

    def set_selected(self, model: LLM) -> None:
        """设置指定模型为选中状态。"""
        model.is_selected = True
        self.session.flush()
