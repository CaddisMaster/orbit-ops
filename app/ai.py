"""Every model call the app makes goes through here (#120), after Budget Buddy's ai.py.

This module is pure: which model each purpose uses, what a call costs, and how
to build a client. It never touches the database and is never handed a user id.
The ledger and the monthly budget are app/spend.py, and every call goes through
`spend.run()`, which checks the budget first (non-negotiable #7).

Each feature adds its own `_call_*_model()` seam here (hints #123, lab review
#122), so a test monkeypatches one function per feature. A
missing key, a missing package or any API error becomes `AIUnavailable`, and the
page says "offline" rather than erroring (non-negotiable #2).

Only the running app calls the API, for what has to happen while a learner
studies with no Claude Code session open. Lessons are written in those sessions,
never through this key (#124 dropped `draft_module.py`, 2026-10-12).
"""

import math
from dataclasses import dataclass
from typing import Literal

Purpose = Literal["hint", "lab_review"]

# One model per purpose (Sean, 2026-10-12): cheapest where it's called most.
MODELS: dict[str, str] = {
    "hint": "claude-haiku-5-5",
    "lab_review": "claude-sonnet-5-5",
}


@dataclass(frozen=True)
class Price:
    """US dollars per million tokens. Cache writes are 1.25x input (the 5-minute TTL)."""

    input: float
    output: float
    cache_read: float

    @property
    def cache_write(self) -> float:
        return self.input * 1.25


# Anthropic's first-party prices, checked 2026-10-12. Haiku 5.5's rise above a
# 100K-token prompt; its cache reads are the standard 0.1x of input.
PRICES: dict[str, Price] = {
    "claude-haiku-5-5": Price(input=0.10, output=0.50, cache_read=0.01),
    "claude-sonnet-5-5": Price(input=2.00, output=10.00, cache_read=0.20),
    # No purpose uses Opus. It's here as the price an unknown model is charged at.
    "claude-opus-5-5": Price(input=4.00, output=20.00, cache_read=0.20),
}
_HAIKU_LONG = Price(input=0.50, output=2.50, cache_read=0.05)
_HAIKU_LONG_ABOVE = 100_000

# Microcents (a millionth of a cent) per (dollar per million tokens) per token:
# $1/MTok = 100 cents / 1e6 tokens = 100 microcents per token.
_MICROCENTS_PER_DOLLAR_PER_MTOK = 100


class AIUnavailable(Exception):
    """No model call happened, or none came back. `reason` says why, for the page:
    "no_key", "over_budget" or "error". Callers degrade; they never show it raw."""

    def __init__(self, reason: Literal["no_key", "over_budget", "error"]):
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class Usage:
    """What a response's `usage` reports, normalised (the SDK's cache fields can be None)."""

    input_tokens: int
    output_tokens: int
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    @classmethod
    def of(cls, usage) -> Usage:
        return cls(
            input_tokens=usage.input_tokens or 0,
            output_tokens=usage.output_tokens or 0,
            cache_read_tokens=getattr(usage, "cache_read_input_tokens", None) or 0,
            cache_write_tokens=getattr(usage, "cache_creation_input_tokens", None) or 0,
        )


def cost_microcents(model: str, usage: Usage) -> int:
    """What a call cost, rounded up to a whole microcent. An unknown model is
    charged at Opus's prices rather than nothing: overestimating spend only
    turns AI off early, underestimating it breaks the cap."""
    price = PRICES.get(model, PRICES["claude-opus-5-5"])
    prompt = usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens
    if model == "claude-haiku-5-5" and prompt > _HAIKU_LONG_ABOVE:
        price = _HAIKU_LONG
    dollars_per_mtok_tokens = (
        usage.input_tokens * price.input
        + usage.output_tokens * price.output
        + usage.cache_read_tokens * price.cache_read
        + usage.cache_write_tokens * price.cache_write
    )
    return math.ceil(round(dollars_per_mtok_tokens * _MICROCENTS_PER_DOLLAR_PER_MTOK, 6))


def client(api_key: str):
    """An Anthropic client, or AIUnavailable("no_key"). Imported here so a broken
    or missing package costs the AI features, never the app's startup."""
    if not api_key:
        raise AIUnavailable("no_key")
    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover - it's pinned in requirements.txt
        raise AIUnavailable("error") from exc
    # A learner is waiting on the page: fail in seconds, not the SDK's 10 minutes.
    return anthropic.Anthropic(api_key=api_key, timeout=30.0, max_retries=1)
