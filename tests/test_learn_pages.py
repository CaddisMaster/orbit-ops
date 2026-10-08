"""The syllabus and module pages (#4)."""

import pytest


@pytest.mark.criterion(4, "A module renders")
def test_module_page_shows_story_lesson_and_quiz(logged_in):
    page = logged_in.get("/modules/the-filesystem")
    assert page.status_code == 200
    html = page.text
    assert "The filesystem tree" in html
    assert "Mission log, day 1." in html  # story briefing
    assert "<h2>One tree, one root</h2>" in html  # lesson Markdown
    assert '<pre class="highlight" data-lang="bash">' in html  # highlighted code
    assert "Which directory is the top of the entire Linux filesystem?" in html  # quiz
    assert 'type="checkbox"' in html  # the multi question
    assert "Life Support" in html and "Linux &amp; the shell" in html  # where it sits


@pytest.mark.criterion(4, "A module renders")
def test_quiz_answers_and_explanations_never_reach_the_browser(logged_in, client):
    html = logged_in.get("/modules/the-filesystem").text
    for question in client.app.state.catalog.modules["the-filesystem"].quiz:
        # Every explanation starts with distinctive prose that appears nowhere else.
        assert question.explain[:40] not in html


def test_module_page_requires_login(client):
    response = client.get("/modules/the-filesystem", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/login"


def test_unknown_module_is_404(logged_in):
    assert logged_in.get("/modules/no-such-module").status_code == 404


def test_syllabus_lists_tracks_units_and_modules(logged_in):
    html = logged_in.get("/syllabus").text
    assert "Life Support" in html
    assert "Linux &amp; the shell" in html
    assert 'href="/modules/the-filesystem"' in html


def test_dashboard_links_to_the_syllabus(logged_in):
    assert 'href="/syllabus"' in logged_in.get("/").text
