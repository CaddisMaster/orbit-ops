"""Small sprites: the supply shuttle for the docking event, and the cast's
16x16 avatars for the comms log. Drawn as text grids, one character a pixel."""

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


def shuttle() -> Canvas:
    c = Canvas(len(SHUTTLE[0]), len(SHUTTLE))
    c.sprite(0, 0, SHUTTLE, SHUTTLE_KEY)
    return c


def avatar(name: str) -> Canvas:
    art, key = AVATARS[name]
    c = Canvas(16, 16)
    c.sprite(0, 0, art, key)
    return c
