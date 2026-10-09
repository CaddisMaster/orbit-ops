"""Grading a terminal exercise on the server.

The station console (static/js/console.js) is a shell simulated in the browser,
and it grades as you go. The browser's verdict is never trusted: when the
console reports, it sends the filesystem it ended with, and grade() runs THIS
module's checks against that state. A POST claiming success for a state that
fails the checks is recorded as incorrect, and one module's state can't pass
another module's task.

What this can't stop is a hand-written state that satisfies the checks without
any commands being typed. For a single learner grading their own practice
that's accepted (#17); replaying the commands server-side would mean a second
shell implementation.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.content.schema import (
    AbsPath,
    Account,
    ContainsCheck,
    ExistsCheck,
    MissingCheck,
    ModeCheck,
    OwnerCheck,
    TerminalCheck,
    TerminalExercise,
)

MAX_NODES = 500
MAX_CONTENTS = 20_000  # characters per file


class Node(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    type: Literal["file", "dir"]
    mode: Annotated[int, Field(ge=0, le=0o7777)]
    owner: Account
    group: Account
    contents: Annotated[str, Field(max_length=MAX_CONTENTS)] = ""


class Report(BaseModel):
    """What the console POSTs: the state it ended with and its own verdict."""

    model_config = ConfigDict(extra="forbid")

    state: dict[AbsPath, Node]
    passed: bool  # the browser's claim; recorded, never believed

    @field_validator("state")
    @classmethod
    def _bounded(cls, state):
        if len(state) > MAX_NODES:
            raise ValueError(f"at most {MAX_NODES} paths")
        return state


def passes(check: TerminalCheck, state: dict[str, Node]) -> bool:
    match check:
        case ModeCheck(mode=path, equals=octal):
            return path in state and state[path].mode & 0o777 == int(octal, 8)
        case OwnerCheck(owner=path, user=user, group=group):
            node = state.get(path)
            return node is not None and node.owner == user and (group is None or node.group == group)
        case ExistsCheck(exists=path, type=kind):
            return path in state and (kind is None or state[path].type == kind)
        case MissingCheck(missing=path):
            return path not in state
        case ContainsCheck(contains=path, text=text):
            node = state.get(path)
            return node is not None and node.type == "file" and text in node.contents
    return False


def grade(exercise: TerminalExercise, state: dict[str, Node]) -> bool:
    return all(passes(check, state) for check in exercise.checks)


def client_spec(exercise: TerminalExercise) -> dict:
    """What the console needs, as JSON: the starting filesystem, where to start,
    who you are, the checks it grades against and the success message. The
    checks are the task restated, so sending them reveals nothing the task
    text doesn't."""
    return {
        "user": exercise.user,
        "group": exercise.group,
        "cwd": exercise.cwd,
        "fs": exercise.starting_fs(),
        "checks": [c.model_dump() for c in exercise.checks],
        "success": exercise.success,
    }
