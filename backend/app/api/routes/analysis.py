from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.models.schemas import ContractAnalysisResponse, RiskItem
from app.services import analysis_service, document_service

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/{document_id}", response_model=ContractAnalysisResponse)
async def analyze_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await document_service.get_document(db, document_id, user_id=current_user.id)
    result = await analysis_service.analyze_document(doc.file_path)

    return ContractAnalysisResponse(
        document_id=document_id,
        summary=result["summary"],
        key_clauses=result["key_clauses"],
        parties=result["parties"],
        obligations=result["obligations"],
        risks=[RiskItem(**r) for r in result["risks"]],
        generated_at=datetime.now(timezone.utc),
    )
