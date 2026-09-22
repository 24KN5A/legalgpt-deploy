"""
Quick health/status check for a local LegalGPT install.

Runs three independent checks and prints a plain-English summary:
  1. SQLite  - how many documents exist, and how many are 'ready' vs 'failed'.
  2. ChromaDB - how many chunks are actually indexed for search.
  3. Ollama   - whether the configured model responds at all, and how fast.

USAGE
-----
    cd backend
    python scripts/check_status.py
"""
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app.config import settings  # noqa: E402
from app.db.database import AsyncSessionLocal, init_db  # noqa: E402
from app.db.models import Document, DocumentStatus  # noqa: E402
from app.services.vector_store_service import get_vector_store  # noqa: E402


async def check_sqlite() -> None:
    print("\n--- SQLite (document metadata) ---")
    await init_db()
    async with AsyncSessionLocal() as db:
        total = await db.scalar(select(func.count()).select_from(Document))
        print(f"Total documents recorded: {total}")
        for status in DocumentStatus:
            count = await db.scalar(
                select(func.count()).select_from(Document).where(Document.status == status)
            )
            print(f"  {status.value:<12} {count}")


def check_chroma() -> None:
    print("\n--- ChromaDB (vector store) ---")
    try:
        store = get_vector_store()
        count = store.collection.count()
        print(f"Persisted at: {settings.chroma_persist_dir}")
        print(f"Collection '{settings.chroma_collection_name}' chunk count: {count}")
        if count == 0:
            print(
                "WARNING: 0 chunks indexed. Chat will always say 'no relevant "
                "context' until you run scripts/ingest_legal_corpus.py."
            )
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: could not read Chroma collection: {exc}")


def check_ollama() -> None:
    print("\n--- Ollama (LLM provider) ---")
    if settings.llm_provider != "ollama":
        print(f"LLM_PROVIDER is '{settings.llm_provider}', skipping Ollama check.")
        return
    url = settings.ollama_base_url
    model = settings.ollama_model
    try:
        t0 = time.time()
        resp = httpx.get(f"{url}/api/tags", timeout=5)
        resp.raise_for_status()
        elapsed = time.time() - t0
        tags = [m.get("name") for m in resp.json().get("models", [])]
        print(f"Reached Ollama at {url} in {elapsed:.2f}s")
        print(f"Models available: {tags or '(none pulled yet)'}")
        if model not in tags and f"{model}:latest" not in tags:
            print(
                f"WARNING: configured model '{model}' not found in Ollama's "
                f"pulled models. Run: ollama pull {model}"
            )
    except httpx.ConnectError:
        print(
            f"ERROR: could not connect to Ollama at {url}. "
            "Is `ollama serve` running / is Ollama installed?"
        )
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: unexpected failure talking to Ollama: {exc}")


async def main() -> None:
    print("LegalGPT status check")
    print("=" * 40)
    await check_sqlite()
    check_chroma()
    check_ollama()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
