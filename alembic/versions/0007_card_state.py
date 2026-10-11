"""card state

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-11

Deploy phase: expand. One new table for flashcard schedules (#51), nothing
existing changes, so the running image is unaffected. orbit_app's grants come
from 0002's default privileges (tests/test_migrations.py checks it).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "card_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("card_id", sa.String(160), nullable=False),
        sa.Column("ease", sa.Float(), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("reps", sa.Integer(), server_default="0", nullable=False),
        sa.Column("lapses", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_reviewed_on", sa.Date(), nullable=False),
        sa.CheckConstraint("ease >= 1.3", name="card_state_ease_floor"),
        sa.CheckConstraint("interval_days >= 1", name="card_state_interval_positive"),
        sa.CheckConstraint("reps >= 0 AND lapses >= 0", name="card_state_counts"),
        sa.UniqueConstraint("user_id", "card_id"),
    )


def downgrade() -> None:
    op.drop_table("card_state")
