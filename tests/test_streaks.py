"""The daily streak and freezes (#22).

The clock is pinned through streaks._now and APP_TIMEZONE is set explicitly,
so nothing here depends on when the suite runs or on the dev container's .env.
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.game import streaks
from app.game.streaks import compute
from app.models import ActivityDay
from tests.test_progress import complete
from tests.test_xp import xp_curriculum  # noqa: F401  (fixture)

TODAY = date(2026, 10, 8)
NOON_UTC = datetime(2026, 10, 8, 12, 0, tzinfo=UTC)


def ago(n: int) -> date:
    return TODAY - timedelta(days=n)


def active(*days_ago: int) -> dict[date, bool]:
    return {ago(n): False for n in days_ago}


@pytest.fixture
def clock(monkeypatch):
    """Pin "now" to noon UTC on TODAY, in UTC. Returns a setter for both."""

    def set_clock(now: datetime = NOON_UTC, tz: str = "UTC") -> None:
        monkeypatch.setattr(streaks, "_now", lambda: now)
        monkeypatch.setattr(get_settings(), "app_timezone", tz)

    set_clock()
    return set_clock


def _days(user_id: int) -> dict[date, bool]:
    with SessionLocal() as db:
        return dict(
            db.execute(select(ActivityDay.day, ActivityDay.freeze_used).where(ActivityDay.user_id == user_id)).all()
        )


def _seed(user_id: int, days: dict[date, bool]) -> None:
    with SessionLocal() as db:
        db.add_all(ActivityDay(user_id=user_id, day=d, freeze_used=f) for d, f in days.items())
        db.commit()


# --- the rules (pure) ---------------------------------------------------------------
def test_no_activity_is_no_streak():
    assert compute({}, TODAY) == streaks.Streak(length=0, freezes=0, today_done=False)


def test_consecutive_days_count_and_today_is_included_when_done():
    s = compute(active(3, 2, 1, 0), TODAY)
    assert (s.length, s.today_done, s.new_freezes) == (4, True, ())


def test_today_pending_keeps_the_run():
    s = compute(active(3, 2, 1), TODAY)
    assert (s.length, s.today_done) == (3, False)


def test_every_seventh_active_day_banks_a_freeze_up_to_two():
    assert compute(active(*range(6, -1, -1)), TODAY).freezes == 1  # 7 days
    assert compute(active(*range(13, -1, -1)), TODAY).freezes == 2  # 14
    s = compute(active(*range(20, -1, -1)), TODAY)  # 21
    assert (s.length, s.freezes) == (21, 2)


def test_a_bridged_gap_spends_freezes_and_keeps_the_length():
    s = compute(active(*range(8, 1, -1)), TODAY)  # 7 active days, then yesterday missed
    assert (s.length, s.freezes, s.new_freezes) == (7, 0, (ago(1),))


def test_a_gap_longer_than_the_freezes_banked_ends_the_run_without_spending_them():
    s = compute(active(*range(10, 2, -1)), TODAY)  # 8 active days (1 freeze), then 2 missed
    assert (s.length, s.freezes, s.new_freezes) == (0, 0, ())


def test_two_freezes_bridge_a_two_day_gap():
    s = compute(active(*range(16, 2, -1)), TODAY)  # 14 active days (2 freezes), then 2 missed
    assert (s.length, s.freezes, s.new_freezes) == (14, 0, (ago(2), ago(1)))


def test_recorded_freezes_are_replayed_not_spent_again():
    days = active(*range(9, 2, -1)) | {ago(2): True} | active(1, 0)  # 7 active, a freeze, 2 active
    s = compute(days, TODAY)
    assert (s.length, s.freezes, s.new_freezes) == (9, 0, ())


def test_a_run_restarts_after_a_break():
    s = compute(active(10, 9, 8, 1, 0), TODAY)
    assert (s.length, s.today_done) == (2, True)


def test_rows_after_today_are_ignored():
    assert compute(active(1) | {TODAY + timedelta(days=1): False}, TODAY).length == 1


# --- recording and the dashboard -----------------------------------------------------
@pytest.mark.criterion(22, "Completing a module marks today active")
def test_completing_a_module_marks_today_active(logged_in, xp_curriculum, user, clock):  # noqa: F811
    complete(logged_in, "one")
    assert _days(user.id) == {TODAY: False}
    complete(logged_in, "two")  # a second completion the same day changes nothing
    assert _days(user.id) == {TODAY: False}


@pytest.mark.criterion(22, "Consecutive days build a streak")
def test_consecutive_days_build_a_streak(logged_in, user, clock):
    _seed(user.id, active(3, 2, 1, 0))
    page = logged_in.get("/").text
    assert "4-day streak" in page
    assert '<span class="filed">filed</span>' in page


@pytest.mark.criterion(22, "Today not done yet doesn't break the streak")
def test_today_not_done_yet_does_not_break_the_streak(logged_in, user, clock):
    _seed(user.id, active(3, 2, 1))
    page = logged_in.get("/").text
    assert "3-day streak" in page
    assert "Today's log entry: pending" in page


@pytest.mark.criterion(22, "A missed day spends a freeze")
def test_a_missed_day_spends_a_freeze(logged_in, user, clock):
    _seed(user.id, active(*range(8, 1, -1)))  # a 7-day streak, one freeze banked; yesterday missed
    page = logged_in.get("/").text
    assert _days(user.id)[ago(1)] is True  # recorded as a freeze day
    assert "7-day streak" in page and "0 of 2 freezes banked" in page
    logged_in.get("/")  # seeing it again spends nothing more
    assert sum(_days(user.id).values()) == 1


@pytest.mark.criterion(22, "A missed day without a freeze resets the streak")
def test_a_missed_day_without_a_freeze_resets_the_streak(logged_in, xp_curriculum, user, clock):  # noqa: F811
    _seed(user.id, active(4, 3, 2))  # no freezes; yesterday missed
    assert "0-day streak" in logged_in.get("/").text
    assert ago(1) not in _days(user.id)
    complete(logged_in, "one")
    assert "1-day streak" in logged_in.get("/").text


@pytest.mark.criterion(22, "Freezes cap at two")
def test_freezes_cap_at_two(logged_in, user, clock):
    _seed(user.id, active(*range(20, -1, -1)))
    page = logged_in.get("/").text
    assert "21-day streak" in page and "2 of 2 freezes banked" in page


@pytest.mark.criterion(22, "The day boundary follows APP_TIMEZONE")
def test_the_day_boundary_follows_app_timezone(logged_in, xp_curriculum, user, clock):  # noqa: F811
    # 23:30 UTC on the 8th is already 12:30 on the 9th in Auckland.
    clock(datetime(2026, 10, 8, 23, 30, tzinfo=UTC), "Pacific/Auckland")
    complete(logged_in, "one")
    assert _days(user.id) == {date(2026, 10, 9): False}


def test_streaks_are_scoped_to_the_learner(logged_in, user, make_user, clock):
    other = make_user()
    _seed(other.id, active(*range(29, -1, -1)))
    assert "0-day streak" in logged_in.get("/").text
