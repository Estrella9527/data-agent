"""Plan repository — CRUD operations on the plans table."""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PlanModel, SessionModel


def _generate_id() -> str:
    return f"plan_{int(time.time() * 1000)}"


def _to_dict(row: PlanModel) -> dict[str, Any]:
    return {
        "id": row.id,
        "session_id": row.session_id,
        "goals": row.goals,
        "mode": row.mode,
        "version": row.version,
        "status": row.status,
        "report": row.report,
        "created_at": str(row.created_at) if row.created_at else "",
    }


class PlanRepo:
    """Thin async repository over the plans table."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _ensure_session(self, session_id: str) -> None:
        """Auto-create session row if not present (avoids FK violation)."""
        existing = await self.session.get(SessionModel, session_id)
        if not existing:
            from datetime import datetime
            self.session.add(SessionModel(
                id=session_id,
                state="IDLE",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            ))
            await self.session.flush()

    async def create(
        self,
        session_id: str,
        goals: list[dict],
        mode: str = "standard",
    ) -> str:
        """Create a new plan, return its ID."""
        await self._ensure_session(session_id)
        plan_id = _generate_id()
        row = PlanModel(
            id=plan_id,
            session_id=session_id,
            goals=goals,
            mode=mode,
            version=1,
            status="draft",
        )
        self.session.add(row)
        await self.session.commit()
        return plan_id

    async def get_by_id(self, plan_id: str) -> dict | None:
        row = await self.session.get(PlanModel, plan_id)
        return _to_dict(row) if row else None

    async def get_latest(self, session_id: str) -> dict | None:
        """Get the latest plan for a session."""
        stmt = (
            select(PlanModel)
            .where(PlanModel.session_id == session_id)
            .order_by(desc(PlanModel.created_at))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        row = result.scalar_one_or_none()
        return _to_dict(row) if row else None

    async def update_goals(
        self, plan_id: str, goals: list[dict], version: int
    ) -> None:
        row = await self.session.get(PlanModel, plan_id)
        if row:
            row.goals = goals
            row.version = version
            await self.session.commit()

    async def update_status(self, plan_id: str, status: str) -> None:
        try:
            row = await self.session.get(PlanModel, plan_id)
            if row:
                row.status = status
                await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def save_report(self, plan_id: str, report_markdown: str) -> None:
        """Save the generated report to the plan record."""
        try:
            row = await self.session.get(PlanModel, plan_id)
            if row:
                row.report = {"markdown": report_markdown}
                await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
