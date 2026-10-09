"""The curriculum pages: the syllabus, modules, and answering quiz questions."""

from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from app import progress
from app.content import Catalog, Module, get_catalog
from app.db import get_db
from app.flash import flash
from app.game import xp
from app.game.levels import standing
from app.models import User
from app.security import require_user
from app.templating import templates

router = APIRouter()


@router.get("/syllabus", response_class=HTMLResponse)
def syllabus(
    request: Request,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
):
    completed = progress.completed_slugs(db, user.id)
    return templates.TemplateResponse(
        request,
        "syllabus.html",
        {
            "user": user,
            "catalog": catalog,
            "completed": completed,
            "available": lambda slug: progress.module_available(catalog, slug, completed),
        },
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
            "user": user,
            "module": module,
            "unit": unit,
            "track": next(t for t in catalog.tracks if t.slug == module.track),
            "unit_size": len(unit.modules),
            "answers": progress.first_attempts(db, user.id, slug),
            "record": record,
            "next": progress.next_module(catalog, slug, completed) if record.status == "complete" else None,
        },
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
            request, "partials/_question.html", {**context, "error": "Choose an answer first."}
        )

    result = progress.record_answer(db, user.id, module, index, answer, correct)
    record = progress.get_progress(db, user.id, slug)
    xp_gained, promoted_to = 0, None
    if result.just_completed:
        # Same transaction as the completion: both land or neither does.
        before = standing(xp.total_xp(db, user.id), catalog.ranks)
        xp_gained = sum(xp.award(db, user.id, a) for a in xp.completion_awards(module, record.score))
        after = standing(before.xp + xp_gained, catalog.ranks)
        if after.rank != before.rank:
            promoted_to = after.rank
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
            "next": progress.next_module(catalog, slug, completed) if result.just_completed else None,
        },
    )
