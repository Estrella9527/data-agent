"""DataProfiler — generates data profiles from pandas DataFrames.

Detects data types, statistics, and quality issues per PRD §4.2.
"""

from __future__ import annotations

import pandas as pd
import numpy as np

from app.sources.base import ColumnInfo, DataProfile, QualityIssue


class DataProfiler:
    """Generates a DataProfile from a pandas DataFrame."""

    def profile(self, df: pd.DataFrame, file_size_bytes: int | None = None) -> DataProfile:
        """Analyze a DataFrame and return a complete DataProfile."""
        profile = DataProfile(
            row_count=len(df),
            column_count=len(df.columns),
            file_size_bytes=file_size_bytes,
        )

        for col_name in df.columns:
            col = df[col_name]
            info = self._profile_column(col, col_name, len(df))
            profile.columns.append(info)

        profile.quality_issues = self._detect_quality_issues(df, profile.columns)
        return profile

    def _profile_column(self, col: pd.Series, name: str, total_rows: int) -> ColumnInfo:
        """Profile a single column."""
        missing_count = int(col.isna().sum())
        missing_rate = missing_count / total_rows if total_rows > 0 else 0.0
        non_null = col.dropna()

        # Handle columns with unhashable types (dicts, lists)
        try:
            unique_count = int(non_null.nunique())
        except TypeError:
            unique_count = len(non_null)  # fallback: assume all unique

        # Sample values (up to 5 unique non-null values)
        sample_values = []
        if len(non_null) > 0:
            try:
                samples = non_null.unique()[:5]
            except TypeError:
                samples = non_null.head(5).values
            sample_values = [_safe_val(v) for v in samples]

        info = ColumnInfo(
            name=str(name),
            dtype=str(col.dtype),
            nullable=missing_count > 0,
            sample_values=sample_values,
            unique_count=unique_count,
            missing_count=missing_count,
            missing_rate=missing_rate,
        )

        # Numeric stats
        if pd.api.types.is_numeric_dtype(col):
            try:
                info.min_value = _safe_val(non_null.min())
                info.max_value = _safe_val(non_null.max())
                info.mean_value = float(non_null.mean()) if len(non_null) > 0 else None
            except (TypeError, ValueError):
                pass

        # Datetime stats
        if pd.api.types.is_datetime64_any_dtype(col):
            try:
                info.earliest = str(non_null.min())
                info.latest = str(non_null.max())
            except (TypeError, ValueError):
                pass

        return info

    def _detect_quality_issues(
        self, df: pd.DataFrame, columns: list[ColumnInfo]
    ) -> list[QualityIssue]:
        """Detect data quality issues."""
        issues: list[QualityIssue] = []
        total_rows = len(df)

        # Low row count
        if total_rows < 10:
            issues.append(QualityIssue(
                column=None,
                issue_type="low_rows",
                description=f"数据量不足: 仅有 {total_rows} 行",
                severity="warning",
            ))

        for col_info in columns:
            # High missing rate
            if col_info.missing_rate > 0.3:
                issues.append(QualityIssue(
                    column=col_info.name,
                    issue_type="high_missing",
                    description=f"列 '{col_info.name}' 缺失率 {col_info.missing_rate:.0%}",
                    severity="warning",
                ))

            # Single unique value
            if col_info.unique_count == 1 and col_info.missing_count < total_rows:
                issues.append(QualityIssue(
                    column=col_info.name,
                    issue_type="single_value",
                    description=f"列 '{col_info.name}' 仅有一个唯一值",
                    severity="info",
                ))

            # Possible ID column
            if col_info.unique_count == total_rows and total_rows > 1:
                issues.append(QualityIssue(
                    column=col_info.name,
                    issue_type="possible_id",
                    description=f"列 '{col_info.name}' 可能是 ID 列 (每行唯一)",
                    severity="info",
                ))

            # All-zero numeric column
            if col_info.dtype in ("int64", "float64"):
                col_data = df[col_info.name].dropna()
                if len(col_data) > 0 and (col_data == 0).all():
                    issues.append(QualityIssue(
                        column=col_info.name,
                        issue_type="all_zero",
                        description=f"列 '{col_info.name}' 所有值为 0",
                        severity="warning",
                    ))

        return issues


def _safe_val(val):
    """Convert numpy/pandas types to native Python types."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, (np.bool_,)):
        return bool(val)
    if isinstance(val, (pd.Timestamp, np.datetime64)):
        return str(val)
    if isinstance(val, (dict, list)):
        return str(val)
    return val
