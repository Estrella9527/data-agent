"""Data source API routes — CRUD + upload + profiling for file/database/API sources.

Persistence: PostgreSQL via async SQLAlchemy (replaces in-memory dict).
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.db.source_repo import SourceRepo
from app.sources.api_source import APISource
from app.sources.database_source import DatabaseSource
from app.sources.file_source import FileSource

router = APIRouter()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads",
)


# ── dependency injection ──────────────────────

async def _get_repo(session: AsyncSession = Depends(get_session)) -> SourceRepo:
    return SourceRepo(session)


# ── helpers ───────────────────────────────────

def _make_source_instance(record: dict):
    """Recreate a DataSource instance from a stored record."""
    st = record["source_type"]
    if st == "file":
        return FileSource(file_path=record["file_path"])
    elif st == "database":
        cfg = record.get("connection_config", {})
        return DatabaseSource(
            db_type=cfg.get("db_type", "postgresql"),
            host=cfg.get("host", "localhost"),
            port=cfg.get("port", 5432),
            database=cfg.get("database", ""),
            username=cfg.get("username", ""),
            password=cfg.get("password", ""),
            table=record.get("selected_table"),
        )
    elif st == "api":
        cfg = record.get("api_config", {})
        try:
            cfg = APISource.decrypt_config(dict(cfg))
        except Exception:
            pass
        return APISource.from_config(cfg)
    raise HTTPException(400, f"Unknown source type: {st}")


def _build_profile_dict(profile) -> dict:
    """Serialize a DataProfile into the dict stored in the profile JSONB column."""
    return {
        "schema_info": [c.__dict__ for c in profile.columns] if profile.columns else [],
        "profile": profile.to_dict(),
        "row_count": profile.row_count,
        "column_count": profile.column_count,
    }


# ──────────────────────────────────────────────
# File source endpoints
# ──────────────────────────────────────────────

@router.post("/sources/file")
async def upload_file_source(
    file: UploadFile = File(...),
    name: str = Form(None),
    repo: SourceRepo = Depends(_get_repo),
):
    """Upload a file (CSV/Excel/TSV) and auto-profile it."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".csv", ".xlsx", ".xls", ".tsv"):
        raise HTTPException(400, f"Unsupported file type: {ext}. Supported: CSV, Excel, TSV")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    safe_name = f"{int(time.time())}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    source = FileSource(file_path=file_path, file_name=file.filename)
    ok, msg = await source.test_connection()
    if not ok:
        os.remove(file_path)
        raise HTTPException(400, msg)

    profile = await source.get_profile()

    record = await repo.create(
        name=name or file.filename,
        source_type="file",
        config={
            "file_path": file_path,
            "file_name": file.filename,
            "file_size_bytes": len(content),
            "status": "active",
        },
        profile_data=_build_profile_dict(profile),
    )
    return {"success": True, "data": record}


# ──────────────────────────────────────────────
# Database source endpoints
# ──────────────────────────────────────────────

class DatabaseCreateRequest(BaseModel):
    name: str
    db_type: str  # mysql | postgresql
    host: str
    port: int
    database: str
    username: str
    password: str


@router.post("/sources/database")
async def create_database_source(
    req: DatabaseCreateRequest,
    repo: SourceRepo = Depends(_get_repo),
):
    """Create a database data source."""
    db_src = DatabaseSource(
        db_type=req.db_type,
        host=req.host,
        port=req.port,
        database=req.database,
        username=req.username,
        password=req.password,
    )

    ok, msg = await db_src.test_connection()
    if not ok:
        raise HTTPException(400, msg)

    tables = await db_src.list_tables()

    record = await repo.create(
        name=req.name,
        source_type="database",
        config={
            "connection_config": {
                "db_type": req.db_type,
                "host": req.host,
                "port": req.port,
                "database": req.database,
                "username": req.username,
                "password": req.password,
            },
            "available_tables": tables,
            "selected_table": None,
            "status": "active",
        },
        profile_data={
            "schema_info": [],
            "profile": None,
            "row_count": None,
            "column_count": None,
        },
    )
    return {"success": True, "data": record}


@router.post("/sources/database/{source_id}/test")
async def test_database_connection(
    source_id: str,
    repo: SourceRepo = Depends(_get_repo),
):
    """Test database connection and return available tables."""
    source = await repo.get_by_id(source_id)
    if not source or source["source_type"] != "database":
        raise HTTPException(404, "Database source not found")

    db_src = _make_source_instance(source)
    ok, msg = await db_src.test_connection()
    if not ok:
        await repo.update_config(source_id, {"status": "error"})
        return {"success": False, "error": msg}

    tables = await db_src.list_tables()
    await repo.update_config(source_id, {"available_tables": tables, "status": "active"})
    return {"success": True, "data": {"tables": tables, "message": msg}}


class TableSelectRequest(BaseModel):
    table: str


class TablesAddRequest(BaseModel):
    tables: list[str]


class TablesRemoveRequest(BaseModel):
    tables: list[str]


class SelectedTablesRequest(BaseModel):
    tables: list[str]


@router.patch("/sources/database/{source_id}/selected-tables")
async def update_selected_tables(
    source_id: str,
    req: SelectedTablesRequest,
    repo: SourceRepo = Depends(_get_repo),
):
    """Update selected tables list without triggering profiling."""
    source = await repo.get_by_id(source_id)
    if not source or source["source_type"] != "database":
        raise HTTPException(404, "Database source not found")

    available = source.get("available_tables", [])
    for t in req.tables:
        if t not in available:
            raise HTTPException(400, f"Table '{t}' not found in database")

    first_table = req.tables[0] if req.tables else None
    config_updates = {
        "selected_tables": req.tables,
        "selected_table": first_table,
    }
    record = await repo.update_config(source_id, config_updates)
    return {"success": True, "data": record}


@router.post("/sources/database/{source_id}/tables/{table_name}/profile")
async def profile_single_table(
    source_id: str,
    table_name: str,
    repo: SourceRepo = Depends(_get_repo),
):
    """Profile a single table and merge results into table_profiles."""
    source = await repo.get_by_id(source_id)
    if not source or source["source_type"] != "database":
        raise HTTPException(404, "Database source not found")

    available = source.get("available_tables", [])
    if table_name not in available:
        raise HTTPException(400, f"Table '{table_name}' not found in database")

    cfg = source.get("connection_config", {})
    db_src = DatabaseSource(
        db_type=cfg.get("db_type", "postgresql"),
        host=cfg.get("host", "localhost"),
        port=cfg.get("port", 5432),
        database=cfg.get("database", ""),
        username=cfg.get("username", ""),
        password=cfg.get("password", ""),
        table=table_name,
    )
    try:
        profile = await db_src.get_profile()
    except Exception as e:
        raise HTTPException(500, f"Failed to profile table '{table_name}': {str(e)}")

    table_profiles: dict = dict(source.get("table_profiles") or {})
    table_profiles[table_name] = _build_profile_dict(profile)

    # Rebuild top-level profile from first selected table
    selected_tables = source.get("selected_tables") or []
    first_table = selected_tables[0] if selected_tables else table_name
    first_tp = table_profiles.get(first_table, {})
    merged_profile = {
        "schema_info": first_tp.get("schema_info", []),
        "profile": first_tp.get("profile"),
        "row_count": first_tp.get("row_count"),
        "column_count": first_tp.get("column_count"),
        "tables": table_profiles,
    }
    record = await repo.update_profile(source_id, merged_profile)
    return {"success": True, "data": record}


@router.post("/sources/database/{source_id}/tables")
async def add_database_tables(
    source_id: str,
    req: TablesAddRequest,
    repo: SourceRepo = Depends(_get_repo),
):
    """Add tables to a database source (batch). Profiles only newly added tables."""
    source = await repo.get_by_id(source_id)
    if not source or source["source_type"] != "database":
        raise HTTPException(404, "Database source not found")

    available = source.get("available_tables", [])
    for t in req.tables:
        if t not in available:
            raise HTTPException(400, f"Table '{t}' not found in database")

    # Read existing multi-table state
    existing_tables: list[str] = source.get("selected_tables") or []
    if not existing_tables and source.get("selected_table"):
        existing_tables = [source["selected_table"]]

    table_profiles: dict = dict(source.get("table_profiles") or {})

    # Determine truly new tables (not yet profiled)
    new_tables = [t for t in req.tables if t not in existing_tables]
    merged = existing_tables + new_tables  # preserve order, deduplicated

    # Profile only new tables
    cfg = source.get("connection_config", {})
    for t in new_tables:
        db_src = DatabaseSource(
            db_type=cfg.get("db_type", "postgresql"),
            host=cfg.get("host", "localhost"),
            port=cfg.get("port", 5432),
            database=cfg.get("database", ""),
            username=cfg.get("username", ""),
            password=cfg.get("password", ""),
            table=t,
        )
        try:
            profile = await db_src.get_profile()
            table_profiles[t] = _build_profile_dict(profile)
        except Exception as e:
            raise HTTPException(500, f"Failed to profile table '{t}': {str(e)}")

    # Build merged profile: top-level fields point to first table (backward compat)
    first_table = merged[0] if merged else None
    first_tp = table_profiles.get(first_table, {}) if first_table else {}
    merged_profile = {
        "schema_info": first_tp.get("schema_info", []),
        "profile": first_tp.get("profile"),
        "row_count": first_tp.get("row_count"),
        "column_count": first_tp.get("column_count"),
        "tables": table_profiles,
    }

    config_updates = {
        "selected_tables": merged,
        "selected_table": first_table,  # backward compat
    }
    record = await repo.update_config_and_profile(source_id, config_updates, merged_profile)
    return {"success": True, "data": record}


@router.post("/sources/database/{source_id}/tables/remove")
async def remove_database_tables(
    source_id: str,
    req: TablesRemoveRequest,
    repo: SourceRepo = Depends(_get_repo),
):
    """Remove tables from a database source."""
    source = await repo.get_by_id(source_id)
    if not source or source["source_type"] != "database":
        raise HTTPException(404, "Database source not found")

    existing_tables: list[str] = source.get("selected_tables") or []
    if not existing_tables and source.get("selected_table"):
        existing_tables = [source["selected_table"]]

    table_profiles: dict = dict(source.get("table_profiles") or {})

    # Remove requested tables
    remaining = [t for t in existing_tables if t not in req.tables]
    for t in req.tables:
        table_profiles.pop(t, None)

    # Rebuild profile
    first_table = remaining[0] if remaining else None
    first_tp = table_profiles.get(first_table, {}) if first_table else {}
    merged_profile = {
        "schema_info": first_tp.get("schema_info", []),
        "profile": first_tp.get("profile"),
        "row_count": first_tp.get("row_count"),
        "column_count": first_tp.get("column_count"),
        "tables": table_profiles,
    }

    config_updates = {
        "selected_tables": remaining,
        "selected_table": first_table,
    }
    record = await repo.update_config_and_profile(source_id, config_updates, merged_profile)
    return {"success": True, "data": record}


# ──────────────────────────────────────────────
# API source endpoints (v2 — Enterprise Connector)
# ──────────────────────────────────────────────

class APICreateRequest(BaseModel):
    name: str
    base_url: str
    endpoint: str = ""
    method: str = "GET"
    # v2 structured configs
    auth: Optional[dict] = None
    pagination: Optional[dict] = None
    response_parse: Optional[dict] = None
    sync: Optional[dict] = None
    dependency: Optional[dict] = None
    params: Optional[dict] = None
    headers: Optional[dict] = None
    body: Optional[dict] = None
    timeout: float = 30.0
    # v1 compat
    auth_type: Optional[str] = None
    auth_config: Optional[dict] = None


def _build_api_source(req: APICreateRequest) -> APISource:
    """Build APISource from request, supporting both v1 and v2 fields."""
    if req.auth:
        return APISource(
            base_url=req.base_url, endpoint=req.endpoint, method=req.method,
            auth=req.auth, pagination=req.pagination,
            response_parse=req.response_parse, sync=req.sync,
            dependency=req.dependency,
            params=req.params, headers=req.headers, body=req.body,
            timeout=req.timeout,
        )
    # v1 fallback
    return APISource(
        base_url=req.base_url, endpoint=req.endpoint, method=req.method,
        auth_type=req.auth_type or "none", auth_config=req.auth_config,
        dependency=req.dependency,
        params=req.params, headers=req.headers, body=req.body,
    )


class APITestRequest(BaseModel):
    """Lightweight test request — test before saving."""
    base_url: str
    endpoint: str = ""
    method: str = "GET"
    auth: Optional[dict] = None
    pagination: Optional[dict] = None
    response_parse: Optional[dict] = None
    dependency: Optional[dict] = None
    params: Optional[dict] = None
    headers: Optional[dict] = None
    body: Optional[dict] = None
    timeout: float = 15.0
    # v1 compat
    auth_type: Optional[str] = None
    auth_config: Optional[dict] = None


@router.post("/sources/api/test")
async def test_api_before_save(req: APITestRequest):
    """Test an API connection without saving. Returns sample + detected schema."""
    api_src = APISource(
        base_url=req.base_url, endpoint=req.endpoint, method=req.method,
        auth=req.auth, pagination=req.pagination,
        response_parse=req.response_parse, dependency=req.dependency,
        params=req.params, headers=req.headers, body=req.body,
        timeout=req.timeout,
        auth_type=req.auth_type, auth_config=req.auth_config,
    )
    ok, msg = await api_src.test_connection()
    if not ok:
        return {"success": False, "error": msg}

    sample = await api_src.get_sample(n=5)
    schema = await api_src.discover_schema()
    return {
        "success": True,
        "message": msg,
        "sample": sample,
        "schema": [c.__dict__ for c in schema],
    }


class DependencyTestRequest(BaseModel):
    """Test parent endpoint and return field names for dropdown selection."""
    base_url: str
    dep_endpoint: str
    dep_method: str = "POST"
    dep_records_path: str = ""
    dep_body: Optional[dict] = None
    auth: Optional[dict] = None
    timeout: float = 15.0
    # v1 compat
    auth_type: Optional[str] = None
    auth_config: Optional[dict] = None


@router.post("/sources/api/test-parent")
async def test_parent_endpoint(req: DependencyTestRequest):
    """Test a dependency parent endpoint and return available field names."""
    api_src = APISource(
        base_url=req.base_url, endpoint="",
        auth=req.auth, timeout=req.timeout,
        auth_type=req.auth_type, auth_config=req.auth_config,
    )
    try:
        await api_src._ensure_token()
        import httpx
        url = f"{api_src.base_url}/{req.dep_endpoint.lstrip('/')}"
        method = req.dep_method.upper()

        kwargs: dict = {"headers": api_src._build_headers()}
        auth = api_src._build_auth()
        if auth:
            kwargs["auth"] = auth
        if method == "POST" and req.dep_body:
            kwargs["json"] = req.dep_body

        async with httpx.AsyncClient(timeout=req.timeout) as client:
            resp = await client.request(method, url, **kwargs)
            resp.raise_for_status()
            data = resp.json()

        # Extract records
        if req.dep_records_path:
            records = api_src._jsonpath_extract(data, req.dep_records_path)
        else:
            records = api_src._extract_records(data)

        if not records:
            return {
                "success": True,
                "message": "父接口连接成功，但返回 0 条记录",
                "fields": [], "sample": [], "record_count": 0,
            }

        fields: set[str] = set()
        for rec in records[:20]:
            if isinstance(rec, dict):
                fields.update(rec.keys())

        return {
            "success": True,
            "message": f"父接口连接成功，获取到 {len(records)} 条记录",
            "fields": sorted(fields),
            "sample": records[:3],
            "record_count": len(records),
        }
    except Exception as e:
        return {"success": False, "error": f"父接口请求失败: {str(e)}", "fields": []}


@router.post("/sources/api")
async def create_api_source(
    req: APICreateRequest,
    repo: SourceRepo = Depends(_get_repo),
):
    """Create an API data source (v2 — supports OAuth2, pagination, JSONPath)."""
    api_src = _build_api_source(req)

    ok, msg = await api_src.test_connection()
    if not ok:
        raise HTTPException(400, msg)

    profile = await api_src.get_profile()

    # Store with encrypted credentials
    try:
        stored_config = api_src.get_encrypted_config()
    except Exception:
        stored_config = api_src._to_api_config()

    record = await repo.create(
        name=req.name,
        source_type="api",
        config={"api_config": stored_config, "status": "active"},
        profile_data=_build_profile_dict(profile),
    )
    return {"success": True, "data": record}


@router.post("/sources/api/{source_id}/test")
async def test_api_connection(
    source_id: str,
    repo: SourceRepo = Depends(_get_repo),
):
    """Test an existing API source connection."""
    source = await repo.get_by_id(source_id)
    if not source or source["source_type"] != "api":
        raise HTTPException(404, "API source not found")

    api_src = _make_source_instance(source)
    ok, msg = await api_src.test_connection()
    if not ok:
        await repo.update_config(source_id, {"status": "error"})
        return {"success": False, "error": msg}

    sample = await api_src.get_sample(n=5)
    await repo.update_config(source_id, {"status": "active"})
    return {"success": True, "data": {"sample": sample, "message": msg}}


@router.post("/sources/api/{source_id}/sync")
async def sync_api_source(
    source_id: str,
    repo: SourceRepo = Depends(_get_repo),
):
    """Trigger a data sync (full or incremental) for an API source."""
    source = await repo.get_by_id(source_id)
    if not source or source["source_type"] != "api":
        raise HTTPException(404, "API source not found")

    api_src = _make_source_instance(source)
    try:
        profile = await api_src.get_profile()

        config_updates: dict = {"status": "active"}
        # Update sync watermark if incremental
        if api_src.sync.strategy == "incremental":
            raw = await api_src._fetch_all_pages()
            records = api_src._process_records(raw)
            api_src.update_sync_watermark(records)
            # Persist updated sync config inside api_config
            api_cfg = dict(source.get("api_config", {}))
            api_cfg["sync"] = api_src.sync.to_dict()
            config_updates["api_config"] = api_cfg

        record = await repo.update_config_and_profile(
            source_id, config_updates, _build_profile_dict(profile),
        )
        return {"success": True, "data": record}
    except Exception as e:
        await repo.update_config(source_id, {"status": "error"})
        raise HTTPException(500, f"Sync failed: {str(e)}")


# ──────────────────────────────────────────────
# Generic endpoints (all source types)
# ──────────────────────────────────────────────

@router.get("/sources")
async def list_sources(
    type: Optional[str] = None,
    repo: SourceRepo = Depends(_get_repo),
):
    """List all data sources, optionally filtered by type."""
    sources = await repo.list_all(source_type=type)
    return {"success": True, "data": sources}


@router.get("/sources/{source_id}")
async def get_source(
    source_id: str,
    repo: SourceRepo = Depends(_get_repo),
):
    """Get a single data source by ID."""
    source = await repo.get_by_id(source_id)
    if not source:
        raise HTTPException(404, "Data source not found")
    return {"success": True, "data": source}


@router.get("/sources/{source_id}/sample")
async def get_source_sample(
    source_id: str,
    n: int = 10,
    repo: SourceRepo = Depends(_get_repo),
):
    """Get sample data rows from a data source."""
    source = await repo.get_by_id(source_id)
    if not source:
        raise HTTPException(404, "Data source not found")

    try:
        src = _make_source_instance(source)
        sample = await src.get_sample(n=n)
        return {"success": True, "data": sample}
    except Exception as e:
        raise HTTPException(500, f"Failed to get sample: {str(e)}")


@router.delete("/sources/{source_id}")
async def delete_source(
    source_id: str,
    repo: SourceRepo = Depends(_get_repo),
):
    """Delete a data source and its uploaded file."""
    record = await repo.delete(source_id)
    if not record:
        raise HTTPException(404, "Data source not found")

    # Clean up uploaded file if applicable
    file_path = record.get("file_path")
    if file_path and os.path.exists(file_path):
        os.remove(file_path)

    return {"success": True}


class SourceUpdateRequest(BaseModel):
    name: Optional[str] = None


@router.put("/sources/{source_id}")
async def update_source(
    source_id: str,
    req: SourceUpdateRequest,
    repo: SourceRepo = Depends(_get_repo),
):
    """Update a data source (currently name only)."""
    source = await repo.get_by_id(source_id)
    if not source:
        raise HTTPException(404, "Data source not found")

    if req.name is not None:
        source = await repo.update_name(source_id, req.name)

    return {"success": True, "data": source}


@router.post("/sources/{source_id}/refresh")
async def refresh_source_profile(
    source_id: str,
    repo: SourceRepo = Depends(_get_repo),
):
    """Re-profile a data source. For database sources with multiple tables, re-profiles all."""
    source = await repo.get_by_id(source_id)
    if not source:
        raise HTTPException(404, "Data source not found")

    try:
        # Multi-table database refresh
        selected_tables = source.get("selected_tables") or []
        if source.get("source_type") == "database" and len(selected_tables) > 1:
            cfg = source.get("connection_config", {})
            table_profiles: dict = {}
            for t in selected_tables:
                db_src = DatabaseSource(
                    db_type=cfg.get("db_type", "postgresql"),
                    host=cfg.get("host", "localhost"),
                    port=cfg.get("port", 5432),
                    database=cfg.get("database", ""),
                    username=cfg.get("username", ""),
                    password=cfg.get("password", ""),
                    table=t,
                )
                profile = await db_src.get_profile()
                table_profiles[t] = _build_profile_dict(profile)
            first = selected_tables[0]
            first_tp = table_profiles.get(first, {})
            merged_profile = {
                "schema_info": first_tp.get("schema_info", []),
                "profile": first_tp.get("profile"),
                "row_count": first_tp.get("row_count"),
                "column_count": first_tp.get("column_count"),
                "tables": table_profiles,
            }
            record = await repo.update_profile(source_id, merged_profile)
        else:
            src = _make_source_instance(source)
            profile = await src.get_profile()
            record = await repo.update_profile(source_id, _build_profile_dict(profile))
        return {"success": True, "data": record}
    except Exception as e:
        raise HTTPException(500, f"Failed to refresh profile: {str(e)}")
