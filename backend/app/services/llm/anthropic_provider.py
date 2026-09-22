"""
Anthropic provider -- used when LLM_PROVIDER=anthropic and
ANTHROPIC_API_KEY is set.
"""
from typing import AsyncIterator, List

from app.core.exceptions import LLMNotConfiguredError, LLMProviderError
from app.services.llm.base import ChatTurn, LLMProvider


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, api_key: str | None, model: str):
        if not api_key:
            raise LLMNotConfiguredError(
                "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set in .env."
            )
        from anthropic import AsyncAnthropic

        self.model = model
        self.client = AsyncAnthropic(api_key=api_key)

    @staticmethod
    def _split_system(messages: List[ChatTurn]) -> tuple[str, list[dict]]:
        system_parts = [m["content"] for m in messages if m["role"] == "system"]
        turns = [
            {"role": m["role"], "content": m["content"]}
            for m in messages
            if m["role"] in ("user", "assistant")
        ]
        return "\n".join(system_parts), turns

    async def generate(self, messages: List[ChatTurn], *, temperature: float, max_tokens: int) -> str:
        system, turns = self._split_system(messages)
        try:
            response = await self.client.messages.create(
                model=self.model,
                system=system or None,
                messages=turns,  # type: ignore[arg-type]
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return "".join(block.text for block in response.content if block.type == "text")
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(f"Anthropic generation failed: {exc}") from exc

    async def stream(
        self, messages: List[ChatTurn], *, temperature: float, max_tokens: int
    ) -> AsyncIterator[str]:
        system, turns = self._split_system(messages)
        try:
            async with self.client.messages.stream(
                model=self.model,
                system=system or None,
                messages=turns,  # type: ignore[arg-type]
                temperature=temperature,
                max_tokens=max_tokens,
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(f"Anthropic streaming failed: {exc}") from exc
