"""Flashcards on an SM-2 schedule (#51): the rule, card ids, and the review queue.

Route tests use the real curriculum, marking modules complete directly. The
clock is pinned through streaks._now (tests.test_streaks.clock), because a
card's due date is a calendar date in APP_TIMEZONE.
"""

import re
import textwrap
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.content import ContentError, load_catalog
from app.db import SessionLocal
from app.game import srs
from app.game.srs import Schedule, review
from app.models import CardState, ModuleProgress
from tests.conftest import csrf
from tests.test_streaks import TODAY, clock  # noqa: F401  (fixture)
from tests.test_xp import MODULE, SYLLABUS

pytestmark = pytest.mark.usefixtures("clock")


def days(n: int) -> date:
    return TODAY + timedelta(days=n)


# --- the rule (pure) --------------------------------------------------------------------
@pytest.mark.criterion(51, "Grading a card schedules it with SM-2")
def test_good_then_good_is_due_in_1_then_6_days():
    first = review(None, "good", TODAY)
    assert (first.interval_days, first.due_on, first.reps, first.ease) == (1, days(1), 1, 2.5)
    second = review(first, "good", days(1))
    assert (second.interval_days, second.due_on, second.reps) == (6, days(7), 2)
    third = review(second, "good", days(7))
    assert third.interval_days == round(6 * 2.5) == 15  # then the interval times the ease


def test_the_grades_move_the_ease_by_sm2s_formula():
    start = Schedule(2.5, 6, 2, 0, TODAY)
    assert review(start, "easy", TODAY).ease == 2.6
    assert review(start, "good", TODAY).ease == 2.5
    assert review(start, "hard", TODAY).ease == pytest.approx(2.36)
    assert review(start, "hard", TODAY).interval_days == 15  # hard is still a pass, at the ease it had (2.5)


@pytest.mark.criterion(51, "Again resets a card")
def test_again_resets_a_card():
    after = review(Schedule(2.5, 6, 2, 0, TODAY), "again", TODAY)
    assert (after.interval_days, after.due_on, after.reps, after.lapses) == (1, days(1), 0, 1)
    assert after.ease == pytest.approx(1.96)
    assert review(Schedule(1.4, 6, 2, 3, TODAY), "again", TODAY).ease == 1.3  # never below the floor


def test_failing_a_new_card_is_not_a_lapse():
    assert review(None, "again", TODAY).lapses == 0


# --- card ids ---------------------------------------------------------------------------------
@pytest.mark.criterion(51, "Cards have stable ids")
def test_cards_have_stable_ids():
    catalog = load_catalog()
    cards = catalog.cards()
    assert len(cards) == sum(len(m.cards) for m in catalog.modules.values()) >= 30  # unique across the curriculum
    for card_id, card in cards.items():
        module, _, own = card_id.partition("/")
        assert card.id == card_id and card.module == module and re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", own)
    assert catalog.modules["permissions"].cards[0].id == "permissions/octal-bits"


def _write(root, cards):
    (root / "syllabus.yml").write_text(textwrap.dedent(SYLLABUS))
    (root / "core/shell").mkdir(parents=True)
    text = MODULE.format(title="One", xp=50).replace("---\nLesson.", cards + "---\nLesson.", 1)
    (root / "core/shell/01-one.md").write_text(text)


@pytest.mark.criterion(51, "Cards have stable ids")
@pytest.mark.parametrize(
    ("cards", "expect"),
    [
        ("cards:\n  - {id: same, front: A, back: B}\n  - {id: same, front: C, back: D}\n", "cards.1.id: 'same' is used by another card"),
        ("cards:\n  - {front: A, back: B}\n", "cards.0.id"),
        ("cards:\n  - {id: Not A Slug, front: A, back: B}\n", "cards.0.id"),
    ],
)
def test_a_card_without_a_usable_id_is_refused(tmp_path, cards, expect):
    _write(tmp_path, cards)
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert expect in str(exc.value)


def test_cards_render_inline_markdown():
    card = load_catalog().cards()["the-filesystem/etc"]
    assert card.front_html == "What lives in <code>/etc</code>?"


# --- the queue -----------------------------------------------------------------------------
def _complete(user_id, *slugs):
    with SessionLocal() as db:
        db.add_all(
            ModuleProgress(user_id=user_id, module_slug=s, status="complete", score=100, completed_at=datetime.now(UTC))
            for s in slugs
        )
        db.commit()


def _state(user_id, card_id):
    with SessionLocal() as db:
        return db.scalar(select(CardState).where(CardState.user_id == user_id, CardState.card_id == card_id))


def _grade(client, card, grade, htmx=True):
    headers = {"X-CSRF-Token": csrf(client)} | ({"HX-Request": "true"} if htmx else {})
    return client.post("/review", data={"card": card, "grade": grade}, headers=headers, follow_redirects=False)


def _shown(html: str) -> str | None:
    """The card on screen, by its "Show answer" link."""
    m = re.search(r'href="/review/answer\?card=([^"]+)"', html)
    return m.group(1).replace("%2F", "/") if m else None


@pytest.mark.criterion(51, "A completed module's cards join the review queue")
def test_a_completed_modules_cards_join_the_queue(logged_in, user):
    _complete(user.id, "navigating")
    page = logged_in.get("/review").text
    assert _shown(page) == "navigating/ls-lah"
    assert "Flashcard · 3 due · from “" in page
    catalog = load_catalog()
    with SessionLocal() as db:
        due = srs.queue(db, user.id, catalog, {"navigating"}, TODAY).due
    assert [c.module for c in due] == ["navigating"] * 3  # not files-and-globs, which isn't complete
    assert logged_in.get("/review/answer?card=files-and-globs/copy-directory").status_code == 404


def test_show_answer_reveals_the_back_and_the_grades(logged_in, user):
    _complete(user.id, "navigating")
    part = logged_in.get("/review/answer?card=navigating/ls-lah", headers={"HX-Request": "true"}).text
    assert 'id="review-card"' in part and "<html" not in part
    assert "human-readable sizes" in part
    assert re.findall(r'name="grade" value="([a-z]+)"', part) == ["again", "hard", "good", "easy"]
    assert 'name="csrf_token"' in part  # the plain form works without htmx
    page = logged_in.get("/review/answer?card=navigating/ls-lah").text  # without htmx: the whole page
    assert "<html" in page and "human-readable sizes" in page


@pytest.mark.criterion(51, "Grading a card schedules it with SM-2")
def test_grading_records_the_schedule_and_shows_the_next_card(logged_in, user):
    _complete(user.id, "navigating")
    part = _grade(logged_in, "navigating/ls-lah", "good").text
    state = _state(user.id, "navigating/ls-lah")
    assert (state.interval_days, state.due_on, state.reps, state.last_reviewed_on) == (1, days(1), 1, TODAY)
    assert _shown(part) == "navigating/cd-dash" and "2 due" in part
    _grade(logged_in, "navigating/ls-lah", "again")  # a double submit, or an old tab: the card isn't due
    assert _state(user.id, "navigating/ls-lah").reps == 1


def test_a_plain_form_grade_redirects_back_to_the_queue(logged_in, user):
    _complete(user.id, "navigating")
    response = _grade(logged_in, "navigating/ls-lah", "easy", htmx=False)
    assert response.status_code == 303 and response.headers["location"] == "/review"
    assert _grade(logged_in, "navigating/cd-dash", "perfect").status_code == 422  # not a grade


def test_a_card_from_an_unfinished_module_cant_be_graded(logged_in, user):
    assert _grade(logged_in, "navigating/ls-lah", "good").status_code == 404
    assert _grade(logged_in, "navigating/no-such-card", "good").status_code == 404
    assert _state(user.id, "navigating/ls-lah") is None


@pytest.mark.criterion(51, "The queue empties")
def test_the_queue_empties(logged_in, user):
    _complete(user.id, "navigating")
    for card in ("navigating/ls-lah", "navigating/cd-dash"):
        _grade(logged_in, card, "good")
    last = _grade(logged_in, "navigating/hidden-files", "easy").text
    assert "Queue clear." in last
    assert 'The next card is due tomorrow, on\n     <time datetime="2026-10-09">' in last
    assert "Queue clear." in logged_in.get("/review").text


def test_an_empty_deck_says_where_cards_come_from(logged_in):
    page = logged_in.get("/review").text
    assert "Queue clear." in page and "Cards join the queue as you complete modules" in page


def test_cards_come_back_when_due(logged_in, user, request):
    _complete(user.id, "navigating")
    _grade(logged_in, "navigating/ls-lah", "again")
    request.getfixturevalue("clock")(datetime(2026, 10, 9, 12, 0, tzinfo=UTC))  # tomorrow
    assert _shown(logged_in.get("/review").text) == "navigating/ls-lah"  # due cards before new ones


@pytest.mark.criterion(51, "Another user's cards are not mine")
def test_another_users_cards_are_not_mine(logged_in, user, make_user):
    other = make_user()
    _complete(user.id, "navigating")
    _complete(other.id, "navigating")
    with SessionLocal() as db:
        srs.record(db, other.id, "navigating/ls-lah", "easy", TODAY)
        db.commit()
    assert _state(user.id, "navigating/ls-lah") is None
    assert _shown(logged_in.get("/review").text) == "navigating/ls-lah"  # still new, still mine to see
    assert "3 due" in logged_in.get("/review").text


def test_the_nav_links_to_the_review_queue(logged_in):
    assert '<a href="/review">Review</a>' in logged_in.get("/").text
