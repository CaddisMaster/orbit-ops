"""The desk's computer (#46), now a laptop (#55): the case is pixel art, the
glass is HTML, and the two must line up exactly; the glass effects must not
cost readability."""

import re
from pathlib import Path

import pytest

from art import png, room
from art.canvas import Canvas

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "app" / "static" / "css" / "style.css").read_text()


def _rule(selector: str) -> str:
    return re.search(r"^" + re.escape(selector) + r" \{(.*?)\n\}", CSS, re.S | re.M).group(1)


def _percent(rule: str, prop: str) -> float:
    return float(re.search(rf"\n  {prop}: ([\d.]+)%;", rule).group(1))


@pytest.mark.criterion(46, "The screen is set in a drawn computer")
@pytest.mark.criterion(55, "Every page sits on the laptop's screen")
def test_the_glass_lines_up_with_the_drawn_bezel():
    x0, y0, x1, y1 = room.GLASS
    monitor = _rule(".monitor")
    assert _percent(monitor, "left") == pytest.approx(100 * x0 / room.W, abs=0.001)
    assert _percent(monitor, "right") == pytest.approx(100 * (room.W - 1 - x1) / room.W, abs=0.001)
    assert _percent(monitor, "top") == pytest.approx(100 * y0 / room.H, abs=0.001)
    assert _percent(monitor, "bottom") == pytest.approx(100 * (room.H - 1 - y1) / room.H, abs=0.001)
    light = _rule(".power-light")
    lx, ly = room.POWER_LIGHT
    assert _percent(light, "left") == pytest.approx(100 * lx / room.W, abs=0.001)
    assert _percent(light, "top") == pytest.approx(100 * ly / room.H, abs=0.001)


def _layer(name: str):
    return png.decode((ROOT / "app/static/img" / name).read_bytes())[2]


def test_the_art_draws_a_laptop_around_the_glass():
    colour = Canvas.colour
    x0, y0, x1, y1 = room.GLASS
    lx0, ly0, lx1, ly1 = room.LID
    lid = _layer("laptop-lid.png")
    assert lid[y0][x0] == lid[y1][x1] == colour("screenback")  # the glass, under the HTML
    assert lid[y0 - 1][x0] == colour("lip")  # the recess around it
    assert lid[ly0 + 1][(lx0 + lx1) // 2] == colour("casehi")  # the bevel, lit from above
    assert lid[ly0][lx0] == colour("caseedge")
    assert lid[room.POWER_LIGHT[1]][room.POWER_LIGHT[0]] == colour("ledhouse")
    assert lid[ly1 + 3][lx0] == colour("clear")  # nothing below the hinge: the deck is its own layer
    deck = _layer("laptop-deck.png")
    assert deck[157][room.W // 2] in (colour("key"), colour("case2"))  # the keyboard
    assert deck[room.HINGE_Y - 1][room.W // 2] == colour("clear")
    shut = _layer("laptop-closed.png")
    assert shut[room.SLEEP_LIGHT[1]][room.SLEEP_LIGHT[0]] == colour("ledhouse")
    assert shut[room.HINGE_Y - 1][room.W // 2] == colour("clear")  # nothing above the hinge: the room shows
    assert _layer("room.png")[(y0 + y1) // 2][(x0 + x1) // 2] != colour("screenback")  # behind the lid, the room


def test_the_lid_and_its_controls_line_up_with_the_art():
    lid = _rule(".lid")
    assert re.search(r"transform-origin: 50% ([\d.]+)%;", lid).group(1) == f"{100 * room.HINGE_Y / room.H:.3f}"
    tab = _rule(".lid-close")
    tx0, ty0, tx1, ty1 = room.CLOSE_TAB
    assert _percent(tab, "left") == pytest.approx(100 * tx0 / room.W, abs=0.001)
    assert _percent(tab, "width") == pytest.approx(100 * (tx1 - tx0 + 1) / room.W, abs=0.001)
    assert _percent(tab, "top") == pytest.approx(100 * ty0 / room.H, abs=0.001)
    assert _percent(tab, "height") == pytest.approx(100 * (ty1 - ty0 + 1) / room.H, abs=0.001)
    sleep = _rule(".sleep-light")
    sx, sy = room.SLEEP_LIGHT
    assert _percent(sleep, "left") == pytest.approx(100 * sx / room.W, abs=0.001)
    assert _percent(sleep, "top") == pytest.approx(100 * sy / room.H, abs=0.001)


def test_every_page_has_the_power_light(client):
    assert '<span class="power-light"></span>' in client.get("/login").text


def _luminance(rgb):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(a, b):
    la, lb = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _hex(name: str):
    h = re.search(rf"--{name}: #([0-9a-f]{{6}});", CSS).group(1)
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


@pytest.mark.criterion(46, "The glass effects don't cost readability")
def test_lesson_text_keeps_7_to_1_under_the_glass():
    glass = _rule(".screen::after")
    whites = [float(a) for a in re.findall(r"rgb\(255 255 255 / ([\d.]+)\)", glass)]
    glare = max(whites[1:]) + whites[0]  # the brightest glare band, plus a scanline over it
    darkest = float(re.search(r"inset 0 0 [\d.]+vmin rgb\(0 0 0 / ([\d.]+)\)", glass).group(1)) / 2  # half at the edge
    text, bg = _hex("text"), _hex("bg")

    def through_glass(c):
        dimmed = [v * (1 - darkest) for v in c]
        return [v + (255 - v) * glare for v in dimmed]

    assert _contrast(through_glass(text), through_glass(bg)) >= 7
    assert _contrast(text, bg) >= 7


def test_the_shuttle_docks_at_the_drawn_port():
    shuttle = _rule(".window-event.shuttle-dock img")
    px, py = room.DOCK_PORT
    assert _percent(shuttle, "top") == pytest.approx(100 * (py - 3) / room.H, abs=0.001)
    assert _percent(shuttle, "left") == pytest.approx(100 * (px + 1) / room.W, abs=0.1)
