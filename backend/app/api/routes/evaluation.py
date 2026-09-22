"""
Model evaluation endpoint.

Replaces the old LLM-backed "AI Document Insights" generation call (which
depended on a live Ollama server) with a fast, deterministic evaluation
of the built-in risk-classification benchmark. See
app/services/evaluation_service.py for the benchmark, classifier, and
metric definitions.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.db.models import User
from app.services import evaluation_service

router = APIRouter(prefix="/evaluation", tags=["evaluation"])


class ClassMetricsResponse(BaseModel):
    label: str
    precision: float
    recall: float
    f1: float
    support: int


class AverageMetrics(BaseModel):
    precision: float
    recall: float
    f1: float


class EvaluationResponse(BaseModel):
    model_name: str
    dataset_name: str
    num_samples: int
    labels: list[str]
    accuracy: float
    per_class: list[ClassMetricsResponse]
    macro_avg: AverageMetrics
    weighted_avg: AverageMetrics
    confusion_matrix: dict[str, list[int]]


@router.get("/risk-classifier", response_model=EvaluationResponse)
async def evaluate_risk_classifier(current_user: User = Depends(get_current_user)):
    """Runs the risk-level classifier over the benchmark and returns metrics."""
    return evaluation_service.run_evaluation()
