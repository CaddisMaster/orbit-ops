"""The station map: the syllabus drawn as the Meridian's decks.

layout() is a pure function of (catalog, set of completed module slugs) that
returns everything the SVG needs in drawing coordinates, so the template only
places shapes and the layout is unit-tested without a browser. Node states use
the lock rules in app/progress.py; nothing is stored.

Each track is a deck: a band of the drawing, stacked top to bottom (a phone is
portrait). A unit sits at its `map: {x, y}` from syllabus.yml, as percentages
of its deck's drawing area, or, without one, on an automatic grid, so adding a
unit never breaks the page. Edges run from each prerequisite to the unit that
needs it, across decks where the syllabus does.
"""

import math
import textwrap
from dataclasses import dataclass

from app.content import Catalog
from app.content.loader import MAP_MAX
from app.progress import unit_complete, unit_unlocked

WIDTH = 400
DECK_HEIGHT = 300
DECK_GAP = 24
DECK_HEADER = 44  # room for the deck's name above its drawing area
PAD_X = 48  # keeps a node's label inside the band at x = 0 or 100
PAD_BOTTOM = 64  # room for a three-line label under a node at y = 100
NODE_RADIUS = 18
LABEL_WIDTH = 16  # characters per label line
AUTO_COLUMNS = 3


@dataclass(frozen=True)
class Node:
    slug: str
    title: str
    code: str  # "1.1": track number, unit number
    x: float
    y: float
    state: str  # "complete" | "available" | "locked"
    done: int
    total: int
    waiting_on: tuple[str, ...]  # titles of unfinished prerequisite units
    label: tuple[str, ...]  # the title, wrapped

    @property
    def href(self) -> str:
        return f"/syllabus#unit-{self.slug}"

    @property
    def tooltip(self) -> str:
        parts = [self.title, f"{self.done}/{self.total} modules" if self.total else "coming soon"]
        if self.waiting_on:
            parts.append("waiting on " + ", ".join(self.waiting_on))
        return " · ".join(parts)


@dataclass(frozen=True)
class Edge:
    x1: float
    y1: float
    x2: float
    y2: float
    lit: bool  # the prerequisite is complete
    source: str
    target: str


@dataclass(frozen=True)
class Deck:
    slug: str
    name: str  # the station deck
    track: str  # the track's title
    y: float
    height: float
    nodes: tuple[Node, ...]


@dataclass(frozen=True)
class StationMap:
    width: int
    height: float
    decks: tuple[Deck, ...]
    edges: tuple[Edge, ...]


def _label(title: str) -> tuple[str, ...]:
    """The title as at most three short lines. A subtitle after a colon is left
    to the tooltip and the list ("Networking: DNS, HTTP, TLS & SSH")."""
    lines = textwrap.wrap(title.split(":")[0], LABEL_WIDTH, break_long_words=False)
    if len(lines) > 3:
        lines = lines[:2] + [lines[2] + "…"]
    return tuple(lines)


def auto_position(index: int, count: int) -> tuple[int, int]:
    """A grid position for the `index`th of `count` units with no `map:`."""
    rows = math.ceil(count / AUTO_COLUMNS)
    row, col = divmod(index, AUTO_COLUMNS)
    in_row = min(AUTO_COLUMNS, count - row * AUTO_COLUMNS)
    x = round((col + 0.5) * MAP_MAX / in_row)
    y = round((row + 0.5) * MAP_MAX / rows)
    return x, y


def unit_state(catalog: Catalog, slug: str, completed: set[str]) -> str:
    if unit_complete(catalog, slug, completed):
        return "complete"
    return "available" if unit_unlocked(catalog, slug, completed) else "locked"


def layout(catalog: Catalog, completed: set[str]) -> StationMap:
    inner_w = WIDTH - 2 * PAD_X
    inner_h = DECK_HEIGHT - DECK_HEADER - PAD_BOTTOM
    decks, where = [], {}
    for t_index, track in enumerate(catalog.tracks):
        top = t_index * (DECK_HEIGHT + DECK_GAP)
        unplaced = [s for s in track.units if catalog.units[s].map is None]
        nodes = []
        for u_index, slug in enumerate(track.units):
            unit = catalog.units[slug]
            px, py = unit.map or auto_position(unplaced.index(slug), len(unplaced))
            x = PAD_X + px / MAP_MAX * inner_w
            y = top + DECK_HEADER + py / MAP_MAX * inner_h
            where[slug] = (x, y)
            nodes.append(
                Node(
                    slug=slug,
                    title=unit.title,
                    code=f"{t_index + 1}.{u_index + 1}",
                    x=x,
                    y=y,
                    state=unit_state(catalog, slug, completed),
                    done=sum(1 for m in unit.modules if m in completed),
                    total=len(unit.modules),
                    waiting_on=tuple(
                        catalog.units[p].title
                        for p in unit.prerequisites
                        if not unit_complete(catalog, p, completed)
                    ),
                    label=_label(unit.title),
                )
            )
        decks.append(Deck(track.slug, track.deck, track.title, top, DECK_HEIGHT, tuple(nodes)))

    edges = tuple(
        Edge(*where[p], *where[slug], lit=unit_complete(catalog, p, completed), source=p, target=slug)
        for track in catalog.tracks
        for slug in track.units
        for p in catalog.units[slug].prerequisites
    )
    height = len(decks) * (DECK_HEIGHT + DECK_GAP) - DECK_GAP
    return StationMap(width=WIDTH, height=height, decks=tuple(decks), edges=edges)
