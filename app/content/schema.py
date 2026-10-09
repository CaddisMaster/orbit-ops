"""The shape of curriculum files, as Pydantic models.

These validate what an author writes. The loader (app/content/loader.py) turns
validated files into the read-only Catalog the app serves from. Every model
forbids unknown keys, so a typo'd field name is an error rather than a field
that silently does nothing.
"""

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


class FsEntry(_Strict):
    path: AbsPath
    type: Literal["file", "dir"] = "file"
    contents: str = ""
    mode: Octal | None = None  # default 644 for a file, 755 for a directory
    owner: Account | None = None  # default: the exercise's user
    group: Account | None = None  # default: the exercise's group

    @model_validator(mode="after")
    def _dirs_have_no_contents(self):
        if self.type == "dir" and self.contents:
            raise ValueError(f"{self.path}: a directory has no contents")
        if self.path == "/":
            raise ValueError("/ always exists; don't list it")
        return self


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
    | RunningCheck | StoppedCheck | SignalledCheck
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


KNOWN_GIDS = {"root": 0, "adm": 4, "sudo": 27, "docker": 998}


def check_path(check: TerminalCheck) -> str:
    match check:
        case ModeCheck(mode=p) | OwnerCheck(owner=p) | ExistsCheck(exists=p) | MissingCheck(missing=p):
            return p
        case ContainsCheck(contains=p) | CwdCheck(cwd=p):
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
            fs[entry.path] = {
                "type": entry.type,
                "mode": int(entry.mode or ("755" if entry.type == "dir" else "644"), 8),
                "owner": entry.owner or self.user,
                "group": entry.group or self.group,
                "contents": entry.contents,
            }
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
            if isinstance(check, RunningCheck | StoppedCheck | SignalledCheck):
                continue
            if not isinstance(check, ExistsCheck | ContainsCheck | CwdCheck) and check_path(check) not in fs:
                raise ValueError(
                    f"checks.{i} ({describe(check)}): {check_path(check)} is not in the starting filesystem"
                )
        return self


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


# ---------------------------------------------------------------------------
# syllabus.yml
# ---------------------------------------------------------------------------
class MapPosition(_Strict):
    """Where a unit sits on its deck of the station map, as percentages of the
    deck's drawing area (0–100 each way). The range is checked by the loader,
    so the error can name the unit."""

    x: int
    y: int


# The inline-SVG unit illustrations in templates/partials/_unit_emblem.html.
UnitEmblem = Literal["scrubber", "script", "branch", "antenna", "reactor"]


class UnitSpec(_Strict):
    slug: Slug
    title: Text
    briefing: str = ""  # story text shown at the top of the unit (Markdown)
    prerequisites: list[Slug] = []  # unit slugs that must be finished first
    map: MapPosition | None = None  # unset: laid out automatically (app/station_map.py)
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


class Syllabus(_Strict):
    tracks: Annotated[list[TrackSpec], Field(min_length=1)]
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
