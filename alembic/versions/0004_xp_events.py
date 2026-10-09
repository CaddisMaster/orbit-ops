"""xp events

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-08

Deploy phase: expand. One new table, nothing existing changes, so the running
0.2.0 image is unaffected. orbit_app's grants come from 0002's default
privileges (tests/test_migrations.py checks it).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "xp_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("ref", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount <> 0", name="xp_events_amount_nonzero"),
        sa.UniqueConstraint("user_id", "reason", "ref"),
    )


def downgrade() -> None:
    op.drop_table("xp_events")
