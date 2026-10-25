"""The admin panel's queries (#281): every learner with their progress,
wiping one learner's progress, creating an account (#282), and the read-only
AI spend and system pages (#285).

The one place that reads another user's learner state. Each function names its
target user explicitly, and only routes behind require_admin call them, so
non-negotiable #1 still holds: a learner's own pages never see anyone else.
"""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app import spend
from app.models import ActivityDay, AiRequest, BadgeEarned, CardState, ExerciseAttempt, ModuleProgress, User, XpEvent
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


def new_account_problem(db: Session, username: str, password: str, repeat: str) -> str | None:
    """What stops this account being created, or None. The same rules as
    scripts/create_user.py."""
    if not username:
        return "Give the account a username."
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"The password must be at least {PASSWORD_MIN_LENGTH} characters."
    if password != repeat:
        return "The two passwords don't match."
    if db.scalar(select(User.id).where(User.username == username)) is not None:
        return f"There is already an account called {username}."
    return None


def create_account(db: Session, username: str, password: str, *, is_admin: bool) -> User:
    """Add the account; the caller checks new_account_problem first and commits."""
    user = User(username=username, password_hash=hash_password(password), is_admin=is_admin)
    db.add(user)
    db.flush()
    return user


def month_requests(db: Session, now: datetime) -> list[tuple[AiRequest, str | None]]:
    """This month's AI calls, newest first, each with its user's name (None once
    the user is deleted: the row stays, #120). The month is spend's month."""
    start, end = spend.month_bounds(now)
    rows = db.execute(
        select(AiRequest, User.username)
        .outerjoin(User, User.id == AiRequest.user_id)
        .where(AiRequest.created_at >= start, AiRequest.created_at < end)
        .order_by(AiRequest.created_at.desc(), AiRequest.id.desc())
    )
    return [(row, name) for row, name in rows]


_ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def code_head() -> str:
    """The newest revision this image's migrations define."""
    return ScriptDirectory.from_config(Config(str(_ALEMBIC_INI))).get_current_head()


def database_revision(db: Session) -> str | None:
    """The revision the database is at, or None when this connection may not
    read it. In production the app connects as orbit_app, which 0002 keeps away
    from alembic_version on purpose."""
    if not db.scalar(text("SELECT has_table_privilege(current_user, 'alembic_version', 'SELECT')")):
        return None
    return db.scalar(text("SELECT version_num FROM alembic_version"))


def table_counts(db: Session) -> dict[str, int]:
    """Rows in each learner-state table, over every learner."""
    return {m.__tablename__: db.scalar(select(func.count()).select_from(m)) for m in LEARNER_STATE}
