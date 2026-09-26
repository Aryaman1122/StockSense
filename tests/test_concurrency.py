"""Two simultaneous validations must serialize on the row lock, never both succeed against a stale read."""
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

from app import db
from app.db import DomainError
from app.inventory import create_operation, transition_operation
from app.schemas import OperationIn
from tests.conftest import assert_quants_match_ledger, quant


def to_ready(actor, **fields) -> int:
    op, _ = create_operation(OperationIn(**fields), actor)
    transition_operation(op.id, "draft", "waiting", actor, None)
    transition_operation(op.id, "waiting", "ready", actor, None)
    return op.id


def race(fn, args: list) -> list[str]:
    barrier = threading.Barrier(len(args))

    def run(a):
        barrier.wait()
        try:
            fn(a)
            return "ok"
        except DomainError as e:
            return e.code

    with ThreadPoolExecutor(len(args)) as ex:
        return sorted(ex.map(run, args))


def test_last_unit_goes_to_exactly_one_delivery(world):
    m, steel, stock = world["manager"], world["steel"], world["stock"]
    receipt = to_ready(m, type="receive", product_id=steel, qty=1, dest_location_id=stock)
    transition_operation(receipt, "ready", "done", m, None)
    a = to_ready(m, type="delivery", product_id=steel, qty=1, source_location_id=stock)
    b = to_ready(m, type="delivery", product_id=steel, qty=1, source_location_id=stock)

    results = race(lambda op_id: transition_operation(op_id, "ready", "done", m, uuid.uuid4().hex), [a, b])

    # "insufficient_stock" (not a CHECK-constraint crash) proves the loser read the committed qty under the lock.
    assert results == ["insufficient_stock", "ok"]
    assert quant(steel, stock) == 0
    assert_quants_match_ledger()


def test_double_click_same_operation_posts_once(world):
    m, steel, stock = world["manager"], world["steel"], world["stock"]
    op = to_ready(m, type="receive", product_id=steel, qty=10, dest_location_id=stock)

    results = race(lambda _: transition_operation(op, "ready", "done", m, uuid.uuid4().hex), [1, 2])

    assert results == ["ok", "stale_state"]
    assert quant(steel, stock) == 10


def test_same_idempotency_key_concurrently_replays(world):
    m, steel, stock = world["manager"], world["steel"], world["stock"]
    op = to_ready(m, type="receive", product_id=steel, qty=10, dest_location_id=stock)
    key = uuid.uuid4().hex

    results = race(lambda _: transition_operation(op, "ready", "done", m, key), [1, 2])

    assert results == ["ok", "ok"]  # second one waited for the first commit, then replayed its response
    assert quant(steel, stock) == 10
    with db.tx() as cur:
        assert cur.execute("SELECT count(*) AS n FROM ledger WHERE operation_id = %s", (op,)).fetchone()["n"] == 1
