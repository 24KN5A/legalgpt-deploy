"""
Centralized application configuration.

All environment-dependent values (API keys, provider choice, storage paths,
model names, CORS origins, etc.) live here and NOWHERE else. Never hardcode
secrets or paths elsewhere in the codebase — import `settings` instead.
"""
from functools import lru_cache
from pathlib import Path
from typing import List, Literal, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- App metadata ---
    app_name: str = "LegalGPT API"
    app_version: str = "1.0.0"
    environment: Literal["development", "production", "test"] = "development"
    debug: bool = True

    # --- CORS ---
    cors_origins: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

    # --- Storage paths ---
    upload_dir: Path = BASE_DIR / "uploads"
    chroma_persist_dir: Path = BASE_DIR / "storage" / "chroma"
    sqlite_path: Path = BASE_DIR / "storage" / "legalgpt.db"
    log_dir: Path = BASE_DIR / "logs"

    # --- Upload limits ---
    max_upload_size_mb: int = 25
    allowed_upload_extensions: List[str] = Field(default_factory=lambda: [".pdf"])

    # --- Chunking ---
    chunk_size: int = 1000
    chunk_overlap: int = 150

    # --- Embeddings (local, free, default) ---
    embedding_provider: Literal["local", "openai"] = "local"
    embedding_model_name: str = "all-MiniLM-L6-v2"
    openai_embedding_model: str = "text-embedding-3-small"

    # --- LLM provider abstraction ---
    # Supports "ollama" (local/free, default), "openai", and "anthropic".
    # Selecting openai/anthropic requires the matching API key below.
    llm_provider: Literal["ollama", "openai", "anthropic"] = "ollama"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    openai_api_key: Optional[str] = None
    openai_chat_model: str = "gpt-4o-mini"

    anthropic_api_key: Optional[str] = None
    anthropic_chat_model: str = "claude-sonnet-4-6"

    llm_temperature: float = 0.2
    llm_max_tokens: int = 1024

    # --- RAG ---
    retrieval_top_k: int = 5
    # Minimum cosine similarity (1 - cosine distance) a retrieved chunk must
    # have to be considered relevant. Chunks below this are dropped before
    # being passed to the LLM, so out-of-corpus questions get an empty
    # context block instead of loosely-related noise the model tries to
    # answer from anyway. Raised to 0.70 (improvement #1 — hallucination
    # control): this significantly reduces the LLM trying to answer from
    # weak / unrelated matches.
    retrieval_similarity_threshold: float = 0.70
    # Lower threshold used when the query is scoped to a single document
    # (document_id is set). The user has already chosen the document, so we
    # don't need to reject unrelated docs — we just need the best-matching
    # chunks within that one document. Broad queries like "summarize" score
    # ~0.25–0.55 against individual clause chunks with all-MiniLM-L6-v2.
    retrieval_similarity_threshold_single_doc: float = 0.25

    # --- Chroma collection ---
    chroma_collection_name: str = "legalgpt_documents"

    # --- Auth & OTP ---
    # IMPORTANT: override `secret_key` via a `.env` file (SECRET_KEY=...) in any
    # real deployment. This default is fine for local dev only.
    secret_key: str = "dev-only-insecure-secret-change-me-in-.env"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    password_reset_token_expire_minutes: int = 15
    otp_expire_minutes: int = 10
    otp_max_attempts: int = 5

    # --- OTP Delivery Channel ---
    # Options:
    #   "email"    - FREE. Sends OTP to user's registered email via SMTP. No payment needed.
    #   "sms"      - Sends OTP via SMS gateway (fast2sms/twilio). Requires paid/activated account.
    #   "both"     - Sends on both email AND SMS simultaneously.
    otp_channel: Literal["email", "sms", "both"] = "email"

    # --- Email / SMTP Settings (Free OTP delivery) ---
    # Use Gmail: enable "App Passwords" at https://myaccount.google.com/apppasswords
    # (requires 2FA on your Google account, which is free)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: Optional[str] = None    # your Gmail address e.g. yourapp@gmail.com
    smtp_password: Optional[str] = None    # Gmail App Password (16 chars, no spaces)
    smtp_from_name: str = "LegalGPT Support"
    smtp_from_email: Optional[str] = None  # defaults to smtp_username if not set

    # --- SMS Gateway Settings (optional, only needed if otp_channel includes sms) ---
    # Options: "mock" (logs OTP to console/debug response), "twilio", "fast2sms"
    sms_provider: Literal["mock", "twilio", "fast2sms"] = "mock"
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_phone_number: Optional[str] = None
    fast2sms_api_key: Optional[str] = None

    def ensure_dirs(self) -> None:
        for d in (self.upload_dir, self.chroma_persist_dir, self.sqlite_path.parent, self.log_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings


settings = get_settings()