"""Operations engine: state machine, ledger + quant writes under row locks, idempotency, and routes.

Services are plain functions (no HTTP); routes call them and broadcast only after they return (i.e. after commit).
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, Query
from psycopg.types.json import Jsonb

from . import db
from .auth import current_user, require_role
from .db import DomainError
from .schemas import (
    DashboardOut, LedgerOut, LocationIn, LocationOut, OperationDetail, OperationIn, OperationOut, OpStatus, OpType,
    ProductIn, ProductOut, ProductPatch, QuantOut, StockAlert, TransitionIn, WarehouseIn, WarehouseOut,
)
from .ws import publish

# --- pure logic (unit-tested without a DB) ---

NEXT: dict[str, str] = {"draft": "waiting", "waiting": "ready", "ready": "done"}


def can_transition(frm: str, to: str) -> bool:
    """Forward-only, one step at a time; any open operation (not done/canceled) can be canceled."""
    return NEXT.get(frm) == to or (to == "canceled" and frm in NEXT)


def ledger_deltas(op: dict, on_hand: Decimal | None = None) -> list[tuple[int, int, Decimal]]:
    """(product_id, location_id, delta) rows an operation posts when it reaches 'done'.

    An adjustment's qty is the counted quantity, so its delta is counted - on_hand (on_hand read under lock).
    Zero deltas are dropped. Sorted so every transaction locks quant rows in the same order: no deadlocks.
    """
    qty, src, dst = op["qty"], op["source_location_id"], op["dest_location_id"]
    if op["type"] == "adjustment":
        moves = [(src, qty - on_hand)]
    else:
        moves = {
            "receive": [(dst, qty)],
            "transfer": [(src, -qty), (dst, qty)],
            "delivery": [(src, -qty)],
        }[op["type"]]
    return sorted((op["product_id"], loc, delta) for loc, delta in moves if delta != 0)


def _require_manager_for_adjustment(op_type: str, actor: dict) -> None:
    if op_type == "adjustment" and actor["role"] != "manager":
        raise DomainError(403, "forbidden", "Only managers can create or move stock adjustments")


# --- ledger / quants (always called inside the caller's transaction) ---

def lock_quant(cur, product_id: int, location_id: int) -> Decimal:
    """Lock the quant row (creating it at 0) and return its qty. Concurrent writers of a SKU/location serialize here."""
    cur.execute(
        "INSERT INTO quants (product_id, location_id, qty) VALUES (%s, %s, 0) ON CONFLICT DO NOTHING",
        (product_id, location_id),
    )
    return cur.execute(
        "SELECT qty FROM quants WHERE product_id = %s AND location_id = %s FOR UPDATE",
        (product_id, location_id),
    ).fetchone()["qty"]


def recompute_quant(cur, product_id: int, location_id: int, delta: Decimal) -> None:
    qty = lock_quant(cur, product_id, location_id)
    new_qty = qty + delta
    if new_qty < 0:
        raise DomainError(409, "insufficient_stock", f"Only {qty} on hand at location {location_id}")
    cur.execute(
        "UPDATE quants SET qty = %s WHERE product_id = %s AND location_id = %s",
        (new_qty, product_id, location_id),
    )


def append_ledger_entry(cur, operation_id: int, product_id: int, location_id: int, delta: Decimal, actor_id: int) -> None:
    # Insert-only by design; a DB trigger rejects UPDATE/DELETE/TRUNCATE on this table.
    cur.execute(
        "INSERT INTO ledger (operation_id, product_id, location_id, delta, actor_id) VALUES (%s, %s, %s, %s, %s)",
        (operation_id, product_id, location_id, delta, actor_id),
    )


def post_to_ledger(cur, op: dict, actor_id: int) -> None:
    """Apply a 'done' operation: ledger rows + quants, in the caller's transaction."""
    on_hand = lock_quant(cur, op["product_id"], op["source_location_id"]) if op["type"] == "adjustment" else None
    for product_id, location_id, delta in ledger_deltas(op, on_hand):
        recompute_quant(cur, product_id, location_id, delta)  # raises -> whole transaction rolls back
        append_ledger_entry(cur, op["id"], product_id, location_id, delta, actor_id)


# --- idempotency ---

def claim_idempotency_key(cur, user_id: int, key: str | None, fingerprint: str) -> dict | None:
    """Returns the stored response if this key already completed; None if we own it now.

    A concurrent request with the same key blocks on the PK until the first transaction commits,
    then replays its response — so a double-click can never run the transition twice.
    """
    if key is None:
        return None
    claimed = cur.execute(
        "INSERT INTO idempotency_keys (user_id, key, fingerprint) VALUES (%s, %s, %s) "
        "ON CONFLICT DO NOTHING RETURNING key",
        (user_id, key, fingerprint),
    ).fetchone()
    if claimed:
        return None
    prev = cur.execute(
        "SELECT fingerprint, response FROM idempotency_keys WHERE user_id = %s AND key = %s", (user_id, key)
    ).fetchone()
    if prev["fingerprint"] != fingerprint:
        raise DomainError(422, "idempotency_key_reused", "Idempotency-Key was already used for a different request")
    return prev["response"]


def store_idempotent_response(cur, user_id: int, key: str | None, response: dict) -> None:
    if key is not None:
        cur.execute(
            "UPDATE idempotency_keys SET response = %s WHERE user_id = %s AND key = %s",
            (Jsonb(response), user_id, key),
        )


# --- operation services ---

def create_operation(data: OperationIn, actor: dict, idempotency_key: str | None = None) -> tuple[OperationOut, bool]:
    """Returns (operation, created). created=False means an idempotent replay."""
    _require_manager_for_adjustment(data.type, actor)
    fingerprint = "create:" + data.model_dump_json()
    with db.tx() as cur:
        replay = claim_idempotency_key(cur, actor["id"], idempotency_key, fingerprint)
        if replay is not None:
            return OperationOut.model_validate(replay), False
        home = data.dest_location_id if data.type == "receive" else data.source_location_id
        loc = cur.execute("SELECT warehouse_id FROM locations WHERE id = %s", (home,)).fetchone()
        if not loc:
            raise DomainError(422, "unknown_location", f"Location {home} does not exist")
        row = cur.execute(
            "INSERT INTO operations (type, product_id, qty, source_location_id, dest_location_id, warehouse_id, "
            "scheduled_date, partner, note, created_by) "
            "VALUES (%s, %s, %s, %s, %s, %s, COALESCE(%s, current_date), %s, %s, %s) RETURNING *",
            (data.type, data.product_id, data.qty, data.source_location_id, data.dest_location_id,
             loc["warehouse_id"], data.scheduled_date, data.partner, data.note, actor["id"]),
        ).fetchone()
        cur.execute(
            "INSERT INTO operation_transitions (operation_id, from_status, to_status, actor_id) VALUES (%s, NULL, 'draft', %s)",
            (row["id"], actor["id"]),
        )
        op = OperationOut.model_validate(row)
        store_idempotent_response(cur, actor["id"], idempotency_key, op.model_dump(mode="json"))
    return op, True


def transition_operation(
    op_id: int, frm: str, to: str, actor: dict, idempotency_key: str | None
) -> tuple[OperationOut, bool]:
    """Move an operation one step forward, or cancel it. On 'done', post ledger rows and update quants — all in ONE transaction.

    Returns (operation, changed). changed=False means an idempotent replay.
    """
    with db.tx() as cur:
        replay = claim_idempotency_key(cur, actor["id"], idempotency_key, f"transition:{op_id}:{frm}:{to}")
        if replay is not None:
            return OperationOut.model_validate(replay), False
        # Row lock on the operation: two validates of the SAME operation serialize, the second sees 'done'.
        op = cur.execute("SELECT * FROM operations WHERE id = %s FOR UPDATE", (op_id,)).fetchone()
        if not op:
            raise DomainError(404, "not_found", f"Operation {op_id} not found")
        _require_manager_for_adjustment(op["type"], actor)
        if op["status"] != frm:
            raise DomainError(409, "stale_state", f"Operation is '{op['status']}', not '{frm}'")
        if not can_transition(frm, to):
            raise DomainError(409, "illegal_transition", f"Cannot move {frm} -> {to}; allowed: {frm} -> {NEXT.get(frm)}")
        if to == "done":
            post_to_ledger(cur, op, actor["id"])
        row = cur.execute("UPDATE operations SET status = %s WHERE id = %s RETURNING *", (to, op_id)).fetchone()
        cur.execute(
            "INSERT INTO operation_transitions (operation_id, from_status, to_status, actor_id) VALUES (%s, %s, %s, %s)",
            (op_id, frm, to, actor["id"]),
        )
        result = OperationOut.model_validate(row)
        store_idempotent_response(cur, actor["id"], idempotency_key, result.model_dump(mode="json"))
    return result, True


def _search(q: str | None):
    """SKU / name search condition for db.where (products aliased p)."""
    return q and ("(p.sku ILIKE %s OR p.name ILIKE %s)", [f"%{q}%"] * 2)


def list_operations(
    type: str | None = None, status: str | None = None, warehouse_id: int | None = None,
    category: str | None = None, location_id: int | None = None, q: str | None = None, limit: int = 200,
) -> list[OperationOut]:
    clause, params = db.where(
        {"o.type": type, "o.status": status, "o.warehouse_id": warehouse_id, "p.category": category},
        location_id is not None and ("%s IN (o.source_location_id, o.dest_location_id)", [location_id]),
        _search(q),
    )
    with db.tx() as cur:
        rows = cur.execute(
            f"SELECT o.* FROM operations o JOIN products p ON p.id = o.product_id {clause} "
            "ORDER BY o.scheduled_date, o.id LIMIT %s",
            (*params, limit),
        ).fetchall()
    return [OperationOut.model_validate(r) for r in rows]


def get_operation(op_id: int) -> OperationDetail:
    with db.tx() as cur:
        op = cur.execute("SELECT * FROM operations WHERE id = %s", (op_id,)).fetchone()
        if not op:
            raise DomainError(404, "not_found", f"Operation {op_id} not found")
        transitions = cur.execute(
            "SELECT from_status, to_status, actor_id, at FROM operation_transitions WHERE operation_id = %s ORDER BY id",
            (op_id,),
        ).fetchall()
        ledger = cur.execute("SELECT * FROM ledger WHERE operation_id = %s ORDER BY id", (op_id,)).fetchall()
    return OperationDetail.model_validate({**op, "transitions": transitions, "ledger": ledger})


def list_quants(warehouse_id: int | None = None, product_id: int | None = None, category: str | None = None,
                location_id: int | None = None, q: str | None = None) -> list[QuantOut]:
    clause, params = db.where(
        {"l.warehouse_id": warehouse_id, "q.product_id": product_id, "p.category": category, "q.location_id": location_id},
        _search(q),
    )
    with db.tx() as cur:
        rows = cur.execute(
            "SELECT q.product_id, p.sku, p.name AS product_name, p.category, p.uom, q.location_id, "
            "l.name AS location_name, l.warehouse_id, q.qty "
            "FROM quants q JOIN products p ON p.id = q.product_id JOIN locations l ON l.id = q.location_id "
            f"{clause} ORDER BY p.sku, l.name",
            params,
        ).fetchall()
    return [QuantOut.model_validate(r) for r in rows]


def create_product(data: ProductIn, actor: dict) -> dict:
    """Insert a product; optional initial stock is posted as a done adjustment so quants still equal SUM(ledger)."""
    with db.tx() as cur:
        product = cur.execute(
            "INSERT INTO products (sku, name, category, uom, min_qty) VALUES (%s, %s, %s, %s, %s) RETURNING *",
            (data.sku, data.name, data.category, data.uom, data.min_qty),
        ).fetchone()
        if data.initial_qty > 0:
            loc = cur.execute("SELECT warehouse_id FROM locations WHERE id = %s", (data.initial_location_id,)).fetchone()
            if not loc:
                raise DomainError(422, "unknown_location", f"Location {data.initial_location_id} does not exist")
            op = cur.execute(
                "INSERT INTO operations (type, status, product_id, qty, source_location_id, warehouse_id, note, created_by) "
                "VALUES ('adjustment', 'done', %s, %s, %s, %s, 'Initial stock', %s) RETURNING *",
                (product["id"], data.initial_qty, data.initial_location_id, loc["warehouse_id"], actor["id"]),
            ).fetchone()
            cur.execute(
                "INSERT INTO operation_transitions (operation_id, from_status, to_status, actor_id) VALUES (%s, NULL, 'done', %s)",
                (op["id"], actor["id"]),
            )
            post_to_ledger(cur, op, actor["id"])
    return product


def update_product(product_id: int, data: ProductPatch) -> dict:
    fields = data.model_dump(exclude_unset=True)  # keys are ProductPatch field names, never user input
    with db.tx() as cur:
        if fields:
            sets = ", ".join(f"{col} = %s" for col in fields)
            row = cur.execute(f"UPDATE products SET {sets} WHERE id = %s RETURNING *", (*fields.values(), product_id)).fetchone()
        else:
            row = cur.execute("SELECT * FROM products WHERE id = %s", (product_id,)).fetchone()
    if not row:
        raise DomainError(404, "not_found", f"Product {product_id} not found")
    return row


def dashboard(warehouse_id: int | None = None, category: str | None = None) -> DashboardOut:
    # ponytail: aggregates every product in one pass; fine to tens of thousands of SKUs, paginate alerts beyond that.
    with db.tx() as cur:
        stock = cur.execute(
            "SELECT p.id AS product_id, p.sku, p.name, p.uom, p.min_qty, "
            "COALESCE(SUM(q.qty) FILTER (WHERE %(wh)s::bigint IS NULL OR l.warehouse_id = %(wh)s), 0) AS on_hand "
            "FROM products p LEFT JOIN quants q ON q.product_id = p.id LEFT JOIN locations l ON l.id = q.location_id "
            "WHERE %(cat)s::text IS NULL OR p.category = %(cat)s GROUP BY p.id ORDER BY p.sku",
            {"wh": warehouse_id, "cat": category},
        ).fetchall()
        clause, params = db.where({"o.warehouse_id": warehouse_id, "p.category": category},
                                  ("o.status NOT IN ('done', 'canceled')", []))
        pending = {r["type"]: r["n"] for r in cur.execute(
            f"SELECT o.type, count(*) AS n FROM operations o JOIN products p ON p.id = o.product_id {clause} GROUP BY o.type",
            params,
        ).fetchall()}
    return DashboardOut(
        products_in_stock=sum(r["on_hand"] > 0 for r in stock),
        low_stock=sum(0 < r["on_hand"] <= r["min_qty"] for r in stock),
        out_of_stock=sum(r["on_hand"] == 0 for r in stock),
        pending_receipts=pending.get("receive", 0),
        pending_deliveries=pending.get("delivery", 0),
        scheduled_transfers=pending.get("transfer", 0),
        alerts=[StockAlert.model_validate(r) for r in stock if r["on_hand"] <= r["min_qty"]],
    )


# --- routes ---

router = APIRouter(tags=["inventory"])
any_role = require_role("staff", "manager")
manager_only = require_role("manager")


def _insert(table: str, cols: tuple[str, ...], values: tuple):
    with db.tx() as cur:
        return cur.execute(
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) RETURNING *", values
        ).fetchone()


def _select_all(sql: str, params: list | tuple = ()):
    with db.tx() as cur:
        return cur.execute(sql, params).fetchall()


@router.get("/warehouses", response_model=list[WarehouseOut])
def get_warehouses(_: dict = Depends(current_user)):
    return _select_all("SELECT * FROM warehouses ORDER BY name")


@router.post("/warehouses", status_code=201, response_model=WarehouseOut)
def post_warehouse(body: WarehouseIn, _: dict = Depends(manager_only)):
    return _insert("warehouses", ("name",), (body.name,))


@router.get("/locations", response_model=list[LocationOut])
def get_locations(warehouse_id: int | None = None, _: dict = Depends(current_user)):
    clause, params = db.where({"warehouse_id": warehouse_id})
    return _select_all(f"SELECT * FROM locations {clause} ORDER BY name", params)


@router.post("/locations", status_code=201, response_model=LocationOut)
def post_location(body: LocationIn, _: dict = Depends(manager_only)):
    return _insert("locations", ("warehouse_id", "name"), (body.warehouse_id, body.name))


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(warehouse_id: int | None = None, category: str | None = None, _: dict = Depends(current_user)):
    return dashboard(warehouse_id, category)


@router.get("/products", response_model=list[ProductOut])
def get_products(category: str | None = None, q: str | None = None, _: dict = Depends(current_user)):
    clause, params = db.where({"p.category": category}, _search(q))
    return _select_all(f"SELECT * FROM products p {clause} ORDER BY sku", params)


@router.post("/products", status_code=201, response_model=ProductOut)
def post_product(body: ProductIn, user: dict = Depends(manager_only)):
    return create_product(body, user)


@router.patch("/products/{product_id}", response_model=ProductOut)
def patch_product(product_id: int, body: ProductPatch, _: dict = Depends(manager_only)):
    return update_product(product_id, body)


@router.get("/quants", response_model=list[QuantOut])
def get_quants(warehouse_id: int | None = None, product_id: int | None = None, category: str | None = None,
               location_id: int | None = None, q: str | None = None, _: dict = Depends(current_user)):
    return list_quants(warehouse_id, product_id, category, location_id, q)


@router.get("/operations", response_model=list[OperationOut])
def get_operations(type: OpType | None = None, status: OpStatus | None = None, warehouse_id: int | None = None,
                   category: str | None = None, location_id: int | None = None, q: str | None = None,
                   limit: int = Query(200, ge=1, le=500), _: dict = Depends(current_user)):
    return list_operations(type, status, warehouse_id, category, location_id, q, limit)


@router.get("/operations/{op_id}", response_model=OperationDetail)
def get_operation_detail(op_id: int, _: dict = Depends(current_user)):
    return get_operation(op_id)


@router.post("/operations", status_code=201, response_model=OperationOut)
def post_operation(body: OperationIn, user: dict = Depends(any_role),
                   idempotency_key: str | None = Header(None, min_length=8, max_length=100)):
    op, created = create_operation(body, user, idempotency_key)
    if created:
        publish({"type": "operation.created", "operationId": op.id, "newState": op.status})
    return op


@router.post("/operations/{op_id}/transition", response_model=OperationOut)
def post_transition(op_id: int, body: TransitionIn, user: dict = Depends(any_role),
                    idempotency_key: str = Header(..., min_length=8, max_length=100)):
    op, changed = transition_operation(op_id, body.from_, body.to, user, idempotency_key)
    if changed:
        publish({"type": "operation.transitioned", "operationId": op.id, "newState": op.status})
    return op


@router.get("/ledger", response_model=list[LedgerOut])
def get_ledger(product_id: int | None = None, location_id: int | None = None, limit: int = Query(500, ge=1, le=5000),
               _: dict = Depends(manager_only)):
    clause, params = db.where({"product_id": product_id, "location_id": location_id})
    return _select_all(f"SELECT * FROM ledger {clause} ORDER BY id DESC LIMIT %s", (*params, limit))
