"""The content-reviewer agent (#124): read-only, and part of the content workflow.

What it finds can only be shown by running it, so the PR that added it records a
run on a planted module (`Verified by hand:`). These hold the definition and the
workflow to what #124 promised."""

import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent
AGENT = ROOT / ".claude" / "agents" / "content-reviewer.md"


def _agent() -> tuple[dict, str]:
    _, front, body = AGENT.read_text().split("---\n", 2)
    return yaml.safe_load(front), body


@pytest.mark.criterion(124, "The reviewer is read-only")
def test_the_reviewer_is_read_only():
    front, body = _agent()
    tools = {t.strip() for t in front["tools"].split(",")}
    assert tools == {"Read", "Grep", "Glob", "Bash"}
    assert not tools & {"Edit", "Write", "NotebookEdit", "MultiEdit", "Agent"}
    assert "**Never edit a file, never commit or push" in body
    # Quoted in the file: unquoted, YAML reads " #101" as a comment and cuts the description short.
    assert "the #101 rule" in front["description"] and "Read-only" in front["description"]


@pytest.mark.criterion(124, "The reviewer is part of the content workflow")
def test_the_reviewer_is_part_of_the_content_workflow():
    doc = (ROOT / "docs" / "content-authoring.md").read_text()
    section = doc.split("## Before Sean plays it", 1)[1].split("\n## ", 1)[0]
    steps = re.findall(r"^(\d)\. \*\*(.+?)\*\*", section, re.M)
    names = [s for _, s in steps]
    reviewer = next(i for i, s in enumerate(names) if "content-reviewer" in s)
    try_it = next(i for i, s in enumerate(names) if "Try it" in s)
    pr = next(i for i, s in enumerate(names) if "PR" in s)
    assert reviewer < try_it < pr, names
    assert "content-reviewer" in (ROOT / ".github" / "pull_request_template.md").read_text()


def test_the_reviewer_checks_labs_for_the_101_rule():
    """No test parses a lab's steps, so the agent is the #101 check for labs."""
    _, body = _agent()
    flat = " ".join(body.split())
    assert "**Lab: its `task` steps and `setup`.** No test checks a lab" in flat
    assert "a comment inside a code block" in flat and "the Try it section" in flat


@pytest.mark.parametrize("agent", sorted((ROOT / ".claude" / "agents").glob("*.md")), ids=lambda p: p.stem)
def test_every_agents_description_survives_yaml(agent):
    """An unquoted " #" starts a YAML comment: content-reviewer's description was cut
    at "the" before "#101 rule" until it was quoted. Each description ends a sentence."""
    _, front, _ = agent.read_text().split("---\n", 2)
    description = yaml.safe_load(front)["description"]
    assert description.rstrip().endswith("."), f"{agent.name}: description ends {description[-30:]!r}"
