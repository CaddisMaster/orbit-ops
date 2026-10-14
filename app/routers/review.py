"""The flashcard review queue (#51): one due card at a time, front first, then
the answer and four grades. Graded over htmx, the next card swaps in; as a
plain form, the grade redirects back to /review.

The front says where the card comes from and takes a typed answer (#104). The
answer is shown beside the back and never stored; one of the card's `accept`
answers marks it matched and preselects Good. Grading stays the learner's.

A review pays XP, up to a daily cap, and the grade that clears the queue files
today's streak entry, as completing a module does (#52)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app import lab, progress
from app.console import Readout, console_readout
from app.content import Catalog, FlashCard, get_catalog
from app.db import get_db
from app.game import badges, srs, streaks, xp
from app.models import User
from app.security import require_user
from app.templating import templates

router = APIRouter()


def _card_in_deck(db: Session, user: User, catalog: Catalog, card_id: str) -> FlashCard:
    """The card, if it's one of this learner's: its module must be complete."""
    card = catalog.cards().get(card_id)
    if card is None or card.module not in progress.completed_slugs(db, user.id):
        raise HTTPException(status_code=404)
    return card


def _drill_decks(catalog: Catalog, cards) -> list[str]:
    """The decks the due cards come from, in syllabus order: MERIDIAN's "FROM:"."""
    tracks = {catalog.modules[c.module].track for c in cards}
    return [t.deck for t in catalog.tracks if t.slug in tracks]


def _cleared_line(catalog: Catalog, today) -> dict | None:
    """Who says what when the drill is cleared: one of the syllabus's lines,
    picked by the date so they rotate (#82)."""
    if not catalog.drill_cleared:
        return None
    slug, html = catalog.drill_cleared[today.toordinal() % len(catalog.drill_cleared)]
    return {"who": catalog.cast[slug], "html": html}


def _context(db: Session, user: User, catalog: Catalog) -> dict:
    today = streaks.today()
    q = srs.queue(db, user.id, catalog, progress.completed_slugs(db, user.id), today)
    return {
        "card": q.due[0] if q.due else None,
        "remaining": len(q.due),
        "drill_decks": _drill_decks(catalog, q.due),
        "meridian": catalog.cast.get("meridian"),
        "next_due_on": q.next_due_on,
        "today": today,
        "catalog": catalog,
    }


@router.get("/review", response_class=HTMLResponse)
def review_page(
    request: Request,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
    console: Readout = Depends(console_readout),
):
    return templates.TemplateResponse(
        request, "review.html", {"user": user, "console": console, "revealed": False, **_context(db, user, catalog)}
    )


def matches(card: FlashCard, typed: str) -> bool:
    """Whether `typed` is one of the card's exact answers, spaces collapsed."""
    said = " ".join(typed.split())
    return bool(said) and any(said == " ".join(a.split()) for a in card.accept)


@router.post("/review/answer", response_class=HTMLResponse)
def reveal(
    request: Request,
    card: Annotated[str, Form()],
    typed: Annotated[str, Form(max_length=500)] = "",
    show: Annotated[str, Form()] = "",  # "Show answer": reveal without checking
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
    console: Readout = Depends(console_readout),
):
    """The card again, with its back, what was typed and the grade buttons (htmx,
    or a plain form)."""
    flashcard = _card_in_deck(db, user, catalog, card)
    typed = "" if show else typed.strip()
    context = {**_context(db, user, catalog), "card": flashcard, "revealed": True,
               "typed": typed, "matched": matches(flashcard, typed)}
    if request.headers.get("HX-Request"):
        return templates.TemplateResponse(request, "partials/_review_card.html", context)
    return templates.TemplateResponse(
        request, "review.html", {"user": user, "console": console, **context}
    )


@router.post("/review", response_class=HTMLResponse)
def grade(
    request: Request,
    card: Annotated[str, Form()],
    grade: Annotated[srs.Grade, Form()],
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
):
    _card_in_deck(db, user, catalog, card)
    today = streaks.today()
    xp_gained, cleared = 0, False
    if srs.record(db, user.id, card, grade, today):
        xp_gained = xp.review_award(db, user.id, card, today)
        completed = progress.completed_slugs(db, user.id)
        if not srs.queue(db, user.id, catalog, completed, today).due:
            # This grade cleared the queue: today counts (same transaction as the review).
            cleared = True
            streaks.mark_active(db, user.id, today)
            facts = badges.Facts(
                completed=completed,
                streak=streaks.current_streak(db, user.id, today).length,
                perfect_quiz=badges.has_perfect_quiz(db, user.id),
                labs_passed=len(lab.passed_slugs(db, user.id)),
            )
            badges.award(db, user.id, catalog, facts)  # a streak badge can be earned here too
    db.commit()
    if not request.headers.get("HX-Request"):
        return RedirectResponse("/review", status_code=303)
    return templates.TemplateResponse(
        request,
        "partials/_review_graded.html",
        {
            **_context(db, user, catalog),
            "revealed": False, "xp_gained": xp_gained, "cleared": cleared,
            "cleared_line": _cleared_line(catalog, today) if cleared else None,
            "console": console_readout(request, user, catalog, db),  # after the commit: the new streak and count
        },
    )
