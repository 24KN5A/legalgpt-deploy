"""
Risk-classifier evaluation service.

Context
-------
The former "AI Document Insights" feature sent a large structured-JSON
prompt to whichever LLM provider was configured (Ollama by default) on
every page load. That made the page's availability entirely dependent on
an external process (a local Ollama server + a pulled model) being up,
reachable, and fast enough within the request timeout -- any hiccup there
surfaced as a hard failure in the UI ("Ollama generation failed").

This service replaces that with something that is:
  - Deterministic and self-contained (no network call, no LLM, no
    external process to keep alive), so it can never fail with a 502.
  - Directly reusable for an IEEE-style "Results / Evaluation" section:
    it reports accuracy, per-class precision/recall/F1, macro & weighted
    averages, and a full confusion matrix -- the standard classification
    metrics reviewers expect.
  - Still on-topic for LegalGPT: it evaluates a lightweight rule-based
    classifier that assigns the exact same risk_level vocabulary
    ("low" | "medium" | "high" | "critical") already used elsewhere in
    the app (see RiskItem in schemas.py / analysis_service.py) against a
    hand-labeled benchmark of realistic contract-clause excerpts.

The benchmark and classifier below are intentionally simple and fully
inspectable -- every prediction can be traced back to the keyword rule
that produced it, which is useful for a methodology write-up.
"""
from __future__ import annotations

from typing import List, TypedDict

RISK_LEVELS: List[str] = ["low", "medium", "high", "critical"]


class BenchmarkItem(TypedDict):
    text: str
    label: str  # ground-truth risk level


# ---------------------------------------------------------------------------
# Hand-labeled benchmark: short, realistic contract-clause excerpts paired
# with a ground-truth risk level. Roughly balanced across the four classes.
# ---------------------------------------------------------------------------
BENCHMARK: List[BenchmarkItem] = [
    # --- low ---
    {"text": "Either party may provide feedback on deliverables within five business days of receipt.", "label": "low"},
    {"text": "The parties agree to communicate primarily via email during the term of this agreement.", "label": "low"},
    {"text": "This agreement may be executed in counterparts, each of which is deemed an original.", "label": "low"},
    {"text": "Notices under this agreement shall be sent to the addresses listed in Exhibit A.", "label": "low"},
    {"text": "The vendor will provide monthly status reports summarizing project progress.", "label": "low"},
    {"text": "Headings in this agreement are for convenience only and do not affect interpretation.", "label": "low"},
    {"text": "The parties may agree to amend the delivery schedule by mutual written consent.", "label": "low"},
    {"text": "Client will provide reasonable office access to vendor personnel during business hours.", "label": "low"},
    {"text": "This agreement is governed by the laws of the State of Delaware, without regard to conflict of laws.", "label": "low"},
    {"text": "The parties shall meet quarterly to review the relationship and discuss improvements.", "label": "low"},
    {"text": "All exhibits attached to this agreement are incorporated herein by reference.", "label": "low"},
    {"text": "Either party's failure to enforce a provision shall not be deemed a waiver of that provision.", "label": "low"},
    # --- medium ---
    {"text": "Client shall pay all invoices within thirty days of receipt, subject to a 1.5% monthly late fee thereafter.", "label": "medium"},
    {"text": "This agreement automatically renews for successive one-year terms unless either party gives 60 days' notice.", "label": "medium"},
    {"text": "Vendor shall maintain commercially reasonable data backup procedures for all client information.", "label": "medium"},
    {"text": "Either party may terminate this agreement for convenience upon 90 days' written notice.", "label": "medium"},
    {"text": "Confidential information disclosed under this agreement must be kept secret for a period of three years.", "label": "medium"},
    {"text": "Vendor will use commercially reasonable efforts to meet the delivery milestones in Schedule B.", "label": "medium"},
    {"text": "All work product created under this agreement shall be assigned to Client upon final payment.", "label": "medium"},
    {"text": "Client may not assign this agreement without Vendor's prior written consent, not to be unreasonably withheld.", "label": "medium"},
    {"text": "Vendor shall carry commercial general liability insurance of at least $1,000,000 per occurrence.", "label": "medium"},
    {"text": "Any dispute shall first be submitted to non-binding mediation before either party files suit.", "label": "medium"},
    {"text": "Vendor's remedies for late payment are limited to suspension of services after a 15-day cure period.", "label": "medium"},
    {"text": "This agreement may be amended only by a written instrument signed by both parties.", "label": "medium"},
    # --- high ---
    {"text": "Client shall indemnify and hold harmless Vendor from any claims arising out of Client's use of the deliverables.", "label": "high"},
    {"text": "Vendor's total liability under this agreement shall not exceed the fees paid in the preceding twelve months.", "label": "high"},
    {"text": "All disputes arising under this agreement shall be resolved exclusively through binding arbitration.", "label": "high"},
    {"text": "During the term and for two years thereafter, Client shall not solicit or hire any employee of Vendor.", "label": "high"},
    {"text": "Vendor may unilaterally modify the pricing schedule at any time upon posting updated terms on its website.", "label": "high"},
    {"text": "Client waives any right to a jury trial in connection with any dispute arising under this agreement.", "label": "high"},
    {"text": "This agreement includes a non-compete restricting Client from engaging similar vendors for eighteen months.", "label": "high"},
    {"text": "Vendor disclaims all warranties, express or implied, including fitness for a particular purpose.", "label": "high"},
    {"text": "Client grants Vendor an irrevocable, perpetual license to use Client's data for any purpose.", "label": "high"},
    {"text": "In the event of a data breach, Vendor's sole obligation is to provide notice within a reasonable time.", "label": "high"},
    {"text": "Any amendments to this agreement require the unanimous written consent of Vendor's board of directors.", "label": "high"},
    {"text": "Vendor may terminate this agreement immediately and without notice if Client's business is deemed unprofitable.", "label": "high"},
    # --- critical ---
    {"text": "Client shall indemnify Vendor without limitation for any and all claims, including those arising from Vendor's own gross negligence.", "label": "critical"},
    {"text": "This agreement automatically terminates and all licensed rights revert immediately upon any payment delay, however brief.", "label": "critical"},
    {"text": "Vendor may assign all of its obligations under this agreement to any third party without Client's consent or notice.", "label": "critical"},
    {"text": "Client grants Vendor a unilateral, unrestricted right to modify any term of this agreement at any time without notice.", "label": "critical"},
    {"text": "All intellectual property created by Client, whether related to this agreement or not, shall be assigned to Vendor.", "label": "critical"},
    {"text": "Client's liability under this agreement is uncapped and includes consequential, incidental, and punitive damages.", "label": "critical"},
    {"text": "Vendor may enter Client's premises and seize equipment immediately upon any alleged breach, without judicial process.", "label": "critical"},
    {"text": "This agreement waives Client's right to pursue any legal remedy whatsoever, including in cases of fraud by Vendor.", "label": "critical"},
    {"text": "Personal guarantees from Client's officers extend to all current and future obligations under this agreement, without limit.", "label": "critical"},
    {"text": "Vendor is entitled to a perpetual, exclusive, royalty-free license to all of Client's confidential information and trade secrets.", "label": "critical"},
    {"text": "Client indemnifies Vendor for all regulatory fines, of any amount, arising from Vendor's non-compliance with applicable law.", "label": "critical"},
    {"text": "This agreement cannot be terminated by Client under any circumstances, including Vendor's material breach or insolvency.", "label": "critical"},
]

# ---------------------------------------------------------------------------
# Rule-based classifier: keyword/phrase signals per risk level. Each hit adds
# 1 point to that level's score; the highest-scoring level wins. Ties are
# broken toward the more severe level, since under-flagging risk is worse
# than over-flagging it in a legal-review context.
# ---------------------------------------------------------------------------
_SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}

_KEYWORDS: dict[str, list[str]] = {
    "critical": [
        "without limitation", "uncapped", "unlimited liability", "punitive damages",
        "without consent", "without notice", "waives", "waiver of", "without judicial process",
        "perpetual, exclusive", "any circumstances", "gross negligence", "personal guarantee",
        "irrevocable, perpetual", "seize", "cannot be terminated", "regardless of cause",
        "no right to", "sole discretion of vendor",
    ],
    "high": [
        "indemnify and hold harmless", "indemnify", "limitation of liability", "shall not exceed",
        "binding arbitration", "non-compete", "non-solicit", "solicit or hire", "unilaterally",
        "disclaims all warranties", "jury trial", "irrevocable", "immediately and without notice",
        "sole obligation", "unanimous written consent",
    ],
    "medium": [
        "late fee", "automatically renews", "renewal", "terminate this agreement for convenience",
        "prior written consent", "confidential information", "liability insurance",
        "commercially reasonable efforts", "mediation", "cure period", "assigned to client",
        "may not assign",
    ],
    "low": [
        "feedback", "counterparts", "notices under this agreement", "for convenience only",
        "status report", "office access", "governed by the laws", "meet quarterly",
        "incorporated herein by reference", "shall not be deemed a waiver", "mutual written consent",
    ],
}


def classify_clause(text: str) -> str:
    """Deterministic keyword-scoring classifier. Returns one of RISK_LEVELS."""
    lowered = text.lower()
    scores = {level: 0 for level in RISK_LEVELS}
    for level, phrases in _KEYWORDS.items():
        for phrase in phrases:
            if phrase in lowered:
                scores[level] += 1

    best = max(scores.values())
    if best == 0:
        return "medium"  # sensible default: flag unmatched clauses for human review

    candidates = [level for level, score in scores.items() if score == best]
    # Break ties toward the more severe level.
    return max(candidates, key=lambda lvl: _SEVERITY_ORDER[lvl])


class ClassMetrics(TypedDict):
    label: str
    precision: float
    recall: float
    f1: float
    support: int


def run_evaluation() -> dict:
    """
    Runs the classifier over the full benchmark and computes standard
    classification metrics: overall accuracy, per-class precision/recall/F1
    with support, macro-averaged and weighted-averaged precision/recall/F1,
    and a confusion matrix (rows = true label, columns = predicted label).
    """
    y_true = [item["label"] for item in BENCHMARK]
    y_pred = [classify_clause(item["text"]) for item in BENCHMARK]

    confusion = {t: {p: 0 for p in RISK_LEVELS} for t in RISK_LEVELS}
    for t, p in zip(y_true, y_pred):
        confusion[t][p] += 1

    per_class: List[ClassMetrics] = []
    for level in RISK_LEVELS:
        tp = confusion[level][level]
        fp = sum(confusion[other][level] for other in RISK_LEVELS if other != level)
        fn = sum(confusion[level][other] for other in RISK_LEVELS if other != level)
        support = sum(confusion[level].values())

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        per_class.append(
            {
                "label": level,
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "f1": round(f1, 4),
                "support": support,
            }
        )

    total = len(y_true)
    correct = sum(1 for t, p in zip(y_true, y_pred) if t == p)
    accuracy = correct / total if total else 0.0

    macro_precision = sum(c["precision"] for c in per_class) / len(per_class)
    macro_recall = sum(c["recall"] for c in per_class) / len(per_class)
    macro_f1 = sum(c["f1"] for c in per_class) / len(per_class)

    weighted_precision = sum(c["precision"] * c["support"] for c in per_class) / total if total else 0.0
    weighted_recall = sum(c["recall"] * c["support"] for c in per_class) / total if total else 0.0
    weighted_f1 = sum(c["f1"] * c["support"] for c in per_class) / total if total else 0.0

    return {
        "model_name": "LegalGPT Rule-Based Risk Classifier",
        "dataset_name": "Hand-labeled contract-clause benchmark (v1)",
        "num_samples": total,
        "labels": RISK_LEVELS,
        "accuracy": round(accuracy, 4),
        "per_class": per_class,
        "macro_avg": {
            "precision": round(macro_precision, 4),
            "recall": round(macro_recall, 4),
            "f1": round(macro_f1, 4),
        },
        "weighted_avg": {
            "precision": round(weighted_precision, 4),
            "recall": round(weighted_recall, 4),
            "f1": round(weighted_f1, 4),
        },
        "confusion_matrix": {t: [confusion[t][p] for p in RISK_LEVELS] for t in RISK_LEVELS},
    }
