"""
Embedding service.

Default provider is "local" -- sentence-transformers running on CPU, no API
key required. This keeps LegalGPT fully functional with zero external
dependencies out of the box. Setting EMBEDDING_PROVIDER=openai in .env
switches to OpenAI's embedding API instead.

The model is loaded lazily (on first use) and cached as a module-level
singleton so it's only loaded into memory once per process.
"""
from functools import lru_cache
from typing import List

from app.config import settings
from app.core.exceptions import EmbeddingGenerationError
from app.core.logging import logger


class EmbeddingService:
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError

    def embed_query(self, text: str) -> List[float]:
        raise NotImplementedError


class LocalEmbeddingService(EmbeddingService):
    """sentence-transformers based embeddings, CPU-friendly, free, offline."""

    def __init__(self, model_name: str):
        self.model_name = model_name
        self._model = None

    @property
    def model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer

                logger.info(f"Loading local embedding model '{self.model_name}'...")
                self._model = SentenceTransformer(self.model_name)
                logger.info("Local embedding model loaded.")
            except Exception as exc:  # noqa: BLE001
                raise EmbeddingGenerationError(
                    f"Failed to load local embedding model '{self.model_name}': {exc}. "
                    "Ensure 'sentence-transformers' is installed and the model can be "
                    "downloaded (or pre-cached) from Hugging Face."
                ) from exc
        return self._model

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        try:
            vectors = self.model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
            return vectors.tolist()
        except Exception as exc:  # noqa: BLE001
            raise EmbeddingGenerationError(f"Local embedding generation failed: {exc}") from exc

    def embed_query(self, text: str) -> List[float]:
        return self.embed_documents([text])[0]


class OpenAIEmbeddingService(EmbeddingService):
    """OpenAI embeddings API -- used only if EMBEDDING_PROVIDER=openai."""

    def __init__(self, model_name: str, api_key: str | None):
        if not api_key:
            raise EmbeddingGenerationError(
                "EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set."
            )
        from openai import OpenAI

        self.model_name = model_name
        self.client = OpenAI(api_key=api_key)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        try:
            response = self.client.embeddings.create(model=self.model_name, input=texts)
            return [item.embedding for item in response.data]
        except Exception as exc:  # noqa: BLE001
            raise EmbeddingGenerationError(f"OpenAI embedding generation failed: {exc}") from exc

    def embed_query(self, text: str) -> List[float]:
        return self.embed_documents([text])[0]


@lru_cache
def get_embedding_service() -> EmbeddingService:
    if settings.embedding_provider == "openai":
        return OpenAIEmbeddingService(
            model_name=settings.openai_embedding_model,
            api_key=settings.openai_api_key,
        )
    return LocalEmbeddingService(model_name=settings.embedding_model_name)
