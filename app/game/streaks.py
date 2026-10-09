"""The daily streak and its freezes, derived from activity_days.

Nothing runs at midnight (one uvicorn process, no scheduler). Instead the
streak is computed on request by compute(), a pure function of the learner's
rows and "today", and missed days that freezes can bridge are written back as
freeze_used rows the first time a request sees them. Because the rule is
deterministic, it doesn't matter which request that is.

Rules (docs/roadmap.md §5):
- A day is ACTIVE when a module was completed on it, in APP_TIMEZONE.
- The streak's length counts the active days in the current run. A frozen day
  keeps the run alive but does not add to it.
- Every 7th active day in a run banks a freeze, up to MAX_FREEZES.
- A gap of missed days before today is bridged only if the freezes banked
  cover ALL of it; otherwise the run (and its freezes) ends. Spending one
  freeze on a three-day gap would waste it without saving anything.
- Today, not yet active, is "pending", never a miss.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import ActivityDay

FREEZE_EVERY = 7
MAX_FREEZES = 2
_DAY = timedelta(days=1)


def _now() -> datetime:
    return datetime.now(UTC)  # a seam: tests pin the clock here


def today() -> date:
    """The current calendar date in APP_TIMEZONE, which is what a "day" means."""
    return _now().astimezone(get_settings().tz).date()


@dataclass(frozen=True)
class Streak:
    length: int  # active days in the current run, today included if done
    freezes: int  # banked, 0..MAX_FREEZES
    today_done: bool
    new_freezes: tuple[date, ...] = ()  # missed days this computation bridged


def compute(days: Mapping[date, bool], today: date) -> Streak:
    """`days` maps each recorded day to its freeze_used flag. Rows after
    `today` (only possible if APP_TIMEZONE moved west) are ignored."""
    length = freezes = 0
    new_freezes: list[date] = []

    def active() -> None:
        nonlocal length, freezes
        length += 1
        if length % FREEZE_EVERY == 0:
            freezes = min(MAX_FREEZES, freezes + 1)

    past = [d for d in days if d < today]
    day = min(past) if past else today
    while day < today:
        if day in days:
            if days[day]:
                freezes = max(0, freezes - 1)
            else:
                active()
            day += _DAY
            continue
        gap_end = day
        while gap_end < today and gap_end not in days:
            gap_end += _DAY
        gap = (gap_end - day).days
        if gap <= freezes:
            new_freezes += [day + _DAY * i for i in range(gap)]
            freezes -= gap
        else:
            length = freezes = 0
        day = gap_end

    today_done = days.get(today) is False
    if today_done:
        active()
    return Streak(length=length, freezes=freezes, today_done=today_done, new_freezes=tuple(new_freezes))


# ---------------------------------------------------------------------------
# Persistence — every query is scoped to the user passed in. The caller commits.
# ---------------------------------------------------------------------------


def mark_active(db: Session, user_id: int, day: date) -> None:
    db.execute(
        insert(ActivityDay)
        .values(user_id=user_id, day=day, freeze_used=False)
        .on_conflict_do_nothing(index_elements=["user_id", "day"])
    )


def peek(db: Session, user_id: int, day: date) -> Streak:
    """The learner's streak as of `day`, without recording anything."""
    rows = db.execute(select(ActivityDay.day, ActivityDay.freeze_used).where(ActivityDay.user_id == user_id))
    return compute(dict(rows.all()), day)


def current_streak(db: Session, user_id: int, day: date) -> Streak:
    """The learner's streak as of `day`, recording any freezes it spends."""
    streak = peek(db, user_id, day)
    for frozen in streak.new_freezes:
        db.execute(
            insert(ActivityDay)
            .values(user_id=user_id, day=frozen, freeze_used=True)
            .on_conflict_do_nothing(index_elements=["user_id", "day"])
        )
    return streak
