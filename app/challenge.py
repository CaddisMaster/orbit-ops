"""Code challenges (#54): what the browser gets, and running one in CPython.

Learner code runs only in the browser, in Pyodide (static/js/python.js); the
server never executes it. So the verdict is the browser's: the page runs the
checks and reports which passed, and the server records that. It's a
trust-the-client design, acceptable for a single-user learning app, and it
means the check code reaches the page. It's never shown, but a learner who
reads the page source can see it.

run_in_cpython() is the same procedure in real CPython. CI uses it to hold
every challenge's reference solution to its checks, and its starter to
failing one (tests/test_challenge.py). The procedure itself is one file,
static/py/challenge_runner.py, which the browser fetches and this imports (#396).
"""

import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import Module
from app.models import ExerciseAttempt

MAX_CODE = 20_000  # characters of learner code stored per attempt
XP = 30  # for a module's challenge, the first time it passes (docs/roadmap.md §4)
RUNNER = Path(__file__).parent / "static" / "py" / "challenge_runner.py"


class Report(BaseModel):
    """What the page POSTs after Submit: the code and each check's result."""

    code: str = Field(max_length=MAX_CODE)
    results: list[bool] = Field(max_length=10)


def client_spec(module: Module) -> dict:
    """What the page needs: never the solution."""
    challenge = module.challenge
    return {
        "inputs": module.challenge_inputs,
        "files": challenge.files,
        "starter": challenge.starter,
        "checks": [c.check for c in challenge.checks],
        "says": [c.says for c in challenge.checks],
    }


def passed(module: Module, results: list[bool]) -> bool:
    return len(results) == len(module.challenge.checks) and all(results)


def _runner():
    spec = importlib.util.spec_from_file_location("challenge_runner", RUNNER)
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    return runner


def run_once(code: str, *, inputs: dict | None = None, files: dict | None = None, checks: list[str] | None = None) -> dict:
    """The browser's procedure, in CPython: {error, exit_code, checks}. For CI, on code from the repo.
    It changes the process's working directory, argv and standard streams, and puts them back."""
    argv, cwd, streams = sys.argv, os.getcwd(), (sys.stdout, sys.stderr)
    with tempfile.TemporaryDirectory() as parent:
        request = {"workdir": f"{parent}/challenge", "code": code, "inputs": inputs or {}, "files": files or {}, "checks": checks or []}
        try:
            return json.loads(_runner().run(json.dumps(request)))
        finally:
            sys.argv, (sys.stdout, sys.stderr) = argv, streams
            os.chdir(cwd)


def run_in_cpython(module: Module, code: str) -> list[bool]:
    """Run `code` then each check, as the browser does. An exception in `code` fails every check."""
    challenge = module.challenge
    return run_once(code, inputs=module.challenge_inputs, files=challenge.files, checks=[c.check for c in challenge.checks])["checks"]


# ---------------------------------------------------------------------------
# Persistence — every query is scoped to the user passed in.
# ---------------------------------------------------------------------------


def attempts(db: Session, user_id: int, slug: str) -> list[ExerciseAttempt]:
    return list(
        db.scalars(
            select(ExerciseAttempt)
            .where(ExerciseAttempt.user_id == user_id, ExerciseAttempt.module_slug == slug, ExerciseAttempt.kind == "challenge")
            .order_by(ExerciseAttempt.id)
        )
    )


def editor_state(db: Session, user_id: int, module: Module) -> tuple[str, bool]:
    """(the code to show, passed before?): the last code submitted, else the starter."""
    history = attempts(db, user_id, module.slug)
    code = history[-1].submitted["code"] if history else module.challenge.starter
    return code, any(a.correct for a in history)
