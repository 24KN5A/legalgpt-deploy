import os

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.core.logging import logger
from app.db.database import AsyncSessionLocal, get_db
from app.db.models import User
from app.models.schemas import DocumentUploadResponse
from app.services import document_service

router = APIRouter(tags=["upload"])


async def _run_processing_in_new_session(document_id: str) -> None:
    """Background tasks must open their own DB session -- the request-scoped
    session passed to the route is closed by the time this runs."""
    async with AsyncSessionLocal() as session:
        await document_service.process_document(session, document_id)


@router.post("/upload", response_model=DocumentUploadResponse, status_code=201)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    contents = await file.read()
    size_bytes = len(contents)

    document_service.validate_upload(file.filename, size_bytes)

    stored_filename = document_service.safe_filename(file.filename)
    file_path = os.path.join(settings.upload_dir, stored_filename)

    with open(file_path, "wb") as buffer:
        buffer.write(contents)

    doc = await document_service.create_document_record(
        db,
        original_filename=file.filename,
        stored_filename=stored_filename,
        file_path=file_path,
        content_type=file.content_type or "application/pdf",
        size_bytes=size_bytes,
        user_id=current_user.id,
    )

    logger.info(f"Uploaded document {doc.id} ({file.filename}, {size_bytes} bytes)")

    # Extraction/chunking/embedding runs after the response is sent so the
    # UI gets an immediate ack and can poll /documents/{id} for status.
    background_tasks.add_task(_run_processing_in_new_session, doc.id)

    return DocumentUploadResponse(document=doc)
