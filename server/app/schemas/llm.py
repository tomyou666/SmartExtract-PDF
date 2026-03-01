from pydantic import BaseModel


class LLMSettingsOut(BaseModel):
    provider: str
    model: str
    api_key_masked: bool = False  # True when api_key is set but not returned


class LLMSettingsIn(BaseModel):
    provider: str = "openai"
    api_key: str | None = None
    model: str = "gpt-4o"


class ProviderOption(BaseModel):
    value: str
    label: str


class ModelsOut(BaseModel):
    models: list[str]
