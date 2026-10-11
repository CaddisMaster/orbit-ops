"""What the migrations leave behind, checked against the migrated test database."""

from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db import SessionLocal
from app.models import ActivityDay, BadgeEarned, CardState, XpEvent

ROLE = "orbit_app"


def _tables() -> list[str]:
    with SessionLocal() as db:
        return list(
            db.scalars(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'"))
        )


def test_there_are_tables_to_check():
    assert {"users", "module_progress", "exercise_attempts", "xp_events", "activity_days", "badges_earned", "card_state"} <= set(_tables())


@pytest.mark.parametrize("table", ["users", "module_progress", "exercise_attempts", "xp_events", "activity_days", "badges_earned", "card_state"])
def test_app_role_has_dml_but_not_truncate_on_every_table(table):
    # The later tables get their grants from 0002's ALTER DEFAULT PRIVILEGES,
    # not from a GRANT in their own migration. This is what proves that works.
    with SessionLocal() as db:

        def can(priv: str) -> bool:
            return db.scalar(text("SELECT has_table_privilege(:r, :t, :p)"), {"r": ROLE, "t": table, "p": priv})

        assert all(can(p) for p in ("SELECT", "INSERT", "UPDATE", "DELETE")), f"{ROLE} lacks DML on {table}"
        assert not can("TRUNCATE")


def test_app_role_cannot_touch_alembic_version_or_create_tables():
    with SessionLocal() as db:
        assert not db.scalar(text("SELECT has_table_privilege(:r, 'alembic_version', 'SELECT')"), {"r": ROLE})
        assert not db.scalar(text("SELECT has_schema_privilege(:r, 'public', 'CREATE')"), {"r": ROLE})


def test_app_role_can_use_the_new_sequences():
    with SessionLocal() as db:
        for seq in ("module_progress_id_seq", "exercise_attempts_id_seq", "xp_events_id_seq", "activity_days_id_seq", "badges_earned_id_seq", "card_state_id_seq"):
            assert db.scalar(text("SELECT has_sequence_privilege(:r, :s, 'USAGE')"), {"r": ROLE, "s": seq})


def test_the_same_xp_award_cannot_be_recorded_twice(make_user):
    # Idempotency lives in the schema, so a double submit can't race past an
    # app-level "already awarded?" check.
    user = make_user()
    with SessionLocal() as db:
        db.add(XpEvent(user_id=user.id, amount=50, reason="module_complete", ref="the-filesystem"))
        db.commit()
        db.add(XpEvent(user_id=user.id, amount=50, reason="module_complete", ref="the-filesystem"))
        with pytest.raises(IntegrityError):
            db.commit()


def test_a_zero_xp_event_is_refused(make_user):
    user = make_user()
    with SessionLocal() as db:
        db.add(XpEvent(user_id=user.id, amount=0, reason="module_complete", ref="the-filesystem"))
        with pytest.raises(IntegrityError):
            db.commit()


def test_a_day_is_recorded_once_per_learner(make_user):
    user = make_user()
    with SessionLocal() as db:
        # Raw SQL, so it is the column's server default that fills freeze_used.
        freeze_used = db.scalar(
            text("INSERT INTO activity_days (user_id, day) VALUES (:u, '2026-10-08') RETURNING freeze_used"),
            {"u": user.id},
        )
        db.commit()
        assert freeze_used is False
        db.add(ActivityDay(user_id=user.id, day=date(2026, 10, 8), freeze_used=True))
        with pytest.raises(IntegrityError):
            db.commit()


def test_a_badge_is_earned_once_per_learner(make_user):
    user = make_user()
    with SessionLocal() as db:
        # Raw SQL, so it is the column's server default that fills earned_at.
        earned_at = db.scalar(
            text("INSERT INTO badges_earned (user_id, badge_slug) VALUES (:u, 'streak-7') RETURNING earned_at"),
            {"u": user.id},
        )
        db.commit()
        assert earned_at is not None
        db.add(BadgeEarned(user_id=user.id, badge_slug="streak-7"))
        with pytest.raises(IntegrityError):
            db.commit()


def _card(user_id, **overrides):
    values = {"card_id": "the-filesystem/fhs", "ease": 2.5, "interval_days": 1, "due_on": date(2026, 10, 12), "last_reviewed_on": date(2026, 10, 11)}
    return CardState(user_id=user_id, **(values | overrides))


def test_a_card_has_one_schedule_per_learner(make_user):
    user, other = make_user(), make_user()
    with SessionLocal() as db:
        # Raw SQL, so it is the columns' server defaults that fill reps and lapses.
        reps, lapses = db.execute(
            text(
                "INSERT INTO card_state (user_id, card_id, ease, interval_days, due_on, last_reviewed_on)"
                " VALUES (:u, 'the-filesystem/fhs', 2.5, 1, '2026-10-12', '2026-10-11') RETURNING reps, lapses"
            ),
            {"u": user.id},
        ).one()
        assert (reps, lapses) == (0, 0)
        db.add(_card(other.id))  # the same card, another learner: fine
        db.commit()
        db.add(_card(user.id))
        with pytest.raises(IntegrityError):
            db.commit()


@pytest.mark.parametrize(("column", "value"), [("ease", 1.29), ("interval_days", 0), ("reps", -1), ("lapses", -1)])
def test_a_schedule_sm2_could_not_produce_is_refused(make_user, column, value):
    user = make_user()
    with SessionLocal() as db:
        db.add(_card(user.id, **{column: value}))
        with pytest.raises(IntegrityError):
            db.commit()
