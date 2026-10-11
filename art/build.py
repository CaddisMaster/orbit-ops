"""Write every scene and sprite to app/static/img/.

    python -m art.build            (or: docker compose exec web python -m art.build)
"""

import sys
from pathlib import Path

from art import room, sprites

OUT = Path(__file__).resolve().parents[1] / "app" / "static" / "img"


def scenes():
    """{file name: render function}: everything build() writes and tests check."""
    out = {
        "room.png": room.render,
        "laptop-deck.png": room.deck,
        "laptop-lid.png": room.lid,
        "laptop-closed.png": room.closed,
        "shuttle.png": sprites.shuttle,
        "satellite.png": sprites.satellite,
        "debris.png": sprites.debris,
        "aurora.png": sprites.aurora,
    }
    for name in sprites.AVATARS:
        out[f"avatar-{name}.png"] = lambda name=name: sprites.avatar(name)
    return out


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, render in scenes().items():
        (OUT / name).write_bytes(render().to_png())
        print(f"wrote app/static/img/{name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
