"""ORM models. Lesson content lives in files (content/), not here — the database
stores only the learner's state, keyed by stable content slugs."""

import secrets
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Float, ForeignKey, Index, String, UniqueConstraint, false, func
from sqlalchemy.dialects.postgresql import JSONB
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


class ModuleProgress(Base):
    """One row per module the learner has opened. Whether a module is locked or
    available is NOT stored: it is derived from the catalog's order and
    prerequisites plus which modules are complete (app/progress.py)."""

    __tablename__ = "module_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "module_slug"),
        CheckConstraint("status IN ('in_progress', 'complete')", name="module_progress_status"),
        CheckConstraint("score IS NULL OR score BETWEEN 0 AND 100", name="module_progress_score"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    module_slug: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="in_progress")
    score: Mapped[int | None]  # percent of quiz questions right on the first try
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ExerciseAttempt(Base):
    """Every answer submitted, kept as history. For quizzes, the FIRST attempt
    at each question is the one that counts towards the score."""

    __tablename__ = "exercise_attempts"
    __table_args__ = (Index("ix_exercise_attempts_user_module", "user_id", "module_slug"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    module_slug: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16))  # "quiz" now; "challenge", "lab" later
    item: Mapped[int]  # question index within the module's quiz
    submitted: Mapped[list] = mapped_column(JSONB)
    correct: Mapped[bool]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class XpEvent(Base):
    """The XP ledger: one row per award (or, later, penalty). Totals, levels and
    ranks are always summed from here and never stored, so every point can be
    traced to what earned it. (reason, ref) is unique per user, which is what
    makes an award idempotent: the database refuses to pay twice."""

    __tablename__ = "xp_events"
    __table_args__ = (
        UniqueConstraint("user_id", "reason", "ref"),
        CheckConstraint("amount <> 0", name="xp_events_amount_nonzero"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    amount: Mapped[int]  # negative for penalties (hints, v0.6.0)
    reason: Mapped[str] = mapped_column(String(32))  # "module_complete", "perfect_quiz", …
    ref: Mapped[str] = mapped_column(String(128))  # what earned it, e.g. the module slug
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ActivityDay(Base):
    """One row per calendar day (in APP_TIMEZONE) the streak counts: a day with
    activity, or a missed day bridged by a freeze (freeze_used). The streak
    itself, and the freezes banked, are derived from these rows and never
    stored (app/game/streaks.py)."""

    __tablename__ = "activity_days"
    __table_args__ = (UniqueConstraint("user_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    freeze_used: Mapped[bool] = mapped_column(default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BadgeEarned(Base):
    """One row per badge a learner holds. Badge definitions live in content
    (syllabus.yml), so this stores only the slug. Unique on (user_id,
    badge_slug), which makes earning idempotent: a rule satisfied twice is a
    no-op insert."""

    __tablename__ = "badges_earned"
    __table_args__ = (UniqueConstraint("user_id", "badge_slug"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    badge_slug: Mapped[str] = mapped_column(String(64))
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CardState(Base):
    """A learner's SM-2 schedule for one flashcard (#51). Cards live in content,
    so this stores only the card's id, "<module-slug>/<card-id>". A card with no
    row is new and due today; the first review creates the row. Rows for cards
    that have left the curriculum are ignored, never deleted."""

    __tablename__ = "card_state"
    __table_args__ = (
        UniqueConstraint("user_id", "card_id"),
        CheckConstraint("ease >= 1.3", name="card_state_ease_floor"),
        CheckConstraint("interval_days >= 1", name="card_state_interval_positive"),
        CheckConstraint("reps >= 0 AND lapses >= 0", name="card_state_counts"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    card_id: Mapped[str] = mapped_column(String(160))
    ease: Mapped[float] = mapped_column(Float)  # SM-2's easiness factor: 2.5 to start, never below 1.3
    interval_days: Mapped[int]
    due_on: Mapped[date] = mapped_column(Date)  # in APP_TIMEZONE, like activity_days
    reps: Mapped[int] = mapped_column(default=0, server_default="0")  # successful reviews in a row
    lapses: Mapped[int] = mapped_column(default=0, server_default="0")  # times it was forgotten
    last_reviewed_on: Mapped[date] = mapped_column(Date)
