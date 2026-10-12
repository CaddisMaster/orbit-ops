"""The curriculum pages: the syllabus, the station map, modules, and answering
quiz questions."""

from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from app import challenge, comms, hints, lab, progress, spend, station_map, terminal
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

    first_visit = progress.get_progress(db, user.id, slug) is None
    record = progress.start_module(db, user.id, slug)
    db.commit()
    challenge_code, challenge_passed = challenge.editor_state(db, user.id, module) if module.challenge else ("", False)
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
            "challenge_spec": challenge.client_spec(module) if module.challenge else None,
            "challenge_code": challenge_code,
            "challenge_passed": challenge_passed,
            "challenge_xp": challenge.XP,
            "challenge_from": catalog.cast.get(module.challenge.from_) if module.challenge and module.challenge.from_ else None,
            "lab_state": lab.state(db, user.id, module) if module.lab else None,
            "hints_online": console.uplink,
            "lab_xp": lab.XP,
            "lab_from": catalog.cast.get(module.lab.from_) if module.lab and module.lab.from_ else None,
            # A window event at the `open` beat plays on the first visit only (#45).
            "window_event": module.comms.window.get("open") if module.comms and first_visit else None,
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
    if first_pass and module.comms and (event := module.comms.window.get("console_done")):
        body["window"] = templates.get_template("partials/_window_event.html").render(
            event=event, oob=False, request=request
        )
    return JSONResponse(body)


@router.post("/modules/{slug}/challenge")
def challenge_report(
    slug: str,
    report: challenge.Report,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
):
    """The page reporting a Submit: the code, and which checks passed in the
    browser. Recorded as the browser's verdict; the server never runs learner
    code (app/challenge.py). The first pass earns challenge.XP, once."""
    module = _module_or_404(catalog, slug)
    if module.challenge is None:
        raise HTTPException(status_code=404)
    if not progress.module_available(catalog, slug, progress.completed_slugs(db, user.id)):
        return JSONResponse({"error": "locked"}, status_code=403)
    correct = challenge.passed(module, report.results)
    db.add(
        ExerciseAttempt(
            user_id=user.id, module_slug=slug, kind="challenge", item=0,
            submitted={"code": report.code, "results": report.results}, correct=correct,
        )
    )
    xp_gained = xp.award(db, user.id, xp.Award(challenge.XP, "challenge", slug)) if correct else 0
    db.commit()
    return JSONResponse({"correct": correct, "xp_gained": xp_gained})


@router.post("/modules/{slug}/lab", response_class=HTMLResponse)
def lab_report(
    slug: str,
    request: Request,
    box: Annotated[list[str] | None, Form()] = None,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
):
    """Pasted output from a lab done on the learner's own machine (#121). The
    server checks the text (app/lab.py); nothing is run. The first pass earns
    lab.XP, the lab_done comms and any badge it completes, all in one transaction.
    Always 200 with the lab section re-rendered: htmx doesn't swap a 4xx."""
    module = _module_or_404(catalog, slug)
    if module.lab is None:
        raise HTTPException(status_code=404)
    completed = progress.completed_slugs(db, user.id)
    if not progress.module_available(catalog, slug, completed):
        flash(request, f"“{module.title}” is still locked. {progress.blocker(catalog, slug, completed)}")
        return Response(status_code=403, headers={"HX-Redirect": "/"})

    pastes = (box or [])[: len(module.lab.boxes)]
    context = {
        "module": module, "lab_xp": lab.XP, "lab_from": catalog.cast.get(module.lab.from_) if module.lab.from_ else None,
        "hints_online": spend.uplink_online(db),
    }
    if lab.too_long(pastes):
        # Refused before anything is recorded; the boxes keep what was pasted.
        state = lab.LabState(pastes=tuple(pastes), verdict=None, passed=slug in lab.passed_slugs(db, user.id))
        return templates.TemplateResponse(
            request, "partials/_lab.html",
            {**context, "lab_state": state, "error": f"That's more than {lab.MAX_PASTE:,} characters in one box. Paste only the output the step asks for."},
        )

    already = slug in lab.passed_slugs(db, user.id)
    verdict = lab.grade(module.lab, pastes)
    lab.record(db, user.id, module, pastes, verdict)
    first_pass = verdict.passed and not already
    xp_gained, new_badges, arrivals, window_event = 0, [], [], None
    if first_pass:
        xp_gained = xp.award(db, user.id, xp.Award(lab.XP, "lab", slug))
        db.flush()
        facts = badges.Facts(
            completed=completed,
            streak=streaks.current_streak(db, user.id, streaks.today()).length,
            perfect_quiz=badges.has_perfect_quiz(db, user.id),
            labs_passed=len(lab.passed_slugs(db, user.id)),  # autoflush: includes this one
        )
        new_badges = badges.award(db, user.id, catalog, facts)
        if module.comms:
            arrivals = comms.beat(catalog, module, "lab_done", new=True)
            window_event = module.comms.window.get("lab_done")
    db.commit()
    state = lab.LabState(
        pastes=tuple(pastes) + ("",) * (len(module.lab.boxes) - len(pastes)),
        verdict=verdict,
        passed=verdict.passed or already,
        review=lab.state(db, user.id, module).review if already else None,
    )
    return templates.TemplateResponse(
        request, "partials/_lab.html",
        {
            **context, "lab_state": state, "just_passed": first_pass,
            "xp_gained": xp_gained, "new_badges": new_badges, "arrivals": arrivals, "window_event": window_event,
        },
    )


@router.post("/modules/{slug}/hint", response_class=HTMLResponse)
def hint(
    slug: str,
    request: Request,
    item: Annotated[str, Form(max_length=16)],
    attempt: Annotated[str, Form()] = "",  # trimmed by hints.context(), never refused: htmx drops a 422
    answer: Annotated[list[str] | None, Form()] = None,
    box: Annotated[list[str] | None, Form()] = None,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
):
    """A hint for one item of a module (#123): "quiz-<n>", "console", "challenge" or
    "lab". What the learner has tried comes with it: the question's selection
    (`answer`), the console's recent commands or the challenge's code (`attempt`),
    or the lab's pastes (`box`). app/hints.py keeps the answer out of the reply."""
    module = _module_or_404(catalog, slug)
    kind = hints.item_kind(module, item)
    if kind is None:
        raise HTTPException(status_code=404)
    completed = progress.completed_slugs(db, user.id)
    if not progress.module_available(catalog, slug, completed):
        flash(request, f"“{module.title}” is still locked. {progress.blocker(catalog, slug, completed)}")
        return Response(status_code=403, headers={"HX-Redirect": "/"})
    if kind == "quiz":
        index = int(item.removeprefix("quiz-"))
        if index in progress.first_attempts(db, user.id, slug):
            raise HTTPException(status_code=409)  # answered: the explanation is showing, no hint needed
        question = module.quiz[index]
        if question.type == "fill":
            tried = (answer or [""])[0][:200]
        else:
            picked = [question.options[int(a)] for a in (answer or []) if a.isdigit() and int(a) < len(question.options)]
            tried = "Leaning towards: " + "; ".join(picked) if picked else ""
    elif kind == "lab":
        tried = "\n\n".join(f"Box {i}:\n{paste}" for i, paste in enumerate((box or [])[:4], 1) if paste.strip())
    else:
        tried = attempt
    outcome = hints.ask(db, user.id, module, item, tried)
    db.commit()
    return templates.TemplateResponse(
        request, "partials/_hint.html",
        {"module": module, "item": item, "outcome": outcome, "hints_online": spend.uplink_online(db),
         "include": {"quiz": f"#q{item.removeprefix('quiz-')}", "console": "#hint-attempt-console",
                     "challenge": "#challenge-code", "lab": "#lab .lab-paste"}[kind]},
    )


@router.post("/modules/{slug}/lab/review", response_class=HTMLResponse)
def lab_review(
    slug: str,
    request: Request,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
):
    """Claude's review of a passed lab (#122), asked for by the lab section after a
    first pass (or by its button). Runs once per lab; later calls show the stored
    review. Without a key or budget, says so and the lab stays passed."""
    module = _module_or_404(catalog, slug)
    if module.lab is None or not module.lab.ai_review:
        raise HTTPException(status_code=404)
    outcome = lab.review(db, user.id, module)
    db.commit()
    if outcome.review is None and outcome.unavailable is None:
        raise HTTPException(status_code=404)  # no passing attempt to review
    return templates.TemplateResponse(
        request, "partials/_lab_review.html",
        {"module": module, "review": outcome.review, "unavailable": outcome.unavailable, "xp_gained": outcome.xp_gained, "pending": False},
    )


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
            request, "partials/_question.html", {**context, "error": "Choose an answer first.", "hints_online": spend.uplink_online(db)}
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
            labs_passed=len(lab.passed_slugs(db, user.id)),
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
