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


class ModuleFile(_Strict):
    """A module's YAML front matter. The slug and the position in its unit come
    from the filename (`NN-slug.md`), not from here, so they cannot disagree."""

    title: Text
    minutes: Annotated[int, Field(ge=5, le=30)]
    xp: Annotated[int, Field(ge=0, le=500)] = 50
    story: Text  # the mission-log briefing that opens the module (Markdown)
    quiz: Annotated[list[Question], Field(min_length=1, max_length=8)]
    cards: list[Card] = []


# ---------------------------------------------------------------------------
# syllabus.yml
# ---------------------------------------------------------------------------
class MapPosition(_Strict):
    """Where a unit sits on its deck of the station map, as percentages of the
    deck's drawing area (0–100 each way). The range is checked by the loader,
    so the error can name the unit."""

    x: int
    y: int


class UnitSpec(_Strict):
    slug: Slug
    title: Text
    briefing: str = ""  # story text shown at the top of the unit (Markdown)
    prerequisites: list[Slug] = []  # unit slugs that must be finished first
    map: MapPosition | None = None  # unset: laid out automatically (app/station_map.py)


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
