"""Immersion (#18): deck identity, the console readout, transmissions, and the
CSP staying exactly as it was.

What only a browser can show (the typing reveal, skipping it, reduced motion,
phone widths) was checked with Playwright and is recorded in the PR body. These
tests hold the server's half: the markup those behaviours hang on.
"""

import re
from pathlib import Path

import pytest

from app.content import ContentError, load_catalog
from app.db import SessionLocal
from app.models import ModuleProgress
from tests.test_progress import complete
from tests.test_xp import xp_curriculum  # noqa: F401  (fixture)

# The policy as it stood before this issue, nonce aside. Any change to it is a
# change to this line, made on purpose.
POLICY = (
    "default-src 'self'; script-src 'self' 'nonce-*'; style-src 'self'; img-src 'self' data:; "
    "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)
PAGES = ["/", "/syllabus", "/map", "/badges", "/modules/the-filesystem"]
STATIC = Path(__file__).resolve().parents[1] / "app" / "static"


@pytest.mark.criterion(18, "Pages carry their deck's identity")
def test_a_life_support_module_carries_its_deck_and_unit_emblem(logged_in):
    page = logged_in.get("/modules/the-filesystem").text
    assert '<body class="deck--core"' in page
    assert re.search(r'<header class="card briefing">\s*<div class="briefing-head">\s*<svg class="unit-emblem" data-emblem="scrubber"', page)
    assert "Incoming transmission · Life Support" in page


def test_every_deck_has_its_own_colour():
    css = (STATIC / "css" / "style.css").read_text()
    colours = {}
    for track in load_catalog().tracks:
        match = re.search(rf"\.deck--{track.slug} \{{ --deck: (#[0-9a-f]{{6}});", css)
        assert match, f"no colour for deck--{track.slug}"
        colours[track.slug] = match.group(1)
    assert len(set(colours.values())) == len(colours)


def test_syllabus_sections_and_the_mission_card_carry_their_deck(logged_in):
    syllabus = logged_in.get("/syllabus").text
    for track in load_catalog().tracks:
        assert f'<section class="card track deck--{track.slug}">' in syllabus
    assert '<svg class="unit-emblem" data-emblem="branch"' in syllabus  # Git
    assert '<section class="card mission deck--core">' in logged_in.get("/").text


def test_a_unit_emblem_must_be_one_that_exists(tmp_path):
    from tests.test_station_map import SYLLABUS, _write

    _write(tmp_path, SYLLABUS.replace("        map: {x: 10, y: 90}", "        map: {x: 10, y: 90}\n        emblem: warp-core"))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "units.1.emblem" in str(exc.value)


def test_every_unit_emblem_in_the_schema_is_drawn():
    from typing import get_args

    from app.content.schema import UnitEmblem

    macro = (Path(__file__).resolve().parents[1] / "app" / "templates" / "partials" / "_unit_emblem.html").read_text()
    for name in get_args(UnitEmblem):
        assert f'name == "{name}"' in macro


# --- the CSP ------------------------------------------------------------------------
@pytest.mark.criterion(18, "Nothing loosens the CSP")
@pytest.mark.parametrize("path", PAGES)
def test_the_csp_is_unchanged_and_nothing_inline_needs_it(logged_in, path):
    response = logged_in.get(path)
    assert response.status_code == 200
    assert re.sub(r"'nonce-[^']+'", "'nonce-*'", response.headers["content-security-policy"]) == POLICY
    html = response.text
    assert "style=" not in html  # inline style attributes would need 'unsafe-inline'
    for tag in re.findall(r"<script\b[^>]*>", html):
        assert "src=" in tag or "nonce=" in tag, tag
    assert re.search(r'<script src="[^"]*/static/js/briefing.js" defer></script>', html)  # served, not inline


def test_the_briefing_is_served_in_full_without_javascript(logged_in):
    # briefing.js only hides and re-reveals text the server already sent, so
    # with no JavaScript (or reduced motion) the whole story is simply there.
    page = logged_in.get("/modules/the-filesystem").text
    story = re.search(r'<div class="story transmission" data-transmission>(.*?)</div>', page, re.S).group(1)
    assert "Mission log, day 1." in story
    assert "is-typing" not in page


def test_motion_is_switched_off_under_reduced_motion():
    css = (STATIC / "css" / "style.css").read_text()
    reduced = "".join(re.findall(r"@media \(prefers-reduced-motion: reduce\) \{(.*?)\n\}", css, re.S))
    assert ".completion.is-new { animation: none; }" in reduced
    assert "drift-near" not in css  # the starfield is gone: the desk's window replaced it (#38)
    assert "prefers-reduced-motion: reduce" in (STATIC / "js" / "briefing.js").read_text()


# --- the readout and the completion moment ---------------------------------------------
def test_the_readout_shows_systems_online_and_the_streak(logged_in, user):
    with SessionLocal() as db:
        db.add(ModuleProgress(user_id=user.id, module_slug="the-filesystem", status="complete", score=100))
        db.commit()
    total = len(load_catalog().modules)
    for path in PAGES:
        page = logged_in.get(path).text
        assert f"Systems online <strong>1/{total}</strong>" in page, path
        assert "Streak <strong>0</strong>" in page


def test_the_readout_is_scoped_to_the_learner(logged_in, make_user):
    other = make_user()
    with SessionLocal() as db:
        db.add(ModuleProgress(user_id=other.id, module_slug="the-filesystem", status="complete", score=100))
        db.commit()
    assert "Systems online <strong>0/" in logged_in.get("/").text


def test_the_login_page_has_no_readout(client):
    assert 'class="readout"' not in client.get("/login").text


def test_the_completion_banner_powers_up_only_when_it_happens(logged_in, xp_curriculum):  # noqa: F811
    last = complete(logged_in, "one")
    assert '<section id="completion" class="card completion is-new" hx-swap-oob="true">' in last.text
    revisit = logged_in.get("/modules/one").text
    assert '<section id="completion" class="card completion">' in revisit
