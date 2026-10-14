"""The app scales with the desk (#105): the root font size is a share of the
scene's width, and the app is sized in rem, so a bigger screen shows the same
layout larger, and 1280x720 stays as it was."""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "app" / "static" / "css" / "style.css").read_text()


def _rule(selector: str) -> str:
    return re.search(r"^" + re.escape(selector) + r" \{(.*?)\}", CSS, re.S | re.M).group(1)


def _root_font(vw: int, vh: int) -> float:
    """html's font-size at a viewport, worked out from the stylesheet's own numbers."""
    low, divisor, high = re.search(
        r"font-size: clamp\((\d+)px, calc\(min\(100vw, 100vh \* 16 / 9\) / (\d+)\), (\d+)px\);", _rule("html")
    ).groups()
    scene_width = min(vw, vh * 16 / 9)
    return min(max(int(low), scene_width / int(divisor)), int(high))


def test_the_root_font_follows_the_scenes_width():
    # the same expression .scene uses, so the text and the art grow together
    assert "width: min(100vw, calc(100vh * 16 / 9));" in _rule(".scene")


@pytest.mark.criterion(105, "The app scales up with the screen")
def test_the_app_is_larger_at_2560x1440_in_proportion():
    assert _root_font(2560, 1440) == 2 * _root_font(1280, 720)
    # a window shorter than 16:9 sizes by its height, as the scene does
    assert _root_font(2560, 1300) == pytest.approx(1300 * 16 / 9 / 80)
    # the reading column, the comms log and the body text are in rem, so they follow
    assert "max-width: 47.5rem;" in _rule(".container")
    assert "clamp(15rem, 24%, 20rem)" in _rule(".screen.has-comms")
    assert "font: 1rem/1.6" in _rule("body")


@pytest.mark.criterion(105, "The smallest supported screen is unchanged")
def test_1280x720_keeps_16px_text_and_a_760px_column():
    assert _root_font(1280, 720) == 16
    assert _root_font(1024, 640) == 16  # never smaller than today
    assert 47.5 * 16 == 760


def test_avatars_and_emblems_are_sized_in_rem():
    # their width/height attributes are px; CSS has to override them or they won't scale
    for selector, size in [(".avatar", "2rem"), (".emblem", "3rem"), (".unit-emblem", "3.5rem")]:
        rule = _rule(selector)
        assert f"width: {size};" in rule and f"height: {size};" in rule, selector


# --- the side bars (#105) ---------------------------------------------------------------------
@pytest.mark.criterion(105, "The desk fits a 2K screen")
def test_the_scene_fits_the_window_and_the_wide_room_fills_the_sides():
    from art import room

    # the scene is always wholly inside the window: as wide as it can be at 16:9, and no wider
    scene = _rule(".scene")
    assert "width: min(100vw, calc(100vh * 16 / 9));" in scene and "height: min(100vh, calc(100vw * 9 / 16));" in scene
    # behind it, the wide room at the scene's own scale, centred, so its middle is the scene
    backdrop = _rule("body::before")
    assert f"* {room.WIDE_W} / {room.W}) auto" in backdrop and 'url("../img/room-wide.png") center' in backdrop
    assert backdrop.count("position: fixed;") == 1 and "image-rendering: pixelated;" in backdrop
    # wide enough for a 21:9 monitor (2560x1080) to show no bars
    assert room.WIDE_W / room.H >= 2560 / 1080


def test_the_wide_rooms_middle_is_the_scenes_room():
    from art import room

    wide, scene = room.wide(), room.render()
    m = room.WIDE_MARGIN
    assert [row[m : m + room.W] for row in wide.rows] == scene.rows
    assert (wide.width, wide.height) == (room.WIDE_W, room.H)
