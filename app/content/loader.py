"""Read content/ into a validated, read-only Catalog.

Layout (docs/content-authoring.md):

    content/syllabus.yml                     tracks → units (+ prerequisites)
    content/<track>/<unit>/NN-<slug>.md      one module: YAML front matter + Markdown

Every problem is collected before anything is raised, so one run reports the
whole list rather than the first error. Each message starts with the file it
is about, relative to content/.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import get_args

import yaml
from pydantic import ValidationError

from app.content.render import lesson_sections, render_inline, render_markdown
from app.content.schema import (
    BadgeSpec,
    Beat,
    CastSpec,
    Challenge,
    Comms,
    Lab,
    ModuleFile,
    Question,
    RankSpec,
    Syllabus,
    TerminalExercise,
    UnitCompleteRule,
)

CONTENT_DIR = Path(__file__).resolve().parents[2] / "content"
BEATS: tuple[str, ...] = get_args(Beat)  # open, console_done, lab_done, complete
_MODULE_FILENAME = re.compile(r"^(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$")


class ContentError(Exception):
    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__(f"{len(problems)} content problem(s):\n" + "\n".join(f"  - {p}" for p in problems))


@dataclass(frozen=True)
class FlashCard:
    id: str  # "<module-slug>/<card id>": what review schedules are stored against
    module: str
    front_html: str
    back_html: str
    section_html: str | None = None  # the lesson heading it's about (#104)
    section_anchor: str | None = None  # that heading's id in the module page
    accept: tuple[str, ...] = ()


@dataclass(frozen=True)
class Module:
    slug: str
    title: str
    minutes: int
    xp: int
    story_html: str
    body_html: str
    quiz: tuple[Question, ...]
    cards: tuple[FlashCard, ...]
    terminal: TerminalExercise | None
    terminal_task_html: str
    challenge: Challenge | None
    challenge_task_html: str
    challenge_inputs: dict  # {variable: the console file's contents}, resolved once at startup
    lab: Lab | None
    lab_task_html: str
    lab_prompts_html: tuple[str, ...]  # each box's prompt, rendered
    comms: Comms | None
    comms_html: dict  # {beat: ((cast slug, message html), ...)}, rendered once at startup
    unit: str
    track: str
    position: int  # 1-based, within its unit
    source: str  # path relative to content/, for error messages


@dataclass(frozen=True)
class Unit:
    slug: str
    title: str
    track: str
    briefing_html: str
    prerequisites: tuple[str, ...]
    modules: tuple[str, ...]  # module slugs, in order
    emblem: str | None = None  # a name from templates/partials/_unit_emblem.html


@dataclass(frozen=True)
class Track:
    slug: str
    title: str
    deck: str
    blurb: str
    units: tuple[str, ...]


@dataclass(frozen=True)
class Catalog:
    tracks: tuple[Track, ...]
    units: dict[str, Unit] = field(repr=False)
    modules: dict[str, Module] = field(repr=False)
    ranks: tuple[RankSpec, ...] = ()  # ascending by level
    badges: tuple[BadgeSpec, ...] = ()  # in syllabus order
    cast: dict[str, CastSpec] = field(default_factory=dict)
    drill_cleared: tuple = ()  # ((cast slug, line html), ...): said when the watch drill is cleared (#82)
    # ((cast slug, line html), ...) said when a rank is reached, by title, and when a
    # badge is earned, by slug (#83)
    rank_comms: dict[str, tuple] = field(default_factory=dict)
    badge_comms: dict[str, tuple] = field(default_factory=dict)

    def unit_code(self, unit_slug: str) -> str:
        """"1.1": the track's number, then the unit's within it (as the map shows them)."""
        for t_index, track in enumerate(self.tracks, 1):
            if unit_slug in track.units:
                return f"{t_index}.{track.units.index(unit_slug) + 1}"
        raise KeyError(unit_slug)

    def unit_modules(self, unit_slug: str) -> list[Module]:
        return [self.modules[s] for s in self.units[unit_slug].modules]

    def ordered_modules(self) -> list[Module]:
        """Every module in syllabus order: track, then unit, then position."""
        return [self.modules[m] for t in self.tracks for u in t.units for m in self.units[u].modules]

    def cards(self) -> dict[str, FlashCard]:
        """Every flashcard by id, in syllabus order."""
        return {c.id: c for m in self.ordered_modules() for c in m.cards}


def _badge_comms(badge: BadgeSpec, cast: dict[str, CastSpec]) -> tuple:
    """A badge's lines (#83): its own, or MERIDIAN logging the commendation."""
    if badge.comms:
        return tuple((m.from_, render_inline(m.text)) for m in badge.comms)
    if "meridian" in cast:
        return (("meridian", render_inline(f"COMMENDATION LOGGED · {badge.name.upper()}")),)
    return ()


def _split_front_matter(text: str) -> tuple[str, str] | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    if end == -1:
        return None
    return text[4:end], text[end + 5 :]


def _validation_problems(where: str, exc: ValidationError) -> list[str]:
    problems = []
    for err in exc.errors():
        loc = ".".join(str(part) for part in err["loc"]) or "(top level)"
        problems.append(f"{where}: {loc}: {err['msg']}")
    return problems


def _find_cycle(prereqs: dict[str, tuple[str, ...]]) -> list[str] | None:
    """A prerequisite cycle as a path (first == last), or None."""
    state: dict[str, int] = {}  # 1 = on the current path, 2 = finished
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        state[node] = 1
        stack.append(node)
        for nxt in prereqs.get(node, ()):
            if state.get(nxt) == 1:
                return stack[stack.index(nxt) :] + [nxt]
            if state.get(nxt) is None and nxt in prereqs and (found := visit(nxt)):
                return found
        stack.pop()
        state[node] = 2
        return None

    for node in prereqs:
        if state.get(node) is None and (found := visit(node)):
            return found
    return None


def load_catalog(root: Path = CONTENT_DIR) -> Catalog:
    problems: list[str] = []

    syllabus_path = root / "syllabus.yml"
    try:
        syllabus = Syllabus.model_validate(yaml.safe_load(syllabus_path.read_text()))
    except FileNotFoundError:
        raise ContentError([f"syllabus.yml: not found in {root}"]) from None
    except yaml.YAMLError as exc:
        raise ContentError([f"syllabus.yml: not valid YAML: {exc}"]) from None
    except ValidationError as exc:
        raise ContentError(_validation_problems("syllabus.yml", exc)) from None

    # --- the syllabus itself: unique slugs, real prerequisites, no cycles ----
    unit_track: dict[str, str] = {}
    seen_tracks: set[str] = set()
    for track in syllabus.tracks:
        if track.slug in seen_tracks:
            problems.append(f"syllabus.yml: track '{track.slug}' is defined twice")
        seen_tracks.add(track.slug)
        for unit in track.units:
            if unit.slug in unit_track:
                problems.append(f"syllabus.yml: unit '{unit.slug}' is defined twice")
            unit_track[unit.slug] = track.slug

    prereqs = {u.slug: tuple(u.prerequisites) for t in syllabus.tracks for u in t.units}
    for unit, needs in prereqs.items():
        for need in needs:
            if need not in unit_track:
                problems.append(f"syllabus.yml: unit '{unit}' requires '{need}', which is not a unit")
            elif need == unit:
                problems.append(f"syllabus.yml: unit '{unit}' requires itself")
    if cycle := _find_cycle({u: tuple(n for n in needs if n != u) for u, needs in prereqs.items()}):
        problems.append(f"syllabus.yml: prerequisite cycle: {' → '.join(cycle)}")

    seen_badges: set[str] = set()
    for badge in syllabus.badges:
        if badge.slug in seen_badges:
            problems.append(f"syllabus.yml: badge '{badge.slug}' is defined twice")
        seen_badges.add(badge.slug)
        if isinstance(badge.rule, UnitCompleteRule) and badge.rule.unit_complete not in unit_track:
            problems.append(
                f"syllabus.yml: badge '{badge.slug}' requires unit '{badge.rule.unit_complete}', which is not a unit"
            )

    # --- module files ---------------------------------------------------------
    modules: dict[str, Module] = {}
    unit_module_slugs: dict[str, list[str]] = {slug: [] for slug in unit_track}

    for path in sorted(root.rglob("*.md")):
        rel = path.relative_to(root).as_posix()
        parts = path.relative_to(root).parts
        if len(parts) != 3:
            problems.append(f"{rel}: modules must live at <track>/<unit>/NN-slug.md")
            continue
        track_slug, unit_slug, filename = parts
        if unit_track.get(unit_slug) != track_slug:
            problems.append(f"{rel}: '{track_slug}/{unit_slug}' is not a unit in syllabus.yml")
            continue
        match = _MODULE_FILENAME.match(filename)
        if not match:
            problems.append(f"{rel}: filename must be NN-slug.md (two digits, lowercase-hyphenated slug)")
            continue
        slug = match.group(2)

        split = _split_front_matter(path.read_text())
        if split is None:
            problems.append(f"{rel}: must start with a '---' YAML front matter block closed by '---'")
            continue
        front, body = split
        try:
            data = ModuleFile.model_validate(yaml.safe_load(front))
        except yaml.YAMLError as exc:
            problems.append(f"{rel}: front matter is not valid YAML: {exc}")
            continue
        except ValidationError as exc:
            problems.extend(_validation_problems(rel, exc))
            continue
        if not body.strip():
            problems.append(f"{rel}: the lesson body (after the front matter) is empty")
            continue
        if slug in modules:
            problems.append(f"{rel}: module slug '{slug}' is already used by {modules[slug].source}")
            continue

        sections = lesson_sections(body)
        for card in data.cards:
            if card.section and card.section not in sections:
                problems.append(
                    f"{rel}: card '{card.id}': section '{card.section}' is not a ## or ### heading in the lesson"
                )

        unit_module_slugs[unit_slug].append(slug)
        modules[slug] = Module(
            slug=slug,
            title=data.title,
            minutes=data.minutes,
            xp=data.xp,
            story_html=render_markdown(data.story),
            body_html=render_markdown(body, anchors=True),
            quiz=tuple(data.quiz),
            cards=tuple(
                FlashCard(
                    f"{slug}/{c.id}", slug, render_inline(c.front), render_inline(c.back),
                    section_html=render_inline(c.section) if c.section else None,
                    section_anchor=sections.get(c.section) if c.section else None,
                    accept=tuple(c.accept),
                )
                for c in data.cards
            ),
            terminal=data.terminal,
            terminal_task_html=render_markdown(data.terminal.task) if data.terminal else "",
            challenge=data.challenge,
            challenge_task_html=render_markdown(data.challenge.task) if data.challenge else "",
            challenge_inputs={
                name: next(f.contents for f in data.terminal.files if f.path == path)
                for name, path in data.challenge.inputs.items()
            }
            if data.challenge and data.terminal
            else {},
            lab=data.lab,
            lab_task_html=render_markdown(data.lab.task) if data.lab else "",
            lab_prompts_html=tuple(render_markdown(b.prompt) for b in data.lab.boxes) if data.lab else (),
            comms=data.comms,
            comms_html={
                beat: tuple((m.from_, render_inline(m.text)) for m in getattr(data.comms, beat))
                for beat in BEATS
            }
            if data.comms
            else {},
            unit=unit_slug,
            track=track_slug,
            position=len(unit_module_slugs[unit_slug]),
            source=rel,
        )

    cast = {c.slug: c for c in syllabus.cast}
    if len(cast) != len(syllabus.cast):
        problems.append("syllabus.yml: cast: a slug is used twice")
    for module in modules.values():
        if module.challenge and module.challenge.from_ and module.challenge.from_ not in cast:
            problems.append(f"{module.source}: challenge.from: '{module.challenge.from_}' is not in the cast")
        if module.lab and module.lab.from_ and module.lab.from_ not in cast:
            problems.append(f"{module.source}: lab.from: '{module.lab.from_}' is not in the cast")
    for rank in syllabus.ranks:
        for i, message in enumerate(rank.comms):
            if message.from_ not in cast:
                problems.append(f"syllabus.yml: rank '{rank.title}': comms.{i}.from: '{message.from_}' is not in the cast")
    for badge in syllabus.badges:
        for i, message in enumerate(badge.comms):
            if message.from_ not in cast:
                problems.append(f"syllabus.yml: badge '{badge.slug}': comms.{i}.from: '{message.from_}' is not in the cast")
    for i, message in enumerate(syllabus.drill.cleared if syllabus.drill else ()):
        if message.from_ not in cast:
            problems.append(f"syllabus.yml: drill.cleared.{i}.from: '{message.from_}' is not in the cast")
    for module in modules.values():
        if not module.comms:
            continue
        for beat in BEATS:
            for i, message in enumerate(getattr(module.comms, beat)):
                if message.from_ not in cast:
                    problems.append(f"{module.source}: comms.{beat}.{i}.from: '{message.from_}' is not in the cast")
        if (module.comms.console_done or "console_done" in module.comms.window) and not module.terminal:
            problems.append(f"{module.source}: comms.console_done: the module has no terminal exercise")
        if (module.comms.lab_done or "lab_done" in module.comms.window) and not module.lab:
            problems.append(f"{module.source}: comms.lab_done: the module has no lab")

    if problems:
        raise ContentError(problems)

    units = {
        u.slug: Unit(
            slug=u.slug,
            title=u.title,
            track=t.slug,
            briefing_html=render_markdown(u.briefing) if u.briefing else "",
            prerequisites=tuple(u.prerequisites),
            modules=tuple(unit_module_slugs[u.slug]),
            emblem=u.emblem,
        )
        for t in syllabus.tracks
        for u in t.units
    }
    tracks = tuple(
        Track(slug=t.slug, title=t.title, deck=t.deck, blurb=t.blurb, units=tuple(u.slug for u in t.units))
        for t in syllabus.tracks
    )
    return Catalog(
        tracks=tracks, units=units, modules=modules, ranks=tuple(syllabus.ranks), badges=tuple(syllabus.badges),
        cast=cast,
        drill_cleared=tuple((m.from_, render_inline(m.text)) for m in syllabus.drill.cleared) if syllabus.drill else (),
        rank_comms={r.title: tuple((m.from_, render_inline(m.text)) for m in r.comms) for r in syllabus.ranks},
        badge_comms={b.slug: _badge_comms(b, cast) for b in syllabus.badges},
    )
