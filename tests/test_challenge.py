"""Code challenges (#54): content held to its own checks in CPython, the
module page, and recording the browser's verdict.

Running Python in a page needs a browser, so "Run shows output" and how a
failed check reads are verified with Playwright (see the PR)."""

import ast
import json
import os
import re
import sys
import tempfile
import textwrap

import pytest
from sqlalchemy import select

from app import challenge
from app.content import ContentError, load_catalog
from app.content.schema import Challenge
from app.db import SessionLocal
from app.models import ExerciseAttempt, XpEvent
from tests.conftest import csrf, real_catalog
from tests.test_review import _complete
from tests.test_terminal import TERMINAL
from tests.test_xp import MODULE, SYLLABUS

BEFORE_TEXT_TOOLS = (
    "the-filesystem", "navigating", "files-and-globs", "permissions",
    "users-and-sudo", "processes-and-signals", "pipes-and-redirection",
)  # fmt: skip


@pytest.fixture
def at_text_tools(user):
    _complete(user.id, *BEFORE_TEXT_TOOLS)


def _report(client, results, code="print('hi')", slug="text-tools"):
    return client.post(
        f"/modules/{slug}/challenge",
        content=json.dumps({"code": code, "results": results}),
        headers={"Content-Type": "application/json", "X-CSRF-Token": csrf(client)},
    )


def _attempts(user_id):
    with SessionLocal() as db:
        return list(db.scalars(select(ExerciseAttempt).where(ExerciseAttempt.user_id == user_id, ExerciseAttempt.kind == "challenge")))


def _challenge_xp(user_id):
    with SessionLocal() as db:
        return list(db.scalars(select(XpEvent.amount).where(XpEvent.user_id == user_id, XpEvent.reason == "challenge")))


# --- content -------------------------------------------------------------------------------
@pytest.mark.criterion(54, "Every challenge's solution passes and its starter fails")
def test_every_challenges_solution_passes_and_its_starter_fails():
    modules = [m for m in real_catalog().modules.values() if m.challenge]
    assert modules
    for module in modules:
        assert all(challenge.run_in_cpython(module, module.challenge.solution)), module.slug
        assert not all(challenge.run_in_cpython(module, module.challenge.starter)), module.slug


@pytest.mark.criterion(54, "There is a real challenge")
def test_there_is_a_real_challenge():
    module = real_catalog().modules["text-tools"]
    assert module.challenge and module.challenge_inputs["log"].count("\n") == 25  # the console's access.log
    naive = "def failed_logins(log):\n    return sum('POST /login' in l and '401' in l for l in log.splitlines())"
    assert challenge.run_in_cpython(module, naive) == [True, True, True, False, False]  # the checks catch the shortcut


def test_the_challenge_agrees_with_meridian():
    # The task and the first check quote MERIDIAN's figure; it must be the log's.
    module = real_catalog().modules["text-tools"]
    log = module.challenge_inputs["log"].splitlines()
    failed = sum('"POST /login ' in line and line.split('"')[2].split()[0] == "401" for line in log)
    assert f"failed_logins(log) == {failed}" in module.challenge.checks[0].check
    assert f"{failed} failed" in module.challenge.task
    said = " ".join(html for _, html in module.comms_html["open"])
    assert f"{failed} FAILED" in said


def _write(root, challenge_yaml, terminal=TERMINAL):
    (root / "syllabus.yml").write_text(textwrap.dedent(SYLLABUS))
    (root / "core/shell").mkdir(parents=True)
    text = MODULE.format(title="One", xp=50).replace("---\nLesson.", terminal + challenge_yaml + "---\nLesson.", 1)
    (root / "core/shell/01-one.md").write_text(text)


CHALLENGE = """challenge:
  task: Do it.
  inputs: {data: /station/scrubber.conf}
  starter: x = 0
  checks:
    - {check: assert x == 1, says: x is one.}
  solution: x = 1
"""


@pytest.mark.parametrize(
    ("challenge_yaml", "terminal", "expect"),
    [
        (CHALLENGE.replace("/station/scrubber.conf", "/station/nope.txt"), TERMINAL, "challenge.inputs.data: /station/nope.txt is not a file in this module's console"),
        (CHALLENGE, "", "challenge.inputs.data: /station/scrubber.conf is not a file in this module's console"),
        (CHALLENGE.replace("  checks:\n    - {check: assert x == 1, says: x is one.}\n", "  checks: []\n"), TERMINAL, "challenge.checks"),
        (CHALLENGE.replace("{data:", "{Data:"), TERMINAL, "challenge.inputs.Data"),
    ],
)
def test_a_bad_challenge_is_refused(tmp_path, challenge_yaml, terminal, expect):
    _write(tmp_path, challenge_yaml, terminal)
    with pytest.raises(ContentError) as exc:
        load_catalog(tmp_path)
    assert expect in str(exc.value)


def test_the_page_never_gets_the_solution():
    module = real_catalog().modules["text-tools"]
    spec = challenge.client_spec(module)
    assert set(spec) == {"inputs", "files", "starter", "checks", "says"}
    assert "parts = line.split" not in json.dumps(spec)  # the reference answer's code


# --- the page -------------------------------------------------------------------------------
def test_the_module_page_has_the_challenge(logged_in, at_text_tools):
    page = logged_in.get("/modules/text-tools").text
    assert '<section class="card challenge" aria-labelledby="challenge-heading"' in page
    assert re.search(r'<script src="[^"]*/static/js/python.js\?v=[^"]+"[^>]* defer></script>', page)
    assert re.search(r'<script src="[^"]*/static/js/challenge.js\?v=[^"]+"[^>]* defer></script>', page)
    assert "def failed_logins(log):" in page and "parts = line.split" not in page
    assert "Bonus · Python · 30 XP" in page and "✓ Passed" not in page
    assert "python.js" not in logged_in.get("/modules/the-filesystem").text  # only where there's a challenge


@pytest.mark.criterion(54, "Submitting a correct answer passes")
def test_submitting_a_correct_answer_passes(logged_in, user, at_text_tools):
    body = _report(logged_in, [True] * 5, code="# mine").json()
    assert body == {"correct": True, "xp_gained": 30}
    assert _report(logged_in, [True] * 5).json() == {"correct": True, "xp_gained": 0}  # once
    assert _challenge_xp(user.id) == [30]
    attempts = _attempts(user.id)
    assert [a.correct for a in attempts] == [True, True] and attempts[0].submitted == {"code": "# mine", "results": [True] * 5}
    page = logged_in.get("/modules/text-tools").text
    assert "✓ Passed</span>: the 30 XP is yours." in page and ">print(&#39;hi&#39;)</textarea>" in page  # the last code


@pytest.mark.criterion(54, "A failing submission says what failed")
def test_a_failing_submission_earns_nothing(logged_in, user, at_text_tools):
    assert _report(logged_in, [True, False, True, True, True]).json() == {"correct": False, "xp_gained": 0}
    assert _report(logged_in, [True, True]).json()["correct"] is False  # too few results is not a pass
    assert _challenge_xp(user.id) == []
    # what each check checks, in words, is on the page for challenge.js to show; the code isn't shown
    page = logged_in.get("/modules/text-tools").text
    assert "The 401 has to be the status code" in page


def test_a_locked_or_challengeless_module_refuses_a_report(logged_in, user):
    assert _report(logged_in, [True] * 5).status_code == 403  # text-tools is locked
    assert _report(logged_in, [True], slug="the-filesystem").status_code == 404
    assert _attempts(user.id) == []


def test_reports_are_bounded(logged_in, at_text_tools):
    assert _report(logged_in, [True] * 11).status_code == 422
    assert _report(logged_in, [True] * 5, code="x" * (challenge.MAX_CODE + 1)).status_code == 422


# --- the runner, the one procedure the browser and CI share (#396) --------------------------
FILES = {"manifest.csv": "crate,mass\nC-101,40\n", "logs/bay.log": "ok\n"}


@pytest.mark.criterion(396, "A challenge reads its own files")
def test_a_challenge_reads_its_own_files(tmp_path):
    spec = """challenge:
  task: Read it.
  files:
    manifest.csv: |
      crate,mass
      C-101,40
    logs/bay.log: "ok"
  starter: rows = []
  checks:
    - {check: "assert rows == ['crate,mass', 'C-101,40']", says: It reads the manifest.}
    - {check: "assert bay == 'ok'", says: It reads the bay's log.}
  solution: |-
    from pathlib import Path
    rows = open("manifest.csv").read().splitlines()
    bay = Path("logs/bay.log").read_text()
"""
    _write(tmp_path, spec, terminal="")
    module = load_catalog(tmp_path).modules["one"]
    assert not module.terminal
    assert challenge.run_in_cpython(module, module.challenge.solution) == [True, True]
    assert challenge.run_in_cpython(module, module.challenge.starter) == [False, False]
    sent = challenge.client_spec(module)
    assert sent["files"] == {"manifest.csv": "crate,mass\nC-101,40\n", "logs/bay.log": "ok"}
    assert "solution" not in sent


@pytest.mark.parametrize("path", ["/etc/passwd", "../up", "a/../b", "./a", "a//b", "a b", "a/"])
def test_a_challenge_file_stays_in_the_working_directory(path):
    with pytest.raises(ValueError, match="files"):
        Challenge(task="t", files={path: "x"}, starter="s", checks=[{"check": "c", "says": "s"}], solution="s")


@pytest.mark.criterion(396, "Each run starts with the challenge's files as declared")
def test_each_run_starts_with_the_files_as_declared():
    # One workdir across runs, as in the browser, where the worker lives on between them.
    runner = challenge._runner()
    cwd = os.getcwd()
    with tempfile.TemporaryDirectory() as parent:
        def run(code):
            request = {"workdir": f"{parent}/w", "code": code, "inputs": {}, "files": FILES, "checks": ["assert seen"]}
            return json.loads(runner.run(json.dumps(request)))

        try:
            changed = "import os\nopen('manifest.csv', 'w').write('gone')\nopen('new.txt', 'w').write('x')\nos.mkdir('sub')\nos.chdir('sub')\nseen = True"
            assert run(changed)["checks"] == [True]
            again = "import os\nseen = open('manifest.csv').read().startswith('crate') and not os.path.exists('new.txt') and os.path.basename(os.getcwd()) == 'w'"
            assert run(again)["checks"] == [True]
        finally:
            os.chdir(cwd)


@pytest.mark.criterion(396, "A check can read the exit code")
@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("import sys\nsys.exit(3)", 3),
        ("import sys\nsys.exit()", 0),
        ("import sys\nsys.exit('bad record')", 1),
        ("import argparse\nargparse.ArgumentParser().parse_args(['--nope'])", 2),
        ("x = 1", None),
    ],
)
def test_the_checks_run_after_an_exit_and_can_read_its_code(code, expected):
    result = challenge.run_once(code, checks=[f"assert __exit_code__ == {expected!r}"])
    assert result == {"error": None, "exit_code": expected, "checks": [True]}


def test_a_check_that_exits_has_not_passed_and_the_ones_after_it_still_run():
    assert challenge.run_once("x = 1", checks=["import sys; sys.exit(0)", "assert x == 1"])["checks"] == [False, True]


def test_an_uncaught_exception_fails_every_check():
    result = challenge.run_once("1 / 0", checks=["assert True", "assert True"])
    assert result["checks"] == [False, False] and result["exit_code"] is None


@pytest.mark.criterion(396, "A traceback shows the learner's own code")
def test_a_traceback_shows_the_learners_own_lines_and_nothing_of_the_runner():
    error = challenge.run_once("def bad():\n    return 1 / 0\n\nbad()")["error"]
    assert error.startswith("Traceback (most recent call last):")
    assert 'File "script.py", line 4, in <module>' in error and "bad()" in error
    assert 'File "script.py", line 2, in bad' in error and "return 1 / 0" in error
    assert error.rstrip().endswith("ZeroDivisionError: division by zero")
    assert "challenge_runner" not in error and "exec(" not in error


def test_a_syntax_error_names_the_line_and_nothing_of_the_runner():
    error = challenge.run_once("x = 1\ndef f(:\n    pass")["error"]
    assert 'File "script.py", line 2' in error and "SyntaxError" in error
    assert "challenge_runner" not in error


@pytest.mark.criterion(396, "A script's main guard runs")
def test_a_scripts_main_guard_runs():
    code = "ran = False\nif __name__ == '__main__':\n    ran = True"
    assert challenge.run_once(code, checks=["assert ran"])["checks"] == [True]


def test_argparse_names_the_script(capfd):
    challenge.run_once("import argparse\nargparse.ArgumentParser().parse_args(['--nope'])")
    assert "usage: script.py" in capfd.readouterr().err


def test_running_a_challenge_puts_the_process_back():
    before = (os.getcwd(), sys.argv, sys.stdout, sys.stderr)
    challenge.run_once("import os, sys\nos.chdir('/')\nsys.argv = ['x']\nsys.stdout = None\nsys.stderr = None")
    assert (os.getcwd(), sys.argv, sys.stdout, sys.stderr) == before


def test_the_runner_uses_only_the_standard_library():
    imported = {
        name.split(".")[0]
        for node in ast.walk(ast.parse(challenge.RUNNER.read_text()))
        if isinstance(node, ast.Import | ast.ImportFrom)
        for name in ([a.name for a in node.names] if isinstance(node, ast.Import) else [node.module])
    }
    assert imported <= sys.stdlib_module_names, imported - sys.stdlib_module_names


def test_a_checks_says_is_plain_text():
    # challenge.js sets it with textContent, so Markdown would show as its raw marks (#398).
    for module in real_catalog().modules.values():
        for check in module.challenge.checks if module.challenge else ():
            assert "`" not in check.says and "**" not in check.says, f"{module.slug}: {check.says}"
