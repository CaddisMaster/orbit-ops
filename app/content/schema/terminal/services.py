"""The console's systemd (#303): unit files, and the state each unit starts in.

Unit files are ordinary files in the starting filesystem, as on a real system:
vendor units in /usr/lib/systemd/system, the admin's in /etc/systemd/system.
Enabling is a symlink in a target's .wants/ directory, so `{enabled}` reads the
filesystem; whether a unit is running is the console's runtime state, which it
reports beside the processes (app/terminal.py Report.units).
"""

import re
from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..base import _Strict

VENDOR_DIR = "/usr/lib/systemd/system"
ADMIN_DIR = "/etc/systemd/system"

UnitName = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9_.-]*\.(service|timer)$", max_length=64)]

# The keys the unit teaches (#303). systemd ignores unknown keys with a warning;
# here a typo fails the content instead, so a lesson can't show one by accident.
KNOWN_KEYS = {
    "Unit": {"Description", "Documentation", "After", "Before", "Wants", "Requires"},
    "Service": {"Type", "ExecStart", "ExecReload", "User", "Group", "Environment", "WorkingDirectory", "Restart", "RestartSec"},
    "Timer": {"OnCalendar", "Persistent", "Unit"},
    "Install": {"WantedBy"},
}

# OnCalendar as the console reads it: a shorthand, or [DAY ]*-*-* HH:MM[:SS]
# where each of the hour and minute is a number, * or */N. Kept equal to the
# console's parser (shell/systemd.js calendarNext) by a test.
CALENDAR_SHORTHANDS = ("minutely", "hourly", "daily", "weekly", "monthly")
CALENDAR = re.compile(
    r"^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?\*-\*-\* "
    r"(\d{1,2}|\*|\*/\d{1,2}):(\d{1,2}|\*|\*/\d{1,2})(?::(\d{1,2}))?$"
)


def parse_unit(text: str) -> dict[str, dict[str, list[str]]]:
    """A unit file as {section: {key: [values]}}, the way systemd reads it:
    `#` and `;` lines are comments, and a key may be given more than once."""
    sections: dict[str, dict[str, list[str]]] = {}
    current = None
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line[0] in "#;":
            continue
        if m := re.fullmatch(r"\[([A-Za-z]+)\]", line):
            current = sections.setdefault(m[1], {})
            continue
        if current is None or "=" not in line:
            raise ValueError(f"line {n}: {line!r} is not a [Section] or a Key=value")
        key, value = (part.strip() for part in line.split("=", 1))
        current.setdefault(key, []).append(value)
    return sections


def valid_calendar(spec: str) -> bool:
    m = CALENDAR.match(spec)
    if spec in CALENDAR_SHORTHANDS:
        return True
    if not m:
        return False
    hour, minute, second = m[2], m[3], m[4]

    def within(field: str, top: int) -> bool:
        if field == "*":
            return True
        step = field.startswith("*/")
        n = int(field[2:] if step else field)
        return 0 < n <= top if step else n <= top

    return within(hour, 23) and within(minute, 59) and (second is None or int(second) <= 59)


class SystemdUnit(_Strict):
    """One unit on the console: its file, and how it starts.

    `exits` and `runs_for` say what its program does, since the console can't
    run it: with `exits`, the program stops with that status after `runs_for`
    seconds (a crash); without, it runs until stopped. A unit with no `unit`
    text has no file yet. It's the program's behaviour, waiting for the unit
    file the learner writes (#308)."""

    name: UnitName
    unit: Annotated[str, Field(min_length=1, max_length=4000)] | None = None
    dir: Literal["/usr/lib/systemd/system", "/etc/systemd/system"] = VENDOR_DIR
    state: Literal["active", "inactive", "failed"] = "active"
    enabled: bool = False
    exits: Annotated[int, Field(ge=1, le=255)] | None = None
    runs_for: Annotated[int, Field(ge=0, le=86400)] = 0

    @property
    def path(self) -> str:
        return f"{self.dir}/{self.name}"

    @property
    def kind(self) -> str:
        return self.name.rsplit(".", 1)[1]

    def sections(self) -> dict[str, dict[str, list[str]]]:
        return parse_unit(self.unit) if self.unit else {}

    def wanted_by(self) -> list[str]:
        return [t for v in self.sections().get("Install", {}).get("WantedBy", []) for t in v.split()]

    def program(self) -> str | None:
        """ExecStart's program, without systemd's `-`/`@`/`+` prefixes."""
        starts = self.sections().get("Service", {}).get("ExecStart", [])
        return starts[-1].lstrip("-@+!").split()[0] if starts and starts[-1] else None

    @model_validator(mode="after")
    def _valid(self):
        where = f"services: {self.name}"
        if self.unit is None:
            if self.enabled or self.state != "inactive":
                raise ValueError(f"{where}: a unit with no file can only start inactive and disabled")
            return self
        try:
            sections = self.sections()
        except ValueError as e:
            raise ValueError(f"{where}: {e}") from None
        for section, keys in sections.items():
            if section not in KNOWN_KEYS:
                raise ValueError(f"{where}: [{section}] isn't a section the console knows")
            if unknown := sorted(set(keys) - KNOWN_KEYS[section]):
                raise ValueError(f"{where}: [{section}] has {', '.join(unknown)}, which the console doesn't know")
        if self.kind == "service":
            if "Timer" in sections:
                raise ValueError(f"{where}: a .service has no [Timer] section")
            program = self.program()
            if not program:
                raise ValueError(f"{where}: [Service] has no ExecStart")
            if not program.startswith("/"):
                raise ValueError(f"{where}: ExecStart must start with an absolute path")
        else:
            timer = sections.get("Timer", {})
            if "Service" in sections:
                raise ValueError(f"{where}: a .timer has no [Service] section")
            if not timer.get("OnCalendar"):
                raise ValueError(f"{where}: [Timer] has no OnCalendar")
            for spec in timer["OnCalendar"]:
                if not valid_calendar(spec):
                    raise ValueError(f"{where}: OnCalendar={spec} isn't a schedule the console reads")
            if self.state == "failed" or self.exits is not None:
                raise ValueError(f"{where}: a timer starts active or inactive, and has no program to exit")
        if self.enabled and not self.wanted_by():
            raise ValueError(f"{where}: enabled needs WantedBy= in [Install]")
        return self

    def activates(self) -> str:
        """The service a timer starts: Unit=, or the one with the timer's name."""
        named = self.sections().get("Timer", {}).get("Unit")
        return named[-1] if named else self.name.removesuffix(".timer") + ".service"
