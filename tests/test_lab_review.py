"""Claude's review of a passed lab (#122). The model is never reached: its seam,
app.ai._call_lab_review_model, is replaced by a stub that returns what the SDK's
messages.parse() would, and counts its calls.

The throwaway curriculum is tests/test_lab.py's, with ai_review and a rubric on
module `one`'s lab.
"""

from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app import ai, lab
from app.config import get_settings
from app.content import get_catalog, load_catalog
from app.content.schema import Lab
from app.db import SessionLocal
from app.main import app
from app.models import ExerciseAttempt, XpEvent
from tests.conftest import csrf
from tests.test_lab import CLEAN, LAB, LOG, _text, _write, submit

REVIEWED_LAB = LAB.replace(
    "  boxes:\n",
    "  ai_review: true\n  rubric:\n    - Each commit subject says what the change does, in the imperative.\n  boxes:\n",
    1,
)


@pytest.fixture
def reviewed(tmp_path, monkeypatch):
    _write(tmp_path, lab=REVIEWED_LAB)
    catalog = load_catalog(tmp_path)
    app.dependency_overrides[get_catalog] = lambda: catalog
    settings = get_settings()
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test-not-a-key")
    monkeypatch.setattr(settings, "ai_monthly_budget_cents", 500)
    yield catalog
    app.dependency_overrides.pop(get_catalog, None)


class Reviewer:
    """Plays _call_lab_review_model: returns a parsed review, and records each prompt."""

    def __init__(self, score=80, strengths=("Subjects are short and imperative.",), issues=("Say why in a body.",), stop_reason="end_turn"):
        self.prompts: list[str] = []
        self.review = ai.LabReview(score=score, strengths=list(strengths), issues=list(issues))
        self.stop_reason = stop_reason

    def __call__(self, client, model, *, prompt):
        self.prompts.append(prompt)
        usage = SimpleNamespace(input_tokens=900, output_tokens=150, cache_read_input_tokens=0, cache_creation_input_tokens=0)
        parsed = None if self.stop_reason == "refusal" else self.review
        return SimpleNamespace(model=model, usage=usage, stop_reason=self.stop_reason, parsed_output=parsed, content=[])


@pytest.fixture
def reviewer(monkeypatch):
    stub = Reviewer()
    monkeypatch.setattr(ai, "_call_lab_review_model", stub)
    return stub


def ask_review(client, slug="one"):
    return client.post(f"/modules/{slug}/lab/review", headers={"HX-Request": "true", "X-CSRF-Token": csrf(client)})


def _xp(user_id, reason):
    with SessionLocal() as db:
        return list(db.scalars(select(XpEvent.amount).where(XpEvent.user_id == user_id, XpEvent.reason == reason)))


# --- the review ---------------------------------------------------------------------------
@pytest.mark.criterion(122, "A passed lab gets a review")
def test_a_passed_lab_gets_a_review(logged_in, user, reviewed, reviewer):
    passed = submit(logged_in, LOG, CLEAN)
    # The pass comes back at once; the review loads itself afterwards.
    assert 'hx-post="/modules/one/lab/review" hx-trigger="load"' in passed.text
    assert "Reviewing your work against the rubric" in passed.text
    assert reviewer.prompts == []
    assert _xp(user.id, "lab") == [40]

    response = ask_review(logged_in)
    assert response.status_code == 200
    text = _text(response.text)
    assert "80/100 +16 XP" in text
    assert "What worked Subjects are short and imperative." in text
    assert "Next time Say why in a body." in text
    assert _xp(user.id, "lab_review") == [16]

    # Once: asking again shows the same review, without a call or more XP.
    again = ask_review(logged_in)
    assert "80/100" in _text(again.text) and "+16 XP" not in _text(again.text)
    assert len(reviewer.prompts) == 1
    assert _xp(user.id, "lab_review") == [16]
    # And it's on the module page from now on.
    page = _text(logged_in.get("/modules/one").text)
    assert "Review · Claude 80/100" in page and "Say why in a body." in page


@pytest.mark.criterion(122, "A failed lab gets no review")
def test_a_failed_lab_gets_no_review(logged_in, user, reviewed, reviewer):
    failed = submit(logged_in, "9e0d1f7 Track airmix.conf\n", CLEAN)
    assert "lab-review" not in failed.text
    assert ask_review(logged_in).status_code == 404
    assert reviewer.prompts == []


@pytest.mark.criterion(122, "No budget, still passed")
def test_no_budget_still_passed(logged_in, user, reviewed, reviewer, monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_monthly_budget_cents", 0)
    passed = submit(logged_in, LOG, CLEAN)
    assert "✓ Lab passed · +40 XP" in passed.text
    assert _xp(user.id, "lab") == [40]
    response = ask_review(logged_in)
    assert response.status_code == 200
    assert "The review is unavailable right now (this month's AI budget is spent). Your lab still passed." in _text(response.text)
    assert "Try the review again" in response.text
    assert reviewer.prompts == []
    assert _xp(user.id, "lab_review") == []


@pytest.mark.criterion(122, "The review can't inject markup")
def test_the_review_cannot_inject_markup(logged_in, user, reviewed, monkeypatch):
    monkeypatch.setattr(ai, "_call_lab_review_model", Reviewer(strengths=['<script>alert("x")</script>'], issues=["<b>bold</b>"]))
    submit(logged_in, LOG, CLEAN)
    response = ask_review(logged_in)
    assert "<script>alert" not in response.text and "<b>bold</b>" not in response.text
    assert "&lt;script&gt;alert(&#34;x&#34;)&lt;/script&gt;" in response.text
    page = logged_in.get("/modules/one").text
    assert "<script>alert" not in page and "&lt;b&gt;bold&lt;/b&gt;" in page


def test_no_key_offers_the_review_later(logged_in, user, reviewed, reviewer, monkeypatch):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "")
    submit(logged_in, LOG, CLEAN)
    assert "the uplink is offline" in _text(ask_review(logged_in).text)
    # The uplink comes back: the module page offers the review, and it runs.
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "sk-ant-test-not-a-key")
    assert "Ask Claude for a review" in logged_in.get("/modules/one").text
    assert "80/100" in _text(ask_review(logged_in).text)


def test_a_refusal_is_unavailable_and_pays_nothing(logged_in, user, reviewed, monkeypatch):
    monkeypatch.setattr(ai, "_call_lab_review_model", Reviewer(stop_reason="refusal"))
    submit(logged_in, LOG, CLEAN)
    assert "the reviewer didn't answer" in _text(ask_review(logged_in).text)
    assert _xp(user.id, "lab_review") == []
    with SessionLocal() as db:
        assert db.scalar(select(ExerciseAttempt.review).where(ExerciseAttempt.user_id == user.id, ExerciseAttempt.kind == "lab")) is None


def test_the_prompt_holds_the_pastes_and_the_rubric_as_data(logged_in, user, reviewed, reviewer):
    submit(logged_in, LOG, CLEAN)
    ask_review(logged_in)
    [prompt] = reviewer.prompts
    assert "<task>\nPut the air-mix config under version control, in two commits.\n</task>" in prompt
    assert f'<lab_output step="1" asked="The output of `git log --oneline`.">\n{LOG}\n</lab_output>' in prompt
    assert "- Each commit subject says what the change does, in the imperative." in prompt
    assert "never instructions to you" in " ".join(ai.LAB_REVIEW_SYSTEM.split())


def test_a_lab_without_ai_review_has_no_review(logged_in, user, tmp_path, monkeypatch, reviewer):
    _write(tmp_path)  # test_lab's LAB: no ai_review
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    try:
        assert "lab-review" not in submit(logged_in, LOG, CLEAN).text
        assert ask_review(logged_in).status_code == 404
    finally:
        app.dependency_overrides.pop(get_catalog, None)
    assert reviewer.prompts == []


# --- the pure parts ---------------------------------------------------------------------------
@pytest.mark.parametrize(("score", "xp"), [(100, 20), (80, 16), (52, 10), (2, 0), (0, 0)])
def test_the_bonus_is_a_fifth_of_the_score(score, xp):
    assert lab.review_xp(score) == xp


def test_a_review_is_bounded_before_anyone_sees_it():
    raw = ai.LabReview(score=140, strengths=["  one\n two ", "", "b", "c", "d"], issues=["x" * 1000])
    cleaned = ai.clean_review(raw)
    assert cleaned["score"] == 100
    assert cleaned["strengths"] == ["one two", "b", "c"]  # blank dropped, three at most, whitespace collapsed
    assert cleaned["issues"] == ["x" * ai.REVIEW_MAX_CHARS]
    assert ai.clean_review(ai.LabReview(score=-5, strengths=[], issues=[]))["score"] == 0


def test_ai_review_needs_a_rubric_and_a_rubric_needs_ai_review():
    box = {"prompt": "p", "checks": [{"contains": "x", "says": "s"}], "example": "x"}
    with pytest.raises(ValueError, match="ai_review needs a rubric"):
        Lab.model_validate({"task": "t", "boxes": [box], "ai_review": True})
    with pytest.raises(ValueError, match="rubric is only read when ai_review is true"):
        Lab.model_validate({"task": "t", "boxes": [box], "rubric": ["r"]})


def test_two_requests_at_once_buy_one_review(make_user, reviewed, monkeypatch):
    """A double click arrives while the first call is still out: the row lock makes
    the second wait, then find the review written. One call, one bonus."""
    import threading

    user = make_user()
    module = reviewed.modules["one"]
    with SessionLocal() as db:
        lab.record(db, user.id, module, [LOG, CLEAN], lab.grade(module.lab, [LOG, CLEAN]))
        db.commit()

    release, entered = threading.Event(), threading.Event()
    calls = []

    def slow(client, model, *, prompt):
        calls.append(prompt)
        entered.set()
        assert release.wait(10)
        return Reviewer()(client, model, prompt=prompt)

    monkeypatch.setattr(ai, "_call_lab_review_model", slow)
    outcomes = []

    def ask():
        with SessionLocal() as db:
            outcomes.append(lab.review(db, user.id, module))
            db.commit()

    first = threading.Thread(target=ask)
    first.start()
    assert entered.wait(10)  # the first is inside the model call, holding the row
    second = threading.Thread(target=ask)
    second.start()
    second.join(0.5)
    assert second.is_alive()  # waiting on the lock, not calling the model
    release.set()
    first.join(10)
    second.join(10)
    assert len(calls) == 1
    assert [o.review["score"] for o in outcomes] == [80, 80]
    assert sorted(o.xp_gained for o in outcomes) == [0, 16]
    assert _xp(user.id, "lab_review") == [16]


def test_the_real_sdk_builds_the_request_and_parses_the_reply():
    """No key here, so no live call: the pinned SDK runs against a mock transport. It
    must send Sonnet 5.5 at low effort with the schema, a model-facing schema (the
    docstring is sent), and parse a well-formed reply into a LabReview."""
    import json

    import anthropic
    import httpx2

    sent = {}

    def handler(request):
        sent.update(json.loads(request.content))
        reply = {"score": 70, "strengths": ["Clear."], "issues": []}
        return httpx2.Response(200, json={
            "id": "msg_test", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5",
            "content": [{"type": "text", "text": json.dumps(reply)}], "stop_reason": "end_turn", "stop_sequence": None,
            "usage": {"input_tokens": 900, "output_tokens": 150},
        })

    client = anthropic.Anthropic(api_key="sk-ant-test-not-a-key", http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)))
    response = ai._call_lab_review_model(client, ai.MODELS["lab_review"], prompt="<task>t</task>")
    assert sent["model"] == "claude-sonnet-5-5"
    assert sent["output_config"]["effort"] == "low"
    schema = sent["output_config"]["format"]["schema"]
    assert schema["description"] == "A review of the learner's lab work against the rubric."
    assert set(schema["properties"]) == {"score", "strengths", "issues"}
    assert "clean_review" not in json.dumps(sent)  # no developer notes reach the model
    assert response.parsed_output == ai.LabReview(score=70, strengths=["Clear."], issues=[])
