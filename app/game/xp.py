"""The XP ledger: what earns XP, recording it, and the total.

Awards are idempotent: (user_id, reason, ref) is unique in xp_events, and
award() inserts with ON CONFLICT DO NOTHING, so a re-answered quiz or a double
submit never pays twice. That guarantee lives in the database, not in an
"already awarded?" check that two requests could both pass.
"""

from datetime import date
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.content import Module
from app.models import XpEvent

PERFECT_QUIZ_BONUS = 20
REVIEW_XP = 2  # per flashcard review (#52)
REVIEW_XP_DAILY_CAP = 20  # so 10 reviews a day pay; more are still worth doing
_REVIEW_LOCK = 52  # pg_advisory_xact_lock namespace: one learner's review awards, one at a time


class Award(NamedTuple):
    amount: int
    reason: str
    ref: str


def completion_awards(module: Module, score: int) -> list[Award]:
    """What completing `module` with `score` (percent, first attempts) earns."""
    awards = []
    if module.xp:  # a module may be worth 0; the ledger has no zero rows
        awards.append(Award(module.xp, "module_complete", module.slug))
    if score == 100:
        awards.append(Award(PERFECT_QUIZ_BONUS, "perfect_quiz", module.slug))
    return awards


def award(db: Session, user_id: int, award: Award) -> int:
    """Record `award` for the user; returns the XP actually added (0 if it was
    already recorded). The caller commits."""
    inserted = db.scalar(
        insert(XpEvent)
        .values(user_id=user_id, amount=award.amount, reason=award.reason, ref=award.ref)
        .on_conflict_do_nothing(index_elements=["user_id", "reason", "ref"])
        .returning(XpEvent.amount)
    )
    return inserted or 0


def total_xp(db: Session, user_id: int) -> int:
    return db.scalar(select(func.coalesce(func.sum(XpEvent.amount), 0)).where(XpEvent.user_id == user_id))


def review_award(db: Session, user_id: int, card_id: str, day: date) -> int:
    """Pay for one flashcard review on `day`, up to the daily cap; returns the
    XP added. The ref is "<day>/<card id>", so the same card can't be paid
    twice in a day. The cap is checked under a per-learner transaction lock,
    so two reviews arriving together can't both slip under it. The caller commits."""
    db.execute(select(func.pg_advisory_xact_lock(_REVIEW_LOCK, user_id)))
    paid = db.scalar(
        select(func.coalesce(func.sum(XpEvent.amount), 0)).where(
            XpEvent.user_id == user_id, XpEvent.reason == "card_review", XpEvent.ref.startswith(f"{day.isoformat()}/")
        )
    )
    amount = min(REVIEW_XP, REVIEW_XP_DAILY_CAP - paid)
    if amount <= 0:
        return 0
    return award(db, user_id, Award(amount, "card_review", f"{day.isoformat()}/{card_id}"))
