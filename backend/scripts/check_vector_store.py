"""
Inspect ChromaDB directly: total chunk count, distinct document names
indexed, and (optionally) a live test query so you can see exactly what the
chat endpoint would retrieve for a given question.

USAGE
-----
    cd backend
    python scripts/check_vector_store.py
    python scripts/check_vector_store.py --query "What did the court decide about arbitration?"
    python scripts/check_vector_store.py --list-docs
"""
import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services.vector_store_service import get_vector_store  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--query", help="Run a live similarity search and print the top matches")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--list-docs", action="store_true", help="List every distinct document name indexed")
    args = parser.parse_args()

    store = get_vector_store()
    count = store.collection.count()

    print(f"Chroma persisted at: {settings.chroma_persist_dir}")
    print(f"Collection: {settings.chroma_collection_name}")
    print(f"Total chunks indexed: {count}")

    if count == 0:
        print("\nNo chunks indexed yet. Run scripts/ingest_legal_corpus.py first.")
        return

    if args.list_docs:
        print("\n--- Distinct documents indexed ---")
        # Chroma has no direct "distinct" query, so pull metadata in a
        # bounded batch and count locally. Fine for corpora up to a few
        # thousand chunks; for huge corpora, query in pages instead.
        batch = store.collection.get(limit=min(count, 20000), include=["metadatas"])
        names = Counter(m.get("document_name", "?") for m in batch["metadatas"])
        for name, chunks in sorted(names.items(), key=lambda kv: kv[0].lower()):
            print(f"  {chunks:>4} chunks  -  {name}")

    if args.query:
        print(f"\n--- Test query: {args.query!r} (top {args.top_k}) ---")
        hits = store.query(query_text=args.query, top_k=args.top_k)
        if not hits:
            print("No matches found for this query.")
        for i, hit in enumerate(hits, start=1):
            meta = hit["metadata"]
            score = hit.get("score")
            score_str = f"{score:.3f}" if score is not None else "n/a"
            snippet = hit["text"][:160].replace("\n", " ")
            print(f"\n[{i}] score={score_str}  doc={meta.get('document_name')}  chunk={meta.get('chunk_index')}")
            print(f"    {snippet}...")


if __name__ == "__main__":
    main()
