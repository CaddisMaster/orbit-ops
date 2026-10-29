"""systemd on the console (#303): the `services:` schema, the unit files and
.wants/ links it puts in the starting filesystem, and the server grading the
unit checks from what the console reports.

systemctl itself is JavaScript (shell/systemd.js) and is tested by
tests/js/systemd.test.js.
"""

import json

import pytest

from app.content import ContentError, get_catalog, load_catalog
from app.content.schema import ActiveCheck, DisabledCheck, EnabledCheck, InactiveCheck, TerminalExercise, valid_calendar
from app.main import app
from app.terminal import Node, UnitState, client_spec, grade, passes
from tests.conftest import csrf
from tests.test_progress import complete
from tests.test_terminal import JS, _attempts, _write

SERVICES = """terminal:
  task: Bring the O2 monitor up, and keep it up.
  cwd: /station
  accounts:
    - {name: o2mon, uid: 991}
  services:
    - name: scrubberd.service
      enabled: true
      unit: |
        [Unit]
        Description=Scrubber controller

        [Service]
        ExecStart=/usr/local/sbin/scrubberd
        User=o2mon

        [Install]
        WantedBy=multi-user.target
    - name: o2-backup.service
      state: inactive
      dir: /etc/systemd/system
      unit: |
        [Service]
        ExecStart=/usr/local/sbin/scrubberd
    - name: o2-monitor.service
      state: inactive
      exits: 1
      runs_for: 600
  files:
    - {path: /station, type: dir}
    - {path: /usr/local/sbin/scrubberd, mode: "755", owner: root, group: root, contents: "#!/bin/bash\\n"}
    - {path: /usr/local/sbin/o2-monitor, mode: "755", owner: root, group: root, contents: "#!/bin/bash\\n"}
  checks:
    - {active: o2-monitor.service}
    - {enabled: o2-monitor.service}
    - {inactive: o2-backup.service}
  success: Logged.
  solution:
    - echo done
"""


def _exercise(tmp_path, text=SERVICES) -> TerminalExercise:
    _write(tmp_path, text)
    exercise = load_catalog(tmp_path).modules["two"].terminal
    assert exercise is not None
    return exercise


def _content_error(tmp_path, old, new):
    assert old in SERVICES, old
    _write(tmp_path, SERVICES.replace(old, new))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    return str(exc.value)


def test_unit_files_and_wants_links_are_in_the_starting_filesystem(tmp_path):
    fs = _exercise(tmp_path).starting_fs()
    vendor = fs["/usr/lib/systemd/system/scrubberd.service"]
    assert (vendor["type"], vendor["mode"], vendor["owner"]) == ("file", 0o644, "root")
    assert vendor["contents"].startswith("[Unit]\nDescription=Scrubber controller\n")
    assert fs["/etc/systemd/system/o2-backup.service"]["type"] == "file"  # dir: puts it with the admin's
    wants = fs["/etc/systemd/system/multi-user.target.wants/scrubberd.service"]
    assert (wants["type"], wants["target"]) == ("link", "/usr/lib/systemd/system/scrubberd.service")
    # A unit with no file yet has none: the learner writes it.
    assert not any(p.endswith("o2-monitor.service") for p in fs)
    assert fs["/etc/systemd/system"]["type"] == fs["/usr/lib/systemd/system"]["type"] == "dir"


def test_an_exercise_without_services_has_no_systemd_directories(tmp_path):
    from tests.test_terminal import TERMINAL

    exercise = _exercise(tmp_path, TERMINAL)
    assert not any("systemd" in p for p in exercise.starting_fs())
    assert "services" not in client_spec(exercise)


def test_the_console_is_told_how_each_unit_starts(tmp_path):
    spec = client_spec(_exercise(tmp_path))
    assert spec["services"] == [
        {"name": "scrubberd.service", "state": "active", "exits": None, "runs_for": 0},
        {"name": "o2-backup.service", "state": "inactive", "exits": None, "runs_for": 0},
        {"name": "o2-monitor.service", "state": "inactive", "exits": 1, "runs_for": 600},
    ]
    assert "/usr/lib/systemd/system/scrubberd.service" in spec["fs"]


@pytest.mark.criterion(303, "Services are validated with the content")
def test_a_service_with_no_execstart_fails_naming_the_file_and_the_unit(tmp_path):
    message = _content_error(tmp_path, "        ExecStart=/usr/local/sbin/scrubberd\n        User=o2mon\n", "        User=o2mon\n")
    assert "core/shell/02-two.md: terminal.services.0:" in message
    assert "services: scrubberd.service: [Service] has no ExecStart" in message


@pytest.mark.parametrize(
    ("old", "new", "expect"),
    [
        ("User=o2mon", "User=ghost", "services: scrubberd.service: User=ghost is not an account"),
        ("ExecStart=/usr/local/sbin/scrubberd\n        User", "ExecStart=/usr/local/sbin/nothere\n        User",
         "services: scrubberd.service: ExecStart's /usr/local/sbin/nothere is not a file in the starting filesystem"),
        ("ExecStart=/usr/local/sbin/scrubberd\n        User", "ExecStart=scrubberd\n        User",
         "services: scrubberd.service: ExecStart must start with an absolute path"),
        ("        [Install]\n        WantedBy=multi-user.target\n", "",
         "services: scrubberd.service: enabled needs WantedBy= in [Install]"),
        ("User=o2mon", "User=o2mon\n        Restrat=always", "[Service] has Restrat, which the console doesn't know"),
        ("[Unit]\n        Description=Scrubber", "[Unti]\n        Description=Scrubber", "[Unti] isn't a section the console knows"),
        ("    - name: o2-backup.service", "    - name: scrubberd.service", "services: a unit is listed twice"),
        ("    - {inactive: o2-backup.service}", "    - {inactive: nothing.service}",
         "checks.2 (inactive nothing.service): nothing.service is not in services"),
        ("      state: inactive\n      exits: 1", "      state: active\n      exits: 1",
         "services: o2-monitor.service: a unit with no file can only start inactive and disabled"),
        ("    - name: o2-monitor.service", "    - name: o2-monitor",
         "String should match pattern"),
        ("      state: inactive\n      dir: /etc/systemd/system\n", "      state: failed\n      exits: 0\n      dir: /etc/systemd/system\n",
         "services: o2-backup.service: a failed unit's program exits with a status other than 0"),
    ],
)
def test_a_wrong_unit_fails_naming_what_is_wrong(tmp_path, old, new, expect):
    assert expect in _content_error(tmp_path, old, new)


TIMER = """    - name: air-sample.timer
      state: active
      dir: /etc/systemd/system
      unit: |
        [Timer]
        OnCalendar={calendar}
"""


@pytest.mark.parametrize("calendar", ["*-*-* 03:00:00", "daily", "Mon *-*-* 06:30", "*-*-* *:00/15:00"])
def test_a_timer_reads_the_schedules_the_console_does(tmp_path, calendar):
    text = SERVICES.replace("  files:\n", TIMER.format(calendar=calendar) + "  files:\n").replace(
        "    - name: o2-backup.service", "    - name: air-sample.service"
    ).replace("{inactive: o2-backup.service}", "{inactive: air-sample.service}")
    assert _exercise(tmp_path, text).services[-1].activates() == "air-sample.service"


@pytest.mark.parametrize("calendar", ["03:00", "*-*-* 25:00", "every night", "*-*-* 03:61", "*-*-* *:*/15:00"])
def test_a_timer_with_a_schedule_the_console_cant_read_fails(tmp_path, calendar):
    text = SERVICES.replace("  files:\n", TIMER.format(calendar=calendar) + "  files:\n")
    _write(tmp_path, text.replace("    - name: o2-backup.service", "    - name: air-sample.service").replace(
        "{inactive: o2-backup.service}", "{inactive: air-sample.service}"))
    with pytest.raises(ContentError, match=r"OnCalendar=.* isn't a schedule the console reads"):
        load_catalog(tmp_path)


def test_a_timer_must_start_a_listed_service(tmp_path):
    text = SERVICES.replace("  files:\n", TIMER.format(calendar="daily") + "  files:\n")
    _write(tmp_path, text)
    with pytest.raises(ContentError, match="air-sample.timer: it starts air-sample.service, which isn't in services"):
        load_catalog(tmp_path)


def test_calendar_forms_match_the_consoles():
    # shell/systemd.js calendarNext reads the same forms; tests/js/systemd.test.js runs them.
    assert all(valid_calendar(s) for s in ("hourly", "daily", "weekly", "monthly", "Sat *-*-* 06:30", "*-*-* *:00/15:00"))
    assert not any(valid_calendar(s) for s in ("yearly", "*-*-* */0:00", "Monday *-*-* 06:30", "2026-10-08 03:00"))


# What systemd-analyze calendar (systemd 255.4) accepts and refuses (#329).
@pytest.mark.criterion(329, "The console reads OnCalendar steps as systemd does")
@pytest.mark.parametrize(
    ("spec", "valid"),
    [
        ("*-*-* *:00/15:00", True),
        ("*-*-* *:5/15", True),
        ("*-*-* *:44/15", True),
        ("*-*-* *:00/59", True),
        ("*-*-* 0/6:00:00", True),
        ("*-*-* 19/4:00", True),
        ("*-*-* *:*/15:00", False),
        ("*-*-* */2:00", False),
        ("*-*-* *:45/15", False),
        ("*-*-* *:00/60", False),
        ("*-*-* *:00/0", False),
        ("*-*-* 20/4:00", False),
        ("*-*-* 00/24:00", False),
    ],
)
def test_calendar_steps_are_systemds(spec, valid):
    assert valid_calendar(spec) is valid


@pytest.mark.criterion(329, "The console reads OnCalendar steps as systemd does")
def test_a_timer_with_a_star_step_fails_the_content(tmp_path):
    text = SERVICES.replace("  files:\n", TIMER.format(calendar="*-*-* *:*/15:00") + "  files:\n")
    _write(tmp_path, text.replace("    - name: o2-backup.service", "    - name: air-sample.service").replace(
        "{inactive: o2-backup.service}", "{inactive: air-sample.service}"))
    with pytest.raises(ContentError, match=r"OnCalendar=\*-\*-\* \*:\*/15:00 isn't a schedule the console reads"):
        load_catalog(tmp_path)


LINK = {"type": "link", "mode": 0o777, "owner": "root", "group": "root", "target": "/etc/systemd/system/o2-monitor.service"}


def _state(*links: str) -> dict[str, Node]:
    node = {"type": "dir", "mode": 0o755, "owner": "root", "group": "root"}
    state = {"/": Node(**node), "/etc/systemd/system": Node(**node)}
    for path in links:
        state[path] = Node(**LINK)
    return state


@pytest.mark.criterion(303, "Service checks grade the end state")
def test_the_server_grades_active_and_enabled_from_the_report(tmp_path):
    exercise = _exercise(tmp_path)
    wants = "/etc/systemd/system/multi-user.target.wants/o2-monitor.service"
    up = [UnitState(name="o2-monitor.service", state="active"), UnitState(name="o2-backup.service", state="inactive")]
    assert grade(exercise, _state(wants), "/station", [], up)
    assert not grade(exercise, _state(), "/station", [], up)  # running, but not enabled
    down = [UnitState(name="o2-monitor.service", state="failed")]
    assert not grade(exercise, _state(wants), "/station", [], down)  # enabled, but not running
    backup_up = up[:1] + [UnitState(name="o2-backup.service", state="active")]
    assert not grade(exercise, _state(wants), "/station", [], backup_up)


@pytest.mark.parametrize(
    ("check", "links", "units", "expect"),
    [
        (EnabledCheck(enabled="o2-monitor.service"), ["/etc/systemd/system/timers.target.wants/o2-monitor.service"], [], True),
        (EnabledCheck(enabled="o2-monitor.service"), ["/etc/systemd/system/o2-monitor.service.d/o2-monitor.service"], [], False),
        (EnabledCheck(enabled="o2-monitor.service"), ["/etc/systemd/system/multi-user.target.wants/other.service"], [], False),
        (DisabledCheck(disabled="o2-monitor.service"), [], [], True),
        (InactiveCheck(inactive="o2-monitor.service"), [], [], True),  # never started is inactive
        (InactiveCheck(inactive="o2-monitor.service"), [], [UnitState(name="o2-monitor.service", state="failed")], True),
        (ActiveCheck(active="o2-monitor.service"), [], [UnitState(name="o2-monitor.service", state="activating")], False),
    ],
)
def test_unit_checks_read_links_and_states(check, links, units, expect):
    assert passes(check, _state(*links), "/", [], units) is expect


@pytest.fixture
def services_curriculum(tmp_path):
    _write(tmp_path, SERVICES)
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    yield
    app.dependency_overrides.pop(get_catalog, None)


def test_the_console_reports_its_units_and_the_server_records_them(logged_in, services_curriculum, user):
    complete(logged_in, "one")
    fs = client_spec(app.dependency_overrides[get_catalog]().modules["two"].terminal)["fs"]
    fs["/etc/systemd/system/multi-user.target.wants/o2-monitor.service"] = {**LINK, "contents": ""}
    units = [{"name": "o2-monitor.service", "state": "active"}, {"name": "o2-backup.service", "state": "inactive"}]
    response = logged_in.post(
        "/modules/two/terminal",
        content=json.dumps({"state": fs, "cwd": "/station", "units": units, "passed": True}),
        headers={"Content-Type": "application/json", "X-CSRF-Token": csrf(logged_in)},
    )
    assert response.json() == {"correct": True}
    [(_, _, correct, submitted)] = _attempts(user.id)
    assert correct and submitted["units"] == units


JOURNAL = """  journal:
    - {time: "2026-10-08 02:40:00", identifier: systemd, pid: 1, unit: scrubberd.service, message: "Stopping scrubberd.service - Scrubber controller..."}
    - {time: "2026-10-08 02:39:58", identifier: scrubber-flush, pid: 5121, unit: cron.service, priority: warning, message: "reply: FLUSH"}
"""


def _with_journal(journal=JOURNAL):
    return SERVICES.replace("  files:\n", journal + "  files:\n")


def test_the_console_is_sent_the_journal_oldest_first(tmp_path):
    spec = client_spec(_exercise(tmp_path, _with_journal()))
    assert spec["journal"] == [
        {"time": "2026-10-08T02:39:58", "identifier": "scrubber-flush", "pid": 5121, "unit": "cron.service",
         "priority": "warning", "message": "reply: FLUSH"},
        {"time": "2026-10-08T02:40:00", "identifier": "systemd", "pid": 1, "unit": "scrubberd.service",
         "priority": "info", "message": "Stopping scrubberd.service - Scrubber controller..."},
    ]


def test_an_exercise_without_a_journal_sends_none(tmp_path):
    assert "journal" not in client_spec(_exercise(tmp_path))


@pytest.mark.criterion(304, "The journal is validated with the content")
def test_a_journal_entry_whose_time_doesnt_parse_fails_naming_the_file_and_the_entry(tmp_path):
    _write(tmp_path, _with_journal(JOURNAL.replace('"2026-10-08 02:39:58"', '"2026-10-08 02:39"')))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    message = str(exc.value)
    assert "core/shell/02-two.md: terminal.journal.1.time:" in message


@pytest.mark.parametrize(
    ("old", "new", "expect"),
    [
        ('"2026-10-08 02:39:58"', '"2026-02-30 02:39:58"', "journal: 2026-02-30 02:39:58 is not a date and time"),
        ('"2026-10-08 02:39:58"', '"2026-10-08 09:30:00"', "journal: 2026-10-08 09:30:00 is after the station's clock"),
        ("priority: warning", "priority: loud", "terminal.journal.1.priority"),
        ("identifier: scrubber-flush", "identifier: scrubber flush", "terminal.journal.1.identifier"),
        ("unit: cron.service", "unit: cron", "terminal.journal.1.unit"),
    ],
)
def test_a_wrong_journal_entry_fails_naming_what_is_wrong(tmp_path, old, new, expect):
    _write(tmp_path, _with_journal(JOURNAL.replace(old, new)))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert expect in str(exc.value)


def test_the_priorities_are_journalds():
    from app.content.schema import PRIORITIES

    js = (JS / "shell/systemd.js").read_text()
    assert 'var PRIORITIES = ["' + '", "'.join(PRIORITIES) + '"];' in js
