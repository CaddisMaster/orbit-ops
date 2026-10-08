import re

from app.config import get_settings


def test_csp_has_a_fresh_nonce_per_request(client):
    first = client.get("/login").headers["content-security-policy"]
    second = client.get("/login").headers["content-security-policy"]
    nonce = re.search(r"'nonce-([^']+)'", first)
    assert nonce
    assert nonce.group(1) not in second


def test_csp_forbids_framing_and_inline_script(client):
    csp = client.get("/login").headers["content-security-policy"]
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    assert "'unsafe-inline'" not in csp
    assert "'unsafe-eval'" not in csp


def test_standard_hardening_headers(client):
    headers = client.get("/login").headers
    assert headers["x-frame-options"] == "DENY"
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["referrer-policy"] == "no-referrer"


def test_no_hsts_over_plain_http_locally(client):
    assert not get_settings().cookie_secure
    assert "strict-transport-security" not in client.get("/login").headers


def test_headers_are_on_error_pages_too(client):
    response = client.get("/no-such-page")
    assert response.status_code == 404
    assert "content-security-policy" in response.headers


def test_session_cookie_is_httponly_and_samesite(client, user):
    from tests.conftest import login

    cookie = login(client, user.username).headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie


def test_no_api_docs_are_exposed(client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404
