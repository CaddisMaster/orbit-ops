"""XP, levels and ranks (#21).

Route tests use a throwaway curriculum with low rank bands, so a promotion
happens within one or two modules:

    unit `shell`: one (50 XP) → two (0 XP)
    ranks: Cadet from level 1, Technician from level 2 (100 XP)
"""

import textwrap

import pytest
from sqlalchemy import select

from app.content import ContentError, get_catalog, load_catalog
from app.content.schema import RankSpec
from app.db import SessionLocal
from app.game.levels import level_for, rank_for, standing, xp_for_level
from app.game.xp import PERFECT_QUIZ_BONUS, total_xp
from app.main import app
from app.models import XpEvent
from tests.test_progress import answer, complete

SYLLABUS = """
ranks:
  - {title: Cadet, level: 1}
  - {title: Technician, level: 2}
tracks:
  - slug: core
    title: Core
    deck: Life Support
    units:
      - slug: shell
        title: Shell
"""

MODULE = """---
title: {title}
minutes: 15
xp: {xp}
story: Day.
quiz:
  - type: choice
    q: Choice question
    options: [wrong, right]
    answer: 1
    explain: Right is right.
  - type: fill
    q: Fill question
    answer: [ls]
    explain: It is ls.
---
Lesson.
"""

RANKS = [RankSpec(title="Cadet", level=1), RankSpec(title="Technician", level=3), RankSpec(title="Engineer", level=6)]


def _write(root, syllabus=SYLLABUS):
    (root / "syllabus.yml").write_text(textwrap.dedent(syllabus))
    for rel, title, xp in (("core/shell/01-one.md", "One", 50), ("core/shell/02-two.md", "Two", 0)):
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(MODULE.format(title=title, xp=xp))


@pytest.fixture
def xp_curriculum(tmp_path):
    _write(tmp_path)
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    yield
    app.dependency_overrides.pop(get_catalog, None)


def _events(user_id: int) -> list[tuple[int, str, str]]:
    with SessionLocal() as db:
        rows = db.execute(
            select(XpEvent.amount, XpEvent.reason, XpEvent.ref).where(XpEvent.user_id == user_id).order_by(XpEvent.id)
        )
        return [tuple(r) for r in rows]


def _give(user_id: int, amount: int, ref: str = "seed") -> None:
    with SessionLocal() as db:
        db.add(XpEvent(user_id=user_id, amount=amount, reason="test", ref=ref))
        db.commit()


# --- the curve and the ranks (pure) -----------------------------------------------
def test_level_curve():
    assert [xp_for_level(n) for n in (1, 2, 3, 4, 10)] == [0, 100, 283, 520, 2700]
    assert [level_for(xp) for xp in (0, 99, 100, 282, 283, 2699, 2700)] == [1, 1, 2, 2, 3, 9, 10]


def test_rank_bands():
    assert [rank_for(level, RANKS) for level in (1, 2, 3, 5, 6, 40)] == [
        "Cadet", "Cadet", "Technician", "Technician", "Engineer", "Engineer"
    ]
    assert rank_for(4, []) is None


def test_standing_reports_progress_to_the_next_level():
    s = standing(300, RANKS)
    assert (s.level, s.rank, s.floor, s.ceiling) == (3, "Technician", 283, 520)
    assert (s.into_level, s.level_span, s.to_next) == (17, 237, 220)


@pytest.mark.parametrize(
    ("ranks", "expect"),
    [
        ("[{title: Cadet, level: 2}]", "first rank must start at level 1"),
        ("[{title: Cadet, level: 1}, {title: Technician, level: 1}]", "levels must strictly ascend"),
    ],
)
def test_bad_rank_bands_fail_validation(tmp_path, ranks, expect):
    _write(tmp_path, SYLLABUS.replace(SYLLABUS[SYLLABUS.index("ranks:") : SYLLABUS.index("tracks:")], f"ranks: {ranks}\n"))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "syllabus.yml" in str(exc.value) and expect in str(exc.value)


def test_the_real_curriculum_has_ranks_from_cadet():
    ranks = load_catalog().ranks
    assert ranks[0] == RankSpec(title="Cadet", level=1)
    assert ranks[-1].title == "Station Commander"


# --- awards -----------------------------------------------------------------------
@pytest.mark.criterion(21, "Completing a module awards its XP")
def test_completing_a_module_awards_its_xp(logged_in, xp_curriculum, user):
    answer(logged_in, "one", 0, "1")
    last = answer(logged_in, "one", 1, "dir")  # 50%: no bonus
    assert _events(user.id) == [(50, "module_complete", "one")]
    assert "+50 XP" in last.text


@pytest.mark.criterion(21, "A perfect quiz earns a bonus")
def test_a_perfect_quiz_earns_a_bonus(logged_in, xp_curriculum, user):
    last = complete(logged_in, "one")
    assert _events(user.id) == [(50, "module_complete", "one"), (PERFECT_QUIZ_BONUS, "perfect_quiz", "one")]
    assert f"+{50 + PERFECT_QUIZ_BONUS} XP" in last.text


def test_a_zero_xp_module_records_only_the_bonus(logged_in, xp_curriculum, user):
    complete(logged_in, "one")
    complete(logged_in, "two")
    assert [e for e in _events(user.id) if e[2] == "two"] == [(PERFECT_QUIZ_BONUS, "perfect_quiz", "two")]


@pytest.mark.criterion(21, "XP is never awarded twice for the same thing")
def test_xp_is_never_awarded_twice(logged_in, xp_curriculum, user):
    complete(logged_in, "one")
    again = complete(logged_in, "one")
    assert len(_events(user.id)) == 2
    assert "XP" not in again.text  # no completion fragment, no award line
    assert "+70 XP" not in logged_in.get("/modules/one").text  # the award is announced once


# --- standing on the dashboard ------------------------------------------------------
@pytest.mark.criterion(21, "Level and rank are derived from the ledger")
def test_dashboard_shows_level_rank_and_progress(logged_in, xp_curriculum, user):
    _give(user.id, 200, "a")
    _give(user.id, 100, "b")  # 300 XP: level 3 starts at 283, level 4 at 520
    page = logged_in.get("/").text
    assert "<strong>Level 3</strong> · Technician" in page
    assert "300 XP" in page
    assert 'max="237" value="17"' in page
    assert "220 XP to level 4" in page


@pytest.mark.criterion(21, "Crossing a rank boundary is announced")
def test_crossing_a_rank_boundary_is_announced(logged_in, xp_curriculum, user):
    _give(user.id, 40)  # 40 + 70 = 110: level 2, Technician in this curriculum
    last = complete(logged_in, "one")
    assert "Promoted to Technician." in last.text


def test_no_promotion_within_a_rank(logged_in, xp_curriculum, user):
    last = complete(logged_in, "one")  # 70 XP: still a Cadet
    assert "Promoted" not in last.text


@pytest.mark.criterion(21, "XP is scoped to the learner")
def test_xp_is_scoped_to_the_learner(logged_in, xp_curriculum, user, make_user):
    other = make_user()
    _give(other.id, 5000)
    _give(user.id, 30)
    with SessionLocal() as db:
        assert total_xp(db, user.id) == 30
    page = logged_in.get("/").text
    assert "<strong>Level 1</strong> · Cadet" in page and "30 XP" in page
