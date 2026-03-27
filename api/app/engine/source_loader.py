"""Source loader — shared utilities for loading data source instances and profiles.

Extracted from api/sources.py for reuse in the analysis pipeline.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DataSourceModel
from app.sources.file_source import FileSource
from app.sources.database_source import DatabaseSource
from app.sources.api_source import APISource

logger = logging.getLogger(__name__)


def make_source_instance(record: dict):
    """Recreate a DataSource instance from a stored DB record."""
    st = record.get("type") or record.get("source_type", "")
    config = record.get("config", {}) if "config" in record else record

    if st == "file":
        file_path = config.get("file_path") or record.get("file_path", "")
        return FileSource(file_path=file_path)
    elif st == "database":
        cfg = config.get("connection_config", {})
        return DatabaseSource(
            db_type=cfg.get("db_type", "postgresql"),
            host=cfg.get("host", "localhost"),
            port=cfg.get("port", 5432),
            database=cfg.get("database", ""),
            username=cfg.get("username", ""),
            password=cfg.get("password", ""),
            table=config.get("selected_table"),
        )
    elif st == "api":
        cfg = config.get("api_config", {})
        try:
            cfg = APISource.decrypt_config(dict(cfg))
        except Exception:
            pass
        return APISource.from_config(cfg)
    raise ValueError(f"Unknown source type: {st}")


async def load_source_records(
    source_ids: list[str], session: AsyncSession
) -> list[dict[str, Any]]:
    """Load raw DataSource rows from DB by IDs."""
    if not source_ids:
        return []
    stmt = select(DataSourceModel).where(DataSourceModel.id.in_(source_ids))
    result = await session.execute(stmt)
    rows = result.scalars().all()
    records = []
    for row in rows:
        rec: dict[str, Any] = {
            "id": row.id,
            "name": row.name,
            "type": row.type,
            "config": row.config or {},
            "profile": row.profile,
        }
        records.append(rec)
    return records


def _normalize_columns(columns: list[dict]) -> list[dict]:
    """Normalize column dicts: map earliest/latest → min_value/max_value."""
    for col in columns:
        if col.get("earliest") is not None and col.get("min_value") is None:
            col["min_value"] = col["earliest"]
        if col.get("latest") is not None and col.get("max_value") is None:
            col["max_value"] = col["latest"]
    return columns


def _profile_entry(
    source_id: str, source_name: str, source_type: str, profile_data: dict,
) -> dict[str, Any]:
    """Build a single normalized profile entry from profile JSONB."""
    inner = profile_data.get("profile") or {}
    columns = _normalize_columns(inner.get("columns", []))
    return {
        "source_id": source_id,
        "source_name": source_name,
        "source_type": source_type,
        "row_count": profile_data.get("row_count") or inner.get("row_count", 0),
        "column_count": profile_data.get("column_count") or inner.get("column_count", 0),
        "columns": columns,
        "quality_issues": inner.get("quality_issues", []),
    }


async def load_source_profiles(
    source_ids: list[str], session: AsyncSession
) -> list[dict[str, Any]]:
    """Load profile dicts for given source IDs.

    For database sources with multiple selected tables, expands into
    one profile entry per table (source_name = "{name} / {table}").

    Returns a list of profile dicts with structure:
    {name, row_count, column_count, columns: [...], quality_issues: [...]}
    """
    records = await load_source_records(source_ids, session)
    profiles = []
    for rec in records:
        profile_data = rec.get("profile")
        if not profile_data:
            continue

        # Multi-table expansion for database sources
        table_profiles = profile_data.get("tables")
        if table_profiles and isinstance(table_profiles, dict) and len(table_profiles) > 0:
            for table_name, tp in table_profiles.items():
                profiles.append(_profile_entry(
                    source_id=rec["id"],
                    source_name=f"{rec['name']} / {table_name}",
                    source_type=rec["type"],
                    profile_data=tp,
                ))
        else:
            # Single-table or file/api source — original logic
            profiles.append(_profile_entry(
                source_id=rec["id"],
                source_name=rec["name"],
                source_type=rec["type"],
                profile_data=profile_data,
            ))
    return profiles


def expand_source_instances(record: dict) -> list[tuple[object, str]]:
    """For database sources with multiple tables, return one instance per table.

    Returns list of (source_instance, data_path_suffix) tuples.
    For non-database or single-table sources, returns a single-element list.
    """
    st = record.get("type") or record.get("source_type", "")
    config = record.get("config", {}) if "config" in record else record

    if st == "database":
        selected_tables = config.get("selected_tables") or []
        if not selected_tables and config.get("selected_table"):
            selected_tables = [config["selected_table"]]

        if len(selected_tables) > 1:
            cfg = config.get("connection_config", {})
            instances = []
            for table in selected_tables:
                src = DatabaseSource(
                    db_type=cfg.get("db_type", "postgresql"),
                    host=cfg.get("host", "localhost"),
                    port=cfg.get("port", 5432),
                    database=cfg.get("database", ""),
                    username=cfg.get("username", ""),
                    password=cfg.get("password", ""),
                    table=table,
                )
                instances.append((src, table))
            return instances

    # Default: single instance
    src = make_source_instance(record)
    return [(src, "")]
