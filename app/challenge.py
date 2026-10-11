"""Code challenges (#54): what the browser gets, and running one in CPython.

Learner code runs only in the browser, in Pyodide (static/js/python.js); the
server never executes it. So the verdict is the browser's: the page runs the
checks and reports which passed, and the server records that. It's a
trust-the-client design, acceptable for a single-user learning app, and it
means the check code reaches the page. It's never shown, but a learner who
reads the page source can see it.

run_in_cpython() is the same procedure in real CPython. CI uses it to hold
every challenge's reference solution to its checks, and its starter to
failing one (tests/test_challenge.py).
"""

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import Module
from app.models import ExerciseAttempt

MAX_CODE = 20_000  # characters of learner code stored per attempt
XP = 30  # for a module's challenge, the first time it passes (docs/roadmap.md §4)


class Report(BaseModel):
    """What the page POSTs after Submit: the code and each check's result."""

    code: str = Field(max_length=MAX_CODE)
    results: list[bool] = Field(max_length=10)


def client_spec(module: Module) -> dict:
    """What the page needs: never the solution."""
    challenge = module.challenge
    return {
        "inputs": module.challenge_inputs,
        "starter": challenge.starter,
        "checks": [c.check for c in challenge.checks],
        "says": [c.says for c in challenge.checks],
    }


def passed(module: Module, results: list[bool]) -> bool:
    return len(results) == len(module.challenge.checks) and all(results)


def run_in_cpython(module: Module, code: str) -> list[bool]:
    """Run `code` then each check in one fresh namespace, as the browser does.
    An exception in `code` fails every check. For CI, on code from the repo."""
    namespace = dict(module.challenge_inputs)
    try:
        exec(compile(code, "<challenge>", "exec"), namespace)  # noqa: S102 (reference code from content/, in tests)
    except Exception:
        return [False] * len(module.challenge.checks)
    results = []
    for check in module.challenge.checks:
        try:
            exec(compile(check.check, "<check>", "exec"), namespace)  # noqa: S102
            results.append(True)
        except Exception:
            results.append(False)
    return results


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
