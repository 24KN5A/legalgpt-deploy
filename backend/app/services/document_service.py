"""
Document ingestion orchestrator.

Wires together the individual services (pdf_service -> chunking_service ->
vector_store_service) and persists metadata via SQLAlchemy. This is the
single entry point routes should call for "add a document to LegalGPT" and
"remove a document from LegalGPT" -- keeps routes thin and services
composable/testable in isolation.
"""
import os
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DocumentAccessError, DocumentNotFoundError, FileTooLargeError, InvalidFileTypeError
from app.core.logging import logger
from app.config import settings
from app.db.models import Document, DocumentStatus
from app.services import pdf_service
from app.services.chunking_service import chunk_text
from app.services.vector_store_service import get_vector_store


def safe_filename(original_filename: str) -> str:
    """Generate a collision-proof, path-traversal-safe filename on disk
    while preserving the extension for readability."""
    ext = Path(original_filename).suffix.lower()
    return f"{uuid.uuid4().hex}{ext}"


def validate_upload(original_filename: str, size_bytes: int) -> None:
    ext = Path(original_filename).suffix.lower()
    if ext not in settings.allowed_upload_extensions:
        raise InvalidFileTypeError(
            f"File type '{ext}' is not supported. Allowed types: "
            f"{', '.join(settings.allowed_upload_extensions)}"
        )
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise FileTooLargeError(
            f"File is {size_bytes / (1024*1024):.1f}MB, which exceeds the "
            f"{settings.max_upload_size_mb}MB limit."
        )


async def create_document_record(
    db: AsyncSession,
    *,
    original_filename: str,
    stored_filename: str,
    file_path: str,
    content_type: str,
    size_bytes: int,
    user_id: str | None = None,
) -> Document:
    doc = Document(
        user_id=user_id,
        filename=stored_filename,
        original_filename=original_filename,
        content_type=content_type or "application/pdf",
        file_path=file_path,
        size_bytes=size_bytes,
        status=DocumentStatus.UPLOADED,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def process_document(db: AsyncSession, document_id: str) -> Document:
    """Run the full ingestion pipeline for an already-saved file:
    extract -> chunk -> embed -> index -> mark ready.

    Safe to call from a background task since it does its own DB session
    commits along the way and never raises past a FAILED status update
    (errors are recorded on the document, not thrown to a caller that has
    already returned an HTTP response).
    """
    doc = await get_document(db, document_id)

    try:
        doc.status = DocumentStatus.PROCESSING
        await db.commit()

        pdf_data = pdf_service.extract_text(doc.file_path)
        chunks = chunk_text(pdf_data["text"])

        if chunks:
            store = get_vector_store()
            chunk_ids = [f"{doc.id}::{c.index}" for c in chunks]
            store.add_chunks(
                document_id=doc.id,
                document_name=doc.original_filename,
                chunk_ids=chunk_ids,
                texts=[c.text for c in chunks],
                chunk_indices=[c.index for c in chunks],
            )

        doc.page_count = pdf_data["pages"]
        doc.chunk_count = len(chunks)
        doc.preview_text = pdf_data["text"][:500]
        doc.status = DocumentStatus.READY
        doc.error_message = None
        await db.commit()
        await db.refresh(doc)
        logger.info(f"Document {doc.id} processed successfully ({len(chunks)} chunks).")

    except Exception as exc:  # noqa: BLE001
        logger.error(f"Document {doc.id} processing failed: {exc}")
        doc.status = DocumentStatus.FAILED
        doc.error_message = str(exc)
        await db.commit()
        await db.refresh(doc)

    return doc


async def get_document(
    db: AsyncSession, document_id: str, user_id: str | None = None
) -> Document:
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise DocumentNotFoundError(f"Document '{document_id}' not found.")
    # Ownership check: a document belonging to another user 404s (not 403)
    # so we don't leak whether a given document id exists at all.
    if user_id is not None and doc.user_id is not None and doc.user_id != user_id:
        raise DocumentNotFoundError(f"Document '{document_id}' not found.")
    return doc


async def list_documents(db: AsyncSession, user_id: str | None = None) -> list[Document]:
    stmt = select(Document).order_by(Document.created_at.desc())
    if user_id is not None:
        stmt = stmt.where(Document.user_id == user_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def delete_document(db: AsyncSession, document_id: str, user_id: str | None = None) -> None:
    doc = await get_document(db, document_id, user_id=user_id)

    try:
        get_vector_store().delete_document(document_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Vector store cleanup failed for {document_id}: {exc}")

    if os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except OSError as exc:
            logger.warning(f"Could not remove file {doc.file_path}: {exc}")

    await db.delete(doc)
    await db.commit()


async def validate_document_access(
    db: AsyncSession,
    document_id: str,
    user_id: str,
) -> None:
    """Improvement #7 — Document Ownership Validation.

    Ensures the requesting user is allowed to run RAG queries against
    `document_id`. A document is accessible if:
      - It is a shared/corpus document (user_id IS NULL — ingested via the
        bulk-ingest script and visible to all authenticated users), OR
      - It belongs to the requesting user (doc.user_id == user_id).

    Raises DocumentAccessError (403) if neither condition holds, so User A
    cannot query User B's private documents by guessing a UUID.
    """
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        # Return a 404 — same as get_document — so we don't leak existence info.
        raise DocumentNotFoundError(f"Document '{document_id}' not found.")
    if doc.user_id is not None and doc.user_id != user_id:
        raise DocumentAccessError(
            f"You do not have access to document '{document_id}'. "
            "You can only query your own documents or shared corpus documents."
        )
