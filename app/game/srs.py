"""Flashcards on an SM-2 schedule (#51): the rule, the review queue, and
recording a grade.

The rule is a pure function of a card's previous schedule, the grade and
today, so it is unit-tested without a database (like streaks.compute):

- Four grades: Again, Hard, Good, Easy, which are SM-2's quality 1, 3, 4, 5.
  Again (below 3) is a failure; the other three are passes.
- A pass counts one more review in a row (reps). The interval is 1 day after
  the first, 6 after the second, then the previous interval times the ease,
  rounded. That's the ease the card had before this grade; the grade then
  adjusts it for next time.
- A failure resets reps and sets the interval to 1 day. It counts as a lapse
  when the card had been passed before; a new card that's failed isn't one.
- The ease starts at 2.5 and moves after EVERY grade by SM-2's formula,
  never below 1.3. (Original SM-2 leaves the ease alone on a failure. Lowering
  it means a card you keep forgetting comes back sooner after you relearn it.)

A card joins the queue when its module is complete. A card with no
card_state row is new, and due today. "Today" is streaks.today(), the date in
APP_TIMEZONE, so a card is due on the same calendar the streak keeps.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.content import Catalog, FlashCard
from app.models import CardState

Grade = Literal["again", "hard", "good", "easy"]
QUALITY: dict[str, int] = {"again": 1, "hard": 3, "good": 4, "easy": 5}
START_EASE = 2.5
MIN_EASE = 1.3


@dataclass(frozen=True)
class Schedule:
    ease: float
    interval_days: int
    reps: int
    lapses: int
    due_on: date


def review(previous: Schedule | None, grade: Grade, today: date) -> Schedule:
    """The schedule after grading a card today. `previous` is None for a new card."""
    q = QUALITY[grade]
    ease, interval, reps, lapses = (
        (previous.ease, previous.interval_days, previous.reps, previous.lapses) if previous else (START_EASE, 0, 0, 0)
    )
    if q < 3:
        lapses += 1 if reps else 0
        reps, interval = 0, 1
    else:
        reps += 1
        interval = 1 if reps == 1 else 6 if reps == 2 else round(interval * ease)
    ease = max(MIN_EASE, round(ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02), 4))
    return Schedule(ease, interval, reps, lapses, today + timedelta(days=interval))


# ---------------------------------------------------------------------------
# The queue and recording — every query is scoped to the user passed in.
# ---------------------------------------------------------------------------


def deck(catalog: Catalog, completed: set[str]) -> list[FlashCard]:
    """The learner's cards: every card of every completed module, in syllabus order."""
    return [card for card in catalog.cards().values() if card.module in completed]


def _states(db: Session, user_id: int) -> dict[str, CardState]:
    return {s.card_id: s for s in db.scalars(select(CardState).where(CardState.user_id == user_id))}


@dataclass(frozen=True)
class Queue:
    due: list[FlashCard]  # cards already reviewed and due again first (soonest first), then new ones
    next_due_on: date | None  # when the next card falls due, if none are due now


def queue(db: Session, user_id: int, catalog: Catalog, completed: set[str], today: date) -> Queue:
    states = _states(db, user_id)
    cards = deck(catalog, completed)
    again = sorted((c for c in cards if c.id in states and states[c.id].due_on <= today), key=lambda c: states[c.id].due_on)
    new = [c for c in cards if c.id not in states]
    later = [states[c.id].due_on for c in cards if c.id in states and states[c.id].due_on > today]
    return Queue(again + new, min(later) if later else None)


def record(db: Session, user_id: int, card_id: str, grade: Grade, today: date) -> bool:
    """Grade a card that's due; returns whether a review was recorded. A card
    that isn't due (a double submit, or an old tab) is left alone. The row is
    locked while it's read and updated, so two submits can't both count. The
    caller has checked the card is in the learner's deck, and commits."""
    state = db.scalar(
        select(CardState).where(CardState.user_id == user_id, CardState.card_id == card_id).with_for_update()
    )
    if state is None:
        new = review(None, grade, today)
        inserted = db.scalar(
            insert(CardState)
            .values(
                user_id=user_id, card_id=card_id, ease=new.ease, interval_days=new.interval_days,
                due_on=new.due_on, reps=new.reps, lapses=new.lapses, last_reviewed_on=today,
            )
            .on_conflict_do_nothing(index_elements=["user_id", "card_id"])
            .returning(CardState.id)
        )
        return inserted is not None
    if state.due_on > today:
        return False
    previous = Schedule(state.ease, state.interval_days, state.reps, state.lapses, state.due_on)
    new = review(previous, grade, today)
    state.ease, state.interval_days, state.reps, state.lapses, state.due_on = (
        new.ease, new.interval_days, new.reps, new.lapses, new.due_on,
    )
    state.last_reviewed_on = today
    return True
