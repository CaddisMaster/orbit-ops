"""syllabus.yml: tracks, units, ranks, badges, and the cast and drill it names."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from .base import Slug, Text, _Strict
from .comms import CastSpec, Drill, Message

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
    comms: list[Message] = []  # said on the comms log when the rank is reached (#83)


# A badge's rule names one of the fixed evaluators in app/game/badges.py, as a
# one-key mapping. Content picks the rule and its argument; it cannot run code.
class UnitCompleteRule(_Strict):
    unit_complete: Slug  # every module in this unit is complete


class StreakRule(_Strict):
    streak: Annotated[int, Field(ge=2)]  # the daily streak reaches this many days


class FirstPerfectQuizRule(_Strict):
    first_perfect_quiz: Literal[True]  # any module completed with a 100% quiz


class LabsCompletedRule(_Strict):
    labs_completed: Annotated[int, Field(ge=1)]  # this many modules' labs passed (#121)


BadgeRule = UnitCompleteRule | StreakRule | FirstPerfectQuizRule | LabsCompletedRule

# The inline-SVG emblems in templates/partials/_emblem.html.
Emblem = Literal["life-support", "fabrication", "fleet", "shields", "flame", "star"]


class BadgeSpec(_Strict):
    slug: Slug  # the permanent ID: badges_earned stores it, so never rename one
    name: Text
    description: Text  # shown even while locked, so there is something to aim at
    emblem: Emblem
    rule: BadgeRule
    # Said on the comms log when it's earned (#83). Without one, MERIDIAN logs
    # "COMMENDATION LOGGED · <NAME>" (app/content/loader.py).
    comms: list[Message] = []


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
