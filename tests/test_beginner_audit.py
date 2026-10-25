"""The /beginner-audit skill's output is filed as an issue as it comes (#248)."""

import re
from pathlib import Path

import pytest

from scripts.check_criteria import extract_criteria

SKILL = Path(__file__).resolve().parents[1] / ".claude/skills/beginner-audit/SKILL.md"
NUMBERED = re.compile(r"\(\d+(?:,\s*\d+)*\)\s*$")  # "… (1)", "… (2, 3)"


def template_criteria():
    """The skill's "## Acceptance criteria" template, from the heading to the end of its Gherkin."""
    text = SKILL.read_text()
    section = text[text.index("## Acceptance criteria\n```gherkin") :]
    return section[: section.index("\n```\n") + 5]


@pytest.mark.criterion(248, "The audit's scenario titles carry no finding numbers")
def test_the_audit_says_scenario_titles_carry_no_finding_numbers():
    text = SKILL.read_text()
    assert "Scenario titles are plain sentences, with no finding numbers" in text
    scenarios = [line for line in template_criteria().splitlines() if line.lstrip().startswith("Scenario:")]
    assert scenarios and not [s for s in scenarios if NUMBERED.search(s)]


def test_a_covers_comment_under_a_scenario_keeps_the_criteria_readable():
    body = template_criteria().replace("<one per finding", "Plain title one <one per finding") + "\n"
    body += "\n## Does this touch\n- Lesson content only\n"
    titles = extract_criteria(body)
    assert len(titles) == 1 and titles[0].startswith("Plain title one")
    assert "# covers 1, 3" in body  # the comment is there, and didn't end the section
