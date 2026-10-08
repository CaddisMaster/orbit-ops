"""Passwords, sessions, CSRF, rate limiting and security headers.

The Flask originals in Budget Buddy are Flask-Bcrypt, Flask-Login, Flask-WTF and
Flask-Limiter. FastAPI has no blessed equivalent for most of these, and each is
small enough to own outright — which is also the point of building this app.
"""

import hmac
import secrets
import time
from collections import defaultdict, deque

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.db import get_db
from app.models import User

# ---------------------------------------------------------------------------
# Passwords — argon2id, the current OWASP recommendation. No 72-byte truncation
# to worry about, unlike bcrypt.
# ---------------------------------------------------------------------------
_hasher = PasswordHasher()
# Verified against when the username does not exist, so a miss costs the same
# time as a wrong password and response timing cannot enumerate usernames.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


# ---------------------------------------------------------------------------
# Sessions. The signed cookie (Starlette SessionMiddleware) carries the user id
# and that user's session_token; both must match the row on every request.
# ---------------------------------------------------------------------------
class LoginRequired(Exception):
    """Raised by require_user; app.main turns it into a redirect to /login."""


def login_session(request: Request, user: User) -> None:
    request.session.clear()  # fresh session on login: no fixation
    request.session["uid"] = user.id
    request.session["tok"] = user.session_token
    request.session["csrf"] = secrets.token_urlsafe(32)


def current_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    uid, tok = request.session.get("uid"), request.session.get("tok")
    if uid is None or tok is None:
        return None
    user = db.scalar(select(User).where(User.id == uid))
    if user is None or not hmac.compare_digest(user.session_token, tok):
        request.session.clear()
        return None
    return user


def require_user(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise LoginRequired
    return user


# ---------------------------------------------------------------------------
# CSRF — a per-session token, sent back either as the X-CSRF-Token header
# (HTMX: set once via hx-headers on <body>, as in Budget Buddy) or as a
# `csrf_token` form field (plain forms). Applied app-wide as a dependency.
# ---------------------------------------------------------------------------
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class CSRFError(Exception):
    pass


def csrf_token(request: Request) -> str:
    token = request.session.get("csrf")
    if token is None:
        token = request.session["csrf"] = secrets.token_urlsafe(32)
    return token


async def csrf_protect(request: Request) -> None:
    if request.method in SAFE_METHODS:
        return
    expected = request.session.get("csrf")
    sent = request.headers.get("x-csrf-token")
    if sent is None and request.headers.get("content-type", "").startswith(
        ("application/x-www-form-urlencoded", "multipart/form-data")
    ):
        # Starlette caches the parsed form on the request, so the route's own
        # Form() parameters still see it after this read.
        sent = (await request.form()).get("csrf_token")
    if not expected or not isinstance(sent, str) or not hmac.compare_digest(expected, sent):
        raise CSRFError


# ---------------------------------------------------------------------------
# Rate limiting — a sliding window in process memory. Correct only because the
# app runs as ONE process (see the Dockerfile CMD); that is also why there is
# no Redis container, unlike Budget Buddy.
# ---------------------------------------------------------------------------
class RateLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str) -> bool:
        """Record an attempt; False if it is over the limit."""
        now = time.monotonic()
        hits = self._hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()


login_limiter = RateLimiter(get_settings().login_rate_limit)


def client_ip(request: Request) -> str:
    # uvicorn --proxy-headers has already replaced this with Nginx's
    # X-Forwarded-For, and the port is bound to 127.0.0.1 so only Nginx can
    # reach it to set that header.
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------
# HEAD → GET. Starlette's plain routes answer HEAD for every GET route, but
# FastAPI's APIRoute does not, so HEAD /healthz was a 405 (#9) — and uptime
# monitors and link checkers use HEAD. Serve it as the GET and drop the body:
# same status, same headers (Content-Length included), which is what HEAD means.
# A pure ASGI middleware rather than BaseHTTPMiddleware: it only rewrites the
# scope and filters messages, so it never buffers a response.
# ---------------------------------------------------------------------------
class HeadAsGetMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "HEAD":
            await self.app(scope, receive, send)
            return

        async def send_without_body(message):
            if message["type"] == "http.response.body":
                message = {**message, "body": b""}
            await send(message)

        await self.app({**scope, "method": "GET"}, receive, send_without_body)


# ---------------------------------------------------------------------------
# Security headers, with a fresh CSP nonce per request for inline scripts.
# ---------------------------------------------------------------------------
def build_csp(nonce: str) -> str:
    return "; ".join(
        [
            "default-src 'self'",
            f"script-src 'self' 'nonce-{nonce}'",
            "style-src 'self'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        nonce = secrets.token_urlsafe(16)
        request.state.csp_nonce = nonce
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = build_csp(nonce)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if get_settings().cookie_secure:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
