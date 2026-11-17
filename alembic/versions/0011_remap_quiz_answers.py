"""remap stored quiz answers to the reordered options

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-17

Deploy phase: data. No schema change. #418 moves the options of 117 quiz questions
in 38 modules, so the right answer no longer sits in one position (#417). A quiz
attempt stores the POSITIONS of the options picked (`submitted`, e.g. ["2"]), and the
module page shows `options[position]` as "your answer", so without this a finished
module's history would name the wrong option. Scores and XP don't move: `correct` is
stored, not recomputed.

The table is written out here, not read from content/, because content changes later.
POSITIONS[slug][item][old] is where the option that was at position `old` is now.

The content change ships in the same release. Rolled back without a downgrade, the
previous image still works: the positions stay in range, and only "your answer" on a
reordered question names the wrong option. So does an answer the old image records in
the seconds between this migration and the new image starting. Both are cosmetic.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# fmt: off
POSITIONS: dict[str, dict[int, tuple[int, ...]]] = {
    "navigating": {0: (0, 3, 2, 1), 1: (1, 0, 2, 3), 2: (1, 0, 2, 3)},
    "text-tools": {0: (0, 2, 1, 3), 2: (0, 2, 1, 3), 3: (1, 0, 2, 3)},
    "environment-and-path": {0: (0, 3, 2, 1), 1: (0, 2, 1, 3), 3: (0, 2, 1, 3)},
    "packages": {2: (0, 3, 2, 1)},
    "reading-and-editing": {0: (1, 0, 2, 3), 2: (2, 1, 0, 3), 3: (1, 0, 2, 3), 4: (2, 3, 1, 0)},
    "finding-things-and-disk-space": {0: (3, 1, 2, 0), 1: (2, 1, 0, 3), 2: (2, 1, 0, 3), 4: (3, 1, 2, 0)},
    "your-first-script": {1: (1, 0, 2, 3), 3: (1, 0, 2, 3)},
    "variables-and-quoting": {1: (3, 1, 2, 0), 2: (1, 0, 2, 3), 4: (2, 1, 0, 3)},
    "conditionals": {0: (2, 1, 0, 3), 3: (3, 1, 2, 0)},
    "loops": {2: (3, 1, 2, 0), 3: (2, 1, 0, 3)},
    "arguments-and-input": {0: (3, 1, 2, 0), 1: (3, 1, 2, 0), 2: (2, 1, 0, 3), 4: (1, 0, 2, 3)},
    "functions": {0: (3, 1, 2, 0), 1: (3, 1, 2, 0), 2: (2, 1, 0, 3), 3: (1, 0, 2, 3)},
    "robust-scripts": {1: (1, 0, 2, 3)},
    "scheduling-with-cron": {0: (3, 1, 2, 0), 1: (2, 1, 0, 3), 2: (1, 0, 2, 3), 3: (2, 1, 0, 3)},
    "your-first-repository": {1: (3, 1, 2, 0), 2: (3, 0, 1, 2), 3: (1, 0, 2, 3)},
    "staging-and-diffs": {0: (2, 1, 0, 3), 1: (3, 1, 2, 0), 2: (2, 1, 0, 3), 4: (1, 0, 2, 3)},
    "reading-history": {1: (2, 1, 0, 3)},
    "branches-and-merging": {0: (3, 1, 2, 0), 1: (2, 1, 0, 3), 2: (2, 1, 0, 3)},
    "merge-conflicts": {0: (2, 1, 0, 3), 1: (1, 0, 2, 3), 3: (1, 0, 2, 3)},
    "remotes": {0: (3, 1, 2, 0), 1: (2, 1, 0, 3), 2: (2, 1, 0, 3), 3: (3, 1, 2, 0)},
    "undoing-things": {0: (2, 1, 0, 3), 1: (3, 1, 2, 0), 4: (1, 0, 2, 3)},
    "working-together": {0: (2, 1, 0, 3), 1: (2, 1, 0, 3), 2: (1, 0, 2, 3), 3: (3, 1, 2, 0)},
    "addresses-and-ports": {0: (1, 0, 2, 3), 1: (1, 0, 2, 3), 3: (3, 0, 2, 1)},
    "names-and-dns": {0: (3, 1, 2, 0), 1: (1, 0, 2, 3), 2: (1, 0, 2, 3), 3: (0, 3, 2, 1)},
    "is-it-reachable": {0: (1, 0, 2, 3), 1: (2, 1, 0, 3), 2: (1, 0, 2, 3), 4: (1, 3, 0, 2)},
    "http-by-hand": {0: (2, 1, 0, 3), 2: (3, 1, 2, 0), 3: (1, 3, 2, 0)},
    "apis-and-json": {0: (3, 1, 2, 0), 2: (2, 1, 0, 3), 3: (0, 3, 1, 2)},
    "tls-and-certificates": {0: (1, 0, 2, 3), 1: (1, 0, 2, 3), 3: (0, 2, 3, 1)},
    "ssh-keys": {0: (3, 1, 2, 0), 1: (1, 0, 2, 3), 2: (1, 0, 2, 3), 3: (3, 2, 0, 1)},
    "copying-and-tunnels": {0: (3, 1, 2, 0), 2: (2, 1, 0, 3), 3: (0, 3, 1, 2)},
    "firewalls": {0: (1, 0, 2, 3), 1: (2, 1, 0, 3), 3: (3, 1, 2, 0), 4: (1, 2, 3, 0)},
    "following-a-connection": {0: (3, 1, 2, 0), 1: (1, 0, 2, 3), 3: (1, 0, 2, 3)},
    "services": {1: (3, 1, 2, 0), 2: (3, 1, 2, 0)},
    "start-stop-enable": {0: (3, 1, 2, 0), 1: (1, 0, 2, 3), 2: (1, 0, 2, 3), 3: (1, 2, 3, 0)},
    "unit-files": {0: (2, 1, 0, 3), 1: (2, 1, 0, 3), 2: (3, 1, 2, 0), 3: (3, 2, 1, 0)},
    "writing-a-service": {0: (3, 1, 2, 0), 1: (2, 1, 0, 3), 3: (2, 0, 1, 3)},
    "timers": {0: (2, 1, 0, 3), 1: (1, 0, 2, 3), 3: (1, 0, 2, 3)},
    "the-journal": {1: (3, 1, 2, 0), 2: (3, 1, 2, 0)},
}
# fmt: on


def inverse(perm: tuple[int, ...]) -> tuple[int, ...]:
    back = [0] * len(perm)
    for old, new in enumerate(perm):
        back[new] = old
    return tuple(back)


def remap(submitted: list, perm: tuple[int, ...]) -> list:
    """The same picks at their new positions, in option order as a form posts them.
    Anything that isn't a position (Show me's empty list, a stray value) is left as it is."""
    if not submitted or not all(isinstance(v, str) and v.isdigit() and int(v) < len(perm) for v in submitted):
        return submitted
    return [str(p) for p in sorted(perm[int(v)] for v in submitted)]


def apply(conn: sa.Connection, positions: dict[str, dict[int, tuple[int, ...]]], user_id: int | None = None) -> int:
    """Rewrite every quiz attempt the table covers; `user_id` narrows it (tests). Returns rows changed."""
    attempts = sa.table(
        "exercise_attempts",
        sa.column("id", sa.Integer),
        sa.column("user_id", sa.Integer),
        sa.column("module_slug", sa.String),
        sa.column("kind", sa.String),
        sa.column("item", sa.Integer),
        sa.column("submitted", JSONB),
    )
    query = sa.select(attempts.c.id, attempts.c.module_slug, attempts.c.item, attempts.c.submitted).where(
        attempts.c.kind == "quiz", attempts.c.module_slug.in_(positions)
    )
    if user_id is not None:
        query = query.where(attempts.c.user_id == user_id)
    changed = 0
    for row in conn.execute(query).all():
        perm = positions[row.module_slug].get(row.item)
        if perm is None:
            continue
        new = remap(row.submitted, perm)
        if new != row.submitted:
            conn.execute(sa.update(attempts).where(attempts.c.id == row.id).values(submitted=new))
            changed += 1
    return changed


def backwards(positions: dict[str, dict[int, tuple[int, ...]]]) -> dict[str, dict[int, tuple[int, ...]]]:
    return {slug: {item: inverse(perm) for item, perm in items.items()} for slug, items in positions.items()}


def upgrade() -> None:
    apply(op.get_bind(), POSITIONS)


def downgrade() -> None:
    apply(op.get_bind(), backwards(POSITIONS))
