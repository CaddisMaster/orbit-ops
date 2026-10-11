"""The station map: the Meridian, side on (#24, as a ship since #78).

Route tests use a throwaway curriculum of two decks:

    core:        shell (one → two)  ─┬→ git
                                     └→ net (no modules: "coming soon")
    containers:  docker  ← git, net
"""

import re
import textwrap

import pytest

from app.content import get_catalog, load_catalog
from app.db import SessionLocal
from app.main import app
from app.models import ModuleProgress
from app.station_map import layout, slots_for, wrap
from art import ship
from tests.test_progress import complete
from tests.test_xp import MODULE

SYLLABUS = """
tracks:
  - slug: core
    title: Core Systems
    deck: Life Support
    units:
      - slug: shell
        title: "Linux & the shell: the basics"
      - slug: git
        title: Git
        prerequisites: [shell]
      - slug: net
        title: Networking
        prerequisites: [shell]
  - slug: containers
    title: Python & Containers
    deck: Cargo & Fabrication
    units:
      - slug: docker
        title: Docker
        prerequisites: [git, net]
"""


def _write(root, syllabus=SYLLABUS):
    (root / "syllabus.yml").write_text(textwrap.dedent(syllabus))
    for rel, title in (("core/shell/01-one.md", "One"), ("core/shell/02-two.md", "Two"), ("core/git/01-commits.md", "Commits")):
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(MODULE.format(title=title, xp=50))


@pytest.fixture
def map_curriculum(tmp_path):
    _write(tmp_path)
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    yield
    app.dependency_overrides.pop(get_catalog, None)


def _deck(page: str, slug: str) -> str:
    """The SVG group holding a deck's name and compartments."""
    return re.search(rf'<g class="deck deck--{slug}" data-deck="{slug}">(.*?)\n      </g>', page, re.S).group(1)


def _node(page: str, unit: str) -> str:
    return re.search(rf'<a class="node [a-z ]+" href="[^"]*" data-unit="{unit}">.*?</a>', page, re.S).group(0)


def _state(page: str, unit: str) -> str:
    return re.match(r'<a class="node ([a-z]+)', _node(page, unit)).group(1)


# --- the art and the layout (pure) --------------------------------------------------------
@pytest.mark.criterion(78, "Every track fits its section")
def test_every_track_fits_its_section():
    catalog = load_catalog()
    assert set(ship.SLOTS) == set(ship.LABELS) == {t.slug for t in catalog.tracks}
    where = slots_for(catalog)  # raises if a track has more units than compartments
    assert len(where) == len(catalog.units) and len(set(where.values())) == len(where)  # one compartment each
    for slots in ship.SLOTS.values():
        for x, y in slots:  # every corner of every compartment is on the hull, not in space
            for px, py in ((x, y), (x + ship.SLOT_W - 1, y), (x, y + ship.SLOT_H - 1), (x + ship.SLOT_W - 1, y + ship.SLOT_H - 1)):
                assert ship.hull_contains(px, py), (x, y)


def test_compartments_dont_overlap():
    rects = [(x, y) for slots in ship.SLOTS.values() for x, y in slots]
    for i, (x1, y1) in enumerate(rects):
        for x2, y2 in rects[i + 1 :]:
            apart = x1 + ship.SLOT_W < x2 or x2 + ship.SLOT_W < x1 or y1 + ship.SLOT_H < y2 or y2 + ship.SLOT_H < y1
            assert apart, ((x1, y1), (x2, y2))


def test_the_art_draws_a_window_at_every_compartment():
    from art.canvas import Canvas

    drawn = ship.render()
    for slots in ship.SLOTS.values():
        for x, y in slots:
            assert drawn.rows[y][x] == drawn.rows[y + ship.SLOT_H - 1][x + ship.SLOT_W - 1] == Canvas.colour("lip")


def test_a_track_with_too_many_units_is_refused(tmp_path):
    extra = "".join(f"      - slug: extra{i}\n        title: Extra {i}\n" for i in range(3))
    _write(tmp_path, SYLLABUS.replace("        prerequisites: [shell]\n  - slug: containers", "        prerequisites: [shell]\n" + extra + "  - slug: containers"))
    with pytest.raises(ValueError, match="track 'core' has 6 units but its section has 5 compartments"):
        slots_for(load_catalog(tmp_path))


def test_conduits_run_along_the_spine_from_edge_to_edge(tmp_path):
    _write(tmp_path)
    station = layout(load_catalog(tmp_path), set())
    git = next(n for d in station.decks for n in d.nodes if n.slug == "git")
    shell = ship.SLOTS["core"][0]  # the ring's top pod, above the spine: the conduit leaves its bottom edge
    target = ship.SLOTS["core"][1]  # a hull window above the spine: the conduit enters its bottom edge
    spine = (ship.SPINE[1] + ship.SPINE[3]) / 2
    assert git.conduits[0].path == (
        f"M{shell[0] + 8:g} {shell[1] + 10:g}V{spine:g}H{target[0] + 8:g}V{target[1] + 10:g}"
    )


def test_wrap_drops_the_subtitle():
    assert wrap("Networking: DNS, HTTP, TLS & SSH") == ("Networking",)


# --- the page ------------------------------------------------------------------------------
@pytest.mark.criterion(78, "The map is the Meridian")
def test_the_map_is_the_meridian(logged_in, map_curriculum, client):
    complete(logged_in, "one")
    complete(logged_in, "two")
    page = logged_in.get("/map").text
    assert '<div class="ship">' in page and f'viewBox="0 0 {ship.W} {ship.H}"' in page
    assert re.search(r'Life Support\s*<tspan class="deck-count">1/3</tspan>', _deck(page, "core"))
    assert re.search(r'Cargo &amp; Fabrication\s*<tspan class="deck-count">0/1</tspan>', _deck(page, "containers"))
    css = client.get("/static/css/style.css").text
    assert 'url("../img/ship.png")' in css


@pytest.mark.criterion(24, "The map shows every unit in its deck")
@pytest.mark.criterion(78, "Every unit is a compartment in its deck's section")
def test_every_unit_is_a_compartment_in_its_decks_section(logged_in, map_curriculum):
    page = logged_in.get("/map").text
    core, containers = _deck(page, "core"), _deck(page, "containers")
    assert re.findall(r'data-unit="([a-z-]+)"', core) == ["shell", "git", "net"]
    assert re.findall(r'data-unit="([a-z-]+)"', containers) == ["docker"]
    for unit, (x, y) in zip(("shell", "git", "net"), ship.SLOTS["core"], strict=False):  # in syllabus order
        assert f'<rect class="room" x="{x}" y="{y}" width="{ship.SLOT_W}" height="{ship.SLOT_H}"/>' in _node(page, unit)
    x, y = ship.SLOTS["containers"][0]
    assert f'<rect class="room" x="{x}" y="{y}"' in _node(page, "docker")


@pytest.mark.criterion(24, "Node state reflects progress")
@pytest.mark.criterion(78, "Compartments light up with progress")
def test_compartments_light_up_with_progress(logged_in, map_curriculum):
    complete(logged_in, "one")
    complete(logged_in, "two")
    page = logged_in.get("/map").text
    assert _state(page, "shell") == "complete"
    assert _state(page, "git") == "available"
    assert _state(page, "net") == "available"
    assert _state(page, "docker") == "locked"
    assert '<a class="node available soon" href="/syllabus#unit-net"' in page  # no modules: shuttered
    assert '<a class="node available" href="/syllabus#unit-git"' in page
    assert "<title>2.1 Docker · coming soon · waiting on Git, Networking</title>" in page


def test_nothing_done_leaves_only_the_first_unit_available(logged_in, map_curriculum):
    page = logged_in.get("/map").text
    assert [_state(page, u) for u in ("shell", "git", "net", "docker")] == ["available", "locked", "locked", "locked"]


@pytest.mark.criterion(24, "Nodes link to their units")
def test_compartments_link_to_their_units(logged_in, map_curriculum):
    page = logged_in.get("/map").text
    assert 'href="/syllabus#unit-git" data-unit="git"' in _node(page, "git")
    assert '<a href="/syllabus#unit-git">1.2 Git</a>' in page  # the text-equivalent list
    assert '<div class="unit" id="unit-git">' in logged_in.get("/syllabus").text


@pytest.mark.criterion(24, "Prerequisites are drawn")
@pytest.mark.criterion(78, "A compartment shows what feeds it")
def test_a_compartment_shows_what_feeds_it(logged_in, map_curriculum, client):
    complete(logged_in, "one")
    complete(logged_in, "two")
    page = logged_in.get("/map").text
    conduits = {
        unit: re.findall(r'<path class="conduit( is-lit)?" data-from="([a-z-]+)"', _node(page, unit))
        for unit in ("shell", "git", "net", "docker")
    }
    assert conduits == {
        "shell": [],
        "git": [(" is-lit", "shell")],
        "net": [(" is-lit", "shell")],
        "docker": [("", "git"), ("", "net")],  # lit once git and net are complete
    }
    css = client.get("/static/css/style.css").text
    assert ".conduits { opacity: 0;" in css
    assert ".node:hover .conduits, .node:focus-visible .conduits { opacity: 1; }" in css


def test_the_map_is_scoped_to_the_learner(logged_in, map_curriculum, make_user):
    other = make_user()
    with SessionLocal() as db:  # another learner has finished the shell unit
        db.add_all(ModuleProgress(user_id=other.id, module_slug=m, status="complete", score=100) for m in ("one", "two"))
        db.commit()
    assert _state(logged_in.get("/map").text, "shell") == "available"


def test_the_map_requires_login(client):
    assert client.get("/map", follow_redirects=False).status_code in (302, 303, 307)


def test_the_dashboard_and_nav_link_to_the_map(logged_in, map_curriculum):
    page = logged_in.get("/").text
    assert '<a href="/map">Open the station map →</a>' in page
    assert '<a href="/map">Map</a>' in page


def test_the_real_map_renders(logged_in):
    page = logged_in.get("/map").text
    assert page.count('<rect class="room"') == len(load_catalog().units)


def test_pulsing_respects_reduced_motion(client):
    css = client.get("/static/css/style.css").text
    assert "@media (prefers-reduced-motion: reduce) { .node.available .room { animation: none; }" in css


# --- #88: each unit's briefing, shown ---------------------------------------------------------
@pytest.mark.criterion(88, "The syllabus tells each unit's story")
def test_the_syllabus_tells_each_units_story(logged_in):
    page = logged_in.get("/syllabus").text
    catalog = load_catalog()
    for unit in catalog.units.values():
        if unit.briefing_html:
            block = page[page.index(f'<div class="unit" id="unit-{unit.slug}">') :]
            block = block[: block.index("</h3>") + 200]
            assert '<div class="unit-briefing transmission">' in block, unit.slug
    assert "Chief Okafor wants the routine checks written down as scripts" in page


@pytest.mark.criterion(88, "The map says why a system matters")
def test_the_map_says_why_a_system_matters(logged_in):
    page = logged_in.get("/map").text
    tooltip = re.search(r'data-unit="bash-scripting">\s*<title>([^<]*)</title>', page).group(1)
    assert tooltip.startswith("1.2 Bash scripting · ")  # then its progress, which changes as modules are written
    assert tooltip.endswith("\nTyping the same twelve commands every shift is how mistakes happen.")
    assert '<span class="unit-brief">Typing the same twelve commands every shift is how mistakes happen.</span>' in page


def test_first_sentence_is_plain_text():
    from app.station_map import first_sentence

    assert first_sentence("<p>The <em>Meridian</em>'s air is bad. Fix it.</p>") == "The Meridian's air is bad."
    assert first_sentence("<p>Is it on? Check.</p>") == "Is it on?"
    assert first_sentence("") == ""


def test_a_units_first_module_opens_with_its_briefing(logged_in, tmp_path):
    syllabus = SYLLABUS.replace("        title: \"Linux & the shell: the basics\"\n",
                                "        title: \"Linux & the shell: the basics\"\n        briefing: The scrubbers need you.\n")
    _write(tmp_path, syllabus)
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    try:
        first = logged_in.get("/modules/one").text
        assert '<div class="unit-briefing transmission"><p>The scrubbers need you.</p>' in first
        complete(logged_in, "one")
        assert "unit-briefing" not in logged_in.get("/modules/two").text  # only the first module
    finally:
        app.dependency_overrides.pop(get_catalog, None)
