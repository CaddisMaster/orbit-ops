"""The admin panel (#281): who may see it, and the progress reset."""

from datetime import date

import pytest
from sqlalchemy import delete, func, select, update

from app.admin import LEARNER_STATE
from app.db import SessionLocal
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
