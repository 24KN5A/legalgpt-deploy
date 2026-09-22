from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.models.schemas import DocumentListResponse, DocumentResponse, DocumentStatusResponse
from app.services import document_service

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    docs = await document_service.list_documents(db, user_id=current_user.id)
    return DocumentListResponse(
        documents=[DocumentResponse.model_validate(d) for d in docs],
        total=len(docs),
    )


@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight polling endpoint so the frontend can track processing progress.
    Returns status (uploaded | processing | ready | failed) and chunk_count.
    """
    doc = await document_service.get_document(db, document_id, user_id=current_user.id)
    return DocumentStatusResponse(
        id=doc.id,
        status=str(doc.status.value) if hasattr(doc.status, "value") else str(doc.status),
        chunk_count=doc.chunk_count or 0,
        error_message=doc.error_message,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await document_service.get_document(db, document_id, user_id=current_user.id)
    return DocumentResponse.model_validate(doc)


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await document_service.delete_document(db, document_id, user_id=current_user.id)
    return None

