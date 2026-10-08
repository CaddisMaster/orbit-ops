"""ORM models. Lesson content lives in files (content/), not here — the database
stores only the learner's state, keyed by stable content slugs."""

import secrets
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # Copied into the session cookie at login and compared on every request.
    # Rotating it (password change, "log out everywhere") invalidates every
    # existing session at once — the same idea as Budget Buddy's sql/37.
    session_token: Mapped[str] = mapped_column(String(64), default=new_session_token)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
