"""Unit 1.5, systemd & services: each module is complete content, its console task
can be done, and the figures the crew quotes are true of the console's services.

That a reference solution passes *in the console* is tests/js/solutions.test.js's
job; here the server grades the end state the solution leaves. The console's
systemctl itself is tests/test_systemd.py's and tests/js/systemd.test.js's."""

import pytest

from app.content import load_catalog
from app.terminal import Node, UnitState, grade
from tests.test_bash_scripting import _complete_content, _said, _start


def _module(slug):
    return load_catalog().modules[slug]


def _with_file(state, path, contents):
    return {**state, path: Node(type="file", mode=0o664, owner="cadet", group="crew", contents=contents)}


def _description(service):
    return service.sections()["Unit"]["Description"][0]


# --- 01: What a service is (#305) -------------------------------------------------------------
DOWN = "/home/cadet/down.txt"
LINES = [
    "recycler.service failed",
    "co2-monitor.service failed",
    "o2-backup.service inactive",
    "cabin-fans.service inactive",
]


@pytest.mark.criterion(305, "Module 01 of Unit 1.5 is complete content")
def test_module_01_is_complete_content():
    module = load_catalog().unit_modules("systemd")[0]
    assert module.slug == "services"
    _complete_content(module)


@pytest.mark.criterion(305, "Module 01's task can be solved with what the lesson teaches")
def test_module_01s_end_state_passes_on_the_server():
    exercise = _module("services").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _with_file(start, DOWN, "\n".join(LINES) + "\n"), exercise.cwd)


@pytest.mark.criterion(305, "Module 01's task can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    "report",
    [
        LINES[:2],  # systemctl --failed alone: the inactive ones never show
        LINES + ["galley-display.service failed"],  # failed, but not life support
        LINES + ["hydroponics-lights.service inactive"],  # inactive, but not life support
        [line.replace(".service", "") for line in LINES],  # short names, not the units in full
        [line.replace("inactive", "dead") for line in LINES],  # SUB, not ACTIVE
        LINES + ["scrubberd.service active"],  # a running one
    ],
    ids=["failed-only", "galley", "hydroponics", "short-names", "sub-column", "running-one"],
)
def test_module_01_refuses_the_misreadings(report):
    exercise = _module("services").terminal
    assert not grade(exercise, _with_file(_start(exercise), DOWN, "\n".join(report) + "\n"), exercise.cwd)


def test_module_01s_figures_match_the_console():
    module = _module("services")
    exercise = module.terminal
    life = [s for s in exercise.services if _description(s).startswith("Life support:")]
    down = {s.name: s.state for s in life if s.state != "active"}
    # The checks are the life-support services that aren't running, with their states.
    assert {c.text for c in exercise.checks if hasattr(c, "contains")} == {f"{n} {s}" for n, s in down.items()}
    # Every service that should be left out is, by name: the running ones and the others.
    left_out = [s.name for s in exercise.services if s.name not in down]
    lacks = [c.text for c in exercise.checks if hasattr(c, "lacks")]
    assert all(any(text in name for text in lacks) for name in left_out)
    assert not any(text in name for text in lacks for name in down)
    # A decoy of each kind: a failed and an inactive service that aren't life support.
    others = {s.state for s in exercise.services if s not in life}
    assert {"failed", "inactive"} <= others
    # The two that failed are enabled (they started at boot and crashed); the two inactive ones
    # never were, which module 02 picks up.
    assert all(s.enabled == (s.state == "failed") for s in life if s.state != "active")
    # What MERIDIAN says is true.
    assert f"LIFE SUPPORT SERVICES: {len(life)} · RUNNING: {len(life) - len(down)}" in _said(module, "open")
    done = _said(module, "console_done")
    for name, state in down.items():
        assert f"{name.removesuffix('.service').upper()} · {state.upper()}" in done
    # The lesson, quiz and cards use none of the task's unit names.
    quoted = module.body_html + " ".join(
        [q.q + (q.code or "") + " ".join(getattr(q, "options", [])) for q in module.quiz]
        + [c.front_html + c.back_html for c in module.cards]
    )
    for service in exercise.services:
        if service.name != "cron.service":
            assert service.name.removesuffix(".service") not in quoted, service.name


# --- 04: Writing a service (#308) -------------------------------------------------------------
UNIT_FILE = "/etc/systemd/system/o2-monitor.service"
WRITTEN = """[Unit]
Description=Life support: O2 monitor

[Service]
ExecStart=/usr/local/sbin/o2-monitor
User=o2mon
Environment=O2_FLOOR_PCT=19.5
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
O2_WANTS = "/etc/systemd/system/multi-user.target.wants/o2-monitor.service"


def _written(state, unit=WRITTEN, enabled=True):
    state = {**state, UNIT_FILE: Node(type="file", mode=0o644, owner="root", group="root", contents=unit)}
    if enabled:
        state[O2_WANTS] = Node(type="link", mode=0o777, owner="root", group="root", target=UNIT_FILE)
    return state


UP = [UnitState(name="o2-monitor.service", state="active"), UnitState(name="scrubberd.service", state="active")]


@pytest.mark.criterion(308, "Module 04 of Unit 1.5 is complete content")
def test_module_04_is_complete_content():
    module = next(m for m in load_catalog().unit_modules("systemd") if m.slug == "writing-a-service")
    _complete_content(module)


@pytest.mark.criterion(308, "Module 04's task can be solved with what the lesson teaches")
def test_module_04s_end_state_passes_on_the_server():
    exercise = _module("writing-a-service").terminal
    start = _start(exercise)
    assert UNIT_FILE not in start
    assert not grade(exercise, start, exercise.cwd, [], [UnitState(name="o2-monitor.service", state="inactive")])
    assert grade(exercise, _written(start), exercise.cwd, [], UP)


@pytest.mark.criterion(308, "Module 04's task can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("unit", "enabled", "units"),
    [
        (WRITTEN.replace("User=o2mon\n", ""), True, UP),  # runs as root
        (WRITTEN.replace("Restart=on-failure", "Restart=always"), True, UP),  # always, not on-failure
        (WRITTEN.replace("RestartSec=5\n", ""), True, UP),  # no wait between tries
        (WRITTEN.replace("Environment=O2_FLOOR_PCT=19.5\n", ""), True, UP),  # no alarm setting
        (WRITTEN, False, UP),  # started, never enabled
        (WRITTEN, True, [UnitState(name="o2-monitor.service", state="inactive")]),  # enabled, not started
        (WRITTEN.replace("Restart=on-failure\n", ""), True, [UnitState(name="o2-monitor.service", state="failed")]),  # crashed, stayed down
    ],
    ids=["no-user", "restart-always", "no-restartsec", "no-environment", "not-enabled", "not-started", "crashed"],
)
def test_module_04_refuses_the_half_units(unit, enabled, units):
    exercise = _module("writing-a-service").terminal
    assert not grade(exercise, _written(_start(exercise), unit, enabled), exercise.cwd, [], units)


def test_module_04s_unit_loads_and_its_figures_match():
    from app.content.schema.terminal.services import SystemdUnit

    module = _module("writing-a-service")
    exercise = module.terminal
    # The reference unit is valid by the console's own rules, and its program and user exist.
    written = SystemdUnit(name="o2-monitor.service", unit=WRITTEN, dir="/etc/systemd/system", enabled=True)
    assert written.program() in {f.path for f in exercise.files}
    assert "o2mon" in {a.name for a in exercise.accounts}
    # The program crashes, so a unit without Restart= would leave it failed (the task's hint).
    monitor = next(s for s in exercise.services if s.name == "o2-monitor.service")
    assert monitor.unit is None and monitor.exits and monitor.runs_for == 600 and "sleep 700" in exercise.task
    # The solution writes the same unit, line for line.
    lines = [s.split("'")[1] for s in exercise.solution if "| sudo tee" in s]
    assert [line for line in WRITTEN.splitlines() if line] == lines
    # MERIDIAN's readout is the checks.
    done = _said(module, "console_done")
    assert "USER: O2MON" in done and "RESTART: ON-FAILURE · 5 S" in done
    # The lesson's examples use none of the task's settings.
    quoted = module.body_html + " ".join(
        [q.q + (q.code or "") + " ".join(getattr(q, "options", [])) for q in module.quiz]
        + [c.front_html + c.back_html for c in module.cards]
    )
    for figure in ("o2-monitor", "o2mon", "O2_FLOOR_PCT", "19.5"):
        assert figure not in quoted, figure
