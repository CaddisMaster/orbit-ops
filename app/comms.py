"""The comms log on the desk's monitor (#38): every message the cast has sent
you, in the order the beats happened.

Nothing about it is stored. The log is rebuilt on each request from what the
learner has done: for every completed module, in the order it was completed,
its `open`, `console_done` (if its console task passed) and `complete`
messages. On a module page the module being worked on adds its `open` beat,
and `console_done` once that has passed.

Messages that arrive on this page view are marked `new`, and static/js/
comms.js reveals those one at a time. A briefing is new on the first visit
(no progress row yet); console_done and complete arrive with the responses
that earn them (routers/learn.py).
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import Catalog, Module
from app.content.schema import CastSpec
from app.models import ExerciseAttempt, ModuleProgress

BEATS = ("open", "console_done", "complete")


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
    lines: list[Line] = []
    seen = set()
    for slug, status, _ in progress:
        module = catalog.modules.get(slug)
        if status != "complete" or module is None or not module.comms:
            continue
        seen.add(slug)
        lines += beat(catalog, module, "open")
        if slug in passed:
            lines += beat(catalog, module, "console_done")
        lines += beat(catalog, module, "complete")
    module = catalog.modules.get(current) if current else None
    if module and module.comms and current not in seen:
        first_visit = not any(slug == current for slug, _, _ in progress)
        lines += beat(catalog, module, "open", new=first_visit)
        if current in passed:
            lines += beat(catalog, module, "console_done")
    return lines
