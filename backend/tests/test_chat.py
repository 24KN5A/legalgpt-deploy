import asyncio
import io

import pytest


class FakeLLMProvider:
    name = "fake"

    async def generate(self, messages, *, temperature, max_tokens):
        return "This is a stubbed answer based on the retrieved context."

    async def stream(self, messages, *, temperature, max_tokens):
        for token in ["This ", "is ", "a ", "stubbed ", "answer."]:
            yield token


@pytest.fixture(autouse=True)
def _fake_llm(monkeypatch):
    import app.services.llm.factory as factory
    import app.services.rag_service as rag_service

    fake = FakeLLMProvider()
    monkeypatch.setattr(factory, "get_llm_provider", lambda: fake)
    monkeypatch.setattr(rag_service, "get_llm_provider", lambda: fake)
    yield


async def _upload_and_wait(client, sample_pdf_path):
    with open(sample_pdf_path, "rb") as f:
        content = f.read()
    files = {"file": ("LEGALGPT_REQS.pdf", io.BytesIO(content), "application/pdf")}
    resp = await client.post("/upload", files=files)
    doc_id = resp.json()["document"]["id"]

    for _ in range(20):
        await asyncio.sleep(0.1)
        check = await client.get(f"/documents/{doc_id}")
        if check.json()["status"] in ("ready", "failed"):
            break
    return doc_id


@pytest.mark.asyncio
async def test_chat_without_documents_still_answers(client):
    resp = await client.post("/chat", json={"message": "What is a force majeure clause?"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["conversation_id"]
    assert data["message"]["role"] == "assistant"
    assert data["message"]["content"]


@pytest.mark.asyncio
async def test_chat_with_document_returns_sources(client, sample_pdf_path):
    doc_id = await _upload_and_wait(client, sample_pdf_path)

    resp = await client.post(
        "/chat", json={"message": "Summarize this document", "document_id": doc_id}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"]["content"]
    # Sources may be empty if similarity search misses, but the field must exist.
    assert "sources" in data["message"]


@pytest.mark.asyncio
async def test_chat_conversation_continues_with_same_id(client):
    first = await client.post("/chat", json={"message": "Hello"})
    convo_id = first.json()["conversation_id"]

    second = await client.post(
        "/chat", json={"message": "Follow up question", "conversation_id": convo_id}
    )
    assert second.status_code == 200
    assert second.json()["conversation_id"] == convo_id

    history = await client.get(f"/conversations/{convo_id}")
    assert history.status_code == 200
    messages = history.json()["messages"]
    assert len(messages) == 4  # user+assistant, twice


@pytest.mark.asyncio
async def test_chat_with_unknown_conversation_id_returns_404(client):
    resp = await client.post(
        "/chat", json={"message": "hi", "conversation_id": "does-not-exist"}
    )
    assert resp.status_code == 404
    assert resp.json()["error_code"] == "conversation_not_found"
