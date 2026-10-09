"""The station map (#24).

Route tests use a throwaway curriculum of two decks:

    core:  shell (one → two)  ─┬→ git (placed by `map:`)
                               └→ net (no modules: "coming soon")
    ops:   docker  ← git, net
"""

import re
import textwrap

import pytest

from app.content import ContentError, get_catalog, load_catalog
from app.db import SessionLocal
from app.main import app
from app.models import ModuleProgress
from app.station_map import auto_position, layout
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
        map: {x: 10, y: 90}
      - slug: net
        title: Networking
        prerequisites: [shell]
  - slug: ops
    title: Operations
    deck: Cargo
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
    """The SVG group holding a deck's name and nodes."""
    return re.search(rf'<g class="deck-nodes deck--{slug}">(.*?)\n    </g>', page, re.S).group(1)


def _node(page: str, unit: str) -> str:
    return re.search(rf'<a class="node [a-z]+" href="[^"]*" data-unit="{unit}">.*?</a>', page, re.S).group(0)


def _state(page: str, unit: str) -> str:
    return re.match(r'<a class="node ([a-z]+)"', _node(page, unit)).group(1)


# --- layout (pure) -------------------------------------------------------------------
def test_auto_positions_fill_a_grid_inside_the_drawing_area():
    assert [auto_position(i, 1) for i in range(1)] == [(50, 50)]
    four = [auto_position(i, 4) for i in range(4)]
    assert four[:3] == [(17, 25), (50, 25), (83, 25)]  # a full row of three
    assert four[3] == (50, 75)  # a short last row is centred
    for count in range(1, 30):
        assert all(0 <= v <= 100 for i in range(count) for v in auto_position(i, count))


def test_placed_and_automatic_units_land_inside_their_deck(tmp_path):
    _write(tmp_path)
    station = layout(load_catalog(tmp_path), set())
    for deck in station.decks:
        for node in deck.nodes:
            assert 0 < node.x < station.width
            assert deck.y < node.y < deck.y + deck.height
    git = next(n for n in station.decks[0].nodes if n.slug == "git")
    shell = station.decks[0].nodes[0]
    assert git.x < shell.x and git.y > shell.y  # map: {x: 10, y: 90} is bottom left


def test_labels_drop_the_subtitle_and_wrap(tmp_path):
    _write(tmp_path)
    shell = layout(load_catalog(tmp_path), set()).decks[0].nodes[0]
    assert shell.label == ("Linux & the", "shell")
    assert shell.tooltip == "Linux & the shell: the basics · 0/2 modules"


def test_the_real_curriculum_lays_out_every_unit_inside_its_deck():
    catalog = load_catalog()
    station = layout(catalog, set())
    assert sum(len(d.nodes) for d in station.decks) == len(catalog.units)
    for deck in station.decks:
        assert all(deck.y < n.y < deck.y + deck.height for n in deck.nodes)


# --- validation ------------------------------------------------------------------------
@pytest.mark.criterion(24, "Map coordinates are validated")
def test_map_coordinates_outside_the_drawing_area_fail_validation(tmp_path):
    _write(tmp_path, SYLLABUS.replace("map: {x: 10, y: 90}", "map: {x: 120, y: 90}"))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "syllabus.yml: unit 'git' map position (120, 90) is outside the drawing area" in str(exc.value)


def test_a_typo_in_map_is_rejected(tmp_path):
    _write(tmp_path, SYLLABUS.replace("map: {x: 10, y: 90}", "map: {x: 10, z: 90}"))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "units.1.map" in str(exc.value)


# --- the page ----------------------------------------------------------------------------
@pytest.mark.criterion(24, "The map shows every unit in its deck")
def test_the_map_shows_every_unit_in_its_deck(logged_in, map_curriculum):
    page = logged_in.get("/map").text
    core, ops = _deck(page, "core"), _deck(page, "ops")
    assert re.findall(r'data-unit="([a-z-]+)"', core) == ["shell", "git", "net"]
    assert re.findall(r'data-unit="([a-z-]+)"', ops) == ["docker"]
    assert "Life Support" in core and "Cargo" in ops


@pytest.mark.criterion(24, "Node state reflects progress")
def test_node_state_reflects_progress(logged_in, map_curriculum):
    complete(logged_in, "one")
    complete(logged_in, "two")
    page = logged_in.get("/map").text
    assert _state(page, "shell") == "complete"
    assert _state(page, "git") == "available"
    assert _state(page, "net") == "available"
    assert _state(page, "docker") == "locked"
    assert "<title>Docker · 0/0 modules" not in page  # an empty unit says so
    assert "<title>Docker · coming soon · waiting on Git, Networking</title>" in page


def test_nothing_done_leaves_only_the_first_unit_available(logged_in, map_curriculum):
    page = logged_in.get("/map").text
    assert [_state(page, u) for u in ("shell", "git", "net", "docker")] == ["available", "locked", "locked", "locked"]


@pytest.mark.criterion(24, "Nodes link to their units")
def test_nodes_link_to_their_units(logged_in, map_curriculum):
    page = logged_in.get("/map").text
    assert 'href="/syllabus#unit-git" data-unit="git"' in _node(page, "git")
    assert '<a href="/syllabus#unit-git">2.1 Git</a>' not in page  # codes are per deck: git is 1.2
    assert '<a href="/syllabus#unit-git">1.2 Git</a>' in page  # the text-equivalent list
    assert '<div class="unit" id="unit-git">' in logged_in.get("/syllabus").text


@pytest.mark.criterion(24, "Prerequisites are drawn")
def test_prerequisites_are_drawn(logged_in, map_curriculum):
    complete(logged_in, "one")
    complete(logged_in, "two")
    page = logged_in.get("/map").text
    edges = re.findall(r'<line class="edge( is-lit)?" data-from="([a-z-]+)" data-to="([a-z-]+)"', page)
    assert sorted((src, dst) for _, src, dst in edges) == [
        ("git", "docker"), ("net", "docker"), ("shell", "git"), ("shell", "net")
    ]
    lit = {(src, dst) for is_lit, src, dst in edges if is_lit}
    assert lit == {("shell", "git"), ("shell", "net")}  # lit once the prerequisite is complete


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
