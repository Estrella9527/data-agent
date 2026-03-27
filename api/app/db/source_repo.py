"""Data source repository — async CRUD on the ``data_sources`` table.

Design principles
-----------------
* ``config`` (JSONB) stores source-type-specific settings:
    - file  → file_path, file_name, file_size_bytes, status
    - database → connection_config, available_tables, selected_table, status
    - api   → api_config, status
* ``profile`` (JSONB) stores analysis results:
    - schema_info, profile (data profile dict), row_count, column_count
* ``_to_record()`` merges both JSONB blobs back into the flat dict the
  frontend expects — **zero changes to the API response shape**.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DataSourceModel


# ── helpers ──────────────────────────────────────────────────────

def _generate_id() -> str:
    return f"src_{int(time.time() * 1000)}"


def _to_record(row: DataSourceModel) -> dict[str, Any]:
    """Convert a DB row into the flat dict the REST API returns."""
    record: dict[str, Any] = {
        "id": row.id,
        "name": row.name,
        "source_type": row.type,
        "created_at": (
            row.created_at.strftime("%Y-%m-%dT%H:%M:%SZ") if row.created_at else ""
        ),
    }
    # Merge source-specific config
    if row.config:
        record.update(row.config)
    # Merge profile / schema info
    if row.profile:
        prof = dict(row.profile)
        # Rename 'tables' → 'table_profiles' for frontend consistency
        if "tables" in prof:
            prof["table_profiles"] = prof.pop("tables")
        record.update(prof)
    # Ensure common fields always present
    record.setdefault("status", "active")
    record.setdefault("schema_info", [])
    record.setdefault("profile", None)
    record.setdefault("row_count", None)
    record.setdefault("column_count", None)
    # Backward compat: ensure selected_tables array exists for database sources
    if record.get("source_type") == "database" or (row.config and row.config.get("connection_config")):
        if "selected_tables" not in record and record.get("selected_table"):
            record["selected_tables"] = [record["selected_table"]]
        record.setdefault("selected_tables", [])
    return record


# ── repository ───────────────────────────────────────────────────

class SourceRepo:
    """Thin async repository over ``data_sources``."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── read ──

    async def list_all(self, source_type: str | None = None) -> list[dict]:
        stmt = select(DataSourceModel).order_by(DataSourceModel.created_at.desc())
        if source_type:
            stmt = stmt.where(DataSourceModel.type == source_type)
        result = await self.session.execute(stmt)
        return [_to_record(r) for r in result.scalars().all()]

    async def get_by_id(self, source_id: str) -> dict | None:
        row = await self.session.get(DataSourceModel, source_id)
        return _to_record(row) if row else None

    # ── create ──

    async def create(
        self,
        name: str,
        source_type: str,
        config: dict,
        profile_data: dict | None = None,
    ) -> dict:
        now = datetime.utcnow()
        row = DataSourceModel(
            id=_generate_id(),
            name=name,
            type=source_type,
            config=config,
            profile=profile_data,
            profiled_at=now if profile_data else None,
            created_at=now,
            updated_at=now,
        )
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return _to_record(row)

    # ── update helpers ──

    async def update_name(self, source_id: str, name: str) -> dict | None:
        row = await self.session.get(DataSourceModel, source_id)
        if not row:
            return None
        row.name = name
        row.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(row)
        return _to_record(row)

    async def update_config(self, source_id: str, updates: dict) -> dict | None:
        """Merge *updates* into existing config JSONB."""
        row = await self.session.get(DataSourceModel, source_id)
        if not row:
            return None
        new_cfg = dict(row.config or {})
        new_cfg.update(updates)
        row.config = new_cfg
        row.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(row)
        return _to_record(row)

    async def update_profile(self, source_id: str, profile_data: dict) -> dict | None:
        """Replace the profile JSONB."""
        row = await self.session.get(DataSourceModel, source_id)
        if not row:
            return None
        row.profile = profile_data
        row.profiled_at = datetime.utcnow()
        row.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(row)
        return _to_record(row)

    async def update_config_and_profile(
        self, source_id: str, config_updates: dict, profile_data: dict,
    ) -> dict | None:
        """Atomic update of both config and profile."""
        row = await self.session.get(DataSourceModel, source_id)
        if not row:
            return None
        new_cfg = dict(row.config or {})
        new_cfg.update(config_updates)
        row.config = new_cfg
        row.profile = profile_data
        row.profiled_at = datetime.utcnow()
        row.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(row)
        return _to_record(row)

    # ── delete ──

    async def delete(self, source_id: str) -> dict | None:
        """Delete and return the last snapshot (for file cleanup)."""
        row = await self.session.get(DataSourceModel, source_id)
        if not row:
            return None
        record = _to_record(row)
        await self.session.delete(row)
        await self.session.commit()
        return record
