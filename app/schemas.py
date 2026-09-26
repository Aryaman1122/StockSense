"""Request/response shapes. Single source of truth: the frontend generates TS types from /openapi.json."""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
OpType = Literal["receive", "transfer", "delivery", "adjustment"]
OpStatus = Literal["draft", "waiting", "ready", "done"]
Role = Literal["staff", "manager"]


# --- auth ---

class SignupIn(BaseModel):
    login_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")]
    email: Email
    password: Password


class LoginIn(BaseModel):
    login_id: Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)]
    password: Annotated[str, StringConstraints(max_length=128)]


class ForgotPasswordIn(BaseModel):
    email: Email


class ResetPasswordIn(BaseModel):
    email: Email
    otp: Annotated[str, StringConstraints(pattern=r"^\d{6}$")]
    new_password: Password


class UserOut(BaseModel):
    id: int
    login_id: str
    email: str
    role: Role


class MessageOut(BaseModel):
    message: str


# --- master data ---

class WarehouseIn(BaseModel):
    name: Name


class WarehouseOut(BaseModel):
    id: int
    name: str


class LocationIn(BaseModel):
    warehouse_id: int
    name: Name


class LocationOut(BaseModel):
    id: int
    warehouse_id: int
    name: str


class ProductIn(BaseModel):
    sku: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
    name: Name
    category: Name


class ProductOut(BaseModel):
    id: int
    sku: str
    name: str
    category: str


class QuantOut(BaseModel):
    product_id: int
    sku: str
    product_name: str
    category: str
    location_id: int
    location_name: str
    warehouse_id: int
    qty: float


# --- operations ---

class OperationIn(BaseModel):
    type: OpType
    product_id: int
    qty: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    source_location_id: int | None = None
    dest_location_id: int | None = None
    scheduled_date: date | None = None
    note: Annotated[str, StringConstraints(max_length=500)] | None = None


class OperationOut(BaseModel):
    id: int
    type: OpType
    status: OpStatus
    product_id: int
    qty: float
    source_location_id: int | None
    dest_location_id: int | None
    warehouse_id: int
    scheduled_date: date
    note: str | None
    created_by: int
    created_at: datetime


class TransitionIn(BaseModel):
    from_: OpStatus = Field(alias="from")
    to: OpStatus


class TransitionOut(BaseModel):
    from_status: OpStatus | None
    to_status: OpStatus
    actor_id: int
    at: datetime


class LedgerOut(BaseModel):
    id: int
    operation_id: int
    product_id: int
    location_id: int
    delta: float
    actor_id: int
    created_at: datetime


class OperationDetail(OperationOut):
    transitions: list[TransitionOut]
    ledger: list[LedgerOut]
