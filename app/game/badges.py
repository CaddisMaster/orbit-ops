"""Badges: which ones a learner qualifies for, and recording them.

A badge's definition (name, emblem, rule) lives in syllabus.yml. Its rule names
one of the evaluators below, so content chooses the rule and its argument but
can't run code. A new kind of badge (v0.5.0's labs and hints) is a new rule
model in app/content/schema.py plus a case in qualifies().

Earning is idempotent: (user_id, badge_slug) is unique in badges_earned and
award() inserts with ON CONFLICT DO NOTHING, so a rule satisfied again, or a
double submit, never records a duplicate or announces it twice.

Every rule is checked against the learner's whole state, not just the event
that triggered the check. A unit finished before badges existed is therefore
earned at the next completion.
"""

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.content import Catalog
from app.content.schema import BadgeSpec, FirstPerfectQuizRule, StreakRule, UnitCompleteRule
from app.models import BadgeEarned, ModuleProgress
from app.progress import unit_complete


@dataclass(frozen=True)
class Facts:
    """What the rules look at."""

    completed: set[str]  # completed module slugs
    streak: int  # the current streak's length in days
    perfect_quiz: bool  # some module was completed with a 100% quiz


def qualifies(catalog: Catalog, badge: BadgeSpec, facts: Facts) -> bool:
    match badge.rule:
        case UnitCompleteRule(unit_complete=unit):
            return unit_complete(catalog, unit, facts.completed)
        case StreakRule(streak=days):
            return facts.streak >= days
        case FirstPerfectQuizRule():
            return facts.perfect_quiz
    return False


def qualifying(catalog: Catalog, facts: Facts) -> list[BadgeSpec]:
    return [b for b in catalog.badges if qualifies(catalog, b, facts)]


# ---------------------------------------------------------------------------
# Persistence — every query is scoped to the user passed in. The caller commits.
# ---------------------------------------------------------------------------


def has_perfect_quiz(db: Session, user_id: int) -> bool:
    return db.scalar(
        select(ModuleProgress.id)
        .where(ModuleProgress.user_id == user_id, ModuleProgress.status == "complete", ModuleProgress.score == 100)
        .limit(1)
    ) is not None


def award(db: Session, user_id: int, catalog: Catalog, facts: Facts) -> list[BadgeSpec]:
    """Record every badge the learner now qualifies for; returns the ones that
    are new, in syllabus order."""
    new = []
    for badge in qualifying(catalog, facts):
        inserted = db.scalar(
            insert(BadgeEarned)
            .values(user_id=user_id, badge_slug=badge.slug)
            .on_conflict_do_nothing(index_elements=["user_id", "badge_slug"])
            .returning(BadgeEarned.id)
        )
        if inserted is not None:
            new.append(badge)
    return new


def earned(db: Session, user_id: int) -> dict[str, datetime]:
    """{badge_slug: earned_at} for the learner, most recent first."""
    rows = db.execute(
        select(BadgeEarned.badge_slug, BadgeEarned.earned_at)
        .where(BadgeEarned.user_id == user_id)
        .order_by(BadgeEarned.earned_at.desc(), BadgeEarned.id.desc())
    )
    return dict(rows.all())


@dataclass(frozen=True)
class Shelf:
    """A badge as a page shows it."""

    badge: BadgeSpec
    earned_on: date | None  # in APP_TIMEZONE; None while locked


def recent(catalog: Catalog, held: dict[str, datetime], tz, limit: int = 3) -> list[Shelf]:
    """The most recently earned badges that the syllabus still defines."""
    by_slug = {b.slug: b for b in catalog.badges}
    shelf = [Shelf(by_slug[s], at.astimezone(tz).date()) for s, at in held.items() if s in by_slug]
    return shelf[:limit]


def shelf(catalog: Catalog, held: dict[str, datetime], tz) -> list[Shelf]:
    """Every badge in syllabus order, earned or not."""
    return [
        Shelf(b, held[b.slug].astimezone(tz).date() if b.slug in held else None) for b in catalog.badges
    ]
