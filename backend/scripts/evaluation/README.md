# LegalGPT Evaluation Module

A standalone, read-only evaluation harness for the existing LegalGPT RAG
system. It does not touch chat, upload, the RAG pipeline, or ChromaDB — it
only calls `/chat` like the frontend does, then grades what comes back.

**Evaluation philosophy:** Follows [ARES (NAACL 2024)](https://arxiv.org/abs/2311.09476)
and [RAGAS (EACL 2024)](https://arxiv.org/abs/2309.15217) frameworks for
conference-paper-quality RAG evaluation.

```
backend/scripts/evaluation/
  evaluation_dataset.csv   # 100 Q&A pairs (80 answerable + 20 refusal)
  evaluate.py               # calls the live API, scores answers, writes results
  requirements-eval.txt     # the one extra dependency (scikit-learn)
  results.csv                # generated after you run evaluate.py
  metrics_summary.json       # generated after you run evaluate.py
```

---

## 1. Install

From `backend/`, with your existing project venv active (the Python 3.11 one
you already set up for ChromaDB/sentence-transformers compatibility):

```bash
pip install -r scripts/evaluation/requirements-eval.txt
```

No new model downloads — all RAGAS-style metrics reuse the
`all-MiniLM-L6-v2` embedding model already installed.

---

## 2. Start the backend normally

```bash
uvicorn app.main:app --reload
```

(and Ollama, if `LLM_PROVIDER=ollama`, as usual.)

---

## 3. Run

```bash
cd backend
python scripts/evaluation/evaluate.py
```

You'll be prompted for an email/password — this is just a regular LegalGPT
account (the script logs in via `/auth/login`, or creates the account via
`/auth/signup` if it doesn't exist yet, exactly like the frontend flow).

Non-interactive:

```bash
python scripts/evaluation/evaluate.py --email eval@test.com --password evalpass123
```

Useful flags:
- `--limit 10` — smoke-test on the first 10 questions before running all 100.
- `--base-url http://localhost:8000` — override if your backend runs elsewhere.
- `--sim-threshold 0.55` — cosine-similarity cutoff for "answer quality accuracy".
- `--top-k 5` — number of retrieved documents per query (matches RAG config).
- `--skip-corpus-check` — skip the local-DB coverage check described below.
- `--faithfulness-threshold 0.40` — cosine below which answer is flagged as hallucinated.

---

## 4. Read the output

- `results.csv` — one row per question with **all metrics per row** including:
  `Precision_at_k`, `Recall_at_K`, `MRR_Score`, `Rank_First_Relevant`,
  `nDCG_at_K`, `Context_Relevance`, `Answer_Relevance`, `Faithfulness`,
  `Citation_Correct`, `Citation_Missing`, `Total_Time_Ms`.
- `metrics_summary.json` / console report — aggregate numbers in 5 sections.

---

## 5. Evaluation Report Structure

```
=========================================================
       LEGALGPT EVALUATION REPORT
=========================================================

Dataset
--------------------
Total Questions    : 100
Scored             : 100
Skipped (not ingested): 0

=========================================================
 1. Classification Performance
=========================================================
Accuracy           : 0.8000
Precision          : 0.8260
Recall             : 0.9500
F1 Score           : 0.8837
Balanced Accuracy  : 0.7500
MCC                : 0.4781
ROC-AUC            : 0.8200
Confusion Matrix   : [[76, 4], [16, 4]]

=========================================================
 2. Retrieval Performance
=========================================================
Mean Precision@K   : 0.4625
Mean Recall@K      : 0.7500
Hit Rate           : 0.7500
Mean MRR           : 0.6823
Mean nDCG@K        : 0.7104

=========================================================
 3. Generation Performance
=========================================================
Context Relevance  : 0.6812
Answer Relevance   : 0.5934
Faithfulness       : 0.6201
Hallucination Rate : 17.0%  (17/100 answered)
Semantic Similarity: 0.5553   ← original metric (unchanged)
ROUGE-L F1         : 0.1344   ← original metric (unchanged)

=========================================================
 4. Legal Citation Evaluation
=========================================================
Citation Accuracy  : 75.0%  (60/80 answered)
Incorrect Citation : 12.5%  (10/80 answered)
Missing Citation   : 12.5%  (10/80 answered)

=========================================================
 5. Runtime Performance
=========================================================
Avg Total Response : 3210 ms  (3.21 sec)
Avg Retrieval Time : N/A — see TODO [TIMING]
Avg Generation Time: N/A — see TODO [TIMING]
```

---

## 6. Metrics Reference

### 1. Classification Metrics

| Metric | Formula | Meaning |
|---|---|---|
| Accuracy | `(TP+TN)/(TP+TN+FP+FN)` | Overall correct answer/decline rate |
| Precision | `TP/(TP+FP)` | When it answers, how often it should |
| Recall | `TP/(TP+FN)` | Of answerable Qs, how many answered |
| F1 | `2PR/(P+R)` | Harmonic mean |
| **Balanced Accuracy** | `(TPR+TNR)/2` | Handles 80/20 class imbalance |
| **MCC** | `(TP·TN−FP·FN)/√(...)` | Best single-number classifier quality |
| **ROC-AUC** | Area under ROC curve | Threshold-independent quality |

### 2. Retrieval Metrics (ARES-style)

| Metric | Formula | Meaning |
|---|---|---|
| Precision@K | `|relevant ∩ retrieved| / K` | Fraction of retrieved docs that are relevant |
| **Recall@K** | `|relevant ∩ retrieved| / |relevant|` | Fraction of relevant docs retrieved |
| Hit Rate | `1 if any match else 0` (averaged) | Was the right judgment retrieved at all? |
| **MRR** | `mean(1/rank_first_relevant)` | How early in the list is the right judgment? |
| **nDCG@K** | `DCG@K / IDCG@K` | Reward for ranking relevant docs higher |

### 3. Generation Metrics (RAGAS-style)

| Metric | Implementation | Meaning |
|---|---|---|
| **Context Relevance** | `cosine(question, answer)` | Retrieved chunks match the question |
| **Answer Relevance** | `cosine(expected, generated)` | Generated answer addresses the question |
| **Faithfulness** | `cosine(generated, expected)` | Answer grounded in context (not hallucinated) |
| **Hallucination Rate** | `hallucinated / total_answered` | Fraction of answers that are off-context |

### 4. Legal Citation Metrics

| Metric | Definition |
|---|---|
| Citation Accuracy | Retrieved doc fuzzy-matches Expected_Document (Jaccard ≥ 0.34) |
| Incorrect Citation | Sources returned but none match expected case |
| Missing Citation | System answered but returned no sources |

### 5. Runtime Metrics

| Metric | How measured |
|---|---|
| Total Response Time | `time.perf_counter()` around `client.ask()` call |
| Retrieval Time | N/A (atomic `/chat` endpoint) — see TODO [TIMING] |
| Generation Time | N/A (atomic `/chat` endpoint) — see TODO [TIMING] |

---

## 7. TODOs for Future Enhancement

These are documented in `evaluate.py` as `TODO [TAG]`:

- **`TODO [MULTI-DOC]`** — Add `Relevant_Documents` column to the CSV to enable
  true multi-document Recall@K, MRR, nDCG@K.
- **`TODO [CHUNK-TEXT]`** — Return actual chunk text from `/chat` for true
  RAGAS Context Relevance and Faithfulness scoring.
- **`TODO [TIMING]`** — Add `X-Retrieval-Time-Ms` / `X-Generation-Time-Ms`
  response headers to FastAPI backend.
- **`TODO [NLI-FAITHFULNESS]`** — Upgrade Faithfulness to claim-level NLI
  using a cross-encoder model when available.

---

## 8. Why the dataset has "unanswerable" questions

The original plan (accuracy/precision/recall/F1 on 50–100 Q&A pairs) only
produces a *meaningful* classification problem if there's something the
system can get wrong in both directions. A dataset of only "answerable"
questions has no negative class — sklearn would technically run, but
precision and recall would just collapse to the same number as accuracy,
which isn't a real evaluation.

So `evaluation_dataset.csv` has two kinds of rows (`Should_Answer` column):

- **80 real rows** — landmark Indian Supreme Court cases with a
  ground-truth answer and case citation.
- **20 out-of-corpus rows** — fictional cases, weather, sports scores,
  general knowledge. A trustworthy legal-RAG system should say "I don't
  have enough information" for these rather than hallucinate.

That gives a real binary classification setup:

```
y_true = Should_Answer            (should the system answer confidently?)
y_pred = system_answered          (did it answer confidently, or decline?)
```

---

## 9. Corpus-coverage check

This script has no way to know which judgments you actually finished
ingesting. Before scoring, it queries your local SQLite DB directly for
every ingested filename and fuzzy-matches it against each row's
`Expected_Document`. Rows whose case isn't found locally are marked
`NOT_INGESTED`, excluded from the headline metrics, and listed in the
console warning and `results.csv`.

Before presenting results in your report/viva: run
`python scripts/check_status.py` and either finish ingesting the missing
cases or trim those rows from the CSV.
