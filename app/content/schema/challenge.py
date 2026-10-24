"""Code challenges (#54)."""

from typing import Annotated

from pydantic import ConfigDict, Field

from .base import Slug, Text, _Strict
from .terminal.files import AbsPath

# ---------------------------------------------------------------------------
# Code challenges (#54): Python run in the browser by Pyodide, never on the
# server. The learner's code runs, then each check in the same namespace.
# ---------------------------------------------------------------------------
PyName = Annotated[str, Field(pattern=r"^[a-z_][a-z0-9_]*$", max_length=32)]


class ChallengeCheck(_Strict):
    check: Text  # a Python statement, usually an assert, run after the learner's code
    says: Text  # what it checks, in words: shown when it fails, instead of the code


class Challenge(_Strict):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    from_: Slug | None = Field(default=None, alias="from")  # the cast member asking (#82)
    task: Text  # what to write (Markdown)
    # Variables set before the learner's code runs, each holding the contents
    # of a file from this module's console, e.g. {log: /var/log/docking/access.log}.
    inputs: dict[PyName, AbsPath] = {}
    starter: Text  # what the editor starts with; CI requires it to fail a check
    checks: Annotated[list[ChallengeCheck], Field(min_length=1, max_length=10)]
    # A reference answer that CI runs in CPython against the checks. Never sent
    # to the browser, like quiz answers.
    solution: Text
