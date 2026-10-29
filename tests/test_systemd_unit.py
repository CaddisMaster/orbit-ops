"""Unit 1.5, systemd & services: each module is complete content, its console task
can be done, and the figures the crew quotes are true of the console's services.

That a reference solution passes *in the console* is tests/js/solutions.test.js's
job; here the server grades the end state the solution leaves. The console's
systemctl itself is tests/test_systemd.py's and tests/js/systemd.test.js's."""

import pytest

from app.terminal import Node, UnitState, grade
from tests.conftest import real_catalog
from tests.test_bash_scripting import _complete_content, _said, _start


def _module(slug):
    return real_catalog().modules[slug]


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
    module = real_catalog().unit_modules("systemd")[0]
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


# --- 02: Starting, stopping and enabling (#306) -----------------------------------------------
WANTS = "/etc/systemd/system/multi-user.target.wants"


def _enabled(state, *names):
    links = {
        f"{WANTS}/{n}": Node(type="link", mode=0o777, owner="root", group="root", target=f"/usr/lib/systemd/system/{n}")
        for n in names
    }
    return {**state, **links}


def _units(**states):
    """The console's report: every service's state, the starting ones unless given."""
    exercise = _module("start-stop-enable").terminal
    return [UnitState(name=s.name, state=states.get(s.name.removesuffix(".service").replace("-", "_"), s.state)) for s in exercise.services]


DONE = {"o2_backup": "active", "cabin_fans": "active", "recycler": "active", "o2_purge": "inactive"}


@pytest.mark.criterion(306, "Module 02 of Unit 1.5 is complete content")
def test_module_02_is_complete_content():
    module = real_catalog().unit_modules("systemd")[1]
    assert module.slug == "start-stop-enable"
    _complete_content(module)


@pytest.mark.criterion(306, "Module 02's task can be solved with what the lesson teaches")
def test_module_02s_end_state_passes_on_the_server():
    exercise = _module("start-stop-enable").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd, [], _units())
    done = _enabled(start, "o2-backup.service", "cabin-fans.service")
    assert grade(exercise, done, exercise.cwd, [], _units(**DONE))


@pytest.mark.criterion(306, "Module 02's task can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("enabled", "states"),
    [
        ([], DONE),  # started by hand again, never enabled
        (["o2-backup.service", "cabin-fans.service"], {**DONE, "o2_backup": "inactive", "cabin_fans": "inactive"}),  # enabled, not started
        (["o2-backup.service", "cabin-fans.service"], {**DONE, "recycler": "failed"}),  # the recycler left down
        (["o2-backup.service", "cabin-fans.service"], {**DONE, "o2_purge": "active"}),  # the purge left running
        (["o2-backup.service", "cabin-fans.service", "o2-purge.service"], DONE),  # the purge enabled
        (["o2-backup.service", "cabin-fans.service"], {**DONE, "scrubberd": "inactive"}),  # the wrong one stopped
    ],
    ids=["started-not-enabled", "enabled-not-started", "recycler-down", "purge-running", "purge-enabled", "scrubberd-stopped"],
)
def test_module_02_refuses_the_half_fixes(enabled, states):
    exercise = _module("start-stop-enable").terminal
    end = _enabled(_start(exercise), *enabled)
    assert not grade(exercise, end, exercise.cwd, [], _units(**states))


def test_module_02s_figures_match_the_console():
    module = _module("start-stop-enable")
    exercise = module.terminal
    services = {s.name.removesuffix(".service"): s for s in exercise.services}
    # The two that are started by hand every morning start inactive and disabled; the
    # recycler failed though enabled; the purge is running and was never enabled.
    for name in ("o2-backup", "cabin-fans"):
        assert services[name].state == "inactive" and not services[name].enabled
    assert services["recycler"].state == "failed" and services["recycler"].exits is None  # fixed: a start holds
    assert services["o2-purge"].state == "active" and not services["o2-purge"].enabled
    opened = _said(module, "open")
    for name in ("o2-backup", "cabin-fans", "recycler"):
        assert f"{name.upper()} · {services[name].state.upper()}" in opened
    # sudo is needed, and the solution shows the refusal first.
    assert "sudo" in exercise.groups and exercise.password == "meridian" and "`meridian`" in exercise.task
    assert exercise.solution[1].startswith("systemctl enable")
    # The lesson's examples use none of the task's services.
    quoted = module.body_html + " ".join(
        [q.q + (q.code or "") + " ".join(getattr(q, "options", [])) for q in module.quiz]
        + [c.front_html + c.back_html for c in module.cards]
    )
    for name in services:
        assert name not in quoted, name


# --- 03: Reading unit files (#307) ------------------------------------------------------------
UNITS = "/home/cadet/units.txt"
READ = [
    "scrubberd.service /usr/local/sbin/scrubberd scrubber",
    "recycler.service /usr/local/sbin/recyclerd water",
    "co2-monitor.service /usr/local/sbin/co2-monitor sensors",
    "o2-backup.service /usr/local/sbin/o2-backupd root",
    "requires co2-monitor.service",
    "override o2-backup.service",
]


@pytest.mark.criterion(307, "Module 03 of Unit 1.5 is complete content")
def test_module_03_is_complete_content():
    module = next(m for m in real_catalog().unit_modules("systemd") if m.slug == "unit-files")
    _complete_content(module)


@pytest.mark.criterion(307, "Module 03's task can be solved with what the lesson teaches")
def test_module_03s_end_state_passes_on_the_server():
    exercise = _module("unit-files").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _with_file(start, UNITS, "\n".join(READ) + "\n"), exercise.cwd)


@pytest.mark.criterion(307, "Module 03's task can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("wrong", "right"),
    [
        ("o2-backup.service /usr/local/sbin/o2-backupd o2feed", READ[3]),  # read the package's copy
        ("scrubberd.service /usr/local/sbin/scrubberd --cycle 90 scrubber", READ[0]),  # options kept
        ("scrubberd.service scrubberd scrubber", READ[0]),  # not the full path
        ("requires thermal-reg.service", READ[4]),  # Wants= taken for Requires=
        ("override recycler.service", READ[5]),  # the wrong override
    ],
    ids=["vendor-copy", "with-options", "bare-name", "wants-not-requires", "wrong-override"],
)
def test_module_03_refuses_the_misreadings(wrong, right):
    exercise = _module("unit-files").terminal
    report = "\n".join(READ).replace(right, wrong) + "\n"
    assert not grade(exercise, _with_file(_start(exercise), UNITS, report), exercise.cwd)


def test_module_03_also_refuses_both_requires_answers():
    exercise = _module("unit-files").terminal
    report = "\n".join(READ + ["requires thermal-reg.service"]) + "\n"
    assert not grade(exercise, _with_file(_start(exercise), UNITS, report), exercise.cwd)


def test_module_03s_figures_match_the_units():
    from app.content.schema.terminal.services import VENDOR_DIR, parse_unit

    module = _module("unit-files")
    exercise = module.terminal
    services = {s.name: s for s in exercise.services}
    texts = {c.text for c in exercise.checks if hasattr(c, "contains")}
    # Each service line is the unit's own ExecStart program and User= (root without one).
    for name in ("scrubberd.service", "recycler.service", "co2-monitor.service", "o2-backup.service"):
        unit = services[name]
        user = unit.sections()["Service"].get("User", ["root"])[-1]
        assert f"{name} {unit.program()} {user}" in texts
    recycler = services["recycler.service"].sections()["Unit"]
    assert f"requires {recycler['Requires'][0]}" in texts and recycler["Wants"] != recycler["Requires"]
    # The override: the admin's copy is what's used, and the package's copy beside it differs
    # exactly in User=, which is why it's root.
    backup = services["o2-backup.service"]
    assert backup.dir == "/etc/systemd/system" and f"override {backup.name}" in texts
    vendor = next(f for f in exercise.files if f.path == f"{VENDOR_DIR}/{backup.name}")
    assert parse_unit(vendor.contents)["Service"]["User"] == ["o2feed"] and "User" not in backup.sections()["Service"]
    # MERIDIAN's counts: five services, six unit files.
    files = len(exercise.services) + sum(f.path.endswith(".service") for f in exercise.files)
    assert f"LIFE SUPPORT SERVICES · {len(exercise.services)} ·" in _said(module, "open") and f"UNIT FILES: {files}" in _said(module, "open")
    # Every user named exists as an account.
    assert {"scrubber", "water", "sensors", "o2feed"} <= {a.name for a in exercise.accounts}
    # The lesson's examples use none of the task's services.
    quoted = module.body_html + " ".join(
        [q.q + (q.code or "") + " ".join(getattr(q, "options", [])) for q in module.quiz]
        + [c.front_html + c.back_html for c in module.cards]
    )
    for name in services:
        assert name.removesuffix(".service") not in quoted, name


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
    module = next(m for m in real_catalog().unit_modules("systemd") if m.slug == "writing-a-service")
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


# --- 05: Timers (#309) ------------------------------------------------------------------------
CRON = "/etc/cron.d/filter-report"
REPORT_SERVICE = "/etc/systemd/system/filter-report.service"
REPORT_TIMER = "/etc/systemd/system/filter-report.timer"
REPORT_WANTS = "/etc/systemd/system/timers.target.wants/filter-report.timer"
SERVICE = """[Unit]
Description=Life support: scrubber filter report

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/filter-report
User=scrubber
"""
TIMER = """[Unit]
Description=Life support: scrubber filter report, Mondays

[Timer]
OnCalendar=Mon *-*-* 06:30:00
Persistent=true

[Install]
WantedBy=timers.target
"""
WAITING = [UnitState(name="filter-report.timer", state="active"), UnitState(name="scrubberd.service", state="active")]


def _timed(state, service=SERVICE, timer=TIMER, enabled=True, cron_gone=True):
    root = {"mode": 0o644, "owner": "root", "group": "root"}
    state = {**state, REPORT_SERVICE: Node(type="file", contents=service, **root), REPORT_TIMER: Node(type="file", contents=timer, **root)}
    if enabled:
        state[REPORT_WANTS] = Node(type="link", mode=0o777, owner="root", group="root", target=REPORT_TIMER)
    if cron_gone:
        del state[CRON]
    return state


@pytest.mark.criterion(309, "Module 05 of Unit 1.5 is complete content")
def test_module_05_is_complete_content():
    module = real_catalog().unit_modules("systemd")[4]
    assert module.slug == "timers"
    _complete_content(module)


@pytest.mark.criterion(309, "Module 05's task can be solved with what the lesson teaches")
def test_module_05s_end_state_passes_on_the_server():
    exercise = _module("timers").terminal
    start = _start(exercise)
    assert REPORT_SERVICE not in start and REPORT_TIMER not in start
    assert not grade(exercise, start, exercise.cwd, [], [UnitState(name="scrubberd.service", state="active")])
    assert grade(exercise, _timed(start), exercise.cwd, [], WAITING)
    # Six figures (`06:30`) or five (`06:30:00`): systemd reads both the same.
    assert grade(exercise, _timed(start, timer=TIMER.replace("06:30:00", "06:30")), exercise.cwd, [], WAITING)


@pytest.mark.criterion(309, "Module 05's task can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("change", "units"),
    [
        ({"timer": TIMER.replace("Mon *-*-* 06:30:00", "*-*-* 06:30:00")}, WAITING),  # every day, not Mondays
        ({"timer": TIMER.replace("Mon ", "Sun ")}, WAITING),  # day 1 read as Sunday
        ({"timer": TIMER.replace("06:30:00", "30:06:00")}, WAITING),  # cron's order, kept
        ({"timer": TIMER.replace("Persistent=true\n", "")}, WAITING),  # skips a missed Monday
        ({"service": SERVICE.replace("User=scrubber\n", "")}, WAITING),  # runs as root
        ({"service": SERVICE.replace("Type=oneshot\n", "")}, WAITING),  # a daemon, not a job
        ({"service": SERVICE.replace("filter-report\n", "filter-report >/dev/null 2>&1\n")}, WAITING),  # still throws it away
        ({"cron_gone": False}, WAITING),  # runs twice
        ({"enabled": False}, WAITING),  # started, gone at the next boot
        ({}, [UnitState(name="filter-report.timer", state="inactive")]),  # enabled, never started
    ],
    ids=["daily", "sunday", "cron-order", "not-persistent", "as-root", "not-oneshot", "redirected", "cron-left", "not-enabled", "not-started"],
)
def test_module_05_refuses_the_half_moves(change, units):
    exercise = _module("timers").terminal
    assert not grade(exercise, _timed(_start(exercise), **change), exercise.cwd, [], units)


def test_module_05s_units_load_and_its_figures_match():
    from datetime import timedelta

    from app.content.schema.terminal.files import STATION_NOW
    from app.content.schema.terminal.services import SystemdUnit, parse_unit

    module = _module("timers")
    exercise = module.terminal
    # The reference units are valid by the console's own rules, and the program and user exist.
    service = SystemdUnit(name="filter-report.service", unit=SERVICE, dir="/etc/systemd/system")
    SystemdUnit(name="filter-report.timer", unit=TIMER, dir="/etc/systemd/system", enabled=True)
    assert service.program() in {f.path for f in exercise.files}
    # The cron line and the units say the same thing: minute 30, hour 6, day 1 (Monday), as scrubber.
    cron = next(f for f in exercise.files if f.path == CRON).contents
    minute, hour, dom, month, dow, user, program, *rest = next(line for line in cron.splitlines() if not line.startswith("#")).split()
    assert (dom, month, dow, rest) == ("*", "*", "1", [">/dev/null", "2>&1"])
    assert parse_unit(TIMER)["Timer"]["OnCalendar"] == [f"Mon *-*-* {int(hour):02}:{int(minute):02}:00"]
    assert parse_unit(SERVICE)["Service"]["ExecStart"] == [program] and f"User={user}" in SERVICE
    assert user in {a.name for a in exercise.accounts}
    # The solution writes the same two units, line for line.
    written = [s.split("'")[1] for s in exercise.solution if "| sudo tee" in s]
    assert written == [line for line in (SERVICE + TIMER).splitlines() if line]
    # MERIDIAN's next run is the Monday after the station's clock.
    monday = STATION_NOW + timedelta(days=(7 - STATION_NOW.weekday()) % 7 or 7)
    done = _said(module, "console_done")
    assert f"NEXT: MON {monday:%Y-%m-%d} {hour.zfill(2)}:{minute}" in done
    # The open beat names the job, not its translation: that's the task.
    assert "FILTER-REPORT" in _said(module, "open") and user.upper() not in _said(module, "open")
    # The lesson's examples use none of the task's figures.
    quoted = module.body_html + " ".join(
        [q.q + (q.code or "") + " ".join(getattr(q, "options", [])) for q in module.quiz]
        + [c.front_html + c.back_html for c in module.cards]
    )
    for figure in ("filter-report", "06:30", "6 * * 1"):
        assert figure not in quoted, figure


# --- 06: The journal (#310) -------------------------------------------------------------------
EVIDENCE = "/home/cadet/evidence"
MAINT = "/etc/cron.d/scrubber-maint"
UP_AGAIN = [UnitState(name="scrubberd.service", state="active")]


def _journal_lines(exercise, since="2026-10-08 02:30", until="2026-10-08 02:45"):
    """The journal's lines in a window, as journalctl prints them (the console's own format)."""
    from datetime import datetime

    out = []
    for e in exercise.journal:
        at = datetime.fromisoformat(e.time)
        if datetime.fromisoformat(since) <= at <= datetime.fromisoformat(until):
            out.append(f"{at:%b %d %H:%M:%S} meridian {e.identifier}[{e.pid}]: {e.message}")
    return "\n".join(out) + "\n"


def _filed(state, exercise, log=None, moved=True):
    crew = {"owner": "cadet", "group": "crew"}
    state = {**state, EVIDENCE: Node(type="dir", mode=0o775, **crew)}
    state[f"{EVIDENCE}/outage.log"] = Node(type="file", mode=0o664, contents=_journal_lines(exercise) if log is None else log, **crew)
    if moved:
        state[f"{EVIDENCE}/scrubber-maint"] = state.pop(MAINT)
    return state


@pytest.mark.criterion(310, "Module 06 of Unit 1.5 is complete content")
def test_module_06_is_complete_content():
    module = next(m for m in real_catalog().unit_modules("systemd") if m.slug == "the-journal")
    assert real_catalog().unit_modules("systemd")[-1].slug == module.slug  # the unit's last module, the reveal
    _complete_content(module)


@pytest.mark.criterion(310, "Module 06's task can be solved with what the lesson teaches")
def test_module_06s_end_state_passes_on_the_server():
    exercise = _module("the-journal").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd, [], [UnitState(name="scrubberd.service", state="inactive")])
    assert grade(exercise, _filed(start, exercise), exercise.cwd, [], UP_AGAIN)


@pytest.mark.criterion(310, "Module 06's task can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("change", "units"),
    [
        ({"log": "everything"}, UP_AGAIN),  # the whole journal, not the window
        ({"log": "scrubberd"}, UP_AGAIN),  # -u scrubberd: the cron job's lines are missing
        ({"log": "early"}, UP_AGAIN),  # --since 02:00: the drone's first attempts too
        ({"log": "no-sudo"}, UP_AGAIN),  # journalctl without sudo
        ({"moved": "deleted"}, UP_AGAIN),  # the evidence is gone
        ({"moved": "copied"}, UP_AGAIN),  # still in cron.d, so it runs again tonight
        ({}, [UnitState(name="scrubberd.service", state="inactive")]),  # the controller left down
    ],
    ids=["whole-journal", "one-unit", "too-early", "no-sudo", "deleted", "copied", "not-started"],
)
def test_module_06_refuses_the_half_jobs(change, units):
    exercise = _module("the-journal").terminal
    start = _start(exercise)
    logs = {
        "everything": _journal_lines(exercise, "2026-10-08 00:00", "2026-10-08 08:59"),
        "scrubberd": "".join(line + "\n" for line in _journal_lines(exercise).splitlines() if "scrubberd[" in line or "systemd[1]" in line),
        "early": _journal_lines(exercise, "2026-10-08 02:00", "2026-10-08 02:45"),
        "no-sudo": "No journal files were opened due to insufficient permissions.\n",
    }
    state = _filed(start, exercise, log=logs.get(change.get("log")), moved=change.get("moved", True) is True)
    if change.get("moved") == "copied":
        state[f"{EVIDENCE}/scrubber-maint"] = start[MAINT]
    assert not grade(exercise, state, exercise.cwd, [], units)


def test_module_06s_journal_tells_the_story_and_its_figures_match():
    module = _module("the-journal")
    exercise = module.terminal
    window = _journal_lines(exercise)
    # The reveal is in the window, in order: cron starts the job, it reports, the reply, the stop.
    order = ["CRON[5120]: (root) CMD (/usr/local/sbin/scrubber-flush", "sending controller state to 203.0.113.47",
             "reply: FLUSH", "Stopping scrubberd.service"]
    assert [window.index(o) for o in order] == sorted(window.index(o) for o in order)
    # docs/story.md's times and addresses: drone 02:11–02:34, job 02:35, scrubber B offline 02:40.
    drone = [e.time for e in exercise.journal if "md-3" in e.message]
    assert drone[0].endswith("02:11:04") and drone[-1].startswith("2026-10-08 02:34")
    assert "10.4.2.17" in " ".join(e.message for e in exercise.journal if "md-3" in e.message)
    # The cron file is the one Units 1.2–1.4 found, byte for byte.
    networking = _module("following-a-connection").terminal
    assert next(f for f in exercise.files if f.path == MAINT).contents == next(f for f in networking.files if f.path == MAINT).contents
    # The task's checks hold the window's edges: a line just outside each is in the journal.
    lacks = [c.text for c in exercise.checks if hasattr(c, "lacks")]
    outside = [line for line in _journal_lines(exercise, "2026-10-08 00:00", "2026-10-08 08:59").splitlines() if line not in window]
    assert all(any(text in line for line in outside) for text in lacks)
    # MERIDIAN's readouts are the journal's times.
    said = _said(module)
    for at, what in (("08:06", "COMMAND=/usr/bin/systemctl stop scrubberd"), ("02:39:58", "reply: FLUSH"), ("02:40:00", "Stopping scrubberd")):
        assert at in said and any(e.time.split(" ")[1].startswith(at) and what in e.message for e in exercise.journal), at
    # The lesson's examples use none of the task's units, times or files.
    quoted = module.body_html + " ".join(
        [q.q + (q.code or "") + " ".join(getattr(q, "options", [])) for q in module.quiz]
        + [c.front_html + c.back_html for c in module.cards]
    )
    for figure in ("scrubber", "02:30", "02:45", "outage.log", "~/evidence"):
        assert figure not in quoted, figure
