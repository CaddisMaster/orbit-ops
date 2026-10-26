"""Terminal checks: what a task tests in the state the learner leaves behind."""

from typing import Annotated, Literal

from pydantic import ConfigDict, Field, model_validator

from ..base import Text, _Strict
from .files import AbsPath, Account, LinkTarget, Octal, Size


class ModeCheck(_Strict):
    mode: AbsPath
    equals: Octal


class OwnerCheck(_Strict):
    owner: AbsPath
    user: Account
    group: Account | None = None


class ExistsCheck(_Strict):
    exists: AbsPath
    type: Literal["file", "dir"] | None = None


class MissingCheck(_Strict):
    missing: AbsPath


class ExecutableCheck(_Strict):
    """A file its owner can run: the owner's x bit is set, whatever the rest of the
    mode is (chmod +x, u+x and 755 all pass). #70."""

    executable: AbsPath


class ContainsCheck(_Strict):
    contains: AbsPath
    text: Text


class LacksCheck(_Strict):
    lacks: AbsPath  # #200: the file is there and this text isn't in it
    text: Text


class CwdCheck(_Strict):
    cwd: AbsPath  # the console ends in this directory (for navigation tasks)


class SymlinkCheck(_Strict):
    symlink: AbsPath  # a symbolic link is here
    target: LinkTarget  # and points at this, exactly as written


class FilesUnderCheck(_Strict):
    """Every file below a directory (whose name matches `name`, if given) is at
    most `max_size` and was changed at most `max_age` days ago. Passes when
    nothing matches: "nothing in /var/log is over 50M". (#67)"""

    files_under: AbsPath
    name: Annotated[str, Field(min_length=1, max_length=64)] | None = None  # a glob, like "*.gz"
    max_size: Size | None = None
    max_age: Annotated[int, Field(ge=0, le=36500)] | None = None  # days, as find -mtime counts them

    @model_validator(mode="after")
    def _limits(self):
        if self.max_size is None and self.max_age is None:
            raise ValueError("files_under needs max_size, max_age or both")
        return self


ProcName = Annotated[str, Field(pattern=r"^[A-Za-z0-9._-]+$", max_length=64)]
Signal = Literal["HUP", "INT", "KILL", "TERM"]


class RunningCheck(_Strict):
    running: ProcName  # some process with this name is still alive


class StoppedCheck(_Strict):
    stopped: ProcName  # no process with this name is alive


class SignalledCheck(_Strict):
    signalled: ProcName  # some process with this name was sent `with`
    with_: Signal = Field(alias="with")

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)


UnitRef = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9_.-]*\.(service|timer)$", max_length=64)]


class ActiveCheck(_Strict):
    active: UnitRef  # #303: the unit is running (a timer: waiting), as `systemctl is-active` says active


class InactiveCheck(_Strict):
    inactive: UnitRef  # not active: stopped, failed, or never started


class EnabledCheck(_Strict):
    enabled: UnitRef  # starts at boot: a link to it in some target's .wants/ under /etc/systemd/system


class DisabledCheck(_Strict):
    disabled: UnitRef  # no such link


UnitCheck = ActiveCheck | InactiveCheck | EnabledCheck | DisabledCheck

TerminalCheck = (
    ModeCheck | OwnerCheck | ExistsCheck | MissingCheck | ExecutableCheck | ContainsCheck | LacksCheck | CwdCheck
    | RunningCheck | StoppedCheck | SignalledCheck | SymlinkCheck | FilesUnderCheck | UnitCheck
)


def check_path(check: TerminalCheck) -> str:
    match check:
        case ModeCheck(mode=p) | OwnerCheck(owner=p) | ExistsCheck(exists=p) | MissingCheck(missing=p):
            return p
        case ExecutableCheck(executable=p):
            return p
        case ContainsCheck(contains=p) | LacksCheck(lacks=p) | CwdCheck(cwd=p) | SymlinkCheck(symlink=p) | FilesUnderCheck(files_under=p):
            return p
        case RunningCheck(running=p) | StoppedCheck(stopped=p) | SignalledCheck(signalled=p):
            return p
        case ActiveCheck(active=p) | InactiveCheck(inactive=p) | EnabledCheck(enabled=p) | DisabledCheck(disabled=p):
            return p
    raise TypeError(check)


def describe(check: TerminalCheck) -> str:
    """A check as an author wrote it, for error messages: "mode /station/x"."""
    return f"{next(iter(type(check).model_fields))} {check_path(check)}"
