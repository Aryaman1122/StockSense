import os
from contextlib import contextmanager
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

pool: ConnectionPool | None = None


class DomainError(Exception):
    """Service-layer failure. The HTTP layer maps it to a status code; services never touch HTTP."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def open_pool(url: str | None = None) -> None:
    global pool
    pool = ConnectionPool(
        url or os.environ["DATABASE_URL"],
        min_size=1,
        max_size=5,  # Neon free tier: keep connection count small
        timeout=30,  # a request waits out a Neon cold start (~1-5s) instead of erroring
        check=ConnectionPool.check_connection,  # drop connections Neon closed while suspended
        # prepare_threshold=None: Neon's pooled endpoint (pgbouncer, transaction mode) can't use prepared statements
        kwargs={"row_factory": dict_row, "prepare_threshold": None, "autocommit": True},
        open=False,
    )
    pool.open()


def close_pool() -> None:
    if pool:
        pool.close()


def apply_schema() -> None:
    with pool.connection() as conn:
        conn.execute(Path(__file__).with_name("schema.sql").read_text())


@contextmanager
def tx():
    """One transaction; commits on success, rolls back on any exception."""
    with pool.connection() as conn, conn.transaction(), conn.cursor() as cur:
        yield cur


def where(filters: dict[str, object]) -> tuple[str, list]:
    """Equality WHERE from the non-None filters. Keys are column names from code, never user input."""
    items = [(col, val) for col, val in filters.items() if val is not None]
    if not items:
        return "", []
    return "WHERE " + " AND ".join(f"{col} = %s" for col, _ in items), [val for _, val in items]
