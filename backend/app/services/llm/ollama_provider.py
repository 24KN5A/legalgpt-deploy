"""
Ollama provider -- talks to a locally running Ollama server
(https://ollama.com). This is the default, zero-API-key provider so
LegalGPT works fully offline out of the box, as long as the user has
Ollama installed and has pulled a model (e.g. `ollama pull llama3`).
"""
import json
from typing import AsyncIterator, List

import httpx

from app.core.exceptions import LLMProviderError
from app.services.llm.base import ChatTurn, LLMProvider


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def generate(self, messages: List[ChatTurn], *, temperature: float, max_tokens: int) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(f"{self.base_url}/api/chat", json=payload)
                resp.raise_for_status()
                data = resp.json()
                return data.get("message", {}).get("content", "")
        except httpx.ConnectError as exc:
            raise LLMProviderError(
                f"Could not reach Ollama at {self.base_url}. Is Ollama running? "
                "Install from https://ollama.com and run `ollama pull llama3`, "
                "or switch LLM_PROVIDER to 'openai'/'anthropic' in .env."
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(f"Ollama generation failed: {exc}") from exc

    async def stream(
        self, messages: List[ChatTurn], *, temperature: float, max_tokens: int
    ) -> AsyncIterator[str]:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        chunk = json.loads(line)
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if chunk.get("done"):
                            break
        except httpx.ConnectError as exc:
            raise LLMProviderError(
                f"Could not reach Ollama at {self.base_url}. Is Ollama running? "
                "Install from https://ollama.com and run `ollama pull llama3`, "
                "or switch LLM_PROVIDER to 'openai'/'anthropic' in .env."
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(f"Ollama streaming failed: {exc}") from exc
