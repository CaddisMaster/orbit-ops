"""badges earned

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-09

Deploy phase: expand. One new table, nothing existing changes, so the running
image is unaffected. orbit_app's grants come from 0002's default privileges
(tests/test_migrations.py checks it).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "badges_earned",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("badge_slug", sa.String(64), nullable=False),
        sa.Column("earned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id", "badge_slug"),
    )


def downgrade() -> None:
    op.drop_table("badges_earned")
