"""Demo data. Run: python -m app.seed   (safe to re-run: exits if already seeded)"""
import os

from . import db
from .auth import ph
from .inventory import create_operation, transition_operation
from .schemas import OperationIn

MANAGER_PW = os.environ.get("SEED_MANAGER_PASSWORD", "manager-demo-1")
STAFF_PW = os.environ.get("SEED_STAFF_PASSWORD", "staff-demo-1")


def seed() -> None:
    with db.tx() as cur:
        if cur.execute("SELECT 1 FROM users WHERE login_id = 'manager'").fetchone():
            print("Already seeded.")
            return
        ins = lambda sql, *a: cur.execute(sql + " RETURNING id", a).fetchone()["id"]  # noqa: E731
        manager = ins("INSERT INTO users (login_id, email, password_hash, role) VALUES (%s, %s, %s, 'manager')",
                      "manager", "manager@demo.local", ph.hash(MANAGER_PW))
        ins("INSERT INTO users (login_id, email, password_hash, role) VALUES (%s, %s, %s, 'staff')",
            "staff", "staff@demo.local", ph.hash(STAFF_PW))
        main_wh = ins("INSERT INTO warehouses (name) VALUES (%s)", "Main Warehouse")
        second_wh = ins("INSERT INTO warehouses (name) VALUES (%s)", "Secondary Warehouse")
        stock = ins("INSERT INTO locations (warehouse_id, name) VALUES (%s, %s)", main_wh, "WH/Stock")
        rack = ins("INSERT INTO locations (warehouse_id, name) VALUES (%s, %s)", main_wh, "WH/Production Rack")
        ins("INSERT INTO locations (warehouse_id, name) VALUES (%s, %s)", second_wh, "WH2/Stock")
        steel = ins("INSERT INTO products (sku, name, category) VALUES (%s, %s, %s)", "STEEL-001", "Steel Rod (kg)", "Raw Material")
        bolts = ins("INSERT INTO products (sku, name, category) VALUES (%s, %s, %s)", "BOLT-M8", "M8 Bolt", "Hardware")
        ins("INSERT INTO products (sku, name, category) VALUES (%s, %s, %s)", "PAINT-RED", "Red Paint (L)", "Consumable")

    actor = {"id": manager, "role": "manager"}

    def op(type_: str, product: int, qty: int, until: str, **locs) -> None:
        o, _ = create_operation(OperationIn(type=type_, product_id=product, qty=qty, **locs), actor)
        status = "draft"
        for nxt in ("waiting", "ready", "done"):
            if status == until:
                break
            transition_operation(o.id, status, nxt, actor, None)
            status = nxt

    # The spec's worked example, fully validated: steel ends at 77 on the production rack.
    op("receive", steel, 100, "done", dest_location_id=stock)
    op("transfer", steel, 100, "done", source_location_id=stock, dest_location_id=rack)
    op("delivery", steel, 20, "done", source_location_id=rack)
    op("adjustment", steel, 3, "done", source_location_id=rack)
    # Something in every kanban column.
    op("receive", bolts, 500, "done", dest_location_id=stock)
    op("delivery", bolts, 50, "ready", source_location_id=stock)
    op("transfer", bolts, 100, "waiting", source_location_id=stock, dest_location_id=rack)
    op("receive", steel, 250, "draft", dest_location_id=stock)
    print(f"Seeded. Logins: manager / {MANAGER_PW}   staff / {STAFF_PW}")


if __name__ == "__main__":
    db.open_pool()
    db.apply_schema()
    try:
        seed()
    finally:
        db.close_pool()
