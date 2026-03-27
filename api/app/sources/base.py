"""DataSource abstract base class — unified interface for all data source types.

Design reference: Craft Agents Source system + PRD §4.2.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import pandas as pd


class SourceType(str, Enum):
    FILE = "file"
    DATABASE = "database"
    API = "api"


@dataclass
class ColumnInfo:
    """Schema information for a single column."""
    name: str
    dtype: str  # e.g. "int64", "object", "datetime64", "float64"
    nullable: bool = True
    sample_values: list[Any] = field(default_factory=list)

    # Numeric stats
    min_value: Any = None
    max_value: Any = None
    mean_value: float | None = None

    # Datetime stats
    earliest: str | None = None
    latest: str | None = None

    # General stats
    unique_count: int = 0
    missing_count: int = 0
    missing_rate: float = 0.0


@dataclass
class QualityIssue:
    """A data quality issue detected during profiling."""
    column: str | None
    issue_type: str  # high_missing | single_value | low_rows | possible_id | all_zero
    description: str
    severity: str = "warning"  # warning | info


@dataclass
class DataProfile:
    """Complete data profile for a data source."""
    row_count: int = 0
    column_count: int = 0
    columns: list[ColumnInfo] = field(default_factory=list)
    quality_issues: list[QualityIssue] = field(default_factory=list)
    file_size_bytes: int | None = None

    def to_dict(self) -> dict:
        return {
            "row_count": self.row_count,
            "column_count": self.column_count,
            "columns": [
                {
                    "name": c.name,
                    "dtype": c.dtype,
                    "nullable": c.nullable,
                    "sample_values": c.sample_values[:5],
                    "min_value": _safe_serialize(c.min_value),
                    "max_value": _safe_serialize(c.max_value),
                    "mean_value": round(c.mean_value, 4) if c.mean_value is not None else None,
                    "earliest": c.earliest,
                    "latest": c.latest,
                    "unique_count": c.unique_count,
                    "missing_count": c.missing_count,
                    "missing_rate": round(c.missing_rate, 4),
                }
                for c in self.columns
            ],
            "quality_issues": [
                {
                    "column": q.column,
                    "issue_type": q.issue_type,
                    "description": q.description,
                    "severity": q.severity,
                }
                for q in self.quality_issues
            ],
        }


def _safe_serialize(val: Any) -> Any:
    """Safely serialize a value for JSON."""
    if val is None:
        return None
    if isinstance(val, (int, float, str, bool)):
        return val
    return str(val)


class DataSource(ABC):
    """Abstract base class for all data source types.

    All three source types (file, database, API) implement this interface,
    making the execution engine data-source-agnostic.
    """

    source_type: SourceType

    @abstractmethod
    async def test_connection(self) -> tuple[bool, str]:
        """Test if the data source is accessible. Returns (success, message)."""
        ...

    @abstractmethod
    async def discover_schema(self) -> list[ColumnInfo]:
        """Discover column schema by inspecting the data."""
        ...

    @abstractmethod
    async def get_profile(self) -> DataProfile:
        """Generate a full data profile."""
        ...

    @abstractmethod
    async def get_sample(self, n: int = 10) -> list[dict]:
        """Return first N rows as list of dicts."""
        ...

    @abstractmethod
    async def to_dataframe(self, query: str | None = None) -> pd.DataFrame:
        """Load the data as a pandas DataFrame."""
        ...

    @abstractmethod
    async def get_data_path(self) -> str:
        """Return a file path for sandbox use.

        For file sources: return the file path directly.
        For DB/API sources: export to temporary CSV and return that path.
        """
        ...
