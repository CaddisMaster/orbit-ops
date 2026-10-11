"""Unit 1.2, Bash scripting: each module is complete content, its console task
can be done, and the figures the crew quotes are true of the console's files.

That a reference solution passes *in the console* is tests/js/solutions.test.js's
job; here the server grades the end state the solution leaves."""

import re
from datetime import UTC, datetime

import pytest

from app.content import load_catalog
from app.db import SessionLocal
from app.models import ModuleProgress
from app.terminal import Node, client_spec, grade


def _module(slug):
    return load_catalog().modules[slug]


def _said(module, beat=None):
    beats = [module.comms_html[beat]] if beat else module.comms_html.values()
    return " ".join(html for b in beats for _, html in b)


def _start(exercise):
    return {p: Node(**n) for p, n in exercise.starting_fs().items()}


def _with(state, path, contents):
    return {**state, path: state[path].model_copy(update={"contents": contents})}


def _complete_content(module):
    assert module.body_html and "<h2>Try it</h2>" in module.body_html
    assert any(q.code for q in module.quiz), "a scenario question: a script or output, then a question"
    assert len(module.cards) >= 3
    assert module.terminal and module.terminal.solution
    assert {"open", "console_done", "complete"} <= module.comms_html.keys()


def _unit_1_1_done(user):
    with SessionLocal() as db:
        for m in load_catalog().unit_modules("linux-shell"):
            db.add(ModuleProgress(user_id=user.id, module_slug=m.slug, status="complete", score=100, completed_at=datetime.now(UTC)))
        db.commit()


def test_a_scenario_questions_code_is_shown_before_and_after_answering(logged_in, user):
    from tests.test_progress import answer

    _unit_1_1_done(user)
    block = '<div class="prose question-code"><pre class="highlight" data-lang="text"><code>$ nano /etc/nginx/sites-available/orbit-ops'
    page = logged_in.get("/modules/reading-and-editing").text
    assert "</legend>\n    " + block in page  # under the question, outside the <legend>
    # An option is one flex item, so inline code wraps with its sentence instead of on its own.
    assert "<span>The file belongs to root. Leave with ^X (answer N), then reopen it with <code>sudo nano</code></span></label>" in page
    answered = answer(logged_in, "reading-and-editing", 0, "0").text
    assert block in answered
    assert "<span>The file belongs to root. Leave with ^X (answer N), then reopen it with <code>sudo nano</code> <span class=\"muted\">(your answer)</span></span>" in answered


# --- 01: Reading and editing on a server (#68) -------------------------------------------
CONF = "/etc/scrubber/scrubber.conf"


@pytest.mark.criterion(68, "Module 01 of Unit 1.2 is complete content")
def test_module_01_is_complete_content():
    module = load_catalog().unit_modules("bash-scripting")[0]
    assert module.slug == "reading-and-editing"
    _complete_content(module)


@pytest.mark.criterion(68, "Module 01's console task can be done")
def test_module_01s_end_state_passes_on_the_server():
    exercise = _module("reading-and-editing").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    conf = start[CONF].contents
    # what the solution's `tee -a` leaves, and what saving in nano leaves
    assert grade(exercise, _with(start, CONF, conf + "co2_alarm_ppm = 5000\n"), exercise.cwd)
    assert grade(exercise, _with(start, CONF, conf.replace("log_level", "co2_alarm_ppm = 5000\nlog_level")), exercise.cwd)


def test_module_01_wants_the_alarm_not_the_warning_and_keeps_the_file():
    exercise = _module("reading-and-editing").terminal
    start = _start(exercise)
    conf = start[CONF].contents
    assert not grade(exercise, _with(start, CONF, conf.replace("co2_warn_ppm = 4000", "co2_warn_ppm = 5000")), exercise.cwd)
    assert not grade(exercise, _with(start, CONF, "co2_alarm_ppm = 5000\n"), exercise.cwd)  # `>` instead of `>>`


def test_module_01_needs_the_manual():
    fs = client_spec(_module("reading-and-editing").terminal)["fs"]
    assert "co2_alarm_ppm" not in fs[CONF]["contents"]  # the setting is only in the manual
    daemon = fs["/usr/share/man/man8/scrubberd.8"]["contents"]
    assert CONF in daemon and "scrubber.conf(5)" in daemon
    assert "co2_alarm_ppm = N" in fs["/usr/share/man/man5/scrubber.conf.5"]["contents"]


def test_module_01s_figures_match_the_console():
    module = _module("reading-and-editing")
    fs = client_spec(module.terminal)["fs"]
    page = fs["/usr/share/man/man5/scrubber.conf.5"]["contents"]

    def default(setting):
        return int(re.search(rf"{setting} = N\n(?:.*\n)*?\s+.*Default: (\d+)\.", page).group(1))

    peak = re.search(r"02:14:00 ring-b CO2 (\d+) ppm", fs["/var/log/scrubber/scrubberd.log"]["contents"]).group(1)
    assert f"CO2 {peak} PPM AT 02:14" in _said(module, "open") and f"{peak} ppm" in module.terminal.task
    wanted = re.search(r"co2_alarm_ppm = (\d+)", next(c.text for c in module.terminal.checks if "co2_alarm" in c.text)).group(1)
    assert f"CO2 ALARM AT {wanted} PPM" in _said(module, "console_done") and f"{wanted} ppm" in module.terminal.task
    # The warning was logged, the alarm's default is above the peak, and the new threshold is below it.
    assert f"co2_warn_ppm = {default('co2_warn_ppm')}" in fs[CONF]["contents"]
    assert default("co2_warn_ppm") < int(wanted) < int(peak) < default("co2_alarm_ppm")
