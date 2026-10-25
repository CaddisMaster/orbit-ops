"""users is_admin

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-25

Deploy phase: expand. One defaulted column on users, for who may use the admin
panel (#280). The running image never names it, so it is unaffected; the
server default makes every existing user a non-admin, so no backfill.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "is_admin")
