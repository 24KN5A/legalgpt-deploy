from fastapi import APIRouter

from app.config import settings
from app.models.schemas import HealthResponse
from app.services.vector_store_service import get_vector_store

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health():
    try:
        vector_ready = get_vector_store().is_ready()
    except Exception:  # noqa: BLE001
        vector_ready = False

    return HealthResponse(
        status="healthy",
        service="LegalGPT API",
        version=settings.app_version,
        llm_provider=settings.llm_provider,
        embedding_provider=settings.embedding_provider,
        vector_store_ready=vector_ready,
    )
