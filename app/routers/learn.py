"""The curriculum pages: the syllabus, the station map, modules, and answering
quiz questions."""

from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from app import comms, progress, station_map, terminal
from app.console import Readout, console_readout
from app.content import Catalog, Module, get_catalog
from app.db import get_db
from app.flash import flash
from app.game import badges, streaks, xp
from app.game.levels import standing
from app.models import ExerciseAttempt, User
from app.security import require_user
from app.templating import templates

router = APIRouter()


@router.get("/syllabus", response_class=HTMLResponse)
def syllabus(
    request: Request,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
    console: Readout = Depends(console_readout),
):
    completed = progress.completed_slugs(db, user.id)
    return templates.TemplateResponse(
        request,
        "syllabus.html",
        {
            "user": user, "console": console,
            "catalog": catalog,
            "completed": completed,
            "available": lambda slug: progress.module_available(catalog, slug, completed),
        },
    )


@router.get("/map", response_class=HTMLResponse)
def station(
    request: Request,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
    console: Readout = Depends(console_readout),
):
    completed = progress.completed_slugs(db, user.id)
    return templates.TemplateResponse(
        request, "map.html", {"user": user, "console": console, "station": station_map.layout(catalog, completed)}
    )


def _module_or_404(catalog: Catalog, slug: str) -> Module:
    module = catalog.modules.get(slug)
    if module is None:
        raise HTTPException(status_code=404)
    return module


@router.get("/modules/{slug}", response_class=HTMLResponse)
def module_page(
    slug: str,
    request: Request,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
    console: Readout = Depends(console_readout),
):
    module = _module_or_404(catalog, slug)
    completed = progress.completed_slugs(db, user.id)
    if not progress.module_available(catalog, slug, completed):
        flash(request, f"“{module.title}” is still locked. {progress.blocker(catalog, slug, completed)}")
        return RedirectResponse("/", status_code=303)

    record = progress.start_module(db, user.id, slug)
    db.commit()
    unit = catalog.units[module.unit]
    return templates.TemplateResponse(
        request,
        "module.html",
        {
            "user": user, "console": console,
            "module": module,
            "unit": unit,
            "track": next(t for t in catalog.tracks if t.slug == module.track),
            "unit_size": len(unit.modules),
            "answers": progress.first_attempts(db, user.id, slug),
            "record": record,
            "next": progress.next_module(catalog, slug, completed) if record.status == "complete" else None,
            "terminal_spec": terminal.client_spec(module.terminal) if module.terminal else None,
        },
    )


@router.post("/modules/{slug}/terminal")
def terminal_report(
    slug: str,
    report: terminal.Report,
    request: Request,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
):
    """The station console reporting the filesystem it ended with. The verdict
    recorded is the server's, from this module's checks (app/terminal.py)."""
    module = _module_or_404(catalog, slug)
    if module.terminal is None:
        raise HTTPException(status_code=404)
    if not progress.module_available(catalog, slug, progress.completed_slugs(db, user.id)):
        return JSONResponse({"error": "locked"}, status_code=403)
    correct = terminal.grade(module.terminal, report.state, report.cwd, report.processes)
    first_pass = correct and slug not in comms.console_passed(db, user.id)
    db.add(
        ExerciseAttempt(
            user_id=user.id,
            module_slug=slug,
            kind="terminal",
            item=0,
            submitted={
                "claimed": report.passed,
                "cwd": report.cwd,
                "processes": [p.model_dump() for p in report.processes],
                "state": {p: n.model_dump() for p, n in report.state.items()},
            },
            correct=correct,
        )
    )
    db.commit()
    body = {"correct": correct}
    if first_pass and module.comms and module.comms.console_done:
        # The first time the task passes, the crew answers on the comms log (#38).
        body["comms"] = templates.get_template("partials/_comms_lines.html").render(
            lines=comms.beat(catalog, module, "console_done", new=True), request=request
        )
    return JSONResponse(body)


@router.post("/modules/{slug}/quiz/{index}", response_class=HTMLResponse)
def answer_question(
    slug: str,
    index: int,
    request: Request,
    answer: Annotated[list[str] | None, Form()] = None,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
):
    module = _module_or_404(catalog, slug)
    if not 0 <= index < len(module.quiz):
        raise HTTPException(status_code=404)
    completed = progress.completed_slugs(db, user.id)
    if not progress.module_available(catalog, slug, completed):
        flash(request, f"“{module.title}” is still locked. {progress.blocker(catalog, slug, completed)}")
        return Response(status_code=403, headers={"HX-Redirect": "/"})

    question = module.quiz[index]
    answer = [a[:200] for a in (answer or [])[:10]]  # bound what gets stored
    correct = progress.check_answer(question, answer)
    context = {"module": module, "question": question, "index": index}
    if correct is None:
        # 200, not 422: htmx does not swap 4xx responses by default, so a 422
        # here would leave the button doing nothing visible (found in-browser).
        return templates.TemplateResponse(
            request, "partials/_question.html", {**context, "error": "Choose an answer first."}
        )

    result = progress.record_answer(db, user.id, module, index, answer, correct)
    record = progress.get_progress(db, user.id, slug)
    xp_gained, promoted_to, new_badges, arrivals, window_event = 0, None, [], [], None
    if result.just_completed:
        # Same transaction as the completion: all of it lands or none does.
        streaks.mark_active(db, user.id, streaks.today())
        before = standing(xp.total_xp(db, user.id), catalog.ranks)
        xp_gained = sum(xp.award(db, user.id, a) for a in xp.completion_awards(module, record.score))
        after = standing(before.xp + xp_gained, catalog.ranks)
        if after.rank != before.rank:
            promoted_to = after.rank
        facts = badges.Facts(
            completed=progress.completed_slugs(db, user.id),  # autoflush: includes this module
            streak=streaks.current_streak(db, user.id, streaks.today()).length,
            perfect_quiz=badges.has_perfect_quiz(db, user.id),
        )
        new_badges = badges.award(db, user.id, catalog, facts)
        if module.comms:
            arrivals = comms.beat(catalog, module, "complete", new=True)
            window_event = module.comms.window.get("complete")
    db.commit()
    completed = progress.completed_slugs(db, user.id)
    return templates.TemplateResponse(
        request,
        "partials/_answered.html",
        {
            **context,
            "attempt": result.attempt,
            "just_completed": result.just_completed,
            "record": record,
            "xp_gained": xp_gained,
            "promoted_to": promoted_to,
            "new_badges": new_badges,
            "arrivals": arrivals,
            "window_event": window_event,
            "next": progress.next_module(catalog, slug, completed) if result.just_completed else None,
        },
    )
