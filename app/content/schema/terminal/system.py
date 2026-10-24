"""The console's accounts, processes, disk and memory."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..base import _Strict
from .files import AbsPath, Account, SizeText, size_bytes


def proc_name(command: str) -> str:
    """What ps and pgrep call a process: the program's file name."""
    first = command.lstrip("-").split(" ")[0]
    return first.rsplit("/", 1)[-1].rstrip(":")


class AccountSpec(_Strict):
    """Another account in /etc/passwd, e.g. a service account."""

    name: Account
    uid: Annotated[int, Field(ge=1, le=60000)]
    group: Account | None = None  # default: a group of the same name
    groups: list[Account] = []  # supplementary
    comment: str = ""
    home: AbsPath | None = None  # default /var/lib/<name>
    shell: AbsPath = "/usr/sbin/nologin"


class ProcessSpec(_Strict):
    """A process running when the console starts."""

    command: Annotated[str, Field(min_length=1, max_length=120)]
    user: Account | None = None  # default: the exercise's user
    cpu: Annotated[float, Field(ge=0, le=100)] = 0.0
    mem: Annotated[float, Field(ge=0, le=100)] = 0.1
    ignores: list[Literal["HUP", "INT", "TERM"]] = []  # signals it handles and survives (never KILL)


class DiskSpec(_Strict):
    """The drive df reports (#67). Used space is `base` plus every file."""

    size: SizeText = "20G"
    base: SizeText = "4.2G"  # what the system takes outside the exercise's files

    @model_validator(mode="after")
    def _fits(self):
        if size_bytes(self.base) >= size_bytes(self.size):
            raise ValueError("disk: base must be smaller than size")
        return self


class MemorySpec(_Strict):
    """What free reports (#67)."""

    total: SizeText = "2G"
    used: SizeText = "820M"
    cache: SizeText = "640M"  # buff/cache
    shared: SizeText = "12M"

    @model_validator(mode="after")
    def _fits(self):
        if size_bytes(self.used) + size_bytes(self.cache) > size_bytes(self.total):
            raise ValueError("memory: used + cache can't be more than total")
        return self
