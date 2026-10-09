"""The XP ledger: what earns XP, recording it, and the total.

Awards are idempotent: (user_id, reason, ref) is unique in xp_events, and
award() inserts with ON CONFLICT DO NOTHING, so a re-answered quiz or a double
submit never pays twice. That guarantee lives in the database, not in an
"already awarded?" check that two requests could both pass.
"""

from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.content import Module
from app.models import XpEvent

PERFECT_QUIZ_BONUS = 20


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
