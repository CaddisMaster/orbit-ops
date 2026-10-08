"""module progress and exercise attempts

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-08

Deploy phase: expand. Two new tables, nothing existing changes, so the running
0.1.0 image is unaffected. orbit_app's grants on them come from the default
privileges set in 0002 (tests/test_migrations.py checks it).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "module_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("module_slug", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('in_progress', 'complete')", name="module_progress_status"),
        sa.CheckConstraint("score IS NULL OR score BETWEEN 0 AND 100", name="module_progress_score"),
        sa.UniqueConstraint("user_id", "module_slug"),
    )
    op.create_table(
        "exercise_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("module_slug", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("item", sa.Integer(), nullable=False),
        sa.Column("submitted", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("correct", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_exercise_attempts_user_module", "exercise_attempts", ["user_id", "module_slug"])


def downgrade() -> None:
    op.drop_index("ix_exercise_attempts_user_module", table_name="exercise_attempts")
    op.drop_table("exercise_attempts")
    op.drop_table("module_progress")
