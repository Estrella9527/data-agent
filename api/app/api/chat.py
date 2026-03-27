"""Chat API routes — SSE streaming + pipeline interaction endpoints."""

import uuid
from typing import Optional, List, Dict

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from app.db import get_session

logger = logging.getLogger(__name__)
from app.db.models import LlmConnectionModel
from app.engine.agent_engine import AgentEngine
from app.engine.events import error, done
from app.llm.router import llm_router

router = APIRouter()


async def _load_session_ds_ids(db: AsyncSession, session_id: str) -> list[str]:
    """Fallback: load data source IDs from session_data_contexts table."""
    from sqlalchemy import text
    result = await db.execute(
        text(
            "SELECT data_source_id FROM session_data_contexts "
            "WHERE session_id = :sid"
        ),
        {"sid": session_id},
    )
    return [row[0] for row in result.fetchall()]


class ChatStreamRequest(BaseModel):
    sessionId: str
    message: str
    dataSourceIds: Optional[List[str]] = None
    tableSchemas: Optional[List[Dict]] = None
    history: Optional[List[Dict]] = None
    mode: Optional[str] = None  # User-selected mode override


class ConfigureRequest(BaseModel):
    """Configure LLM backend. provider determines which backend to configure."""
    provider: str = "generic"  # "anthropic" | "openai_compatible" | "local"
    apiKey: Optional[str] = None
    baseUrl: Optional[str] = None
    model: Optional[str] = None
    name: Optional[str] = None
    isDefault: bool = True
    authType: str = "api_key"  # "api_key" | "oauth_token"
    refreshToken: Optional[str] = None
    tokenExpiresAt: Optional[str] = None


@router.post("/chat/stream")
async def chat_stream(
    req: ChatStreamRequest,
    db: AsyncSession = Depends(get_session),
):
    """Stream agent response as SSE events."""
    engine = AgentEngine(
        session_id=req.sessionId,
        data_source_ids=req.dataSourceIds or [],
        table_schemas=req.tableSchemas,
        history=req.history,
        mode=req.mode,
        db_session=db,
    )

    async def event_generator():
        try:
            async for event in engine.stream(req.message):
                yield event.to_sse()
        except Exception as e:
            import traceback
            logger.error(f"Stream error: {e}\n{traceback.format_exc()}")
            yield error(str(e)).to_sse()
            yield done().to_sse()
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Pipeline interaction endpoints ───────────────────

class ClarifyRequest(BaseModel):
    answers: Dict[str, str] = {}
    skipAll: bool = False
    message: Optional[str] = None  # Original user message for plan regeneration
    dataSourceIds: Optional[List[str]] = None


@router.post("/sessions/{session_id}/clarify")
async def submit_clarify(
    session_id: str,
    req: ClarifyRequest,
    db: AsyncSession = Depends(get_session),
):
    """Submit clarification answers and stream regenerated plan via SSE."""
    from app.engine.plan_repo import PlanRepo
    repo = PlanRepo(db)
    plan = await repo.get_latest(session_id)
    if not plan:
        return {"success": False, "error": "No plan found for this session"}

    # If skipAll, just return JSON — no regeneration needed
    if req.skipAll:
        return {"success": True, "action": "skipped", "planId": plan["id"]}

    # Stream plan regeneration with clarify answers
    user_message = req.message or ""
    if not user_message:
        # Fallback: query raw Message table (managed by Prisma)
        from sqlalchemy import text
        result = await db.execute(
            text(
                "SELECT content FROM messages "
                "WHERE session_id = :sid AND role = 'user' "
                "ORDER BY created_at DESC LIMIT 1"
            ),
            {"sid": session_id},
        )
        row = result.first()
        if row:
            user_message = row[0]

    ds_ids = req.dataSourceIds or []
    if not ds_ids:
        ds_ids = await _load_session_ds_ids(db, session_id)

    engine = AgentEngine(
        session_id=session_id,
        data_source_ids=ds_ids,
        db_session=db,
    )

    async def event_generator():
        try:
            async for event in engine.resume_after_clarify(user_message, req.answers):
                yield event.to_sse()
        except Exception as e:
            yield error(str(e)).to_sse()
            yield done().to_sse()
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class ConfirmRequest(BaseModel):
    planId: str


@router.post("/sessions/{session_id}/confirm")
async def confirm_plan(
    session_id: str,
    req: ConfirmRequest,
    db: AsyncSession = Depends(get_session),
):
    """Confirm a plan (confirm only — replan uses /replan endpoint)."""
    from app.engine.plan_repo import PlanRepo
    repo = PlanRepo(db)
    await repo.update_status(req.planId, "confirmed")
    return {"success": True, "action": "confirmed", "planId": req.planId}


class ReplanRequest(BaseModel):
    message: Optional[str] = None
    dataSourceIds: Optional[List[str]] = None


@router.post("/sessions/{session_id}/replan")
async def replan(
    session_id: str,
    req: ReplanRequest,
    db: AsyncSession = Depends(get_session),
):
    """Regenerate plan via SSE (used by modifyPlan)."""
    user_message = req.message or ""
    if not user_message:
        from sqlalchemy import text
        result = await db.execute(
            text(
                "SELECT content FROM messages "
                "WHERE session_id = :sid AND role = 'user' "
                "ORDER BY created_at DESC LIMIT 1"
            ),
            {"sid": session_id},
        )
        row = result.first()
        if row:
            user_message = row[0]

    ds_ids = req.dataSourceIds or []
    if not ds_ids:
        ds_ids = await _load_session_ds_ids(db, session_id)

    engine = AgentEngine(
        session_id=session_id,
        data_source_ids=ds_ids,
        db_session=db,
    )

    async def event_generator():
        try:
            async for event in engine.resume_after_clarify(user_message, {}):
                yield event.to_sse()
        except Exception as e:
            yield error(str(e)).to_sse()
            yield done().to_sse()
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class ExecuteRequest(BaseModel):
    planId: str
    dataSourceIds: Optional[List[str]] = None


@router.post("/sessions/{session_id}/execute")
async def execute_plan(
    session_id: str,
    req: ExecuteRequest,
    db: AsyncSession = Depends(get_session),
):
    """Stream execution of a confirmed plan."""
    ds_ids = req.dataSourceIds or []
    if not ds_ids:
        ds_ids = await _load_session_ds_ids(db, session_id)

    engine = AgentEngine(
        session_id=session_id,
        data_source_ids=ds_ids,
        db_session=db,
    )

    async def event_generator():
        try:
            async for event in engine.resume_after_confirm(req.planId):
                yield event.to_sse()
        except Exception as e:
            import traceback
            logger.error(f"Execute error: {e}\n{traceback.format_exc()}")
            yield error(str(e)).to_sse()
            yield done().to_sse()
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sessions/{session_id}/report")
async def get_report(
    session_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Get the latest report for a session."""
    from app.engine.plan_repo import PlanRepo
    repo = PlanRepo(db)
    plan = await repo.get_latest(session_id)
    if not plan or not plan.get("report"):
        return {"success": False, "error": "No report found for this session"}
    report = plan["report"]
    return {
        "success": True,
        "markdown": report.get("markdown", ""),
        "planId": plan["id"],
    }


@router.get("/settings/llm")
async def get_llm_status(db: AsyncSession = Depends(get_session)):
    """Get current LLM backend status + persisted connections."""
    backends = []
    if llm_router.has_claude:
        b = llm_router.get_backend("default")
        backends.append({
            "type": "claude",
            "model": b.get_model(),
            "status": "active",
        })
    if llm_router.has_generic:
        b = llm_router.get_backend("title_gen")
        backends.append({
            "type": "generic",
            "model": b.get_model(),
            "status": "active",
        })

    # Fetch persisted connections from DB
    result = await db.execute(
        select(LlmConnectionModel).order_by(LlmConnectionModel.created_at)
    )
    rows = result.scalars().all()
    def _mask_key(key: Optional[str]) -> str:
        if not key or len(key) < 8:
            return ""
        return key[:6] + "•" * min(len(key) - 10, 20) + key[-4:]

    connections = [
        {
            "id": r.id,
            "provider": r.provider,
            "name": r.name,
            "baseUrl": r.base_url,
            "model": r.model,
            "authType": r.auth_type,
            "tokenExpiresAt": r.token_expires_at.isoformat() if r.token_expires_at else None,
            "isDefault": r.is_default,
            "maskedApiKey": _mask_key(r.api_key),
        }
        for r in rows
    ]

    return {
        "success": True,
        "backends": backends,
        "connections": connections,
        "hasAny": len(backends) > 0,
    }


@router.post("/settings/llm")
async def configure_llm(
    req: ConfigureRequest,
    db: AsyncSession = Depends(get_session),
):
    """Reconfigure LLM backend at runtime and persist to DB."""
    # 1. Configure in-memory router
    if req.provider == "anthropic":
        llm_router.configure_claude(
            api_key=req.apiKey or "",
            model=req.model,
        )
        backend = llm_router.get_backend("default")
    else:
        llm_router.configure_generic(
            api_key=req.apiKey,
            base_url=req.baseUrl,
            model=req.model,
        )
        backend = llm_router.get_backend("title_gen")

    # 2. Persist to DB — upsert by provider + base_url + model
    name = req.name or (
        "Anthropic" if req.provider == "anthropic"
        else req.model or "Generic"
    )
    model_val = req.model or backend.get_model()

    # Parse tokenExpiresAt if provided
    token_expires = None
    if req.tokenExpiresAt:
        from datetime import datetime
        try:
            token_expires = datetime.fromisoformat(req.tokenExpiresAt.replace("Z", "+00:00"))
        except ValueError:
            pass

    # Check for existing connection with same provider + base_url + model
    filters = [
        LlmConnectionModel.provider == req.provider,
        LlmConnectionModel.model == model_val,
    ]
    if req.baseUrl:
        filters.append(LlmConnectionModel.base_url == req.baseUrl)
    else:
        filters.append(
            (LlmConnectionModel.base_url == None) | (LlmConnectionModel.base_url == "")  # noqa: E711
        )

    existing = await db.execute(
        select(LlmConnectionModel).where(*filters)
    )
    conn = existing.scalar_one_or_none()

    if conn:
        # Update existing connection
        conn.api_key = req.apiKey or conn.api_key
        conn.name = name
        conn.auth_type = req.authType
        conn.refresh_token = req.refreshToken or conn.refresh_token
        conn.token_expires_at = token_expires or conn.token_expires_at
        conn_id = conn.id
    else:
        # Insert new connection
        conn_id = str(uuid.uuid4())[:8]
        conn = LlmConnectionModel(
            id=conn_id,
            provider=req.provider,
            name=name,
            api_key=req.apiKey,
            base_url=req.baseUrl,
            model=model_val,
            auth_type=req.authType,
            refresh_token=req.refreshToken,
            token_expires_at=token_expires,
            is_default=req.isDefault,
        )
        db.add(conn)

    # Handle default flag — clear other defaults of the same provider
    if req.isDefault:
        others = await db.execute(
            select(LlmConnectionModel).where(
                LlmConnectionModel.provider == req.provider,
                LlmConnectionModel.is_default == True,  # noqa: E712
                LlmConnectionModel.id != conn_id,
            )
        )
        for row in others.scalars().all():
            row.is_default = False
        conn.is_default = True

    await db.commit()

    return {"success": True, "model": backend.get_model(), "connectionId": conn_id}


class RefreshRequest(BaseModel):
    connectionId: str


@router.post("/settings/llm/refresh")
async def refresh_llm_token(req: RefreshRequest, db: AsyncSession = Depends(get_session)):
    """Refresh an OAuth token for a connection."""
    import httpx
    from datetime import datetime, timedelta, timezone

    result = await db.execute(
        select(LlmConnectionModel).where(LlmConnectionModel.id == req.connectionId)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        return {"success": False, "error": "Connection not found"}

    if conn.auth_type != "oauth_token" or not conn.refresh_token:
        return {"success": False, "error": "Not an OAuth connection or no refresh token"}

    # Determine token endpoint based on provider
    if conn.provider == "anthropic":
        token_url = "https://platform.claude.com/v1/oauth/token"
        client_id = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
    elif conn.provider == "openai_compatible":
        token_url = "https://auth.openai.com/oauth/token"
        client_id = "app_EMoamEEZ73f0CkXaXp7hrann"
    else:
        return {"success": False, "error": "Provider does not support OAuth refresh"}

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
            return {"success": False, "error": f"Token refresh failed: {resp.status_code}"}

        tokens = resp.json()
        new_access = tokens.get("access_token")
        new_refresh = tokens.get("refresh_token", conn.refresh_token)
        expires_in = tokens.get("expires_in")

        new_expires = None
        if expires_in:
            new_expires = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        # Update DB
        conn.api_key = new_access
        conn.refresh_token = new_refresh
        conn.token_expires_at = new_expires
        await db.commit()

        # Re-configure in-memory backend
        if conn.provider == "anthropic":
            llm_router.configure_claude(api_key=new_access, model=conn.model)
        else:
            llm_router.configure_generic(
                api_key=new_access, base_url=conn.base_url, model=conn.model,
            )

        return {
            "success": True,
            "tokenExpiresAt": new_expires.isoformat() if new_expires else None,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


class TestConnectionRequest(BaseModel):
    provider: str = "generic"
    apiKey: Optional[str] = None
    baseUrl: Optional[str] = None
    model: Optional[str] = None


@router.post("/settings/llm/test")
async def test_llm_connection(req: TestConnectionRequest):
    """Test an LLM connection without saving it."""
    try:
        if req.provider == "anthropic":
            from app.llm.claude_backend import ClaudeBackend
            backend = ClaudeBackend(
                api_key=req.apiKey or "",
                model=req.model or "claude-sonnet-4-20250514",
            )
        else:
            from app.llm.generic_backend import GenericBackend
            backend = GenericBackend(
                api_key=req.apiKey or "sk-placeholder",
                base_url=req.baseUrl or "https://api.openai.com/v1",
                model=req.model or "gpt-4o",
            )

        result = await backend.chat(
            messages=[{"role": "user", "content": "Say 'OK' in one word."}],
            max_tokens=10,
        )
        return {
            "success": True,
            "model": backend.get_model(),
            "response": result.get("content", "")[:100],
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }
