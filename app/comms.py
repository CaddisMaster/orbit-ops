"""The comms log on the desk's monitor (#38): every message the cast has sent
you, in the order the beats happened.

Nothing about it is stored. The log is rebuilt on each request from what the
learner has done: for every completed module, in the order it was completed,
its `open`, `console_done` (if its console task passed), `lab_done` (if its
lab passed, #121) and `complete` messages. On a module page the module being
worked on adds its `open` beat, and `console_done` / `lab_done` once passed.

Promotions and commendations join it too (#83): a rank's lines at the moment
the XP ledger first reached it, and a badge's at the moment it was earned. A
completion that also promotes and earns a badge happens in one transaction, so
all three share a timestamp (Postgres's now()); ties go debrief, then
promotion, then commendation.

Messages that arrive on this page view are marked `new`, and static/js/
comms.js reveals those one at a time. A briefing is new on the first visit
(no progress row yet); console_done, lab_done and complete arrive with the responses
that earn them (routers/learn.py).
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import lab as labs
from app.content import Catalog, Module
from app.content.schema import CastSpec
from app.game.levels import level_for, rank_for
from app.models import BadgeEarned, ExerciseAttempt, ModuleProgress, XpEvent

BEATS = ("open", "console_done", "lab_done", "complete")

# Each window event's sprite (app/static/img/, drawn by art/sprites.py) and its
# native size; style.css animates it under `.window-event.<event>`.
WINDOW_SPRITES = {
    "shuttle-dock": ("shuttle.png", 22, 7),
    "relay-pass": ("satellite.png", 20, 7),
    "debris-drift": ("debris.png", 40, 6),
    "aurora": ("aurora.png", 84, 126),
}


@dataclass(frozen=True)
class Line:
    who: CastSpec
    html: str
    beat: str
    module: str
    new: bool = False


def beat(catalog: Catalog, module: Module, name: str, new: bool = False) -> list[Line]:
    return [
        Line(who=catalog.cast[slug], html=html, beat=name, module=module.slug, new=new)
        for slug, html in module.comms_html.get(name, ())
    ]


def promotion(catalog: Catalog, rank: str, new: bool = False) -> list[Line]:
    return [
        Line(who=catalog.cast[slug], html=html, beat="promotion", module="", new=new)
        for slug, html in catalog.rank_comms.get(rank, ())
    ]


def commendation(catalog: Catalog, badge_slug: str, new: bool = False) -> list[Line]:
    return [
        Line(who=catalog.cast[slug], html=html, beat="commendation", module="", new=new)
        for slug, html in catalog.badge_comms.get(badge_slug, ())
    ]


def promotions(db: Session, user_id: int, catalog: Catalog) -> list[tuple[datetime, str]]:
    """(when, rank title) for each rank the learner has reached above the first,
    replaying the XP ledger. A rank counts once: dipping below it (a hint's cost)
    and climbing back isn't a second promotion."""
    reached: list[tuple[datetime, str]] = []
    total, best = 0, rank_for(1, catalog.ranks)
    titles = [r.title for r in catalog.ranks]
    for amount, at in db.execute(
        select(XpEvent.amount, XpEvent.created_at).where(XpEvent.user_id == user_id).order_by(XpEvent.created_at, XpEvent.id)
    ):
        total += amount
        rank = rank_for(level_for(total), catalog.ranks)
        if rank is not None and titles.index(rank) > titles.index(best):
            reached.append((at, rank))
            best = rank
    return reached


def recognition(catalog: Catalog, ranks: list[str], badge_slugs: list[str]) -> list[Line]:
    """What arrives with a response that promoted the learner or earned badges:
    each rank's lines, then each badge's, all new."""
    return [line for rank in ranks for line in promotion(catalog, rank, new=True)] + [
        line for slug in badge_slugs for line in commendation(catalog, slug, new=True)
    ]


def console_passed(db: Session, user_id: int) -> set[str]:
    """Modules whose console task this learner has passed (server-graded)."""
    rows = db.scalars(
        select(ExerciseAttempt.module_slug)
        .where(ExerciseAttempt.user_id == user_id, ExerciseAttempt.kind == "terminal", ExerciseAttempt.correct)
        .distinct()
    )
    return set(rows)


def history(db: Session, user_id: int, catalog: Catalog, current: str | None = None) -> list[Line]:
    progress = db.execute(
        select(ModuleProgress.module_slug, ModuleProgress.status, ModuleProgress.completed_at)
        .where(ModuleProgress.user_id == user_id)
        .order_by(ModuleProgress.completed_at.nulls_last(), ModuleProgress.id)
    ).all()
    passed = console_passed(db, user_id)
    labbed = labs.passed_slugs(db, user_id)
    # A completion's moment is its module_complete award's, which shares the
    # transaction's now() with any promotion or badge it brought.
    awarded = dict(
        db.execute(
            select(XpEvent.ref, XpEvent.created_at).where(XpEvent.user_id == user_id, XpEvent.reason == "module_complete")
        ).all()
    )
    timeline: list[tuple[datetime, int, list[Line]]] = []
    seen = set()
    for slug, status, completed_at in progress:
        module = catalog.modules.get(slug)
        if status != "complete" or module is None or not module.comms:
            continue
        seen.add(slug)
        lines = beat(catalog, module, "open")
        if slug in passed:
            lines += beat(catalog, module, "console_done")
        if slug in labbed:
            lines += beat(catalog, module, "lab_done")
        lines += beat(catalog, module, "complete")
        timeline.append((awarded.get(slug, completed_at), 0, lines))
    for at, rank in promotions(db, user_id, catalog):
        timeline.append((at, 1, promotion(catalog, rank)))
    for at, badge_slug in db.execute(
        select(BadgeEarned.earned_at, BadgeEarned.badge_slug).where(BadgeEarned.user_id == user_id)
    ):
        timeline.append((at, 2, commendation(catalog, badge_slug)))
    timeline.sort(key=lambda entry: entry[:2])  # stable: completions keep their order
    lines = [line for _, _, said in timeline for line in said]
    module = catalog.modules.get(current) if current else None
    if module and module.comms and current not in seen:
        first_visit = not any(slug == current for slug, _, _ in progress)
        lines += beat(catalog, module, "open", new=first_visit)
        if current in passed:
            lines += beat(catalog, module, "console_done")
        if current in labbed:
            lines += beat(catalog, module, "lab_done")
    return lines
