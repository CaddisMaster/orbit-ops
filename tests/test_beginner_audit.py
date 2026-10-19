"""The /beginner-audit skill (#217): read-only, and part of the content workflow.

What it finds can only be shown by running it, so the PR that added it records a
run on module 07 as it was before #216 (`Verified by hand:`). These hold the
definition and the workflow to what #217 promised."""

import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / ".claude" / "skills" / "beginner-audit" / "SKILL.md"


def _skill() -> tuple[dict, str]:
    _, front, body = SKILL.read_text().split("---\n", 2)
    return yaml.safe_load(front), body


@pytest.mark.criterion(217, "The skill exists and is part of the module checklist")
def test_the_skill_runs_after_the_content_reviewer():
    front, _ = _skill()
    assert front["name"] == "beginner-audit"
    doc = (ROOT / "docs" / "content-authoring.md").read_text()
    section = doc.split("## Before Sean plays it", 1)[1].split("\n## ", 1)[0]
    names = [s for _, s in re.findall(r"^(\d)\. \*\*(.+?)\*\*", section, re.M)]
    reviewer = next(i for i, s in enumerate(names) if "content-reviewer" in s)
    audit = next(i for i, s in enumerate(names) if "/beginner-audit" in s)
    pr = next(i for i, s in enumerate(names) if "PR" in s)
    assert reviewer < audit < pr, names
    assert "/beginner-audit" in (ROOT / ".github" / "pull_request_template.md").read_text()


def test_the_skill_is_read_only_and_reads_with_fresh_eyes():
    """A forked context, so the session that wrote the module isn't the one reading it."""
    front, body = _skill()
    assert front["context"] == "fork"
    tools = [t.strip() for t in front["allowed-tools"].split(",")]
    assert not {"Edit", "Write", "NotebookEdit", "MultiEdit", "Agent"} & set(tools)
    assert all(t in {"Read", "Grep", "Glob"} or t.startswith("Bash(git ") for t in tools), tools
    assert "Never edit a file, never commit, never file the issue yourself" in " ".join(body.split())
    # Quoted in the file: unquoted, YAML reads " #217" as a comment and cuts the description short.
    assert front["description"].rstrip().endswith(".") and "Read-only" in front["description"]


def test_the_skill_does_not_count_code_comments_or_try_it_as_teaching():
    _, body = _skill()
    flat = " ".join(body.split())
    for place in ("a code block or a comment inside one", "an `explain`", "the Try it section"):
        assert place in flat, place


def test_the_skill_checks_that_what_is_drilled_is_typed():
    """Its first two runs on old module 07 missed `tee`: a card, but never typed. The
    practice table only got done once it was part of the output."""
    _, body = _skill()
    assert "| Section | Typed in the task | Typed in Try it | Quiz | Cards |" in body
    assert "taught but never practised" in body
