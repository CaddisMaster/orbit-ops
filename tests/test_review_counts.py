"""Flashcard reviews in the game (#52): capped XP, the streak, and what's due.

Modules are marked complete directly (no activity_days row), so any streak
day here was filed by a review. The clock is pinned (tests.test_streaks.clock).
"""

import re

import pytest
from sqlalchemy import select

from app.content import load_catalog
from app.db import SessionLocal
from app.game import xp
from app.models import ActivityDay, XpEvent
from tests.test_review import _complete, _grade
from tests.test_streaks import TODAY, clock  # noqa: F401  (fixture)

pytestmark = pytest.mark.usefixtures("clock")

FOUR_MODULES = ("the-filesystem", "navigating", "files-and-globs", "permissions")  # 12 cards


def _review_xp(user_id) -> list[tuple[str, int]]:
    with SessionLocal() as db:
        return list(
            db.execute(
                select(XpEvent.ref, XpEvent.amount).where(XpEvent.user_id == user_id, XpEvent.reason == "card_review")
            ).all()
        )


def _active_days(user_id):
    with SessionLocal() as db:
        return list(db.scalars(select(ActivityDay.day).where(ActivityDay.user_id == user_id)))


def _card_ids(*modules):
    cards = load_catalog().cards()
    return [c for c in cards if c.split("/")[0] in modules]


@pytest.mark.criterion(52, "Reviews earn capped XP")
def test_reviews_earn_capped_xp(logged_in, user):
    _complete(user.id, *FOUR_MODULES)
    parts = [_grade(logged_in, card, "good").text for card in _card_ids(*FOUR_MODULES)]
    assert len(parts) == 12
    paid = _review_xp(user.id)
    assert len(paid) == 10 and {amount for _, amount in paid} == {2} and sum(a for _, a in paid) == 20
    assert all(ref.startswith("2026-10-08/") for ref, _ in paid)
    assert "+2 XP" in parts[9] and "+2 XP" not in parts[10] and "+2 XP" not in parts[11]


@pytest.mark.criterion(52, "The same review can't be paid twice")
def test_the_same_review_cant_be_paid_twice(logged_in, user):
    _complete(user.id, "navigating")
    _grade(logged_in, "navigating/ls-lah", "good")
    _grade(logged_in, "navigating/ls-lah", "good")
    assert _review_xp(user.id) == [("2026-10-08/navigating/ls-lah", 2)]
    with SessionLocal() as db:  # and the ledger refuses it even if asked directly
        assert xp.review_award(db, user.id, "navigating/ls-lah", TODAY) == 0
        db.rollback()


@pytest.mark.criterion(52, "Clearing the due cards keeps the streak")
def test_clearing_the_due_cards_keeps_the_streak(logged_in, user):
    _complete(user.id, "navigating")
    _grade(logged_in, "navigating/ls-lah", "good")
    _grade(logged_in, "navigating/cd-dash", "again")
    assert _active_days(user.id) == []  # one still due
    last = _grade(logged_in, "navigating/hidden-files", "good").text
    assert _active_days(user.id) == [TODAY]
    assert "Queue clear." in last and "Today's log entry: <span class=\"filed\">filed</span>" in last
    # the header readout comes along out of band, so it keeps up without a reload
    assert '<div class="readout" id="readout" role="status" aria-label="Station status" hx-swap-oob="true">' in last
    assert "Streak <strong>1</strong>" in last and "Cards due" not in last
    assert "Streak <strong>1</strong>" in logged_in.get("/").text


@pytest.mark.criterion(52, "An empty queue is not activity")
def test_an_empty_queue_is_not_activity(logged_in, user):
    for path in ("/review", "/"):
        assert logged_in.get(path).status_code == 200
    _complete(user.id, "navigating")
    for card in _card_ids("navigating"):
        _grade(logged_in, card, "good")
    with SessionLocal() as db:  # forget that clearing, to see what an empty queue does on its own
        db.query(ActivityDay).filter_by(user_id=user.id).delete()
        db.commit()
    assert "Queue clear." in logged_in.get("/review").text  # nothing due now
    _grade(logged_in, "navigating/ls-lah", "good")  # not due: no review, so nothing cleared
    assert _active_days(user.id) == []


@pytest.mark.criterion(52, "The dashboard shows what is due")
def test_the_dashboard_shows_what_is_due(logged_in, user):
    _complete(user.id, "the-filesystem", "navigating")
    _grade(logged_in, "the-filesystem/etc", "good")
    _grade(logged_in, "the-filesystem/var", "good")
    page = logged_in.get("/").text
    assert "<strong>4 cards due</strong>" in page
    assert re.search(r'<a class="button primary" href="/review">Review cards</a>', page)
    assert '<a href="/review">Cards due <strong>4</strong></a>' in page  # in the readout, on every page
    assert "Cards due <strong>4</strong>" in logged_in.get("/badges").text


def test_nothing_due_shows_nothing(logged_in):
    page = logged_in.get("/").text
    assert "cards due" not in page.lower() and 'class="card review-due"' not in page


def test_every_review_ref_fits_the_ledger():
    # xp_events.ref is varchar(128); a review's ref is "YYYY-MM-DD/<module>/<card>".
    assert max(len(f"2026-10-08/{card}") for card in load_catalog().cards()) <= 128
