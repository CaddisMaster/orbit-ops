"""What the migrations leave behind, checked against the migrated test database."""

import pytest
from sqlalchemy import text

from app.db import SessionLocal

ROLE = "orbit_app"


def _tables() -> list[str]:
    with SessionLocal() as db:
        return list(
            db.scalars(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'"))
        )


def test_there_are_tables_to_check():
    assert {"users", "module_progress", "exercise_attempts"} <= set(_tables())


@pytest.mark.parametrize("table", ["users", "module_progress", "exercise_attempts"])
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
        for seq in ("module_progress_id_seq", "exercise_attempts_id_seq"):
            assert db.scalar(text("SELECT has_sequence_privilege(:r, :s, 'USAGE')"), {"r": ROLE, "s": seq})
