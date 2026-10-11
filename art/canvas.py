"""A tiny drawing surface with a named palette, shared by every scene."""

import math
import random

from art import png

PALETTE = {
    # space
    "void": (6, 8, 20), "space": (10, 13, 30), "space2": (16, 20, 44),
    "star": (232, 238, 255), "star2": (150, 160, 200), "star3": (90, 100, 140),
    "earth1": (34, 80, 156), "earth2": (48, 112, 190), "earth3": (66, 140, 214),
    "land": (64, 124, 84), "land2": (90, 150, 96), "cloud": (222, 232, 242), "glow": (110, 170, 236),
    # the room
    "wall": (26, 30, 50), "wall2": (34, 40, 64), "wall3": (20, 23, 40),
    "frame": (58, 66, 94), "frame2": (82, 92, 126), "frame3": (40, 46, 70), "rivet": (120, 130, 160),
    "truss": (96, 104, 132), "truss2": (140, 148, 172), "port": (220, 170, 90), "portlit": (250, 210, 120),
    "desk": (78, 54, 40), "desk2": (98, 70, 52), "desk3": (60, 42, 32), "deskedge": (48, 32, 24),
    "key": (60, 66, 86), "key2": (86, 94, 118), "key3": (44, 48, 64),
    "mug": (200, 92, 72), "mug2": (152, 64, 50), "mug3": (232, 130, 104), "coffee": (58, 34, 22), "steam": (160, 170, 190),
    "lamp": (248, 204, 124), "lamp2": (200, 150, 80), "lampglow": (96, 78, 60), "metal": (70, 76, 96), "metal2": (110, 118, 140),
    "note": (240, 214, 120), "ink": (90, 70, 40),
    "screenback": (14, 16, 26),
    # the laptop: a gunmetal case, lit from the top left
    "case": (58, 64, 84), "case2": (74, 81, 104), "case3": (96, 104, 130), "casehi": (128, 138, 166),
    "caselo": (40, 44, 60), "caseedge": (18, 20, 30), "lip": (12, 14, 22), "plate": (150, 158, 182), "platetext": (40, 44, 60),
    "ledhouse": (26, 28, 40), "shadow": (0, 0, 0, 110),
    # the shuttle
    "hull": (210, 214, 224), "hull2": (150, 156, 172), "hull3": (100, 106, 124), "glass": (90, 200, 220), "thrust": (255, 170, 80),
    # avatars
    "skin1": (122, 78, 54), "skin2": (96, 60, 42), "hair": (24, 20, 22), "headset": (60, 66, 86), "teal": (79, 209, 197),
    "uniform": (40, 90, 110), "uniform2": (30, 70, 88), "white": (240, 244, 250), "eye": (255, 120, 90),
    # window events
    "panel": (52, 92, 170), "panel2": (90, 140, 220), "gold": (214, 180, 90), "rock": (120, 112, 104), "rock2": (84, 78, 74), "rock3": (160, 152, 140),
    "scrap": (150, 160, 176), "aurora1": (90, 255, 170, 120), "aurora2": (120, 255, 190, 190), "aurora3": (170, 120, 255, 110), "aurora4": (60, 220, 160, 70),
    "clear": (0, 0, 0, 0),
}


class Canvas:
    def __init__(self, width: int, height: int, fill: str = "clear", seed: int = 7):
        self.width, self.height = width, height
        self.rows = [[self.colour(fill)] * width for _ in range(height)]
        self.random = random.Random(seed)  # deterministic: same seed, same picture

    @staticmethod
    def colour(name: str) -> tuple[int, int, int, int]:
        c = PALETTE[name]
        return c if len(c) == 4 else (*c, 255)

    def px(self, x: int, y: int, c: str) -> None:
        if 0 <= x < self.width and 0 <= y < self.height:
            self.rows[y][x] = self.colour(c)

    def rect(self, x0: int, y0: int, x1: int, y1: int, c: str) -> None:
        for y in range(max(0, y0), min(self.height, y1 + 1)):
            for x in range(max(0, x0), min(self.width, x1 + 1)):
                self.rows[y][x] = self.colour(c)

    def hline(self, x0: int, x1: int, y: int, c: str) -> None:
        self.rect(x0, y, x1, y, c)

    def vline(self, x: int, y0: int, y1: int, c: str) -> None:
        self.rect(x, y0, x, y1, c)

    def disc(self, cx: float, cy: float, r: float, paint) -> None:
        """Fill a disc; `paint(x, y, d)` picks each pixel's colour name (or None)."""
        for y in range(max(0, int(cy - r - 1)), min(self.height, int(cy + r + 2))):
            for x in range(max(0, int(cx - r - 1)), min(self.width, int(cx + r + 2))):
                d = math.hypot(x - cx, y - cy)
                if d <= r and (c := paint(x, y, d)):
                    self.px(x, y, c)

    def shade(self, x0: int, y0: int, x1: int, y1: int, factor: float) -> None:
        """Darken what's already there (a shadow), keeping its hue."""
        for y in range(max(0, y0), min(self.height, y1 + 1)):
            for x in range(max(0, x0), min(self.width, x1 + 1)):
                r, g, b, a = self.rows[y][x]
                self.rows[y][x] = (int(r * factor), int(g * factor), int(b * factor), a)

    def sprite(self, x0: int, y0: int, art: list[str], key: dict[str, str]) -> None:
        """Stamp a text sprite: one character per pixel, '.' is transparent."""
        for dy, line in enumerate(art):
            for dx, ch in enumerate(line):
                if ch != ".":
                    self.px(x0 + dx, y0 + dy, key[ch])

    def to_png(self) -> bytes:
        return png.encode(self.width, self.height, self.rows)
