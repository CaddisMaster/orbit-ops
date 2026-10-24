"""Terminal exercises (#17): the content schema, the page that carries the
console, and the server re-grading what the console reports.

The shell itself is JavaScript and is tested by `node --test tests/js/*.test.js`
(CI's Tests job): commands, permissions, globs, completion and the client-side
checks.

Route tests use a throwaway curriculum: unit `shell` has `one` (a quiz only)
then `two`, which carries a terminal exercise.
"""

import json
import re
import textwrap
from pathlib import Path

import pytest
from sqlalchemy import select

from app.content import ContentError, get_catalog, load_catalog
from app.db import SessionLocal
from app.main import app
from app.models import ExerciseAttempt
from tests.conftest import csrf
from tests.test_progress import complete
from tests.test_xp import MODULE, SYLLABUS

JS = Path(__file__).resolve().parents[1] / "app/static/js"


def shell_source():
    """The console's shell, every part of it (#255): shell.js and shell/*.js."""
    return "".join(p.read_text() for p in [JS / "shell.js", *sorted((JS / "shell").glob("*.js"))])

TERMINAL = """terminal:
  task: Make `scrubber.conf` readable by its owner only.
  cwd: /station
  files:
    - {path: /station, type: dir}
    - {path: /station/scrubber.conf, mode: "644", contents: "override=7731\\n"}
  checks:
    - {mode: /station/scrubber.conf, equals: "600"}
  success: Okafor nods.
  solution:
    - chmod 600 scrubber.conf
"""


def _write(root, terminal=TERMINAL):
    (root / "syllabus.yml").write_text(textwrap.dedent(SYLLABUS))
    (root / "core" / "shell").mkdir(parents=True)
    (root / "core/shell/01-one.md").write_text(MODULE.format(title="One", xp=50))
    two = MODULE.format(title="Two", xp=50)
    (root / "core/shell/02-two.md").write_text(two.replace("---\nLesson.", terminal + "---\nLesson.", 1))


@pytest.fixture
def terminal_curriculum(tmp_path):
    _write(tmp_path)
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    yield
    app.dependency_overrides.pop(get_catalog, None)


def _state(mode: int) -> dict:
    node = {"type": "dir", "mode": 0o755, "owner": "root", "group": "root", "contents": ""}
    return {
        "/": node,
        "/station": {**node, "owner": "cadet", "group": "crew"},
        "/station/scrubber.conf": {
            "type": "file", "mode": mode, "owner": "cadet", "group": "crew", "contents": "override=7731\n",
        },
    }


def _report(client, slug, state, passed=True, cwd="/station"):
    return client.post(
        f"/modules/{slug}/terminal",
        content=json.dumps({"state": state, "cwd": cwd, "passed": passed}),
        headers={"Content-Type": "application/json", "X-CSRF-Token": csrf(client)},
    )


def _attempts(user_id):
    with SessionLocal() as db:
        rows = db.execute(
            select(ExerciseAttempt.module_slug, ExerciseAttempt.kind, ExerciseAttempt.correct, ExerciseAttempt.submitted)
            .where(ExerciseAttempt.user_id == user_id, ExerciseAttempt.kind == "terminal")
            .order_by(ExerciseAttempt.id)
        )
        return [tuple(r) for r in rows]


# --- the schema ------------------------------------------------------------------------
@pytest.mark.criterion(17, "Invalid terminal exercises fail CI")
def test_a_check_on_a_path_the_starting_filesystem_never_creates_fails(tmp_path):
    _write(tmp_path, TERMINAL.replace('{mode: /station/scrubber.conf, equals: "600"}', '{mode: /station/scrubber.cfg, equals: "600"}'))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    message = str(exc.value)
    assert "core/shell/02-two.md: terminal:" in message
    assert "checks.0 (mode /station/scrubber.cfg): /station/scrubber.cfg is not in the starting filesystem" in message


@pytest.mark.parametrize(
    ("replace", "with_", "expect"),
    [
        ("cwd: /station", "cwd: /nowhere", "cwd: /nowhere is not a directory"),
        ('mode: "644"', 'mode: "999"', "terminal.files.1.mode"),
        ("equals: \"600\"", "equals: \"rw\"", "terminal.checks.0"),
        ("{path: /station, type: dir}", "{path: /station, contents: x}", "/station/scrubber.conf is inside /station, which is a file"),
        ("{path: /station, type: dir}", "{path: /station, type: dir, contents: x}", "a directory has no contents"),
        ("{path: /station, type: dir}", "{path: station, type: dir}", "terminal.files.0.path"),
        ("{mode: /station/scrubber.conf", "{run: /station/scrubber.conf", "terminal.checks.0"),
        ("    - {path: /station, type: dir}\n", "    - {path: /station, type: dir}\n    - {path: /station, type: dir}\n", "/station listed twice"),
    ],
)
def test_bad_terminal_exercises_are_reported(tmp_path, replace, with_, expect):
    assert replace in TERMINAL
    _write(tmp_path, TERMINAL.replace(replace, with_))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "core/shell/02-two.md" in str(exc.value) and expect in str(exc.value)


def test_exists_and_contains_may_name_what_the_learner_creates(tmp_path):
    _write(tmp_path, TERMINAL.replace(
        '    - {mode: /station/scrubber.conf, equals: "600"}',
        "    - {exists: /station/backup, type: dir}\n    - {contains: /station/notes.txt, text: done}",
    ))
    assert len(load_catalog(tmp_path).modules["two"].terminal.checks) == 2


def test_unlisted_parent_directories_exist_owned_by_root(tmp_path):
    _write(tmp_path, TERMINAL.replace("    - {path: /station, type: dir}\n", ""))
    fs = load_catalog(tmp_path).modules["two"].terminal.starting_fs()
    assert fs["/station"] == {"type": "dir", "mode": 0o755, "owner": "root", "group": "root", "contents": ""}
    assert fs["/station/scrubber.conf"]["owner"] == "cadet" and fs["/station/scrubber.conf"]["mode"] == 0o644


def test_the_real_exercises_load_and_start_unsolved():
    from app.terminal import Node, grade

    catalog = load_catalog()
    exercises = {slug: m.terminal for slug, m in catalog.modules.items() if m.terminal}
    assert {"files-and-globs", "permissions"} <= exercises.keys()
    for exercise in exercises.values():
        start = {p: Node(**n) for p, n in exercise.starting_fs().items()}
        assert not grade(exercise, start, exercise.cwd)


# --- the page ----------------------------------------------------------------------------
def shell_parts():
    """shell.js's PARTS: the order the parts load in."""
    return json.loads(re.search(r"var PARTS = (\[[^\]]*\]);", (JS / "shell.js").read_text()).group(1))


@pytest.mark.criterion(255, "The shell is split by area")
def test_the_shell_is_split_by_area():
    parts = {name: (JS / "shell" / f"{name}.js").read_text() for name in shell_parts()}
    assert sorted(parts) == sorted(p.stem for p in (JS / "shell").glob("*.js"))  # every part is listed
    files = {**parts, "shell.js": (JS / "shell.js").read_text()}
    assert len(files) > 1
    for name, text in files.items():
        assert text.count("\n") <= 2000, f"{name} has {text.count(chr(10))} lines"
        assert not ("function Parser(" in text and "Object.assign(COMMANDS" in text), f"{name} has the parser and commands"


@pytest.mark.criterion(255, "The page still loads it under the CSP")
def test_the_page_loads_every_shell_part_in_order(logged_in, terminal_curriculum):
    complete(logged_in, "one")
    page = logged_in.get("/modules/two").text
    scripts = re.findall(r'<script src="[^"]*/static/js/([^"?]+)\?v=[^"]+"[^>]* defer></script>', page)
    shell = [f"shell/{p}.js" for p in shell_parts()]
    start = scripts.index("manual.js")
    assert scripts[start : start + len(shell) + 3] == ["manual.js", *shell, "shell.js", "console.js"]  # each part before the next
    for path in shell:
        assert logged_in.get(f"/static/js/{path}").status_code == 200


@pytest.mark.criterion(17, "The console starts in the module's filesystem")
def test_the_module_page_carries_the_console_and_its_starting_filesystem(logged_in, terminal_curriculum):
    complete(logged_in, "one")
    page = logged_in.get("/modules/two").text
    spec = json.loads(re.search(r"data-terminal='([^']*)'", page).group(1))
    assert spec["cwd"] == "/station" and spec["user"] == "cadet"
    assert spec["fs"]["/station/scrubber.conf"] == {
        "type": "file", "mode": 0o644, "owner": "cadet", "group": "crew", "contents": "override=7731\n",
    }
    assert spec["checks"] == [{"mode": "/station/scrubber.conf", "equals": "600"}]
    assert 'data-report="/modules/two/terminal"' in page
    assert re.search(r'<script src="[^"]*/static/js/shell.js\?v=[^"]+"[^>]* defer></script>', page)
    assert re.search(r'<script src="[^"]*/static/js/console.js\?v=[^"]+"[^>]* defer></script>', page)
    assert "readable by its owner only" in page
    assert "solution" not in spec


def test_a_module_without_an_exercise_loads_no_console(logged_in, terminal_curriculum):
    page = logged_in.get("/modules/one").text
    assert "data-terminal" not in page and "console.js" not in page


# --- reporting -----------------------------------------------------------------------------
@pytest.mark.criterion(17, "Completing the task is recognised")
def test_a_state_that_satisfies_every_check_is_recorded_as_correct(logged_in, terminal_curriculum, user):
    complete(logged_in, "one")
    response = _report(logged_in, "two", _state(0o600))
    assert response.status_code == 200 and response.json() == {"correct": True}
    [(slug, kind, correct, submitted)] = _attempts(user.id)
    assert (slug, kind, correct, submitted["claimed"]) == ("two", "terminal", True, True)
    assert submitted["state"]["/station/scrubber.conf"]["mode"] == 0o600


@pytest.mark.criterion(17, "The server doesn't trust the browser's verdict")
def test_a_claimed_pass_with_a_failing_state_is_recorded_as_incorrect(logged_in, terminal_curriculum, user):
    complete(logged_in, "one")
    response = _report(logged_in, "two", _state(0o644), passed=True)
    assert response.json() == {"correct": False}
    [(_, _, correct, submitted)] = _attempts(user.id)
    assert correct is False and submitted["claimed"] is True


def test_a_locked_module_cannot_be_reported(logged_in, terminal_curriculum, user):
    assert _report(logged_in, "two", _state(0o600)).status_code == 403
    assert _attempts(user.id) == []


def test_a_module_without_an_exercise_has_no_report_route(logged_in, terminal_curriculum):
    assert _report(logged_in, "one", _state(0o600)).status_code == 404


@pytest.mark.parametrize(
    "state",
    [
        {"relative/path": {"type": "file", "mode": 0o600, "owner": "cadet", "group": "crew"}},
        {"/x": {"type": "socket", "mode": 0o600, "owner": "cadet", "group": "crew"}},
        {"/x": {"type": "file", "mode": 0o600, "owner": "Robert'); DROP", "group": "crew"}},
        {"/x": {"type": "file", "mode": 0o600, "owner": "cadet", "group": "crew", "contents": "x" * 20_001}},
        {f"/f{i}": {"type": "file", "mode": 0o600, "owner": "cadet", "group": "crew"} for i in range(501)},
        {"/x\ny": {"type": "file", "mode": 0o600, "owner": "cadet", "group": "crew"}},
        {"/x//y": {"type": "file", "mode": 0o600, "owner": "cadet", "group": "crew"}},
    ],
    ids=["relative-path", "bad-type", "bad-owner", "huge-file", "too-many-paths", "control-character", "empty-segment"],
)
def test_malformed_or_oversized_reports_are_refused(logged_in, terminal_curriculum, user, state):
    complete(logged_in, "one")
    assert _report(logged_in, "two", state).status_code == 422
    assert _attempts(user.id) == []


def test_a_report_may_hold_any_name_a_learner_can_make(logged_in, terminal_curriculum, user):
    # #71: a file called "Spare Parts.csv", or "*.nope" from a redirect, used to get the whole
    # report refused, so a solved task went unlogged.
    complete(logged_in, "one")
    learner_made = {"type": "file", "mode": 0o664, "owner": "cadet", "group": "crew", "contents": ""}
    state = {**_state(0o600), "/station/Spare Parts.csv": learner_made, "/station/*.nope": learner_made, "/station/naïve,v2 (1)": learner_made}
    response = _report(logged_in, "two", state)
    assert response.status_code == 200 and response.json() == {"correct": True}


def test_reports_need_the_csrf_token(logged_in, terminal_curriculum):
    complete(logged_in, "one")
    response = logged_in.post(
        "/modules/two/terminal",
        content=json.dumps({"state": _state(0o600), "cwd": "/station", "passed": True}),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 403


def test_attempts_are_scoped_to_the_learner(logged_in, terminal_curriculum, user, make_user):
    other = make_user()
    complete(logged_in, "one")
    _report(logged_in, "two", _state(0o600))
    assert _attempts(other.id) == []
    assert len(_attempts(user.id)) == 1


# --- #36: coverage, reference solutions, cwd checks -------------------------------------
FIXTURES = Path(__file__).resolve().parent / "js" / "fixtures"


@pytest.mark.criterion(36, "The shell-ready modules have console tasks")
def test_the_shell_ready_modules_have_console_tasks():
    unit = load_catalog().unit_modules("linux-shell")
    with_tasks = {m.position for m in unit if m.terminal}
    assert {1, 2, 3, 4, 7, 8} <= with_tasks


@pytest.mark.criterion(36, "An exercise without a solution fails CI")
def test_an_exercise_without_a_solution_fails(tmp_path):
    _write(tmp_path, TERMINAL.replace("  solution:\n    - chmod 600 scrubber.conf\n", ""))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "core/shell/02-two.md: terminal.solution: Field required" in str(exc.value)


@pytest.mark.criterion(36, "Reference solutions never reach the browser")
def test_reference_solutions_never_reach_the_browser(logged_in, terminal_curriculum):
    complete(logged_in, "one")
    page = logged_in.get("/modules/two").text
    spec = json.loads(re.search(r"data-terminal='([^']*)'", page).group(1))
    assert spec["checks"] and "solution" not in spec
    assert "chmod 600 scrubber.conf" not in page


def test_the_exercise_fixture_matches_the_content():
    # The JS tests run the reference solutions from this file; a stale one would
    # prove an old version of the exercises.
    from scripts.export_exercises import FIXTURE, render

    assert FIXTURE.read_text() == render(), (
        "tests/js/fixtures/exercises.json is stale: run `docker compose exec web python -m scripts.export_exercises`"
    )


def test_the_server_agrees_with_the_shared_check_cases():
    from pydantic import TypeAdapter

    from app.content.schema import TerminalCheck
    from app.terminal import Node, passes

    data = json.loads((FIXTURES / "check_cases.json").read_text())
    state = {p: Node(**n) for p, n in data["state"].items()}
    adapter = TypeAdapter(TerminalCheck)
    from app.terminal import Process

    processes = [Process(**p) for p in data["processes"]]
    for case in data["cases"]:
        check = adapter.validate_python(case["check"])
        assert passes(check, state, data["cwd"], processes) is case["expect"], case["name"]


def test_a_cwd_check_must_name_a_starting_directory(tmp_path):
    _write(tmp_path, TERMINAL.replace('{mode: /station/scrubber.conf, equals: "600"}', "{cwd: /station/scrubber.conf}"))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "checks.0 (cwd /station/scrubber.conf): /station/scrubber.conf is not a directory" in str(exc.value)


def test_a_cwd_check_is_graded_against_where_the_console_ended(logged_in, tmp_path, user):
    _write(tmp_path, TERMINAL.replace('{mode: /station/scrubber.conf, equals: "600"}', "{cwd: /}"))
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    try:
        complete(logged_in, "one")
        assert _report(logged_in, "two", _state(0o644), cwd="/station").json() == {"correct": False}
        assert _report(logged_in, "two", _state(0o644), cwd="/").json() == {"correct": True}
        assert [a[3]["cwd"] for a in _attempts(user.id)] == ["/station", "/"]
    finally:
        app.dependency_overrides.pop(get_catalog, None)


# --- #37: users, environment and processes -------------------------------------------------
@pytest.mark.criterion(37, "The new modules have console tasks")
def test_users_processes_and_environment_modules_have_console_tasks():
    unit = load_catalog().unit_modules("linux-shell")
    assert {1, 2, 3, 4, 5, 6, 7, 8, 9} <= {m.position for m in unit if m.terminal}
    # ...each with a reference solution, which tests/js/solutions.test.js runs.
    assert all(m.terminal.solution for m in unit if m.terminal)


def test_the_account_files_are_generated_from_the_exercise():
    from app.content.schema import TerminalExercise

    ex = TerminalExercise(
        task="t", cwd="/home/cadet", groups=["sudo", "airlock", "docker"], password="pw",
        accounts=[{"name": "airlock", "uid": 990, "comment": "Airlock", "home": "/var/lib/airlock"}],
        files=[{"path": "/home/cadet", "type": "dir"}], checks=[{"cwd": "/home/cadet"}], solution=["pwd"],
    )
    fs = ex.starting_fs()
    assert fs["/etc/passwd"]["contents"] == (
        "root:x:0:0:root:/root:/bin/bash\n"
        "airlock:x:990:990:Airlock:/var/lib/airlock:/usr/sbin/nologin\n"
        "cadet:x:1000:1000:Cadet:/home/cadet:/bin/bash\n"
    )
    assert fs["/etc/group"]["contents"] == (
        "root:x:0:\nsudo:x:27:cadet\nairlock:x:990:cadet\ndocker:x:998:cadet\ncrew:x:1000:\n"
    )
    assert fs["/root"]["mode"] == 0o700


def test_a_listed_account_file_wins_over_the_generated_one(tmp_path):
    _write(tmp_path, TERMINAL.replace(
        "    - {path: /station, type: dir}\n",
        '    - {path: /station, type: dir}\n    - {path: /etc/passwd, contents: "custom\\n"}\n',
    ))
    fs = load_catalog(tmp_path).modules["two"].terminal.starting_fs()
    assert fs["/etc/passwd"]["contents"] == "custom\n"


@pytest.mark.parametrize(
    ("add", "check", "expect"),
    [
        ("", "{stopped: warp-core}", "checks.0 (stopped warp-core): no starting process is called warp-core"),
        ("", "{signalled: warp-core, with: TERM}", "no starting process is called warp-core"),
        ("  processes:\n    - {command: warp-core, user: nobody}\n", "{running: warp-core}", "runs as nobody, which is not an account"),
        ("  processes:\n    - {command: warp-core, ignores: [KILL]}\n", "{stopped: warp-core}", "terminal.processes.0.ignores.0"),
        ("", "{signalled: x, with: STOP}", "terminal.checks.0"),
    ],
)
def test_bad_process_exercises_are_reported(tmp_path, add, check, expect):
    _write(tmp_path, TERMINAL.replace("  files:\n", add + "  files:\n").replace('{mode: /station/scrubber.conf, equals: "600"}', check))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert expect in str(exc.value)


def test_process_checks_are_graded_from_the_reported_process_table(logged_in, tmp_path, user):
    _write(tmp_path, TERMINAL.replace("  files:\n", "  processes:\n    - {command: o2-diagnostics, ignores: [TERM]}\n  files:\n").replace(
        '    - {mode: /station/scrubber.conf, equals: "600"}',
        "    - {stopped: o2-diagnostics}\n    - {signalled: o2-diagnostics, with: TERM}",
    ))
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    try:
        complete(logged_in, "one")
        proc = {"pid": 400, "user": "cadet", "command": "o2-diagnostics"}

        def report(alive, signals):
            return logged_in.post(
                "/modules/two/terminal",
                content=json.dumps({"state": _state(0o644), "cwd": "/station", "passed": True,
                                    "processes": [{**proc, "alive": alive, "signals": signals}]}),
                headers={"Content-Type": "application/json", "X-CSRF-Token": csrf(logged_in)},
            ).json()

        assert report(True, ["TERM"]) == {"correct": False}  # it ignored TERM and is still running
        assert report(False, ["KILL"]) == {"correct": False}  # stopped, but never asked politely
        assert report(False, ["TERM", "KILL"]) == {"correct": True}
        assert _attempts(user.id)[-1][3]["processes"] == [{**proc, "alive": False, "signals": ["TERM", "KILL"]}]
    finally:
        app.dependency_overrides.pop(get_catalog, None)


def test_the_sudo_password_is_sent_only_for_exercises_that_set_one(tmp_path):
    from app.terminal import client_spec

    _write(tmp_path)
    assert client_spec(load_catalog(tmp_path).modules["two"].terminal)["password"] is None
    assert client_spec(load_catalog().modules["users-and-sudo"].terminal)["password"] == "meridian"


# --- #67: sizes, ages and symlinks ---------------------------------------------------------
DISK = """terminal:
  task: Tidy the logs.
  cwd: /station
  disk: {size: 2G, base: "1.5G"}
  memory: {total: 1G, used: 300M, cache: 200M}
  files:
    - {path: /station, type: dir}
    - {path: /station/scrubber.conf, contents: "override=7731\\n"}
    - {path: /var/log/o2/big.log, contents: "sample\\n", size: 12M, mtime: "2026-09-20 14:30"}
    - {path: /var/log/o2/today.log, contents: "ok\\n"}
    - {path: /station/current.log, type: link, target: /var/log/o2/today.log}
  checks:
    - {symlink: /station/latest.log, target: /var/log/o2/big.log}
    - {files_under: /var/log, name: "*.log", max_size: 10M}
  success: Tidy.
  solution:
    - ln -s /var/log/o2/big.log latest.log
    - "> /var/log/o2/big.log"
"""


def test_files_carry_size_mtime_and_link_targets_to_the_console(tmp_path):
    from app.terminal import client_spec

    _write(tmp_path, DISK)
    exercise = load_catalog(tmp_path).modules["two"].terminal
    fs = exercise.starting_fs()
    assert fs["/var/log/o2/big.log"] == {
        "type": "file", "mode": 0o644, "owner": "cadet", "group": "crew", "contents": "sample\n",
        "size": 12 * 1024 * 1024, "mtime": "2026-09-20T14:30:00",
    }
    assert fs["/station/current.log"] == {
        "type": "link", "mode": 0o777, "owner": "cadet", "group": "crew", "contents": "", "target": "/var/log/o2/today.log",
    }
    assert "size" not in fs["/station/scrubber.conf"] and "mtime" not in fs["/station/scrubber.conf"]  # unchanged when unset
    spec = client_spec(exercise)
    assert spec["disk"] == {"size": 2 * 1024**3, "base": round(1.5 * 1024**3)}
    assert spec["memory"] == {"total": 1024**3, "used": 300 * 1024**2, "cache": 200 * 1024**2, "shared": 12 * 1024**2}
    (tmp_path / "plain").mkdir()
    _write(tmp_path / "plain", TERMINAL)
    assert "disk" not in client_spec(load_catalog(tmp_path / "plain").modules["two"].terminal)


@pytest.mark.parametrize(
    ("replace", "with_", "expect"),
    [
        ("type: link, target: /var/log/o2/today.log", "type: link", "a link, and only a link, has a target"),
        ('contents: "ok\\n"}', 'contents: "ok\\n", target: x}', "a link, and only a link, has a target"),
        ("{path: /station, type: dir}", "{path: /station, type: dir, size: 1M}", "only a file has a size"),
        ('mtime: "2026-09-20 14:30"', 'mtime: "2026-11-01"', "is after the station's clock"),
        ('mtime: "2026-09-20 14:30"', 'mtime: "20 Sep"', "terminal.files.2.mtime"),
        ("size: 12M", "size: 12MB", "terminal.files.2.size"),
        ('base: "1.5G"', "base: 3G", "disk: base must be smaller than size"),
        ("used: 300M", "used: 900M", "used + cache can't be more than total"),
        ("{files_under: /var/log, name: \"*.log\", max_size: 10M}", "{files_under: /var/log}", "needs max_size, max_age or both"),
        ("{files_under: /var/log,", "{files_under: /var/nothing,", "/var/nothing is not a directory"),
    ],
)
def test_bad_sizes_dates_and_links_are_reported(tmp_path, replace, with_, expect):
    assert replace in DISK
    _write(tmp_path, DISK.replace(replace, with_))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert expect in str(exc.value)


@pytest.mark.criterion(67, "Symlinks resolve and are graded")
def test_symlink_and_size_checks_are_graded_on_the_server(logged_in, tmp_path, user):
    _write(tmp_path, DISK)
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    try:
        complete(logged_in, "one")
        fs = load_catalog(tmp_path).modules["two"].terminal.starting_fs()
        assert _report(logged_in, "two", fs).json() == {"correct": False}
        # What the console's state() sends after the solution: the link, and the log emptied.
        link = {"type": "link", "mode": 0o777, "owner": "cadet", "group": "crew", "contents": "", "target": "/var/log/o2/big.log",
                "mtime": "2026-10-08T09:00:01"}
        emptied = {**fs["/var/log/o2/big.log"], "contents": "", "mtime": "2026-10-08T09:00:02"}
        del emptied["size"]
        assert _report(logged_in, "two", {**fs, "/station/latest.log": link}).json() == {"correct": False}  # the log's still 12M
        assert _report(logged_in, "two", {**fs, "/station/latest.log": link, "/var/log/o2/big.log": emptied}).json() == {"correct": True}
        wrong = {**link, "target": "../var/log/o2/big.log"}  # the same file, but not what was asked for
        assert _report(logged_in, "two", {**fs, "/station/latest.log": wrong, "/var/log/o2/big.log": emptied}).json() == {"correct": False}
    finally:
        app.dependency_overrides.pop(get_catalog, None)


def test_the_station_clock_matches_the_console():
    from app.content.schema import STATION_NOW

    shell = shell_source()
    assert f"var START_TIME = new Date({STATION_NOW.year}, {STATION_NOW.month - 1}, {STATION_NOW.day}, {STATION_NOW.hour}, {STATION_NOW.minute});" in shell


# --- #164: the station network ---------------------------------------------------------------
NETWORK = """terminal:
  task: Find who's listening.
  cwd: /station
  processes:
    - {command: "python3 -m http.server 8080"}
    - {command: "psql -h 10.4.0.20 telemetry"}
  network:
    interfaces: [{name: eth0, address: 10.4.0.12/24}]
    gateway: 10.4.0.1
    listening: [{port: 8080, process: python3}]
    connections: [{process: psql, remote: "10.4.0.20:5432"}]
    hosts:
      - {name: db, address: 10.4.0.20, services: [{port: 5432}], filtered: [2222]}
      - {name: relay, address: 203.0.113.47, services: [{port: 443}]}
  files:
    - {path: /station, type: dir}
  checks:
    - {exists: /station/network.txt}
  success: Logged.
  solution:
    - ss -tlnp > network.txt
"""


@pytest.mark.criterion(164, "The network is validated with the content")
def test_a_host_with_an_invalid_address_fails_naming_the_file_and_the_host(tmp_path):
    _write(tmp_path, NETWORK.replace("{name: db, address: 10.4.0.20,", "{name: db, address: 10.4.0.300,"))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    message = str(exc.value)
    assert "core/shell/02-two.md: terminal.network.hosts.0:" in message
    assert "host db: 10.4.0.300 is not an IPv4 address" in message


@pytest.mark.parametrize(
    ("replace", "with_", "expect"),
    [
        ("address: 203.0.113.47", "address: 8.8.8.8", "host relay: 8.8.8.8 is not a private or documentation address"),
        ("gateway: 10.4.0.1", "gateway: 10.5.0.1", "gateway: 10.5.0.1 isn't on any interface's subnet"),
        ("address: 10.4.0.12/24", "address: 10.4.0.12", "interface eth0: 10.4.0.12 needs a prefix"),
        ("address: 10.4.0.12/24", "address: 10.4.0.0/24", "interface eth0: 10.4.0.0/24 is its subnet's network or broadcast address"),
        ("{name: eth0,", "{name: lo,", "interface lo: the loopback interface is always there"),
        ("{name: relay, address: 203.0.113.47", "{name: relay, address: 10.4.0.12", "host relay: 10.4.0.12 is the console's own address"),
        ("{name: relay, address: 203.0.113.47", "{name: relay, address: 10.4.0.20", "host relay: 10.4.0.20 is db's address too"),
        ("{name: relay,", "{name: db,", "host db: listed twice"),
        ("filtered: [2222]", "filtered: [5432]", "host db: port 5432 is both a service and filtered"),
        ("process: python3}", "process: nginx}", "network: listening 8080/tcp: no starting process is called nginx"),
        ("process: python3}", "process: python3, address: 10.4.0.99}", "listening 8080/tcp: 10.4.0.99 is not 0.0.0.0"),
        ("[{port: 8080, process: python3}]", "[{port: 22, process: python3}]", "sshd already listens on 22"),
        ('remote: "10.4.0.20:5432"', 'remote: "10.4.0.20:5433"', "connection 10.4.0.20:5433: db has no TCP service on port 5433"),
        ('remote: "10.4.0.20:5432"', 'remote: "10.4.0.99:5432"', "connection 10.4.0.99:5432: 10.4.0.99 is not one of the hosts"),
        ('remote: "10.4.0.20:5432"}', 'remote: "10.4.0.20:51234", local_port: 9090}', "nothing listens on local port 9090"),
        ("{port: 5432}]", "{port: 5432}, {port: 5432}]", "host db: 5432/tcp listed twice"),
    ],
)
def test_bad_networks_are_reported(tmp_path, replace, with_, expect):
    assert replace in NETWORK
    _write(tmp_path, NETWORK.replace(replace, with_))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "core/shell/02-two.md" in str(exc.value) and expect in str(exc.value)


def test_the_network_reaches_the_console_only_when_the_exercise_has_one(tmp_path):
    from app.terminal import client_spec

    _write(tmp_path, NETWORK)
    spec = client_spec(load_catalog(tmp_path).modules["two"].terminal)
    assert spec["network"]["listening"] == [{"port": 8080, "proto": "tcp", "process": "python3", "address": "0.0.0.0", "http": None}]
    assert spec["network"]["hosts"][0] == {
        "name": "db", "address": "10.4.0.20", "up": True, "ping": True,
        "services": [{"port": 5432, "proto": "tcp", "http": None, "tls": None}], "filtered": [2222], "login": False,
    }
    (tmp_path / "plain").mkdir()
    _write(tmp_path / "plain")
    assert "network" not in client_spec(load_catalog(tmp_path / "plain").modules["two"].terminal)


def test_the_default_network_matches_the_console():
    from app.content.schema import NetworkSpec

    shell = shell_source()
    found = re.search(r"^  var DEFAULT_NETWORK = (\{.*\});$", shell, re.M)
    assert found, "the shell has no one-line DEFAULT_NETWORK"
    assert json.loads(found.group(1)) == NetworkSpec().model_dump()


# --- #165: names, /etc/hosts and the station's DNS ---------------------------------------------
DNS = NETWORK.replace(
    "      - {name: relay, address: 203.0.113.47, services: [{port: 443}]}\n",
    """      - {name: relay, address: 203.0.113.47, services: [{port: 443}]}
    dns:
      records:
        - {name: relay.depot-sync.net, value: 203.0.113.47}
        - {name: www.depot-sync.net, type: CNAME, value: relay.depot-sync.net}
        - {name: depot-sync.net, type: MX, value: "10 mail.depot-sync.net"}
        - {name: 47.113.0.203.in-addr.arpa, type: PTR, value: relay.depot-sync.net}
""",
)


@pytest.mark.parametrize(
    ("replace", "with_", "expect"),
    [
        ("value: 203.0.113.47}", "value: 8.8.8.8}", "dns relay.depot-sync.net A: 8.8.8.8 is not a private or documentation address"),
        ('value: "10 mail.depot-sync.net"', "value: mail.depot-sync.net", "should be a preference and a host name"),
        ("name: 47.113.0.203.in-addr.arpa", "name: relay.in-addr.arpa", "a PTR record's name is the address reversed"),
        ("name: depot-sync.net, type: MX", "name: 9.113.0.203.in-addr.arpa, type: MX", "only PTR records live under in-addr.arpa"),
        ("{name: www.depot-sync.net, type: CNAME", "{name: relay.depot-sync.net, type: CNAME", "a name with a CNAME can't have any other record"),
        ("value: 203.0.113.47}\n", "value: 203.0.113.47}\n        - {name: a.meridian, type: CNAME, value: b.meridian}\n"
         "        - {name: b.meridian, type: CNAME, value: a.meridian}\n", "its CNAMEs go round in a loop"),
        ("    dns:\n", "    dns:\n      server: 10.4.0.12\n", "dns server: 10.4.0.12 is the console's own address"),
        ("    dns:\n", "    dns:\n      server: 1.1.1.1\n", "dns server: 1.1.1.1 is not a private or documentation address"),
    ],
)
def test_bad_dns_is_reported(tmp_path, replace, with_, expect):
    assert replace in DNS
    _write(tmp_path, DNS.replace(replace, with_))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "core/shell/02-two.md" in str(exc.value) and expect in str(exc.value)


def test_every_console_has_etc_hosts_and_resolv_conf(tmp_path):
    from app.content.schema import ETC_HOSTS

    _write(tmp_path, DNS)
    fs = load_catalog(tmp_path).modules["two"].terminal.starting_fs()
    assert fs["/etc/hosts"] == {"type": "file", "mode": 0o644, "owner": "root", "group": "root", "contents": ETC_HOSTS}
    assert fs["/etc/resolv.conf"]["contents"] == "nameserver 10.4.0.1\n"  # the gateway, without a dns server
    (tmp_path / "server").mkdir()
    _write(tmp_path / "server", DNS.replace("    dns:\n", "    dns:\n      server: 10.4.0.53\n"))
    assert load_catalog(tmp_path / "server").modules["two"].terminal.starting_fs()["/etc/resolv.conf"]["contents"] == "nameserver 10.4.0.53\n"
    (tmp_path / "plain").mkdir()
    _write(tmp_path / "plain")  # no network: the default one's gateway
    assert load_catalog(tmp_path / "plain").modules["two"].terminal.starting_fs()["/etc/resolv.conf"]["contents"] == "nameserver 10.4.0.1\n"
    (tmp_path / "alone").mkdir()
    _write(tmp_path / "alone", NETWORK.replace("    gateway: 10.4.0.1\n", "    gateway: null\n").replace(
        "      - {name: relay, address: 203.0.113.47, services: [{port: 443}]}\n", ""))
    alone = load_catalog(tmp_path / "alone").modules["two"].terminal.starting_fs()["/etc/resolv.conf"]["contents"]
    assert alone == "# no nameserver: the console has no gateway and no DNS server\n"


def test_an_exercise_can_bring_its_own_etc_hosts(tmp_path):
    _write(tmp_path, DNS.replace("    - {path: /station, type: dir}\n",
                                 "    - {path: /station, type: dir}\n    - {path: /etc/hosts, owner: root, group: root, contents: \"10.4.0.99 mission.meridian\\n\"}\n"))
    assert load_catalog(tmp_path).modules["two"].terminal.starting_fs()["/etc/hosts"]["contents"] == "10.4.0.99 mission.meridian\n"


def test_the_station_hosts_file_matches_the_console():
    from app.content.schema import ETC_HOSTS

    shell = shell_source()
    found = re.search(r'^  var ETC_HOSTS = (".*");$', shell, re.M)
    assert found, "the shell has no one-line ETC_HOSTS"
    assert json.loads(found.group(1)) == ETC_HOSTS


# --- #166: HTTP services, the firewall, and logging in to another host --------------------------
HTTP = NETWORK.replace(
    "      - {name: relay, address: 203.0.113.47, services: [{port: 443}]}\n",
    """      - name: relay
        address: 203.0.113.47
        services:
          - port: 443
            tls: trusted
            http:
              - {path: /, headers: {Content-Type: text/plain}, body: "FLUSH\\n"}
              - {path: /report, method: POST, status: 201}
      - {name: mission, address: 10.4.0.5, login: true, services: [{port: 22}]}
    firewall:
      enabled: true
      rules:
        - {port: 22, proto: tcp}
        - {from: 10.4.0.5, port: 8080, proto: tcp}
""",
)
FIXTURES = Path(__file__).resolve().parent / "js" / "fixtures"


@pytest.mark.parametrize(
    ("replace", "with_", "expect"),
    [
        ("tls: trusted\n            http:", "tls: trusted\n            proto: udp\n            http:", "HTTP runs over tcp"),
        ("            http:\n              - {path: /, headers: {Content-Type: text/plain}, body: \"FLUSH\\n\"}\n              - {path: /report, method: POST, status: 201}\n", "", "tls needs http routes"),
        ("{path: /report, method: POST, status: 201}", "{path: /, method: GET, status: 201}", "GET / listed twice"),
        ("{path: /report,", "{path: report,", "path"),
        ("{name: mission, address: 10.4.0.5, login: true, services: [{port: 22}]}", "{name: mission, address: 10.4.0.5, login: true}", "host mission: login needs sshd"),
        ("{from: 10.4.0.5, port: 8080, proto: tcp}", "{from: 10.4.0.300, port: 8080}", "from 10.4.0.300 is not an IPv4 address or network"),
        ("{from: 10.4.0.5, port: 8080, proto: tcp}", "{proto: tcp}", "give a port, a from, or both"),
        ("{from: 10.4.0.5, port: 8080, proto: tcp}", "{from: 10.4.0.5, proto: tcp}", "a protocol needs a port"),
    ],
)
def test_bad_http_and_firewalls_are_reported(tmp_path, replace, with_, expect):
    assert replace in HTTP
    _write(tmp_path, HTTP.replace(replace, with_))
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert "core/shell/02-two.md" in str(exc.value) and expect in str(exc.value)


def test_the_firewall_is_ufws_own_files(tmp_path):
    from app.content.schema import UFW_INSTALLED, ufw_conf

    _write(tmp_path, HTTP)
    fs = load_catalog(tmp_path).modules["two"].terminal.starting_fs()
    assert fs["/etc/ufw/ufw.conf"]["contents"] == ufw_conf(True) and "ENABLED=yes\n" in ufw_conf(True)
    rules = fs["/etc/ufw/user.rules"]
    assert (rules["mode"], rules["owner"]) == (0o640, "root")  # root's to read, as on Ubuntu
    assert "### tuple ### allow tcp 22 0.0.0.0/0 any 0.0.0.0/0 in\n" in rules["contents"]
    assert "### tuple ### allow tcp 8080 0.0.0.0/0 any 10.4.0.5 in\n-A ufw-user-input -p tcp --dport 8080 -s 10.4.0.5 -j ACCEPT\n" in rules["contents"]
    assert "10.4.0.5" not in fs["/etc/ufw/user6.rules"]["contents"]  # an IPv4 source has no IPv6 rule
    # Without a firewall: ufw as installed, and off.
    (tmp_path / "plain").mkdir()
    _write(tmp_path / "plain")
    plain = load_catalog(tmp_path / "plain").modules["two"].terminal.starting_fs()
    assert plain["/etc/ufw/user.rules"]["contents"] == UFW_INSTALLED and "ENABLED=no\n" in plain["/etc/ufw/ufw.conf"]["contents"]


def test_ufws_rule_files_are_written_as_ufw_writes_them():
    from app.content.schema import FirewallRule, ufw_rules

    # The rules in the order a real ufw 0.36.2 was given them; the fixtures are its files.
    rules = [
        FirewallRule(port=22, proto="tcp"), FirewallRule(port=8080), FirewallRule(port=53, proto="udp"),
        FirewallRule(**{"from": "10.4.0.5"}), FirewallRule(port=9000, proto="tcp", **{"from": "10.4.0.5"}),
        FirewallRule(action="deny", port=3000, proto="tcp"), FirewallRule(port=3000, **{"from": "10.4.0.0/24"}),
    ]
    tuples = [r.tuple() for r in rules]
    assert ufw_rules(tuples) == (FIXTURES / "ufw-user.rules").read_text()
    assert ufw_rules(tuples, six=True) == (FIXTURES / "ufw-user6.rules").read_text()


def test_routes_reach_the_console(tmp_path):
    from app.terminal import client_spec

    _write(tmp_path, HTTP)
    spec = client_spec(load_catalog(tmp_path).modules["two"].terminal)
    relay = next(h for h in spec["network"]["hosts"] if h["name"] == "relay")
    assert relay["services"][0]["tls"] == "trusted"
    assert relay["services"][0]["http"][0] == {"path": "/", "method": "GET", "status": 200, "headers": {"Content-Type": "text/plain"}, "body": "FLUSH\n"}
    assert next(h for h in spec["network"]["hosts"] if h["name"] == "mission")["login"] is True


# --- #249: a lacks check may name a file the learner creates ------------------------------
def _made(exercise, **files):
    """The starting filesystem plus files the learner wrote in their home directory."""
    from app.terminal import Node

    start = {p: Node(**n) for p, n in exercise.starting_fs().items()}
    home = start[exercise.cwd]
    made = {f"{exercise.cwd}/{name.replace('_', '.')}": home.model_copy(update={"type": "file", "mode": 0o664, "contents": text})
            for name, text in files.items()}
    return start | made


@pytest.mark.criterion(249, "A lacks check may name a file the learner creates")
def test_a_lacks_check_may_name_a_file_the_learner_creates(tmp_path):
    _write(tmp_path, TERMINAL.replace('{mode: /station/scrubber.conf, equals: "600"}',
                                      '{lacks: /station/report.txt, text: override}'))
    load_catalog(tmp_path)  # loads: a learner's file is fair game, as for contains


@pytest.mark.criterion(249, "A lacks check on a missing file fails in both graders")
def test_a_lacks_check_on_a_missing_file_fails():
    from app.content.schema import LacksCheck
    from app.terminal import passes

    assert not passes(LacksCheck(lacks="/home/cadet/nowhere.txt", text="x"), {}, "/home/cadet")
    # The browser's grader runs the same case from check_cases.json (tests/js/).
    cases = json.loads((FIXTURES / "check_cases.json").read_text())["cases"]
    assert any(c["name"] == "lacks: a missing file fails" and c["expect"] is False for c in cases)


@pytest.mark.criterion(249, "Module 07 enforces \"and nothing else\"")
def test_module_07_refuses_the_whole_log_in_alerts():
    from app.terminal import grade

    exercise = load_catalog().modules["pipes-and-redirection"].terminal
    log = next(f.contents for f in exercise.files if f.path == "/station/reactor/core.log")
    listing = "ls: cannot access '/station/reactor-b': No such file or directory\n/station/reactor:\ncoolant.log\ncore.log\n"
    alerts = "".join(line + "\n" for line in log.splitlines() if "ALERT" in line)
    assert grade(exercise, _made(exercise, reactor_txt=listing, alerts_txt=alerts), exercise.cwd)
    assert not grade(exercise, _made(exercise, reactor_txt=listing, alerts_txt=log), exercise.cwd)


@pytest.mark.criterion(249, "Module 08 enforces \"three\"")
def test_module_08_refuses_every_address_in_noisy():
    from app.terminal import grade

    exercise = load_catalog().modules["text-tools"].terminal
    top = "      9 10.4.2.17\n      6 10.4.7.3\n      4 192.168.8.40\n"
    rest = "      2 172.16.0.5\n      2 10.4.2.90\n      1 192.168.8.41\n      1 10.4.9.12\n"
    assert grade(exercise, _made(exercise, noisy_txt=top), exercise.cwd)
    assert not grade(exercise, _made(exercise, noisy_txt=top + rest), exercise.cwd)


@pytest.mark.criterion(249, "The reference solutions still complete both tasks")
def test_modules_07_and_08_solutions_are_still_proven():
    # tests/js/solutions.test.js runs each solution through the real shell against these checks;
    # here, the fixture it reads must carry the new lacks checks.
    exercises = json.loads((FIXTURES / "exercises.json").read_text())
    for slug in ("pipes-and-redirection", "text-tools"):
        spec = next(e["spec"] for k, e in exercises.items() if slug in k)
        assert any("lacks" in c for c in spec["checks"]), slug
