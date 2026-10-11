"""Small sprites: the window events (the supply shuttle, a relay satellite,
a debris field, an aurora) and the cast's 16x16 avatars for the comms log.
Drawn as text grids, one character a pixel, except the aurora, which follows
the Earth's limb in art/room.py."""

import math

from art import room
from art.canvas import Canvas

SHUTTLE = [
    "....hhhhhhhhhhhh......",
    "..hhHHHHHHHHHHHHhh....",
    ".hHHgggHHHHHHHHHHHhhTT",
    "hHHHgggHHHHHHHHHHHHHTT",
    ".hHHHHHHHHHHHHHHHHhhTT",
    "..hhddHHHHHHHHddhh....",
    "....hhhhhhhhhhhh......",
]
SHUTTLE_KEY = {"h": "hull3", "H": "hull", "g": "glass", "d": "hull2", "T": "thrust"}

SATELLITE = [
    "pppppp..a.....pppppp",
    "pPpPpP..a.....pPpPpP",
    "pppppp-hhhhh-pppppp.",
    "pPpPpP-hHHHh-pPpPpP.",
    "pppppp-hhhhh-pppppp.",
    "pPpPpP..g.....pPpPpP",
    "pppppp........pppppp",
]
SATELLITE_KEY = {"p": "panel", "P": "panel2", "h": "hull3", "H": "hull", "a": "hull2", "g": "gold", "-": "hull2"}

DEBRIS = [
    "..rr.............s..........RRr.........",
    ".rRrr...........sss........rRRRr....s...",
    "rrRRr.....s......s.........rrRRrr.......",
    ".rrr.....sss................rrrr....rr..",
    "..........s......rr..........r.....rRr..",
    "................rRr.................r...",
]
DEBRIS_KEY = {"r": "rock2", "R": "rock3", "s": "scrap"}

AURORA_AT = (230, 3)  # where the aurora sprite sits on the room canvas (CSS .window-event.aurora)
AURORA_SIZE = (84, 126)

AVATARS = {
    # Chief Engineer Okafor: close-cropped hair, a comms headset, station blues.
    "okafor": (
        [
            "................",
            ".....hhhhhh.....",
            "....hhhhhhhh....",
            "...hhssssssh....",
            "..ThsssssssssT..",
            "..TssesssessT...",
            "..Tsssssssss.m..",
            "...ssssssssss.m.",
            "...sssSSSsss..m.",
            "....ssssssss.mm.",
            ".....ssssss.....",
            "......ssss......",
            "....uuuuuuuu....",
            "..uuuUuuuuUuuu..",
            ".uuuuUuuuuUuuuu.",
            ".uuuuuuuuuuuuuu.",
        ],
        {"h": "hair", "s": "skin1", "S": "skin2", "e": "hair", "T": "headset", "m": "headset", "u": "uniform", "U": "uniform2"},
    ),
    # MERIDIAN, the station's own system voice: an amber sensor eye in a ring.
    "meridian": (
        [
            "................",
            ".....tttttt.....",
            "...tt......tt...",
            "..t..........t..",
            "..t...eeee...t..",
            ".t...eEEEEe...t.",
            ".t..eEEwwEEe..t.",
            ".t..eEEwwEEe..t.",
            ".t...eEEEEe...t.",
            "..t...eeee...t..",
            "..t..........t..",
            "...tt......tt...",
            ".....tttttt.....",
            "................",
            "...t.t.t.t.t....",
            "................",
        ],
        {"t": "teal", "e": "mug2", "E": "eye", "w": "white"},
    ),
    # Mission Control: the Earth, seen from the station.
    "mission": (
        [
            "................",
            ".....gggggg.....",
            "...ggbbbbbbgg...",
            "..gbbllbbbbbbg..",
            "..gbllllbbcccg..",
            ".gbbllllbbbccbg.",
            ".gbbblllbbbbbbg.",
            ".gbbbbllbbllbbg.",
            ".gbbbbbbblllbbg.",
            ".gccbbbbbbllbbg.",
            "..gccbbbbbbbbg..",
            "..gbbbbllbbbbg..",
            "...ggbbllbbgg...",
            ".....gggggg.....",
            "................",
            "................",
        ],
        {"g": "glow", "b": "earth2", "l": "land", "c": "cloud"},
    ),
}


def satellite() -> Canvas:
    c = Canvas(len(SATELLITE[0]), len(SATELLITE))
    c.sprite(0, 0, SATELLITE, SATELLITE_KEY)
    return c


def debris() -> Canvas:
    c = Canvas(len(DEBRIS[0]), len(DEBRIS))
    c.sprite(0, 0, DEBRIS, DEBRIS_KEY)
    return c


def aurora() -> Canvas:
    """Curtains of light over the Earth, just inside its limb, as you see an
    aurora from orbit. The laptop is a layer above the window (#55), so the
    whole aurora shows when its lid is shut."""
    w, h = AURORA_SIZE
    ox, oy = AURORA_AT
    c = Canvas(w, h)
    cx, cy, r = 372, 60, 82  # the Earth in art/room.py
    wx0, wy0, wx1, wy1 = room.WINDOW
    for y in range(h):
        for x in range(w):
            X, Y = ox + x, oy + y
            if not (wx0 <= X <= wx1 and wy0 <= Y <= wy1):
                continue
            depth = r - math.hypot(X - cx, Y - cy)  # how far inside the limb
            if not 2 <= depth <= 17:
                continue
            # vertical curtains: bright near the limb, rippling, fading inwards
            ripple = math.sin(Y * 0.5 + math.sin(X * 0.4) * 2) + 0.6 * math.sin(Y * 0.17 + X * 0.9)
            if depth < 6:
                colour = "aurora2" if ripple > -0.2 else "aurora1"
            elif depth < 11:
                colour = "aurora1" if ripple > 0.1 else ("aurora4" if ripple > -0.7 else None)
            else:
                colour = "aurora3" if ripple > 0.9 else ("aurora4" if ripple > 0.3 else None)
            if colour:
                c.px(x, y, colour)
    return c


def shuttle() -> Canvas:
    c = Canvas(len(SHUTTLE[0]), len(SHUTTLE))
    c.sprite(0, 0, SHUTTLE, SHUTTLE_KEY)
    return c


def avatar(name: str) -> Canvas:
    art, key = AVATARS[name]
    c = Canvas(16, 16)
    c.sprite(0, 0, art, key)
    return c
