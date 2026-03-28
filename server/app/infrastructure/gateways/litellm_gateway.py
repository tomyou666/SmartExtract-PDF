"""LiteLLM 呼び出しと model_cost カタログをインフラに閉じ込めるゲートウェイ。"""

from collections.abc import AsyncIterator
from typing import Any, Protocol, runtime_checkable

import litellm
from litellm import completion_cost, cost_per_token
from pydantic import BaseModel

from app.schemas.llm import ProviderOption
from app.share.logger_util import get_logger

logger = get_logger()


@runtime_checkable
class ILlmCompletionGateway(Protocol):
    def supports_pdf_input(self, model: str) -> bool: ...

    async def stream_chat_completion(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
    ) -> AsyncIterator[str]: ...

    async def complete_chat_text(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
    ) -> str: ...

    async def complete_with_response_format(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        response_format: type[BaseModel],
        log_label: str,
    ) -> str: ...


class LitellmCompletionGateway:
    """LiteLLM による completion（ストリーム・非ストリーム・構造化）。"""

    def _content_str(self, m: dict[str, Any]) -> str:
        c = m.get("content")
        if isinstance(c, str):
            return c
        if isinstance(c, list):
            return " ".join(
                p.get("text", "") if isinstance(p, dict) else str(p) for p in c
            )
        return str(c) if c else ""

    def _log_stream_cost(
        self,
        model_string: str,
        stream_usage: Any,
        litellm_messages: list[dict[str, Any]],
        assistant_text: str,
    ) -> None:
        try:
            if stream_usage and (
                getattr(stream_usage, "prompt_tokens", None) is not None
                or getattr(stream_usage, "completion_tokens", None) is not None
            ):
                pt = getattr(stream_usage, "prompt_tokens", 0) or 0
                ct = getattr(stream_usage, "completion_tokens", 0) or 0
                prompt_cost, completion_cost_usd = cost_per_token(
                    model=model_string, prompt_tokens=pt, completion_tokens=ct
                )
                total_cost = (prompt_cost or 0) + (completion_cost_usd or 0)
                logger.info(
                    "LLM cost (stream): model=%s prompt_tokens=%s completion_tokens=%s cost_usd=%.6f",
                    model_string,
                    pt,
                    ct,
                    total_cost,
                )
            else:
                cost = completion_cost(
                    model=model_string,
                    prompt=" ".join(self._content_str(m) for m in litellm_messages),
                    completion=assistant_text,
                )
                logger.info(
                    "LLM cost (stream, estimated): model=%s cost_usd=%.6f",
                    model_string,
                    float(cost or 0),
                )
        except Exception as cost_err:
            logger.warning("LLM cost logging failed: %s", cost_err, exc_info=True)

    def supports_pdf_input(self, model: str) -> bool:
        from litellm.utils import supports_pdf_input

        return supports_pdf_input(model=model)

    async def stream_chat_completion(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
    ) -> AsyncIterator[str]:
        full_content: list[str] = []
        stream_usage = None
        try:
            response = await litellm.acompletion(
                model=model,
                messages=messages,
                stream=True,
                stream_options={"include_usage": True},
                reasoning_effort="none",
            )
            async for chunk in response:
                if getattr(chunk, "usage", None) and (
                    getattr(chunk.usage, "prompt_tokens", None) is not None
                    or getattr(chunk.usage, "completion_tokens", None) is not None
                ):
                    stream_usage = chunk.usage
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta and delta.content:
                        full_content.append(delta.content)
                        yield delta.content
        finally:
            assistant_text = "".join(full_content)
            self._log_stream_cost(model, stream_usage, messages, assistant_text)

    async def complete_chat_text(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
    ) -> str:
        response = await litellm.acompletion(
            model=model,
            messages=messages,
            stream=False,
            reasoning_effort="none",
        )
        try:
            cost = completion_cost(completion_response=response)
            logger.info(
                "LLM cost (title): model=%s cost_usd=%.6f",
                model,
                float(cost or 0),
            )
        except Exception as cost_err:
            logger.warning("LLM cost logging failed: %s", cost_err, exc_info=True)
        if not response.choices:
            return ""
        content = response.choices[0].message.content
        return (content or "").strip()

    async def complete_with_response_format(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        response_format: type[BaseModel],
        log_label: str,
    ) -> str:
        response = await litellm.acompletion(
            model=model,
            messages=messages,
            stream=False,
            response_format=response_format,
        )
        try:
            cost = completion_cost(completion_response=response)
            logger.info(
                "LLM cost (%s): model=%s cost_usd=%.6f",
                log_label,
                model,
                float(cost or 0),
            )
        except Exception as cost_err:
            logger.warning("LLM cost logging failed: %s", cost_err, exc_info=True)
        if not response.choices or not response.choices[0].message.content:
            return ""
        return response.choices[0].message.content.strip()


class LitellmModelCatalogGateway:
    """LiteLLM model_cost 由来のプロバイダ・モデル一覧。"""

    _PROVIDER_TO_LITELLM = {"google": "gemini"}
    _LITELLM_TO_PROVIDER = {"gemini": "google"}
    _PROVIDER_LABELS: dict[str, str] = {
        "openai": "OpenAI",
        "anthropic": "Anthropic",
        "google": "Google (Gemini)",
        "groq": "Groq",
    }

    def list_provider_options(self) -> list[ProviderOption]:
        providers: set[str] = set()
        for _key, info in litellm.model_cost.items():
            if not isinstance(info, dict):
                continue
            litellm_provider = info.get("litellm_provider")
            if not litellm_provider:
                continue
            if litellm_provider in self._LITELLM_TO_PROVIDER:
                providers.add(self._LITELLM_TO_PROVIDER[litellm_provider])
            else:
                providers.add(litellm_provider)
        result: list[ProviderOption] = []
        for value in sorted(providers):
            label = self._PROVIDER_LABELS.get(value, value)
            result.append(ProviderOption(value=value, label=label))
        return result

    def list_model_names_for_provider(self, provider: str) -> list[str]:
        litellm_prefix = self._PROVIDER_TO_LITELLM.get(provider, provider)
        models: list[str] = []
        for key, info in litellm.model_cost.items():
            if (
                not isinstance(info, dict)
                or info.get("litellm_provider") != litellm_prefix
            ):
                continue
            if "/" in key:
                model_name = key.split("/", 1)[1]
                if "/" in model_name:
                    continue
            else:
                model_name = key
            models.append(model_name)
        return sorted(set(models))
