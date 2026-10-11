"""The desk on the Meridian, first person: a big port window with the Earth's
limb and a docking arm, a desk with a lamp and a coffee mug, and a laptop.

320x180, drawn for a 16:9 scene, in layers that stack exactly (#55): the room,
the laptop's open deck, its lid, and the laptop shut. The lid folds down in CSS
to show the room. The laptop's screen is not drawn: the glass is HTML, laid
into the bezel at fixed percentages (app/static/css/style.css, "The desk"),
so GLASS below and the CSS must agree.
"""

import math

from art.canvas import Canvas

W, H = 320, 180
WINDOW = (6, 3, 313, 128)  # x0, y0, x1, y1, inside the frame
DESK_Y = 150
DOCK_PORT = (74, 11)  # where the shuttle's nose meets the arm (app/static/css: .window-event)
LID = (24, 18, 295, 153)  # the lid's outer edge; it hinges along its bottom
GLASS = (30, 24, 289, 144)  # the screen, inclusive: CSS left/right 9.375%, top 13.333%, bottom 19.444%
POWER_LIGHT = (284, 150)  # centre of the power light (CSS .power-light: left 88.75%, top 83.333%)
CLOSE_TAB = (34, 147, 61, 152)  # where the "Close lid" button sits on the bezel (CSS .lid-close)
HINGE_Y = 154
DECK_FRONT = 177  # the deck's front edge starts here and runs off the bottom
SLEEP_LIGHT = (262, 178)  # the closed laptop's breathing light (CSS .is-closed .power-light)


def render() -> Canvas:
    """The room alone: what you see with the laptop shut."""
    c = Canvas(W, H, "wall", seed=38)
    wall(c)
    window(c)
    desk(c)
    lamp(c)
    mug(c)
    return c


def wall(c: Canvas) -> None:
    for y in range(H):
        for x in range(W):
            if (x // 40 + y // 45) % 2:
                c.px(x, y, "wall2")
    for x in range(0, W, 40):
        c.vline(x, 0, DESK_Y, "wall3")


def window(c: Canvas) -> None:
    x0, y0, x1, y1 = WINDOW
    c.rect(x0 - 4, y0 - 3, x1 + 4, y1 + 4, "frame3")
    c.rect(x0 - 3, y0 - 2, x1 + 3, y1 + 3, "frame")
    c.rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, "frame2")
    # Three bands of sky, dithered where they meet so there's no hard edge.
    bands = [(y0 + 10, "space2", "space"), (y0 + 56, "space", "void")]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            colour = "void"
            for edge, above, below in bands:
                if y < edge - 3:
                    colour = above
                    break
                if y < edge + 3:
                    t = (y - (edge - 3)) / 6  # 0 → 1 across the seam
                    colour = below if ((x * 7 + y * 3) % 8) / 8 < t else above
                    break
            c.px(x, y, colour)
    for _ in range(170):
        c.px(c.random.randint(x0, x1), c.random.randint(y0, y1), c.random.choice(["star", "star2", "star3", "star3"]))
    earth(c)
    docking_arm(c)
    for x in range(x0 - 2, x1 + 3, 14):
        c.px(x, y0 - 2, "rivet")
        c.px(x, y1 + 3, "rivet")
    for y in range(y0, y1, 14):
        c.px(x0 - 2, y, "rivet")
        c.px(x1 + 2, y, "rivet")


def earth(c: Canvas) -> None:
    """A big limb rising on the right, so it shows beside and above the monitor."""
    cx, cy, r = 372, 60, 82
    x0, y0, x1, y1 = WINDOW

    def paint(x, y, d):
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            return None
        if d > r - 2:
            return "glow"
        n = math.sin(x * 0.17 + 1.3) * math.cos(y * 0.23) + math.sin((x - y) * 0.07)
        if n > 1.05:
            return "land2" if (x + y) % 5 else "land"
        if n < -1.25:
            return "cloud"
        shade = (x - cx) / r  # the sun is to the left: the far side is darker
        return "earth3" if shade < -0.75 else "earth2" if shade < -0.45 else "earth1"

    c.disc(cx, cy, r + 1.5, lambda x, y, d: "glow" if d > r and x0 <= x <= x1 and y0 <= y <= y1 else None)
    c.disc(cx, cy, r, paint)


def docking_arm(c: Canvas) -> None:
    """A truss reaching in from the left edge, with a docking port at its end."""
    x0, y0, _, _ = WINDOW
    px, py = DOCK_PORT
    c.rect(x0, py - 3, px - 4, py + 3, "truss")
    for x in range(x0, px - 4, 6):
        c.vline(x, py - 3, py + 3, "truss2")
        c.px(x + 3, py - 2, "truss2")
        c.px(x + 3, py + 2, "truss2")
    c.rect(px - 4, py - 5, px - 1, py + 5, "truss2")
    c.rect(px - 1, py - 2, px, py + 2, "port")
    c.px(px, py, "portlit")


def desk(c: Canvas) -> None:
    c.rect(0, DESK_Y, W - 1, H - 1, "desk")
    for x in range(-40, W, 11):  # the grain runs towards you
        for y in range(DESK_Y + 2, H):
            gx = x + (y - DESK_Y) // 3
            if 0 <= gx < W:
                c.px(gx, y, "desk2")
    c.rect(0, DESK_Y - 2, W - 1, DESK_Y - 1, "deskedge")
    c.hline(0, W - 1, DESK_Y, "desk3")


def lamp(c: Canvas) -> None:
    # A warm pool of light on the wall, thinning out with distance (ordered dither).
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    c.disc(15, 134, 16, lambda x, y, d: "lampglow" if d > 5 and bayer[y % 4][x % 4] / 16 > 0.35 + (d - 5) / 18 else None)
    c.rect(9, 124, 21, 128, "lamp2")
    c.rect(10, 128, 20, 130, "lamp")
    c.vline(15, 131, DESK_Y - 3, "metal2")
    c.rect(10, DESK_Y - 3, 20, DESK_Y - 1, "metal")


def mug(c: Canvas) -> None:
    x0, y0 = 301, 140
    c.rect(x0, y0, x0 + 11, y0 + 15, "mug")
    c.vline(x0 + 2, y0 + 2, y0 + 13, "mug3")
    c.rect(x0, y0, x0 + 11, y0 + 1, "mug2")
    c.rect(x0 + 1, y0 + 1, x0 + 10, y0 + 2, "coffee")
    c.rect(x0 + 12, y0 + 4, x0 + 14, y0 + 11, "mug")
    c.rect(x0 + 13, y0 + 5, x0 + 13, y0 + 10, "wall2")
    c.hline(x0, x0 + 11, y0 + 15, "mug2")
    for x, y in ((x0 + 4, y0 - 3), (x0 + 5, y0 - 5), (x0 + 4, y0 - 7), (x0 + 7, y0 - 4), (x0 + 8, y0 - 6), (x0 + 7, y0 - 8), (x0 + 6, y0 - 10)):
        c.px(x, y, "steam")


# A tiny 5-high pixel font for the maker's plate; letters are as wide as they need.
FONT = {
    "M": ["X...X", "XX.XX", "X.X.X", "X...X", "X...X"], "E": ["XXX", "X..", "XX.", "X..", "XXX"],
    "R": ["XX.", "X.X", "XX.", "X.X", "X.X"], "I": ["XXX", ".X.", ".X.", ".X.", "XXX"],
    "D": ["XX.", "X.X", "X.X", "X.X", "XX."], "A": [".X.", "X.X", "XXX", "X.X", "X.X"],
    "N": ["X..X", "XX.X", "X.XX", "X..X", "X..X"],
}


def text(c: Canvas, x: int, y: int, word: str, colour: str) -> int:
    for ch in word:
        for dy, row in enumerate(FONT[ch]):
            for dx, bit in enumerate(row):
                if bit == "X":
                    c.px(x + dx, y + dy, colour)
        x += len(FONT[ch][0]) + 1
    return x


def text_width(word: str) -> int:
    return sum(len(FONT[ch][0]) + 1 for ch in word) - 1


def _deck_edges(y: int) -> tuple[int, int]:
    """The deck's left and right edge at row y: it widens towards you."""
    spread = (y - HINGE_Y) * 16 // 25
    return LID[0] - 2 - spread, LID[2] + 2 + spread


def _deck_shape(c: Canvas, top: str) -> None:
    for y in range(HINGE_Y, H):
        x0, x1 = _deck_edges(y)
        c.hline(x0, x1, y, top if y < DECK_FRONT else "caselo")
        c.px(x0, y, "caseedge")
        c.px(x1, y, "caseedge")
    x0, x1 = _deck_edges(DECK_FRONT)
    c.hline(x0, x1, DECK_FRONT, "case3")  # the front edge catches the light


def deck() -> Canvas:
    """The laptop open: the base, with its keyboard and trackpad, seen from above."""
    c = Canvas(W, H)
    _deck_shape(c, "case2")
    c.hline(GLASS[0], GLASS[2], HINGE_Y, "caseedge")  # the hinge barrel, under the lid
    for row, y in enumerate((157, 160, 163, 166)):
        x0, x1 = _deck_edges(y)
        left, right = x0 + 20 - row, x1 - 20 + row
        keys = 15
        pitch = (right - left) / keys
        for k in range(keys):
            kx = round(left + k * pitch)
            c.rect(kx, y, round(kx + pitch) - 2, y + 1, "key")
            c.hline(kx, round(kx + pitch) - 2, y + 1, "key3")
    cx = W // 2
    c.rect(cx - 48, 169, cx + 48, 170, "key")  # the space bar
    c.hline(cx - 48, cx + 48, 170, "key3")
    c.rect(cx - 30, 172, cx + 30, DECK_FRONT - 2, "case")  # the trackpad
    c.hline(cx - 30, cx + 30, 172, "caselo")
    return c


def lid() -> Canvas:
    """The lid, open: a slim gunmetal bezel round the glass, lit from the top left."""
    c = Canvas(W, H)
    x0, y0, x1, y1 = LID
    gx0, gy0, gx1, gy1 = GLASS
    c.rect(x1 + 1, y0 + 3, x1 + 3, y1, "shadow")  # on the window and wall behind
    c.rect(x0, y0, x1, y1, "caseedge")
    c.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, "case")
    c.hline(x0 + 1, x1 - 1, y0 + 1, "casehi")
    c.vline(x0 + 1, y0 + 1, y1 - 1, "case3")
    c.hline(x0 + 1, x1 - 1, y1 - 1, "caselo")
    c.vline(x1 - 1, y0 + 1, y1 - 1, "caselo")
    # the recessed lip around the glass: dark, with the light catching its lower edge
    c.rect(gx0 - 2, gy0 - 2, gx1 + 2, gy1 + 2, "lip")
    c.hline(gx0 - 2, gx1 + 2, gy1 + 2, "case2")
    c.vline(gx1 + 2, gy0 - 2, gy1 + 2, "case2")
    c.rect(gx0, gy0, gx1, gy1, "screenback")
    cx = (x0 + x1) // 2
    c.rect(cx - 1, y0 + 2, cx, y0 + 3, "lip")  # the camera
    text(c, cx - text_width("MERIDIAN") // 2, gy1 + 4, "MERIDIAN", "case3")
    tx0, ty0, tx1, ty1 = CLOSE_TAB  # a recessed tab for the close button
    c.rect(tx0, ty0, tx1, ty1, "case2")
    c.hline(tx0, tx1, ty1, "caselo")
    lx, ly = POWER_LIGHT
    c.rect(lx - 2, ly - 2, lx + 2, ly + 2, "ledhouse")
    return c


def closed() -> Canvas:
    """The laptop shut: the lid's back lying on the deck, the deck's edge in front."""
    c = Canvas(W, H)
    _deck_shape(c, "case")
    c.hline(*_deck_edges(HINGE_Y), HINGE_Y, "caseedge")  # the hinge, at the back
    c.hline(_deck_edges(HINGE_Y + 1)[0] + 1, _deck_edges(HINGE_Y + 1)[1] - 1, HINGE_Y + 1, "casehi")
    for y in range(HINGE_Y + 4, DECK_FRONT - 2, 4):  # brushed metal
        x0, x1 = _deck_edges(y)
        c.hline(x0 + 3, x1 - 3, y, "case2")
    x0, x1 = _deck_edges(DECK_FRONT - 1)
    c.hline(x0 + 1, x1 - 1, DECK_FRONT - 1, "casehi")  # the lid's front lip
    plate_w = text_width("MERIDIAN") + 4
    px0 = W // 2 - plate_w // 2
    c.rect(px0, 163, px0 + plate_w - 1, 169, "plate")
    c.hline(px0, px0 + plate_w - 1, 169, "case3")
    text(c, px0 + 2, 164, "MERIDIAN", "platetext")
    sx, sy = SLEEP_LIGHT
    c.rect(sx - 2, sy - 1, sx + 2, sy + 1, "ledhouse")
    return c
