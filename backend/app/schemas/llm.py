from pydantic import BaseModel, ConfigDict, Field


class LLMModelBase(BaseModel):
    """模型配置的公共字段。"""

    provider: str = Field(min_length=1, max_length=64)
    model_name: str = Field(min_length=1, max_length=128)
    base_url: str = Field(default="", max_length=512)


class LLMModelCreate(LLMModelBase):
    """创建模型时允许写入密钥。"""

    api_key: str = Field(default="", max_length=2048)


class LLMModelUpdate(LLMModelBase):
    """更新模型时空密钥表示保留原值。"""

    api_key: str = Field(default="", max_length=2048)


class LLMModelRead(LLMModelBase):
    """返回给前端的模型配置，隐藏真实密钥。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    has_api_key: bool
    is_selected: bool = False


class SelectedModelUpdate(BaseModel):
    """切换默认模型的请求体。"""

    id: int = Field(gt=0)


class SelectedModelRead(BaseModel):
    """当前默认模型的响应体。"""

    id: int


class LLMModelRuntimeRead(BaseModel):
    """Agent 调用模型前读取的运行时配置。"""

    model_name: str
    base_url: str
    api_key: str
