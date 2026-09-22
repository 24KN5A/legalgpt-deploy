"""
OpenAI provider -- used when LLM_PROVIDER=openai and OPENAI_API_KEY is set.
"""
from typing import AsyncIterator, List

from app.core.exceptions import LLMNotConfiguredError, LLMProviderError
from app.services.llm.base import ChatTurn, LLMProvider


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, api_key: str | None, model: str):
        if not api_key:
            raise LLMNotConfiguredError(
                "LLM_PROVIDER=openai but OPENAI_API_KEY is not set in .env."
            )
        from openai import AsyncOpenAI

        self.model = model
        self.client = AsyncOpenAI(api_key=api_key)

    async def generate(self, messages: List[ChatTurn], *, temperature: float, max_tokens: int) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,  # type: ignore[arg-type]
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content or ""
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(f"OpenAI generation failed: {exc}") from exc

    async def stream(
        self, messages: List[ChatTurn], *, temperature: float, max_tokens: int
    ) -> AsyncIterator[str]:
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,  # type: ignore[arg-type]
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield delta
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(f"OpenAI streaming failed: {exc}") from exc
