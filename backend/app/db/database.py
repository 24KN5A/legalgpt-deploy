"""
Async SQLAlchemy engine + session factory backed by SQLite.

SQLite is sufficient here because LegalGPT only stores lightweight metadata
(document records, conversations, messages) -- the heavy lifting (semantic
search over chunk text) lives in ChromaDB, not this database.
"""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    f"sqlite+aiosqlite:///{settings.sqlite_path}",
    echo=False,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def _run_migrations(connection) -> None:
    """Safely apply non-destructive column additions for SQLite."""
    cursor = connection.connection.cursor()
    # Check users table
    cursor.execute("PRAGMA table_info(users)")
    user_cols = {row[1] for row in cursor.fetchall()}
    if user_cols and "phone_number" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN phone_number VARCHAR(32)")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone_number ON users (phone_number)")
    cursor.close()


async def init_db() -> None:
    """Create tables on startup if they don't already exist and apply migrations."""
    # Import models so they're registered on Base.metadata before create_all.
    from app.db import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_run_migrations)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
