import fitz  # PyMuPDF

from app.core.exceptions import PDFExtractionError


def extract_text(pdf_path: str):

    try:
        document = fitz.open(pdf_path)
    except Exception as exc:  # noqa: BLE001
        raise PDFExtractionError(f"Could not open '{pdf_path}' as a PDF: {exc}") from exc

    try:
        full_text = ""

        for page in document:
            full_text += page.get_text()

        # Save page count BEFORE closing
        page_count = len(document)

    except Exception as exc:  # noqa: BLE001
        raise PDFExtractionError(f"Failed extracting text from '{pdf_path}': {exc}") from exc
    finally:
        document.close()

    if not full_text.strip():
        raise PDFExtractionError(
            "No extractable text found in this PDF (it may be a scanned image "
            "without OCR)."
        )

    return {
        "pages": page_count,
        "text": full_text
    }