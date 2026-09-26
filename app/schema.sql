-- Idempotent: applied on every API boot. Postgres 14+ (Neon is 16/17).

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('staff', 'manager');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE op_type AS ENUM ('receive', 'transfer', 'delivery', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE op_status AS ENUM ('draft', 'waiting', 'ready', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    login_id      text NOT NULL UNIQUE,
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role          user_role NOT NULL DEFAULT 'staff',
    token_version int NOT NULL DEFAULT 0,  -- bump to revoke all refresh tokens
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES users(id),
    otp_hash   text NOT NULL,  -- HMAC-SHA256, never the code itself
    expires_at timestamptz NOT NULL,
    attempts   int NOT NULL DEFAULT 0,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id, id DESC);

CREATE TABLE IF NOT EXISTS warehouses (
    id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS locations (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id bigint NOT NULL REFERENCES warehouses(id),
    name         text NOT NULL,
    UNIQUE (warehouse_id, name)
);

CREATE TABLE IF NOT EXISTS products (
    id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku      text NOT NULL UNIQUE,
    name     text NOT NULL,
    category text NOT NULL
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);

-- Derived on-hand stock. PK doubles as the (product_id, location_id) lookup index.
-- CHECK is a DB-level backstop; the service already rejects negative stock under a row lock.
CREATE TABLE IF NOT EXISTS quants (
    product_id  bigint NOT NULL REFERENCES products(id),
    location_id bigint NOT NULL REFERENCES locations(id),
    qty         numeric(14, 3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
    PRIMARY KEY (product_id, location_id)
);

CREATE TABLE IF NOT EXISTS operations (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type               op_type NOT NULL,
    status             op_status NOT NULL DEFAULT 'draft',
    product_id         bigint NOT NULL REFERENCES products(id),
    qty                numeric(14, 3) NOT NULL CHECK (qty > 0),
    source_location_id bigint REFERENCES locations(id),
    dest_location_id   bigint REFERENCES locations(id),
    warehouse_id       bigint NOT NULL REFERENCES warehouses(id),
    scheduled_date     date NOT NULL DEFAULT current_date,
    note               text,
    created_by         bigint NOT NULL REFERENCES users(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT operation_locations CHECK (
        (type = 'receive' AND source_location_id IS NULL AND dest_location_id IS NOT NULL)
        OR (type IN ('delivery', 'adjustment') AND source_location_id IS NOT NULL AND dest_location_id IS NULL)
        OR (type = 'transfer' AND source_location_id IS NOT NULL AND dest_location_id IS NOT NULL
            AND source_location_id <> dest_location_id)
    )
);
CREATE INDEX IF NOT EXISTS operations_status_date_idx ON operations (status, scheduled_date);
CREATE INDEX IF NOT EXISTS operations_warehouse_idx ON operations (warehouse_id);
CREATE INDEX IF NOT EXISTS operations_type_status_idx ON operations (type, status);

CREATE TABLE IF NOT EXISTS operation_transitions (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_id bigint NOT NULL REFERENCES operations(id),
    from_status  op_status,  -- NULL = creation
    to_status    op_status NOT NULL,
    actor_id     bigint NOT NULL REFERENCES users(id),
    at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operation_transitions_op_idx ON operation_transitions (operation_id);

CREATE TABLE IF NOT EXISTS ledger (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_id bigint NOT NULL REFERENCES operations(id),
    product_id   bigint NOT NULL REFERENCES products(id),
    location_id  bigint NOT NULL REFERENCES locations(id),
    delta        numeric(14, 3) NOT NULL CHECK (delta <> 0),
    actor_id     bigint NOT NULL REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_product_location_idx ON ledger (product_id, location_id);
CREATE INDEX IF NOT EXISTS ledger_operation_idx ON ledger (operation_id);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    user_id     bigint NOT NULL REFERENCES users(id),
    key         text NOT NULL,
    fingerprint text NOT NULL,  -- which request the key was first used for
    response    jsonb,          -- filled in the same transaction that claimed the key
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

-- Append-only / never-hard-deleted, enforced by the database rather than convention.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only: % rejected', TG_TABLE_NAME, TG_OP;
END $$;

CREATE OR REPLACE TRIGGER ledger_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON ledger
    FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE OR REPLACE TRIGGER operation_transitions_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON operation_transitions
    FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE OR REPLACE TRIGGER operations_no_delete
    BEFORE DELETE OR TRUNCATE ON operations
    FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
