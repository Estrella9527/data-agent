"""SQLAlchemy models — mirrors Prisma schema for shared PostgreSQL.

The ``data_sources`` table is defined in both Prisma (frontend) and here
(backend).  ``create_all(checkfirst=True)`` ensures no conflict: if Prisma
already created the table, SQLAlchemy silently skips it.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class DataSourceModel(Base):
    """Matches Prisma ``DataSource`` → ``data_sources`` table.

    Column types mirror Prisma's output exactly:
      - id/name/type → text (not varchar)
      - timestamps   → timestamp(3) without time zone
    """

    __tablename__ = "data_sources"

    id = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    type = Column(Text, nullable=False)  # file | database | api
    config = Column(JSONB, nullable=False, default=dict)
    description = Column(Text, nullable=True)
    profile = Column(JSONB, nullable=True)
    profiled_at = Column("profiled_at", DateTime(), nullable=True)
    created_at = Column(
        "created_at", DateTime(), server_default=func.now(), nullable=False,
    )
    updated_at = Column(
        "updated_at", DateTime(), server_default=func.now(),
        onupdate=func.now(), nullable=False,
    )


class PlanModel(Base):
    """Matches Prisma ``Plan`` → ``plans`` table."""

    __tablename__ = "plans"

    id = Column(Text, primary_key=True)
    session_id = Column("session_id", Text, nullable=False)
    goals = Column(JSONB, nullable=False, default=list)
    mode = Column(Text, nullable=False, default="standard")
    version = Column(Integer, nullable=False, default=1)
    status = Column(Text, nullable=False, default="draft")
    report = Column(JSONB, nullable=True)
    created_at = Column(
        "created_at", DateTime(), server_default=func.now(), nullable=False,
    )


class LlmConnectionModel(Base):
    """Persisted LLM connection configuration — survives backend restarts."""

    __tablename__ = "llm_connections"

    id = Column(Text, primary_key=True)
    provider = Column(Text, nullable=False)      # anthropic | openai_compatible | local
    name = Column(Text, nullable=False)
    api_key = Column(Text, nullable=True)
    base_url = Column(Text, nullable=True)
    model = Column(Text, nullable=False)
    auth_type = Column(Text, nullable=False, default="api_key")
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column("token_expires_at", DateTime(), nullable=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(
        "created_at", DateTime(), server_default=func.now(), nullable=False,
    )
    updated_at = Column(
        "updated_at", DateTime(), server_default=func.now(),
        default=func.now(), onupdate=func.now(), nullable=False,
    )


class ExecutionModel(Base):
    """Matches Prisma ``Execution`` -> ``executions`` table."""

    __tablename__ = "executions"

    id = Column(Text, primary_key=True)
    plan_id = Column("plan_id", Text, nullable=False)
    goal_id = Column("goal_id", Text, nullable=False)
    code = Column(Text, nullable=True)
    code_type = Column("code_type", Text, nullable=True)
    result = Column(JSONB, nullable=True)
    status = Column(Text, nullable=False, default="pending")
    attempts = Column(Integer, nullable=False, default=0)
    l2_result = Column("l2_result", JSONB, nullable=True)
    created_at = Column(
        "created_at", DateTime(), server_default=func.now(), nullable=False,
    )


class SessionModel(Base):
    """Matches Prisma ``Session`` → ``sessions`` table (read-only from backend)."""

    __tablename__ = "sessions"

    id = Column(Text, primary_key=True)
    title = Column(Text, nullable=True)
    state = Column(Text, nullable=False, default="IDLE")
    mode = Column(Text, nullable=True)
    created_at = Column("created_at", DateTime(), server_default=func.now(), nullable=False)
    updated_at = Column("updated_at", DateTime(), server_default=func.now(), nullable=False)
