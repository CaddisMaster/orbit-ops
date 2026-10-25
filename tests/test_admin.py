"""The admin panel (#281): who may see it, and the progress reset."""

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, update

from app.admin import LEARNER_STATE
from app.db import SessionLocal
from app.main import app
from app.models import ActivityDay, AiRequest, BadgeEarned, CardState, ExerciseAttempt, ModuleProgress, User, XpEvent
from scripts import create_user
from tests.conftest import PASSWORD, csrf, login


@pytest.fixture
def admin(make_user):
    user = make_user()
    with SessionLocal() as db:
        db.execute(update(User).where(User.id == user.id).values(is_admin=True))
        db.commit()
    return user


@pytest.fixture
def as_admin(client, admin):
    assert login(client, admin.username).status_code == 303
    return client


def _seed(user_id: int) -> None:
    """One row in every learner-state table."""
    with SessionLocal() as db:
        db.add_all([
            ModuleProgress(user_id=user_id, module_slug="the-filesystem", status="complete"),
            ExerciseAttempt(user_id=user_id, module_slug="the-filesystem", kind="quiz", item=0, submitted=["1"], correct=True),
            XpEvent(user_id=user_id, amount=50, reason="module_complete", ref="the-filesystem"),
            ActivityDay(user_id=user_id, day=date(2026, 10, 20)),
            BadgeEarned(user_id=user_id, badge_slug="first-steps"),
            CardState(user_id=user_id, card_id="the-filesystem/fhs", ease=2.5, interval_days=1,
                      due_on=date(2026, 10, 21), last_reviewed_on=date(2026, 10, 20)),
        ])
        db.commit()


def _counts(user_id: int) -> dict[str, int]:
    with SessionLocal() as db:
        return {m.__tablename__: db.scalar(select(func.count()).select_from(m).where(m.user_id == user_id)) for m in LEARNER_STATE}


def _reset(client, user_id: int, password: str = PASSWORD, token: bool = True):
    data = {"password": password} | ({"csrf_token": csrf(client)} if token else {})
    return client.post(f"/admin/users/{user_id}/reset", data=data)


@pytest.mark.criterion(281, "Only an admin sees the panel")
def test_a_non_admin_gets_a_404_and_no_admin_link(logged_in):
    assert logged_in.get("/admin").status_code == 404
    assert 'href="/admin"' not in logged_in.get("/").text


def test_a_logged_out_visitor_goes_to_login(client):
    response = client.get("/admin", follow_redirects=False)
    assert (response.status_code, response.headers["location"]) == (303, "/login")


def test_a_non_admin_cannot_post_a_reset(logged_in, make_user):
    target = make_user()
    _seed(target.id)
    assert _reset(logged_in, target.id).status_code == 404
    assert all(_counts(target.id).values())


@pytest.mark.criterion(281, "An admin sees every user")
def test_an_admin_sees_every_user_with_their_progress(as_admin, admin, make_user):
    other = make_user()
    _seed(other.id)
    page = as_admin.get("/admin")
    assert page.status_code == 200
    assert 'href="/admin"' in page.text
    assert admin.username in page.text
    row = page.text.split(other.username, 1)[1].split("</tr>", 1)[0]
    assert '<td class="num">1</td>' in row  # one module complete
    assert '<td class="num">50</td>' in row  # its XP


@pytest.mark.criterion(281, "Resetting progress clears the learner's state and keeps the account")
def test_a_reset_clears_learner_state_and_keeps_the_account(as_admin, make_user):
    target, bystander = make_user(), make_user()
    _seed(target.id)
    _seed(bystander.id)
    with SessionLocal() as db:
        spend = AiRequest(user_id=target.id, purpose="hint", model="claude-haiku-5-5", input_tokens=1, output_tokens=1, cost_microcents=1)
        db.add(spend)
        db.commit()
        spend_id = spend.id
    try:
        response = _reset(as_admin, target.id)
        assert response.status_code == 200
        assert f"{target.username}&#39;s progress was reset." in response.text
        assert not any(_counts(target.id).values())
        assert all(_counts(bystander.id).values())
        with SessionLocal() as db:
            assert db.get(User, target.id) is not None
            assert db.get(AiRequest, spend_id).user_id == target.id
        assert login(as_admin, target.username).status_code == 303  # their login still works
    finally:
        with SessionLocal() as db:
            db.execute(delete(AiRequest).where(AiRequest.id == spend_id))
            db.commit()


@pytest.mark.criterion(281, "A wrong password resets nothing")
def test_a_wrong_password_resets_nothing(as_admin, make_user):
    target = make_user()
    _seed(target.id)
    response = _reset(as_admin, target.id, password="not the password")
    assert response.status_code == 400
    assert "That password is wrong. Nothing was changed." in response.text
    assert all(_counts(target.id).values())


def test_the_password_check_is_rate_limited(as_admin, make_user, monkeypatch):
    from app.security import login_limiter

    target = make_user()
    _seed(target.id)
    monkeypatch.setattr(login_limiter, "hit", lambda key: False)
    response = _reset(as_admin, target.id)
    assert "Too many attempts" in response.text
    assert all(_counts(target.id).values())


@pytest.mark.criterion(281, "The reset needs the CSRF token")
def test_a_reset_without_the_csrf_token_deletes_nothing(as_admin, make_user):
    target = make_user()
    _seed(target.id)
    assert _reset(as_admin, target.id, token=False).status_code == 403
    assert all(_counts(target.id).values())


def test_resetting_an_unknown_user_is_a_404(as_admin):
    assert _reset(as_admin, 2_000_000_000).status_code == 404


@pytest.mark.criterion(281, "The script can make an admin")
def test_create_user_admin_flag(monkeypatch):
    name = "script-admin-281"
    monkeypatch.setattr(create_user.getpass, "getpass", lambda prompt="": PASSWORD)
    try:
        monkeypatch.setattr("sys.argv", ["create_user", name, "--admin"])
        assert create_user.main() == 0
        monkeypatch.setattr("sys.argv", ["create_user", name])  # a reset without the flag keeps it
        assert create_user.main() == 0
        with SessionLocal() as db:
            assert db.scalar(select(User.is_admin).where(User.username == name)) is True
    finally:
        with SessionLocal() as db:
            db.execute(delete(User).where(User.username == name))
            db.commit()


NEW_PASSWORD = "a brand new password"


@pytest.fixture
def new_name():
    """A unique username for an account a test creates, deleted afterwards."""
    name = f"made-{uuid.uuid4().hex[:12]}"
    yield name
    with SessionLocal() as db:
        db.execute(delete(User).where(User.username == name))
        db.commit()


def _create(client, username, *, new=NEW_PASSWORD, repeat=NEW_PASSWORD, password=PASSWORD, make_admin=False):
    data = {"username": username, "new_password": new, "new_password_repeat": repeat, "password": password, "csrf_token": csrf(client)}
    if make_admin:
        data["make_admin"] = "true"
    return client.post("/admin/users", data=data)


def _account(username):
    with SessionLocal() as db:
        return db.scalar(select(User).where(User.username == username))


@pytest.mark.criterion(282, "An admin creates a user")
def test_an_admin_creates_a_user_who_can_log_in(as_admin, new_name):
    response = _create(as_admin, f"  {new_name} ")
    assert response.status_code == 200
    assert f"Created {new_name}." in response.text
    made = _account(new_name)
    assert made is not None and made.is_admin is False
    assert not any(_counts(made.id).values())
    with TestClient(app, base_url="http://testserver") as fresh:
        assert login(fresh, new_name, NEW_PASSWORD).status_code == 303


@pytest.mark.criterion(282, "An admin creates another admin")
def test_an_admin_creates_another_admin(as_admin, new_name):
    assert "as an admin" in _create(as_admin, new_name, make_admin=True).text
    assert _account(new_name).is_admin is True


@pytest.mark.criterion(282, "Bad input creates nothing")
@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"new": "too short 1", "repeat": "too short 1"}, "at least 12 characters"),
        ({"repeat": "a different password"}, "don&#39;t match"),
    ],
)
def test_bad_input_creates_nothing(as_admin, new_name, kwargs, message):
    response = _create(as_admin, new_name, **kwargs)
    assert response.status_code == 400
    assert message in response.text
    assert _account(new_name) is None


@pytest.mark.criterion(282, "Bad input creates nothing")
def test_a_taken_username_is_refused(as_admin, make_user):
    taken = make_user()
    response = _create(as_admin, taken.username)
    assert response.status_code == 400
    assert f"There is already an account called {taken.username}." in response.text
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(User).where(User.username == taken.username)) == 1


@pytest.mark.criterion(282, "The admin's password is required")
def test_creating_needs_the_admins_password(as_admin, new_name):
    response = _create(as_admin, new_name, password="not the password")
    assert response.status_code == 400
    assert "That password is wrong. Nothing was changed." in response.text
    assert _account(new_name) is None


def test_a_non_admin_cannot_create_an_account(logged_in, new_name):
    assert _create(logged_in, new_name).status_code == 404
    assert _account(new_name) is None


def test_the_script_and_the_panel_share_one_length_rule():
    from app.security import PASSWORD_MIN_LENGTH

    assert create_user.PASSWORD_MIN_LENGTH is PASSWORD_MIN_LENGTH == 12


def test_creating_needs_the_csrf_token(as_admin, new_name):
    data = {"username": new_name, "new_password": NEW_PASSWORD, "new_password_repeat": NEW_PASSWORD, "password": PASSWORD}
    assert as_admin.post("/admin/users", data=data).status_code == 403
    assert _account(new_name) is None


def test_a_name_taken_after_the_check_is_refused_not_a_500(as_admin, make_user, monkeypatch):
    from app import admin as panel

    taken = make_user()
    monkeypatch.setattr(panel, "new_account_problem", lambda *args: None)  # the race: the check saw it free
    response = _create(as_admin, taken.username)
    assert response.status_code == 400
    assert f"There is already an account called {taken.username}." in response.text


# --- #283: managing one account ---------------------------------------------

@pytest.fixture
def other_client():
    """A second browser, for the account being managed."""
    with TestClient(app, base_url="http://testserver") as c:
        yield c


def _post(client, user_id, action, **data):
    return client.post(f"/admin/users/{user_id}/{action}", data={"password": PASSWORD, "csrf_token": csrf(client)} | data)


def _sent_to_login(client) -> bool:
    response = client.get("/", follow_redirects=False)
    return response.status_code == 303 and response.headers["location"] == "/login"


def test_an_account_page_lists_the_actions(as_admin, make_user):
    target = make_user()
    page = as_admin.get(f"/admin/users/{target.id}")
    assert page.status_code == 200
    for action in ("password", "logout", "delete", "progress.json"):
        assert f"/admin/users/{target.id}/{action}" in page.text
    assert f'href="/admin/users/{target.id}"' in as_admin.get("/admin").text


@pytest.mark.criterion(283, "Resetting a password ends their sessions")
def test_a_new_password_ends_their_sessions(as_admin, make_user, other_client):
    target = make_user()
    assert login(other_client, target.username).status_code == 303
    response = _post(as_admin, target.id, "password", new_password=NEW_PASSWORD, new_password_repeat=NEW_PASSWORD)
    assert response.status_code == 200
    assert "has a new password" in response.text
    assert _sent_to_login(other_client)
    assert login(other_client, target.username, NEW_PASSWORD).status_code == 303
    assert login(other_client, target.username, PASSWORD).status_code == 401


def test_a_bad_new_password_changes_nothing(as_admin, make_user, other_client):
    target = make_user()
    assert login(other_client, target.username).status_code == 303
    response = _post(as_admin, target.id, "password", new_password="short", new_password_repeat="short")
    assert response.status_code == 400
    assert not _sent_to_login(other_client)


@pytest.mark.criterion(283, "Log out everywhere")
def test_log_out_everywhere_keeps_the_password(as_admin, make_user, other_client):
    target = make_user()
    assert login(other_client, target.username).status_code == 303
    assert "has ended" in _post(as_admin, target.id, "logout").text
    assert _sent_to_login(other_client)
    assert login(other_client, target.username).status_code == 303


def test_logging_yourself_out_everywhere_keeps_this_session(as_admin, admin, other_client):
    assert login(other_client, admin.username).status_code == 303
    assert _post(as_admin, admin.id, "logout").status_code == 200
    assert _sent_to_login(other_client)
    assert as_admin.get("/admin").status_code == 200


@pytest.mark.criterion(283, "Deleting a user")
def test_deleting_a_user_keeps_their_ai_spend(as_admin, make_user):
    target = make_user()
    _seed(target.id)
    with SessionLocal() as db:
        spend = AiRequest(user_id=target.id, purpose="hint", model="claude-haiku-5-5", input_tokens=1, output_tokens=1, cost_microcents=1)
        db.add(spend)
        db.commit()
        spend_id = spend.id
    try:
        response = _post(as_admin, target.id, "delete")
        assert response.status_code == 200
        assert f"Deleted {target.username}." in response.text
        with SessionLocal() as db:
            assert db.get(User, target.id) is None
            assert db.get(AiRequest, spend_id).user_id is None
        assert not any(_counts(target.id).values())
    finally:
        with SessionLocal() as db:
            db.execute(delete(AiRequest).where(AiRequest.id == spend_id))
            db.commit()


def test_deleting_needs_the_admins_password(as_admin, make_user):
    target = make_user()
    assert _post(as_admin, target.id, "delete", password="not the password").status_code == 400
    assert _account(target.username) is not None


@pytest.mark.criterion(283, "An admin can't delete themselves")
def test_an_admin_cannot_delete_themselves(as_admin, admin):
    response = _post(as_admin, admin.id, "delete")
    assert response.status_code == 400
    assert "You can&#39;t delete your own account." in response.text
    assert _account(admin.username) is not None
    assert f"/admin/users/{admin.id}/delete" not in as_admin.get(f"/admin/users/{admin.id}").text


@pytest.mark.criterion(283, "The progress export holds progress and no secrets")
def test_the_progress_export_holds_progress_and_no_secrets(as_admin, make_user, other_client):
    target = make_user()
    _seed(target.id)
    response = as_admin.get(f"/admin/users/{target.id}/progress.json")
    assert response.status_code == 200
    assert f'filename="orbit-progress-{target.username}-' in response.headers["content-disposition"]
    data = response.json()
    assert data["username"] == target.username
    assert {table: len(rows) for table, rows in data["tables"].items()} == {m.__tablename__: 1 for m in LEARNER_STATE}
    assert data["tables"]["module_progress"][0]["module_slug"] == "the-filesystem"
    with SessionLocal() as db:
        secrets = db.execute(select(User.password_hash, User.session_token).where(User.id == target.id)).one()
    assert not any(secret in response.text for secret in secrets)
    assert "password" not in response.text and "session_token" not in response.text
    assert login(other_client, target.username).status_code == 303  # a non-admin
    assert other_client.get(f"/admin/users/{target.id}/progress.json").status_code == 404


@pytest.mark.parametrize("action", ["password", "logout", "delete"])
def test_a_non_admin_cannot_manage_an_account(logged_in, make_user, action):
    target = make_user()
    assert _post(logged_in, target.id, action, new_password=NEW_PASSWORD, new_password_repeat=NEW_PASSWORD).status_code == 404
    assert _account(target.username) is not None


def test_an_awkward_username_still_downloads(as_admin):
    name = 'Zoë "the" admin\r\n'
    with SessionLocal() as db:
        odd = User(username=name, password_hash="x")
        db.add(odd)
        db.commit()
        odd_id = odd.id
    try:
        response = as_admin.get(f"/admin/users/{odd_id}/progress.json")
        assert response.status_code == 200
        assert 'filename="orbit-progress-Zo___the__admin__-' in response.headers["content-disposition"]
        assert response.headers["cache-control"] == "no-store"
        assert response.json()["username"] == name
    finally:
        with SessionLocal() as db:
            db.execute(delete(User).where(User.id == odd_id))
            db.commit()
