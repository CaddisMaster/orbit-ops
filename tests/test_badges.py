"""Badges (#23).

Route tests use a throwaway curriculum: the XP one (unit `shell`: one → two)
plus a unit badge, a 7-day streak badge and the first-perfect-quiz badge.
"""

import re
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.content import ContentError, get_catalog, load_catalog
from app.content.schema import StreakRule, UnitCompleteRule
from app.db import SessionLocal
from app.game.badges import Facts, qualifying
from app.main import app
from app.models import BadgeEarned, ModuleProgress
from tests.test_progress import complete
from tests.test_streaks import _seed, active, clock  # noqa: F401  (fixture)
from tests.test_xp import SYLLABUS, _write

BADGES = """
badges:
  - slug: perfect
    name: Clean Readout
    description: A perfect quiz.
    emblem: star
    rule: {first_perfect_quiz: true}
  - slug: week
    name: First Watch
    description: Keep a 7-day streak.
    emblem: flame
    rule: {streak: 7}
  - slug: shell-done
    name: Air Scrubbers Online
    description: Finish the shell unit.
    emblem: life-support
    rule: {unit_complete: shell}
"""


@pytest.fixture
def badge_curriculum(tmp_path):
    _write(tmp_path, SYLLABUS + BADGES)
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    yield
    app.dependency_overrides.pop(get_catalog, None)


def _held(user_id: int) -> list[str]:
    with SessionLocal() as db:
        return list(db.scalars(select(BadgeEarned.badge_slug).where(BadgeEarned.user_id == user_id).order_by("id")))


def _tile(page: str, name: str) -> str:
    """The badge grid's <li> that names `name`."""
    return next(t for t in re.findall(r'<li class="badge .*?</li>', page, re.S) if name in t)


def _give(user_id: int, slug: str, at: datetime) -> None:
    with SessionLocal() as db:
        db.add(BadgeEarned(user_id=user_id, badge_slug=slug, earned_at=at))
        db.commit()


# --- the rules (pure) ---------------------------------------------------------------
def test_each_rule_checks_its_own_fact(tmp_path):
    _write(tmp_path, SYLLABUS + BADGES)
    catalog = load_catalog(tmp_path)

    def slugs(**facts):
        return [b.slug for b in qualifying(catalog, Facts(**{"completed": set(), "streak": 0, "perfect_quiz": False} | facts))]

    assert slugs() == []
    assert slugs(perfect_quiz=True) == ["perfect"]
    assert slugs(streak=6) == []
    assert slugs(streak=40) == ["week"]  # reaching it is enough, landing on it isn't required
    assert slugs(completed={"one"}) == []
    assert slugs(completed={"one", "two"}) == ["shell-done"]


# --- validation -----------------------------------------------------------------------
@pytest.mark.criterion(23, "Invalid badge definitions fail CI")
def test_a_badge_naming_an_unknown_unit_fails_validation(tmp_path):
    _write(tmp_path, SYLLABUS + BADGES.replace("{unit_complete: shell}", "{unit_complete: hyperdrive}"))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "badge 'shell-done' requires unit 'hyperdrive', which is not a unit" in str(exc.value)


@pytest.mark.parametrize(
    ("replace", "with_", "expect"),
    [
        ("slug: week", "slug: perfect", "badge 'perfect' is defined twice"),
        ("emblem: flame", "emblem: rocket", "badges.1.emblem"),
        ("{streak: 7}", "{streak: 1}", "badges.1.rule"),
        ("{streak: 7}", "{run_code: rm}", "badges.1.rule"),
        ("{first_perfect_quiz: true}", "{first_perfect_quiz: false}", "badges.0.rule"),
    ],
)
def test_bad_badge_definitions_are_reported(tmp_path, replace, with_, expect):
    _write(tmp_path, SYLLABUS + BADGES.replace(replace, with_))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "syllabus.yml" in str(exc.value) and expect in str(exc.value)


def test_the_real_curriculum_has_a_badge_for_every_unit_and_the_streaks():
    catalog = load_catalog()
    rules = [b.rule for b in catalog.badges]
    assert {r.unit_complete for r in rules if isinstance(r, UnitCompleteRule)} == set(catalog.units)
    assert sorted(r.streak for r in rules if isinstance(r, StreakRule)) == [7, 30, 100]


# --- earning ----------------------------------------------------------------------------
@pytest.mark.criterion(23, "Finishing a unit earns its badge")
def test_finishing_a_unit_earns_its_badge(logged_in, badge_curriculum, user):
    first = complete(logged_in, "one", right=False)
    assert _held(user.id) == []
    assert "Badge earned" not in first.text
    last = complete(logged_in, "two", right=False)
    assert _held(user.id) == ["shell-done"]
    assert "Badge earned: Air Scrubbers Online" in last.text


@pytest.mark.criterion(23, "A streak milestone earns a badge")
def test_a_streak_milestone_earns_a_badge(logged_in, badge_curriculum, user, clock):  # noqa: F811
    _seed(user.id, active(6, 5, 4, 3, 2, 1))
    last = complete(logged_in, "one", right=False)
    assert _held(user.id) == ["week"]
    assert "Badge earned: First Watch" in last.text


def test_a_perfect_quiz_earns_its_badge(logged_in, badge_curriculum, user):
    last = complete(logged_in, "one")
    assert _held(user.id) == ["perfect"]
    assert "Badge earned: Clean Readout" in last.text


@pytest.mark.criterion(23, "Badges are earned once")
def test_badges_are_earned_once(logged_in, badge_curriculum, user):
    complete(logged_in, "one")
    again = complete(logged_in, "two")  # perfect again: the rule is satisfied a second time
    assert _held(user.id) == ["perfect", "shell-done"]
    assert "Clean Readout" not in again.text
    assert "Badge earned: Air Scrubbers Online" in again.text


def test_every_rule_is_checked_against_the_whole_state(logged_in, badge_curriculum, user):
    # A perfect quiz from before badges existed is earned at the next completion.
    with SessionLocal() as db:
        db.add(ModuleProgress(user_id=user.id, module_slug="one", status="complete", score=100))
        db.commit()
    last = complete(logged_in, "two", right=False)
    assert _held(user.id) == ["perfect", "shell-done"]
    assert "Badge earned: Clean Readout" in last.text


# --- the pages -----------------------------------------------------------------------------
@pytest.mark.criterion(23, "The badges page shows earned and locked badges")
def test_the_badges_page_shows_earned_and_locked_badges(logged_in, badge_curriculum, user, clock):  # noqa: F811
    _give(user.id, "week", datetime(2026, 10, 3, 9, 0, tzinfo=UTC))
    page = logged_in.get("/badges").text
    assert "1 of 3 earned." in page
    week, perfect = _tile(page, "First Watch"), _tile(page, "Clean Readout")
    assert week.startswith('<li class="badge earned">')
    assert 'Earned <time datetime="2026-10-03">3 Oct 2026</time>' in week
    assert perfect.startswith('<li class="badge locked">')  # .badge.locked is the dimmed style
    assert "A perfect quiz." in perfect and "Locked" in perfect


def test_the_earned_date_follows_app_timezone(logged_in, badge_curriculum, user, clock):  # noqa: F811
    clock(tz="Pacific/Auckland")
    _give(user.id, "week", datetime(2026, 10, 3, 23, 30, tzinfo=UTC))  # already the 4th in Auckland
    assert '<time datetime="2026-10-04">' in logged_in.get("/badges").text


def test_the_dashboard_shows_the_three_most_recent(logged_in, badge_curriculum, user, clock):  # noqa: F811
    _give(user.id, "perfect", datetime(2026, 10, 1, tzinfo=UTC))
    _give(user.id, "week", datetime(2026, 10, 3, tzinfo=UTC))
    _give(user.id, "shell-done", datetime(2026, 10, 2, tzinfo=UTC))
    _give(user.id, "retired-badge", datetime(2026, 10, 4, tzinfo=UTC))  # no longer in the syllabus
    page = logged_in.get("/").text
    shown = page[page.index("Latest badges") :]
    assert shown.index("First Watch") < shown.index("Air Scrubbers Online") < shown.index("Clean Readout")
    assert "retired-badge" not in page


def test_badges_are_scoped_to_the_learner(logged_in, badge_curriculum, user, make_user):
    other = make_user()
    _give(other.id, "week", datetime(2026, 10, 3, tzinfo=UTC))
    assert "0 of 3 earned." in logged_in.get("/badges").text
    assert "Latest badges" not in logged_in.get("/").text


def test_the_badges_page_requires_login(client):
    response = client.get("/badges", follow_redirects=False)
    assert response.status_code in (302, 303, 307)
