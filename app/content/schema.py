"""The shape of curriculum files, as Pydantic models.

These validate what an author writes. The loader (app/content/loader.py) turns
validated files into the read-only Catalog the app serves from. Every model
forbids unknown keys, so a typo'd field name is an error rather than a field
that silently does nothing.
"""

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Slug = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=64)]
Text = Annotated[str, Field(min_length=1)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# ---------------------------------------------------------------------------
# Quiz questions — one class per type, selected by `type:`.
# ---------------------------------------------------------------------------
class _Question(_Strict):
    q: Text
    code: Text | None = None  # a script or output to read, shown as a block under `q` (#68)
    lang: Annotated[str, Field(pattern=r"^[a-z0-9+-]+$")] = "text"  # how `code` is highlighted
    explain: Text  # shown after answering, right or wrong


class _OptionsQuestion(_Question):
    options: Annotated[list[Text], Field(min_length=2, max_length=6)]

    @model_validator(mode="after")
    def _distinct_options(self):
        if len(set(self.options)) != len(self.options):
            raise ValueError("options must be distinct")
        return self


class ChoiceQuestion(_OptionsQuestion):
    """Exactly one correct option; `answer` is its 0-based index."""

    type: Literal["choice"]
    answer: int

    @model_validator(mode="after")
    def _answer_in_range(self):
        if not 0 <= self.answer < len(self.options):
            raise ValueError(f"answer {self.answer} is not an index into the {len(self.options)} options")
        return self


class MultiQuestion(_OptionsQuestion):
    """Several correct options; `answer` lists their 0-based indexes."""

    type: Literal["multi"]
    answer: Annotated[list[int], Field(min_length=1)]

    @model_validator(mode="after")
    def _answers_in_range(self):
        if len(set(self.answer)) != len(self.answer):
            raise ValueError("answer lists an option twice")
        bad = [i for i in self.answer if not 0 <= i < len(self.options)]
        if bad:
            raise ValueError(f"answer {bad} is not an index into the {len(self.options)} options")
        return self


class FillQuestion(_Question):
    """Free text; `answer` lists every accepted spelling (compared trimmed and
    case-insensitively)."""

    type: Literal["fill"]
    answer: Annotated[list[Text], Field(min_length=1)]


Question = Annotated[ChoiceQuestion | MultiQuestion | FillQuestion, Field(discriminator="type")]


class Card(_Strict):
    """A flashcard (#51). Its id is permanent: review schedules are stored
    against "<module-slug>/<id>", so rewording a card keeps its schedule and
    renaming the id starts it over."""

    id: Slug
    front: Text
    back: Text


# ---------------------------------------------------------------------------
# Terminal exercises (#17): a starting filesystem for the station console, a
# task, and checks against the filesystem the learner leaves behind. The
# console (static/js/console.js) is a simulated shell over this filesystem;
# the server re-runs the checks (app/terminal.py) on the state it is sent.
# ---------------------------------------------------------------------------
AbsPath = Annotated[str, Field(pattern=r"^/([A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*)?$", max_length=200)]
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
LinkTarget = Annotated[str, Field(min_length=1, max_length=200, pattern=r"^[A-Za-z0-9._/-]+$")]


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


class ContainsCheck(_Strict):
    contains: AbsPath
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


TerminalCheck = (
    ModeCheck | OwnerCheck | ExistsCheck | MissingCheck | ContainsCheck | CwdCheck
    | RunningCheck | StoppedCheck | SignalledCheck | SymlinkCheck | FilesUnderCheck
)


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


KNOWN_GIDS = {"root": 0, "adm": 4, "sudo": 27, "docker": 998}


def check_path(check: TerminalCheck) -> str:
    match check:
        case ModeCheck(mode=p) | OwnerCheck(owner=p) | ExistsCheck(exists=p) | MissingCheck(missing=p):
            return p
        case ContainsCheck(contains=p) | CwdCheck(cwd=p) | SymlinkCheck(symlink=p) | FilesUnderCheck(files_under=p):
            return p
        case RunningCheck(running=p) | StoppedCheck(stopped=p) | SignalledCheck(signalled=p):
            return p
    raise TypeError(check)


def describe(check: TerminalCheck) -> str:
    """A check as an author wrote it, for error messages: "mode /station/x"."""
    return f"{next(iter(type(check).model_fields))} {check_path(check)}"


class TerminalExercise(_Strict):
    task: Text  # what Okafor asks for (Markdown)
    user: Account = "cadet"
    group: Account = "crew"
    groups: list[Account] = []  # the user's supplementary groups, e.g. [sudo]
    # The user's password, for sudo's prompt. It's in-story and shown in the
    # task, not a secret: the console needs it to check what's typed.
    password: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    accounts: list[AccountSpec] = []
    processes: Annotated[list[ProcessSpec], Field(max_length=20)] = []
    env: dict[Annotated[str, Field(pattern=r"^[A-Z_][A-Z0-9_]*$")], str] = {}  # extra exported variables, e.g. PATH
    cwd: AbsPath = "/station"
    disk: DiskSpec | None = None
    memory: MemorySpec | None = None
    files: Annotated[list[FsEntry], Field(min_length=1, max_length=100)]
    checks: Annotated[list[TerminalCheck], Field(min_length=1, max_length=10)]
    success: Text = "Okafor's voice crackles over the comm: \"Confirmed. Nice work, cadet.\""
    # Commands that complete the task, run through the real shell in CI
    # (tests/js/). Never sent to the browser, like quiz answers.
    solution: Annotated[list[Annotated[str, Field(min_length=1)]], Field(min_length=1, max_length=40)]

    def starting_fs(self) -> dict[str, dict]:
        """{path: node} for the whole starting tree. Parent directories that
        aren't listed exist anyway, owned by root, mode 755, as on a real system."""
        fs = {"/": {"type": "dir", "mode": 0o755, "owner": "root", "group": "root", "contents": ""}}
        listed = {e.path for e in self.files}
        for path, contents in (("/etc/passwd", self.passwd()), ("/etc/group", self.group_file())):
            if path not in listed:
                fs.setdefault("/etc", {"type": "dir", "mode": 0o755, "owner": "root", "group": "root", "contents": ""})
                fs[path] = {"type": "file", "mode": 0o644, "owner": "root", "group": "root", "contents": contents}
        if "/root" not in listed:
            fs["/root"] = {"type": "dir", "mode": 0o700, "owner": "root", "group": "root", "contents": ""}
        for entry in self.files:
            parent = _parent(entry.path)
            while parent not in fs:
                fs[parent] = {"type": "dir", "mode": 0o755, "owner": "root", "group": "root", "contents": ""}
                parent = _parent(parent)
            mode = "777" if entry.type == "link" else entry.mode or ("755" if entry.type == "dir" else "644")
            node = {
                "type": entry.type,
                "mode": int(mode, 8),
                "owner": entry.owner or self.user,
                "group": entry.group or self.group,
                "contents": entry.contents,
            }
            # Only when set, so exercises without them keep their exact shape.
            if entry.target is not None:
                node["target"] = entry.target
            if entry.size is not None:
                node["size"] = size_bytes(entry.size)
            if entry.mtime:
                node["mtime"] = entry.modified().isoformat()
            fs[entry.path] = node
        return dict(sorted(fs.items()))

    def gids(self) -> dict[str, int]:
        """Every group the exercise mentions, with its GID."""
        gids = {"root": 0, self.group: 1000}
        for a in self.accounts:
            gids.setdefault(a.group or a.name, a.uid)
        named = set(self.groups) | {g for a in self.accounts for g in a.groups}
        spare = 1001
        for g in sorted(named):
            if g in KNOWN_GIDS:
                gids.setdefault(g, KNOWN_GIDS[g])
            elif g not in gids:
                gids[g] = spare
                spare += 1
        gids.setdefault("sudo", 27)
        return gids

    def passwd(self) -> str:
        rows = [("root", 0, 0, "root", "/root", "/bin/bash")]
        gids = self.gids()
        for a in sorted(self.accounts, key=lambda a: a.uid):
            rows.append((a.name, a.uid, gids[a.group or a.name], a.comment, a.home or f"/var/lib/{a.name}", a.shell))
        rows.append((self.user, 1000, 1000, self.user.capitalize(), f"/home/{self.user}", "/bin/bash"))
        return "".join(f"{n}:x:{u}:{g}:{c}:{h}:{sh}\n" for n, u, g, c, h, sh in rows)

    def group_file(self) -> str:
        members: dict[str, list[str]] = {}
        for g in self.groups:
            members.setdefault(g, []).append(self.user)
        for a in self.accounts:
            for g in a.groups:
                members.setdefault(g, []).append(a.name)
        return "".join(
            f"{g}:x:{gid}:{','.join(members.get(g, []))}\n" for g, gid in sorted(self.gids().items(), key=lambda kv: kv[1])
        )

    @model_validator(mode="after")
    def _consistent(self):
        paths = [e.path for e in self.files]
        if dupes := sorted({p for p in paths if paths.count(p) > 1}):
            raise ValueError(f"files: {', '.join(dupes)} listed twice")
        fs = self.starting_fs()
        for entry in self.files:
            if fs[_parent(entry.path)]["type"] != "dir":
                raise ValueError(f"files: {entry.path} is inside {_parent(entry.path)}, which is a file")
        if fs.get(self.cwd, {}).get("type") != "dir":
            raise ValueError(f"cwd: {self.cwd} is not a directory in the starting filesystem")
        users = {"root", self.user} | {a.name for a in self.accounts}
        for p in self.processes:
            if p.user and p.user not in users:
                raise ValueError(f"processes: {p.command!r} runs as {p.user}, which is not an account")
        started = {proc_name(p.command) for p in self.processes}
        for i, check in enumerate(self.checks):
            if isinstance(check, StoppedCheck | SignalledCheck) and check_path(check) not in started:
                raise ValueError(f"checks.{i} ({describe(check)}): no starting process is called {check_path(check)}")
        for i, check in enumerate(self.checks):
            # A mode, owner or missing check reads something that must already be
            # there; exists and contains may name what the learner creates.
            if isinstance(check, CwdCheck) and fs.get(check.cwd, {}).get("type") != "dir":
                raise ValueError(f"checks.{i} ({describe(check)}): {check.cwd} is not a directory in the starting filesystem")
            if isinstance(check, FilesUnderCheck) and fs.get(check.files_under, {}).get("type") != "dir":
                raise ValueError(f"checks.{i} ({describe(check)}): {check.files_under} is not a directory in the starting filesystem")
            if isinstance(check, RunningCheck | StoppedCheck | SignalledCheck):
                continue
            if not isinstance(check, ExistsCheck | ContainsCheck | CwdCheck | SymlinkCheck | FilesUnderCheck) and check_path(check) not in fs:
                raise ValueError(
                    f"checks.{i} ({describe(check)}): {check_path(check)} is not in the starting filesystem"
                )
        return self


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


class ModuleFile(_Strict):
    """A module's YAML front matter. The slug and the position in its unit come
    from the filename (`NN-slug.md`), not from here, so they cannot disagree."""

    title: Text
    minutes: Annotated[int, Field(ge=5, le=30)]
    xp: Annotated[int, Field(ge=0, le=500)] = 50
    story: Text  # the mission-log briefing that opens the module (Markdown)
    quiz: Annotated[list[Question], Field(min_length=1, max_length=8)]
    cards: list[Card] = []
    terminal: TerminalExercise | None = None  # a station-console task (#17)
    comms: Comms | None = None  # messages in the comms log (#38)
    challenge: Challenge | None = None  # a bonus Python challenge (#54)

    @model_validator(mode="after")
    def _challenge_inputs_are_console_files(self) -> ModuleFile:
        if self.challenge and self.challenge.inputs:
            files = {f.path for f in self.terminal.files if f.type == "file"} if self.terminal else set()
            for name, path in self.challenge.inputs.items():
                if path not in files:
                    raise ValueError(f"challenge.inputs.{name}: {path} is not a file in this module's console")
        return self

    @model_validator(mode="after")
    def _card_ids_unique(self) -> ModuleFile:
        seen: set[str] = set()
        for i, card in enumerate(self.cards):
            if card.id in seen:
                raise ValueError(f"cards.{i}.id: '{card.id}' is used by another card in this module")
            seen.add(card.id)
        return self


# ---------------------------------------------------------------------------
# syllabus.yml
# ---------------------------------------------------------------------------
# The inline-SVG unit illustrations in templates/partials/_unit_emblem.html.
UnitEmblem = Literal["scrubber", "script", "branch", "antenna", "reactor"]


class UnitSpec(_Strict):
    slug: Slug
    title: Text
    briefing: str = ""  # story text shown at the top of the unit (Markdown)
    prerequisites: list[Slug] = []  # unit slugs that must be finished first
    emblem: UnitEmblem | None = None  # line-art illustration on the syllabus and its modules


class TrackSpec(_Strict):
    slug: Slug
    title: Text
    deck: Text  # the station deck this track brings back online
    blurb: str = ""
    units: Annotated[list[UnitSpec], Field(min_length=1)]


class RankSpec(_Strict):
    title: Text
    level: Annotated[int, Field(ge=1)]  # the level at which this rank is reached


# A badge's rule names one of the fixed evaluators in app/game/badges.py, as a
# one-key mapping. Content picks the rule and its argument; it cannot run code.
class UnitCompleteRule(_Strict):
    unit_complete: Slug  # every module in this unit is complete


class StreakRule(_Strict):
    streak: Annotated[int, Field(ge=2)]  # the daily streak reaches this many days


class FirstPerfectQuizRule(_Strict):
    first_perfect_quiz: Literal[True]  # any module completed with a 100% quiz


BadgeRule = UnitCompleteRule | StreakRule | FirstPerfectQuizRule

# The inline-SVG emblems in templates/partials/_emblem.html.
Emblem = Literal["life-support", "fabrication", "fleet", "shields", "flame", "star"]


class BadgeSpec(_Strict):
    slug: Slug  # the permanent ID: badges_earned stores it, so never rename one
    name: Text
    description: Text  # shown even while locked, so there is something to aim at
    emblem: Emblem
    rule: BadgeRule


# ---------------------------------------------------------------------------
# The comms log (#38): the cast, and the messages a module sends at its beats.
# ---------------------------------------------------------------------------
Avatar = Literal["okafor", "meridian", "mission"]  # the sprites in art/sprites.py
WindowEvent = Literal["shuttle-dock", "relay-pass", "debris-drift", "aurora"]  # app/comms.py WINDOW_SPRITES


class CastSpec(_Strict):
    slug: Slug
    name: Text
    role: Text
    avatar: Avatar
    delay: Annotated[str, Field(pattern=r"^\d+(\.\d+)? s$")] | None = None  # light-delay, e.g. "1.3 s"


class Message(_Strict):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    from_: Slug = Field(alias="from")  # a cast slug
    text: Text  # inline Markdown


Beat = Literal["open", "console_done", "complete"]


class Comms(_Strict):
    """What a module's messages are and when they arrive: `open` when the
    module is first opened (the briefing), `console_done` when its console task
    passes, `complete` when it's completed (the debrief)."""

    open: list[Message] = []
    console_done: list[Message] = []
    complete: list[Message] = []
    window: dict[Beat, WindowEvent] = {}  # a window event that plays at a beat


class Drill(_Strict):
    """Flashcard review as MERIDIAN's watch drill (#82): the lines the crew may
    say when the day's drill is cleared. One is picked by the date, so they
    rotate rather than repeat."""

    cleared: Annotated[list[Message], Field(min_length=1)]


class Syllabus(_Strict):
    tracks: Annotated[list[TrackSpec], Field(min_length=1)]
    cast: list[CastSpec] = []  # who can send messages
    drill: Drill | None = None  # the review queue's lines (#82)
    ranks: list[RankSpec] = []  # rank titles by level band, lowest first
    badges: list[BadgeSpec] = []  # in the order the badges page shows them

    @model_validator(mode="after")
    def _ranks_ascend_from_level_1(self):
        if self.ranks and self.ranks[0].level != 1:
            raise ValueError(f"ranks: the first rank must start at level 1, not {self.ranks[0].level}")
        levels = [r.level for r in self.ranks]
        if any(b <= a for a, b in zip(levels, levels[1:], strict=False)):
            raise ValueError(f"ranks: levels must strictly ascend, got {levels}")
        return self
