"""Unit 1.3, Git: each module is complete content, and its lab's checks pass what a
real run prints on any machine and refuse the likely mistakes.

That the steps can be done for real is checked by hand in ubuntu:24.04, and each
box's `example` is pasted from that run (docs/content-authoring.md)."""

import pytest

from app import lab
from app.content import load_catalog


def _module(slug):
    return load_catalog().modules[slug]


def _complete_content(module):
    assert module.body_html and "<h2>Try it</h2>" in module.body_html
    assert any(q.code for q in module.quiz), "a scenario question: a script or output, then a question"
    assert len(module.cards) >= 3
    assert module.lab and module.terminal is None
    assert {"open", "lab_done", "complete"} <= module.comms_html.keys()


def _passes(module, *pastes):
    return lab.grade(module.lab, list(pastes)).passed


# --- 01: Your first repository (#125) -----------------------------------------------------
CLEAN = "On branch master\nnothing to commit, working tree clean\n"


@pytest.mark.criterion(125, "Module 01 of Unit 1.3 is complete content")
def test_module_01_is_complete_content():
    module = load_catalog().unit_modules("git")[0]
    assert module.slug == "your-first-repository"
    _complete_content(module)


@pytest.mark.parametrize(
    "log",
    [
        "1d1ba4d (HEAD -> master) Set the O2 floor to 19.5%\nf474e13 Track airmix.conf\n",  # a terminal
        "1d1ba4d Set the O2 floor to 19.5%\nf474e13 Track airmix.conf\n",  # piped
        "1d1ba4d (HEAD -> main) Set the O2 floor to 19.5%\r\nf474e13 Track airmix.conf\r\n",  # newer git, Windows
        "\n1d1ba4dbe (HEAD -> main) Set the O2 floor to 19.5%  \nf474e13ab Track airmix.conf\n\n",  # a loose paste
    ],
)
def test_module_01s_lab_passes_any_machines_log(log):
    assert _passes(_module("your-first-repository"), log, CLEAN.replace("master", "main"))


@pytest.mark.parametrize(
    "log, status",
    [
        ("1d1ba4d (HEAD -> master) Track airmix.conf\n", CLEAN),  # both changes in one commit
        ("1d1ba4d Set O2 floor to 19.5\nf474e13 Track airmix.conf\n", CLEAN),  # not the task's message
        (
            "f474e13 (HEAD -> master) Track airmix.conf\n",  # the edit was never committed
            "On branch master\nChanges not staged for commit:\n\tmodified:   airmix.conf\n\n"
            'no changes added to commit (use "git add" and/or "git commit -a")\n',
        ),
        (
            "1d1ba4d Set the O2 floor to 19.5%\nf474e13 Track airmix.conf\n",
            "fatal: not a git repository (or any of the parent directories): .git\n",  # run elsewhere
        ),
    ],
)
def test_module_01s_lab_refuses_the_likely_mistakes(log, status):
    assert not _passes(_module("your-first-repository"), log, status)


# --- 02: Staging and diffs (#126) ---------------------------------------------------------
SHOW_ALARM = """commit 198ea12cdefa0695ef6002a4a645d6e24e113ec5 (HEAD -> main)
Author: Ada <ada@example.com>
Date:   Tue Oct 13 12:12:37 2026 +0000

    Lower the pressure-drop alarm to 2.5 kPa

-pressure_drop_alarm_kpa = 4.0
+pressure_drop_alarm_kpa = 2.5
"""
REGEN_LEFT = "@@ -10,4 +10,4 @@ regen_vent = overboard\n-regen_temp_c = 200\n+regen_temp_c = 240\n"


@pytest.mark.criterion(126, "Module 02 of Unit 1.3 is complete content")
def test_module_02_is_complete_content():
    module = load_catalog().unit_modules("git")[1]
    assert module.slug == "staging-and-diffs"
    _complete_content(module)


@pytest.mark.parametrize("status", [" M scrubber.conf\r\n", "M scrubber.conf\n"])  # a drag-select can drop the space
def test_module_02s_lab_passes_any_machines_output(status):
    assert _passes(_module("staging-and-diffs"), status, SHOW_ALARM.replace("\n", "\r\n"), REGEN_LEFT)


def test_module_02s_status_check_still_refuses_a_staged_file():
    status_check = _module("staging-and-diffs").lab.boxes[0].checks[0]
    for staged in ("M  scrubber.conf", "MM scrubber.conf", "?? scrubber.conf"):
        assert not lab.check(status_check, staged)


@pytest.mark.parametrize(
    "status, show, diff",
    [
        ("", SHOW_ALARM + "-regen_temp_c = 200\n+regen_temp_c = 240\n", ""),  # the whole file went in
        ("MM scrubber.conf\n", SHOW_ALARM.replace("Lower the pressure-drop", "Track scrubber.conf #"), REGEN_LEFT),  # staged, never committed
        ("", SHOW_ALARM, ""),  # the untested change was thrown away with git restore
        (" M scrubber.conf\n", SHOW_ALARM.replace("2.5 kPa\n", "2.5kPa\n"), REGEN_LEFT),  # not the task's message
        (" M scrubber.conf\n", SHOW_ALARM + "+regen_temp_c = 240\n", REGEN_LEFT),  # regen committed too
        (" M scrubber.conf\n", SHOW_ALARM, "-pressure_drop_alarm_kpa = 4.0\n+pressure_drop_alarm_kpa = 2.5\n"),  # the wrong hunk left over
    ],
)
def test_module_02s_lab_refuses_the_likely_mistakes(status, show, diff):
    assert not _passes(_module("staging-and-diffs"), status, show, diff)
