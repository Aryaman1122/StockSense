"""Pure state-machine rules: no database."""
from decimal import Decimal
from itertools import product

from app.inventory import can_transition, ledger_deltas

STATES = ["draft", "waiting", "ready", "done", "canceled"]
LEGAL = {("draft", "waiting"), ("waiting", "ready"), ("ready", "done"),
         ("draft", "canceled"), ("waiting", "canceled"), ("ready", "canceled")}


def test_only_single_forward_steps_or_cancel_are_legal():
    for frm, to in product(STATES, STATES):
        assert can_transition(frm, to) == ((frm, to) in LEGAL), (frm, to)


def test_ledger_deltas_per_type():
    base = {"product_id": 1, "qty": Decimal("5"), "source_location_id": 10, "dest_location_id": 20}
    assert ledger_deltas({**base, "type": "receive", "source_location_id": None}) == [(1, 20, Decimal("5"))]
    assert ledger_deltas({**base, "type": "delivery", "dest_location_id": None}) == [(1, 10, Decimal("-5"))]
    adj = {**base, "type": "adjustment", "dest_location_id": None}  # counted 5
    assert ledger_deltas(adj, on_hand=Decimal("8")) == [(1, 10, Decimal("-3"))]
    assert ledger_deltas(adj, on_hand=Decimal("2")) == [(1, 10, Decimal("3"))]
    assert ledger_deltas(adj, on_hand=Decimal("5")) == []  # count matches: nothing to post
    assert ledger_deltas({**base, "type": "transfer"}) == [(1, 10, Decimal("-5")), (1, 20, Decimal("5"))]


def test_ledger_deltas_sorted_for_lock_order():
    op = {"product_id": 1, "qty": Decimal("1"), "source_location_id": 30, "dest_location_id": 5, "type": "transfer"}
    assert [loc for _, loc, _ in ledger_deltas(op)] == [5, 30]
