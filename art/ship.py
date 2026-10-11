"""The Meridian, side on, for the station map (#78): bow to the right, one
section per track's deck, and a compartment for each unit.

320x150. The compartments are drawn here as dark recesses; the map's SVG lays
a shape over each one and lights it by the learner's progress
(app/station_map.py), so SLOTS below is the contract between the two. Each
deck's units fill its slots in syllabus order. LABELS places each deck's name.
"""

from art.canvas import Canvas

W, H = 320, 150
SLOT_W, SLOT_H = 16, 10

# Each deck's compartments, top-left corners, in the order its units fill them.
SLOTS = {
    # Life Support: the ring's upper pod first (the first unit), then the hull's four windows
    "core": [(152, 9), (126, 58), (176, 58), (126, 80), (176, 80)],
    # Cargo & Fabrication: the container bay, two rows
    "containers": [(44, 58), (64, 58), (84, 58), (54, 80), (74, 80)],
    # Fleet Command: the bow, its bridge last at the tip
    "kubernetes": [(258, 58), (258, 81), (278, 63), (278, 77), (296, 70)],
    # Comms, Sensors & Shields: the sensor module on the spine, then the shield pod below it
    "delivery": [(207, 44), (228, 44), (207, 58), (228, 58), (218, 84)],
}
# Where each deck's name goes: (x, y, text-anchor), in the same coordinates.
LABELS = {
    "core": (146, 13, "end"),
    "containers": (80, 121, "middle"),
    "kubernetes": (284, 44, "middle"),
    "delivery": (226, 111, "middle"),
}

SPINE = (30, 71, 254, 78)
CARGO = (38, 50, 116, 100)
CORE = (120, 52, 198, 98)
SENSORS = (202, 40, 250, 72)
SHIELD = (212, 80, 240, 98)
BOW = (254, 314)  # x span; the hull tapers from y 50..100 to the tip
RING = (160, 75, 12, 64)  # cx, cy, rx, ry: the habitat ring, almost edge on
POD_TOPS, POD_H = (RING[1] - RING[3] - 4, RING[1] + RING[3] - 10), 13  # its two pods, top and bottom


def render() -> Canvas:
    c = Canvas(W, H, "void", seed=78)
    space(c)
    spine(c)
    engines(c)
    ring(c, front=False)
    cargo(c)
    core(c)
    ring(c, front=True)
    sensors(c)
    bow(c)
    for slots in SLOTS.values():
        for x, y in slots:
            slot(c, x, y)
    return c


def space(c: Canvas) -> None:
    for _ in range(120):
        c.px(c.random.randrange(W), c.random.randrange(H), c.random.choice(["star", "star2", "star3", "star3", "star3"]))
    # the Earth's limb, low on the left, below the ship
    cx, cy, r = 30, 260, 128
    c.disc(cx, cy, r + 1.5, lambda x, y, d: "glow" if d > r else None)
    c.disc(cx, cy, r, lambda x, y, d: "glow" if d > r - 1.5 else ("earth2" if (x + y) % 7 else "earth1"))


def hull(c: Canvas, x0: int, y0: int, x1: int, y1: int, fill: str = "case") -> None:
    """A bevelled box, lit from the top left, with a dark outline."""
    c.rect(x0, y0, x1, y1, "caseedge")
    c.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill)
    c.hline(x0 + 1, x1 - 1, y0 + 1, "casehi")
    c.vline(x0 + 1, y0 + 1, y1 - 1, "case3")
    c.hline(x0 + 1, x1 - 1, y1 - 1, "caselo")
    c.vline(x1 - 1, y0 + 1, y1 - 1, "caselo")


def panel_lines(c: Canvas, x0: int, y0: int, x1: int, y1: int, step: int) -> None:
    for x in range(x0 + step, x1, step):
        c.vline(x, y0 + 2, y1 - 2, "case2")


def spine(c: Canvas) -> None:
    x0, y0, x1, y1 = SPINE
    c.rect(x0, y0, x1, y1, "caseedge")
    c.rect(x0, y0 + 1, x1, y1 - 1, "truss")
    for x in range(x0, x1, 6):
        c.vline(x, y0 + 1, y1 - 1, "truss2")
        c.px(x + 3, y0 + 2, "truss2")
        c.px(x + 3, y1 - 2, "truss2")


def engines(c: Canvas) -> None:
    hull(c, 18, 56, 38, 94, "case2")
    for yc in (64, 86):  # two nozzles, flaring aft
        for i, x in enumerate(range(17, 5, -1)):
            half = 4 + i // 3
            c.vline(x, yc - half, yc + half, "caselo" if i % 4 else "metal")
            c.px(x, yc - half, "caseedge")
            c.px(x, yc + half, "caseedge")
        c.vline(5, yc - 7, yc + 7, "lip")


def cargo(c: Canvas) -> None:
    x0, y0, x1, y1 = CARGO
    hull(c, x0, y0, x1, y1)
    panel_lines(c, x0, y0, x1, y1, 20)
    colours = ["mug2", "lamp2", "panel", "land", "mug", "port"]
    for row, (top, bottom) in enumerate(((39, 49), (101, 111))):  # container racks above and below the bay
        for i, x in enumerate(range(x0 + 4, x1 - 8, 15)):
            colour = colours[(i + row * 3) % len(colours)]
            c.rect(x, top, x + 12, bottom, "caseedge")
            c.rect(x + 1, top + 1, x + 11, bottom - 1, colour)
            for rib in range(x + 3, x + 11, 3):
                c.vline(rib, top + 2, bottom - 2, "caseedge")
            c.hline(x + 1, x + 11, top + 1, "white" if colour == "port" else colour)


def core(c: Canvas) -> None:
    x0, y0, x1, y1 = CORE
    hull(c, x0, y0, x1, y1)
    cx = RING[0]
    c.rect(cx - 9, y0 + 1, cx + 9, y1 - 1, "case2")  # the band where the ring's hub meets the hull
    c.vline(cx - 9, y0 + 1, y1 - 1, "case3")
    c.vline(cx + 9, y0 + 1, y1 - 1, "caselo")


def ring(c: Canvas, front: bool) -> None:
    """The habitat ring, almost edge on: its far half behind the hull, its near
    half (the left of the ellipse) in front of it, then the spokes and pods."""
    cx, cy, rx, ry = RING
    for y in range(cy - ry - 1, cy + ry + 2):
        for x in range(cx - rx - 1, cx + rx + 2):
            outer = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            inner = ((x - cx) / (rx - 4)) ** 2 + ((y - cy) / (ry - 4)) ** 2
            if outer <= 1 < inner and (x <= cx) == front:
                c.px(x, y, "case3" if x <= cx else "caselo")
    if front:
        for y0, y1 in ((cy - ry + 3, CORE[1]), (CORE[3], cy + ry - 3)):  # spokes to the hub
            c.rect(cx - 1, y0, cx + 1, y1, "truss")
            c.vline(cx - 1, y0, y1, "truss2")
        for top in POD_TOPS:  # a pod at the top and bottom of the ring
            hull(c, cx - 11, top, cx + 11, top + POD_H)


def sensors(c: Canvas) -> None:
    x0, y0, x1, y1 = SENSORS
    hull(c, x0, y0, x1, y1)
    sx0, sy0, sx1, sy1 = SHIELD
    c.rect((sx0 + sx1) // 2 - 2, SPINE[3], (sx0 + sx1) // 2 + 2, sy0, "truss")
    hull(c, sx0, sy0, sx1, sy1, "case2")
    for x in (sx0 + 2, sx1 - 2):  # shield emitters
        c.px(x, sy1 + 1, "teal")
    # the mast and the dish
    mx = 226
    c.rect(mx, 22, mx + 1, y0 - 1, "truss2")
    for x in range(mx - 15, mx + 17):
        depth = 6 - round(6 * ((x - mx) / 16) ** 2)  # a shallow bowl, opening up
        c.vline(x, 18 - depth, 18 - depth + 1, "metal2" if x < mx else "metal")
    c.vline(mx, 9, 18, "truss2")  # the feed horn
    c.px(mx, 8, "portlit")


def bow(c: Canvas) -> None:
    x0, x1 = BOW
    top0, bot0 = 50, 100
    for x in range(x0, x1 + 1):
        t = (x - x0) / (x1 - x0)
        top, bot = round(top0 + 17 * t), round(bot0 - 17 * t)
        c.vline(x, top, bot, "case")
        c.px(x, top, "caseedge")
        c.px(x, bot, "caseedge")
        c.px(x, top + 1, "casehi")
        c.px(x, bot - 1, "caselo")
    c.vline(x0, top0, bot0, "caseedge")
    c.vline(x0 + 1, top0 + 1, bot0 - 1, "case3")
    c.vline(x1, round(top0 + 17), round(bot0 - 17), "caseedge")
    for x in (275,):  # a panel seam between the bridge's windows
        t = (x - x0) / (x1 - x0)
        c.vline(x, round(top0 + 17 * t) + 2, round(bot0 - 17 * t) - 2, "case2")
    c.px(x1 - 1, 75, "portlit")  # a running light at the tip


def slot(c: Canvas, x: int, y: int) -> None:
    """A compartment's window, dark until the map lights it."""
    c.rect(x - 1, y - 1, x + SLOT_W, y + SLOT_H, "caseedge")
    c.rect(x, y, x + SLOT_W - 1, y + SLOT_H - 1, "lip")
    c.hline(x, x + SLOT_W - 1, y + SLOT_H, "case3")  # the sill catches the light


def hull_contains(x: int, y: int) -> bool:
    """For tests: is this point on the ship (not space)?"""
    if SPINE[0] <= x <= SPINE[2] and SPINE[1] <= y <= SPINE[3]:
        return True
    for x0, y0, x1, y1 in (CARGO, CORE, SENSORS, SHIELD):
        if x0 <= x <= x1 and y0 <= y <= y1:
            return True
    cx = RING[0]
    if cx - 11 <= x <= cx + 11 and any(top <= y <= top + POD_H for top in POD_TOPS):
        return True
    x0, x1 = BOW
    if x0 <= x <= x1:
        t = (x - x0) / (x1 - x0)
        return round(50 + 17 * t) < y < round(100 - 17 * t)
    return False

