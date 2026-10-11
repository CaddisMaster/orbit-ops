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


# --- 02: Finding things and disk space (#69) ---------------------------------------------
O2 = "/var/log/o2"
ARCHIVE = "/srv/archive/o2-logs.tar.gz"
OLD = ["2026-07-23", "2026-07-30", "2026-08-06", "2026-08-13", "2026-08-20", "2026-08-27", "2026-09-03"]


def _disk_percent(exercise, state):
    """df's Use%, as shell.js works it out: the system's base plus every file in 4K blocks."""
    from math import ceil

    from app.content.schema import size_bytes

    used = size_bytes(exercise.disk.base) + sum(ceil(n.bytes() / 4096) * 4096 for n in state.values() if n.type == "file")
    return ceil(min(used, size_bytes(exercise.disk.size)) * 100 / size_bytes(exercise.disk.size))


def _cleaned(start, *, gzipped=True, keep_debug=True, delete_old=True, link="/var/log/o2/2026-10-08.log"):
    """The state a learner leaves: debug.log emptied, the old logs archived and deleted, current.log repointed."""
    state = dict(start)
    old = sum(start[f"{O2}/{d}.log"].bytes() for d in OLD)
    state[ARCHIVE] = Node(type="file", mode=0o664, owner="cadet", group="crew", contents="tar\n" + "\n".join(f"{d}.log" for d in OLD), size=old // 4 if gzipped else old)
    if delete_old:
        for d in OLD:
            del state[f"{O2}/{d}.log"]
    if keep_debug:
        state[f"{O2}/debug.log"] = start[f"{O2}/debug.log"].model_copy(update={"contents": "", "size": None})
    else:
        del state[f"{O2}/debug.log"]
    state[f"{O2}/current.log"] = start[f"{O2}/current.log"].model_copy(update={"target": link})
    return state


@pytest.mark.criterion(69, "Module 02 of Unit 1.2 is complete content")
def test_module_02_is_complete_content():
    module = load_catalog().unit_modules("bash-scripting")[1]
    assert module.slug == "finding-things-and-disk-space"
    _complete_content(module)


@pytest.mark.criterion(69, "Module 02's console task can be done")
def test_module_02s_end_state_passes_on_the_server():
    exercise = _module("finding-things-and-disk-space").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    done = _cleaned(start)
    assert grade(exercise, done, exercise.cwd)
    assert _disk_percent(exercise, done) < 70


@pytest.mark.parametrize(
    "shortcut",
    [
        {"gzipped": False},  # an archive that isn't compressed
        {"keep_debug": False},  # deleting the log the daemon holds open
        {"delete_old": False},  # archiving without deleting
        {"link": "2026-10-08.log"},  # not the path the task asks for
    ],
    ids=["uncompressed", "deleted-debug-log", "originals-kept", "other-link-target"],
)
def test_module_02_refuses_the_shortcuts(shortcut):
    exercise = _module("finding-things-and-disk-space").terminal
    assert not grade(exercise, _cleaned(_start(exercise), **shortcut), exercise.cwd)


def test_module_02s_figures_match_the_console():
    module = _module("finding-things-and-disk-space")
    exercise = module.terminal
    start = _start(exercise)
    before = _disk_percent(exercise, start)
    assert f"DISK {before}%" in _said(module, "open") and f"**{before}% full**" in exercise.task
    # Under 70% takes both: emptying the debug log alone isn't enough, and nor is archiving alone.
    assert _disk_percent(exercise, _cleaned(start)) < 70
    only_emptied = {**start, f"{O2}/debug.log": start[f"{O2}/debug.log"].model_copy(update={"size": 0})}
    assert _disk_percent(exercise, only_emptied) >= 70
    assert _disk_percent(exercise, {**_cleaned(start), f"{O2}/debug.log": start[f"{O2}/debug.log"]}) >= 70
    assert "Half a gigabyte" in _said(module, "console_done") and start[f"{O2}/debug.log"].bytes() == 512 * 2**20
    old = [p for p, n in start.items() if p.startswith(O2 + "/") and n.type == "file" and n.age_days() > 30]
    assert sorted(old) == [f"{O2}/{d}.log" for d in OLD]


# --- 03: Your first script (#70) -----------------------------------------------------------
SCRIPT = "/station/bin/shift-check"
REPORT = "/home/cadet/shift-report.txt"


def _scripted(start, *, mode=0o775, shebang=True, report=True):
    """What a learner leaves: the script written and chmod'd, and its output saved."""
    exercise = _module("your-first-script").terminal
    fs = client_spec(exercise)["fs"]
    body = ("#!/usr/bin/env bash\n" if shebang else "") + "cat /station/sensors/o2\ntail -n 1 /var/log/scrubber/scrubberd.log\ndf -h /\n"
    state = {**start, SCRIPT: Node(type="file", mode=mode, owner="cadet", group="crew", contents=body)}
    if report:
        printed = fs["/station/sensors/o2"]["contents"] + fs["/var/log/scrubber/scrubberd.log"]["contents"].splitlines()[-1] + "\n"
        printed += "Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        20G  4.2G   16G  21% /\n"
        state[REPORT] = Node(type="file", mode=0o664, owner="cadet", group="crew", contents=printed)
    return state


@pytest.mark.criterion(70, "Module 03 of Unit 1.2 is complete content")
def test_module_03_is_complete_content():
    module = load_catalog().unit_modules("bash-scripting")[2]
    assert module.slug == "your-first-script"
    _complete_content(module)


@pytest.mark.criterion(70, "Module 03's console task can be done")
def test_module_03s_end_state_passes_on_the_server():
    exercise = _module("your-first-script").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    for mode in (0o775, 0o764, 0o755, 0o700):  # chmod +x, u+x, 755 and 700 all make it executable
        assert grade(exercise, _scripted(start, mode=mode), exercise.cwd), oct(mode)


@pytest.mark.parametrize(
    "shortcut",
    [{"mode": 0o664}, {"mode": 0o675}, {"shebang": False}, {"report": False}],
    ids=["not-executable", "executable-by-others-only", "no-shebang", "never-run"],
)
def test_module_03_refuses_the_shortcuts(shortcut):
    exercise = _module("your-first-script").terminal
    assert not grade(exercise, _scripted(_start(exercise), **shortcut), exercise.cwd)


def test_module_03s_figures_match_the_console():
    module = _module("your-first-script")
    fs = client_spec(module.terminal)["fs"]
    o2 = re.match(r"O2 ([\d.]+%)", fs["/station/sensors/o2"]["contents"]).group(1)
    assert f"O2 {o2}" in _said(module, "console_done")
    assert "scrubbers nominal" in fs["/var/log/scrubber/scrubberd.log"]["contents"].splitlines()[-1]
    assert "/station/bin" in module.terminal.env["PATH"].split(":")
    note = fs["/home/cadet/sticky-note.txt"]["contents"]
    scripted = [line.split("'")[1] for line in module.terminal.solution if line.endswith(">> /station/bin/shift-check")]
    assert scripted and all(command in note for command in scripted)  # the script runs what the note lists


# --- 04: Variables and quoting (#71) --------------------------------------------------------
CARGO = "/station/bin/cargo-report"
CARGO_REPORT = "/station/cargo/report.txt"
MANIFESTS = "/station/cargo/manifests"


def _counts(exercise):
    fs = client_spec(exercise)["fs"]
    return {name: fs[f"{MANIFESTS}/{name}"]["contents"].count("\n") for name in ("Spare Parts.csv", "food.csv", "water.csv")}


def _reported(start, *, total=True, arithmetic=True, spare_parts=True):
    exercise = _module("variables-and-quoting").terminal
    n = _counts(exercise)
    lines = ["Cargo report", f"Spare Parts: {n['Spare Parts.csv'] if spare_parts else ''} items", f"Food: {n['food.csv']} items", f"Water: {n['water.csv']} items"]
    if total:
        lines.append(f"Total: {sum(n.values())} items")
    script = start[CARGO].contents + ('echo "Total: $((p + f + w)) items" >> "$report"\n' if arithmetic else "")
    return {
        **start,
        CARGO: start[CARGO].model_copy(update={"contents": script}),
        CARGO_REPORT: Node(type="file", mode=0o664, owner="cadet", group="crew", contents="\n".join(lines) + "\n"),
    }


@pytest.mark.criterion(71, "Module 04 of Unit 1.2 is complete content")
def test_module_04_is_complete_content():
    module = load_catalog().unit_modules("bash-scripting")[3]
    assert module.slug == "variables-and-quoting"
    _complete_content(module)


@pytest.mark.criterion(71, "Module 04's console task can be done")
def test_module_04s_end_state_passes_on_the_server():
    exercise = _module("variables-and-quoting").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _reported(start), exercise.cwd)


@pytest.mark.parametrize(
    "shortcut", [{"spare_parts": False}, {"total": False}, {"arithmetic": False}], ids=["spare-parts-blank", "no-total", "no-arithmetic"]
)
def test_module_04_refuses_the_shortcuts(shortcut):
    exercise = _module("variables-and-quoting").terminal
    assert not grade(exercise, _reported(_start(exercise), **shortcut), exercise.cwd)


def test_module_04s_figures_match_the_console():
    module = _module("variables-and-quoting")
    exercise = module.terminal
    n = _counts(exercise)
    checks = " ".join(c.text for c in exercise.checks if hasattr(c, "text"))
    assert f"Spare Parts: {n['Spare Parts.csv']} items" in checks and f"Total: {sum(n.values())} items" in checks
    assert f"{len(n)} MANIFESTS · {sum(n.values())} ITEMS" in _said(module, "console_done")
    assert f"Food: {n['food.csv']} items" in exercise.task  # the task's example line is a real one
    # The starting script has the bug the story tells: an unquoted path with a space.
    assert "parts=$dir/Spare Parts.csv" in _start(exercise)[CARGO].contents
