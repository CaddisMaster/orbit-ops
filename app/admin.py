"""The admin panel's queries (#281): every learner with their progress,
wiping one learner's progress, creating an account (#282), and managing one:
a new password, logging it out everywhere, deleting it, its progress as JSON (#283).

The one place that reads another user's learner state. Each function names its
target user explicitly, and only routes behind require_admin call them, so
non-negotiable #1 still holds: a learner's own pages never see anyone else.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import (
    ActivityDay,
    BadgeEarned,
    CardState,
    ExerciseAttempt,
    ModuleProgress,
    User,
    XpEvent,
    new_session_token,
)
from app.security import PASSWORD_MIN_LENGTH, hash_password

# Everything a reset clears. Not users (the login stays) and not ai_requests:
# money spent stays spent, and the monthly budget is summed from it.
LEARNER_STATE = (ExerciseAttempt, ModuleProgress, XpEvent, ActivityDay, BadgeEarned, CardState)


@dataclass(frozen=True)
class Learner:
    user: User
    completed: int
    xp: int


def learners(db: Session) -> list[Learner]:
    completed = (
        select(func.count())
        .where(ModuleProgress.user_id == User.id, ModuleProgress.status == "complete")
        .scalar_subquery()
    )
    xp = select(func.coalesce(func.sum(XpEvent.amount), 0)).where(XpEvent.user_id == User.id).scalar_subquery()
    rows = db.execute(select(User, completed, xp).order_by(User.id))
    return [Learner(user, done, total) for user, done, total in rows]


def reset_progress(db: Session, user_id: int) -> None:
    """Delete the user's rows from every learner-state table, as if they had
    never played. The caller commits, so it's one transaction: all or nothing."""
    for model in LEARNER_STATE:
        db.execute(delete(model).where(model.user_id == user_id))


def password_problem(password: str, repeat: str) -> str | None:
    """What's wrong with a new password, or None. The same rule as
    scripts/create_user.py."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"The password must be at least {PASSWORD_MIN_LENGTH} characters."
    if password != repeat:
        return "The two passwords don't match."
    return None


def new_account_problem(db: Session, username: str, password: str, repeat: str) -> str | None:
    """What stops this account being created, or None."""
    if not username:
        return "Give the account a username."
    if problem := password_problem(password, repeat):
        return problem
    if db.scalar(select(User.id).where(User.username == username)) is not None:
        return f"There is already an account called {username}."
    return None


def create_account(db: Session, username: str, password: str, *, is_admin: bool) -> User:
    """Add the account; the caller checks new_account_problem first and commits."""
    user = User(username=username, password_hash=hash_password(password), is_admin=is_admin)
    db.add(user)
    db.flush()
    return user


def set_password(user: User, password: str) -> None:
    """A new password, and a new session token, so every existing session of
    theirs ends: what create_user.py's reset does. The caller commits."""
    user.password_hash = hash_password(password)
    user.session_token = new_session_token()


def log_out_everywhere(user: User) -> None:
    """End every session of theirs; the password is unchanged. The caller commits."""
    user.session_token = new_session_token()


def _jsonable(value):
    return value.isoformat() if isinstance(value, (date, datetime)) else value


def progress_export(db: Session, user: User) -> dict:
    """Their rows from every learner-state table, for keeping before a reset.
    Never the users row: no password hash, no session token."""
    tables = {}
    for model in LEARNER_STATE:
        columns = [c.name for c in model.__table__.columns if c.name not in ("id", "user_id")]
        rows = db.scalars(select(model).where(model.user_id == user.id).order_by(model.id))
        tables[model.__tablename__] = [{c: _jsonable(getattr(row, c)) for c in columns} for row in rows]
    return {"username": user.username, "exported_at": datetime.now(UTC).isoformat(), "tables": tables}
