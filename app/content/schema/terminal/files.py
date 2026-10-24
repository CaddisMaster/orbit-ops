"""The console's starting filesystem: paths, sizes, the station's clock, entries."""

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..base import _Strict

# A path in the simulated filesystem: any printable name (`Spare Parts.csv`, `*.nope`), never
# touched on the server's disk, only compared. Control characters and empty segments are out (#71).
AbsPath = Annotated[str, Field(pattern=r"^/([^/\x00-\x1f\x7f]+(/[^/\x00-\x1f\x7f]+)*)?$", max_length=200)]
Octal = Annotated[str, Field(pattern=r"^0?[0-7]{3}$")]  # "600" or "0600"
Account = Annotated[str, Field(pattern=r"^[a-z_][a-z0-9_-]{0,31}$")]


def _parent(path: str) -> str:
    return path.rsplit("/", 1)[0] or "/"


# Sizes (#67): bytes, or a number with K, M or G, which are powers of 1024 ("12M").
SizeText = Annotated[str, Field(pattern=r"^\d+(\.\d+)?[KMG]?$")]
Size = Annotated[int, Field(ge=0, le=2**40)] | SizeText
_UNITS = {"": 1, "K": 1024, "M": 1024**2, "G": 1024**3}


def size_bytes(size: int | str) -> int:
    if isinstance(size, int):
        return size
    number, unit = re.fullmatch(r"(\d+(?:\.\d+)?)([KMG]?)", size).groups()
    return round(float(number) * _UNITS[unit])


# The station's clock when the console starts: shell.js's START_TIME, which
# moves on a second per command from here. Files are dated before it, and
# ages (find -mtime, the files_under check) are counted back from it.
STATION_NOW = datetime(2026, 10, 8, 9, 0)  # noqa: DTZ001 (station wall-clock time, as the console shows it)
Stamp = Annotated[str, Field(pattern=r"^\d{4}-\d\d-\d\d( \d\d:\d\d)?$")]  # "2026-09-20" or "2026-09-20 14:30"
LinkTarget = Annotated[str, Field(min_length=1, max_length=200, pattern=r"^[^\x00-\x1f\x7f]+$")]


class FsEntry(_Strict):
    path: AbsPath
    type: Literal["file", "dir", "link"] = "file"
    contents: str = ""
    mode: Octal | None = None  # default 644 for a file, 755 for a directory (a link is always 777)
    owner: Account | None = None  # default: the exercise's user
    group: Account | None = None  # default: the exercise's group
    target: LinkTarget | None = None  # a link's target, as `ln -s` would store it
    # A big file is sampled: `contents` is what cat shows, `size` what ls, du,
    # df and find see. Writing to the file replaces it (appending adds to it).
    size: Size | None = None
    mtime: Stamp | None = None  # when it was last changed; default: STATION_NOW

    @model_validator(mode="after")
    def _consistent(self):
        if self.type == "dir" and self.contents:
            raise ValueError(f"{self.path}: a directory has no contents")
        if self.path == "/":
            raise ValueError("/ always exists; don't list it")
        if (self.type == "link") != (self.target is not None):
            raise ValueError(f"{self.path}: a link, and only a link, has a target")
        if self.type == "link" and (self.contents or self.mode):
            raise ValueError(f"{self.path}: a link has no contents or mode of its own")
        if self.size is not None and self.type != "file":
            raise ValueError(f"{self.path}: only a file has a size")
        if self.mtime and self.modified() > STATION_NOW:
            raise ValueError(f"{self.path}: mtime {self.mtime} is after the station's clock ({STATION_NOW:%Y-%m-%d %H:%M})")
        return self

    def modified(self) -> datetime:
        return datetime.fromisoformat(self.mtime) if self.mtime else STATION_NOW
