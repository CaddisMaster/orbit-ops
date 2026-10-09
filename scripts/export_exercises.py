"""Write every terminal exercise, with its reference solution, to the fixture
the console's JavaScript tests run (tests/js/fixtures/exercises.json).

    docker compose exec web python -m scripts.export_exercises

Run it after changing any `terminal:` block. tests/test_terminal.py fails if
the committed fixture no longer matches the content, so CI catches a stale
one. Node can't read the YAML itself (no dependencies on that side), which is
why this file exists.
"""

import json
import sys
from pathlib import Path

from app.content import load_catalog
from app.terminal import client_spec

FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "js" / "fixtures" / "exercises.json"


def render() -> str:
    catalog = load_catalog()
    exercises = {
        m.slug: {"source": m.source, "spec": client_spec(m.terminal), "solution": list(m.terminal.solution)}
        for m in catalog.ordered_modules()
        if m.terminal
    }
    return json.dumps(exercises, indent=1, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(render())
    print(f"wrote {FIXTURE.relative_to(Path.cwd()) if FIXTURE.is_relative_to(Path.cwd()) else FIXTURE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
