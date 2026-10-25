"""The admin panel's queries (#281): every learner with their progress,
wiping one learner's progress (all of it, or one module or unit: #284), and
creating an account (#282).

The one place that reads another user's learner state. Each function names its
target user explicitly, and only routes behind require_admin call them, so
non-negotiable #1 still holds: a learner's own pages never see anyone else.
"""

from collections.abc import Collection
from dataclasses import dataclass

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from app.models import ActivityDay, BadgeEarned, CardState, ExerciseAttempt, ModuleProgress, User, XpEvent
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


def reset_modules(db: Session, user_id: int, slugs: Collection[str]) -> None:
    """Delete the user's rows for these modules only, so they play as if never
    opened: progress, attempts, review cards and every XP row they earned. An
    XP ref names its module first ("<slug>", "<slug>/<item>" for a hint), except
    a card review's, "<day>/<slug>/<card>"; a card id is "<slug>/<card>".
    Badges and streak days stay: a badge earned is history, and the day
    happened. The caller commits."""
    slugs = list(slugs)
    db.execute(delete(ModuleProgress).where(ModuleProgress.user_id == user_id, ModuleProgress.module_slug.in_(slugs)))
    db.execute(delete(ExerciseAttempt).where(ExerciseAttempt.user_id == user_id, ExerciseAttempt.module_slug.in_(slugs)))
    db.execute(delete(CardState).where(CardState.user_id == user_id, func.split_part(CardState.card_id, "/", 1).in_(slugs)))
    db.execute(
        delete(XpEvent).where(
            XpEvent.user_id == user_id,
            or_(
                and_(XpEvent.reason != "card_review", func.split_part(XpEvent.ref, "/", 1).in_(slugs)),
                and_(XpEvent.reason == "card_review", func.split_part(XpEvent.ref, "/", 2).in_(slugs)),
            ),
        )
    )


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
