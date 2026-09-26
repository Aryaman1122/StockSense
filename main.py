"""StockSense IMS - Auth module (signup, login, OTP password reset).

Only the Auth slice from the mockup is implemented for now:
Login/Signup -> OTP-based password reset -> redirect to Dashboard.
"""
import hashlib
import hmac
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

DB_PATH = os.environ.get("STOCKSENSE_DB", os.path.join(os.path.dirname(__file__), "stocksense.db"))
OTP_TTL_MINUTES = 10
SESSION_TTL_HOURS = 24

app = FastAPI(title="StockSense IMS")


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                login_id TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS password_resets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                otp_hash TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                expires_at TEXT NOT NULL
            )
        """)


# --- password / otp hashing (stdlib pbkdf2, no extra dependency) ---

def _hash(secret: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, 100_000)
    return f"{salt.hex()}${digest.hex()}"


def hash_secret(secret: str) -> str:
    return _hash(secret, os.urandom(16))


def verify_secret(secret: str, stored: str) -> bool:
    try:
        salt_hex, _ = stored.split("$", 1)
    except ValueError:
        return False
    return hmac.compare_digest(_hash(secret, bytes.fromhex(salt_hex)), stored)


def now() -> datetime:
    return datetime.now(timezone.utc)


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def send_otp(email: str, otp: str) -> None:
    # ponytail: no email/SMS provider wired up yet, log instead. Swap in
    # smtplib/Twilio/etc. here once a provider is chosen.
    print(f"[StockSense] OTP for {email}: {otp} (valid {OTP_TTL_MINUTES} min)")


# --- schemas ---

class SignupRequest(BaseModel):
    login_id: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    login_id: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str = Field(min_length=8, max_length=128)


# --- helpers ---

def get_user_by_login(conn, login_id: str):
    return conn.execute("SELECT * FROM users WHERE login_id = ?", (login_id,)).fetchone()


def get_user_by_email(conn, email: str):
    return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def current_user(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.removeprefix("Bearer ")
    with db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE token = ?", (token,)).fetchone()
        if not row or datetime.fromisoformat(row["expires_at"]) < now():
            raise HTTPException(401, "Invalid or expired session")
        user = conn.execute("SELECT * FROM users WHERE id = ?", (row["user_id"],)).fetchone()
        return dict(user)


init_db()


# --- routes ---

@app.post("/auth/signup", status_code=201)
def signup(req: SignupRequest):
    with db() as conn:
        if get_user_by_login(conn, req.login_id) or get_user_by_email(conn, req.email):
            raise HTTPException(409, "login_id or email already registered")
        conn.execute(
            "INSERT INTO users (login_id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (req.login_id, req.email, hash_secret(req.password), now().isoformat()),
        )
    return {"message": "signup successful"}


@app.post("/auth/login")
def login(req: LoginRequest):
    with db() as conn:
        user = get_user_by_login(conn, req.login_id)
        if not user or not verify_secret(req.password, user["password_hash"]):
            raise HTTPException(401, "Invalid login id or password")
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user["id"], (now() + timedelta(hours=SESSION_TTL_HOURS)).isoformat()),
        )
    return {"token": token, "redirect": "/dashboard"}


@app.post("/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    with db() as conn:
        user = get_user_by_email(conn, req.email)
        if user:
            otp = generate_otp()
            conn.execute(
                "INSERT INTO password_resets (user_id, otp_hash, expires_at) VALUES (?, ?, ?)",
                (user["id"], hash_secret(otp), (now() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()),
            )
            send_otp(req.email, otp)
    # Same response whether or not the email exists, so this can't be used to enumerate accounts.
    return {"message": "If that email is registered, an OTP has been sent"}


@app.post("/auth/reset-password")
def reset_password(req: ResetPasswordRequest):
    with db() as conn:
        user = get_user_by_email(conn, req.email)
        if not user:
            raise HTTPException(400, "Invalid or expired OTP")
        reset = conn.execute(
            "SELECT * FROM password_resets WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1",
            (user["id"],),
        ).fetchone()
        if (
            not reset
            or datetime.fromisoformat(reset["expires_at"]) < now()
            or not verify_secret(req.otp, reset["otp_hash"])
        ):
            raise HTTPException(400, "Invalid or expired OTP")
        conn.execute("UPDATE password_resets SET used = 1 WHERE id = ?", (reset["id"],))
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_secret(req.new_password), user["id"]),
        )
    return {"message": "password reset successful"}


@app.get("/dashboard")
def dashboard(user: dict = Depends(current_user)):
    return {"message": f"Welcome {user['login_id']}"}
