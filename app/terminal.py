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

import fnmatch
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.content.schema import (
    ADMIN_DIR,
    STATION_NOW,
    AbsPath,
    Account,
    ActiveCheck,
    ContainsCheck,
    CwdCheck,
    DisabledCheck,
    EnabledCheck,
    ExecutableCheck,
    ExistsCheck,
    FilesUnderCheck,
    InactiveCheck,
    LacksCheck,
    LinkTarget,
    MissingCheck,
    ModeCheck,
    OwnerCheck,
    RunningCheck,
    Signal,
    SignalledCheck,
    StoppedCheck,
    SymlinkCheck,
    TerminalCheck,
    TerminalExercise,
    proc_name,
    size_bytes,
)

MAX_NODES = 500
MAX_PROCESSES = 200
MAX_UNITS = 100
MAX_CONTENTS = 20_000  # characters per file


class Node(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    type: Literal["file", "dir", "link"]
    mode: Annotated[int, Field(ge=0, le=0o7777)]
    owner: Account
    group: Account
    contents: Annotated[str, Field(max_length=MAX_CONTENTS)] = ""
    target: LinkTarget | None = None  # a link's
    size: Annotated[int, Field(ge=0, le=2**40)] | None = None  # a sampled big file's (#67)
    mtime: Annotated[str, Field(pattern=r"^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?$")] | None = None

    def bytes(self) -> int:
        return self.size if self.size is not None else len(self.contents.encode())

    def age_days(self) -> int:
        """Whole days since it changed, counted back from the station's clock, as find -mtime does."""
        changed = datetime.fromisoformat(self.mtime) if self.mtime else STATION_NOW
        return (STATION_NOW - changed).days


class Process(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    pid: Annotated[int, Field(ge=1, le=4_194_304)]
    user: Account
    command: Annotated[str, Field(max_length=200)]
    alive: bool
    signals: Annotated[list[Signal], Field(max_length=50)] = []


class UnitState(BaseModel):
    """A unit as the console left it (#303). Enabled-ness isn't here: it's the
    links in the filesystem, as on a real system."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    name: Annotated[str, Field(max_length=64)]
    state: Literal["active", "inactive", "failed", "activating"]


class Report(BaseModel):
    """What the console POSTs: the state it ended with and its own verdict."""

    model_config = ConfigDict(extra="forbid")

    state: dict[AbsPath, Node]
    cwd: AbsPath  # where the console ended up, for `cwd` checks
    processes: Annotated[list[Process], Field(max_length=MAX_PROCESSES)] = []
    units: Annotated[list[UnitState], Field(max_length=MAX_UNITS)] = []
    passed: bool  # the browser's claim; recorded, never believed

    @field_validator("state")
    @classmethod
    def _bounded(cls, state):
        if len(state) > MAX_NODES:
            raise ValueError(f"at most {MAX_NODES} paths")
        return state


def enabled(name: str, state: dict[str, Node]) -> bool:
    """Is there a link to `name` in some target's .wants/, as `systemctl enable` makes?"""
    prefix = ADMIN_DIR + "/"
    return any(
        path.startswith(prefix) and path.endswith(".wants/" + name) and path.count("/") == ADMIN_DIR.count("/") + 2
        and node.type == "link"
        for path, node in state.items()
    )


def passes(
    check: TerminalCheck, state: dict[str, Node], cwd: str, processes: list[Process] = (), units: list[UnitState] = ()
) -> bool:
    named = lambda name: [p for p in processes if proc_name(p.command) == name]  # noqa: E731
    active = lambda name: any(u.name == name and u.state == "active" for u in units)  # noqa: E731
    match check:
        case ActiveCheck(active=name):
            return active(name)
        case InactiveCheck(inactive=name):
            return not active(name)
        case EnabledCheck(enabled=name):
            return enabled(name, state)
        case DisabledCheck(disabled=name):
            return not enabled(name, state)
        case RunningCheck(running=name):
            return any(p.alive for p in named(name))
        case StoppedCheck(stopped=name):
            return not any(p.alive for p in named(name))
        case SignalledCheck(signalled=name, with_=sig):
            return any(sig in p.signals for p in named(name))
        case CwdCheck(cwd=expected):
            return cwd == expected
        case ModeCheck(mode=path, equals=octal):
            return path in state and state[path].mode & 0o777 == int(octal, 8)
        case OwnerCheck(owner=path, user=user, group=group):
            node = state.get(path)
            return node is not None and node.owner == user and (group is None or node.group == group)
        case ExistsCheck(exists=path, type=kind):
            return path in state and (kind is None or state[path].type == kind)
        case ExecutableCheck(executable=path):
            node = state.get(path)
            return node is not None and node.type == "file" and bool(node.mode & 0o100)
        case MissingCheck(missing=path):
            return path not in state
        case ContainsCheck(contains=path, text=text):
            node = state.get(path)
            return node is not None and node.type == "file" and text in node.contents
        case LacksCheck(lacks=path, text=text):
            node = state.get(path)
            return node is not None and node.type == "file" and text not in node.contents
        case SymlinkCheck(symlink=path, target=target):
            node = state.get(path)
            return node is not None and node.type == "link" and node.target == target
        case FilesUnderCheck(files_under=top, name=name, max_size=max_size, max_age=max_age):
            if state.get(top) is None or state[top].type != "dir":
                return False
            prefix = "/" if top == "/" else top + "/"
            limit = None if max_size is None else size_bytes(max_size)
            for path, node in state.items():
                if not path.startswith(prefix) or node.type != "file":
                    continue
                if name and not fnmatch.fnmatchcase(path.rsplit("/", 1)[1], name):
                    continue
                if limit is not None and node.bytes() > limit:
                    return False
                if max_age is not None and node.age_days() > max_age:
                    return False
            return True
    return False


def grade(
    exercise: TerminalExercise,
    state: dict[str, Node],
    cwd: str,
    processes: list[Process] = (),
    units: list[UnitState] = (),
) -> bool:
    return all(passes(check, state, cwd, processes, units) for check in exercise.checks)


def client_spec(exercise: TerminalExercise) -> dict:
    """What the console needs, as JSON: the starting filesystem, where to start,
    who you are, the checks it grades against and the success message. The
    checks are the task restated, so sending them reveals nothing the task
    text doesn't. The reference solution is never included."""
    return {
        "user": exercise.user,
        "group": exercise.group,
        "groups": exercise.groups,
        "password": exercise.password,
        "cwd": exercise.cwd,
        "env": exercise.env,
        **({"disk": {"size": size_bytes(d.size), "base": size_bytes(d.base)}} if (d := exercise.disk) else {}),
        **(
            {"memory": {k: size_bytes(getattr(m, k)) for k in ("total", "used", "cache", "shared")}}
            if (m := exercise.memory)
            else {}
        ),
        # Only when set, so exercises without one keep their exact shape; the
        # console's DEFAULT_NETWORK is NetworkSpec's defaults.
        **({"network": exercise.network.model_dump()} if exercise.network else {}),
        # #303: how each unit starts and what its program does. Its file is in fs.
        **(
            {"services": [u.model_dump(include={"name", "state", "exits", "runs_for"}) for u in exercise.services]}
            if exercise.services
            else {}
        ),
        "fs": exercise.starting_fs(),
        "processes": [
            {"command": p.command, "user": p.user or exercise.user, "cpu": p.cpu, "mem": p.mem, "ignores": p.ignores}
            for p in exercise.processes
        ],
        "checks": [c.model_dump(by_alias=True) for c in exercise.checks],
        "success": exercise.success,
    }
