"""
Domain-specific exception hierarchy.

Raising one of these anywhere in a service or route guarantees a clean,
consistent JSON error response via the handlers registered in main.py --
instead of a raw 500 traceback leaking to the client.
"""


class LegalGPTError(Exception):
    """Base class for all LegalGPT domain errors."""

    status_code: int = 500
    error_code: str = "internal_error"

    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code


class InvalidFileTypeError(LegalGPTError):
    status_code = 400
    error_code = "invalid_file_type"


class FileTooLargeError(LegalGPTError):
    status_code = 413
    error_code = "file_too_large"


class DocumentNotFoundError(LegalGPTError):
    status_code = 404
    error_code = "document_not_found"


class DocumentAccessError(LegalGPTError):
    """Raised when a user tries to query a document that belongs to another user."""
    status_code = 403
    error_code = "document_access_denied"


class PDFExtractionError(LegalGPTError):
    status_code = 422
    error_code = "pdf_extraction_failed"


class EmbeddingGenerationError(LegalGPTError):
    status_code = 502
    error_code = "embedding_generation_failed"


class VectorStoreError(LegalGPTError):
    status_code = 502
    error_code = "vector_store_error"


class LLMProviderError(LegalGPTError):
    status_code = 502
    error_code = "llm_provider_error"


class LLMNotConfiguredError(LegalGPTError):
    status_code = 424
    error_code = "llm_not_configured"


class ConversationNotFoundError(LegalGPTError):
    status_code = 404
    error_code = "conversation_not_found"


class EmailAlreadyRegisteredError(LegalGPTError):
    status_code = 409
    error_code = "email_already_registered"


class InvalidCredentialsError(LegalGPTError):
    status_code = 401
    error_code = "invalid_credentials"


class NotAuthenticatedError(LegalGPTError):
    status_code = 401
    error_code = "not_authenticated"


class PhoneNumberNotFoundError(LegalGPTError):
    status_code = 404
    error_code = "phone_number_not_found"


class PhoneAlreadyRegisteredError(LegalGPTError):
    status_code = 409
    error_code = "phone_already_registered"


class OTPInvalidError(LegalGPTError):
    status_code = 400
    error_code = "invalid_otp"


class OTPExpiredError(LegalGPTError):
    status_code = 400
    error_code = "otp_expired"


class OTPMaxAttemptsExceededError(LegalGPTError):
    status_code = 429
    error_code = "otp_max_attempts_exceeded"


class OTPRateLimitError(LegalGPTError):
    status_code = 429
    error_code = "otp_rate_limited"


class InvalidResetTokenError(LegalGPTError):
    status_code = 400
    error_code = "invalid_reset_token"
