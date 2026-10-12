"""The AI foundation (#120): what a call costs, the ledger, and the monthly budget.

No test reaches Anthropic. A feature's seam is played by a function that returns
a stand-in Message, or raises the SDK's own error. The budget is the app's
(summed over every user), so tests running in parallel would see each other's
spend: each test works in a past year of its own, through `now` / `spend._now`,
and clears that year afterwards.
"""

import logging
from datetime import UTC, datetime
from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from sqlalchemy import delete, select

from app import ai, spend
from app.config import get_settings
from app.db import SessionLocal
from app.models import AiRequest

BUDGET_MICROCENTS = 500 * 1_000_000


def _at(year: int, month: int = 6, day: int = 15, hour: int = 12) -> datetime:
    return datetime(year, month, day, hour, tzinfo=UTC)


@pytest.fixture
def year(request):
    """A year no other test uses, cleared afterwards. Tests name theirs with @pytest.mark.parametrize."""
    y = request.param
    yield y
    with SessionLocal() as db:
        db.execute(delete(AiRequest).where(AiRequest.created_at >= _at(y - 1, 12, 1), AiRequest.created_at < _at(y + 1, 2, 1)))
        db.commit()


@pytest.fixture
def ai_on(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test-not-a-key")
    monkeypatch.setattr(settings, "ai_monthly_budget_cents", 500)
    monkeypatch.setattr(settings, "app_timezone", "UTC")


class Seam:
    """Plays a feature's `_call_*_model(client, model)`, remembering whether it was called."""

    def __init__(self, input_tokens=1000, output_tokens=200, error=None):
        self.calls: list[str] = []
        self.usage = SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens, cache_read_input_tokens=None, cache_creation_input_tokens=None)
        self.error = error

    def __call__(self, client, model):
        self.calls.append(model)
        if self.error:
            raise self.error
        return SimpleNamespace(model=model, usage=self.usage, content=[])


def _spend(user_id, cost, when):
    with SessionLocal() as db:
        db.add(AiRequest(user_id=user_id, purpose="hint", model="claude-haiku-5-5", input_tokens=0, output_tokens=0, cost_microcents=cost, created_at=when))
        db.commit()


def _rows(y):
    with SessionLocal() as db:
        return list(db.scalars(select(AiRequest).where(AiRequest.created_at >= _at(y, 1, 1, 0), AiRequest.created_at < _at(y + 1, 1, 1, 0))))


# --- what a call costs --------------------------------------------------------------
@pytest.mark.parametrize(
    ("model", "usage", "microcents"),
    [
        # 1000 x $0.10 + 200 x $0.50 per MTok = $0.0002 = 0.02 cents
        ("claude-haiku-5-5", ai.Usage(1000, 200), 20_000),
        ("claude-sonnet-5-5", ai.Usage(1000, 200), 400_000),
        ("claude-opus-5-5", ai.Usage(1000, 200), 800_000),
        # cache reads at $0.20, writes at 1.25 x $2.00
        ("claude-sonnet-5-5", ai.Usage(0, 0, cache_read_tokens=10_000, cache_write_tokens=1000), 200_000 + 250_000),
        # Haiku's long-prompt rate: $0.50 / $2.50 once the prompt passes 100K tokens
        ("claude-haiku-5-5", ai.Usage(100_001, 1000), 5_000_050 + 250_000),
        # an unknown model costs Opus prices, never nothing
        ("claude-mystery-9", ai.Usage(1000, 200), 800_000),
        # a fraction of a microcent rounds up
        ("claude-haiku-5-5", ai.Usage(1, 0), 10),
        ("claude-haiku-5-5", ai.Usage(0, 0, cache_read_tokens=1), 1),
    ],
)
def test_a_call_costs_what_anthropic_charges(model, usage, microcents):
    assert ai.cost_microcents(model, usage) == microcents


def test_usage_reads_the_sdk_shape_with_empty_cache_fields():
    usage = SimpleNamespace(input_tokens=5, output_tokens=7, cache_read_input_tokens=None, cache_creation_input_tokens=3)
    assert ai.Usage.of(usage) == ai.Usage(5, 7, cache_read_tokens=0, cache_write_tokens=3)


def test_every_purpose_has_a_priced_model():
    assert set(ai.MODELS) == {"hint", "lab_review"}
    assert all(model in ai.PRICES for model in ai.MODELS.values())
    assert "claude-opus-5-5" not in ai.MODELS.values()  # lessons are written in sessions, not through this key (#124)


# --- the ledger and the budget --------------------------------------------------------
@pytest.mark.criterion(120, "A model call is recorded with its cost")
@pytest.mark.parametrize("year", [2001], indirect=True)
def test_a_model_call_is_recorded_with_its_cost(ai_on, make_user, year):
    user = make_user()
    seam = Seam(input_tokens=1000, output_tokens=200)
    spend.run(user.id, "hint", seam, now=_at(year))
    assert seam.calls == ["claude-haiku-5-5"]
    [row] = _rows(year)
    assert (row.user_id, row.purpose, row.model) == (user.id, "hint", "claude-haiku-5-5")
    assert (row.input_tokens, row.output_tokens, row.cache_read_tokens, row.cache_write_tokens) == (1000, 200, 0, 0)
    assert row.cost_microcents == 20_000


@pytest.mark.criterion(120, "The budget stops calls")
@pytest.mark.parametrize("year", [2002], indirect=True)
def test_the_budget_stops_calls(ai_on, make_user, year):
    user = make_user()
    _spend(user.id, BUDGET_MICROCENTS, _at(year, 6, 1))
    seam = Seam()
    with pytest.raises(ai.AIUnavailable) as raised:
        spend.run(user.id, "hint", seam, now=_at(year, 6, 30))
    assert raised.value.reason == "over_budget"
    assert seam.calls == []
    assert len(_rows(year)) == 1  # nothing new recorded


@pytest.mark.criterion(120, "The budget stops calls")
@pytest.mark.parametrize("year", [2003], indirect=True)
def test_a_spent_budget_shows_the_uplink_offline_without_an_error(ai_on, logged_in, user, monkeypatch, year):
    monkeypatch.setattr(spend, "_now", lambda: _at(year))
    _spend(user.id, BUDGET_MICROCENTS - 1, _at(year, 6, 1))
    assert "Uplink <strong>online</strong>" in logged_in.get("/").text  # a microcent left
    _spend(user.id, 1, _at(year, 6, 2))
    page = logged_in.get("/")
    assert page.status_code == 200
    assert '<span class="uplink is-offline">Uplink <strong>offline</strong></span>' in page.text


@pytest.mark.criterion(120, "Last month's spend doesn't count")
@pytest.mark.parametrize("year", [2004], indirect=True)
def test_last_months_spend_does_not_count(ai_on, make_user, year):
    user = make_user()
    _spend(user.id, BUDGET_MICROCENTS, _at(year, 5, 31, 23))
    seam = Seam()
    spend.run(user.id, "hint", seam, now=_at(year, 6, 1, 1))
    assert seam.calls == ["claude-haiku-5-5"]


@pytest.mark.parametrize("year", [2005], indirect=True)
def test_the_month_is_the_learners_month_not_utcs(ai_on, make_user, monkeypatch, year):
    monkeypatch.setattr(get_settings(), "app_timezone", "America/New_York")
    user = make_user()
    # 03:00 UTC on 1 June is 23:00 on 31 May in New York: May's spend, not June's.
    _spend(user.id, BUDGET_MICROCENTS, _at(year, 6, 1, 3))
    with SessionLocal() as db:
        assert spend.spent_this_month(db, _at(year, 6, 1, 3)) == BUDGET_MICROCENTS  # still May there
        assert spend.spent_this_month(db, _at(year, 6, 1, 5)) == 0  # 01:00 June in New York


@pytest.mark.parametrize("year", [2006], indirect=True)
def test_a_zero_budget_turns_ai_off(ai_on, make_user, monkeypatch, year):
    monkeypatch.setattr(get_settings(), "ai_monthly_budget_cents", 0)
    seam = Seam()
    with pytest.raises(ai.AIUnavailable):
        spend.run(make_user().id, "hint", seam, now=_at(year))
    assert seam.calls == []


@pytest.mark.criterion(120, "No key means no AI, and the app still works")
def test_no_key_means_no_call(monkeypatch, make_user):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "")
    seam = Seam()
    with pytest.raises(ai.AIUnavailable) as raised:
        spend.run(make_user().id, "hint", seam)
    assert raised.value.reason == "no_key"
    assert seam.calls == []


@pytest.mark.criterion(120, "No key means no AI, and the app still works")
@pytest.mark.parametrize("path", ["/", "/syllabus", "/modules/the-filesystem", "/review"])
def test_no_key_shows_the_uplink_offline_and_the_page_renders(monkeypatch, logged_in, path):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "")
    page = logged_in.get(path)
    assert page.status_code == 200
    assert "Uplink <strong>offline</strong>" in page.text


@pytest.mark.parametrize("year", [2007], indirect=True)
def test_with_a_key_and_budget_the_uplink_is_online(ai_on, logged_in, monkeypatch, year):
    monkeypatch.setattr(spend, "_now", lambda: _at(year))
    assert '<span class="uplink">Uplink <strong>online</strong></span>' in logged_in.get("/").text


@pytest.mark.parametrize("year", [2008], indirect=True)
def test_an_api_error_is_unavailable_records_nothing_and_logs_no_content(ai_on, make_user, caplog, year):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    seam = Seam(error=anthropic.APIConnectionError(message="connection reset", request=request))
    with caplog.at_level(logging.WARNING, logger="orbit.ai"), pytest.raises(ai.AIUnavailable) as raised:
        spend.run(make_user().id, "hint", seam, now=_at(year))
    assert raised.value.reason == "error"
    assert _rows(year) == []
    assert "AI hint call failed: APIConnectionError" in caplog.text


@pytest.mark.parametrize("year", [2009], indirect=True)
def test_spend_is_kept_when_the_feature_rolls_back(ai_on, make_user, year):
    """The row is committed in its own session: the feature's failure can't un-spend it."""
    user = make_user()
    with SessionLocal() as db:
        spend.run(user.id, "hint", Seam(), now=_at(year))
        db.rollback()
    assert len(_rows(year)) == 1


def test_the_budget_setting_refuses_a_negative_value(monkeypatch):
    from pydantic import ValidationError

    from app.config import Settings

    monkeypatch.setenv("AI_MONTHLY_BUDGET_CENTS", "-1")
    with pytest.raises(ValidationError):
        Settings()
