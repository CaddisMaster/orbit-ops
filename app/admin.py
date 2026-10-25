"""The admin panel's queries (#281): every learner with their progress, and
wiping one learner's progress.

The one place that reads another user's learner state. Each function names its
target user explicitly, and only routes behind require_admin call them, so
non-negotiable #1 still holds: a learner's own pages never see anyone else.
"""

from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import ActivityDay, BadgeEarned, CardState, ExerciseAttempt, ModuleProgress, User, XpEvent

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
