"""The station map: the syllabus drawn as the Meridian, side on (#78).

layout() is a pure function of (catalog, set of completed module slugs) that
returns everything the SVG over the ship's art needs, in the art's pixel
coordinates, so the template only places shapes and the layout is unit-tested
without a browser. Node states use the lock rules in app/progress.py; nothing
is stored.

Each track's deck is a section of the ship (art/ship.py), and its units fill
that section's compartments (art.ship.SLOTS) in syllabus order. A conduit runs
from each prerequisite's compartment to the unit that needs it, across
sections where the syllabus does; the map shows a compartment's conduits when
it's hovered or focused.
"""

import textwrap
from dataclasses import dataclass

from app.content import Catalog
from app.progress import unit_complete, unit_unlocked
from art import ship

LABEL_WIDTH = 16  # characters per line of a unit's name in the list and tooltip


@dataclass(frozen=True)
class Conduit:
    path: str  # SVG path data, from the prerequisite's compartment to this one
    lit: bool  # the prerequisite is complete
    source: str


@dataclass(frozen=True)
class Node:
    slug: str
    title: str
    code: str  # "1.1": track number, unit number
    x: int  # the compartment's top-left corner, in art pixels
    y: int
    state: str  # "complete" | "available" | "locked"
    done: int
    total: int
    waiting_on: tuple[str, ...]  # titles of unfinished prerequisite units
    conduits: tuple[Conduit, ...]

    @property
    def href(self) -> str:
        return f"/syllabus#unit-{self.slug}"

    @property
    def soon(self) -> bool:
        """No modules yet: the compartment is shuttered."""
        return self.total == 0

    @property
    def tooltip(self) -> str:
        parts = [f"{self.code} {self.title}", f"{self.done}/{self.total} modules" if self.total else "coming soon"]
        if self.waiting_on:
            parts.append("waiting on " + ", ".join(self.waiting_on))
        return " · ".join(parts)


@dataclass(frozen=True)
class Deck:
    slug: str
    name: str  # the station deck
    track: str  # the track's title
    label: tuple[int, int, str]  # x, y, text-anchor
    complete: int  # units complete
    nodes: tuple[Node, ...]


@dataclass(frozen=True)
class StationMap:
    width: int
    height: int
    slot_w: int
    slot_h: int
    decks: tuple[Deck, ...]


def unit_state(catalog: Catalog, slug: str, completed: set[str]) -> str:
    if unit_complete(catalog, slug, completed):
        return "complete"
    return "available" if unit_unlocked(catalog, slug, completed) else "locked"


def wrap(title: str) -> tuple[str, ...]:
    """A unit's name in short lines, without a subtitle after a colon."""
    return tuple(textwrap.wrap(title.split(":")[0], LABEL_WIDTH, break_long_words=False))


SPINE_Y = (ship.SPINE[1] + ship.SPINE[3]) / 2


def _port(corner: tuple[int, int]) -> tuple[float, float]:
    """Where a conduit meets a compartment: the middle of the edge facing the
    spine, so it never crosses the compartment's code."""
    x, y = corner
    return x + ship.SLOT_W / 2, (y + ship.SLOT_H if y + ship.SLOT_H / 2 < SPINE_Y else y)


def _conduit(source: tuple[int, int], target: tuple[int, int]) -> str:
    """From the source to the spine's height, along it, then up or down into
    the target: conduits run along the ship, not through space."""
    (x1, y1), (x2, y2) = _port(source), _port(target)
    return f"M{x1:g} {y1:g}V{SPINE_Y:g}H{x2:g}V{y2:g}"


def slots_for(catalog: Catalog) -> dict[str, tuple[int, int]]:
    """Each unit's compartment. A track with more units than its section has
    compartments raises: the art needs another slot (tests check the real syllabus)."""
    where = {}
    for track in catalog.tracks:
        slots = ship.SLOTS.get(track.slug, [])
        if len(track.units) > len(slots):
            raise ValueError(f"track '{track.slug}' has {len(track.units)} units but its section has {len(slots)} compartments")
        where.update(zip(track.units, slots, strict=False))
    return where


def layout(catalog: Catalog, completed: set[str]) -> StationMap:
    where = slots_for(catalog)
    decks = []
    for t_index, track in enumerate(catalog.tracks):
        nodes = []
        for u_index, slug in enumerate(track.units):
            unit = catalog.units[slug]
            nodes.append(
                Node(
                    slug=slug,
                    title=unit.title,
                    code=f"{t_index + 1}.{u_index + 1}",
                    x=where[slug][0],
                    y=where[slug][1],
                    state=unit_state(catalog, slug, completed),
                    done=sum(1 for m in unit.modules if m in completed),
                    total=len(unit.modules),
                    waiting_on=tuple(
                        catalog.units[p].title for p in unit.prerequisites if not unit_complete(catalog, p, completed)
                    ),
                    conduits=tuple(
                        Conduit(_conduit(where[p], where[slug]), unit_complete(catalog, p, completed), p)
                        for p in unit.prerequisites
                    ),
                )
            )
        decks.append(
            Deck(
                slug=track.slug,
                name=track.deck,
                track=track.title,
                label=ship.LABELS[track.slug],
                complete=sum(1 for n in nodes if n.state == "complete"),
                nodes=tuple(nodes),
            )
        )
    return StationMap(ship.W, ship.H, ship.SLOT_W, ship.SLOT_H, tuple(decks))
