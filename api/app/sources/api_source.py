"""APISource 3.0 — Enterprise API Connector.

Three-layer auth architecture:
  Layer 1: Static credentials — none / api_key / bearer / basic / custom_header
  Layer 2: Token exchange    — configurable token request (covers OAuth2 CC,
           小铁, 飞书, 企业微信, 钉钉 and any custom token endpoint)
  Layer 3: Request signing   — Alibaba Cloud ACS3-HMAC-SHA256

Plus:
  - Request build with body/query param injection
  - JSONPath response extraction + flatten + field mapping
  - Pagination (offset/cursor/page_number/link_header) with params_in body|query
  - Credential encryption (Fernet AES)
  - Sync strategy (full_refresh / incremental)
  - Dependency (parent→child) endpoint chaining
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
import pandas as pd

from app.sources.base import ColumnInfo, DataProfile, DataSource, SourceType
from app.sources.profiler import DataProfiler

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config data models
# ---------------------------------------------------------------------------

@dataclass
class AuthConfig:
    """Authentication configuration — 3-layer architecture."""

    auth_type: str = "none"
    # ── Layer 1: Static credentials ──
    # api_key
    api_key_header: str = "X-API-Key"
    api_key_value: str = ""
    api_key_position: str = "header"  # header | query
    # bearer
    bearer_token: str = ""
    # basic
    basic_username: str = ""
    basic_password: str = ""
    # custom_header
    custom_headers: dict[str, str] = field(default_factory=dict)

    # ── Layer 2: Token exchange (fully configurable) ──
    token_url: str = ""
    token_method: str = "POST"       # POST | GET
    token_content_type: str = "json"  # json | form | query
    id_field: str = "client_id"       # 小铁: corp_id, 飞书: app_id
    secret_field: str = "client_secret"  # 小铁: corp_secret
    id_value: str = ""
    secret_value: str = ""
    token_extra_fields: dict[str, str] = field(default_factory=dict)  # e.g. {"grant_type":"client_credentials"}
    token_response_path: str = "$.access_token"  # 飞书: $.tenant_access_token
    token_expires_path: str = "$.expires_in"
    token_header_name: str = "Authorization"
    token_prefix: str = "Bearer "     # some APIs don't want "Bearer " prefix

    # ── Layer 3: Alibaba Cloud signature ──
    aliyun_access_key_id: str = ""
    aliyun_access_key_secret: str = ""
    aliyun_api_version: str = ""      # e.g. "2014-05-26"

    # ── Runtime state (not persisted) ──
    _access_token: str = ""
    _token_expires_at: float = 0.0

    @staticmethod
    def from_dict(d: dict) -> "AuthConfig":
        if not d:
            return AuthConfig()
        ac = AuthConfig(auth_type=d.get("auth_type", "none"))
        for k, v in d.items():
            if k == "auth_type":
                continue
            if hasattr(ac, k) and not k.startswith("_"):
                setattr(ac, k, v)
        return ac

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"auth_type": self.auth_type}
        # Only include non-empty fields relevant to the auth_type
        _all_fields = [
            "api_key_header", "api_key_value", "api_key_position",
            "bearer_token",
            "basic_username", "basic_password",
            "custom_headers",
            "token_url", "token_method", "token_content_type",
            "id_field", "secret_field", "id_value", "secret_value",
            "token_extra_fields", "token_response_path", "token_expires_path",
            "token_header_name", "token_prefix",
            "aliyun_access_key_id", "aliyun_access_key_secret",
            "aliyun_api_version",
        ]
        for k in _all_fields:
            v = getattr(self, k, None)
            if v and v != self._field_default(k):
                d[k] = v
        return d

    @staticmethod
    def _field_default(k: str) -> Any:
        """Return default value for a field to avoid storing defaults."""
        defaults = {
            "api_key_header": "X-API-Key", "api_key_position": "header",
            "token_method": "POST", "token_content_type": "json",
            "id_field": "client_id", "secret_field": "client_secret",
            "token_response_path": "$.access_token",
            "token_expires_path": "$.expires_in",
            "token_header_name": "Authorization", "token_prefix": "Bearer ",
        }
        return defaults.get(k)


@dataclass
class PaginationConfig:
    """Pagination strategy."""
    mode: str = "disabled"  # disabled | offset | cursor | link_header | page_number
    params_in: str = "query"  # query | body — where to put pagination params
    # offset
    offset_param: str = "offset"
    limit_param: str = "limit"
    page_size: int = 100
    max_pages: int = 50
    # cursor
    cursor_param: str = "cursor"
    cursor_path: str = ""
    # page_number
    page_param: str = "page"
    # link_header — auto
    total_count_path: str = ""

    @staticmethod
    def from_dict(d: dict) -> "PaginationConfig":
        if not d:
            return PaginationConfig()
        pc = PaginationConfig()
        for k, v in d.items():
            if hasattr(pc, k):
                setattr(pc, k, v)
        return pc

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v}


@dataclass
class ResponseParseConfig:
    """Response extraction rules."""
    records_path: str = ""
    field_mapping: dict[str, str] = field(default_factory=dict)
    flatten_nested: bool = True
    exclude_fields: list[str] = field(default_factory=list)

    @staticmethod
    def from_dict(d: dict) -> "ResponseParseConfig":
        if not d:
            return ResponseParseConfig()
        return ResponseParseConfig(
            records_path=d.get("records_path", ""),
            field_mapping=d.get("field_mapping", {}),
            flatten_nested=d.get("flatten_nested", True),
            exclude_fields=d.get("exclude_fields", []),
        )

    def to_dict(self) -> dict:
        d: dict[str, Any] = {}
        if self.records_path:
            d["records_path"] = self.records_path
        if self.field_mapping:
            d["field_mapping"] = self.field_mapping
        if not self.flatten_nested:
            d["flatten_nested"] = False
        if self.exclude_fields:
            d["exclude_fields"] = self.exclude_fields
        return d


@dataclass
class SyncConfig:
    """Data sync strategy."""
    strategy: str = "full_refresh"
    incremental_field: str = ""
    incremental_param: str = ""
    last_sync_value: str = ""
    last_sync_at: str = ""
    sync_interval_minutes: int = 0

    @staticmethod
    def from_dict(d: dict) -> "SyncConfig":
        if not d:
            return SyncConfig()
        sc = SyncConfig()
        for k, v in d.items():
            if hasattr(sc, k):
                setattr(sc, k, v)
        return sc

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v}


@dataclass
class DependencyConfig:
    """Parent→child endpoint dependency for hierarchical APIs.

    Example: fetch all cabinets first, then iterate each cabinet's lattices.
    """
    endpoint: str = ""
    method: str = "POST"
    records_path: str = ""          # JSONPath to parent records
    body: dict = field(default_factory=dict)
    params: dict = field(default_factory=dict)
    iterate_field: str = ""         # field to extract from each parent record
    inject_as: str = ""             # parameter name injected into child request
    inject_in: str = "body"         # body | query | path
    merge_fields: list = field(default_factory=list)  # parent fields merged into child records
    delay_ms: int = 0               # delay between child requests (rate-limit protection)

    @staticmethod
    def from_dict(d: dict) -> "DependencyConfig":
        if not d:
            return DependencyConfig()
        dc = DependencyConfig()
        for k, v in d.items():
            if hasattr(dc, k):
                setattr(dc, k, v)
        return dc

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v}


_DATA_KEYS = ("data", "results", "items", "records", "list", "rows", "entries", "content", "hits")


# ---------------------------------------------------------------------------
# APISource 3.0
# ---------------------------------------------------------------------------

class APISource(DataSource):
    """Enterprise API Connector with 3-layer auth."""

    source_type = SourceType.API

    def __init__(
        self,
        base_url: str,
        endpoint: str = "",
        method: str = "GET",
        auth: AuthConfig | dict | None = None,
        pagination: PaginationConfig | dict | None = None,
        response_parse: ResponseParseConfig | dict | None = None,
        sync: SyncConfig | dict | None = None,
        dependency: DependencyConfig | dict | None = None,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        body: dict[str, Any] | None = None,
        timeout: float = 30.0,
        # v1 compat
        auth_type: str | None = None,
        auth_config: dict | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.endpoint = endpoint.lstrip("/") if endpoint else ""
        self.method = method.upper()
        self.params = params or {}
        self.extra_headers = headers or {}
        self.body = body or {}
        self.timeout = timeout
        self._profiler = DataProfiler()

        if isinstance(auth, dict):
            self.auth = AuthConfig.from_dict(auth)
        elif auth is None:
            self.auth = self._migrate_v1_auth(auth_type, auth_config)
        else:
            self.auth = auth

        self.pagination = (
            PaginationConfig.from_dict(pagination) if isinstance(pagination, dict)
            else pagination or PaginationConfig()
        )
        self.response_parse = (
            ResponseParseConfig.from_dict(response_parse) if isinstance(response_parse, dict)
            else response_parse or ResponseParseConfig()
        )
        self.sync = (
            SyncConfig.from_dict(sync) if isinstance(sync, dict)
            else sync or SyncConfig()
        )
        self.dependency = (
            DependencyConfig.from_dict(dependency) if isinstance(dependency, dict)
            else dependency
        )

    @staticmethod
    def _migrate_v1_auth(auth_type: str | None, auth_config: dict | None) -> AuthConfig:
        if not auth_type or auth_type == "none":
            return AuthConfig()
        ac = AuthConfig(auth_type=auth_type)
        cfg = auth_config or {}
        if auth_type == "bearer":
            ac.bearer_token = cfg.get("token", "")
        elif auth_type == "api_key":
            ac.api_key_header = cfg.get("header_name", "X-API-Key")
            ac.api_key_value = cfg.get("api_key", "")
        elif auth_type == "basic":
            ac.basic_username = cfg.get("username", "")
            ac.basic_password = cfg.get("password", "")
        return ac

    @property
    def full_url(self) -> str:
        if self.endpoint:
            return f"{self.base_url}/{self.endpoint}"
        return self.base_url

    # ══════════════════════════════════════════════════════════════
    # Layer 2: Token exchange — fully configurable
    # ══════════════════════════════════════════════════════════════

    async def _ensure_token(self) -> None:
        """Fetch or refresh token via configurable token exchange."""
        if self.auth.auth_type != "token_exchange":
            return
        if self.auth._access_token and time.time() < self.auth._token_expires_at - 30:
            return

        url = self.auth.token_url
        method = self.auth.token_method.upper()
        ct = self.auth.token_content_type  # json | form | query

        # Build credential payload (strip whitespace from copy-paste)
        payload: dict[str, str] = {
            self.auth.id_field: self.auth.id_value.strip(),
            self.auth.secret_field: self.auth.secret_value.strip(),
        }
        payload.update(self.auth.token_extra_fields)

        logger.info("Token exchange: %s %s (%s)", method, url, ct)

        async with httpx.AsyncClient(timeout=15.0) as client:
            if method == "GET" or ct == "query":
                # Credentials as query params (企业微信, 钉钉)
                resp = await client.get(url, params=payload)
            elif ct == "form":
                # Standard OAuth2 form-urlencoded
                resp = await client.post(
                    url, data=payload,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            else:
                # JSON body (小铁, 飞书)
                resp = await client.post(
                    url, json=payload,
                    headers={"Content-Type": "application/json"},
                )

            if resp.status_code >= 400:
                body_text = resp.text[:300]
                raise httpx.HTTPStatusError(
                    f"Token 换取失败 ({url}): {body_text}",
                    request=resp.request, response=resp,
                )
            data = resp.json()

        # Extract token via JSONPath
        token = self._extract_scalar(data, self.auth.token_response_path)
        if not token:
            # Fallback: try common keys
            token = data.get("access_token") or data.get("tenant_access_token") or ""
        self.auth._access_token = token

        expires_in = self._extract_scalar(data, self.auth.token_expires_path)
        self.auth._token_expires_at = time.time() + int(expires_in or 7200)
        logger.info("Token acquired, expires in %ss", expires_in or 7200)

    # ══════════════════════════════════════════════════════════════
    # Layer 3: Alibaba Cloud ACS3-HMAC-SHA256 signing
    # ══════════════════════════════════════════════════════════════

    def _aliyun_sign_headers(
        self, method: str, url: str, query_params: dict[str, str],
        body_bytes: bytes, extra_headers: dict[str, str],
    ) -> dict[str, str]:
        """Compute Alibaba Cloud v3 signature and return required headers."""
        from urllib.parse import urlparse, quote

        parsed = urlparse(url)
        host = parsed.hostname or ""

        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        nonce = uuid.uuid4().hex

        body_hash = hashlib.sha256(body_bytes).hexdigest()

        # Mandatory headers
        sign_headers: dict[str, str] = {
            "host": host,
            "x-acs-action": extra_headers.get("x-acs-action", ""),
            "x-acs-content-sha256": body_hash,
            "x-acs-date": now,
            "x-acs-signature-nonce": nonce,
            "x-acs-version": self.auth.aliyun_api_version,
        }
        if "content-type" in {k.lower() for k in extra_headers}:
            ct = next(v for k, v in extra_headers.items() if k.lower() == "content-type")
            sign_headers["content-type"] = ct

        # Canonical headers (sorted)
        signed_header_names = sorted(sign_headers.keys())
        canonical_headers = "".join(f"{k}:{sign_headers[k]}\n" for k in signed_header_names)
        signed_headers_str = ";".join(signed_header_names)

        # Canonical query string
        sorted_params = sorted(query_params.items())
        canonical_qs = "&".join(f"{quote(k, safe='')}={quote(str(v), safe='')}" for k, v in sorted_params)

        # Canonical URI
        canonical_uri = parsed.path or "/"

        # Canonical request
        canonical_request = "\n".join([
            method.upper(),
            canonical_uri,
            canonical_qs,
            canonical_headers,
            signed_headers_str,
            body_hash,
        ])

        # String to sign
        hashed_request = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
        string_to_sign = f"ACS3-HMAC-SHA256\n{hashed_request}"

        # Signature
        signature = hmac.new(
            self.auth.aliyun_access_key_secret.encode("utf-8"),
            string_to_sign.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        authorization = (
            f"ACS3-HMAC-SHA256 Credential={self.auth.aliyun_access_key_id},"
            f"SignedHeaders={signed_headers_str},"
            f"Signature={signature}"
        )

        return {
            "Authorization": authorization,
            "x-acs-action": sign_headers.get("x-acs-action", ""),
            "x-acs-version": self.auth.aliyun_api_version,
            "x-acs-date": now,
            "x-acs-signature-nonce": nonce,
            "x-acs-content-sha256": body_hash,
        }

    # ══════════════════════════════════════════════════════════════
    # Header / param / auth building
    # ══════════════════════════════════════════════════════════════

    def _build_headers(self) -> dict[str, str]:
        h = dict(self.extra_headers)
        at = self.auth.auth_type

        if at == "bearer":
            h["Authorization"] = f"Bearer {self.auth.bearer_token}"
        elif at == "api_key" and self.auth.api_key_position == "header":
            h[self.auth.api_key_header] = self.auth.api_key_value
        elif at == "token_exchange":
            header_name = self.auth.token_header_name
            prefix = self.auth.token_prefix
            h[header_name] = f"{prefix}{self.auth._access_token}"
        elif at == "custom_header":
            h.update(self.auth.custom_headers)
        # aliyun_sign headers are injected in _fetch_single directly

        return h

    def _build_auth(self) -> tuple[str, str] | None:
        if self.auth.auth_type == "basic":
            return (self.auth.basic_username, self.auth.basic_password)
        return None

    def _build_params(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        p = dict(self.params)
        if self.auth.auth_type == "api_key" and self.auth.api_key_position == "query":
            p[self.auth.api_key_header] = self.auth.api_key_value
        if (
            self.sync.strategy == "incremental"
            and self.sync.incremental_param
            and self.sync.last_sync_value
        ):
            p[self.sync.incremental_param] = self.sync.last_sync_value
        if extra:
            p.update(extra)
        return p

    def _build_body(self, extra: dict[str, str] | None = None) -> dict[str, Any]:
        """Build request body, merging pagination params if params_in=body."""
        b = dict(self.body) if self.body else {}
        if extra:
            b.update(extra)
        return b

    def _default_page_params(self) -> dict[str, Any]:
        """Return default first-page pagination params (for single-fetch ops).
        Returns int values when params_in=body (JSON needs integers),
        string values when params_in=query (query strings are always strings).
        """
        if self.pagination.mode == "disabled":
            return {}
        m = self.pagination.mode
        ps = self.pagination.page_size
        use_int = self.pagination.params_in == "body"
        def _v(n: int) -> Any:
            return n if use_int else str(n)
        if m == "offset":
            return {self.pagination.offset_param: _v(0), self.pagination.limit_param: _v(ps)}
        elif m == "page_number":
            return {self.pagination.page_param: _v(1), self.pagination.limit_param: _v(ps)}
        elif m == "cursor":
            return {self.pagination.limit_param: _v(ps)} if self.pagination.limit_param else {}
        return {}

    # ══════════════════════════════════════════════════════════════
    # Request execution
    # ══════════════════════════════════════════════════════════════

    async def _fetch_single(
        self,
        client: httpx.AsyncClient,
        extra_params: dict[str, str] | None = None,
        url_override: str | None = None,
    ) -> httpx.Response:
        url = url_override or self.full_url
        in_body = self.pagination.params_in == "body"

        # Split extra_params based on params_in
        query_extra = None if in_body else extra_params
        body_extra = extra_params if in_body else None

        headers = self._build_headers()
        query = self._build_params(query_extra)
        body = self._build_body(body_extra)

        kwargs: dict[str, Any] = {"headers": headers}

        if query:
            kwargs["params"] = query

        auth = self._build_auth()
        if auth:
            kwargs["auth"] = auth

        # Determine if we send a body
        has_body = self.method == "POST" and body
        if has_body:
            kwargs["json"] = body

        # Layer 3: Alibaba Cloud signing
        if self.auth.auth_type == "aliyun_sign":
            import json as _json
            body_bytes = _json.dumps(body).encode("utf-8") if has_body else b""
            sign_hdrs = self._aliyun_sign_headers(
                self.method, url, query, body_bytes, headers,
            )
            kwargs["headers"].update(sign_hdrs)

        resp = await client.request(self.method, url, **kwargs)
        resp.raise_for_status()
        return resp

    # ══════════════════════════════════════════════════════════════
    # Response parsing
    # ══════════════════════════════════════════════════════════════

    def _extract_records(self, data: Any) -> list[dict]:
        if self.response_parse.records_path:
            return self._jsonpath_extract(data, self.response_parse.records_path)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in _DATA_KEYS:
                if key in data and isinstance(data[key], list):
                    return data[key]
            return [data]
        return []

    def _jsonpath_extract(self, data: Any, path: str) -> list[dict]:
        try:
            from jsonpath_ng.ext import parse as jp_parse
            expr = jp_parse(path)
            matches = expr.find(data)
            if not matches:
                return []
            result = matches[0].value
            if isinstance(result, list):
                return result
            return [m.value for m in matches if isinstance(m.value, dict)]
        except Exception as e:
            logger.warning("JSONPath failed (%s): %s", path, e)
            return self._extract_records_heuristic(data)

    def _extract_records_heuristic(self, data: Any) -> list[dict]:
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in _DATA_KEYS:
                if key in data and isinstance(data[key], list):
                    return data[key]
            return [data]
        return []

    def _flatten_record(self, record: dict, prefix: str = "") -> dict:
        flat: dict[str, Any] = {}
        for k, v in record.items():
            key = f"{prefix}{k}" if not prefix else f"{prefix}.{k}"
            if isinstance(v, dict) and self.response_parse.flatten_nested:
                flat.update(self._flatten_record(v, key))
            elif isinstance(v, list) and v and isinstance(v[0], dict):
                flat[key] = str(v)
            else:
                flat[key] = v
        return flat

    def _apply_field_mapping(self, records: list[dict]) -> list[dict]:
        if not self.response_parse.field_mapping and not self.response_parse.exclude_fields:
            return records
        exclude = set(self.response_parse.exclude_fields)
        rename = self.response_parse.field_mapping
        return [
            {rename.get(k, k): v for k, v in rec.items() if k not in exclude}
            for rec in records
        ]

    def _process_records(self, raw: list[dict]) -> list[dict]:
        records = raw
        if self.response_parse.flatten_nested:
            records = [self._flatten_record(r) for r in records]
        return self._apply_field_mapping(records)

    # ══════════════════════════════════════════════════════════════
    # Dependency (parent→child) endpoint chaining
    # ══════════════════════════════════════════════════════════════

    @property
    def _has_dependency(self) -> bool:
        return bool(
            self.dependency
            and self.dependency.endpoint
            and self.dependency.iterate_field
        )

    async def _fetch_parent_records(self, client: httpx.AsyncClient) -> list[dict]:
        """Request the parent endpoint and return extracted records."""
        dep = self.dependency
        assert dep is not None
        url = f"{self.base_url}/{dep.endpoint.lstrip('/')}"
        method = dep.method.upper()

        kwargs: dict[str, Any] = {"headers": self._build_headers()}
        auth = self._build_auth()
        if auth:
            kwargs["auth"] = auth
        if dep.params:
            kwargs["params"] = dep.params
        if method == "POST" and dep.body:
            kwargs["json"] = dep.body

        logger.info("Dependency: fetching parent %s %s", method, url)
        resp = await client.request(method, url, **kwargs)
        resp.raise_for_status()
        data = resp.json()

        if dep.records_path:
            records = self._jsonpath_extract(data, dep.records_path)
        else:
            records = self._extract_records(data)

        logger.info("Dependency: got %d parent records", len(records))
        return records

    async def _fetch_child_pages(self, client: httpx.AsyncClient) -> list[dict]:
        """Fetch all pages for the current (child) endpoint config.

        Reuses existing pagination logic.
        """
        mode = self.pagination.mode
        if mode == "disabled":
            resp = await self._fetch_single(client)
            return self._extract_records(resp.json())
        elif mode == "offset":
            return await self._paginate_offset(client)
        elif mode == "cursor":
            return await self._paginate_cursor(client)
        elif mode == "link_header":
            return await self._paginate_link_header(client)
        elif mode == "page_number":
            return await self._paginate_page_number(client)
        else:
            resp = await self._fetch_single(client)
            return self._extract_records(resp.json())

    async def _fetch_with_dependency(self) -> list[dict]:
        """Orchestrator: parent → iterate → inject → child pages → merge."""
        dep = self.dependency
        assert dep is not None
        all_records: list[dict] = []

        # Save original body/params/endpoint so we can restore per-iteration
        orig_body = dict(self.body) if self.body else {}
        orig_params = dict(self.params)
        orig_endpoint = self.endpoint

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            parent_records = await self._fetch_parent_records(client)
            if not parent_records:
                logger.warning("Dependency: parent returned 0 records")
                return []

            for i, parent_rec in enumerate(parent_records):
                value = parent_rec.get(dep.iterate_field)
                if value is None:
                    logger.warning(
                        "Dependency: parent record #%d missing field '%s', skipping",
                        i, dep.iterate_field,
                    )
                    continue

                # Inject value into child request
                self.body = dict(orig_body)
                self.params = dict(orig_params)
                self.endpoint = orig_endpoint

                if dep.inject_in == "body":
                    self.body[dep.inject_as or dep.iterate_field] = value
                elif dep.inject_in == "query":
                    self.params[dep.inject_as or dep.iterate_field] = str(value)
                elif dep.inject_in == "path":
                    self.endpoint = orig_endpoint.replace(
                        f"{{{dep.inject_as or dep.iterate_field}}}", str(value),
                    )

                child_records = await self._fetch_child_pages(client)

                # Merge parent fields into child records
                if dep.merge_fields and child_records:
                    merge_data = {
                        f"_parent_{f}": parent_rec.get(f)
                        for f in dep.merge_fields
                        if f in parent_rec
                    }
                    for rec in child_records:
                        rec.update(merge_data)

                all_records.extend(child_records)

                # Rate-limit delay
                if dep.delay_ms > 0 and i < len(parent_records) - 1:
                    await asyncio.sleep(dep.delay_ms / 1000.0)

        # Restore originals
        self.body = orig_body
        self.params = orig_params
        self.endpoint = orig_endpoint

        logger.info(
            "Dependency: collected %d child records from %d parents",
            len(all_records), len(parent_records),
        )
        return all_records

    # ══════════════════════════════════════════════════════════════
    # Pagination
    # ══════════════════════════════════════════════════════════════

    async def _fetch_all_pages(self) -> list[dict]:
        await self._ensure_token()

        if self._has_dependency:
            return await self._fetch_with_dependency()

        mode = self.pagination.mode

        if mode == "disabled":
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await self._fetch_single(client)
                return self._extract_records(resp.json())

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return await self._fetch_child_pages(client)

    async def _paginate_offset(self, client: httpx.AsyncClient) -> list[dict]:
        all_records: list[dict] = []
        offset = 0
        ps = self.pagination.page_size
        use_int = self.pagination.params_in == "body"
        for _ in range(self.pagination.max_pages):
            extra: dict[str, Any] = {
                self.pagination.offset_param: offset if use_int else str(offset),
                self.pagination.limit_param: ps if use_int else str(ps),
            }
            resp = await self._fetch_single(client, extra_params=extra)
            records = self._extract_records(resp.json())
            if not records:
                break
            all_records.extend(records)
            if len(records) < ps:
                break
            offset += len(records)
        return all_records

    async def _paginate_cursor(self, client: httpx.AsyncClient) -> list[dict]:
        all_records: list[dict] = []
        cursor: str | None = None
        use_int = self.pagination.params_in == "body"
        for _ in range(self.pagination.max_pages):
            extra: dict[str, Any] = {}
            if self.pagination.limit_param:
                ps = self.pagination.page_size
                extra[self.pagination.limit_param] = ps if use_int else str(ps)
            if cursor:
                extra[self.pagination.cursor_param] = cursor
            resp = await self._fetch_single(client, extra_params=extra)
            data = resp.json()
            records = self._extract_records(data)
            if not records:
                break
            all_records.extend(records)
            cursor = self._extract_scalar(data, self.pagination.cursor_path) if self.pagination.cursor_path else None
            if not cursor:
                break
        return all_records

    async def _paginate_link_header(self, client: httpx.AsyncClient) -> list[dict]:
        all_records: list[dict] = []
        next_url: str | None = None
        for _ in range(self.pagination.max_pages):
            resp = await self._fetch_single(client, url_override=next_url) if next_url else await self._fetch_single(client)
            records = self._extract_records(resp.json())
            if not records:
                break
            all_records.extend(records)
            next_url = self._parse_link_next(resp.headers.get("link", ""))
            if not next_url:
                break
        return all_records

    async def _paginate_page_number(self, client: httpx.AsyncClient) -> list[dict]:
        all_records: list[dict] = []
        use_int = self.pagination.params_in == "body"
        for page in range(1, self.pagination.max_pages + 1):
            extra: dict[str, Any] = {self.pagination.page_param: page if use_int else str(page)}
            if self.pagination.limit_param:
                ps = self.pagination.page_size
                extra[self.pagination.limit_param] = ps if use_int else str(ps)
            resp = await self._fetch_single(client, extra_params=extra)
            records = self._extract_records(resp.json())
            if not records:
                break
            all_records.extend(records)
            if len(records) < self.pagination.page_size:
                break
        return all_records

    def _extract_scalar(self, data: Any, path: str) -> str | None:
        try:
            from jsonpath_ng.ext import parse as jp_parse
            matches = jp_parse(path).find(data)
            if matches:
                val = matches[0].value
                return str(val) if val is not None else None
        except Exception:
            pass
        return None

    @staticmethod
    def _parse_link_next(link_header: str) -> str | None:
        if not link_header:
            return None
        for part in link_header.split(","):
            part = part.strip()
            if 'rel="next"' in part or "rel='next'" in part:
                s, e = part.find("<"), part.find(">")
                if s >= 0 and e > s:
                    return part[s + 1 : e]
        return None

    # ══════════════════════════════════════════════════════════════
    # Credential encryption
    # ══════════════════════════════════════════════════════════════

    _SENSITIVE_KEYS = [
        "api_key_value", "bearer_token", "basic_password",
        "secret_value", "aliyun_access_key_secret",
    ]

    def get_encrypted_config(self) -> dict:
        from app.utils.crypto import encrypt
        cfg = self._to_api_config()
        auth_d = cfg.get("auth", {})
        for key in self._SENSITIVE_KEYS:
            if key in auth_d and auth_d[key]:
                auth_d[key] = encrypt(auth_d[key])
                auth_d[f"_{key}_encrypted"] = True
        cfg["auth"] = auth_d
        return cfg

    @staticmethod
    def decrypt_config(cfg: dict) -> dict:
        from app.utils.crypto import decrypt
        auth_d = cfg.get("auth", {})
        for key in APISource._SENSITIVE_KEYS:
            if auth_d.get(f"_{key}_encrypted"):
                try:
                    auth_d[key] = decrypt(auth_d[key])
                except Exception:
                    logger.warning("Failed to decrypt %s", key)
                del auth_d[f"_{key}_encrypted"]
        cfg["auth"] = auth_d
        return cfg

    # ══════════════════════════════════════════════════════════════
    # Sync watermark
    # ══════════════════════════════════════════════════════════════

    def update_sync_watermark(self, records: list[dict]) -> None:
        if self.sync.strategy != "incremental" or not self.sync.incremental_field:
            return
        fn = self.sync.incremental_field
        max_val = self.sync.last_sync_value
        for rec in records:
            val = rec.get(fn)
            if val is not None:
                sv = str(val)
                if not max_val or sv > max_val:
                    max_val = sv
        if max_val != self.sync.last_sync_value:
            self.sync.last_sync_value = max_val
            self.sync.last_sync_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    # ══════════════════════════════════════════════════════════════
    # DataSource interface
    # ══════════════════════════════════════════════════════════════

    async def test_connection(self) -> tuple[bool, str]:
        try:
            await self._ensure_token()
            if self._has_dependency:
                return await self._test_connection_with_dependency()
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await self._fetch_single(client, extra_params=self._default_page_params())
                data = resp.json()
                records = self._extract_records(data)
                return True, f"连接成功，获取到 {len(records)} 条记录 (HTTP {resp.status_code})"
        except httpx.HTTPStatusError as e:
            body = ""
            try:
                body = e.response.text[:200]
            except Exception:
                pass
            return False, f"HTTP {e.response.status_code}: {body}"
        except httpx.ConnectError:
            return False, f"无法连接: {self.full_url}"
        except Exception as e:
            return False, f"请求失败: {str(e)}"

    async def _test_connection_with_dependency(self) -> tuple[bool, str]:
        """Test parent endpoint, then use first parent record to test child."""
        dep = self.dependency
        assert dep is not None
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            parent_records = await self._fetch_parent_records(client)
            if not parent_records:
                return True, "父接口连接成功，但返回 0 条记录"

            first = parent_records[0]
            value = first.get(dep.iterate_field)
            if value is None:
                return True, f"父接口返回 {len(parent_records)} 条记录，但首条缺少字段 '{dep.iterate_field}'"

            # Inject and test child
            orig_body = dict(self.body) if self.body else {}
            orig_params = dict(self.params)
            orig_endpoint = self.endpoint

            if dep.inject_in == "body":
                self.body = dict(orig_body)
                self.body[dep.inject_as or dep.iterate_field] = value
            elif dep.inject_in == "query":
                self.params = dict(orig_params)
                self.params[dep.inject_as or dep.iterate_field] = str(value)
            elif dep.inject_in == "path":
                self.endpoint = orig_endpoint.replace(
                    f"{{{dep.inject_as or dep.iterate_field}}}", str(value),
                )

            resp = await self._fetch_single(client, extra_params=self._default_page_params())
            child_records = self._extract_records(resp.json())

            # Restore
            self.body = orig_body
            self.params = orig_params
            self.endpoint = orig_endpoint

            return True, (
                f"连接成功：父接口 {len(parent_records)} 条记录，"
                f"子接口(首条)获取到 {len(child_records)} 条记录"
            )

    async def discover_schema(self) -> list[ColumnInfo]:
        await self._ensure_token()
        if self._has_dependency:
            raw = await self._get_sample_with_dependency(n=100)
            # _get_sample_with_dependency already calls _process_records
            if not raw:
                return []
            return self._profiler.profile(pd.DataFrame(raw)).columns
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await self._fetch_single(client, extra_params=self._default_page_params())
            raw = self._extract_records(resp.json())
        records = self._process_records(raw[:100])
        if not records:
            return []
        return self._profiler.profile(pd.DataFrame(records)).columns

    async def get_profile(self) -> DataProfile:
        raw = await self._fetch_all_pages()
        records = self._process_records(raw)
        if not records:
            return DataProfile()
        return self._profiler.profile(pd.DataFrame(records))

    async def get_sample(self, n: int = 10) -> list[dict]:
        await self._ensure_token()
        if self._has_dependency:
            return await self._get_sample_with_dependency(n)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await self._fetch_single(client, extra_params=self._default_page_params())
            raw = self._extract_records(resp.json())
        return self._process_records(raw)[:n]

    async def _get_sample_with_dependency(self, n: int = 10) -> list[dict]:
        """Get sample using only the first parent record's child data."""
        dep = self.dependency
        assert dep is not None
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            parent_records = await self._fetch_parent_records(client)
            if not parent_records:
                return []

            first = parent_records[0]
            value = first.get(dep.iterate_field)
            if value is None:
                return []

            orig_body = dict(self.body) if self.body else {}
            orig_params = dict(self.params)
            orig_endpoint = self.endpoint

            if dep.inject_in == "body":
                self.body = dict(orig_body)
                self.body[dep.inject_as or dep.iterate_field] = value
            elif dep.inject_in == "query":
                self.params = dict(orig_params)
                self.params[dep.inject_as or dep.iterate_field] = str(value)
            elif dep.inject_in == "path":
                self.endpoint = orig_endpoint.replace(
                    f"{{{dep.inject_as or dep.iterate_field}}}", str(value),
                )

            resp = await self._fetch_single(client, extra_params=self._default_page_params())
            raw = self._extract_records(resp.json())

            # Merge parent fields
            if dep.merge_fields:
                merge_data = {
                    f"_parent_{f}": first.get(f)
                    for f in dep.merge_fields
                    if f in first
                }
                for rec in raw:
                    rec.update(merge_data)

            self.body = orig_body
            self.params = orig_params
            self.endpoint = orig_endpoint

        return self._process_records(raw)[:n]

    async def to_dataframe(self, query: str | None = None) -> pd.DataFrame:
        raw = await self._fetch_all_pages()
        records = self._process_records(raw)
        self.update_sync_watermark(records)
        return pd.DataFrame(records) if records else pd.DataFrame()

    async def get_data_path(self) -> str:
        df = await self.to_dataframe()
        tmp_dir = os.path.join(tempfile.gettempdir(), "data_agent")
        os.makedirs(tmp_dir, exist_ok=True)
        path = os.path.join(tmp_dir, f"api_{hash(self.full_url) & 0xFFFFFFFF}.csv")
        df.to_csv(path, index=False)
        return path

    # ══════════════════════════════════════════════════════════════
    # Serialization
    # ══════════════════════════════════════════════════════════════

    def _to_api_config(self) -> dict:
        cfg = {
            "base_url": self.base_url,
            "endpoint": self.endpoint,
            "method": self.method,
            "auth": self.auth.to_dict(),
            "pagination": self.pagination.to_dict(),
            "response_parse": self.response_parse.to_dict(),
            "sync": self.sync.to_dict(),
            "params": self.params,
            "headers": self.extra_headers,
            "body": self.body,
            "timeout": self.timeout,
        }
        if self.dependency:
            cfg["dependency"] = self.dependency.to_dict()
        return cfg

    @classmethod
    def from_config(cls, cfg: dict) -> "APISource":
        return cls(
            base_url=cfg.get("base_url", ""),
            endpoint=cfg.get("endpoint", ""),
            method=cfg.get("method", "GET"),
            auth=cfg.get("auth"),
            pagination=cfg.get("pagination"),
            response_parse=cfg.get("response_parse"),
            sync=cfg.get("sync"),
            dependency=cfg.get("dependency"),
            params=cfg.get("params"),
            headers=cfg.get("headers"),
            body=cfg.get("body"),
            timeout=cfg.get("timeout", 30.0),
        )
