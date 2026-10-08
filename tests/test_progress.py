"""Quizzes, completion, locking and today's mission (#5).

Most tests run against a small throwaway curriculum swapped in with
dependency_overrides, because locking needs more modules than content/ has:

    unit `shell` (no prerequisites): one → two → three
    unit `git`   (requires shell):   four
"""

import textwrap

import pytest

from app.content import get_catalog, load_catalog
from app.content.schema import ChoiceQuestion, FillQuestion, MultiQuestion
from app.db import SessionLocal
from app.main import app
from app.models import ExerciseAttempt, ModuleProgress
from app.progress import check_answer, module_available, next_module, todays_mission

SYLLABUS = """
tracks:
  - slug: core
    title: Core
    deck: Life Support
    units:
      - slug: shell
        title: Shell
      - slug: git
        title: Git
        prerequisites: [shell]
"""

MODULE = """---
title: {title}
minutes: 15
story: Day.
quiz:
  - type: choice
    q: Choice question
    options: [wrong, right]
    answer: 1
    explain: Right is right.
  - type: fill
    q: Fill question
    answer: [ls]
    explain: It is ls.
---
Lesson.
"""


@pytest.fixture
def catalog(tmp_path):
    (tmp_path / "syllabus.yml").write_text(textwrap.dedent(SYLLABUS))
    files = {"core/shell/01-one.md": "One", "core/shell/02-two.md": "Two", "core/shell/03-three.md": "Three",
             "core/git/01-four.md": "Four"}
    for rel, title in files.items():
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text(MODULE.format(title=title))
    return load_catalog(tmp_path)


@pytest.fixture
def test_curriculum(catalog):
    app.dependency_overrides[get_catalog] = lambda: catalog
    yield catalog
    app.dependency_overrides.pop(get_catalog, None)


def answer(client, slug, index, *values, token=None):
    from tests.conftest import csrf

    return client.post(
        f"/modules/{slug}/quiz/{index}",
        data={"answer": list(values)},
        headers={"HX-Request": "true", "X-CSRF-Token": token or csrf(client)},
    )


def complete(client, slug, right=True):
    answer(client, slug, 0, "1" if right else "0")
    return answer(client, slug, 1, "ls" if right else "dir")


# --- pure rules -------------------------------------------------------------------
def test_answer_checking():
    choice = ChoiceQuestion(type="choice", q="q", options=["a", "b"], answer=1, explain="e")
    assert check_answer(choice, ["1"]) is True
    assert check_answer(choice, ["0"]) is False
    for bad in ([], ["2"], ["x"], ["0", "1"]):
        assert check_answer(choice, bad) is None

    multi = MultiQuestion(type="multi", q="q", options=["a", "b", "c"], answer=[0, 2], explain="e")
    assert check_answer(multi, ["0", "2"]) is True
    assert check_answer(multi, ["2", "0"]) is True
    assert check_answer(multi, ["0"]) is False
    assert check_answer(multi, []) is None
    assert check_answer(multi, ["0", "9"]) is None

    fill = FillQuestion(type="fill", q="q", answer=["chmod", "chmod 600"], explain="e")
    assert check_answer(fill, ["  CHMOD "]) is True
    assert check_answer(fill, ["chmod   600"]) is True  # inner whitespace collapsed
    assert check_answer(fill, ["chown"]) is False
    assert check_answer(fill, ["   "]) is None


def test_lock_rules(catalog):
    assert module_available(catalog, "one", set())
    assert not module_available(catalog, "two", set())
    assert module_available(catalog, "two", {"one"})
    assert not module_available(catalog, "four", {"one", "two"})  # git needs all of shell
    assert module_available(catalog, "four", {"one", "two", "three"})
    assert module_available(catalog, "one", {"one"})  # finished modules stay open for review


def test_next_module_moves_within_then_across_units(catalog):
    assert next_module(catalog, "one", {"one"}).slug == "two"
    assert next_module(catalog, "three", {"one", "two", "three"}).slug == "four"
    assert next_module(catalog, "four", {"one", "two", "three", "four"}) is None


@pytest.mark.criterion(5, "Today's mission is the next available module")
def test_todays_mission_rule(catalog):
    assert todays_mission(catalog, set()).slug == "one"
    assert todays_mission(catalog, {"one", "two"}).slug == "three"
    assert todays_mission(catalog, {"one", "two", "three", "four"}) is None


# --- answering ---------------------------------------------------------------------
@pytest.mark.criterion(5, "Answering a question gives immediate feedback")
def test_answer_is_replaced_in_place_with_verdict_and_explanation(logged_in, test_curriculum):
    logged_in.get("/modules/one")
    response = answer(logged_in, "one", 0, "0")
    assert response.status_code == 200
    html = response.text
    assert 'id="q0"' in html and "<html" not in html  # a fragment for hx-swap, not a page
    assert "Not quite." in html
    assert "Right is right." in html  # the explanation, revealed only now
    assert "(your answer)" in html


@pytest.mark.criterion(5, "Answering a question gives immediate feedback")
def test_correct_answer_says_so(logged_in, test_curriculum):
    assert "Correct." in answer(logged_in, "one", 0, "1").text


def test_empty_answer_is_not_recorded(logged_in, test_curriculum, user):
    response = answer(logged_in, "one", 0)
    assert response.status_code == 200  # htmx only swaps 2xx; see answer_question
    assert "Choose an answer first." in response.text
    with SessionLocal() as db:
        assert db.query(ExerciseAttempt).filter_by(user_id=user.id).count() == 0


def test_first_answer_counts_and_reloads_answered(logged_in, test_curriculum):
    answer(logged_in, "one", 0, "0")
    again = answer(logged_in, "one", 0, "1")
    assert "Not quite." in again.text  # still shows the first, counted attempt
    page = logged_in.get("/modules/one").text
    assert "Not quite." in page and 'hx-post="/modules/one/quiz/0"' not in page
    assert 'hx-post="/modules/one/quiz/1"' in page  # the unanswered one is still a form


def test_unknown_question_index_is_404(logged_in, test_curriculum):
    assert answer(logged_in, "one", 5, "1").status_code == 404


def test_answering_requires_csrf(logged_in, test_curriculum):
    response = logged_in.post("/modules/one/quiz/0", data={"answer": ["1"]}, headers={"HX-Request": "true"})
    assert response.status_code == 403


# --- completion -------------------------------------------------------------------
@pytest.mark.criterion(5, "Completing the quiz completes the module")
def test_answering_every_question_completes_the_module_with_a_score(logged_in, test_curriculum, user):
    logged_in.get("/modules/one")
    answer(logged_in, "one", 0, "1")
    last = answer(logged_in, "one", 1, "dir")  # one right, one wrong
    assert 'id="completion"' in last.text and 'hx-swap-oob="true"' in last.text
    assert "Module complete · 50%" in last.text
    with SessionLocal() as db:
        row = db.query(ModuleProgress).filter_by(user_id=user.id, module_slug="one").one()
        assert (row.status, row.score) == ("complete", 50)
        assert row.completed_at is not None


@pytest.mark.criterion(5, "Completing the quiz completes the module")
def test_completing_unlocks_the_next_module(logged_in, test_curriculum):
    assert logged_in.get("/modules/two", follow_redirects=False).status_code == 303
    last = complete(logged_in, "one")
    assert 'href="/modules/two"' in last.text  # "Next:" link
    assert logged_in.get("/modules/two", follow_redirects=False).status_code == 200


def test_completed_module_page_shows_the_result(logged_in, test_curriculum):
    complete(logged_in, "one")
    page = logged_in.get("/modules/one").text
    assert "Module complete · 100%" in page
    assert 'hx-swap-oob' not in page


# --- locking ----------------------------------------------------------------------
@pytest.mark.criterion(5, "Locked modules cannot be opened")
def test_locked_module_redirects_to_dashboard_with_what_to_finish(logged_in, test_curriculum):
    response = logged_in.get("/modules/three", follow_redirects=False)
    assert response.status_code == 303 and response.headers["location"] == "/"
    dashboard = logged_in.get("/").text
    assert "“Three” is still locked. Finish “Two” first." in dashboard
    assert "still locked" not in logged_in.get("/").text  # shown once


@pytest.mark.criterion(5, "Locked modules cannot be opened")
def test_locked_unit_names_the_prerequisite_unit(logged_in, test_curriculum):
    logged_in.get("/modules/four", follow_redirects=False)
    assert "Finish the unit “Shell” first." in logged_in.get("/").text


def test_cannot_answer_a_locked_modules_quiz(logged_in, test_curriculum, user):
    response = answer(logged_in, "three", 0, "1")
    assert response.status_code == 403 and response.headers["HX-Redirect"] == "/"
    with SessionLocal() as db:
        assert db.query(ExerciseAttempt).filter_by(user_id=user.id).count() == 0


def test_syllabus_marks_complete_available_and_locked(logged_in, test_curriculum):
    complete(logged_in, "one")
    html = logged_in.get("/syllabus").text
    assert 'aria-label="Complete"' in html and 'aria-label="Available"' in html and 'aria-label="Locked"' in html
    assert 'href="/modules/three"' not in html  # locked: no link


# --- today's mission on the dashboard ---------------------------------------------
@pytest.mark.criterion(5, "Today's mission is the next available module")
def test_dashboard_shows_the_next_available_module(logged_in, test_curriculum):
    complete(logged_in, "one")
    complete(logged_in, "two")
    html = logged_in.get("/").text
    assert "Today&#39;s mission" in html or "Today's mission" in html
    assert 'href="/modules/three"' in html
    assert "<strong>2</strong> of 4 modules complete" in html


def test_dashboard_when_everything_is_done(logged_in, test_curriculum):
    for slug in ("one", "two", "three", "four"):
        complete(logged_in, slug)
    assert "Every available mission is complete." in logged_in.get("/").text


def test_progress_is_per_user(client, make_user, test_curriculum):
    from tests.conftest import login

    first, second = make_user(), make_user()
    login(client, first.username)
    complete(client, "one")
    client.cookies.clear()
    login(client, second.username)
    assert client.get("/modules/two", follow_redirects=False).status_code == 303
