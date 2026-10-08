"""least-privilege app role

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-08

The web app connects as `orbit_app`: DML on every table, no DDL, no TRUNCATE,
no access to alembic_version. ALTER DEFAULT PRIVILEGES means tables created by
LATER migrations are granted automatically — Budget Buddy instead has to keep
its role block last in schema.sql.

The role is created WITHOUT a password (this repository is public). Set one by
hand on the server: RUNBOOK §3. Roles are cluster-wide, hence IF NOT EXISTS (the
test database lives in the same cluster).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLE = "orbit_app"


def upgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{ROLE}') THEN
                CREATE ROLE {ROLE} LOGIN;
            END IF;
            EXECUTE format('GRANT CONNECT ON DATABASE %I TO {ROLE}', current_database());
        END
        $$;
        """
    )
    op.execute(f"GRANT USAGE ON SCHEMA public TO {ROLE}")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {ROLE}")
    op.execute(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {ROLE}")
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {ROLE}")
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {ROLE}")
    op.execute(f"REVOKE ALL ON alembic_version FROM {ROLE}")


def downgrade() -> None:
    # The role itself is left in place: it is cluster-wide and may hold grants
    # in other databases (the test database), so DROP ROLE would fail there.
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM {ROLE}")
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM {ROLE}")
    op.execute(f"REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {ROLE}")
    op.execute(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {ROLE}")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {ROLE}")
    op.execute(
        f"DO $$ BEGIN EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM {ROLE}', current_database()); END $$;"
    )
