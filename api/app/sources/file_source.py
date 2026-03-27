"""FileSource — handles CSV, Excel, and TSV file data sources."""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd

from app.sources.base import DataSource, SourceType, ColumnInfo, DataProfile
from app.sources.profiler import DataProfiler


# Supported file extensions and their pandas readers
FILE_READERS = {
    ".csv": lambda p: pd.read_csv(p),
    ".tsv": lambda p: pd.read_csv(p, sep="\t"),
    ".xlsx": lambda p: pd.read_excel(p, engine="openpyxl"),
    ".xls": lambda p: pd.read_excel(p),
}


class FileSource(DataSource):
    """File-based data source: CSV, Excel, TSV."""

    source_type = SourceType.FILE

    def __init__(self, file_path: str, file_name: str | None = None):
        self.file_path = file_path
        self.file_name = file_name or os.path.basename(file_path)
        self._profiler = DataProfiler()

    def _read_df(self, nrows: int | None = None) -> pd.DataFrame:
        """Read the file into a DataFrame."""
        ext = Path(self.file_path).suffix.lower()
        reader = FILE_READERS.get(ext)
        if not reader:
            raise ValueError(f"Unsupported file type: {ext}")

        if nrows is not None and ext in (".csv", ".tsv"):
            return pd.read_csv(
                self.file_path,
                sep="\t" if ext == ".tsv" else ",",
                nrows=nrows,
            )
        return reader(self.file_path)

    async def test_connection(self) -> tuple[bool, str]:
        """Check if the file exists and is readable."""
        if not os.path.exists(self.file_path):
            return False, f"文件不存在: {self.file_path}"
        try:
            self._read_df(nrows=1)
            return True, "文件可正常读取"
        except Exception as e:
            return False, f"文件读取失败: {str(e)}"

    async def discover_schema(self) -> list[ColumnInfo]:
        """Discover schema from first 100 rows."""
        df = self._read_df(nrows=100)
        profile = self._profiler.profile(df)
        return profile.columns

    async def get_profile(self) -> DataProfile:
        """Generate a full data profile."""
        df = self._read_df()
        file_size = os.path.getsize(self.file_path) if os.path.exists(self.file_path) else None
        return self._profiler.profile(df, file_size_bytes=file_size)

    async def get_sample(self, n: int = 10) -> list[dict]:
        """Return first N rows as list of dicts."""
        df = self._read_df(nrows=n)
        return df.head(n).to_dict(orient="records")

    async def to_dataframe(self, query: str | None = None) -> pd.DataFrame:
        """Load the full file as a DataFrame."""
        return self._read_df()

    async def get_data_path(self) -> str:
        """Return the file path directly."""
        return self.file_path
