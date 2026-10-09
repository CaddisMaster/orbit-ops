"""Levels and ranks, derived from an XP total. Nothing here is stored.

The curve (docs/roadmap.md §5): getting from level n to level n+1 takes
100 * n^1.5 XP in total, so level 2 is at 100, level 3 at 283, level 4 at 520,
level 10 at 2700. With ~60 XP a module, that is a promotion every module or two
at first and every couple of weeks by the end of the curriculum.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from app.content.schema import RankSpec


def xp_for_level(level: int) -> int:
    """The total XP at which `level` is reached. Level 1 is where everyone starts."""
    return round(100 * (level - 1) ** 1.5)


def level_for(xp: int) -> int:
    level = 1
    while xp >= xp_for_level(level + 1):
        level += 1
    return level


def rank_for(level: int, ranks: Sequence[RankSpec]) -> str | None:
    """The title of the highest rank band `level` has reached. `ranks` is in
    ascending level order (the loader enforces it); None if there are none."""
    title = None
    for rank in ranks:
        if level >= rank.level:
            title = rank.title
    return title


@dataclass(frozen=True)
class Standing:
    xp: int
    level: int
    rank: str | None
    floor: int  # XP at which this level was reached
    ceiling: int  # XP at which the next level is reached

    @property
    def into_level(self) -> int:
        return self.xp - self.floor

    @property
    def level_span(self) -> int:
        return self.ceiling - self.floor

    @property
    def to_next(self) -> int:
        return self.ceiling - self.xp


def standing(xp: int, ranks: Sequence[RankSpec]) -> Standing:
    level = level_for(xp)
    return Standing(
        xp=xp,
        level=level,
        rank=rank_for(level, ranks),
        floor=xp_for_level(level),
        ceiling=xp_for_level(level + 1),
    )
