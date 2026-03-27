"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.api import chat, files, sessions, settings as settings_api, sources
from app.db import init_db
import app.db as _db


async def _refresh_oauth_token(conn, session, logger) -> bool:
    """Try to refresh an OAuth token. Returns True if successful."""
    import httpx
    from datetime import datetime, timedelta, timezone

    if conn.provider == "anthropic":
        token_url = "https://platform.claude.com/v1/oauth/token"
        client_id = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
    elif conn.provider == "openai_compatible":
        token_url = "https://auth.openai.com/oauth/token"
        client_id = "app_EMoamEEZ73f0CkXaXp7hrann"
    else:
        return False

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(token_url, json={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "refresh_token": conn.refresh_token,
            }, headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            })

        if resp.status_code != 200:
            logger.warning(f"Token refresh failed for {conn.id}: HTTP {resp.status_code}")
            return False

        tokens = resp.json()
        conn.api_key = tokens.get("access_token", conn.api_key)
        conn.refresh_token = tokens.get("refresh_token", conn.refresh_token)
        expires_in = tokens.get("expires_in")
        if expires_in:
            conn.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        await session.commit()
        logger.info(f"Refreshed OAuth token for connection {conn.id}")
        return True
    except Exception as e:
        logger.warning(f"Token refresh error for {conn.id}: {e}")
        return False


async def _restore_llm_config() -> None:
    """Restore default LLM connections from DB on startup."""
    import logging
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select
    from app.db.models import LlmConnectionModel
    from app.llm.router import llm_router

    logger = logging.getLogger(__name__)

    assert _db.async_session_factory is not None
    async with _db.async_session_factory() as session:
        result = await session.execute(
            select(LlmConnectionModel).where(
                LlmConnectionModel.is_default == True  # noqa: E712
            )
        )
        rows = result.scalars().all()

        for conn in rows:
            try:
                # Auto-refresh OAuth tokens that are expired or expiring soon
                if (conn.auth_type == "oauth_token"
                        and conn.refresh_token
                        and conn.token_expires_at):
                    now = datetime.now(timezone.utc)
                    expires_at = conn.token_expires_at
                    if expires_at.tzinfo is None:
                        from datetime import timezone as tz
                        expires_at = expires_at.replace(tzinfo=tz.utc)
                    if expires_at < now + timedelta(minutes=5):
                        refreshed = await _refresh_oauth_token(conn, session, logger)
                        if not refreshed:
                            logger.warning(f"OAuth token expired and refresh failed for {conn.id}")
                            continue

                if conn.provider == "anthropic":
                    llm_router.configure_claude(
                        api_key=conn.api_key or "",
                        model=conn.model,
                    )
                    logger.info(f"Restored Claude backend from DB ({conn.model})")
                else:
                    llm_router.configure_generic(
                        api_key=conn.api_key,
                        base_url=conn.base_url,
                        model=conn.model,
                    )
                    logger.info(f"Restored generic backend from DB ({conn.model})")
            except Exception as e:
                logger.warning(f"Failed to restore LLM connection {conn.id}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {settings.app_name}...")
    await init_db()
    await _restore_llm_config()
    yield
    print(f"Shutting down {settings.app_name}...")
    if _db.engine is not None:
        await _db.engine.dispose()


app = FastAPI(
    title=settings.app_name,
    description="重明 Data Agent — AI-powered data analysis",
    version="0.5.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(sessions.router, prefix="/api", tags=["Sessions"])
app.include_router(settings_api.router, prefix="/api", tags=["Settings"])
app.include_router(sources.router, prefix="/api", tags=["Sources"])
app.include_router(files.router, prefix="/api", tags=["Files"])


@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.app_name}", "version": "0.5.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}
