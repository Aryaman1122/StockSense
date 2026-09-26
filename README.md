# Warehouse Inventory API

FastAPI + PostgreSQL (Neon in production). Covers receive, transfer, delivery and adjustment operations, a forward-only state machine, an immutable ledger, and realtime updates over WebSocket.

## Run it

```bash
docker compose up -d                 # local Postgres on :5433 (production: Neon)
cp .env.example .env                 # set JWT_SECRET
python -m venv venv && venv/Scripts/pip install -r requirements.txt   # (bin/ on macOS/Linux)
python -m app.seed                   # demo data; logins: manager / manager-demo-1, staff / staff-demo-1
uvicorn app.main:app --env-file .env # interactive docs at http://localhost:8000/docs
pytest -q                            # uses database inventory_test on the same server
```

Production (Railway/Fly, **same region as Neon**):

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'
```

Production environment:

- `DATABASE_URL`: Neon's *pooled* connection string
- `JWT_SECRET`
- `CORS_ORIGINS`: the Vercel URL
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=none`
- `RESEND_API_KEY`
- `RESEND_FROM`
- Leave `OTP_DEV_ECHO` unset.

The schema is applied idempotently on boot, so there's no separate migration step.

## Trust model

| Table | Role |
|---|---|
| `ledger` | Append-only. One row per stock movement, written when an operation reaches `done`. A database trigger rejects `UPDATE`, `DELETE` and `TRUNCATE`. |
| `quants` | Current on-hand quantity per product and location. Every read uses this table, so a lookup is O(1). It's updated **in the same transaction** as the ledger insert, after `SELECT … FOR UPDATE` locks the row. `CHECK (qty >= 0)` is a second line of defence. |
| `operations` / `operation_transitions` | The state machine, draft → waiting → ready → done, or any open state → canceled. It only moves forward, one step at a time. Every move records the actor and a timestamp, and the transitions table is append-only. Operations can never be deleted. |
| `idempotency_keys` | `POST /operations/{id}/transition` **requires** an `Idempotency-Key` header. A retry or double-click with the same key replays the first response and never runs the transition twice. |

The spec's worked example is an acceptance test ([tests/test_worked_example.py](tests/test_worked_example.py)):

1. Receive +100 steel → 100
2. Transfer to the production rack → 0 / 100
3. Deliver −20 → 80
4. Count 77 (3 damaged) → the adjustment posts −3 → 77

After each step, the test also checks that `quants` equals `SUM(ledger)`. [tests/test_concurrency.py](tests/test_concurrency.py) runs two validations at the same moment against the last unit in stock. Exactly one succeeds. If you remove the row lock, the test fails.

## Security — read this

> **RBAC is enforced in the API layer only, not by database row-level security.**
> Neon has no Supabase-style RLS backstop, and this project doesn't add Postgres RLS policies. Anyone holding the `DATABASE_URL` has full read/write access to the data. The FastAPI server is the only gatekeeper, so treat the connection string like a root password.

- Roles (`staff`, `manager`) are read **only** from the verified JWT claim, never from the request body.
- Managers are the only role that can:
  - create products, warehouses and locations
  - create or move stock adjustments
  - read the raw ledger
- Signup always creates `staff`.
- Passwords are hashed with argon2id.
- Access tokens last 15 minutes and refresh tokens 7 days, both in httpOnly cookies. Tokens never appear in response bodies.
- Resetting a password or logging out revokes all of that user's refresh tokens (`token_version`).
- OTP codes:
  - 6 digits, valid for 10 minutes, single use
  - stored only as HMAC-SHA256, never in plaintext
  - locked after 5 wrong attempts
  - never logged; the one exception is the explicit local-only `OTP_DEV_ECHO` flag
- Rate limits:
  - login: 5 per minute per account, 20 per minute per IP
  - OTP request: 5 per hour per email
  - reset: 10 per hour per IP
  - signup: 10 per hour per IP
- Writes that carry cookies are rejected if they come from an origin outside `CORS_ORIGINS`. The WebSocket handshake gets the same check.
- Every secret is a server-side environment variable. This service has no client bundle.

## Inventory features

- **Adjustments are physical counts.** The adjustment's `qty` is the counted quantity (0 allowed). When the adjustment is validated, it posts `counted − on_hand` to the ledger, with on_hand read under the row lock. A count that matches the recorded stock posts nothing.
- **Products** have `uom` and `min_qty`, which is the reordering rule. `POST /products` accepts `initial_qty` + `initial_location_id` and posts the initial stock as a done adjustment, so it appears in the ledger. `PATCH /products/{id}` updates products and is manager-only.
- **Receipts and deliveries** take an optional `partner` (the supplier or the customer).
- **`GET /dashboard?warehouse_id=&category=`** returns:
  - products in stock
  - low-stock count (`0 < on_hand ≤ min_qty`)
  - out-of-stock count
  - pending receipts, deliveries and transfers (not done or canceled)
  - `alerts`, the list of every low or out-of-stock product
- **Filters.** `/operations` takes `type`, `status`, `warehouse_id`, `location_id` (source or destination), `category` and `q`. `/quants` takes `warehouse_id`, `location_id`, `product_id`, `category` and `q`. `/products` takes `category` and `q`. `q` is a case-insensitive search on SKU or name.

## Realtime

Connect to `GET /ws`; the access cookie authenticates it. After a write **commits**, every client receives `{"type": "operation.created" | "operation.transitioned", "operationId", "newState"}`. Nothing is sent before the commit.

## Neon cold start

- The pool waits up to 30 seconds for a connection instead of failing, and it drops connections that Neon closed while suspended.
- The frontend should call `GET /health` on page load, so the database is awake before the user signs in.
- The pool is capped at 5 connections to stay within the free tier.

## Known limits (deliberate, for a single-instance demo)

- Rate limits and the WebSocket client registry live in process memory. That's correct for one API instance. If you scale out, move them to Postgres or Redis and `LISTEN/NOTIFY`.
- Each operation covers one product. Multi-line pickings aren't implemented.
