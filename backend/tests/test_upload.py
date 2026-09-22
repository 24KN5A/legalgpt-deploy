import asyncio
import io

import pytest


@pytest.mark.asyncio
async def test_upload_rejects_non_pdf(client):
    files = {"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")}
    resp = await client.post("/upload", files=files)
    assert resp.status_code == 400
    assert resp.json()["error_code"] == "invalid_file_type"


@pytest.mark.asyncio
async def test_upload_rejects_oversized_file(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "max_upload_size_mb", 0)  # force everything to exceed limit
    files = {"file": ("contract.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")}
    resp = await client.post("/upload", files=files)
    assert resp.status_code == 413
    assert resp.json()["error_code"] == "file_too_large"


@pytest.mark.asyncio
async def test_upload_success_and_processing(client, sample_pdf_path):
    with open(sample_pdf_path, "rb") as f:
        content = f.read()

    files = {"file": ("LEGALGPT_REQS.pdf", io.BytesIO(content), "application/pdf")}
    resp = await client.post("/upload", files=files)
    assert resp.status_code == 201
    body = resp.json()
    doc = body["document"]
    assert doc["original_filename"] == "LEGALGPT_REQS.pdf"
    assert doc["status"] == "uploaded"
    doc_id = doc["id"]

    # Background task processing runs on the event loop; give it a moment.
    for _ in range(20):
        await asyncio.sleep(0.1)
        check = await client.get(f"/documents/{doc_id}")
        if check.json()["status"] in ("ready", "failed"):
            break

    final = await client.get(f"/documents/{doc_id}")
    data = final.json()
    assert data["status"] == "ready", data.get("error_message")
    assert data["page_count"] >= 1
    assert data["chunk_count"] >= 1


@pytest.mark.asyncio
async def test_get_nonexistent_document_returns_404(client):
    resp = await client.get("/documents/does-not-exist")
    assert resp.status_code == 404
    assert resp.json()["error_code"] == "document_not_found"


@pytest.mark.asyncio
async def test_list_documents_empty_initially(client):
    resp = await client.get("/documents")
    assert resp.status_code == 200
    assert "documents" in resp.json()
