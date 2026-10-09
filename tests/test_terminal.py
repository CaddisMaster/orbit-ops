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
    assert re.search(r'<script src="[^"]*/static/js/shell.js" defer></script>', page)
    assert re.search(r'<script src="[^"]*/static/js/console.js" defer></script>', page)
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
    ],
    ids=["relative-path", "bad-type", "bad-owner", "huge-file", "too-many-paths"],
)
def test_malformed_or_oversized_reports_are_refused(logged_in, terminal_curriculum, user, state):
    complete(logged_in, "one")
    assert _report(logged_in, "two", state).status_code == 422
    assert _attempts(user.id) == []


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
