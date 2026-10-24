"""Labs (#121)."""

import re
from typing import Annotated

from pydantic import ConfigDict, Field, model_validator

from .base import Slug, Text, _Strict

# ---------------------------------------------------------------------------
# Labs (#121): work done on the learner's own machine (real git, later Docker
# and a cluster), never on the server. The learner pastes what it printed and
# the server checks the text. Checks never compare hashes, dates or names that
# differ between machines, which is why there is no exact-match check.
# ---------------------------------------------------------------------------
MAX_PASTE = 20_000  # characters per box; app/lab.py refuses more without recording


class _LabCheck(_Strict):
    says: Text  # what it checks, in words: listed after a submit, passed or not
    hint: Text | None = None  # shown when it fails: "did the merge fast-forward?"


class ContainsLabCheck(_LabCheck):
    contains: Text  # this text appears somewhere (case-sensitive)


class NotContainsLabCheck(_LabCheck):
    not_contains: Text  # this text appears nowhere


class RegexLabCheck(_LabCheck):
    regex: Text  # Python `re`, MULTILINE: ^ and $ match at each line

    @model_validator(mode="after")
    def _compiles(self):
        try:
            re.compile(self.regex, re.MULTILINE)
        except re.error as exc:
            raise ValueError(f"regex {self.regex!r} does not compile: {exc}") from exc
        return self


class LineCount(_Strict):
    min: Annotated[int, Field(ge=0)] | None = None
    max: Annotated[int, Field(ge=1)] | None = None

    @model_validator(mode="after")
    def _a_bound(self):
        if self.min is None and self.max is None:
            raise ValueError("lines needs min, max or both")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("lines: min is more than max")
        return self


class LinesLabCheck(_LabCheck):
    lines: LineCount  # how many non-blank lines the paste has


LabCheck = ContainsLabCheck | NotContainsLabCheck | RegexLabCheck | LinesLabCheck


class LabBox(_Strict):
    prompt: Text  # what to paste (Markdown): "The output of `git log --oneline`"
    checks: Annotated[list[LabCheck], Field(min_length=1, max_length=10)]
    # A paste that passes every check, from a real run. CI holds it to the checks
    # (tests/test_lab.py); it's never sent to the browser, like quiz answers.
    example: Annotated[str, Field(min_length=1, max_length=MAX_PASTE)]


class Lab(_Strict):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    from_: Slug | None = Field(default=None, alias="from")  # the cast member asking
    task: Text  # what to do, on your own machine (Markdown)
    setup: Text | None = None  # a shell snippet that builds a known starting point, shown to copy
    boxes: Annotated[list[LabBox], Field(min_length=1, max_length=4)]
    success: Text = "Okafor's voice crackles over the comm: \"Logged. Good work, cadet.\""
    # Claude reviews a passed lab against the rubric (#122): feedback and a bonus,
    # never the verdict, which stays the checks'. Each rubric line is one thing
    # good work does ("Each subject says what the commit does, in the imperative").
    ai_review: bool = False
    rubric: Annotated[list[Text], Field(max_length=8)] = []

    @model_validator(mode="after")
    def _review_has_a_rubric(self):
        if self.ai_review and not self.rubric:
            raise ValueError("ai_review needs a rubric: what good work looks like, a line per point")
        if self.rubric and not self.ai_review:
            raise ValueError("rubric is only read when ai_review is true")
        return self
