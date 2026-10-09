"""The console readout in the header of every signed-in page:
"SYSTEMS ONLINE 3/170 · STREAK 5".

A FastAPI dependency, so a page opts in with `console: Readout =
Depends(console_readout)` and passes it to its template. It shares the
request's user, catalog and session (FastAPI caches dependencies per request),
and reads only: the streak is computed without recording freezes, which stays
the dashboard's job.
"""

from dataclasses import dataclass

from fastapi import Depends
from sqlalchemy.orm import Session

from app import progress
from app.content import Catalog, get_catalog
from app.db import get_db
from app.game import streaks
from app.models import User
from app.security import require_user


@dataclass(frozen=True)
class Readout:
    online: int  # modules complete
    systems: int  # modules in the curriculum
    streak: int


def console_readout(
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
) -> Readout:
    completed = progress.completed_slugs(db, user.id)
    return Readout(
        online=len(completed & catalog.modules.keys()),
        systems=len(catalog.modules),
        streak=streaks.peek(db, user.id, streaks.today()).length,
    )
