"""The AI spend ledger and the monthly budget (#120). Non-negotiable #7.

Every model call goes through `run()`, which refuses before calling when there is
no key or this month's spend has reached AI_MONTHLY_BUDGET_CENTS, and records
what the call cost after it. The check comes before the call and the cost is
known only after, so one call can overrun the cap by at most its own cost
(a hint is about 0.05 cents). That is accepted.

The budget is the app's, not a learner's: one key, one bill. So the month's
spend is summed over every row, the one place a query here isn't scoped to a
user. A month is a calendar month in APP_TIMEZONE, like a streak's day.

The ledger row is written in its own session and committed at once: money spent
stays spent even if the feature's own transaction later rolls back.
"""

import logging
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import ai
from app.config import get_settings
from app.db import SessionLocal
from app.models import AiRequest

log = logging.getLogger("orbit.ai")

_MICROCENTS_PER_CENT = 1_000_000


def _now() -> datetime:
    return datetime.now(UTC)  # a seam: tests pin the clock here


def month_bounds(now: datetime) -> tuple[datetime, datetime]:
    """The calendar month containing `now`, in APP_TIMEZONE, as [start, end)."""
    local = now.astimezone(get_settings().tz)
    start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
    return start, end


def spent_this_month(db: Session, now: datetime | None = None) -> int:
    """Microcents spent on AI in `now`'s month, by everyone (see the module docstring)."""
    start, end = month_bounds(now or _now())
    total = db.scalar(
        select(func.coalesce(func.sum(AiRequest.cost_microcents), 0)).where(
            AiRequest.created_at >= start, AiRequest.created_at < end
        )
    )
    return int(total)


def budget_microcents() -> int:
    return get_settings().ai_monthly_budget_cents * _MICROCENTS_PER_CENT


def uplink_online(db: Session, now: datetime | None = None) -> bool:
    """Whether an AI feature would be allowed to call right now: the readout's UPLINK."""
    return bool(get_settings().anthropic_api_key) and spent_this_month(db, now) < budget_microcents()


def record(user_id: int | None, purpose: ai.Purpose, model: str, usage: ai.Usage, now: datetime | None = None) -> AiRequest:
    """Write one ledger row, committed in a session of its own."""
    row = AiRequest(
        user_id=user_id,
        purpose=purpose,
        model=model,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_read_tokens=usage.cache_read_tokens,
        cache_write_tokens=usage.cache_write_tokens,
        cost_microcents=ai.cost_microcents(model, usage),
    )
    if now is not None:
        row.created_at = now
    with SessionLocal() as db:
        db.add(row)
        db.commit()
    return row


def run(user_id: int | None, purpose: ai.Purpose, call: Callable, *, now: datetime | None = None):
    """Make one budget-checked, recorded model call. `call(client, model)` is the
    feature's seam in app/ai.py and returns the SDK's Message. Raises
    AIUnavailable("no_key" | "over_budget" | "error"); returns the Message."""
    import anthropic  # pinned; app.ai.client() has already turned its absence into AIUnavailable

    settings = get_settings()
    client = ai.client(settings.anthropic_api_key)  # AIUnavailable("no_key") first: no query needed
    with SessionLocal() as db:
        if spent_this_month(db, now) >= budget_microcents():
            raise ai.AIUnavailable("over_budget")
    model = ai.MODELS[purpose]
    try:
        response = call(client, model)
    except anthropic.APIError as exc:
        # Never the prompt or the reply: they can hold a learner's work.
        log.warning("AI %s call failed: %s (request %s)", purpose, type(exc).__name__, getattr(exc, "request_id", None))
        raise ai.AIUnavailable("error") from exc
    record(user_id, purpose, getattr(response, "model", None) or model, ai.Usage.of(response.usage), now)
    return response
