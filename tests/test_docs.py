"""The docs every session reads stay short enough to read (#259)."""

import re
from pathlib import Path

import pytest

DOCS = Path(__file__).resolve().parent.parent / "docs"


@pytest.mark.criterion(259, "The status doc is short enough to read at session start")
def test_status_holds_three_sessions_and_stays_short():
    status = (DOCS / "status.md").read_text()
    assert "## Standing decisions" in status and "## Release ledger" in status
    assert len(re.findall(r"(?m)^### ", status.split("## Sessions", 1)[1])) <= 3
    assert len(status.splitlines()) < 300


@pytest.mark.criterion(259, "Old sessions are kept, not lost")
def test_old_sessions_are_in_the_archive():
    archive = (DOCS / "status-archive.md").read_text()
    assert "### 2026-10-08 — project bootstrap" in archive  # the first session ever recorded
    assert "status-archive.md" in (DOCS / "status.md").read_text()


@pytest.mark.criterion(259, "The architecture table is scannable")
def test_architecture_rows_are_one_short_line():
    text = (DOCS / "architecture.md").read_text()
    table = text.split("| Module | Responsibility |", 1)[1].split("\n\n", 1)[0]
    rows = [line for line in table.splitlines() if line.startswith("| `")]
    assert rows and all(len(row) < 200 for row in rows), max(rows, key=len)


@pytest.mark.criterion(259, "The wrap keeps it short")
def test_the_wrap_moves_old_sessions_to_the_archive():
    wrap = (DOCS.parent / ".claude" / "commands" / "wrap.md").read_text()
    assert "docs/status-archive.md" in wrap and "Keep three sessions" in wrap
