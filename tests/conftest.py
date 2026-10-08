"""Shared fixtures. The database is a real Postgres (test.sh / CI create a fresh
one and run `alembic upgrade head`); nothing here mocks SQL.

Parallel-safe by construction: every test that needs a user makes its own,
with a unique username, and deletes it afterwards.
"""

import os
import re
import uuid

# Must be set before app.config is first imported (Settings is cached).
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app import security
from app.db import SessionLocal
from app.main import app
from app.models import User
from app.security import hash_password, login_limiter

# argon2's production parameters spend 64 MiB per hash, on purpose. Eight xdist
# workers doing that at once blow through the container's memory limit and the
# suite's time budget, and no test is about hash strength (same trade as BB
# #384).
security._hasher = PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1)
security._DUMMY_HASH = security._hasher.hash("dummy")

PASSWORD = "correct horse battery staple"
_CSRF_RE = re.compile(r'name="csrf_token" value="([^"]+)"')


@pytest.fixture
def client():
    with TestClient(app, base_url="http://testserver") as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    login_limiter.reset()
    yield
    login_limiter.reset()


@pytest.fixture
def make_user():
    created: list[int] = []

    def _make(password: str = PASSWORD) -> User:
        with SessionLocal() as db:
            user = User(username=f"cadet-{uuid.uuid4().hex[:12]}", password_hash=hash_password(password))
            db.add(user)
            db.commit()
            created.append(user.id)
            return user

    yield _make
    with SessionLocal() as db:
        db.execute(delete(User).where(User.id.in_(created)))
        db.commit()


def csrf(client: TestClient) -> str:
    """The CSRF token of the client's current session, read the way a browser
    gets it: from a rendered form."""
    match = _CSRF_RE.search(client.get("/login").text)
    assert match, "login page did not render a csrf_token field"
    return match.group(1)


def login(client: TestClient, username: str, password: str = PASSWORD, follow_redirects: bool = False):
    return client.post(
        "/login",
        data={"username": username, "password": password, "csrf_token": csrf(client)},
        follow_redirects=follow_redirects,
    )


@pytest.fixture
def user(make_user):
    return make_user()


@pytest.fixture
def logged_in(client, user):
    response = login(client, user.username)
    assert response.status_code == 303
    return client
