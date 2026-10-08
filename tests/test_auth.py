from sqlalchemy import select

from app.db import SessionLocal
from app.models import User, new_session_token
from tests.conftest import csrf, login


def test_dashboard_requires_login(client):
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/login"


def test_htmx_request_without_login_gets_hx_redirect(client):
    response = client.get("/", headers={"HX-Request": "true"}, follow_redirects=False)
    assert response.status_code == 401
    assert response.headers["HX-Redirect"] == "/login"


def test_valid_login_reaches_dashboard(client, user):
    response = login(client, user.username, follow_redirects=True)
    assert response.status_code == 200
    assert user.username in response.text
    assert "Today's mission" in response.text


def test_login_page_redirects_when_already_logged_in(logged_in):
    response = logged_in.get("/login", follow_redirects=False)
    assert response.status_code == 303


def test_wrong_password_and_unknown_user_look_identical(client, user):
    wrong = login(client, user.username, password="not the password")
    unknown = login(client, "no-such-cadet")
    assert wrong.status_code == unknown.status_code == 401
    assert "Invalid username or password." in wrong.text
    assert "Invalid username or password." in unknown.text


def test_login_without_csrf_token_is_rejected(client, user):
    response = client.post("/login", data={"username": user.username, "password": "x"})
    assert response.status_code == 403


def test_htmx_style_csrf_header_is_accepted(logged_in):
    response = logged_in.post("/logout", headers={"X-CSRF-Token": csrf(logged_in)}, follow_redirects=False)
    assert response.status_code == 303


def test_login_is_rate_limited(client, user):
    token = csrf(client)
    codes = [
        client.post("/login", data={"username": user.username, "password": "wrong", "csrf_token": token}).status_code
        for _ in range(11)
    ]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


def test_logout_ends_the_session(logged_in):
    token = csrf(logged_in)
    logged_in.post("/logout", data={"csrf_token": token})
    assert logged_in.get("/", follow_redirects=False).status_code == 303


def test_rotating_session_token_logs_out_existing_sessions(logged_in, user):
    assert logged_in.get("/", follow_redirects=False).status_code == 200
    with SessionLocal() as db:
        db.scalar(select(User).where(User.id == user.id)).session_token = new_session_token()
        db.commit()
    assert logged_in.get("/", follow_redirects=False).status_code == 303
