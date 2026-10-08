"""HEAD mirrors GET without a body (#9)."""

import pytest


@pytest.mark.criterion(9, "HEAD on a page mirrors GET")
def test_head_on_a_page_mirrors_get(client):
    get = client.get("/login")
    head = client.head("/login")
    assert head.status_code == get.status_code == 200
    assert head.content == b""
    for header in ("content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy"):
        assert header in head.headers
    assert head.headers["content-length"] == get.headers["content-length"]


@pytest.mark.criterion(9, "HEAD on the health check")
def test_head_on_the_health_check(client):
    response = client.head("/healthz")
    assert response.status_code == 200
    assert response.content == b""


def test_head_still_requires_login(client):
    response = client.head("/", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/login"


def test_head_on_a_missing_page_is_404(client):
    assert client.head("/no-such-page").status_code == 404


def test_other_methods_are_untouched(client):
    assert client.put("/healthz").status_code in (403, 405)  # CSRF or method check, never served as GET
