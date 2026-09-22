"""
Factory that returns the active LLMProvider based on settings.llm_provider.

This is the ONLY place that decides which concrete provider class to
instantiate. Routes/services should always depend on `get_llm_provider()`
and the `LLMProvider` interface -- never import a concrete provider class
directly.
"""
from functools import lru_cache

from app.config import settings
from app.services.llm.base import LLMProvider


@lru_cache
def get_llm_provider() -> LLMProvider:
    provider = settings.llm_provider

    if provider == "openai":
        from app.services.llm.openai_provider import OpenAIProvider

        return OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_chat_model)

    if provider == "anthropic":
        from app.services.llm.anthropic_provider import AnthropicProvider

        return AnthropicProvider(
            api_key=settings.anthropic_api_key, model=settings.anthropic_chat_model
        )

    # default: ollama (local, free, no API key)
    from app.services.llm.ollama_provider import OllamaProvider

    return OllamaProvider(base_url=settings.ollama_base_url, model=settings.ollama_model)
