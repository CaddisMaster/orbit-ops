"""Hints (#123): a nudge from Claude that points the way without giving the answer.

Two walls keep the answer out of a hint:

1. **The model never sees the answer key.** context() builds the prompt from what the
   learner can already see: the lesson, the question and its options, the task, the
   check descriptions shown after a failed submit, and their own attempt. Never a quiz
   `answer` or `explain`, a console task's `checks` or `solution`, a challenge's check
   code or `solution`, or a lab's `example`.
2. **The reply is checked anyway.** secrets() lists what would give a task away (an
   accepted fill-in, the right option's text, a line of a reference solution), and a
   reply containing one is replaced by a pointer back to the lesson.

A hint costs 5 XP, once per item (a negative `hint` award), however many are asked;
a replaced one is free. One item allows one hint a minute. It runs on Haiku 5.5 through spend.run, so no
key or no budget turns hints off.

An item is "quiz-<index>", "console", "challenge" or "lab".
"""

import html
import logging
import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app import ai, spend
from app.content import Module
from app.content.schema import ChoiceQuestion, FillQuestion, MultiQuestion
from app.game import xp
from app.security import RateLimiter

log = logging.getLogger("orbit.ai")

COST = 5  # XP, once per item
MAX_WORDS = 80
MAX_ATTEMPT = 4000  # characters of the learner's attempt sent with a hint
_MIN_SECRET = 6  # a solution line shorter than this ("ls", "cd ..") is too common to guard
LEAKED = (
    "That hint gave too much away, so here's a pointer instead: find the part of the lesson this "
    "is about and read it again slowly. The answer is in it."
)

# One hint per item per minute, per learner. In-process, like the login limiter:
# correct only with one uvicorn process (docs/gotchas.md).
limiter = RateLimiter(limit=1, window_seconds=60.0)

def item_kind(module: Module, item: str) -> str | None:
    """What an item names, or None if this module has no such thing."""
    if m := re.fullmatch(r"quiz-(\d+)", item):
        return "quiz" if int(m.group(1)) < len(module.quiz) else None
    present = {"console": module.terminal, "challenge": module.challenge, "lab": module.lab}
    return item if present.get(item) else None


def _plain(markup: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", markup))


def _norm(text: str) -> str:
    return " ".join(text.replace("`", "").lower().split())


def context(module: Module, item: str, attempt: str) -> str:
    """The user turn: lesson, task and attempt, never the answer key (wall 1)."""
    lesson = _plain(module.body_html)[:12_000]
    parts = [f"<module>{module.title}</module>", f"<lesson>\n{' '.join(lesson.split())}\n</lesson>"]
    if item.startswith("quiz-"):
        q = module.quiz[int(item.removeprefix("quiz-"))]
        task = [f"Quiz question: {q.q}"]
        if q.code:
            task.append(f"With this {q.lang}:\n{q.code}")
        if isinstance(q, ChoiceQuestion | MultiQuestion):
            task.append(("Pick one" if isinstance(q, ChoiceQuestion) else "Pick all that apply") + " of these options:")
            task += [f"- {o}" for o in q.options]
        else:
            task.append("The answer is typed in.")
        parts.append("<task>\n" + "\n".join(task) + "\n</task>")
    elif item == "console":
        parts.append(f"<task>\nIn a terminal: {module.terminal.task}\n</task>")
    elif item == "challenge":
        says = "\n".join(f"- {c.says}" for c in module.challenge.checks)
        parts.append(f"<task>\nIn Python: {module.challenge.task}\nThe code is checked for:\n{says}\nIt started from:\n{module.challenge.starter}\n</task>")
    elif item == "lab":
        boxes = "\n".join(f"- {b.prompt} (checked for: {', '.join(c.says for c in b.checks)})" for b in module.lab.boxes)
        parts.append(f"<task>\nOn their own machine: {module.lab.task}\nThen they paste:\n{boxes}\n</task>")
    if attempt.strip():
        parts.append(f"<attempt>\n{attempt[:MAX_ATTEMPT]}\n</attempt>")
    else:
        parts.append("<attempt>(nothing yet)</attempt>")
    return "\n\n".join(parts)


def secrets(module: Module, item: str) -> list[str]:
    """What a hint must not contain for this item (wall 2), normalised."""
    out: list[str] = []
    if item.startswith("quiz-"):
        q = module.quiz[int(item.removeprefix("quiz-"))]
        match q:
            case FillQuestion(answer=accepted):
                out = list(accepted)
            case ChoiceQuestion(answer=i, options=options):
                out = [options[i]]
            case MultiQuestion(answer=right, options=options):
                out = [options[i] for i in right]
    elif item == "console":
        out = list(module.terminal.solution)
    elif item == "challenge":
        starter = {_norm(line) for line in module.challenge.starter.splitlines()}
        out = [line for line in module.challenge.solution.splitlines() if _norm(line) not in starter]
    # A lab's "answer" is doing it on your own machine: nothing in its spec is secret,
    # and its `example` never reaches the prompt (wall 1).
    normed = [_norm(s) for s in out]
    if item.startswith("quiz-"):
        return [s for s in normed if s]  # an option or a fill is secret however short
    return [s for s in normed if len(s.replace(" ", "")) >= _MIN_SECRET]


def leaks(reply: str, guarded: list[str]) -> bool:
    text = _norm(reply)
    for secret in guarded:
        # Whole words: the option "ls" must not trip on "else", but "chmod 600" in any spacing should.
        if re.search(r"(?<![a-z0-9])" + re.escape(secret) + r"(?![a-z0-9])", text):
            return True
    return False


def trim(reply: str) -> str:
    """Plain text, at most MAX_WORDS words."""
    words = reply.split()
    return " ".join(words[:MAX_WORDS]) + (" …" if len(words) > MAX_WORDS else "")


@dataclass(frozen=True)
class HintOutcome:
    text: str | None = None  # the hint, or LEAKED's pointer
    leaked: bool = False
    unavailable: str | None = None  # "no_key", "over_budget" or "error"
    wait: bool = False  # rate-limited: no call made
    charged: int = 0  # XP taken by this hint: COST the first time for an item, else 0


def ask(db: Session, user_id: int, module: Module, item: str, attempt: str) -> HintOutcome:
    """One hint for one item. The caller has checked the item exists and commits."""
    if not limiter.hit(f"{user_id}:{module.slug}:{item}"):
        return HintOutcome(wait=True)
    prompt = context(module, item, attempt)
    try:
        response = spend.run(user_id, "hint", lambda client, model: _call(client, model, prompt))
    except ai.AIUnavailable as exc:
        return HintOutcome(unavailable=exc.reason)
    text = "".join(b.text for b in response.content if getattr(b, "type", None) == "text").strip()
    if response.stop_reason == "refusal" or not text:
        log.warning("AI hint for %s/%s ended with %s", module.slug, item, response.stop_reason)
        return HintOutcome(unavailable="error")
    if leaks(text, secrets(module, item)):
        # Replaced, and free: a pointer back to the lesson isn't worth 5 XP.
        log.warning("AI hint for %s/%s leaked an answer and was replaced", module.slug, item)
        return HintOutcome(text=LEAKED, leaked=True)
    charged = -xp.award(db, user_id, xp.Award(-COST, "hint", f"{module.slug}/{item}"))
    return HintOutcome(text=trim(text), charged=charged)


def _call(client, model, prompt):
    return ai._call_hint_model(client, model, prompt=prompt)
