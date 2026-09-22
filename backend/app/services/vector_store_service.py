"""
ChromaDB vector store integration.

Persists chunk embeddings on disk (settings.chroma_persist_dir) so the index
survives restarts. Embeddings are computed by EmbeddingService (kept
separate from Chroma's own embedding functions so we control the model and
provider ourselves via one abstraction).
"""
from functools import lru_cache
from typing import List, Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings
from app.core.exceptions import VectorStoreError
from app.core.logging import logger
from app.services.embedding_service import get_embedding_service


class VectorStoreService:
    def __init__(self):
        try:
            self.client = chromadb.PersistentClient(
                path=str(settings.chroma_persist_dir),
                settings=ChromaSettings(anonymized_telemetry=False),
            )
            self.collection = self.client.get_or_create_collection(
                name=settings.chroma_collection_name,
                metadata={"hnsw:space": "cosine"},
            )
        except Exception as exc:  # noqa: BLE001
            raise VectorStoreError(f"Failed to initialize ChromaDB: {exc}") from exc

    def add_chunks(
        self,
        document_id: str,
        document_name: str,
        chunk_ids: List[str],
        texts: List[str],
        chunk_indices: List[int],
    ) -> None:
        if not texts:
            return
        try:
            embedder = get_embedding_service()
            vectors = embedder.embed_documents(texts)
            metadatas = [
                {
                    "document_id": document_id,
                    "document_name": document_name,
                    "chunk_index": idx,
                }
                for idx in chunk_indices
            ]
            self.collection.add(
                ids=chunk_ids,
                embeddings=vectors,
                documents=texts,
                metadatas=metadatas,
            )
        except Exception as exc:  # noqa: BLE001
            raise VectorStoreError(f"Failed to add chunks to vector store: {exc}") from exc

    def query(
        self,
        query_text: str,
        top_k: int = 5,
        document_id: Optional[str] = None,
        document_ids: Optional[List[str]] = None,
    ) -> list[dict]:
        try:
            embedder = get_embedding_service()
            query_vector = embedder.embed_query(query_text)

            where = None
            if document_id:
                where = {"document_id": document_id}
            elif document_ids:
                where = {"document_id": {"$in": document_ids}}

            result = self.collection.query(
                query_embeddings=[query_vector],
                n_results=top_k,
                where=where,
            )

            hits = []
            if result and result.get("ids") and result["ids"][0]:
                for i, chunk_id in enumerate(result["ids"][0]):
                    distance = result["distances"][0][i] if result.get("distances") else None
                    similarity = 1 - distance if distance is not None else None
                    hits.append(
                        {
                            "id": chunk_id,
                            "text": result["documents"][0][i],
                            "metadata": result["metadatas"][0][i],
                            "score": similarity,
                        }
                    )
            return hits
        except Exception as exc:  # noqa: BLE001
            raise VectorStoreError(f"Vector store query failed: {exc}") from exc

    def delete_document(self, document_id: str) -> None:
        try:
            self.collection.delete(where={"document_id": document_id})
        except Exception as exc:  # noqa: BLE001
            raise VectorStoreError(f"Failed to delete document from vector store: {exc}") from exc

    def is_ready(self) -> bool:
        try:
            self.collection.count()
            return True
        except Exception:  # noqa: BLE001
            return False


@lru_cache
def get_vector_store() -> VectorStoreService:
    return VectorStoreService()
