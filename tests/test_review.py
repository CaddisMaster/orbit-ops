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
    """The card on screen, by the answer form's hidden `card`."""
    m = re.search(r'<form class="review-check".*?name="card" value="([^"]+)"', html, re.S)
    return m.group(1) if m else None


def _reveal(client, card, htmx=True, **form):
    headers = {"X-CSRF-Token": csrf(client)} | ({"HX-Request": "true"} if htmx else {})
    return client.post("/review/answer", data={"card": card, **form}, headers=headers)


@pytest.mark.criterion(51, "A completed module's cards join the review queue")
def test_a_completed_modules_cards_join_the_queue(logged_in, user):
    _complete(user.id, "navigating")
    page = logged_in.get("/review").text
    assert _shown(page) == "navigating/ls-lah"
    assert "<span>Watch drill · 3 items · from: Life Support</span>" in page
    catalog = load_catalog()
    with SessionLocal() as db:
        due = srs.queue(db, user.id, catalog, {"navigating"}, TODAY).due
    assert [c.module for c in due] == ["navigating"] * 3  # not files-and-globs, which isn't complete
    assert _reveal(logged_in, "files-and-globs/copy-directory").status_code == 404


def test_show_answer_reveals_the_back_and_the_grades(logged_in, user):
    _complete(user.id, "navigating")
    part = _reveal(logged_in, "navigating/ls-lah", show="1").text
    assert 'id="review-card"' in part and "<html" not in part
    assert "human-readable sizes" in part
    assert re.findall(r'name="grade" value="([a-z]+)"', part) == ["again", "hard", "good", "easy"]
    assert 'name="csrf_token"' in part  # the plain form works without htmx
    page = _reveal(logged_in, "navigating/ls-lah", htmx=False, show="1").text  # without htmx: the whole page
    assert "<html" in page and "human-readable sizes" in page


@pytest.mark.criterion(51, "Grading a card schedules it with SM-2")
def test_grading_records_the_schedule_and_shows_the_next_card(logged_in, user):
    _complete(user.id, "navigating")
    part = _grade(logged_in, "navigating/ls-lah", "good").text
    state = _state(user.id, "navigating/ls-lah")
    assert (state.interval_days, state.due_on, state.reps, state.last_reviewed_on) == (1, days(1), 1, TODAY)
    assert _shown(part) == "navigating/cd-dash" and "Watch drill · 2 items" in part
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
    assert "Watch drill · 3 items" in logged_in.get("/review").text


def test_the_nav_links_to_the_review_queue(logged_in):
    assert '<a href="/review">Review</a>' in logged_in.get("/").text


# --- #82: the watch drill --------------------------------------------------------------------
@pytest.mark.criterion(82, "The review queue is a watch drill")
def test_the_review_queue_is_a_watch_drill(logged_in, user):
    _complete(user.id, "navigating", "text-tools")
    page = logged_in.get("/review").text
    assert '<p class="drill-readout"><img class="avatar" src="/static/img/avatar-meridian.png?v=' in page
    assert "<span>Watch drill · 6 items · from: Life Support</span>" in page
    assert '<a href="/modules/navigating">Finding your way around</a>' in page


@pytest.mark.criterion(82, "Clearing the drill gets a word from the crew")
def test_clearing_the_drill_gets_a_word_from_the_crew(logged_in, user):
    catalog = load_catalog()
    slug, html = catalog.drill_cleared[TODAY.toordinal() % len(catalog.drill_cleared)]  # picked by the date
    _complete(user.id, "navigating")
    for card in ("navigating/ls-lah", "navigating/cd-dash"):
        assert "crew-line" not in _grade(logged_in, card, "good").text  # only the grade that clears it
    last = _grade(logged_in, "navigating/hidden-files", "good").text
    assert f'<div class="comms-line crew-line from-{slug}">' in last and str(html) in last
    assert "crew-line" not in logged_in.get("/review").text  # said once, as the drill is cleared


def test_the_drill_lines_rotate_by_date():
    from datetime import timedelta

    from app.routers.review import _cleared_line

    catalog = load_catalog()
    lines = {_cleared_line(catalog, TODAY + timedelta(days=n))["html"] for n in range(len(catalog.drill_cleared))}
    assert len(lines) == len(catalog.drill_cleared) >= 3


@pytest.mark.criterion(82, "A challenge says who's asking")
def test_a_challenge_says_whos_asking(logged_in, user):
    from tests.test_challenge import BEFORE_TEXT_TOOLS

    _complete(user.id, *BEFORE_TEXT_TOOLS)
    page = logged_in.get("/modules/text-tools").text
    challenge = page[page.index('<section class="card challenge"') :]
    assert '<div class="comms-line crew-line from-okafor">' in challenge[: challenge.index("</section>")]
    assert '<span class="crew-lead">asks:</span>' in challenge


@pytest.mark.parametrize(
    ("where", "expect"),
    [
        ("drill", "drill.cleared.0.from: 'okafr' is not in the cast"),
        ("challenge", "challenge.from: 'okafr' is not in the cast"),
    ],
)
def test_drill_and_challenge_speakers_must_be_in_the_cast(tmp_path, where, expect):
    from tests.test_challenge import CHALLENGE
    from tests.test_terminal import TERMINAL

    cast = "cast:\n  - {slug: okafor, name: Okafor, role: Chief Engineer, avatar: okafor}\n"
    drill = "drill:\n  cleared:\n    - {from: okafr, text: Done.}\n" if where == "drill" else ""
    (tmp_path / "syllabus.yml").write_text(textwrap.dedent(SYLLABUS) + cast + drill)
    (tmp_path / "core/shell").mkdir(parents=True)
    challenge = CHALLENGE.replace("challenge:\n", "challenge:\n  from: okafr\n") if where == "challenge" else ""
    text = MODULE.format(title="One", xp=50).replace("---\nLesson.", TERMINAL + challenge + "---\nLesson.", 1)
    (tmp_path / "core/shell/01-one.md").write_text(text)
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert expect in str(exc.value)


# --- #104: where a card comes from, and typing the answer ------------------------------------
@pytest.mark.criterion(104, "A card says where it comes from")
def test_a_card_names_its_unit_and_links_its_module(logged_in, user):
    _complete(user.id, "files-and-globs")
    page = logged_in.get("/review").text
    assert _shown(page) == "files-and-globs/copy-directory"
    assert "Unit 1.1 Linux &amp; the shell" in page
    assert '<a href="/modules/files-and-globs">Making, moving and matching files</a>' in page


@pytest.mark.criterion(104, "A card can point at its lesson section")
def test_a_card_links_to_its_lesson_section(logged_in, user):
    _complete(user.id, "files-and-globs")
    page = logged_in.get("/review").text
    assert '<a href="/modules/files-and-globs#sec-copying-moving-deleting">Copying, moving, deleting</a>' in page
    lesson = logged_in.get("/modules/files-and-globs").text
    assert '<h2 id="sec-copying-moving-deleting">Copying, moving, deleting</h2>' in lesson


@pytest.mark.criterion(104, "I can type my answer before seeing it")
def test_a_typed_answer_is_shown_beside_the_back(logged_in, user):
    _complete(user.id, "navigating")
    front = logged_in.get("/review").text
    assert 'name="typed"' in front and ">Check</button>" in front and ">Show answer</button>" in front
    part = _reveal(logged_in, "navigating/ls-lah", typed="  list   everything ").text
    assert "<code>list everything</code>" not in part and "<code>list   everything</code>" in part  # as typed, trimmed
    assert "Your answer" in part and "human-readable sizes" in part
    assert "matched" not in part and " autofocus" not in part  # no accept list: nothing preselected
    assert re.findall(r'name="grade" value="([a-z]+)"', part) == ["again", "hard", "good", "easy"]
    with SessionLocal() as db:
        assert _state(user.id, "navigating/ls-lah") is None  # revealing records nothing; the typed answer isn't kept
        assert db.scalar(select(CardState).where(CardState.user_id == user.id)) is None


@pytest.mark.criterion(104, "An exact answer is recognised")
def test_an_accepted_answer_is_matched_and_preselects_good(logged_in, user):
    _complete(user.id, "files-and-globs")
    part = _reveal(logged_in, "files-and-globs/copy-directory", typed="cp  -r reports reports-old").text  # spaces don't matter
    assert "✓ matched" in part
    assert re.search(r'<button type="submit" name="grade" value="good" class="primary" autofocus>', part)
    near = _reveal(logged_in, "files-and-globs/copy-directory", typed="cp -R reports reports-old").text
    assert "✓ matched" not in near and "<code>cp -R reports reports-old</code>" in near


def test_show_answer_ignores_anything_typed(logged_in, user):
    _complete(user.id, "files-and-globs")
    part = _reveal(logged_in, "files-and-globs/copy-directory", typed="cp -r reports reports-old", show="1").text
    assert "Your answer" not in part and "✓ matched" not in part
