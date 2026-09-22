"""
LLM provider abstraction.

Every concrete provider (Ollama, OpenAI, Anthropic) implements this same
interface, so the RAG service and chat endpoint never need to know which
one is active. Swapping providers is a single config change
(LLM_PROVIDER in .env) -- no code changes anywhere else.
"""
from abc import ABC, abstractmethod
from typing import AsyncIterator, List, TypedDict


class ChatTurn(TypedDict):
    role: str  # "user" | "assistant" | "system"
    content: str


class LLMProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def generate(self, messages: List[ChatTurn], *, temperature: float, max_tokens: int) -> str:
        """Return the full completion text for the given conversation."""
        raise NotImplementedError

    @abstractmethod
    async def stream(
        self, messages: List[ChatTurn], *, temperature: float, max_tokens: int
    ) -> AsyncIterator[str]:
        """Yield completion text incrementally (token/chunk at a time)."""
        raise NotImplementedError
        yield ""  # pragma: no cover - makes this an async generator for type checkers
