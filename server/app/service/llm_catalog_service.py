"""LLM カタログ（プロバイダ・モデル一覧）のポート。"""

from typing import Protocol, runtime_checkable

from app.schemas.llm import ProviderOption


@runtime_checkable
class ILlmCatalogService(Protocol):
    def list_provider_options(self) -> list[ProviderOption]: ...

    def list_model_names_for_provider(self, provider: str) -> list[str]: ...
