"""The admin panel (#281): who may see it, and the progress reset."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, text, update

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


# --- #285: the AI spend and system pages -----------------------------------

PINNED = datetime(2031, 3, 15, 12, 0, tzinfo=UTC)  # a month no other test writes to


@pytest.fixture
def march_requests(make_user, monkeypatch):
    """Two AI calls in the pinned month and one the month before."""
    from app import spend

    monkeypatch.setattr(spend, "_now", lambda: PINNED)
    learner = make_user()
    rows = [
        AiRequest(user_id=learner.id, purpose="hint", model="claude-haiku-5-5", input_tokens=900, output_tokens=120, cost_microcents=51_000, created_at=PINNED - timedelta(days=2)),
        AiRequest(user_id=learner.id, purpose="lab_review", model="claude-sonnet-5-5", input_tokens=3000, output_tokens=600, cost_microcents=1_830_000, created_at=PINNED - timedelta(days=1)),
        AiRequest(user_id=learner.id, purpose="hint", model="claude-haiku-5-5", input_tokens=900, output_tokens=120, cost_microcents=777_000, created_at=PINNED - timedelta(days=30)),
    ]
    with SessionLocal() as db:
        db.add_all(rows)
        db.commit()
        ids = [r.id for r in rows]
    yield learner
    with SessionLocal() as db:
        db.execute(delete(AiRequest).where(AiRequest.id.in_(ids)))
        db.commit()


@pytest.mark.criterion(285, "The spend page agrees with the budget gate")
def test_the_spend_page_agrees_with_the_budget_gate(as_admin, march_requests):
    from app import spend

    page = as_admin.get("/admin/ai")
    assert page.status_code == 200
    with SessionLocal() as db:
        total = spend.spent_this_month(db, PINNED)
    assert total == 1_881_000  # the two March calls, not February's
    assert f"${total / 100_000_000:.2f} of $5.00 spent in March 2031" in page.text
    assert "0.051¢" in page.text and "1.830¢" in page.text
    assert "0.777¢" not in page.text  # last month's call isn't listed
    assert page.text.count(march_requests.username) == 2


@pytest.mark.criterion(285, "The system page shows the running versions")
def test_the_system_page_shows_the_running_versions(as_admin):
    from app.admin import code_head
    from app.static_files import PYODIDE_VERSION

    page = as_admin.get("/admin/system")
    assert page.status_code == 200
    assert PYODIDE_VERSION in page.text
    assert f"head {code_head()}" in page.text
    # The test database is reached as its owner, which may read alembic_version.
    assert f"{code_head()}: at head" in page.text


def test_the_system_page_says_when_the_revision_is_unreadable(as_admin, monkeypatch):
    from app import admin as panel

    monkeypatch.setattr(panel, "database_revision", lambda db: None)  # production's orbit_app
    assert "not readable by the app's database role" in as_admin.get("/admin/system").text


def test_the_app_role_really_cannot_read_the_revision():
    """Why the page can't always show it: 0002's grants, which this PR leaves alone."""
    with SessionLocal() as db:
        assert not db.scalar(text("SELECT has_table_privilege('orbit_app', 'alembic_version', 'SELECT')"))


@pytest.mark.criterion(285, "No secrets on the admin pages")
def test_no_secrets_on_the_admin_pages(as_admin, monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test-SECRET-key-285")
    monkeypatch.setattr(settings, "db_password", "db-SECRET-password-285")
    monkeypatch.setattr(settings, "db_app_password", "app-SECRET-password-285")
    for path in ("/admin/ai", "/admin/system"):
        body = as_admin.get(path).text
        assert "SECRET" not in body, path


@pytest.mark.criterion(285, "Admin only")
@pytest.mark.parametrize("path", ["/admin/ai", "/admin/system"])
def test_the_read_only_pages_are_admin_only(logged_in, path):
    assert logged_in.get(path).status_code == 404
