"""The pixel art is code (#38): every committed PNG must be exactly what its
script in art/ draws. Pixels are compared decoded, not as file bytes, because
two zlib builds may compress the same pixels differently."""

from pathlib import Path

import pytest

from art import build, png

IMG = Path(__file__).resolve().parents[1] / "app" / "static" / "img"


@pytest.mark.criterion(38, "The art is reproducible")
@pytest.mark.criterion(46, "The art stays reproducible")
@pytest.mark.criterion(45, "The art stays reproducible")
@pytest.mark.parametrize("name", sorted(build.scenes()))
def test_the_committed_image_is_what_its_script_draws(name):
    drawn = build.scenes()[name]()
    width, height, rows = png.decode((IMG / name).read_bytes())
    assert (width, height) == (drawn.width, drawn.height), f"{name}: run `python -m art.build`"
    assert rows == drawn.rows, f"app/static/img/{name} is stale: run `python -m art.build`"


def test_nothing_in_img_is_unaccounted_for():
    assert {p.name for p in IMG.glob("*.png")} == set(build.scenes())


def test_the_png_codec_round_trips():
    rows = [[(1, 2, 3, 255), (0, 0, 0, 0)], [(255, 255, 255, 128), (9, 8, 7, 6)]]
    assert png.decode(png.encode(2, 2, rows)) == (2, 2, rows)


def test_every_cast_avatar_is_drawn():
    from typing import get_args

    from app.content.schema import Avatar

    assert {f"avatar-{a}.png" for a in get_args(Avatar)} <= set(build.scenes())
