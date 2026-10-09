"""Dashboard, the badges page and the health check."""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import progress
from app.config import get_settings
from app.console import Readout, console_readout
from app.content import Catalog, get_catalog
from app.db import get_db
from app.game import badges, streaks
from app.game.levels import standing
from app.game.xp import total_xp
from app.models import User
from app.security import require_user
from app.templating import templates

router = APIRouter()


@router.get("/healthz")
def healthz(db: Session = Depends(get_db)) -> JSONResponse:
    """Liveness + database reachability, and the version this image was built
    as, so the release workflow can confirm what is actually serving."""
    settings = get_settings()
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse({"status": "db_unavailable", "version": settings.app_version}, status_code=503)
    return JSONResponse({"status": "ok", "version": settings.app_version, "commit": settings.app_commit})


@router.get("/", response_class=HTMLResponse)
def dashboard(
    request: Request,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
    console: Readout = Depends(console_readout),
):
    completed = progress.completed_slugs(db, user.id)
    mission = progress.todays_mission(catalog, completed)
    streak = streaks.current_streak(db, user.id, streaks.today())
    db.commit()  # any freezes the streak just spent
    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {
            "user": user, "console": console,
            "mission": mission,
            "mission_unit": catalog.units[mission.unit] if mission else None,
            "done": len(completed & catalog.modules.keys()),
            "total": len(catalog.modules),
            "standing": standing(total_xp(db, user.id), catalog.ranks),
            "streak": streak,
            "max_freezes": streaks.MAX_FREEZES,
            "recent_badges": badges.recent(catalog, badges.earned(db, user.id), get_settings().tz),
        },
    )


@router.get("/badges", response_class=HTMLResponse)
def badge_page(
    request: Request,
    user: User = Depends(require_user),
    catalog: Catalog = Depends(get_catalog),
    db: Session = Depends(get_db),
    console: Readout = Depends(console_readout),
):
    shelf = badges.shelf(catalog, badges.earned(db, user.id), get_settings().tz)
    return templates.TemplateResponse(
        request,
        "badges.html",
        {"user": user, "console": console, "shelf": shelf, "held": sum(1 for s in shelf if s.earned_on)},
    )
