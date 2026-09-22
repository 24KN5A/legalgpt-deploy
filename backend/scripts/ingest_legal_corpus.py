"""
Bulk ingestion script: Kaggle "Legal Dataset: SC Judgments India (1950-2024)"
(a folder tree of one-PDF-per-case files) -> LegalGPT.

Unlike a "linked" ingestion (which would just point Document.file_path at
the PDFs sitting in the Kaggle download/cache folder), THIS script makes the
project self-contained: every PDF is physically COPIED into the project's
own backend/uploads/ directory first, using the exact same
safe_filename()/validate_upload() helpers the normal /upload API uses, then
run through the standard pipeline via document_service.create_document_record
+ document_service.process_document (extract -> chunk -> embed -> index).

That means:
- The dataset becomes part of the project's own data (backend/uploads/),
  not a reference to wherever kagglehub cached it.
- You CAN delete/move the original Kaggle download afterward without
  breaking anything in the app.
- Document.file_path in the DB always points inside backend/uploads/.

Trade-off: this roughly doubles disk usage during ingestion (original
download + copy inside the project) — for a 7GB dataset, make sure you have
enough free space before running the full corpus.

USAGE
-----
    cd backend
    # smoke test on a small slice first
    python scripts/ingest_legal_corpus.py --source /path/to/kagglehub/dir --limit 50

    # narrow by year (if the dataset organizes folders/filenames by year)
    python scripts/ingest_legal_corpus.py --source /path/to/dir --year-from 2015 --year-to 2024

    # full run (resumable -- already-ingested files are skipped)
    python scripts/ingest_legal_corpus.py --source /path/to/dir

    # copy files but skip embedding (do that in a later, separate pass)
    python scripts/ingest_legal_corpus.py --source /path/to/dir --copy-only

NOTES
-----
- Resumable: re-running the same command skips any source PDF whose
  filename was already ingested (matched by original_filename), so you can
  Ctrl+C and restart safely.
- Every ingested judgment becomes a `Document` row with user_id=None, which
  LegalGPT already treats as a SHARED document visible to every logged-in
  user. No route or frontend changes are needed for chat to start using it.
- Embeddings run on CPU via the local sentence-transformers model by
  default (settings.embedding_provider == "local"). That's free but slow at
  this scale -- start with --limit to gauge your machine's throughput
  before committing to the full 7GB corpus.
- Files bigger than settings.max_upload_size_mb (25MB default) are skipped
  with a warning rather than silently rejected -- raise
  MAX_UPLOAD_SIZE_MB in backend/.env if the corpus has large scanned PDFs
  you still want included.
"""
import argparse
import asyncio
import shutil
import sys
import time
from pathlib import Path

# Make `app.*` importable when running this script directly from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.core.exceptions import FileTooLargeError, InvalidFileTypeError  # noqa: E402
from app.core.logging import logger  # noqa: E402
from app.db.database import AsyncSessionLocal, init_db  # noqa: E402
from app.db.models import Document  # noqa: E402
from app.services import document_service  # noqa: E402
from sqlalchemy import select  # noqa: E402


def find_year(path: Path) -> int | None:
    """Best-effort year extraction from folder names or the filename itself
    (this dataset is commonly organized in per-year folders)."""
    for part in (path.name, *path.parts):
        for token in part.replace("_", " ").replace("-", " ").split():
            if token.isdigit() and len(token) == 4 and 1950 <= int(token) <= 2024:
                return int(token)
    return None


def iter_pdfs(source: Path, year_from: int | None, year_to: int | None):
    for pdf_path in sorted(source.rglob("*.pdf")):
        year = find_year(pdf_path)
        if year_from is not None and (year is None or year < year_from):
            continue
        if year_to is not None and (year is None or year > year_to):
            continue
        yield pdf_path, year


async def already_ingested(db, original_filename: str) -> bool:
    result = await db.execute(
        select(Document.id).where(Document.original_filename == original_filename)
    )
    return result.scalar_one_or_none() is not None


async def ingest_one(db, src_pdf: Path, copy_only: bool) -> str:
    """Copies src_pdf into backend/uploads/, creates a Document row, then
    (unless copy_only) runs the normal extract->chunk->embed pipeline.
    Returns 'ok', 'skipped', or 'failed'.
    """
    original_filename = src_pdf.name

    if await already_ingested(db, original_filename):
        return "skipped"

    size_bytes = src_pdf.stat().st_size
    try:
        document_service.validate_upload(original_filename, size_bytes)
    except (InvalidFileTypeError, FileTooLargeError) as exc:
        logger.warning(f"Skipping {original_filename}: {exc}")
        return "failed"

    # Physically copy into the project's own upload directory -- this is
    # the step that avoids "linking" to the external Kaggle folder.
    stored_filename = document_service.safe_filename(original_filename)
    dest_path = settings.upload_dir / stored_filename
    shutil.copyfile(src_pdf, dest_path)

    doc = await document_service.create_document_record(
        db,
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_path=str(dest_path.resolve()),
        content_type="application/pdf",
        size_bytes=size_bytes,
        user_id=None,  # shared/global document -> visible to every user
    )

    if copy_only:
        return "ok"

    doc = await document_service.process_document(db, doc.id)
    return "ok" if doc.status.value == "ready" else "failed"


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--source", required=True, help="Root folder of the downloaded Kaggle dataset")
    parser.add_argument("--limit", type=int, default=None, help="Stop after N newly-ingested PDFs")
    parser.add_argument("--year-from", type=int, default=None)
    parser.add_argument("--year-to", type=int, default=None)
    parser.add_argument(
        "--copy-only",
        action="store_true",
        help="Only copy files + create DB records; skip extraction/embedding (run again later without this flag to finish the job)",
    )
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    if not source.exists():
        print(f"Source path does not exist: {source}")
        sys.exit(1)

    await init_db()
    settings.ensure_dirs()

    ok = skipped = failed = 0
    t0 = time.time()

    async with AsyncSessionLocal() as db:
        for pdf_path, _year in iter_pdfs(source, args.year_from, args.year_to):
            if args.limit is not None and ok >= args.limit:
                break

            result = await ingest_one(db, pdf_path, args.copy_only)
            if result == "ok":
                ok += 1
            elif result == "skipped":
                skipped += 1
            else:
                failed += 1

            if (ok + failed) % 20 == 0:
                elapsed = time.time() - t0
                print(f"  ...ingested={ok} skipped={skipped} failed={failed}  ({elapsed:.0f}s elapsed)")

    elapsed = time.time() - t0
    print(
        f"\nDone in {elapsed:.0f}s. ingested={ok} skipped(already present)={skipped} failed={failed}\n"
        f"Copied PDFs are stored in: {settings.upload_dir}\n"
        f"Chroma persisted at: {settings.chroma_persist_dir}\n"
        f"SQLite at: {settings.sqlite_path}"
    )


if __name__ == "__main__":
    asyncio.run(main())
