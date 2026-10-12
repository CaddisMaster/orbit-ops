"""Hints (#123). The model is never reached: app.ai._call_hint_model is replaced by
a stub that returns a Message-like reply and records each prompt.

The throwaway curriculum has one module, `perms`, with a choice question whose right
option is `chmod 600`, a fill-in whose accepted answer is `chmod`, a console task
whose solution is `chmod 600 scrubber.conf`, and test_lab's lab.
"""

import textwrap
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app import ai, hints
from app.config import get_settings
from app.content import get_catalog, load_catalog
from app.content.schema import Challenge
from app.db import SessionLocal
from app.main import app
from app.models import XpEvent
from tests.conftest import csrf
from tests.test_lab import EXTRA, LAB, _text
from tests.test_terminal import TERMINAL
from tests.test_xp import SYLLABUS

MODULE = """---
title: Permissions
minutes: 15
xp: 50
story: Day.
quiz:
  - type: choice
    q: Which command makes a file readable by its owner only?
    options: [chmod 644, chmod 600, chown root]
    answer: 1
    explain: 600 is rw for the owner and nothing for anyone else.
  - type: fill
    q: Which command changes a file's mode bits?
    answer: [chmod]
    explain: chmod changes mode; chown changes owner.
{terminal}{lab}---
## Mode bits

Every file has three sets of permission bits: owner, group and others.
"""

HINT = "Think about which of the three sets of bits should be empty, and look at the octal table."


@pytest.fixture
def perms(tmp_path, monkeypatch):
    (tmp_path / "syllabus.yml").write_text(textwrap.dedent(SYLLABUS) + textwrap.dedent(EXTRA))
    (tmp_path / "core" / "shell").mkdir(parents=True)
    (tmp_path / "core/shell/01-perms.md").write_text(MODULE.format(terminal=TERMINAL, lab=LAB))
    catalog = load_catalog(tmp_path)
    app.dependency_overrides[get_catalog] = lambda: catalog
    settings = get_settings()
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test-not-a-key")
    monkeypatch.setattr(settings, "ai_monthly_budget_cents", 500)
    hints.limiter.reset()
    yield catalog
    hints.limiter.reset()
    app.dependency_overrides.pop(get_catalog, None)


class Hinter:
    """Plays _call_hint_model: replies with `text`, recording each prompt."""

    def __init__(self, text=HINT, stop_reason="end_turn"):
        self.prompts: list[str] = []
        self.text, self.stop_reason = text, stop_reason

    def __call__(self, client, model, *, prompt):
        self.prompts.append(prompt)
        usage = SimpleNamespace(input_tokens=1200, output_tokens=80, cache_read_input_tokens=0, cache_creation_input_tokens=0)
        content = [SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=self.text)]
        return SimpleNamespace(model=model, usage=usage, stop_reason=self.stop_reason, content=content)


@pytest.fixture
def hinter(monkeypatch):
    stub = Hinter()
    monkeypatch.setattr(ai, "_call_hint_model", stub)
    return stub


def ask(client, item, **form):
    return client.post(
        "/modules/perms/hint", data={"item": item, **form},
        headers={"HX-Request": "true", "X-CSRF-Token": csrf(client)},
    )


def _hint_xp(user_id):
    with SessionLocal() as db:
        return list(db.scalars(select(XpEvent.amount).where(XpEvent.user_id == user_id, XpEvent.reason == "hint")))


# --- the scenarios ----------------------------------------------------------------------------
@pytest.mark.criterion(123, "A hint costs 5 XP once per item")
def test_a_hint_costs_5_xp_once_per_item(logged_in, user, perms, hinter):
    first = ask(logged_in, "quiz-0")
    assert first.status_code == 200
    assert HINT in _text(first.text) and "−5 XP" in first.text
    hints.limiter.reset()  # a minute later
    second = ask(logged_in, "quiz-0")
    assert HINT in _text(second.text) and "−5 XP" not in second.text
    assert len(hinter.prompts) == 2
    assert _hint_xp(user.id) == [-5]
    ask(logged_in, "console")  # another item is charged on its own
    assert sorted(_hint_xp(user.id)) == [-5, -5]


@pytest.mark.criterion(123, "The model is never shown the answer")
def test_the_model_is_never_shown_the_answer(logged_in, user, perms, hinter):
    ask(logged_in, "quiz-1", answer="chown")
    [prompt] = hinter.prompts
    assert "Which command changes a file's mode bits?" in prompt
    assert "<attempt>\nchown\n</attempt>" in prompt
    # Not the accepted answer, not the explanation (which names it), not any solution.
    assert "chmod" not in prompt.replace("Which command", "")  # the lesson and question never say it
    assert "chmod changes mode" not in prompt
    for item in ("quiz-0", "console", "lab"):
        hints.limiter.reset()
        ask(logged_in, item)
    quiz0, console, lab = hinter.prompts[1:]
    assert "600 is rw for the owner" not in quiz0  # explain
    assert "chmod 600 scrubber.conf" not in console  # solution
    assert '"600"' not in console and "equals" not in console  # checks
    assert "Track airmix.conf" not in lab  # the lab's example


@pytest.mark.criterion(123, "A hint that leaks the answer is replaced")
def test_a_hint_that_leaks_the_answer_is_replaced(logged_in, user, perms, monkeypatch):
    monkeypatch.setattr(ai, "_call_hint_model", Hinter(text="Easy: the answer is `chmod  600`, the second option."))
    response = ask(logged_in, "quiz-0")
    text = _text(response.text)
    assert hints.LEAKED in text
    assert "chmod 600" not in text
    assert _hint_xp(user.id) == []  # a replaced hint is free


@pytest.mark.criterion(123, "Hints are offline without budget")
def test_hints_are_offline_without_budget(logged_in, user, perms, hinter, monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_monthly_budget_cents", 0)
    page = logged_in.get("/modules/perms").text
    assert page.count('<button type="button" class="link hint-ask" disabled>Hints are offline</button>') == 4  # 2 questions, console, lab
    response = ask(logged_in, "quiz-0")
    assert "No hint right now (this month's AI budget is spent). Nothing was charged." in _text(response.text)
    assert hinter.prompts == []
    assert _hint_xp(user.id) == []


@pytest.mark.criterion(123, "Hints are rate-limited")
def test_hints_are_rate_limited(logged_in, user, perms, hinter):
    ask(logged_in, "quiz-0")
    again = ask(logged_in, "quiz-0")
    assert "One hint a minute for each task." in _text(again.text)
    assert len(hinter.prompts) == 1


# --- around the edges ----------------------------------------------------------------------------
def test_the_page_offers_a_hint_on_each_unanswered_task(logged_in, perms, hinter):
    page = logged_in.get("/modules/perms").text
    for item, include in (("quiz-0", "#q0"), ("quiz-1", "#q1"), ("console", "#hint-attempt-console"), ("lab", "#lab .lab-paste")):
        assert f'hx-vals=\'{{"item": "{item}"}}\'' in page and f'hx-include="{include}"' in page, item


def test_an_answered_question_gets_no_hint(logged_in, perms, hinter):
    logged_in.post("/modules/perms/quiz/0", data={"answer": "1"}, headers={"HX-Request": "true", "X-CSRF-Token": csrf(logged_in)})
    assert ask(logged_in, "quiz-0").status_code == 409
    assert 'hx-vals=\'{"item": "quiz-0"}\'' not in logged_in.get("/modules/perms").text
    assert hinter.prompts == []


def test_an_unknown_item_is_404(logged_in, perms, hinter):
    for item in ("quiz-9", "challenge", "nonsense"):
        assert ask(logged_in, item).status_code == 404
    assert hinter.prompts == []


def test_what_was_tried_goes_with_the_hint(logged_in, perms, hinter):
    ask(logged_in, "quiz-0", answer="0")
    hints.limiter.reset()
    ask(logged_in, "console", attempt="ls -l\nchmod 644 scrubber.conf")
    hints.limiter.reset()
    ask(logged_in, "lab", box=["9e0d1f7 Track airmix.conf", ""])
    quiz, console, lab = hinter.prompts
    assert "<attempt>\nLeaning towards: chmod 644\n</attempt>" in quiz
    assert "<attempt>\nls -l\nchmod 644 scrubber.conf\n</attempt>" in console
    assert "<attempt>\nBox 1:\n9e0d1f7 Track airmix.conf\n</attempt>" in lab


def test_a_hint_is_text_only(logged_in, perms, monkeypatch):
    monkeypatch.setattr(ai, "_call_hint_model", Hinter(text="<script>alert(1)</script> look at the table"))
    response = ask(logged_in, "quiz-0")
    assert "<script>alert(1)" not in response.text and "&lt;script&gt;" in response.text


def test_a_long_hint_is_cut_to_80_words(logged_in, perms, monkeypatch):
    monkeypatch.setattr(ai, "_call_hint_model", Hinter(text=" ".join(["word"] * 200)))
    shown = _text(ask(logged_in, "quiz-0").text)
    assert shown.count("word") == hints.MAX_WORDS and "…" in shown


def test_a_refusal_is_unavailable_and_free(logged_in, user, perms, monkeypatch):
    monkeypatch.setattr(ai, "_call_hint_model", Hinter(text="", stop_reason="refusal"))
    assert "the hint system didn't answer" in _text(ask(logged_in, "quiz-0").text)
    assert _hint_xp(user.id) == []


def test_hints_on_a_locked_module_are_refused(logged_in, tmp_path, perms, hinter):
    (tmp_path / "core/shell/00-first.md").write_text(MODULE.format(terminal="", lab="").replace("Permissions", "First"))
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    response = ask(logged_in, "quiz-0")
    assert response.status_code == 403 and response.headers["HX-Redirect"] == "/"
    assert hinter.prompts == []


# --- the guard, directly -----------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("reply", "secret", "leaks"),
    [
        ("Use chmod.", "chmod", True),
        ("Use CHMOD.", "chmod", True),
        ("The `chmod` command.", "chmod", True),
        ("Look at the mode bits.", "chmod", False),
        ("Else, list it.", "ls", False),  # whole words only
        ("Run chmod   600 on it", "chmod 600", True),  # any spacing
    ],
)
def test_leaks(reply, secret, leaks):
    assert hints.leaks(reply, [secret]) is leaks


def test_short_solution_lines_are_not_guarded(perms):
    module = perms.modules["perms"]
    assert hints.secrets(module, "console") == ["chmod 600 scrubber.conf"]
    assert hints.secrets(module, "quiz-0") == ["chmod 600"]
    assert hints.secrets(module, "quiz-1") == ["chmod"]
    assert hints.secrets(module, "lab") == []


def test_a_challenges_secrets_are_its_new_solution_lines():
    challenge = Challenge(
        task="t", starter="def failed(log):\n    ...\n",
        checks=[{"check": "assert failed('') == 0", "says": "s"}],
        solution="def failed(log):\n    return sum(1 for line in log.splitlines() if ' 401 ' in line)\n",
    )
    module = SimpleNamespace(challenge=challenge)
    assert hints.secrets(module, "challenge") == ["return sum(1 for line in log.splitlines() if ' 401 ' in line)"]
