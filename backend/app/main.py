from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.analysis import router as analysis_router
from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.api.routes.documents import router as documents_router
from app.api.routes.evaluation import router as evaluation_router
from app.api.routes.health import router as health_router
from app.api.routes.upload import router as upload_router
from app.config import settings
from app.core.exceptions import LegalGPTError
from app.core.logging import logger
from app.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.app_name} v{settings.app_version} ({settings.environment})")
    settings.ensure_dirs()
    await init_db()
    logger.info(
        f"LLM provider: {settings.llm_provider} | Embedding provider: {settings.embedding_provider}"
    )
    yield
    logger.info("Shutting down LegalGPT API.")


app = FastAPI(
    title=settings.app_name,
    description="AI-powered Legal Document Assistant",
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(LegalGPTError)
async def legalgpt_error_handler(request: Request, exc: LegalGPTError):
    logger.error(f"{exc.error_code} on {request.method} {request.url.path}: {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error_code": exc.error_code, "message": exc.message},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error_code": "internal_error", "message": "An unexpected error occurred."},
    )


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(upload_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(analysis_router)
app.include_router(evaluation_router)


@app.get("/")
def home():
    return {
        "message": "Welcome to LegalGPT API \U0001f680",
        "docs": "/docs",
        "health": "/health",
    }
