"""Labs (#121): work done on the learner's own machine, checked by what they paste.

The server never runs anything a lab asks for. It only reads the pasted text,
the way a reviewer reads a terminal transcript: does it contain the merge
commit, does the status say the tree is clean. So the verdict is the server's,
unlike a challenge's, but it can only be as honest as the paste. That's fine
for a learning app: faking a paste is more work than doing the lab.

Checks are written so that a real run on any machine passes: they never compare
hashes, dates or names that differ between machines (docs/content-authoring.md).

A lab with `ai_review` also gets Claude's review once it passes (#122): feedback
against the author's rubric and a bonus of up to REVIEW_XP_MAX, never the verdict.
"""

import logging
import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import ai, spend
from app.content import Module
from app.content.schema import (
    MAX_PASTE,
    ContainsLabCheck,
    Lab,
    LabCheck,
    LinesLabCheck,
    NotContainsLabCheck,
    RegexLabCheck,
)
from app.game import xp
from app.models import ExerciseAttempt

log = logging.getLogger("orbit.ai")

XP = 40  # for a module's lab, the first time it passes (docs/roadmap.md §4)
REVIEW_XP_MAX = 20  # Claude's review adds up to this, once (#122)


def normalise(paste: str) -> str:
    """Line endings as Unix writes them: a paste from Windows Terminal brings \\r\\n."""
    return paste.replace("\r\n", "\n").replace("\r", "\n")


def check(rule: LabCheck, text: str) -> bool:
    match rule:
        case ContainsLabCheck(contains=needle):
            return needle in text
        case NotContainsLabCheck(not_contains=needle):
            return needle not in text
        case RegexLabCheck(regex=pattern):
            return re.search(pattern, text, re.MULTILINE) is not None
        case LinesLabCheck(lines=count):
            n = sum(1 for line in text.split("\n") if line.strip())
            return (count.min is None or n >= count.min) and (count.max is None or n <= count.max)
    raise TypeError(rule)


@dataclass(frozen=True)
class Verdict:
    results: tuple[tuple[bool, ...], ...]  # per box, per check

    @property
    def passed(self) -> bool:
        return all(all(box) for box in self.results)


def grade(lab: Lab, pastes: list[str]) -> Verdict:
    """Every check of every box against its paste. A missing box is an empty paste."""
    pastes = [normalise(p) for p in pastes] + [""] * (len(lab.boxes) - len(pastes))
    return Verdict(tuple(tuple(check(c, paste) for c in box.checks) for box, paste in zip(lab.boxes, pastes, strict=False)))


def too_long(pastes: list[str]) -> bool:
    return any(len(p) > MAX_PASTE for p in pastes)


# ---------------------------------------------------------------------------
# Persistence — every query is scoped to the user passed in. The caller commits.
# ---------------------------------------------------------------------------


def record(db: Session, user_id: int, module: Module, pastes: list[str], verdict: Verdict) -> ExerciseAttempt:
    attempt = ExerciseAttempt(
        user_id=user_id,
        module_slug=module.slug,
        kind="lab",
        item=0,
        submitted={"boxes": pastes, "results": [list(box) for box in verdict.results]},
        correct=verdict.passed,
    )
    db.add(attempt)
    return attempt


def passed_slugs(db: Session, user_id: int) -> set[str]:
    """Modules whose lab this learner has passed."""
    rows = db.scalars(
        select(ExerciseAttempt.module_slug)
        .where(ExerciseAttempt.user_id == user_id, ExerciseAttempt.kind == "lab", ExerciseAttempt.correct)
        .distinct()
    )
    return set(rows)


@dataclass(frozen=True)
class LabState:
    """What the lab section shows on a page load: the last pastes and their results."""

    pastes: tuple[str, ...]
    verdict: Verdict | None
    passed: bool  # ever, not just the last attempt
    review: dict | None = None  # Claude's review, once one has been written (#122)


def state(db: Session, user_id: int, module: Module) -> LabState:
    attempts = list(
        db.scalars(
            select(ExerciseAttempt)
            .where(ExerciseAttempt.user_id == user_id, ExerciseAttempt.module_slug == module.slug, ExerciseAttempt.kind == "lab")
            .order_by(ExerciseAttempt.id)
        )
    )
    if not attempts:
        return LabState(pastes=("",) * len(module.lab.boxes), verdict=None, passed=False)
    last = attempts[-1]
    pastes = list(last.submitted["boxes"])[: len(module.lab.boxes)]
    pastes += [""] * (len(module.lab.boxes) - len(pastes))
    # Regraded, not read back: if the module's checks changed since, the page shows today's verdict.
    return LabState(
        pastes=tuple(pastes),
        verdict=grade(module.lab, pastes),
        passed=any(a.correct for a in attempts),
        review=next((a.review for a in reversed(attempts) if a.review), None),
    )


# ---------------------------------------------------------------------------
# Claude's review of a passed lab (#122)
# ---------------------------------------------------------------------------


def review_xp(score: int) -> int:
    """round(score / 5): 100 earns REVIEW_XP_MAX, 80 earns 16."""
    return min(REVIEW_XP_MAX, round(score / 5))


@dataclass(frozen=True)
class ReviewOutcome:
    review: dict | None  # the stored review, new or from before
    unavailable: str | None = None  # AIUnavailable's reason: "no_key", "over_budget" or "error"
    xp_gained: int = 0


def review(db: Session, user_id: int, module: Module) -> ReviewOutcome:
    """Review this learner's passed lab, once. The latest passing attempt is locked
    for the call, so a double request waits, then finds the review written: one
    model call, one bonus. The caller commits."""
    target = db.scalar(
        select(ExerciseAttempt)
        .where(
            ExerciseAttempt.user_id == user_id,
            ExerciseAttempt.module_slug == module.slug,
            ExerciseAttempt.kind == "lab",
            ExerciseAttempt.correct,
        )
        .order_by(ExerciseAttempt.id.desc())
        .limit(1)
        .with_for_update()
    )
    if target is None:
        return ReviewOutcome(review=None)
    done = db.scalar(
        select(ExerciseAttempt.review)
        .where(
            ExerciseAttempt.user_id == user_id,
            ExerciseAttempt.module_slug == module.slug,
            ExerciseAttempt.kind == "lab",
            ExerciseAttempt.review.is_not(None),
        )
        .limit(1)
    )
    if done is not None:
        return ReviewOutcome(review=done)

    pastes = list(target.submitted["boxes"])
    boxes = [(box.prompt, paste) for box, paste in zip(module.lab.boxes, pastes, strict=False)]
    prompt = ai.lab_review_prompt(module.lab.task, boxes, list(module.lab.rubric))
    try:
        response = spend.run(user_id, "lab_review", lambda client, model: ai._call_lab_review_model(client, model, prompt=prompt))
    except ai.AIUnavailable as exc:
        return ReviewOutcome(review=None, unavailable=exc.reason)
    if response.stop_reason == "refusal" or response.parsed_output is None:
        # Billed and recorded by spend.run, but nothing to show: say unavailable, never why.
        log.warning("AI lab_review of %s ended with %s", module.slug, response.stop_reason)
        return ReviewOutcome(review=None, unavailable="error")

    target.review = ai.clean_review(response.parsed_output)
    bonus = review_xp(target.review["score"])
    gained = xp.award(db, user_id, xp.Award(bonus, "lab_review", module.slug)) if bonus else 0
    return ReviewOutcome(review=target.review, xp_gained=gained)
