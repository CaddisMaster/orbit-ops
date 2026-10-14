"""The Life Support mystery (#84) is planned in docs/story.md before it's threaded:
the cause, and for each clue the unit, the module and the command that finds it."""

import re
from pathlib import Path

import pytest

from app.content import load_catalog

STORY = (Path(__file__).resolve().parents[1] / "docs" / "story.md").read_text()


def _clues() -> list[dict[str, str]]:
    table = STORY.split("## The clues, unit by unit", 1)[1]
    rows = [r for r in table.splitlines() if r.startswith("| ") and not r.startswith("| Unit") and "---" not in r]
    keys = ["unit", "module", "clue", "finds", "status"]
    return [dict(zip(keys, (c.strip() for c in re.split(r"(?<!\\)\|", r)[1:-1]), strict=True)) for r in rows]


@pytest.mark.criterion(84, "The mystery is written down before it's threaded")
def test_story_md_names_the_cause_and_every_clue():
    assert "## What happened" in STORY and "/etc/cron.d/scrubber-maint" in STORY
    clues = _clues()
    assert [c["unit"].split()[0] for c in clues] == ["1.1", "1.1", "1.2", "1.3", "1.4", "1.5"]
    for clue in clues:
        assert clue["module"] and clue["clue"], clue
        assert "`" in clue["finds"], f"{clue['unit']}: name the command that finds it"


def test_the_written_clues_name_real_modules():
    catalog = load_catalog()
    titles = {m.title for m in catalog.ordered_modules()}
    for clue in _clues():
        if clue["status"].startswith("written"):
            assert clue["module"].split(" ", 1)[1] in titles, clue["module"]


def test_the_stories_times_agree_with_the_content():
    catalog = load_catalog()
    assert "02:40 scrubber B: offline" in str(catalog.modules["the-filesystem"].terminal.files)
    assert "35 2 * * *" in str(catalog.modules["scheduling-with-cron"].terminal.files)
    assert "02:35" in STORY and "02:40" in STORY
