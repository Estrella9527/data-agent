"""Database connection — async SQLAlchemy + asyncpg.

Shared PostgreSQL with the Next.js Prisma layer.
Tables are auto-created on startup if they don't already exist.

Engine and session factory are created lazily on first use (``init_db``),
so importing this module has no side-effects and works even when the
database driver is not yet installed.
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)

# Lazy singletons — initialised in ``init_db()``
engine: Optional[AsyncEngine] = None
async_session_factory: Optional[async_sessionmaker] = None


async def init_db() -> None:
    """Create the engine, session factory and ensure tables exist."""
    global engine, async_session_factory

    from sqlalchemy.ext.asyncio import create_async_engine as _create
    from app.db.models import Base

    db_url = settings.database_url.replace(
        "postgresql://", "postgresql+asyncpg://", 1,
    )
    engine = _create(db_url, echo=False, pool_size=5, max_overflow=10)
    async_session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Ensure new columns exist on pre-existing tables
        await conn.execute(
            text("ALTER TABLE plans ADD COLUMN IF NOT EXISTS report JSONB")
        )
    logger.info("Database initialised — tables verified / created")


async def get_session() -> AsyncSession:  # type: ignore[misc]
    """FastAPI dependency — yields an async session, auto-closes."""
    assert async_session_factory is not None, "Database not initialised — call init_db() first"
    async with async_session_factory() as session:
        yield session
