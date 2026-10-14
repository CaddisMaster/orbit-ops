"""The crew notice promotions and commendations (#83): a rank's comms lines when
it's reached, a badge's when it's earned, live with the response that earns
them and kept in the comms log's history.

A throwaway curriculum: unit `shell` has `one` (50 XP) then `two` (60 XP), each
with a debrief, and Technician is reached at level 2 (100 XP). A perfect quiz
adds 20, so completing `one` leaves you a Cadet (70) and `two` promotes you (150)
and completes the unit, which earns "Air Scrubbers Online".
"""

import re
import textwrap

import pytest

from app.content import ContentError, get_catalog, load_catalog
from app.db import SessionLocal
from app.main import app
from app.models import XpEvent
from tests.conftest import csrf
from tests.test_progress import complete
from tests.test_xp import MODULE

SYLLABUS = """
ranks:
  - {title: Cadet, level: 1}
  - title: Technician
    level: 2
    comms:
      - {from: okafor, text: "Technician. Most of it."}
tracks:
  - slug: core
    title: Core
    deck: Life Support
    units:
      - slug: shell
        title: Shell
cast:
  - {slug: okafor, name: Okafor, role: Chief Engineer, avatar: okafor}
  - {slug: meridian, name: MERIDIAN, role: Station systems, avatar: meridian}
badges:
  - slug: unit-shell
    name: Air Scrubbers Online
    description: Complete the unit.
    emblem: life-support
    rule: {unit_complete: shell}
"""

DEBRIEF = 'comms:\n  complete:\n    - {{from: okafor, text: "{title}, done."}}\n'
CARD = "cards:\n  - {id: fact, front: A fact, back: The fact.}\n"


def _write(root, syllabus=SYLLABUS):
    (root / "syllabus.yml").write_text(textwrap.dedent(syllabus))
    (root / "core" / "shell").mkdir(parents=True)
    for n, (slug, title, xp) in enumerate([("one", "One", 50), ("two", "Two", 60)], 1):
        extra = DEBRIEF.format(title=title) + (CARD if slug == "one" else "")
        text = MODULE.format(title=title, xp=xp).replace("---\nLesson.", extra + "---\nLesson.", 1)
        (root / f"core/shell/0{n}-{slug}.md").write_text(text)
    return root


@pytest.fixture
def crew(tmp_path):
    catalog = load_catalog(_write(tmp_path))
    app.dependency_overrides[get_catalog] = lambda: catalog
    yield catalog
    app.dependency_overrides.pop(get_catalog, None)


def _lines(html):
    """(who, said) for each comms line in a page or fragment, in order."""
    return [
        (who, re.sub(r"<[^>]+>", "", said).strip())
        for who, said in re.findall(r'<p class="who">([^<]+?) <span.*?<p class="said">(.*?)</p>', html, re.S)
    ]


@pytest.mark.criterion(83, "A promotion is announced on comms")
def test_a_promotion_arrives_after_the_debrief(logged_in, crew):
    first = complete(logged_in, "one").text
    assert _lines(first) == [("Okafor", "One, done.")]  # 70 XP: still a Cadet
    last = complete(logged_in, "two").text
    assert "Promoted to Technician." in last
    assert _lines(last)[:2] == [("Okafor", "Two, done."), ("Okafor", "Technician. Most of it.")]
    assert 'hx-swap-oob="beforeend:#comms-log"' in last and 'class="comms-line from-okafor is-new"' in last


@pytest.mark.criterion(83, "A commendation is announced")
def test_a_badge_brings_meridians_line(logged_in, crew):
    complete(logged_in, "one")
    last = complete(logged_in, "two").text
    assert _lines(last)[-1] == ("MERIDIAN", "COMMENDATION LOGGED · AIR SCRUBBERS ONLINE")


def test_promotions_and_commendations_stay_in_the_history(logged_in, crew):
    complete(logged_in, "one")
    complete(logged_in, "two")
    assert _lines(logged_in.get("/").text) == [
        ("Okafor", "One, done."),
        ("Okafor", "Two, done."),  # the debrief, then what it brought
        ("Okafor", "Technician. Most of it."),
        ("MERIDIAN", "COMMENDATION LOGGED · AIR SCRUBBERS ONLINE"),
    ]


def test_a_rank_regained_after_a_dip_isnt_announced_twice(logged_in, crew, user):
    complete(logged_in, "one")
    complete(logged_in, "two")  # 150 XP: Technician
    with SessionLocal() as db:  # a costly run of hints drops below the band, then a review climbs back
        db.add(XpEvent(user_id=user.id, amount=-60, reason="hint", ref="one/quiz-0"))
        db.add(XpEvent(user_id=user.id, amount=30, reason="review", ref="x"))
        db.commit()
    said = [line for _, line in _lines(logged_in.get("/").text)]
    assert said.count("Technician. Most of it.") == 1


def test_a_review_grade_that_promotes_says_so(logged_in, crew, user):
    complete(logged_in, "one")  # 70 XP
    with SessionLocal() as db:
        db.add(XpEvent(user_id=user.id, amount=28, reason="test", ref="nudge"))  # 98: one review short
        db.commit()
    graded = logged_in.post(
        "/review", data={"card": "one/fact", "grade": "good"},
        headers={"HX-Request": "true", "X-CSRF-Token": csrf(logged_in)},
    ).text  # +2 XP: 100, Technician
    assert 'hx-swap-oob="beforeend:#comms-log"' in graded
    assert ("Okafor", "Technician. Most of it.") in _lines(graded)


@pytest.mark.criterion(83, "Rank and badge lines are validated")
def test_a_rank_line_from_outside_the_cast_fails_naming_the_rank(tmp_path):
    bad = SYLLABUS.replace("{from: okafor, text: \"Technician.", "{from: nobody, text: \"Technician.")
    with pytest.raises(ContentError) as exc:
        load_catalog(_write(tmp_path, bad))
    assert exc.value.problems == ["syllabus.yml: rank 'Technician': comms.0.from: 'nobody' is not in the cast"]


def test_a_badge_line_from_outside_the_cast_fails_naming_the_badge(tmp_path):
    bad = SYLLABUS.replace("    rule: {unit_complete: shell}", "    rule: {unit_complete: shell}\n    comms: [{from: nobody, text: Hi}]")
    with pytest.raises(ContentError) as exc:
        load_catalog(_write(tmp_path, bad))
    assert exc.value.problems == ["syllabus.yml: badge 'unit-shell': comms.0.from: 'nobody' is not in the cast"]


def test_the_real_ranks_have_lines_for_every_promotion():
    catalog = load_catalog()
    assert all(catalog.rank_comms[r.title] for r in catalog.ranks[1:])
    assert all(catalog.badge_comms[b.slug] for b in catalog.badges)
