"""The desk (#38): the room, the monitor, the comms log and window events.

Route tests use a throwaway curriculum: unit `shell` has `one` (with comms)
then `two` (comms, a console task, and a window event on completion).
"""

import json
import re
import textwrap
from datetime import UTC, datetime, timedelta

import pytest

from app.content import ContentError, get_catalog, load_catalog
from app.db import SessionLocal
from app.main import app
from app.models import ModuleProgress
from tests.conftest import csrf
from tests.test_progress import complete
from tests.test_terminal import TERMINAL, _state
from tests.test_xp import MODULE, SYLLABUS

CAST = """
cast:
  - {slug: okafor, name: Okafor, role: Chief Engineer, avatar: okafor}
  - {slug: mission, name: Mission Control, role: Earth, avatar: mission, delay: "1.3 s"}
"""

COMMS_ONE = """comms:
  open:
    - {from: okafor, text: "One, *open*."}
  complete:
    - {from: okafor, text: "One, complete."}
"""

COMMS_TWO = """comms:
  open:
    - {from: okafor, text: "Two, open."}
    - {from: mission, text: "Two, open, from Earth."}
  console_done:
    - {from: okafor, text: "Two, console done."}
  complete:
    - {from: okafor, text: "Two, complete."}
  window: {complete: shuttle-dock}
"""


def _write(root, comms_one=COMMS_ONE, comms_two=COMMS_TWO, terminal=TERMINAL):
    (root / "syllabus.yml").write_text(textwrap.dedent(SYLLABUS) + textwrap.dedent(CAST))
    (root / "core" / "shell").mkdir(parents=True)
    one = MODULE.format(title="One", xp=50).replace("---\nLesson.", comms_one + "---\nLesson.", 1)
    two = MODULE.format(title="Two", xp=50).replace("---\nLesson.", terminal + comms_two + "---\nLesson.", 1)
    (root / "core/shell/01-one.md").write_text(one)
    (root / "core/shell/02-two.md").write_text(two)


@pytest.fixture
def desk(tmp_path):
    _write(tmp_path)
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    yield
    app.dependency_overrides.pop(get_catalog, None)


def _lines(html: str) -> list[tuple[str, str, bool]]:
    """(beat, sender's name, new?) for every comms line, in order."""
    out = []
    for m in re.finditer(r'<li class="comms-line from-[a-z-]+( is-new)?" data-beat="([a-z_]+)".*?<p class="who">([^<]+?) <', html, re.S):
        out.append((m.group(2), m.group(3).strip(), bool(m.group(1))))
    return out


# --- the frame ------------------------------------------------------------------------
@pytest.mark.criterion(38, "Every page sits on the desk monitor")
@pytest.mark.parametrize("path", ["/", "/syllabus", "/map", "/badges", "/modules/the-filesystem"])
def test_every_page_sits_on_the_desk_monitor(logged_in, path):
    page = logged_in.get(path).text
    scene = page.index('<div class="scene">')
    room = page.index('<div class="room" aria-hidden="true">', scene)
    monitor = page.index('<div class="monitor">', room)
    assert monitor < page.index('<main class="container">') < page.index("</main>")
    assert '<aside class="comms" aria-labelledby="comms-title">' in page


def test_the_login_page_is_on_the_monitor_too_without_comms(client):
    page = client.get("/login").text
    assert '<div class="monitor">' in page and '<aside class="comms"' not in page


def test_the_room_is_drawn_from_the_art(client):
    css = client.get("/static/css/style.css").text
    assert 'url("../img/room.png")' in css and "image-rendering: pixelated" in css
    assert client.get("/static/img/room.png").headers["content-type"] == "image/png"


# --- comms ------------------------------------------------------------------------------
@pytest.mark.criterion(38, "The briefing arrives as messages")
def test_the_briefing_arrives_as_messages(logged_in, desk):
    complete(logged_in, "one")
    first = logged_in.get("/modules/two").text
    assert _lines(first)[-2:] == [("open", "Okafor", True), ("open", "Mission Control", True)]
    assert '<span class="delay">+1.3 s light-delay</span>' in first
    assert "Briefing incoming on comms" in first and "data-transmission" not in first
    assert re.search(r'<script src="[^"]*/static/js/comms.js" defer></script>', first)
    again = logged_in.get("/modules/two").text
    assert not any(new for _, _, new in _lines(again))  # a briefing arrives once


@pytest.mark.criterion(38, "The comms log keeps the history")
def test_the_comms_log_keeps_the_history(logged_in, desk, user):
    complete(logged_in, "one")
    complete(logged_in, "two")
    with SessionLocal() as db:  # make two the earlier completion: order follows completion time
        rows = {p.module_slug: p for p in db.query(ModuleProgress).filter_by(user_id=user.id)}
        rows["two"].completed_at = datetime.now(UTC) - timedelta(hours=2)
        rows["one"].completed_at = datetime.now(UTC) - timedelta(hours=1)
        db.commit()
    for path in ("/", "/badges"):
        assert [(b, who) for b, who, _ in _lines(logged_in.get(path).text)] == [
            ("open", "Okafor"), ("open", "Mission Control"), ("complete", "Okafor"),  # two, without console_done
            ("open", "Okafor"), ("complete", "Okafor"),  # then one
        ]


def test_an_empty_log_says_so(logged_in, desk):
    page = logged_in.get("/").text
    assert '<li class="comms-empty muted">No messages yet.' in page and not _lines(page)


@pytest.mark.criterion(38, "Finishing the console task gets a reply")
def test_finishing_the_console_task_gets_a_reply(logged_in, desk):
    complete(logged_in, "one")

    def report():
        return logged_in.post(
            "/modules/two/terminal",
            content=json.dumps({"state": _state(0o600), "cwd": "/station", "passed": True}),
            headers={"Content-Type": "application/json", "X-CSRF-Token": csrf(logged_in)},
        ).json()

    body = report()
    assert body["correct"] is True
    assert _lines(body["comms"]) == [("console_done", "Okafor", True)]
    assert "Two, console done." in body["comms"]
    assert "comms" not in report()  # the reply comes once
    assert ("console_done", "Okafor", False) in _lines(logged_in.get("/modules/two").text)


@pytest.mark.criterion(38, "A story event plays outside the window")
def test_a_story_event_plays_outside_the_window(logged_in, desk):
    complete(logged_in, "one")
    last = complete(logged_in, "two")
    assert '<div id="window-event" class="window-event shuttle-dock" hx-swap-oob="true" data-event="shuttle-dock">' in last.text
    assert '<div hx-swap-oob="beforeend:#comms-log">' in last.text
    assert _lines(last.text) == [("complete", "Okafor", True)]
    revisit = logged_in.get("/modules/two").text
    assert '<div id="window-event" class="window-event"></div>' in revisit  # once, then the view settles
    assert "shuttle-dock" not in revisit


def test_completing_a_module_without_comms_sends_nothing_to_the_log(logged_in, tmp_path):
    _write(tmp_path, comms_one="")
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    try:
        last = complete(logged_in, "one")
        assert "comms-log" not in last.text and "window-event" not in last.text
    finally:
        app.dependency_overrides.pop(get_catalog, None)


@pytest.mark.criterion(38, "Motion respects the system setting")
def test_motion_respects_the_system_setting(client):
    css = client.get("/static/css/style.css").text
    reduced = "".join(re.findall(r"@media \(prefers-reduced-motion: reduce\) \{(.*?)\n\}", css, re.S))
    assert ".window-event.shuttle-dock img { animation: none; }" in reduced  # the event is a still
    assert ".comms-line.is-new.shown { animation: none; }" in reduced
    js = client.get("/static/js/comms.js").text
    assert 'matchMedia("(prefers-reduced-motion: reduce)")' in js and "if (still) return showAll();" in js


def test_comms_lines_are_scoped_to_the_learner(logged_in, desk, make_user):
    other = make_user()
    with SessionLocal() as db:
        db.add(ModuleProgress(user_id=other.id, module_slug="one", status="complete", score=100, completed_at=datetime.now(UTC)))
        db.commit()
    assert not _lines(logged_in.get("/").text)


# --- validation -----------------------------------------------------------------------------
@pytest.mark.criterion(38, "Comms are validated")
def test_a_message_from_someone_not_in_the_cast_fails(tmp_path):
    _write(tmp_path, comms_two=COMMS_TWO.replace("{from: mission,", "{from: okafr,"))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "core/shell/02-two.md: comms.open.1.from: 'okafr' is not in the cast" in str(exc.value)


@pytest.mark.parametrize(
    ("change", "expect"),
    [
        (lambda c2, t: (c2, ""), "comms.console_done: the module has no terminal exercise"),
        (lambda c2, t: (c2.replace("shuttle-dock", "warp-jump"), t), "comms.window.complete"),
        (lambda c2, t: (c2.replace('text: "Two, open."}', 'words: "Two, open."}'), t), "comms.open.0"),
    ],
)
def test_bad_comms_are_reported(tmp_path, change, expect):
    comms_two, terminal = change(COMMS_TWO, TERMINAL)
    _write(tmp_path, comms_two=comms_two, terminal=terminal)
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert expect in str(exc.value)


def test_the_real_cast_and_the_pilot_module():
    catalog = load_catalog()
    assert set(catalog.cast) == {"okafor", "meridian", "mission"}
    pilot = catalog.modules["permissions"].comms
    assert pilot.open and pilot.console_done and pilot.complete and pilot.window == {"complete": "shuttle-dock"}


# --- #45: all of Unit 1.1 on comms ----------------------------------------------------------
@pytest.mark.criterion(45, "Every Unit 1.1 module is told on comms")
def test_every_unit_1_1_module_is_told_on_comms():
    for module in load_catalog().unit_modules("linux-shell"):
        assert module.comms and module.comms.open and module.comms.complete, module.slug
        assert bool(module.comms.console_done) == bool(module.terminal), module.slug


def test_the_stations_figures_match_the_exercises():
    # MERIDIAN quotes numbers; they must be true of the console the learner sees.
    from app.terminal import client_spec

    catalog = load_catalog()

    def said(slug):
        return " ".join(html for beat in catalog.modules[slug].comms_html.values() for _, html in beat)

    log = client_spec(catalog.modules["text-tools"].terminal)["fs"]["/var/log/docking/access.log"]["contents"]
    logins = [line for line in log.splitlines() if "POST /login" in line]
    assert f"{len(logins)} LOGIN ATTEMPTS" in said("text-tools")
    assert f"{sum(' 401 ' in line for line in logins)} FAILED" in said("text-tools")
    scrubbers = client_spec(catalog.modules["the-filesystem"].terminal)["fs"]["/var/log/life-support/scrubbers.log"]["contents"]
    assert "02:40 scrubber B: offline" in scrubbers and "OFFLINE SINCE 02:40" in said("the-filesystem")
    core = client_spec(catalog.modules["pipes-and-redirection"].terminal)["fs"]["/station/reactor/core.log"]["contents"]
    assert f"{core.count('ALERT')} ALERTS" in said("pipes-and-redirection")
    diag = next(p for p in catalog.modules["processes-and-signals"].terminal.processes if "o2-diagnostics" in p.command)
    assert f"CPU {diag.cpu}%" in said("processes-and-signals")


@pytest.mark.criterion(45, "The unit's end is marked outside the window")
def test_the_units_end_is_marked_outside_the_window(logged_in, user):
    unit = load_catalog().unit_modules("linux-shell")
    with SessionLocal() as db:
        for m in unit[:-1]:
            db.add(ModuleProgress(user_id=user.id, module_slug=m.slug, status="complete", score=100, completed_at=datetime.now(UTC)))
        db.commit()
    last = unit[-1]
    logged_in.get(f"/modules/{last.slug}")
    from tests.test_progress import answer

    for i, q in enumerate(last.quiz):
        values = [str(q.answer)] if q.type == "choice" else [str(a) for a in q.answer] if q.type == "multi" else [q.answer[0]]
        response = answer(logged_in, last.slug, i, *values)
    assert '<div id="window-event" class="window-event aurora" hx-swap-oob="true" data-event="aurora">' in response.text
    assert 'src="http://testserver/static/img/aurora.png"' in response.text
    assert "aurora" not in logged_in.get(f"/modules/{last.slug}").text.split('id="window-event"')[1][:80]  # once


def test_open_and_console_done_beats_can_play_window_events(logged_in, tmp_path):
    two = COMMS_TWO.replace("window: {complete: shuttle-dock}", "window: {open: relay-pass, console_done: debris-drift}")
    _write(tmp_path, comms_two=two)
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    try:
        complete(logged_in, "one")
        first = logged_in.get("/modules/two").text
        assert '<div id="window-event" class="window-event relay-pass" data-event="relay-pass">' in first
        assert '<div id="window-event" class="window-event"></div>' in logged_in.get("/modules/two").text  # first visit only
        body = logged_in.post(
            "/modules/two/terminal",
            content=json.dumps({"state": _state(0o600), "cwd": "/station", "passed": True}),
            headers={"Content-Type": "application/json", "X-CSRF-Token": csrf(logged_in)},
        ).json()
        assert '<div id="window-event" class="window-event debris-drift" data-event="debris-drift">' in body["window"]
    finally:
        app.dependency_overrides.pop(get_catalog, None)


@pytest.mark.criterion(45, "New window events respect reduced motion")
def test_new_window_events_respect_reduced_motion(client):
    from app.comms import WINDOW_SPRITES

    css = client.get("/static/css/style.css").text
    reduced = "".join(re.findall(r"@media \(prefers-reduced-motion: reduce\) \{(.*?)\n\}", css, re.S))
    assert ".window-event img { animation: none; }" in reduced
    for event in WINDOW_SPRITES:  # each event is animated, and each has a still position to fall back to
        rule = re.search(rf"\.window-event\.{event} img \{{(.*?)\}}", css, re.S).group(1)
        assert "animation:" in rule and "left:" in rule and "top:" in rule, event


def test_every_window_event_has_a_sprite_drawn_as_code():
    from typing import get_args

    from app.comms import WINDOW_SPRITES
    from app.content.schema import WindowEvent
    from art import build

    assert set(WINDOW_SPRITES) == set(get_args(WindowEvent))
    for event, (name, width, height) in WINDOW_SPRITES.items():
        drawn = build.scenes()[name]()
        assert (drawn.width, drawn.height) == (width, height), event
