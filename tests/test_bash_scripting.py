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


# --- 05: Conditionals (#72) -----------------------------------------------------------------
O2_CHECK = "/station/bin/o2-check"
O2_LOG = "/home/cadet/o2-test.log"
TESTS = "/station/sensors/test"


def _reading(exercise, name):
    return re.match(r"O2 ([\d.]+)%", client_spec(exercise)["fs"][f"{TESTS}/{name}"]["contents"]).group(1)


def _tested(start, *, guard=True, alert_below=19.5, alert_exit=1):
    """The log a learner leaves after running their o2-check on all four test readings."""
    exercise = _module("conditionals").terminal
    log = ""
    for name in ("low", "border", "normal"):
        o2 = float(_reading(exercise, name))
        verdict, status = ("ALERT", alert_exit) if o2 < alert_below else ("WARN", 0) if o2 < 20.5 else ("OK", 0)
        log += f"{verdict} O2 {_reading(exercise, name)}%\nexit {status}\n"
    if guard:
        log += f"o2-check: no sensor at {TESTS}/missing\nexit 2\n"
    else:  # no file test: cut fails, the empty reading counts as 0 tenths, and it's an ALERT
        log += f"cut: {TESTS}/missing: No such file or directory\nALERT O2 %\nexit {alert_exit}\n"
    return {**start, O2_LOG: Node(type="file", mode=0o664, owner="cadet", group="crew", contents=log)}


@pytest.mark.criterion(72, "Module 05 of Unit 1.2 is complete content")
def test_module_05_is_complete_content():
    module = load_catalog().unit_modules("bash-scripting")[4]
    assert module.slug == "conditionals"
    _complete_content(module)


@pytest.mark.criterion(72, "Module 05's console task can be done")
def test_module_05s_end_state_passes_on_the_server():
    exercise = _module("conditionals").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _tested(start), exercise.cwd)


@pytest.mark.parametrize(
    "shortcut",
    [{"guard": False}, {"alert_below": 19.6}, {"alert_exit": 0}],
    ids=["no-file-test", "border-reading-is-an-alert", "alert-exits-0"],
)
def test_module_05_refuses_the_shortcuts(shortcut):
    exercise = _module("conditionals").terminal
    assert not grade(exercise, _tested(_start(exercise), **shortcut), exercise.cwd)


def test_module_05s_figures_match_the_console():
    module = _module("conditionals")
    exercise = module.terminal
    low, border, normal = (float(_reading(exercise, n)) for n in ("low", "border", "normal"))
    # MERIDIAN's 03:00 reading is the `low` test file, and the story tells the same number.
    assert f"O2 {low}%" in _said(module, "open") and f"{low}%" in module.story_html
    # One reading per verdict, with `border` exactly on the ALERT line, so `-le` is caught.
    task = " ".join(exercise.task.split())
    assert "below 19.5%: `ALERT`" in task and "below 20.5%: `WARN`" in task
    assert low < 19.5 == border < 20.5 <= normal
    assert f"{TESTS}/missing" not in client_spec(exercise)["fs"]
    # The script the learner starts from already counts in tenths, as the task says.
    assert "tenths=$((whole * 10 + tenth))" in _start(exercise)[O2_CHECK].contents


# --- 06: Loops (#73) ------------------------------------------------------------------------
SENSORS = "/var/log/sensors"
READINGS = "/home/cadet/readings.txt"
LIMIT = 5000


def _deck_logs(exercise):
    fs = client_spec(exercise)["fs"]
    return {p.removeprefix(SENSORS + "/").removesuffix(".log"): n["contents"] for p, n in sorted(fs.items()) if p.startswith(SENSORS + "/")}


def _deck_readings(start, *, quoted=True, over=lambda ppm: ppm > LIMIT, line=-1, skip_empty=True, trim=True):
    """What a learner's deck-readings prints, run over the module's logs."""
    exercise = _module("loops").terminal
    out = ""
    for deck, contents in _deck_logs(exercise).items():
        name = deck if trim else f"{SENSORS}/{deck}.log"
        lines = contents.splitlines() if quoted or " " not in deck else []  # unquoted, tail gets two missing files
        if not lines:
            out += f"{name}: no reading\n" if skip_empty else f"{name}:  ppm\n"
            continue
        ppm = int(lines[line].split()[3])
        out += f"{name}: {ppm} ppm" + (" OVER LIMIT" if over(ppm) else "") + "\n"
    script = Node(type="file", mode=0o775, owner="cadet", group="crew", contents="#!/usr/bin/env bash\n")
    return {**start, "/station/bin/deck-readings": script, READINGS: Node(type="file", mode=0o664, owner="cadet", group="crew", contents=out)}


@pytest.mark.criterion(73, "Module 06 of Unit 1.2 is complete content")
def test_module_06_is_complete_content():
    module = load_catalog().unit_modules("bash-scripting")[5]
    assert module.slug == "loops"
    _complete_content(module)


@pytest.mark.criterion(73, "Module 06's console task can be done")
def test_module_06s_end_state_passes_on_the_server():
    exercise = _module("loops").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _deck_readings(start), exercise.cwd)


@pytest.mark.parametrize(
    "shortcut",
    [{"quoted": False}, {"over": lambda ppm: ppm >= LIMIT}, {"line": 0}, {"skip_empty": False}, {"trim": False}],
    ids=["unquoted-path", "exactly-the-limit-is-over", "first-reading-not-last", "empty-log-not-skipped", "full-path-as-name"],
)
def test_module_06_refuses_the_shortcuts(shortcut):
    exercise = _module("loops").terminal
    assert not grade(exercise, _deck_readings(_start(exercise), **shortcut), exercise.cwd)


def test_module_06s_figures_match_the_console():
    module = _module("loops")
    logs = _deck_logs(module.terminal)
    last = {deck: int(c.splitlines()[-1].split()[3]) for deck, c in logs.items() if c}
    over = [deck for deck, ppm in last.items() if ppm > LIMIT]
    empty = [deck for deck, c in logs.items() if not c]
    assert f"{len(logs)} DECKS" in _said(module, "open") and "twelve" in module.story_html.lower() and len(logs) == 12
    assert f"{len(logs)} DECKS · {len(over)} OVER LIMIT · {len(empty)} NO READING" in _said(module, "console_done")
    assert over == ["galley"] and f"Galley at {last['galley']}" in _said(module, "console_done")
    assert empty == ["observation"] and "observation" in _said(module, "console_done")
    # The traps are really there: a name with a space, a reading exactly on the line,
    # and a deck that was over earlier in its log but isn't now.
    assert any(" " in deck for deck in logs) and LIMIT in last.values()
    assert any(int(line.split()[3]) > LIMIT for deck, c in logs.items() if deck not in over for line in c.splitlines())
    assert f"over {LIMIT} ppm" in " ".join(module.terminal.task.split()).replace("**", "")
    # The task's example of an over-limit line isn't a real deck's, so it gives nothing away.
    assert "stores" not in logs


# --- 07: Arguments and input (#74) ----------------------------------------------------------
REPORT_LOG = "/home/cadet/report-test.log"
COPIES = ["/station/bin/galley-report", "/station/bin/lab-report"]


def _deck_log(exercise, deck):
    return client_spec(exercise)["fs"][f"{SENSORS}/{deck}.log"]["contents"].splitlines()


def _calls_logged(start, *, usage_status=2, unknown_status=1, default_days=1, quoted=True, delete_copies=True):
    """The log a learner leaves after the five calls, and the copies deleted (or not)."""
    exercise = _module("arguments-and-input").terminal
    out = f"usage: deck-report DECK [DAYS]\nexit {usage_status}\n"
    out += f"deck-report: no such deck: nowhere\nexit {unknown_status}\n"
    for deck, days in (("galley", None), ("galley", 3), ("hydroponics bay", 2)):
        n = days or default_days
        if " " in deck and not quoted:
            out += f"deck-report: no such deck: {deck}\nexit {unknown_status}\n"
            continue
        out += f"{deck}: {n} day report\n" + "".join(line + "\n" for line in _deck_log(exercise, deck)[-n:]) + "exit 0\n"
    state = {**start, REPORT_LOG: Node(type="file", mode=0o664, owner="cadet", group="crew", contents=out)}
    state["/station/bin/deck-report"] = Node(type="file", mode=0o775, owner="cadet", group="crew", contents="#!/usr/bin/env bash\n")
    if delete_copies:
        for copy in COPIES:
            del state[copy]
    return state


@pytest.mark.criterion(74, "Module 07 of Unit 1.2 is complete content")
def test_module_07_is_complete_content():
    module = load_catalog().unit_modules("bash-scripting")[6]
    assert module.slug == "arguments-and-input"
    _complete_content(module)


@pytest.mark.criterion(74, "Module 07's console task can be done")
def test_module_07s_end_state_passes_on_the_server():
    exercise = _module("arguments-and-input").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _calls_logged(start), exercise.cwd)


@pytest.mark.parametrize(
    "shortcut",
    [{"usage_status": 0}, {"unknown_status": 2}, {"default_days": 5}, {"quoted": False}, {"delete_copies": False}],
    ids=["usage-exits-0", "unknown-deck-exits-2", "no-default-of-1", "unquoted-deck", "copies-kept"],
)
def test_module_07_refuses_the_shortcuts(shortcut):
    exercise = _module("arguments-and-input").terminal
    assert not grade(exercise, _calls_logged(_start(exercise), **shortcut), exercise.cwd)


def test_module_07s_figures_match_the_console():
    module = _module("arguments-and-input")
    exercise = module.terminal
    start = _start(exercise)
    galley, lab = (start[c].contents for c in COPIES)
    # The copies drifted as the story and Okafor say: the galley's names the lab, and the lab's shows two days.
    assert "echo \"lab: 1 day report\"" in galley and "tail -n 1 /var/log/sensors/galley.log" in galley
    assert "1 day report" in lab and "tail -n 2" in lab
    assert f"{len(COPIES)} COPIES" in _said(module, "open")
    # Galley's 5100 is in the 3-day report but not the 1-day one.
    readings = {line.split()[0]: int(line.split()[2]) for line in _deck_log(exercise, "galley")}
    assert readings["2026-10-07"] == 5100 and "Galley hit 5100 on the 7th" in _said(module, "console_done")
    assert max(readings.values()) == 5100 and "5100" not in _deck_log(exercise, "galley")[-1]
    calls = ["deck-report >>", "`deck-report nowhere`", "`deck-report galley`", "`deck-report galley 3`", '`deck-report "hydroponics bay" 2`']
    assert all(call in exercise.task for call in calls) and f"{len(calls)} CALLS TESTED" in _said(module, "console_done")


# --- 08: Functions (#75) --------------------------------------------------------------------
LIB = "/station/lib/sensors.sh"
DECK_READINGS = "/station/bin/deck-readings"
CO2_ALARM = "/station/bin/co2-alarm"


def _librarised(start, *, limit=5000, at_limit_is_over=False, sourced_by=(DECK_READINGS, CO2_ALARM)):
    """What a learner leaves: the library, the scripts that source it, and their saved output."""
    exercise = _module("functions").terminal
    lib = f"CO2_LIMIT_PPM={limit}\nlast_ppm() {{ :; }}\nover_limit() {{ :; }}\n"

    def over(ppm, own_limit):
        return ppm >= own_limit if at_limit_is_over else ppm > own_limit

    readings = ""
    for deck, contents in _deck_logs(exercise).items():
        if not contents:
            readings += f"{deck}: no reading\n"
            continue
        ppm = int(contents.splitlines()[-1].split()[3])
        readings += f"{deck}: {ppm} ppm" + (" OVER LIMIT" if over(ppm, limit if DECK_READINGS in sourced_by else 5000) else "") + "\n"
    galley = int(_deck_logs(exercise)["galley"].splitlines()[-1].split()[3])
    alarm = ("ALARM" if over(galley, limit if CO2_ALARM in sourced_by else 50000) else "ok") + f" galley: {galley} ppm\n"
    state = {**start, LIB: Node(type="file", mode=0o664, owner="cadet", group="crew", contents=lib)}
    for script in sourced_by:
        state[script] = start[script].model_copy(update={"contents": f"#!/usr/bin/env bash\nsource {LIB}\n# … over_limit \"$ppm\" …\n"})
    state["/home/cadet/readings.txt"] = Node(type="file", mode=0o664, owner="cadet", group="crew", contents=readings)
    state["/home/cadet/alarm.txt"] = Node(type="file", mode=0o664, owner="cadet", group="crew", contents=alarm)
    return state


@pytest.mark.criterion(75, "Module 08 of Unit 1.2 is complete content")
def test_module_08_is_complete_content():
    module = load_catalog().unit_modules("bash-scripting")[7]
    assert module.slug == "functions"
    _complete_content(module)


@pytest.mark.criterion(75, "Module 08's console task can be done")
def test_module_08s_end_state_passes_on_the_server():
    exercise = _module("functions").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _librarised(start), exercise.cwd)


@pytest.mark.parametrize(
    "shortcut",
    [{"sourced_by": (DECK_READINGS,)}, {"sourced_by": (CO2_ALARM,)}, {"at_limit_is_over": True}, {"limit": 50000}],
    ids=["co2-alarm-keeps-its-own-copy", "deck-readings-keeps-its-own-copy", "exactly-the-limit-is-over", "the-wrong-limit-shared"],
)
def test_module_08_refuses_the_shortcuts(shortcut):
    exercise = _module("functions").terminal
    assert not grade(exercise, _librarised(_start(exercise), **shortcut), exercise.cwd)


def test_module_08s_figures_match_the_console():
    module = _module("functions")
    exercise = module.terminal
    start = _start(exercise)
    galley = int(_deck_logs(exercise)["galley"].splitlines()[-1].split()[3])
    # The two scripts really disagree about the galley, as MERIDIAN and the story say.
    assert "limit=5000\n" in start[DECK_READINGS].contents and "limit=50000" in start[CO2_ALARM].contents
    assert 5000 < galley < 50000
    assert f"GALLEY CO2 {galley} PPM · DECK-READINGS: OVER LIMIT · CO2-ALARM: OK" in _said(module, "open")
    assert f"CO2 hit {galley} ppm" in module.story_html and "50000" in _said(module, "open")
    assert "5000 ppm" in exercise.task and "CO2 LIMIT 5000 PPM" in _said(module, "console_done")
    assert "5000" in [line.split()[3] for c in _deck_logs(exercise).values() for line in c.splitlines()[-1:]]


# --- 09: Robust scripts (#76) ---------------------------------------------------------------
BACKUP = "/station/bin/backup-logs"
BACKUP_LOG = "/home/cadet/backup-test.log"
WORK = "/tmp/backup-work"
TAR_FAILS = (
    "tar (child): /srv/backups/scrubber-logs.tar.gz: Cannot open: Permission denied\n"
    "tar (child): Error is not recoverable: exiting now\ntar: Child returned status 2\ntar: Error is not recoverable: exiting now\n"
)


def _hardened(start, *, stops=True, trapped=True, cleaned=True, good_run=True):
    """What a learner leaves after cleaning up, hardening backup-logs and running it both ways."""
    state = dict(start)
    if cleaned:
        for p in [p for p in state if p == WORK or p.startswith(WORK + "/")]:
            del state[p]
    if not trapped:  # the failed run's copies are still in its mktemp directory
        logs = [p for p in start if p.startswith("/var/log/scrubber/")]
        state["/tmp/tmp.k3J9x0QaZb"] = Node(type="dir", mode=0o700, owner="cadet", group="crew")
        for p in logs:
            state["/tmp/tmp.k3J9x0QaZb/" + p.rsplit("/", 1)[1]] = start[p].model_copy(update={"owner": "cadet", "group": "crew"})
    log = TAR_FAILS + ("exit 2\n" if stops else "backup complete\nexit 0\n")
    if good_run:
        log += "backup complete\nexit 0\n"
        state["/home/cadet/backups"] = Node(type="dir", mode=0o775, owner="cadet", group="crew")
        state["/home/cadet/backups/scrubber-logs.tar.gz"] = Node(type="file", mode=0o664, owner="cadet", group="crew", contents="gzip\n", size=4096)
    state[BACKUP_LOG] = Node(type="file", mode=0o664, owner="cadet", group="crew", contents=log)
    script = 'set -euo pipefail\nwork=$(mktemp -d)\n' + ("trap 'rm -rf \"$work\"' EXIT\n" if trapped else "")
    state[BACKUP] = start[BACKUP].model_copy(update={"contents": "#!/usr/bin/env bash\n" + script})
    return state


@pytest.mark.criterion(76, "Module 09 of Unit 1.2 is complete content")
def test_module_09_is_complete_content():
    module = load_catalog().unit_modules("bash-scripting")[8]
    assert module.slug == "robust-scripts"
    _complete_content(module)


@pytest.mark.criterion(76, "Module 09's console task can be done")
def test_module_09s_end_state_passes_on_the_server():
    exercise = _module("robust-scripts").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _hardened(start), exercise.cwd)


@pytest.mark.parametrize(
    "shortcut",
    [{"stops": False}, {"trapped": False}, {"cleaned": False}, {"good_run": False}],
    ids=["failure-still-reports-success", "no-trap-leaves-copies", "last-nights-mess-left", "never-backed-up"],
)
def test_module_09_refuses_the_shortcuts(shortcut):
    exercise = _module("robust-scripts").terminal
    assert not grade(exercise, _hardened(_start(exercise), **shortcut), exercise.cwd)


def test_module_09s_figures_match_the_console():
    from math import ceil

    module = _module("robust-scripts")
    exercise = module.terminal
    start = _start(exercise)
    # MERIDIAN quotes what `du -sh /tmp/backup-work` says: whole 4K blocks, rounded up as GNU does.
    used = 4096 + sum(ceil(n.bytes() / 4096) * 4096 for p, n in start.items() if p.startswith(WORK + "/"))
    assert f"/TMP/BACKUP-WORK · {ceil(used / 2**30 * 10) / 10}G" in _said(module, "open")
    assert "left 2 GB of copies" in module.story_html
    # Last night's failure is real: cadet can't write to /srv/backups, and the old script says
    # it's done whatever tar did.
    backups = start["/srv/backups"]
    assert backups.owner == "root" and backups.mode == 0o755
    script = start[BACKUP].contents
    assert "&& rm -r $work\necho \"backup complete\"" in script and "set -e" not in script
    assert "EXIT 2" in _said(module, "console_done")
