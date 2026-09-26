"""Warehouse inventory API. Run: uvicorn app.main:app --env-file .env"""
import json
import logging
import time
from contextlib import asynccontextmanager

import psycopg.errors
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import auth, db, inventory, ws
from .db import DomainError

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    owns_pool = db.pool is None  # tests open one pool shared by the app and direct service calls
    if owns_pool:
        db.open_pool()
    db.apply_schema()  # waits out a Neon cold start via the pool timeout
    yield
    if owns_pool:
        db.close_pool()


app = FastAPI(title="Warehouse Inventory API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(auth.ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(inventory.router)
app.include_router(ws.router)

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def csrf_and_log(request: Request, call_next):
    # Cookie auth => reject cross-site writes from origins we don't know.
    if request.method in UNSAFE and not auth.origin_allowed(request.headers.get("origin"), request.headers.get("host", "")):
        return JSONResponse({"error": "forbidden", "message": "Origin not allowed"}, status_code=403)
    start = time.perf_counter()
    response = await call_next(request)
    if request.method in UNSAFE:  # structured log line per mutating request; bodies never logged
        log.info(json.dumps({
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "ms": round((time.perf_counter() - start) * 1000, 1),
            "user_id": getattr(request.state, "user_id", None),
        }))
    return response


@app.exception_handler(DomainError)
async def domain_error(_: Request, e: DomainError):
    return JSONResponse({"error": e.code, "message": e.message}, status_code=e.status)


# DB constraints are the backstop; surface their violations as client errors, not 500s.
@app.exception_handler(psycopg.errors.UniqueViolation)
async def unique_violation(_: Request, e):
    return JSONResponse({"error": "conflict", "message": "Already exists"}, status_code=409)


@app.exception_handler(psycopg.errors.ForeignKeyViolation)
@app.exception_handler(psycopg.errors.CheckViolation)
async def integrity_violation(_: Request, e):
    return JSONResponse({"error": "invalid_reference", "message": "Referenced record missing or value not allowed"},
                        status_code=422)


@app.get("/health")
def health():
    """Public warmup ping: the frontend calls this on load so Neon is awake before the user logs in."""
    with db.tx() as cur:
        cur.execute("SELECT 1")
    return {"ok": True}
