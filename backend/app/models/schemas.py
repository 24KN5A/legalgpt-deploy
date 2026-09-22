"""
Pydantic schemas shared across API routes.

Keeping these centralized (instead of raw dicts in each route) gives us
request validation, OpenAPI docs, and a single source of truth for the
frontend TypeScript types to mirror.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------

class SignupRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone_number: Optional[str] = Field(None, max_length=32)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: str
    email: str
    phone_number: Optional[str] = None
    full_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class SendOTPRequest(BaseModel):
    phone_number: str = Field(..., min_length=7, max_length=32, description="Registered mobile number")


class SendOTPResponse(BaseModel):
    message: str
    phone_number: str
    expires_in_seconds: int
    debug_otp: Optional[str] = None


class VerifyOTPRequest(BaseModel):
    phone_number: str = Field(..., min_length=7, max_length=32)
    otp: str = Field(..., min_length=4, max_length=10)


class VerifyOTPResponse(BaseModel):
    message: str = "OTP verified successfully."
    reset_token: str
    expires_in_minutes: int = 15


class ResetPasswordRequest(BaseModel):
    reset_token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)


class ResetPasswordResponse(BaseModel):
    message: str = "Password reset successfully. You can now log in with your new password."
    user: UserResponse


# ---------- Documents ----------

class DocumentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    content_type: str
    size_bytes: int
    page_count: int
    chunk_count: int
    status: str
    error_message: Optional[str] = None
    preview_text: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


class DocumentUploadResponse(BaseModel):
    document: DocumentResponse
    message: str = "Document uploaded and is being processed."


class DocumentStatusResponse(BaseModel):
    """Lightweight response for the /documents/{id}/status polling endpoint."""
    id: str
    status: str          # "uploaded" | "processing" | "ready" | "failed"
    chunk_count: int
    error_message: Optional[str] = None



# ---------- Chat / RAG ----------

class SourceChunk(BaseModel):
    document_id: str
    document_name: str
    chunk_index: int
    text: str
    score: float


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    conversation_id: Optional[str] = None
    document_id: Optional[str] = None  # scope retrieval to a single document
    document_ids: Optional[List[str]] = None  # or scope to a set of documents


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    sources: List[SourceChunk] = []
    created_at: datetime
    # Confidence metadata (improvement #4)
    confidence: Optional[float] = None        # 0.0–1.0, avg similarity of retrieved chunks
    match_quality: Optional[str] = None       # "High" | "Medium" | "Low" | "No match"
    top_similarity: Optional[float] = None    # raw score of the best-matching chunk

    model_config = {"from_attributes": True}


class ChatResponse(BaseModel):
    conversation_id: str
    message: ChatMessageResponse


class ConversationResponse(BaseModel):
    id: str
    title: str
    document_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: List[ChatMessageResponse] = []

    model_config = {"from_attributes": True}


class ConversationListResponse(BaseModel):
    conversations: List[ConversationResponse]


# ---------- Contract / Risk Analysis ----------

class RiskItem(BaseModel):
    clause: str
    risk_level: str  # low | medium | high | critical
    explanation: str
    recommendation: str


class ContractAnalysisResponse(BaseModel):
    document_id: str
    summary: str
    key_clauses: List[str]
    parties: List[str]
    obligations: List[str]
    risks: List[RiskItem]
    generated_at: datetime


# ---------- Health / Errors ----------

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    llm_provider: str
    embedding_provider: str
    vector_store_ready: bool


class ErrorResponse(BaseModel):
    error_code: str
    message: str
