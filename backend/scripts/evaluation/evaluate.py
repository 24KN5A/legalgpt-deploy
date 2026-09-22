"""
LegalGPT evaluation harness — Conference-Paper-Quality Extension.

Calls the ALREADY-RUNNING LegalGPT API (chat, unchanged) for every question in
evaluation_dataset.csv, scores the answers, and writes results.csv plus a
metrics_summary.json / printed report.

This script does NOT modify the chatbot, upload flow, RAG pipeline, or
ChromaDB in any way -- it is a read-only client that exercises the existing
/chat endpoint exactly like the frontend does, then grades the responses.

--------------------------------------------------------------------------
EVALUATION PHILOSOPHY — INSPIRED BY ARES + RAGAS
--------------------------------------------------------------------------
This harness is INSPIRED BY two conference papers. Not every metric is an
exact reproduction. Read the per-metric docstrings carefully.

  ARES (NAACL 2024): Automated Evaluation Framework for RAG Systems.
    EXACT:   Binary classification metrics, Precision@K, MRR, nDCG@K.
    APPROX:  Hallucination Rate (Type A only; no NLI claim checker).
    MISSING: Faithfulness via NLI (requires chunk text + NLI model).

  RAGAS (EACL 2024): Automated Evaluation of Retrieval-Augmented Generation.
    APPROX:  Question-Answer Similarity (proxy for Context Relevance).
    APPROX:  Reference Answer Similarity (proxy for Answer Relevance).
    MISSING: True Context Relevance (requires chunk text).
    MISSING: True Faithfulness (requires chunk text + LLM/NLI judge).
    MISSING: True Answer Relevance (requires LLM reverse-question generation).

--------------------------------------------------------------------------
WHY THIS SCRIPT IS DESIGNED THE WAY IT IS (read before presenting results)
--------------------------------------------------------------------------
"Accuracy / Precision / Recall / F1" only mean something well-defined when
there are both cases the system SHOULD get right AND cases it should
correctly refuse. A pure question-answering dataset (80 "answerable"
landmark-case questions) has no negative class, so a classic sklearn
confusion matrix would be trivial (precision/recall would collapse to the
same number as accuracy). To make the metrics real, evaluation_dataset.csv
mixes:
  - Should_Answer = True  rows: real landmark Indian Supreme Court cases.
    LegalGPT should retrieve the right judgment and answer correctly.
  - Should_Answer = False rows: out-of-corpus / nonsense questions (e.g. a
    fictional case, weather, sports scores). LegalGPT should say it doesn't
    have enough information rather than hallucinate.

That lets us define, per question:
    y_true = Should_Answer            (1 = a correct answer should exist)
    y_pred = system_answered          (1 = system gave a confident, on-topic
                                            answer instead of declining)
and hand that directly to sklearn's accuracy_score / precision_score /
recall_score / f1_score / confusion_matrix -- a real, non-trivial
classification problem: did the system answer when it should have, AND
correctly decline when it shouldn't have?

On top of that binary classification layer, for the Should_Answer=True rows
we additionally report:
  - Retrieval Precision@k / Hit-Rate: whether the correct judgment was among
    the retrieved source chunks.
  - Recall@K: fraction of relevant docs retrieved (binary with single-doc
    annotations — equals Hit Rate; see TODO below for multi-doc extension).
  - MRR: Mean Reciprocal Rank — where in the ranked list the first relevant
    document appears.
  - nDCG@K: Normalized Discounted Cumulative Gain — rewards surfacing
    relevant documents earlier in the ranked list.
  - Generation metrics (APPROXIMATIONS — see metric docstrings):
      question_answer_similarity  = cosine(question, generated_answer)
          [PROXY for Context Relevance; NOT the RAGAS metric]
      reference_answer_similarity = cosine(expected_answer, generated_answer)
          [PROXY for Answer quality; NOT the RAGAS Answer Relevance metric]
      faithfulness_nli: NOT COMPUTED — requires NLI model + chunk text
          [see TODO [NLI-FAITHFULNESS]]
  - Hallucination Rate: only Type A (answered when should decline).
  - Legal Citation Accuracy: whether the cited document matches expected.
  - Runtime Metrics: total round-trip latency per query.
  - Semantic similarity between the generated and expected answer (cosine
    similarity via the SAME sentence-transformers model the app already uses
    for embeddings — no new heavyweight dependency).
  - A lightweight ROUGE-L F1 score (pure Python, no nltk/tokenizer download)
    as a secondary lexical-overlap sanity check.

IMPORTANT -- corpus coverage: this script cannot know which of the ~40,000
judgments in the Kaggle "SC Judgments India" dataset you actually finished
ingesting. Before scoring, it queries your local SQLite DB directly (same
Document table check_status.py uses) and flags any row whose
Expected_Document doesn't fuzzy-match anything you've ingested as
"NOT_INGESTED" -- those rows are excluded from the headline metrics (but
still logged in results.csv) so an incomplete ingest doesn't masquerade as a
bad RAG pipeline. Check the console warning at the end and either finish
ingesting those cases or trim them from the CSV.

--------------------------------------------------------------------------
DATASET LIMITATIONS & TODOs
--------------------------------------------------------------------------
The current evaluation_dataset.csv has ONE expected document per question.
Because of this:

  TODO [MULTI-DOC]: Add a `Relevant_Documents` column (pipe-separated list)
  to evaluation_dataset.csv to enable true Recall@K, MRR, and nDCG@K with
  multiple relevant documents per question. Until then, Recall@K equals
  Hit Rate (binary single-document match).

  TODO [CHUNK-TEXT]: The /chat endpoint returns document names, not chunk
  text. Context Relevance and Faithfulness use answer/question cosine
  similarity as a proxy (validated in lightweight RAGAS literature). For
  true RAGAS Faithfulness, add chunk text to the API response or store
  retrieved chunks during evaluation.

  TODO [TIMING]: The /chat endpoint runs retrieval + generation atomically.
  Add X-Retrieval-Time-Ms and X-Generation-Time-Ms response headers to the
  FastAPI backend to enable separate timing. Until then, only total
  round-trip time is measured.

  TODO [NLI-FAITHFULNESS]: Full RAGAS faithfulness decomposes the answer
  into atomic claims and checks each against the context using NLI. Upgrade
  this implementation when an LLM or NLI model is available.
"""
from __future__ import annotations

import argparse
import csv
import getpass
import json
import math
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import httpx

# --- make `app.*` importable, same pattern as scripts/check_status.py ---
BACKEND_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_DIR))

DEFAULT_DATASET = Path(__file__).resolve().parent / "evaluation_dataset.csv"
DEFAULT_RESULTS = Path(__file__).resolve().parent / "results.csv"
DEFAULT_SUMMARY = Path(__file__).resolve().parent / "metrics_summary.json"

REFUSAL_PATTERNS = [
    r"does not contain (enough|sufficient) information",
    r"don't have (enough|sufficient) information",
    r"do not have (enough|sufficient) information",
    r"no relevant (context|information|documents?)",
    r"couldn't find (any|relevant)",
    r"could not find (any|relevant)",
    r"cannot find (any|relevant)",
    r"not (covered|available) in (the|your|my) documents",
    r"unable to find",
    r"context (provided )?does not",
    r"i don't know based on",
]
_REFUSAL_RE = re.compile("|".join(REFUSAL_PATTERNS), re.IGNORECASE)

_STOPWORDS = {
    "v", "vs", "versus", "the", "of", "and", "union", "state", "india",
    "co", "ltd", "corporation", "inc", "case", "pvt", "pdf",
}

# Legal citation patterns — detect cited section/act references in answers.
# e.g. "Section 94(7)", "Article 226", "IPC", "CrPC", "Act, 1976"
_CITATION_RE = re.compile(
    r"(section\s+\d[\w()]*"
    r"|article\s+\d[\w()]*"
    r"|(?:ipc|crpc|cpc|mvact|cpa)\b"
    r"|\bact[,\s]+\d{4}\b)",
    re.IGNORECASE,
)


# ==========================================================================
# SECTION 1: Existing utility functions (PRESERVED UNCHANGED)
# ==========================================================================

def normalize_doc_name(name: str) -> set[str]:
    """Lowercase, strip extension/punctuation, drop stopwords/years -> token set."""
    name = re.sub(r"\.(pdf|docx?)$", "", name.strip().lower())
    name = re.sub(r"[\(\)\[\]_\-,.]", " ", name)
    tokens = {t for t in name.split() if t and not t.isdigit() and t not in _STOPWORDS}
    return tokens


def doc_similarity(expected: str, actual: str) -> float:
    """Jaccard token overlap between an expected case name and a retrieved
    document name / filename. Filenames rarely match case names exactly, so
    this is intentionally forgiving (token overlap, not exact string match)."""
    a, b = normalize_doc_name(expected), normalize_doc_name(actual)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def rouge_l_f1(reference: str, hypothesis: str) -> float:
    """Pure-Python ROUGE-L F1 (LCS-based). Avoids adding the `rouge-score`
    package (and its nltk data download) purely for one secondary metric."""
    ref = reference.lower().split()
    hyp = hypothesis.lower().split()
    if not ref or not hyp:
        return 0.0
    n, m = len(ref), len(hyp)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if ref[i - 1] == hyp[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    lcs = dp[n][m]
    if lcs == 0:
        return 0.0
    precision = lcs / m
    recall = lcs / n
    return 2 * precision * recall / (precision + recall)


# ==========================================================================
# SECTION 2: Row dataclass — extended with new per-row metric fields
# ==========================================================================

@dataclass
class Row:
    # --- Original fields (PRESERVED UNCHANGED) ---
    id: str
    question: str
    expected_answer: str
    expected_document: str
    category: str
    should_answer: bool
    # filled in during evaluation:
    ingested: Optional[bool] = None
    generated_answer: str = ""
    retrieved_docs: list[str] = field(default_factory=list)
    system_answered: bool = False
    doc_match: bool = False
    precision_at_k: float = 0.0
    similarity: float = 0.0
    rouge_l: float = 0.0
    error: str = ""

    # --- NEW: Extended retrieval metrics (ARES-style) ---
    # Recall@K: |relevant ∩ retrieved| / |relevant total|
    # With single-doc annotations this equals Hit Rate (binary 0/1).
    # TODO [MULTI-DOC]: Upgrade when Relevant_Documents column is added.
    recall_at_k: float = 0.0

    # MRR: 1 / rank_of_first_relevant (0 if not found in top-k)
    # rank_of_first_relevant: 1-indexed position; -1 means not found.
    rank_of_first_relevant: int = -1
    mrr_score: float = 0.0

    # nDCG@K: Normalized Discounted Cumulative Gain using binary relevance.
    # DCG = Σ rel_i / log2(i+1) for i in 1..K
    # nDCG = DCG / IDCG where IDCG = perfect ranking score.
    ndcg_at_k: float = 0.0

    # --- NEW: Generation quality metrics (APPROXIMATIONS) ---
    #
    # AUDIT NOTE: These metrics are approximations, not the RAGAS originals.
    # Each docstring explains exactly what is computed vs. what RAGAS defines.
    #
    # question_answer_similarity: cosine(question, generated_answer)
    #   PROXY for retrieval context relevance. True RAGAS Context Relevance
    #   requires the actual retrieved chunk text.
    #   TODO [CHUNK-TEXT]: Replace with cosine(question, chunk_text) when
    #   chunk text is returned by the API.
    question_answer_similarity: float = 0.0

    # reference_answer_similarity: cosine(expected_answer, generated_answer)
    #   Measures answer quality against a reference. This is NOT the RAGAS
    #   Answer Relevance metric (which uses reverse question generation via LLM).
    #   It IS the same value as `similarity` — kept separately for clarity.
    reference_answer_similarity: float = 0.0

    # faithfulness_nli: NOT COMPUTED in this implementation.
    #   True faithfulness requires:
    #     1. Retrieved chunk text (not available from /chat endpoint)
    #     2. An NLI model or LLM judge for claim-level entailment checking
    #   Value is None = not computed, float = NLI score when implemented.
    #   TODO [NLI-FAITHFULNESS]: See compute_faithfulness_nli() placeholder.
    faithfulness_nli: Optional[float] = None

    # --- NEW: Legal Citation metrics ---
    # citation_correct: at least one retrieved doc matches Expected_Document
    citation_correct: bool = False
    # citation_missing: no sources were returned at all
    citation_missing: bool = False

    # --- NEW: Runtime/Latency metrics ---
    # total_time_ms: full round-trip time for one /chat call in milliseconds
    total_time_ms: float = 0.0
    # retrieval_time_ms: not separately measurable without server-side headers
    # TODO [TIMING]: Add X-Retrieval-Time-Ms header to FastAPI backend.
    retrieval_time_ms: float = -1.0  # -1 = not available


# ==========================================================================
# SECTION 3: Dataset loading (PRESERVED UNCHANGED)
# ==========================================================================

def load_dataset(path: Path) -> list[Row]:
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(
                Row(
                    id=r["ID"],
                    question=r["Question"],
                    expected_answer=r["Expected_Answer"],
                    expected_document=r["Expected_Document"],
                    category=r["Category"],
                    should_answer=r["Should_Answer"].strip().lower() == "true",
                )
            )
    return rows


# ==========================================================================
# SECTION 4: Corpus coverage check (PRESERVED UNCHANGED)
# ==========================================================================

async def check_ingested_documents() -> list[str]:
    """Query the SQLite DB directly for every ingested document's filename,
    including shared (user_id=None) documents from ingest_legal_corpus.py --
    GET /documents only returns the caller's own uploads, so the bulk-ingested
    corpus wouldn't show up there."""
    from app.db.database import AsyncSessionLocal, init_db
    from app.db.models import Document
    from sqlalchemy import select

    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Document.original_filename))
        return [row[0] for row in result.all()]


def mark_corpus_coverage(rows: list[Row], ingested_names: list[str]) -> None:
    for row in rows:
        if not row.should_answer or not row.expected_document:
            row.ingested = None  # not applicable
            continue
        row.ingested = any(
            doc_similarity(row.expected_document, name) >= 0.34 for name in ingested_names
        )


# ==========================================================================
# SECTION 5: Embedder (PRESERVED + extended usage)
# ==========================================================================

def get_embedder():
    """Reuses the exact embedding model the app already depends on
    (sentence-transformers all-MiniLM-L6-v2) instead of adding bert-score
    as a second, much heavier model download.

    Extended usage in this version:
      - Original: cosine(expected_answer, generated_answer) -> similarity
      - New (RAGAS-style):
          context_relevance  = cosine(question, generated_answer)
          answer_relevance   = cosine(expected_answer, generated_answer) [=similarity]
          faithfulness       = cosine(generated_answer, expected_answer) [same]
    All three reuse the same _cosine() closure with different argument pairs.
    """
    try:
        from sentence_transformers import SentenceTransformer
        import numpy as np
    except ImportError:
        print(
            "WARNING: sentence-transformers not importable in this environment -- "
            "semantic similarity and RAGAS-style generation metrics will be "
            "skipped (rows still get ROUGE-L and retrieval metrics). Run this "
            "script with the same Python env as the backend (venv) to enable it."
        )
        return None

    model = SentenceTransformer("all-MiniLM-L6-v2")

    def _cosine(a: str, b: str) -> float:
        vecs = model.encode([a, b])
        num = float(np.dot(vecs[0], vecs[1]))
        denom = float(np.linalg.norm(vecs[0]) * np.linalg.norm(vecs[1]))
        return num / denom if denom else 0.0

    return _cosine


# ==========================================================================
# SECTION 6: HTTP client (PRESERVED UNCHANGED)
# ==========================================================================

class LegalGPTClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(base_url=self.base_url, timeout=120.0)
        self.token: Optional[str] = None

    def login(self, email: str, password: str) -> bool:
        resp = self.client.post("/auth/login", json={"email": email, "password": password})
        if resp.status_code == 200:
            self.token = resp.json()["access_token"]
            self.client.headers["Authorization"] = f"Bearer {self.token}"
            return True
        return False

    def signup(self, email: str, password: str, full_name: str = "Evaluation Bot") -> bool:
        resp = self.client.post(
            "/auth/signup",
            json={"full_name": full_name, "email": email, "password": password},
        )
        if resp.status_code == 201:
            self.token = resp.json()["access_token"]
            self.client.headers["Authorization"] = f"Bearer {self.token}"
            return True
        return False

    def ask(self, question: str) -> dict:
        resp = self.client.post("/chat", json={"message": question})
        resp.raise_for_status()
        return resp.json()


def authenticate(client: LegalGPTClient, email: Optional[str], password: Optional[str]) -> None:
    email = email or input("Evaluation account email: ").strip()
    password = password or getpass.getpass("Evaluation account password: ")

    if client.login(email, password):
        print(f"Logged in as {email}.")
        return
    print(f"Login failed for {email}; attempting to create this account...")
    if client.signup(email, password):
        print(f"Created and logged in as {email}.")
        return
    raise SystemExit(
        f"Could not log in or sign up as {email}. Check the backend is running "
        f"and the password meets the 8-character minimum."
    )


# ==========================================================================
# SECTION 7: NEW — Retrieval metric helpers (ARES-style)
# ==========================================================================

def compute_recall_at_k(retrieved_docs: List[str], expected_doc: str) -> float:
    """
    Compute Recall@K for a single query.

    Formula (ARES / standard IR):
        Recall@K = |relevant ∩ retrieved_top_K| / |total relevant documents|

    With single-document annotations (one Expected_Document per question),
    this simplifies to a binary check:
        Recall@K = 1.0  if the expected document appears in retrieved_docs
                 = 0.0  otherwise

    This is equivalent to Hit Rate under single-document annotations.
    See TODO [MULTI-DOC] in the module docstring to upgrade to multi-doc.

    Args:
        retrieved_docs: List of document names returned by the retriever.
        expected_doc:   Ground-truth document name (from evaluation_dataset.csv).

    Returns:
        1.0 if any retrieved doc matches the expected doc, else 0.0.
    """
    if not expected_doc or not retrieved_docs:
        return 0.0
    for doc in retrieved_docs:
        if doc_similarity(expected_doc, doc) >= 0.34:
            return 1.0
    return 0.0


def compute_mrr_score(retrieved_docs: List[str], expected_doc: str) -> tuple[float, int]:
    """
    Compute Mean Reciprocal Rank (MRR) contribution for a single query.

    Formula (ARES / standard IR):
        MRR = (1 / Q) * Σ_q (1 / rank_of_first_relevant_q)

    Per-query contribution:
        mrr_q = 1 / rank_of_first_relevant  (if found)
              = 0                            (if not found in top-K)

    The mean across all queries gives MRR.

    Why it matters for Legal RAG:
        A legal user expects the correct judgment to appear at the top
        of retrieved sources. MRR penalises systems that find the right
        document but only at rank 4 or 5.

    Args:
        retrieved_docs: Ranked list of document names (rank 1 = index 0).
        expected_doc:   Ground-truth document name.

    Returns:
        (mrr_score, rank): mrr_score = 1/rank if found, else 0.0.
                           rank = 1-indexed position of first match; -1 if not found.
    """
    if not expected_doc or not retrieved_docs:
        return 0.0, -1
    for idx, doc in enumerate(retrieved_docs):
        rank = idx + 1  # 1-indexed
        if doc_similarity(expected_doc, doc) >= 0.34:
            return 1.0 / rank, rank
    return 0.0, -1


def compute_ndcg_at_k(retrieved_docs: List[str], expected_doc: str, k: int) -> float:
    """
    Compute Normalized Discounted Cumulative Gain at K (nDCG@K).

    Formula (ARES / Järvelin & Kekäläinen, 2002):
        DCG@K  = Σ_{i=1}^{K} rel_i / log2(i + 1)
        IDCG@K = DCG of perfect ranking (relevant doc at rank 1)
        nDCG@K = DCG@K / IDCG@K

    Binary relevance: rel_i = 1 if retrieved_docs[i-1] matches expected_doc,
                               else 0.

    With a single relevant document, IDCG@K = 1 / log2(2) = 1.0
    (the relevant document is at rank 1 in the ideal ranking).

    Why it matters for Legal RAG:
        nDCG@K rewards systems that rank the correct judgment higher.
        A system returning the right judgment at rank 1 scores 1.0;
        at rank 5 it scores ~0.43 — a significant penalty for low ranking.

    Args:
        retrieved_docs: Ranked list of document names (rank 1 = index 0).
        expected_doc:   Ground-truth document name.
        k:              Cut-off rank (matches --top-k CLI argument).

    Returns:
        nDCG@K in [0.0, 1.0]. Returns 0.0 if no relevant doc found.
    """
    if not expected_doc or not retrieved_docs:
        return 0.0

    # Build binary relevance vector — mark ONLY THE FIRST matching doc as 1.
    #
    # WHY: IDCG is computed assuming exactly one relevant document (at rank 1).
    # If multiple retrieved docs fuzzy-match the expected_doc (Jaccard >= 0.34),
    # counting all of them makes DCG > IDCG, producing nDCG > 1.0.
    #
    # The Jaccard threshold (0.34) is intentionally loose to handle filename
    # variation in Indian SC case names. A loose threshold means several
    # retrieved docs often match the same expected_doc. Marking only the FIRST
    # match as relevant is consistent with the single-doc IDCG assumption and
    # keeps nDCG strictly in [0.0, 1.0].
    relevance = []
    found_first = False
    for doc in retrieved_docs[:k]:
        if not found_first and doc_similarity(expected_doc, doc) >= 0.34:
            relevance.append(1)
            found_first = True
        else:
            relevance.append(0)

    # DCG@K = Σ rel_i / log2(i+1), i is 1-indexed
    # idx is 0-indexed → denominator = log2(idx + 2)
    dcg = sum(
        rel / math.log2(idx + 2)
        for idx, rel in enumerate(relevance)
    )

    # IDCG@K: one relevant doc at rank 1 → IDCG = 1 / log2(2) = 1.0
    idcg = 1.0 / math.log2(2)  # = 1.0

    # nDCG is guaranteed in [0.0, 1.0] because:
    #   - at most one rel_i = 1  →  DCG ≤ 1/log2(2) = IDCG
    return dcg / idcg if idcg > 0 else 0.0


# ==========================================================================
# SECTION 8: Generation metric helpers
#
# AUDIT SUMMARY (compared against ARES/RAGAS papers):
#
# compute_question_answer_similarity()
#   What we compute : cosine(question, generated_answer)
#   What RAGAS measures: context relevance via LLM sentence extraction
#   Status: APPROXIMATION — a proxy, not the RAGAS metric
#   Honest label: "Question-Answer Similarity"
#
# compute_reference_answer_similarity()
#   What we compute : cosine(expected_answer, generated_answer)
#   What RAGAS measures: answer relevance via LLM reverse-question generation
#   Status: APPROXIMATION — measures reference similarity, not RAGAS metric
#   Honest label: "Reference Answer Similarity"
#
# compute_faithfulness_nli()
#   What RAGAS/ARES measures: NLI entailment of atomic claims vs. context
#   Status: PLACEHOLDER — cannot be implemented without chunk text + NLI model
#   Returns: None (explicitly not computed)
# ==========================================================================

def compute_question_answer_similarity(question: str, generated_answer: str, cosine_fn) -> float:
    """
    Compute Question-Answer Similarity.

    HONEST LABEL: This is an APPROXIMATION, not RAGAS Context Relevance.

    What RAGAS Context Relevance actually measures (EACL 2024, Section 3.1):
        "Extract the number of sentences from the context that are relevant
        to answer the given question, then score = relevant_sentences / total_sentences."
        This requires the actual retrieved context chunks, not the generated answer.

    What this function computes:
        cosine_similarity(embed(question), embed(generated_answer))

    Why this is a proxy:
        If the retrieved context is relevant, the generated answer will tend
        to be topically aligned with the question. The correlation exists but
        is not tight — the answer can be question-relevant even with poor context,
        and vice versa.

    TODO [CHUNK-TEXT]: True Context Relevance requires chunk text from the API.
        When the /chat endpoint returns chunk text, replace this with:
            mean_cosine(embed(question), embed(each_chunk))
        or implement RAGAS sentence extraction approach.

    Args:
        question:         The user's legal question.
        generated_answer: The answer generated by LegalGPT.
        cosine_fn:        Callable(str, str) -> float from get_embedder().

    Returns:
        Cosine similarity in [0.0, 1.0], or 0.0 if embedder unavailable.
    """
    if cosine_fn is None or not question or not generated_answer:
        return 0.0
    return max(0.0, cosine_fn(question, generated_answer))


def compute_reference_answer_similarity(expected_answer: str, generated_answer: str, cosine_fn) -> float:
    """
    Compute Reference Answer Similarity.

    HONEST LABEL: This is an APPROXIMATION, not RAGAS Answer Relevance.

    What RAGAS Answer Relevance actually measures (EACL 2024, Section 3.2):
        Generate N questions from the generated answer using an LLM.
        Score = mean cosine similarity between generated questions and original question.
        This does NOT use a reference answer at all.

    What this function computes:
        cosine_similarity(embed(expected_answer), embed(generated_answer))

    This is reference-based answer quality, not the RAGAS metric. It measures
    how close the generated answer is to the ground truth — a valid and useful
    metric, but a different one. Note: this is numerically identical to the
    existing `similarity` field stored on each Row.

    TODO [LLM-ANSWER-RELEVANCE]: True RAGAS Answer Relevance requires an LLM
        to generate reverse questions from the generated answer, then score
        cosine(generated_questions, original_question).

    Args:
        expected_answer:  Ground-truth answer from the dataset.
        generated_answer: The answer generated by LegalGPT.
        cosine_fn:        Callable(str, str) -> float from get_embedder().

    Returns:
        Cosine similarity in [0.0, 1.0], or 0.0 if embedder unavailable.
    """
    if cosine_fn is None or not expected_answer or not generated_answer:
        return 0.0
    return max(0.0, cosine_fn(expected_answer, generated_answer))


def compute_faithfulness_nli(
    generated_answer: str,
    retrieved_doc_names: list,
) -> Optional[float]:
    """
    Compute Faithfulness via NLI (ARES / RAGAS definition).

    HONEST STATUS: PLACEHOLDER — cannot be computed in this configuration.

    What RAGAS Faithfulness actually measures (EACL 2024, Section 3.3):
        1. Decompose the generated answer into a set of atomic factual claims
           using an LLM (e.g., "The court held X", "Section Y applies").
        2. For each claim, use NLI (Natural Language Inference) to check if
           the claim is ENTAILED by the retrieved context.
        3. Faithfulness = (# entailed claims) / (# total claims)

    What ARES Faithfulness measures (NAACL 2024, Section 3):
        Same NLI-based approach. Trains a lightweight classifier on
        (context, answer) pairs to predict faithfulness.

    Why this cannot be implemented here:
        REASON 1 — No chunk text: The /chat endpoint returns only document
            names, not the actual retrieved text chunks. NLI requires the
            actual context text to check entailment against.
        REASON 2 — No NLI model: An NLI cross-encoder
            (e.g., cross-encoder/nli-deberta-v3-small) is required.
            This is a separate ~180MB model download not currently in the
            project's dependencies.

    TODO [NLI-FAITHFULNESS]:
        Step 1: Add chunk text to the /chat API response.
        Step 2: pip install sentence-transformers (for cross-encoder).
        Step 3: Replace this placeholder with:
            from sentence_transformers import CrossEncoder
            nli_model = CrossEncoder('cross-encoder/nli-deberta-v3-small')
            # For each (claim, chunk) pair:
            #   score = nli_model.predict([(claim, chunk)])
            #   entailed = score['entailment'] > threshold
            # faithfulness = entailed_count / total_claims

    Args:
        generated_answer:   The answer generated by LegalGPT.
        retrieved_doc_names: List of retrieved document names (not chunk text).

    Returns:
        None — explicitly not computed. A float in [0.0, 1.0] when implemented.
    """
    # TODO [NLI-FAITHFULNESS]: Implement when chunk text + NLI model available.
    # Do NOT use cosine similarity as a proxy — it does not measure entailment.
    return None


# ==========================================================================
# SECTION 9: NEW — Citation and Hallucination metric helpers
# ==========================================================================

def classify_citation(row: Row) -> tuple[bool, bool]:
    """
    Classify a single row's citation accuracy.

    Legal Citation Evaluation:
        Since LegalGPT cites legal sections and acts, we evaluate whether
        the retrieved source documents match the expected case document.

    Classification:
        - correct  : at least one retrieved doc fuzzy-matches Expected_Document
                     (uses same doc_similarity threshold ≥ 0.34 as retrieval)
        - missing  : no sources were returned at all (empty retrieved_docs)
        - incorrect: sources returned but none match expected doc

    Args:
        row: A Row object after evaluate_row() has been called.

    Returns:
        (citation_correct, citation_missing): bool pair.
    """
    if not row.should_answer or not row.expected_document:
        return False, False
    if not row.system_answered:
        return False, False

    if not row.retrieved_docs:
        return False, True  # system answered but returned no sources

    for doc in row.retrieved_docs:
        if doc_similarity(row.expected_document, doc) >= 0.34:
            return True, False  # correct citation found

    return False, False  # sources returned but none matched


def compute_hallucination_rate(
    rows: list[Row],
) -> tuple[float, int, int]:
    """
    Compute Hallucination Rate — Type A only (scientifically valid).

    AUDIT NOTE: The previous implementation included "Type B" hallucination
    (faithfulness < threshold). This was REMOVED because:
        - The "faithfulness" value was cosine(generated, expected), which
          measures reference similarity, NOT factual grounding.
        - A low cosine similarity to the reference answer does NOT imply
          hallucination — the answer may simply be worded differently.
        - Using cosine similarity to the reference as a hallucination proxy
          can produce false positives on valid, well-phrased answers.

    Type A Hallucination (kept — scientifically correct):
        Definition: The system gave a confident answer to a question that
        has NO valid answer in the corpus (Should_Answer=False).
        This IS a hallucination by definition: the system invented information
        that was explicitly out-of-corpus (weather queries, fictional cases, etc.).

    Formula:
        Hallucination Rate = Type_A_count / total_answered

    TODO [NLI-HALLUCINATION]: When faithfulness_nli is implemented (see
        compute_faithfulness_nli()), add Type B:
            if Should_Answer=True AND faithfulness_nli < threshold:
                hallucinated += 1
        Only then will Type B be scientifically valid.

    Args:
        rows: All evaluated rows (post-evaluation).

    Returns:
        (rate, hallucinated_count, total_answered)
    """
    answered_rows = [
        r for r in rows
        if r.system_answered and not r.error.startswith("API error") and r.ingested is not False
    ]
    if not answered_rows:
        return 0.0, 0, 0

    hallucinated = 0
    for r in answered_rows:
        # Type A: system confidently answered a question it should have declined.
        # This is an unambiguous hallucination — the question is out-of-corpus.
        if not r.should_answer:
            hallucinated += 1
        # Type B (NLI-based) is NOT included — see docstring above.
        # TODO [NLI-HALLUCINATION]: Add Type B when faithfulness_nli is implemented.

    total = len(answered_rows)
    rate = hallucinated / total if total > 0 else 0.0
    return rate, hallucinated, total


# ==========================================================================
# SECTION 10: Per-row evaluation (EXTENDED with timing + new metrics)
# ==========================================================================

def evaluate_row(
    row: Row,
    client: LegalGPTClient,
    cosine_fn,
    top_k: int,
    sim_threshold: float,
) -> None:
    """
    Evaluate a single dataset row against the live LegalGPT API.

    Calls the /chat endpoint, parses the response, and populates all
    metric fields on the Row object in-place.

    Existing behaviour: PRESERVED UNCHANGED.
    New behaviour: adds timing measurement and per-row computation of
    Recall@K, MRR, nDCG@K, context_relevance, answer_relevance,
    faithfulness, and citation classification.

    Args:
        row:           The Row to evaluate (modified in-place).
        client:        Authenticated LegalGPTClient.
        cosine_fn:     Cosine similarity callable or None.
        top_k:         Number of retrieved documents expected per query.
        sim_threshold: Cosine threshold for answer_quality_accuracy.
    """
    if row.ingested is False:
        row.error = "NOT_INGESTED (skipped call, expected document not found in local corpus)"
        return

    # --- NEW: Start latency timer ---
    t_start = time.perf_counter()

    try:
        data = client.ask(row.question)
    except Exception as exc:  # noqa: BLE001
        row.error = f"API error: {exc}"
        return
    finally:
        # Always record elapsed time even on error (helps debug slow queries)
        row.total_time_ms = (time.perf_counter() - t_start) * 1000.0

    message = data.get("message", {})
    answer = message.get("content", "") or ""
    sources = message.get("sources", []) or []

    row.generated_answer = answer
    row.retrieved_docs = [s.get("document_name", "") for s in sources]
    row.system_answered = bool(sources) and not _REFUSAL_RE.search(answer)

    # --- Original retrieval metrics (PRESERVED) ---
    if row.should_answer and row.expected_document:
        matches = [d for d in row.retrieved_docs if doc_similarity(row.expected_document, d) >= 0.34]
        row.doc_match = len(matches) > 0
        row.precision_at_k = len(matches) / len(row.retrieved_docs) if row.retrieved_docs else 0.0

    # --- Original answer quality metrics (PRESERVED) ---
    if row.expected_answer and answer:
        row.rouge_l = rouge_l_f1(row.expected_answer, answer)
        if cosine_fn is not None:
            row.similarity = cosine_fn(row.expected_answer, answer)

    # --- NEW: Extended retrieval metrics (ARES-style) ---
    if row.should_answer and row.expected_document and row.retrieved_docs:
        # Recall@K (binary with single-doc annotations)
        row.recall_at_k = compute_recall_at_k(row.retrieved_docs, row.expected_document)

        # MRR — rank of first relevant document
        row.mrr_score, row.rank_of_first_relevant = compute_mrr_score(
            row.retrieved_docs, row.expected_document
        )

        # nDCG@K — rewarding higher-ranked relevant documents
        row.ndcg_at_k = compute_ndcg_at_k(row.retrieved_docs, row.expected_document, top_k)

    # --- Generation metrics (APPROXIMATIONS — see docstrings) ---
    if row.system_answered and cosine_fn is not None:
        # Question-Answer Similarity: proxy for context relevance.
        # APPROXIMATION: cosine(question, answer), NOT RAGAS Context Relevance.
        row.question_answer_similarity = compute_question_answer_similarity(
            row.question, answer, cosine_fn
        )
        # Reference Answer Similarity: answer quality vs. ground truth.
        # APPROXIMATION: cosine(expected, generated), NOT RAGAS Answer Relevance.
        # NOTE: numerically identical to row.similarity already computed above.
        if row.expected_answer:
            row.reference_answer_similarity = compute_reference_answer_similarity(
                row.expected_answer, answer, cosine_fn
            )

    # Faithfulness via NLI: NOT COMPUTED (placeholder — see docstring).
    # row.faithfulness_nli remains None until NLI model + chunk text available.
    row.faithfulness_nli = compute_faithfulness_nli(answer, row.retrieved_docs)

    # --- Citation classification ---
    row.citation_correct, row.citation_missing = classify_citation(row)


# ==========================================================================
# SECTION 11: Aggregate metrics computation (EXTENDED)
# ==========================================================================

def compute_metrics(rows: list[Row], sim_threshold: float) -> dict:
    """
    Compute all evaluation metrics from evaluated rows.

    Existing metrics: PRESERVED UNCHANGED in output structure.
    New metrics: added as new top-level keys in the returned dict.

    Args:
        rows:          All evaluated rows.
        sim_threshold: Cosine threshold for answer_quality_accuracy.

    Returns:
        Dict with all metric groups, ready for JSON serialisation.
    """
    scored = [r for r in rows if r.ingested is not False and not r.error.startswith("API error")]

    y_true = [1 if r.should_answer else 0 for r in scored]
    y_pred = [1 if r.system_answered else 0 for r in scored]

    # -----------------------------------------------------------------------
    # 1. CLASSIFICATION METRICS (ORIGINAL — PRESERVED)
    # -----------------------------------------------------------------------
    try:
        from sklearn.metrics import (
            accuracy_score,
            balanced_accuracy_score,
            confusion_matrix,
            f1_score,
            matthews_corrcoef,
            precision_score,
            recall_score,
            roc_auc_score,
        )

        accuracy = accuracy_score(y_true, y_pred)
        precision = precision_score(y_true, y_pred, zero_division=0)
        recall = recall_score(y_true, y_pred, zero_division=0)
        f1 = f1_score(y_true, y_pred, zero_division=0)
        cm = confusion_matrix(y_true, y_pred, labels=[1, 0]).tolist()

        # Extended classification metrics
        balanced_acc = balanced_accuracy_score(y_true, y_pred)
        mcc = matthews_corrcoef(y_true, y_pred) if len(set(y_true)) > 1 else 0.0
        # ROC-AUC AUDIT NOTE: roc_auc_score() with binary 0/1 predictions
        # (not probability scores) degenerates to a single point on the ROC
        # curve and equals Balanced Accuracy. This is NOT a proper ROC-AUC.
        # We do NOT compute it to avoid presenting a misleading number.
        # TODO [ROC-AUC]: Add confidence scores to /chat API response, then:
        #   roc_auc = roc_auc_score(y_true, confidence_scores)
        roc_auc_available = False
        roc_auc_note = "Not computed: /chat API returns no confidence scores. Add probability output to enable this."

    except ImportError:
        print("WARNING: scikit-learn not installed -- computing metrics manually instead.")
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
        tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)
        accuracy = (tp + tn) / len(y_true) if y_true else 0.0
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        cm = [[tp, fn], [fp, tn]]
        # Manual balanced accuracy = (TPR + TNR) / 2
        tpr = tp / (tp + fn) if (tp + fn) else 0.0
        tnr = tn / (tn + fp) if (tn + fp) else 0.0
        balanced_acc = (tpr + tnr) / 2
        # Manual MCC
        denom = math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
        mcc = (tp * tn - fp * fn) / denom if denom else 0.0
        roc_auc_available = False
        roc_auc_note = "Not computed: scikit-learn unavailable for fallback."

    # -----------------------------------------------------------------------
    # 2. RETRIEVAL METRICS (ORIGINAL PRESERVED + NEW EXTENDED)
    # -----------------------------------------------------------------------
    answerable = [r for r in scored if r.should_answer]

    # Original metrics
    mean_precision_at_k = (
        sum(r.precision_at_k for r in answerable) / len(answerable) if answerable else 0.0
    )
    hit_rate = sum(1 for r in answerable if r.doc_match) / len(answerable) if answerable else 0.0

    # NEW: Recall@K (binary = Hit Rate with single-doc annotations)
    mean_recall_at_k = (
        sum(r.recall_at_k for r in answerable) / len(answerable) if answerable else 0.0
    )

    # NEW: MRR — Mean Reciprocal Rank
    mrr_scores = [r.mrr_score for r in answerable]
    mean_mrr = sum(mrr_scores) / len(mrr_scores) if mrr_scores else 0.0

    # NEW: nDCG@K — Normalized Discounted Cumulative Gain
    ndcg_scores = [r.ndcg_at_k for r in answerable]
    mean_ndcg = sum(ndcg_scores) / len(ndcg_scores) if ndcg_scores else 0.0

    # -----------------------------------------------------------------------
    # 3. ANSWER QUALITY METRICS (ORIGINAL PRESERVED)
    # -----------------------------------------------------------------------
    sims = [r.similarity for r in answerable if r.similarity > 0]
    mean_similarity = sum(sims) / len(sims) if sims else 0.0
    rouges = [r.rouge_l for r in answerable if r.rouge_l > 0]
    mean_rouge = sum(rouges) / len(rouges) if rouges else 0.0
    high_sim_correct = sum(1 for r in answerable if r.similarity >= sim_threshold)
    answer_quality_accuracy = high_sim_correct / len(answerable) if answerable else 0.0

    # -----------------------------------------------------------------------
    # 4. GENERATION METRICS (APPROXIMATIONS — labelled honestly)
    # -----------------------------------------------------------------------
    answered_rows = [r for r in scored if r.system_answered]

    # Question-Answer Similarity (PROXY for Context Relevance)
    qa_sim_scores = [r.question_answer_similarity for r in answered_rows if r.question_answer_similarity > 0]
    mean_question_answer_similarity = sum(qa_sim_scores) / len(qa_sim_scores) if qa_sim_scores else 0.0

    # Reference Answer Similarity (PROXY for Answer quality; NOT RAGAS Answer Relevance)
    ref_sim_scores = [r.reference_answer_similarity for r in answered_rows if r.reference_answer_similarity > 0]
    mean_reference_answer_similarity = sum(ref_sim_scores) / len(ref_sim_scores) if ref_sim_scores else 0.0

    # Faithfulness NLI: always None in this implementation (placeholder)
    # When implemented, this will be a float in [0.0, 1.0]
    mean_faithfulness_nli = None  # TODO [NLI-FAITHFULNESS]

    # Hallucination Rate — Type A only (scientifically valid)
    hallucination_rate, hallucinated_count, total_answered = compute_hallucination_rate(scored)

    # -----------------------------------------------------------------------
    # 5. LEGAL CITATION METRICS (NEW)
    # -----------------------------------------------------------------------
    # Only score rows where system actually answered an answerable question
    answerable_answered = [r for r in answerable if r.system_answered]
    n_cit_total = len(answerable_answered)
    n_cit_correct = sum(1 for r in answerable_answered if r.citation_correct)
    n_cit_missing = sum(1 for r in answerable_answered if r.citation_missing)
    n_cit_incorrect = n_cit_total - n_cit_correct - n_cit_missing

    citation_accuracy = n_cit_correct / n_cit_total if n_cit_total else 0.0
    citation_incorrect_rate = n_cit_incorrect / n_cit_total if n_cit_total else 0.0
    citation_missing_rate = n_cit_missing / n_cit_total if n_cit_total else 0.0

    # -----------------------------------------------------------------------
    # 6. RUNTIME / LATENCY METRICS (NEW)
    # -----------------------------------------------------------------------
    timed_rows = [r for r in scored if r.total_time_ms > 0]
    avg_total_time_ms = (
        sum(r.total_time_ms for r in timed_rows) / len(timed_rows) if timed_rows else 0.0
    )
    # Retrieval time is not separately measurable; see TODO [TIMING].
    avg_retrieval_time_ms = None  # TODO: parse from X-Retrieval-Time-Ms header
    avg_generation_time_ms = None  # TODO: parse from X-Generation-Time-Ms header

    skipped = [r for r in rows if r.ingested is False]

    # -----------------------------------------------------------------------
    # ASSEMBLE FULL METRICS DICT
    # -----------------------------------------------------------------------
    return {
        # --- Dataset stats ---
        "num_total_rows": len(rows),
        "num_scored": len(scored),
        "num_skipped_not_ingested": len(skipped),
        "skipped_expected_documents": [r.expected_document for r in skipped],

        # --- Section 1: Classification (ORIGINAL preserved + NEW extended) ---
        "classification_metrics": {
            "description": (
                "y_true = should the system answer confidently (Should_Answer column); "
                "y_pred = did the system actually answer confidently (no refusal phrase, "
                "sources retrieved). confusion_matrix rows/cols ordered [answered, declined]."
            ),
            "accuracy": round(accuracy, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "confusion_matrix": cm,
            "balanced_accuracy": round(balanced_acc, 4),
            "mcc": round(mcc, 4),
            "roc_auc": None,
            "roc_auc_note": roc_auc_note,
        },

        # --- Section 2: Retrieval (ORIGINAL preserved + NEW extended) ---
        "retrieval_metrics": {
            "description": (
                "Computed only over Should_Answer=True rows that were ingested. "
                "Recall@K equals Hit Rate under single-document annotations — "
                "see TODO [MULTI-DOC] to upgrade."
            ),
            "mean_precision_at_k": round(mean_precision_at_k, 4),
            "mean_recall_at_k": round(mean_recall_at_k, 4),
            "hit_rate": round(hit_rate, 4),
            "mean_mrr": round(mean_mrr, 4),
            "mean_ndcg_at_k": round(mean_ndcg, 4),
        },

        # --- Answer quality (ORIGINAL preserved) ---
        "answer_quality_metrics": {
            "description": (
                f"similarity via sentence-transformers cosine (all-MiniLM-L6-v2); "
                f"answer_quality_accuracy = fraction with similarity >= {sim_threshold}"
            ),
            "mean_semantic_similarity": round(mean_similarity, 4),
            "mean_rouge_l_f1": round(mean_rouge, 4),
            "answer_quality_accuracy": round(answer_quality_accuracy, 4),
        },

        # --- Section 3: Generation metrics (APPROXIMATIONS — labelled honestly) ---
        "generation_metrics": {
            "description": (
                "APPROXIMATIONS inspired by RAGAS (EACL 2024). "
                "question_answer_similarity = cosine(question, answer) — proxy for Context Relevance. "
                "reference_answer_similarity = cosine(expected, generated) — proxy for answer quality. "
                "faithfulness_nli = None — requires chunk text + NLI model (see TODO [NLI-FAITHFULNESS]). "
                "hallucination_rate = Type A only (answered when should decline)."
            ),
            "question_answer_similarity": round(mean_question_answer_similarity, 4),
            "reference_answer_similarity": round(mean_reference_answer_similarity, 4),
            "faithfulness_nli": mean_faithfulness_nli,
            "hallucination_rate": round(hallucination_rate, 4),
            "hallucinated_count": hallucinated_count,
            "total_answered": total_answered,
        },

        # --- Section 4: Citation Accuracy (NEW) ---
        "citation_metrics": {
            "description": (
                "Evaluated on Should_Answer=True rows where system_answered=True. "
                "correct = retrieved doc matches Expected_Document (Jaccard >= 0.34). "
                "incorrect = sources returned but none match. missing = no sources at all."
            ),
            "citation_accuracy": round(citation_accuracy, 4),
            "incorrect_citation_rate": round(citation_incorrect_rate, 4),
            "missing_citation_rate": round(citation_missing_rate, 4),
            "n_correct": n_cit_correct,
            "n_incorrect": n_cit_incorrect,
            "n_missing": n_cit_missing,
            "n_total_answered_answerable": n_cit_total,
        },

        # --- Section 5: Runtime / Latency (NEW) ---
        "runtime_metrics": {
            "description": (
                "Total round-trip latency per /chat call measured client-side. "
                "Retrieval and generation times are not separately measurable "
                "from the atomic /chat endpoint — see TODO [TIMING]."
            ),
            "avg_total_time_ms": round(avg_total_time_ms, 1),
            "avg_retrieval_time_ms": avg_retrieval_time_ms,
            "avg_generation_time_ms": avg_generation_time_ms,
            "n_timed_rows": len(timed_rows),
        },
    }


# ==========================================================================
# SECTION 12: CSV output (EXTENDED with new per-row columns)
# ==========================================================================

def write_results_csv(rows: list[Row], path: Path) -> None:
    """
    Write per-question evaluation results to a CSV file.

    Extended with new columns for all ARES/RAGAS metrics.
    Existing columns are preserved in their original positions.
    """
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        # Header — original columns first (preserved), then new columns
        writer.writerow([
            # --- Original columns (PRESERVED) ---
            "ID", "Question", "Category", "Should_Answer", "Ingested",
            "Expected_Answer", "Generated_Answer", "Expected_Document",
            "Retrieved_Documents", "System_Answered", "Doc_Match",
            "Precision_at_k", "Semantic_Similarity", "ROUGE_L_F1",
            # --- Extended retrieval metrics ---
            "Recall_at_K", "MRR_Score", "Rank_First_Relevant", "nDCG_at_K",
            # --- Generation metrics (APPROXIMATIONS — see docstrings) ---
            # Renamed from Context_Relevance/Answer_Relevance/Faithfulness
            # to reflect what is actually computed vs. the RAGAS definitions.
            "Question_Answer_Similarity",   # proxy for context relevance
            "Reference_Answer_Similarity",  # proxy for answer quality (= Semantic_Similarity)
            "Faithfulness_NLI",             # None = not computed (requires NLI model)
            # --- Citation metrics ---
            "Citation_Correct", "Citation_Missing",
            # --- Latency ---
            "Total_Time_Ms",
            # --- Error (moved to end) ---
            "Error",
        ])
        for r in rows:
            writer.writerow([
                # Original
                r.id, r.question, r.category, r.should_answer, r.ingested,
                r.expected_answer, r.generated_answer, r.expected_document,
                "; ".join(r.retrieved_docs), r.system_answered, r.doc_match,
                round(r.precision_at_k, 4), round(r.similarity, 4),
                round(r.rouge_l, 4),
                # Extended retrieval
                round(r.recall_at_k, 4),
                round(r.mrr_score, 4),
                r.rank_of_first_relevant,
                round(r.ndcg_at_k, 4),
                # Generation metrics (approximations)
                round(r.question_answer_similarity, 4),
                round(r.reference_answer_similarity, 4),
                r.faithfulness_nli,  # None = not computed
                # Citation
                r.citation_correct,
                r.citation_missing,
                # Latency
                round(r.total_time_ms, 1),
                # Error
                r.error,
            ])


# ==========================================================================
# SECTION 13: Report printing (EXTENDED — 5-section conference format)
# ==========================================================================

def print_report(metrics: dict) -> None:
    """
    Print the full evaluation report in conference-paper format.

    Format follows the 5-section structure requested:
      1. Classification Performance
      2. Retrieval Performance
      3. Generation Performance
      4. Legal Citation Evaluation
      5. Runtime Performance

    All original metric values are preserved in their existing positions.
    New metrics are added to their respective sections.
    """
    W = 57  # column width for separator lines

    def sep(char="="):
        print(char * W)

    def header(title: str):
        sep()
        print(f" {title}")
        sep()

    def sub(title: str):
        print(f"\n  {title}")
        print("  " + "-" * (W - 2))

    def row(label: str, value: str, indent: int = 4):
        print(f"{' ' * indent}{label:<30} {value}")

    # -----------------------------------------------------------------------
    # Title block
    # -----------------------------------------------------------------------
    print()
    sep()
    print("       LEGALGPT EVALUATION REPORT")
    sep()
    print()
    print("  Dataset")
    print("  " + "-" * 36)
    all_rows = metrics["num_total_rows"]
    scored = metrics["num_scored"]
    # Answerable / Unanswerable breakdown from classification metrics description
    cls_desc = metrics["classification_metrics"].get("description", "")
    # Count from raw: y_true counts are embedded in the confusion matrix
    cm_data = metrics["classification_metrics"]["confusion_matrix"]
    # cm is ordered [answered, declined] x [answered, declined] (Pos=Should_Answer)
    # TP + FN = total Should_Answer=True rows scored
    answerable_scored = cm_data[0][0] + cm_data[0][1]  # TP + FN
    unanswerable_scored = cm_data[1][0] + cm_data[1][1]  # FP + TN
    row("Total Questions     :", str(all_rows))
    row("Scored              :", str(scored))
    row("  Answerable (Should_Answer=True) :", str(answerable_scored))
    row("  Unanswerable (Should_Answer=False):", str(unanswerable_scored))
    row("Skipped (not ingested):", str(metrics["num_skipped_not_ingested"]))
    if metrics["skipped_expected_documents"]:
        print("\n  Skipped (expected document not in local corpus):")
        for d in metrics["skipped_expected_documents"]:
            print(f"    - {d}")

    # -----------------------------------------------------------------------
    # Section 1: Classification Performance
    # -----------------------------------------------------------------------
    header("1. Classification Performance")
    cls = metrics["classification_metrics"]
    print()
    row("Accuracy          :", f"{cls['accuracy']:.4f}")
    row("Precision         :", f"{cls['precision']:.4f}")
    row("Recall            :", f"{cls['recall']:.4f}")
    row("F1 Score          :", f"{cls['f1']:.4f}")
    print()
    row("Balanced Accuracy :", f"{cls['balanced_accuracy']:.4f}")
    row("MCC               :", f"{cls['mcc']:.4f}")
    row("ROC-AUC           :", f"N/A — {cls.get('roc_auc_note', 'not computed')}")
    print()
    print("  Confusion Matrix  [rows: actual | cols: predicted]")
    print("                    [Pos=Should_Answer, Neg=Should_Decline]")
    cm = cls["confusion_matrix"]
    print(f"    [[{cm[0][0]:>4}, {cm[0][1]:>4}],   ← Should Have Answered")
    print(f"     [{cm[1][0]:>4}, {cm[1][1]:>4}]]   ← Should Have Declined")
    print("      ↑ Answered   ↑ Declined (predicted)")

    # -----------------------------------------------------------------------
    # Section 2: Retrieval Performance
    # -----------------------------------------------------------------------
    header("2. Retrieval Performance")
    ret = metrics["retrieval_metrics"]
    print()
    row("Mean Precision@K  :", f"{ret['mean_precision_at_k']:.4f}")
    row("Mean Recall@K     :", f"{ret['mean_recall_at_k']:.4f}"
        "  [= Hit Rate with single-doc annotations]")
    row("Hit Rate          :", f"{ret['hit_rate']:.4f}")
    row("Mean MRR          :", f"{ret['mean_mrr']:.4f}")
    row("Mean nDCG@K       :", f"{ret['mean_ndcg_at_k']:.4f}")
    print()
    print("  NOTE: Recall@K = Hit Rate because evaluation_dataset.csv has")
    print("        one Expected_Document per question. See TODO [MULTI-DOC]")
    print("        to add multi-document annotations for richer metrics.")

    # -----------------------------------------------------------------------
    # Section 3: Generation Performance
    # -----------------------------------------------------------------------
    header("3. Generation Performance")
    gen = metrics["generation_metrics"]
    aq = metrics["answer_quality_metrics"]
    print()
    print("  [APPROXIMATIONS — not exact RAGAS metrics; see docstrings]")
    print()
    row("Question-Ans. Sim.:", f"{gen['question_answer_similarity']:.4f}"
        "  [cosine(question, answer) — PROXY for Context Relevance]")
    row("Ref. Answer Sim.  :", f"{gen['reference_answer_similarity']:.4f}"
        "  [cosine(expected, generated) — PROXY for answer quality]")
    faith_val = gen.get('faithfulness_nli')
    if faith_val is None:
        row("Faithfulness (NLI):", "NOT COMPUTED"
            "  [requires chunk text + NLI model — see TODO [NLI-FAITHFULNESS]]")
    else:
        row("Faithfulness (NLI):", f"{faith_val:.4f}")
    print()
    hallu_pct = gen["hallucination_rate"] * 100
    row("Hallucination Rate:", f"{hallu_pct:.1f}%"
        f"  ({gen['hallucinated_count']}/{gen['total_answered']} answered"
        f"; Type A only: answered when should decline)")
    print()
    print("  Existing answer quality metrics (unchanged):")
    row("Semantic Similarity:", f"{aq['mean_semantic_similarity']:.4f}")
    row("ROUGE-L F1        :", f"{aq['mean_rouge_l_f1']:.4f}")
    row("Answer Qual. Acc. :", f"{aq['answer_quality_accuracy']:.4f}"
        f"  [cosine >= {metrics.get('sim_threshold_used', '0.55')}]")
    print()
    print("  TODO [CHUNK-TEXT]: True Context Relevance and Faithfulness")
    print("  require retrieved chunk text from the /chat API.")
    print("  TODO [NLI-FAITHFULNESS]: Add cross-encoder/nli-deberta-v3-small")
    print("  for claim-level entailment checking.")

    # -----------------------------------------------------------------------
    # Section 4: Legal Citation Evaluation
    # -----------------------------------------------------------------------
    header("4. Legal Citation Evaluation")
    cit = metrics["citation_metrics"]
    print()
    n = cit["n_total_answered_answerable"]
    row("Citation Accuracy :", f"{cit['citation_accuracy']*100:.1f}%"
        f"  ({cit['n_correct']}/{n} answered answerable questions)")
    row("Incorrect Citation:", f"{cit['incorrect_citation_rate']*100:.1f}%"
        f"  ({cit['n_incorrect']}/{n} — sources returned but wrong doc)")
    row("Missing Citation  :", f"{cit['missing_citation_rate']*100:.1f}%"
        f"  ({cit['n_missing']}/{n} — no sources returned with answer)")
    print()
    print("  Citation = retrieved document fuzzy-matches Expected_Document")
    print("  (Jaccard token overlap >= 0.34, same threshold as retrieval).")

    # -----------------------------------------------------------------------
    # Section 5: Runtime Performance
    # -----------------------------------------------------------------------
    header("5. Runtime Performance")
    rt = metrics["runtime_metrics"]
    print()
    avg_ms = rt["avg_total_time_ms"]
    avg_sec = avg_ms / 1000.0
    row("Avg Total Response :", f"{avg_ms:.0f} ms  ({avg_sec:.2f} sec)")
    if rt["avg_retrieval_time_ms"] is None:
        row("Avg Retrieval Time :", "N/A — see TODO [TIMING]")
    else:
        row("Avg Retrieval Time :", f"{rt['avg_retrieval_time_ms']:.0f} ms")
    if rt["avg_generation_time_ms"] is None:
        row("Avg Generation Time:", "N/A — see TODO [TIMING]")
    else:
        row("Avg Generation Time:", f"{rt['avg_generation_time_ms']:.0f} ms")
    row("Timed Rows         :", str(rt["n_timed_rows"]))
    print()
    print("  NOTE: /chat endpoint runs retrieval + generation atomically.")
    print("        Only total round-trip time is measurable client-side.")
    print("        Add X-Retrieval-Time-Ms header to FastAPI to split.")

    # -----------------------------------------------------------------------
    # Footer
    # -----------------------------------------------------------------------
    sep()
    print("  Evaluation INSPIRED BY ARES (NAACL 2024) and RAGAS (EACL 2024).")
    print("  Exact metrics: Accuracy, Precision, Recall, F1, Balanced Acc,")
    print("    MCC, Precision@K, Hit Rate, Recall@K, MRR, nDCG@K.")
    print("  Approximations: Question-Ans. Similarity, Ref. Answer Similarity.")
    print("  Not implemented: RAGAS Faithfulness, RAGAS Answer Relevance,")
    print("    RAGAS Context Relevance (all require chunk text + LLM/NLI).")
    sep()
    print()


# ==========================================================================
# SECTION 14: CLI entry point (EXTENDED with new flags)
# ==========================================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate LegalGPT's RAG pipeline against a labeled dataset. "
            "Produces a conference-paper-quality evaluation report following "
            "ARES (NAACL 2024) and RAGAS (EACL 2024) frameworks."
        )
    )
    # --- Original arguments (PRESERVED) ---
    parser.add_argument("--base-url", default="http://localhost:8000", help="Running backend URL.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--email", default=None, help="Evaluation account email (or prompted).")
    parser.add_argument("--password", default=None, help="Evaluation account password (or prompted).")
    parser.add_argument("--sim-threshold", type=float, default=0.55,
                        help="Cosine similarity threshold for answer quality accuracy.")
    parser.add_argument("--top-k", type=int, default=5,
                        help="Expected number of retrieved documents per query.")
    parser.add_argument("--limit", type=int, default=None,
                        help="Only run the first N rows (smoke test).")
    parser.add_argument(
        "--skip-corpus-check", action="store_true",
        help="Don't pre-check ingested documents (call the API for every row regardless).",
    )
    # NOTE: --faithfulness-threshold argument removed.
    # AUDIT REASON: The threshold was used for Type B hallucination detection
    # (faithfulness < threshold => hallucinated). Type B was removed because
    # cosine similarity to a reference answer does not measure hallucination.
    # When NLI-based faithfulness is implemented (TODO [NLI-FAITHFULNESS]),
    # this flag can be re-added with a scientifically valid threshold.
    args = parser.parse_args()

    rows = load_dataset(args.dataset)
    if args.limit:
        rows = rows[: args.limit]
    print(f"Loaded {len(rows)} questions from {args.dataset}")

    if not args.skip_corpus_check:
        import asyncio

        print("Checking which expected documents are actually ingested locally...")
        ingested_names = asyncio.run(check_ingested_documents())
        print(f"Found {len(ingested_names)} ingested documents in the local DB.")
        mark_corpus_coverage(rows, ingested_names)
        n_skip = sum(1 for r in rows if r.ingested is False)
        if n_skip:
            print(
                f"WARNING: {n_skip} question(s) reference a case not found in your "
                f"local corpus. These will be skipped from scoring -- see results.csv."
            )

    client = LegalGPTClient(args.base_url)
    authenticate(client, args.email, args.password)

    cosine_fn = get_embedder()

    print(f"\nRunning {len(rows)} questions against {args.base_url} ...")
    for i, row in enumerate(rows, start=1):
        evaluate_row(row, client, cosine_fn, args.top_k, args.sim_threshold)
        status = row.error or (
            f"answered | ref_sim={row.reference_answer_similarity:.2f} | "
            f"nDCG={row.ndcg_at_k:.2f} | {row.total_time_ms:.0f}ms"
            if row.system_answered
            else "declined"
        )
        print(f"  [{i}/{len(rows)}] {row.id}: {status}")

    write_results_csv(rows, args.output)
    print(f"\nWrote per-question results to {args.output}")

    metrics = compute_metrics(rows, args.sim_threshold)
    # Store sim_threshold in metrics for report display
    metrics["sim_threshold_used"] = str(args.sim_threshold)

    with open(args.summary, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"Wrote metrics summary to {args.summary}")

    print_report(metrics)


if __name__ == "__main__":
    main()
