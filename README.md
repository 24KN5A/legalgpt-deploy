# LegalGPT

An AI-powered legal document assistant. Upload documents (or bulk-ingest a
corpus of Supreme Court judgments), then chat with an LLM that answers
strictly from the retrieved context (RAG), citing the source chunks it used.

- **Backend:** FastAPI + SQLite (metadata) + ChromaDB (vector search) +
  sentence-transformers (local embeddings) + Ollama (local LLM, no API key
  needed by default; OpenAI/Anthropic also supported).
- **Frontend:** React + Vite + TypeScript.

---

## 1. Prerequisites

Install these once, before anything else:

| Tool | Where to get it | Check it worked |
|---|---|---|
| Python 3.11+ | https://python.org (not the Microsoft Store version) | `python --version` |
| Node.js 18+ | https://nodejs.org | `node --version` |
| Git | https://git-scm.com | `git --version` |
| Ollama | https://ollama.com | `ollama --version` |

After installing Ollama, pull the default model:
```powershell
ollama pull llama3
ollama list
```
`llama3` should now appear in the list.

---

## 2. Get the project onto your machine

If you received this as a `.zip`: extract it anywhere, e.g. `C:\LegalGPT`.

If you're cloning from Git instead:
```powershell
git clone <repo-url> LegalGPT
cd LegalGPT
```

You should now have:
```
LegalGPT/
  backend/
  frontend/
```

---

## 3. Backend setup

```powershell
cd LegalGPT\backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

Create your local config file (this is intentionally NOT included in the
zip/repo, since it holds machine-specific settings and a secret key):
```powershell
copy .env.example .env
```

Open `.env` and set a real secret key:
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```
Paste the printed value into `SECRET_KEY=` in `.env`.

### Optional: Configure Email OTP for Password Reset (Free via Gmail)
To receive 6-digit password reset verification codes in your real Gmail inbox:
1. Enable 2-Step Verification on your Google Account: https://myaccount.google.com/security
2. Generate an App Password (for "Mail"): https://myaccount.google.com/apppasswords
3. Add these lines to `backend/.env`:
   ```ini
   OTP_CHANNEL=email
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=yourapp@gmail.com
   SMTP_PASSWORD=xxxx xxxx xxxx xxxx
   SMTP_FROM_NAME=LegalGPT Support
   ```
*(If SMTP is not configured, the system still generates and logs the OTP to the backend terminal for local testing).*

---

## 4. Start the backend once (creates the database + folders)

```powershell
uvicorn app.main:app --reload
```
Wait for `Application startup complete.` Leave this terminal running.

Sanity check in a browser: http://127.0.0.1:8000/health should return `200 OK`.

---

## 5. Download the judgments dataset

This project is built to work with the Kaggle dataset **"Legal Dataset: SC
Judgments India (1950-2024)"** (a folder of one-PDF-per-case files).

1. Go to Kaggle and search for that dataset (or use `kagglehub`/the Kaggle
   CLI if you have an account set up).
2. Download and extract it somewhere on disk, e.g.:
   ```
   C:\Kaggle\supreme_court_judgments\
   ```
   (It doesn't matter if it's organized into year subfolders — the ingest
   script searches recursively.)

You don't need the whole thing to test the app — even a partial download
works fine with `--limit` below.

---

## 6. Ingest the dataset

In a **new terminal** (keep the backend running in the other one):
```powershell
cd LegalGPT\backend
.\venv\Scripts\activate
python scripts/ingest_legal_corpus.py --source "C:\Kaggle\supreme_court_judgments" --limit 50
```

This copies each PDF into `backend/uploads/`, extracts text, chunks it,
embeds it locally, and indexes it in ChromaDB. It's resumable — re-running
the same command skips files already ingested, so it's safe to interrupt.

Once that small batch works, ingest everything:
```powershell
python scripts/ingest_legal_corpus.py --source "C:\Kaggle\supreme_court_judgments"
```

Ingested documents have `user_id=None`, which the app treats as **shared** —
every logged-in user can query them without re-uploading anything.

### Verify ingestion worked
```powershell
python scripts/check_status.py
python scripts/check_vector_store.py --list-docs
python scripts/check_vector_store.py --query "arbitration clause"
```
`check_status.py` also tests connectivity to Ollama and tells you if the
configured model isn't pulled yet.

---

## 7. Frontend setup

In a **third terminal**:
```powershell
cd LegalGPT\frontend
npm install
npm run dev
```
It'll print a local URL, typically `http://localhost:5173`.

---

## 8. Use the app

1. Open `http://localhost:5173`.
2. Sign up for an account (any email/password — this is local-only auth).
3. Go to **Chat**.
4. Set "Scope to document" to **All documents**.
5. Ask a question about a case you know is in your ingested dataset —
   e.g. open one of the ingested PDF filenames (see
   `check_vector_store.py --list-docs`) and ask about a specific detail
   from it.
6. Watch the answer stream in, along with cited source chunks.

---

## Every time you come back to this project

```powershell
# 1. Make sure Ollama is running (often already running as a service)
ollama serve

# 2. Terminal A - backend
cd LegalGPT\backend
.\venv\Scripts\activate
uvicorn app.main:app --reload

# 3. Terminal B - frontend
cd LegalGPT\frontend
npm run dev

# 4. Browser
# http://localhost:5173
```
You only need to repeat Step 6 (ingestion) again if you want to add more
documents — Chroma and SQLite persist to disk under `backend/storage/`
between runs.

---

## Troubleshooting

**Chat says "no relevant context" / "documents do not contain information
about X":**
Run `python scripts/check_vector_store.py --query "<your question>"` to see
what's actually indexed. If it comes back empty, that judgment simply
hasn't been ingested yet — go back to Step 6.

**Chat hangs for ~2 minutes then errors (`ReadTimeout` / `Ollama streaming
failed` in the backend terminal):**
Run `python scripts/check_status.py` to confirm Ollama is reachable and the
model is pulled. Test Ollama directly, outside the app:
```powershell
ollama run llama3
```
If a simple prompt is slow there too, it's a hardware/model-size issue, not
a bug in this project — consider a smaller model (`ollama pull phi3`,
then set `OLLAMA_MODEL=phi3` in `.env`) or switching `LLM_PROVIDER` to
`openai`/`anthropic` in `.env` (requires an API key).

**`ModuleNotFoundError` when running any `python scripts/...` command:**
Your virtual environment isn't activated. Run
`.\venv\Scripts\activate` from `backend/` first — your prompt should show
`(venv)` at the start of the line.
