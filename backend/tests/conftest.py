import random
import shutil
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@pytest.fixture(autouse=True, scope="session")
def _isolated_storage_dirs():
    """Redirect all persistent storage to a throwaway test directory so the
    test suite never touches real uploads/storage, and clean up afterwards."""
    import app.config as config_module

    test_root = Path("/tmp/legalgpt_test_" + uuid.uuid4().hex)
    test_root.mkdir(parents=True, exist_ok=True)

    settings = config_module.settings
    settings.upload_dir = test_root / "uploads"
    settings.chroma_persist_dir = test_root / "chroma"
    settings.sqlite_path = test_root / "test.db"
    settings.log_dir = test_root / "logs"
    settings.ensure_dirs()

    yield

    shutil.rmtree(test_root, ignore_errors=True)


@pytest.fixture(autouse=True)
def _fake_embedder(monkeypatch):
    """Replace the real (network-dependent) embedding model with a fast,
    deterministic fake so tests never need internet access or a GPU."""
    import app.services.embedding_service as es
    import app.services.vector_store_service as vss

    class FakeEmbedder(es.EmbeddingService):
        def embed_documents(self, texts):
            out = []
            for t in texts:
                random.seed(hash(t) % (2**32))
                out.append([random.random() for _ in range(8)])
            return out

        def embed_query(self, text):
            return self.embed_documents([text])[0]

    fake = FakeEmbedder()
    monkeypatch.setattr(es, "get_embedding_service", lambda: fake)
    monkeypatch.setattr(vss, "get_embedding_service", lambda: fake)
    vss.get_vector_store.cache_clear()
    yield
    vss.get_vector_store.cache_clear()


@pytest_asyncio.fixture
async def client():
    from app.main import app
    from app.db.database import AsyncSessionLocal
    from app.services.user_service import create_user, issue_token

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with app.router.lifespan_context(app):
            # Create a default test user and attach bearer token
            async with AsyncSessionLocal() as session:
                user_email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
                user = await create_user(
                    session,
                    full_name="Test Suite User",
                    email=user_email,
                    password="Password123!",
                )
                token = issue_token(user)
            ac.headers["Authorization"] = f"Bearer {token}"
            yield ac


@pytest.fixture
def sample_pdf_path(tmp_path):
    pdf_path = tmp_path / "LEGALGPT_REQS.pdf"
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Legal Agreement Contract terms and arbitration clause. LegalGPT requirement document.\nSection 1: The parties agree to arbitrate any disputes under standard commercial rules.\nSection 2: Payment terms shall be net 30 days.")
    doc.save(str(pdf_path))
    doc.close()
    return str(pdf_path)

