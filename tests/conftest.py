import os

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/inventory_test"
)
os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 32)
os.environ["CORS_ORIGINS"] = "http://localhost:3000"

import psycopg  # noqa: E402
import pytest  # noqa: E402

from app import auth, db  # noqa: E402


def _create_test_database() -> None:
    url = os.environ["DATABASE_URL"]
    base, name = url.rsplit("/", 1)
    with psycopg.connect(f"{base}/postgres", autocommit=True) as conn:
        if not conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone():
            conn.execute(f'CREATE DATABASE "{name}"')


@pytest.fixture(scope="session", autouse=True)
def pool():
    _create_test_database()
    db.open_pool()
    yield
    db.close_pool()


@pytest.fixture(autouse=True)
def fresh_db(pool):
    # Test-only reset: dropping the schema is the one way past the append-only triggers.
    with db.pool.connection() as conn:
        conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    db.apply_schema()
    auth._hits.clear()


@pytest.fixture
def world():
    """Manager + staff, one warehouse with two locations, and steel."""
    with db.tx() as cur:
        ins = lambda sql, *a: cur.execute(sql + " RETURNING id", a).fetchone()["id"]  # noqa: E731
        manager = ins("INSERT INTO users (login_id, email, password_hash, role) VALUES ('boss', 'boss@t.io', %s, 'manager')",
                      auth.ph.hash("manager-pass-1"))
        staff = ins("INSERT INTO users (login_id, email, password_hash) VALUES ('sam', 'sam@t.io', %s)",
                    auth.ph.hash("staff-pass-1"))
        wh = ins("INSERT INTO warehouses (name) VALUES ('Main')")
        stock = ins("INSERT INTO locations (warehouse_id, name) VALUES (%s, 'WH/Stock')", wh)
        rack = ins("INSERT INTO locations (warehouse_id, name) VALUES (%s, 'WH/Production Rack')", wh)
        steel = ins("INSERT INTO products (sku, name, category) VALUES ('STEEL', 'Steel', 'Raw Material')")
    return {
        "manager": {"id": manager, "role": "manager"},
        "staff": {"id": staff, "role": "staff"},
        "warehouse": wh, "stock": stock, "rack": rack, "steel": steel,
    }


def quant(product_id: int, location_id: int) -> float:
    with db.tx() as cur:
        row = cur.execute("SELECT qty FROM quants WHERE product_id = %s AND location_id = %s",
                          (product_id, location_id)).fetchone()
    return float(row["qty"]) if row else 0.0


def assert_quants_match_ledger() -> None:
    with db.tx() as cur:
        drift = cur.execute(
            "SELECT q.product_id, q.location_id, q.qty, COALESCE(SUM(l.delta), 0) AS ledger_sum "
            "FROM quants q LEFT JOIN ledger l USING (product_id, location_id) "
            "GROUP BY q.product_id, q.location_id, q.qty HAVING q.qty <> COALESCE(SUM(l.delta), 0)"
        ).fetchall()
    assert drift == [], f"quants drifted from ledger: {drift}"
