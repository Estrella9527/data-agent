"""DatabaseSource — handles MySQL and PostgreSQL database connections."""

from __future__ import annotations

import os
import tempfile
from typing import Optional

import pandas as pd

from app.sources.base import DataSource, SourceType, ColumnInfo, DataProfile
from app.sources.profiler import DataProfiler


class DatabaseSource(DataSource):
    """Database data source: MySQL / PostgreSQL."""

    source_type = SourceType.DATABASE

    def __init__(
        self,
        db_type: str,  # "mysql" or "postgresql"
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        table: Optional[str] = None,
    ):
        self.db_type = db_type
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.password = password
        self.table = table
        self._profiler = DataProfiler()

    @property
    def connection_url(self) -> str:
        """Build a connection URL for pandas/sqlalchemy."""
        if self.db_type == "mysql":
            return (
                f"mysql+pymysql://{self.username}:{self.password}"
                f"@{self.host}:{self.port}/{self.database}"
            )
        else:
            return (
                f"postgresql+psycopg2://{self.username}:{self.password}"
                f"@{self.host}:{self.port}/{self.database}"
            )

    async def test_connection(self) -> tuple[bool, str]:
        """Test database connectivity with SELECT 1."""
        try:
            import sqlalchemy
            engine = sqlalchemy.create_engine(
                self.connection_url,
                connect_args={"connect_timeout": 10} if self.db_type == "postgresql" else {},
            )
            with engine.connect() as conn:
                conn.execute(sqlalchemy.text("SELECT 1"))
            engine.dispose()
            return True, "数据库连接成功"
        except Exception as e:
            return False, f"数据库连接失败: {str(e)}"

    async def list_tables(self) -> list[str]:
        """List all available tables in the database."""
        try:
            import sqlalchemy
            engine = sqlalchemy.create_engine(self.connection_url)
            inspector = sqlalchemy.inspect(engine)
            tables = inspector.get_table_names()
            engine.dispose()
            return tables
        except Exception as e:
            raise RuntimeError(f"无法获取表列表: {str(e)}")

    async def discover_schema(self) -> list[ColumnInfo]:
        """Discover schema from the selected table."""
        if not self.table:
            return []
        df = await self._read_table(limit=100)
        profile = self._profiler.profile(df)
        return profile.columns

    async def get_profile(self) -> DataProfile:
        """Profile the selected table (up to 10000 rows for performance)."""
        if not self.table:
            return DataProfile()
        df = await self._read_table(limit=10000)
        return self._profiler.profile(df)

    async def get_sample(self, n: int = 10) -> list[dict]:
        """Return first N rows from the table."""
        if not self.table:
            return []
        df = await self._read_table(limit=n)
        return df.to_dict(orient="records")

    async def to_dataframe(self, query: Optional[str] = None) -> pd.DataFrame:
        """Execute a query or read the full table."""
        import sqlalchemy
        engine = sqlalchemy.create_engine(self.connection_url)
        try:
            if query:
                return pd.read_sql(query, engine)
            elif self.table:
                return pd.read_sql_table(self.table, engine)
            else:
                return pd.DataFrame()
        finally:
            engine.dispose()

    async def get_data_path(self) -> str:
        """Export table to a temporary CSV file."""
        df = await self.to_dataframe()
        tmp_dir = os.path.join(tempfile.gettempdir(), "data_agent")
        os.makedirs(tmp_dir, exist_ok=True)
        path = os.path.join(tmp_dir, f"{self.database}_{self.table}.csv")
        df.to_csv(path, index=False)
        return path

    async def _read_table(self, limit: int | None = None) -> pd.DataFrame:
        """Read from the database table with optional limit."""
        import sqlalchemy
        engine = sqlalchemy.create_engine(self.connection_url)
        try:
            if limit:
                query = f"SELECT * FROM {self.table} LIMIT {limit}"
                return pd.read_sql(query, engine)
            return pd.read_sql_table(self.table, engine)
        finally:
            engine.dispose()
