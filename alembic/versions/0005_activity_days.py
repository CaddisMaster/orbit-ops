"""activity days

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-08

Deploy phase: expand. One new table, nothing existing changes, so the running
image is unaffected. orbit_app's grants come from 0002's default privileges
(tests/test_migrations.py checks it).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "activity_days",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("freeze_used", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id", "day"),
    )


def downgrade() -> None:
    op.drop_table("activity_days")
