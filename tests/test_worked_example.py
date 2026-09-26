"""The spec's worked example as one continuous scenario: +100 steel, transfer, -20 delivered, -3 damaged."""
import uuid

import psycopg
import pytest

from app import db
from app.db import DomainError
from app.inventory import create_operation, transition_operation
from app.schemas import OperationIn
from tests.conftest import assert_quants_match_ledger, quant


def validate(actor: dict, **fields) -> int:
    op, _ = create_operation(OperationIn(**fields), actor)
    for frm, to in [("draft", "waiting"), ("waiting", "ready"), ("ready", "done")]:
        transition_operation(op.id, frm, to, actor, uuid.uuid4().hex)
    return op.id


def test_worked_example(world):
    m, steel, stock, rack = world["manager"], world["steel"], world["stock"], world["rack"]

    validate(m, type="receive", product_id=steel, qty=100, dest_location_id=stock)
    assert quant(steel, stock) == 100
    assert_quants_match_ledger()

    validate(m, type="transfer", product_id=steel, qty=100, source_location_id=stock, dest_location_id=rack)
    assert quant(steel, stock) == 0
    assert quant(steel, rack) == 100
    assert_quants_match_ledger()

    validate(m, type="delivery", product_id=steel, qty=20, source_location_id=rack)
    assert quant(steel, rack) == 80
    assert_quants_match_ledger()

    validate(m, type="adjustment", product_id=steel, qty=3, source_location_id=rack, note="damaged")
    assert quant(steel, rack) == 77
    assert_quants_match_ledger()


def test_ledger_is_append_only(world):
    validate(world["manager"], type="receive", product_id=world["steel"], qty=1, dest_location_id=world["stock"])
    for sql in ("UPDATE ledger SET delta = 999", "DELETE FROM ledger", "TRUNCATE ledger CASCADE"):
        with pytest.raises(psycopg.errors.RaiseException), db.tx() as cur:
            cur.execute(sql)


def test_failed_validation_rolls_back_everything(world):
    m = world["manager"]
    op, _ = create_operation(OperationIn(type="delivery", product_id=world["steel"], qty=5,
                                         source_location_id=world["stock"]), m)
    transition_operation(op.id, "draft", "waiting", m, None)
    transition_operation(op.id, "waiting", "ready", m, None)
    with pytest.raises(DomainError) as e:
        transition_operation(op.id, "ready", "done", m, None)
    assert e.value.code == "insufficient_stock"
    with db.tx() as cur:
        assert cur.execute("SELECT status FROM operations WHERE id = %s", (op.id,)).fetchone()["status"] == "ready"
        assert cur.execute("SELECT count(*) AS n FROM ledger").fetchone()["n"] == 0


def test_backward_and_skip_transitions_rejected(world):
    m = world["manager"]
    op, _ = create_operation(OperationIn(type="receive", product_id=world["steel"], qty=1,
                                         dest_location_id=world["stock"]), m)
    with pytest.raises(DomainError) as e:
        transition_operation(op.id, "draft", "done", m, None)
    assert e.value.code == "illegal_transition"
    transition_operation(op.id, "draft", "waiting", m, None)
    with pytest.raises(DomainError) as e:
        transition_operation(op.id, "waiting", "draft", m, None)
    assert e.value.code == "illegal_transition"


def test_staff_cannot_adjust(world):
    with pytest.raises(DomainError) as e:
        create_operation(OperationIn(type="adjustment", product_id=world["steel"], qty=1,
                                     source_location_id=world["stock"]), world["staff"])
    assert e.value.status == 403
