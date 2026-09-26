"""Auth: signup, login, JWT access/refresh cookies, OTP password reset, RBAC dependencies, rate limiting."""
import hashlib
import hmac
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

import httpx
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response

from . import db
from .db import DomainError
from .schemas import ForgotPasswordIn, LoginIn, MessageOut, ResetPasswordIn, SignupIn, UserOut

log = logging.getLogger("auth")
router = APIRouter(prefix="/auth", tags=["auth"])

JWT_SECRET = os.environ["JWT_SECRET"]
ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)
OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
# Frontend on another site (Vercel -> Railway) needs "none" + COOKIE_SECURE=true.
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax")

ALLOWED_ORIGINS = {o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()}

ph = PasswordHasher()  # argon2id with library-recommended parameters
_DUMMY_HASH = ph.hash("timing-equaliser")


# --- rate limiting ---

_hits: dict[str, tuple[float, int]] = {}


def rate_limit(key: str, limit: int, window_s: int) -> None:
    # ponytail: in-process fixed window; correct for the single API instance we deploy.
    # Move to a Postgres/Redis counter if the API is ever scaled horizontally.
    now = time.monotonic()
    start, count = _hits.get(key, (now, 0))
    if now - start >= window_s:
        start, count = now, 0
    if count >= limit:
        raise DomainError(429, "rate_limited", "Too many attempts, try again later")
    _hits[key] = (start, count + 1)


def client_ip(request: Request) -> str:
    # Run uvicorn with --proxy-headers behind Railway/Fly so this is the real client, not the proxy.
    return request.client.host if request.client else "unknown"


def origin_allowed(origin: str | None, host: str) -> bool:
    """Browsers always send Origin on cross-site requests; no Origin = non-browser client (curl, tests)."""
    return origin is None or origin in ALLOWED_ORIGINS or origin.split("://", 1)[-1] == host


# --- tokens ---

def _token(user: dict, typ: str, ttl: timedelta) -> str:
    payload = {
        "sub": str(user["id"]),
        "role": user["role"],
        "tv": user["token_version"],
        "typ": typ,
        "exp": datetime.now(timezone.utc) + ttl,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str | None, typ: str) -> dict:
    if not token:
        raise DomainError(401, "unauthenticated", "Not logged in")
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise DomainError(401, "unauthenticated", "Invalid or expired token")
    if claims.get("typ") != typ:
        raise DomainError(401, "unauthenticated", "Wrong token type")
    return claims


def set_auth_cookies(response: Response, user: dict) -> None:
    common = {"httponly": True, "secure": COOKIE_SECURE, "samesite": COOKIE_SAMESITE}
    response.set_cookie("access_token", _token(user, "access", ACCESS_TTL),
                        max_age=int(ACCESS_TTL.total_seconds()), path="/", **common)
    response.set_cookie("refresh_token", _token(user, "refresh", REFRESH_TTL),
                        max_age=int(REFRESH_TTL.total_seconds()), path="/auth", **common)


def user_from_access_token(token: str | None) -> dict:
    claims = decode_token(token, "access")
    return {"id": int(claims["sub"]), "role": claims["role"]}


# --- RBAC dependencies (role comes only from the verified JWT, never from the client body) ---

def current_user(request: Request) -> dict:
    user = user_from_access_token(request.cookies.get("access_token"))
    request.state.user_id = user["id"]  # picked up by the request log
    return user


def require_role(*roles: str):
    def dependency(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise DomainError(403, "forbidden", f"Requires role: {' or '.join(roles)}")
        return user

    return dependency


# --- OTP ---

def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(otp: str) -> str:
    # Keyed SHA-256: a leaked table alone can't be brute-forced over the 10^6 code space.
    return hmac.new(JWT_SECRET.encode(), otp.encode(), hashlib.sha256).hexdigest()


def send_otp(email: str, otp: str) -> None:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        if os.environ.get("OTP_DEV_ECHO", "false").lower() == "true":
            print(f"[dev] OTP for {email}: {otp}")  # explicit local-only opt-in; never set in production
        else:
            log.error("RESEND_API_KEY not set; password reset email not sent")
        return
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": os.environ.get("RESEND_FROM", "onboarding@resend.dev"),
                "to": [email],
                "subject": "Your password reset code",
                "text": f"Your code is {otp}. It expires in {int(OTP_TTL.total_seconds() // 60)} minutes.",
            },
            timeout=10,
        )
        r.raise_for_status()
    except httpx.HTTPError as e:
        log.error("Resend delivery failed: %s", type(e).__name__)  # never log the code


# --- routes ---

USER_COLS = "id, login_id, email, role, token_version, password_hash"


@router.post("/signup", status_code=201, response_model=UserOut)
def signup(body: SignupIn, request: Request):
    rate_limit(f"signup:{client_ip(request)}", 10, 3600)
    with db.tx() as cur:
        user = cur.execute(
            "INSERT INTO users (login_id, email, password_hash) VALUES (%s, %s, %s) "
            "ON CONFLICT DO NOTHING RETURNING id, login_id, email, role",
            (body.login_id, body.email, ph.hash(body.password)),
        ).fetchone()
    if not user:
        raise DomainError(409, "already_registered", "login_id or email already registered")
    return user  # role is always the column default ('staff'); managers are promoted server-side only


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response):
    rate_limit(f"login:ip:{client_ip(request)}", 20, 60)
    rate_limit(f"login:id:{body.login_id.lower()}", 5, 60)
    with db.tx() as cur:
        user = cur.execute(f"SELECT {USER_COLS} FROM users WHERE login_id = %s", (body.login_id,)).fetchone()
        try:
            ph.verify(user["password_hash"] if user else _DUMMY_HASH, body.password)
        except (VerifyMismatchError, InvalidHashError):
            user = None
        if not user:
            raise DomainError(401, "invalid_credentials", "Invalid login id or password")
        if ph.check_needs_rehash(user["password_hash"]):
            cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (ph.hash(body.password), user["id"]))
    set_auth_cookies(response, user)
    return user


@router.post("/refresh", response_model=UserOut)
def refresh(request: Request, response: Response):
    claims = decode_token(request.cookies.get("refresh_token"), "refresh")
    with db.tx() as cur:
        user = cur.execute(f"SELECT {USER_COLS} FROM users WHERE id = %s", (int(claims["sub"]),)).fetchone()
    if not user or user["token_version"] != claims["tv"]:
        raise DomainError(401, "unauthenticated", "Session revoked")
    set_auth_cookies(response, user)  # re-reads role from the DB, so promotions/demotions apply here
    return user


@router.post("/logout", response_model=MessageOut)
def logout(request: Request, response: Response):
    try:
        claims = decode_token(request.cookies.get("refresh_token"), "refresh")
        with db.tx() as cur:
            # ponytail: revokes every session of this user, not just this device. Add a refresh-token table if that matters.
            cur.execute("UPDATE users SET token_version = token_version + 1 WHERE id = %s", (int(claims["sub"]),))
    except DomainError:
        pass
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/auth")
    return {"message": "logged out"}


@router.get("/me", response_model=UserOut)
def me(user: dict = Depends(current_user)):
    with db.tx() as cur:
        row = cur.execute(f"SELECT {USER_COLS} FROM users WHERE id = %s", (user["id"],)).fetchone()
    if not row:
        raise DomainError(401, "unauthenticated", "User no longer exists")
    return row


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(body: ForgotPasswordIn, request: Request, background: BackgroundTasks):
    rate_limit(f"otp:ip:{client_ip(request)}", 20, 3600)
    rate_limit(f"otp:email:{body.email}", 5, 3600)
    with db.tx() as cur:
        user = cur.execute("SELECT id FROM users WHERE email = %s", (body.email,)).fetchone()
        if user:
            otp = generate_otp()
            cur.execute(
                "INSERT INTO password_resets (user_id, otp_hash, expires_at) VALUES (%s, %s, now() + %s)",
                (user["id"], hash_otp(otp), OTP_TTL),
            )
            background.add_task(send_otp, body.email, otp)  # after the response: no timing signal
    # Same response whether or not the email exists, so this can't be used to enumerate accounts.
    return {"message": "If that email is registered, an OTP has been sent"}


@router.post("/reset-password", response_model=MessageOut)
def reset_password(body: ResetPasswordIn, request: Request):
    rate_limit(f"reset:ip:{client_ip(request)}", 10, 3600)
    ok = False
    with db.tx() as cur:
        reset = cur.execute(
            "SELECT pr.id, pr.user_id, pr.otp_hash, pr.attempts FROM password_resets pr "
            "JOIN users u ON u.id = pr.user_id "
            "WHERE u.email = %s AND pr.used_at IS NULL AND pr.expires_at > now() "
            "ORDER BY pr.id DESC LIMIT 1 FOR UPDATE OF pr",
            (body.email,),
        ).fetchone()
        if reset and reset["attempts"] < OTP_MAX_ATTEMPTS:
            if hmac.compare_digest(reset["otp_hash"], hash_otp(body.otp)):
                cur.execute("UPDATE password_resets SET used_at = now() WHERE id = %s", (reset["id"],))
                cur.execute(
                    "UPDATE users SET password_hash = %s, token_version = token_version + 1 WHERE id = %s",
                    (ph.hash(body.new_password), reset["user_id"]),
                )
                ok = True
            else:
                cur.execute("UPDATE password_resets SET attempts = attempts + 1 WHERE id = %s", (reset["id"],))
    # Raised after commit so the failed-attempt counter sticks.
    if not ok:
        raise DomainError(400, "invalid_otp", "Invalid or expired OTP")
    return {"message": "password reset successful"}
