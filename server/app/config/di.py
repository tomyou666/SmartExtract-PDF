"""Dependency Injection（injector と tomyou-ea パターンに準拠）。"""

from injector import Binder, Injector, Module, singleton

from app.application.use_cases.chat_use_cases import (
    ChatStreamService,
    CreateSessionUseCase,
    DeleteConversationTurnUseCase,
    DeleteSessionUseCase,
    GenerateSessionTitleUseCase,
    GetSessionUseCase,
    ListMessagesUseCase,
    ListSessionsUseCase,
    PostMessageStreamUseCase,
    UpdateSessionUseCase,
)
from app.application.use_cases.pdf_use_cases import (
    DeletePdfUseCase,
    GeneratePdfTocUseCase,
    GetPdfFileUseCase,
    GetPdfTocUseCase,
    ListPdfsUseCase,
    UploadPdfUseCase,
)
from app.application.use_cases.settings_use_cases import (
    GetLlmSettingsUseCase,
    ListLlmModelsForProviderUseCase,
    ListLlmProvidersUseCase,
    UpdateLlmSettingsUseCase,
)
from app.config.settings import Settings, settings as app_settings
from app.infrastructure.crypto.llm_api_key_cipher import LlmApiKeyCipher
from app.infrastructure.gateways.litellm_gateway import (
    ILlmCompletionGateway,
    LitellmCompletionGateway,
    LitellmModelCatalogGateway,
)
from app.infrastructure.persistence.chat_repository import (
    IChatRepository,
    SqlAlchemyChatRepository,
)
from app.infrastructure.persistence.llm_settings_repository import (
    ILlmSettingsRepository,
    SqlAlchemyLlmSettingsRepository,
)
from app.infrastructure.persistence.pdf_repository import (
    IPdfRepository,
    SqlAlchemyPdfRepository,
)
from app.infrastructure.persistence.file_storage import (
    FsspecFileStorage,
    IFileStorage,
)
from app.infrastructure.persistence.toc_pdf_storage import (
    ITocPdfStorage,
    PypdfTocPdfStorage,
)
from app.service.llm_catalog_service import ILlmCatalogService
from app.service.llm_service import ILlmMessageService, LlmMessageService
from app.service.toc_service import ITocExtractionService, TocExtractionService


class AppModule(Module):
    """依存関係のバインド。"""

    def configure(self, binder: Binder) -> None:
        binder.bind(Settings, to=app_settings, scope=singleton)
        binder.bind(LlmApiKeyCipher, scope=singleton)
        binder.bind(IFileStorage, to=FsspecFileStorage, scope=singleton)  # type: ignore[type-abstract]
        binder.bind(IPdfRepository, to=SqlAlchemyPdfRepository, scope=singleton)  # type: ignore[type-abstract]
        binder.bind(ITocPdfStorage, to=PypdfTocPdfStorage, scope=singleton)  # type: ignore[type-abstract]
        binder.bind(IChatRepository, to=SqlAlchemyChatRepository, scope=singleton)  # type: ignore[type-abstract]
        binder.bind(
            ILlmSettingsRepository, to=SqlAlchemyLlmSettingsRepository, scope=singleton
        )  # type: ignore[type-abstract]

        binder.bind(ILlmMessageService, to=LlmMessageService, scope=singleton)  # type: ignore[type-abstract]
        binder.bind(ILlmCompletionGateway, to=LitellmCompletionGateway, scope=singleton)  # type: ignore[type-abstract]
        binder.bind(ILlmCatalogService, to=LitellmModelCatalogGateway, scope=singleton)  # type: ignore[type-abstract]
        binder.bind(ITocExtractionService, to=TocExtractionService, scope=singleton)  # type: ignore[type-abstract]

        binder.bind(UploadPdfUseCase, scope=singleton)
        binder.bind(ListPdfsUseCase, scope=singleton)
        binder.bind(DeletePdfUseCase, scope=singleton)
        binder.bind(GeneratePdfTocUseCase, scope=singleton)
        binder.bind(GetPdfTocUseCase, scope=singleton)
        binder.bind(GetPdfFileUseCase, scope=singleton)

        binder.bind(GetLlmSettingsUseCase, scope=singleton)
        binder.bind(UpdateLlmSettingsUseCase, scope=singleton)
        binder.bind(ListLlmProvidersUseCase, scope=singleton)
        binder.bind(ListLlmModelsForProviderUseCase, scope=singleton)

        binder.bind(ChatStreamService, scope=singleton)
        binder.bind(ListSessionsUseCase, scope=singleton)
        binder.bind(CreateSessionUseCase, scope=singleton)
        binder.bind(GetSessionUseCase, scope=singleton)
        binder.bind(ListMessagesUseCase, scope=singleton)
        binder.bind(DeleteConversationTurnUseCase, scope=singleton)
        binder.bind(DeleteSessionUseCase, scope=singleton)
        binder.bind(UpdateSessionUseCase, scope=singleton)
        binder.bind(PostMessageStreamUseCase, scope=singleton)
        binder.bind(GenerateSessionTitleUseCase, scope=singleton)


class DI:
    """Dependency Injection を集約する。"""

    def __init__(self) -> None:
        self.injector = Injector([AppModule()])

    def resolve(self, cls):
        return self.injector.get(cls)
