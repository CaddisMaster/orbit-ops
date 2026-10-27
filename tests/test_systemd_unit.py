"""Unit 1.5, systemd & services: each module is complete content, its console task
can be done, and the figures the crew quotes are true of the console's services.

That a reference solution passes *in the console* is tests/js/solutions.test.js's
job; here the server grades the end state the solution leaves. The console's
systemctl itself is tests/test_systemd.py's and tests/js/systemd.test.js's."""

import pytest

from app.content import load_catalog
from app.terminal import Node, grade
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
