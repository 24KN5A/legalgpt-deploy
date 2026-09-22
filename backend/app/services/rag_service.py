"""
Retrieval-Augmented Generation orchestration.

Pipeline:
  1. Embed the user's question and retrieve the top-k most relevant chunks
     from ChromaDB (optionally scoped to one or more documents).
  2. Build a grounded prompt that instructs the LLM to answer ONLY from the
     retrieved context and to embed inline source citations per claim.
  3. Call the active LLM provider (via the abstraction, provider-agnostic).
  4. Return the answer text, source chunks, and confidence metadata for
     citation and quality display in the UI.
"""
from typing import AsyncIterator, Dict, List, Optional, Tuple

from app.config import settings
from app.services.llm.base import ChatTurn
from app.services.llm.factory import get_llm_provider
from app.services.vector_store_service import get_vector_store

# Improvement #3: System prompt now explicitly requires inline source citations
# after every factual claim so the UI can render them without post-processing.
SYSTEM_PROMPT = """You are LegalGPT, an AI assistant specialized in analyzing legal documents \
and contracts. Answer the user's question using ONLY the context excerpts provided below, \
which were retrieved from the user's own uploaded documents.

Rules:
- Base your answer strictly on the provided context. Do not invent facts.
- After EVERY factual claim or sentence, cite the exact source in parentheses using this \
format: (Source: [document name], chunk [chunk number]). For example:
  "Article 21 guarantees the right to life. (Source: Maneka Gandhi v. Union of India, chunk 3)"
- If multiple chunks support the same claim, cite all relevant ones.
- If the context is empty, or does not clearly and directly answer the question, you MUST \
respond that you don't have enough information in the uploaded documents to answer — do not \
guess, speculate, or partially answer from unrelated context, and do not answer from general \
legal knowledge instead of the provided context.
- You are not a substitute for a licensed attorney; for binding legal decisions, remind the \
user to consult a qualified lawyer if the question concerns a significant legal decision.
- Be precise, professional, and concise.
"""


def _build_context_block(hits: list[dict]) -> str:
    if not hits:
        return "(No relevant context was found in the uploaded documents.)"
    parts = []
    for i, hit in enumerate(hits, start=1):
        meta = hit["metadata"]
        parts.append(
            f"[Source {i} — Document: \"{meta.get('document_name', 'document')}\", "
            f"Chunk {meta.get('chunk_index', '?')}]\n{hit['text']}"
        )
    return "\n\n".join(parts)


def _build_messages(question: str, history: List[ChatTurn], context: str) -> List[ChatTurn]:
    messages: List[ChatTurn] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append(
        {
            "role": "user",
            "content": f"Context from uploaded documents:\n\n{context}\n\nQuestion: {question}",
        }
    )
    return messages


# ---------------------------------------------------------------------------
# Improvement #4: Confidence metadata computation
# ---------------------------------------------------------------------------

def compute_confidence(hits: list[dict]) -> Dict:
    """
    Compute confidence metadata from retrieved hits.

    Returns a dict with:
      - confidence:      float 0.0–1.0 (avg cosine similarity of all hits)
      - match_quality:   str "High" | "Medium" | "Low" | "No match"
      - top_similarity:  float (best individual chunk score)
    """
    if not hits:
        return {"confidence": 0.0, "match_quality": "No match", "top_similarity": 0.0}

    scores = [h["score"] for h in hits if h.get("score") is not None]
    if not scores:
        return {"confidence": 0.0, "match_quality": "No match", "top_similarity": 0.0}

    avg_score = sum(scores) / len(scores)
    top_score = max(scores)

    if avg_score >= 0.85:
        quality = "High"
    elif avg_score >= 0.70:
        quality = "Medium"
    else:
        quality = "Low"

    return {
        "confidence": round(avg_score, 4),
        "match_quality": quality,
        "top_similarity": round(top_score, 4),
    }


# ---------------------------------------------------------------------------
# Core RAG functions
# ---------------------------------------------------------------------------

async def retrieve(
    question: str,
    document_id: Optional[str] = None,
    document_ids: Optional[List[str]] = None,
    top_k: Optional[int] = None,
) -> list[dict]:
    store = get_vector_store()
    hits = store.query(
        query_text=question,
        top_k=top_k or settings.retrieval_top_k,
        document_id=document_id,
        document_ids=document_ids,
    )
    # Threshold logic:
    # - Full-corpus queries (no scope): use the strict 0.70 threshold to reject
    #   chunks from unrelated documents — without this, ChromaDB always returns
    #   the top_k closest vectors even when nothing is relevant.
    # - Single-document scope: the user has already chosen the document, so we
    #   use a much lower threshold (0.25). Broad queries like "summarize" or
    #   "list all obligations" have low cosine similarity to individual clause
    #   chunks (~0.30–0.55 with all-MiniLM-L6-v2), but the chunks ARE relevant.
    #   Applying the strict 0.70 threshold here filters out ALL chunks and
    #   causes the "no relevant context" failure seen with uploaded documents.
    if document_id:
        threshold = settings.retrieval_similarity_threshold_single_doc
    else:
        threshold = settings.retrieval_similarity_threshold

    return [
        hit for hit in hits
        if hit.get("score") is not None and hit["score"] >= threshold
    ]


async def answer_question(
    question: str,
    history: Optional[List[ChatTurn]] = None,
    document_id: Optional[str] = None,
    document_ids: Optional[List[str]] = None,
) -> Tuple[str, list[dict], Dict]:
    """Run the full RAG pipeline and return (answer_text, source_hits, confidence_meta)."""
    hits = await retrieve(question, document_id=document_id, document_ids=document_ids)
    context = _build_context_block(hits)
    messages = _build_messages(question, history or [], context)

    provider = get_llm_provider()
    answer = await provider.generate(
        messages, temperature=settings.llm_temperature, max_tokens=settings.llm_max_tokens
    )
    confidence_meta = compute_confidence(hits)
    return answer, hits, confidence_meta


async def stream_answer(
    question: str,
    history: Optional[List[ChatTurn]] = None,
    document_id: Optional[str] = None,
    document_ids: Optional[List[str]] = None,
) -> AsyncIterator[str]:
    """Stream the RAG answer token-by-token. Callers should call
    `retrieve()` separately if they need sources alongside a stream."""
    hits = await retrieve(question, document_id=document_id, document_ids=document_ids)
    context = _build_context_block(hits)
    messages = _build_messages(question, history or [], context)

    provider = get_llm_provider()
    async for chunk in provider.stream(
        messages, temperature=settings.llm_temperature, max_tokens=settings.llm_max_tokens
    ):
        yield chunk