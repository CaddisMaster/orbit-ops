"""The admin panel (#281, #282, #283, #284, #285). Admins only: everyone else gets a 404.
Each destructive action asks for the admin's password again."""

import logging
import re
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import admin as panel
from app import spend
from app.config import get_settings
from app.content import Catalog, get_catalog
from app.db import get_db
from app.models import User
from app.security import PASSWORD_MIN_LENGTH, confirm_password, login_session, require_admin
from app.static_files import PYODIDE_VERSION
from app.templating import templates

router = APIRouter(prefix="/admin")
log = logging.getLogger("orbit.admin")


def _page(request: Request, admin: User, db: Session, *, notice: str | None = None, error: str | None = None, status_code: int = 200):
    return templates.TemplateResponse(
        request,
        "admin.html",
        {
            "user": admin, "learners": panel.learners(db), "notice": notice, "error": error,
            "password_min_length": PASSWORD_MIN_LENGTH, "catalog": get_catalog(request),
        },
        status_code=status_code,
    )


@router.get("", response_class=HTMLResponse)
def admin_page(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _page(request, admin, db)


@router.post("/users/{user_id}/reset", response_class=HTMLResponse)
def reset_progress(
    request: Request,
    user_id: int,
    password: Annotated[str, Form(max_length=1024)],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404)
    if error := confirm_password(request, admin, password):
        log.warning("admin %s failed the password check to reset user %s", admin.id, target.id)
        return _page(request, admin, db, error=error, status_code=400)
    panel.reset_progress(db, target.id)
    db.commit()
    log.info("admin %s reset the progress of user %s", admin.id, target.id)
    return _page(request, admin, db, notice=f"{target.username}'s progress was reset.")


@router.post("/users", response_class=HTMLResponse)
def create_account(
    request: Request,
    username: Annotated[str, Form(max_length=64)],
    new_password: Annotated[str, Form(max_length=1024)],
    new_password_repeat: Annotated[str, Form(max_length=1024)],
    password: Annotated[str, Form(max_length=1024)],
    make_admin: Annotated[bool, Form()] = False,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if error := confirm_password(request, admin, password):
        log.warning("admin %s failed the password check to create an account", admin.id)
        return _page(request, admin, db, error=error, status_code=400)
    username = username.strip()
    if problem := panel.new_account_problem(db, username, new_password, new_password_repeat):
        return _page(request, admin, db, error=problem, status_code=400)
    try:
        user = panel.create_account(db, username, new_password, is_admin=make_admin)
        db.commit()
    except IntegrityError:  # the same name, created between the check and here
        db.rollback()
        return _page(request, admin, db, error=f"There is already an account called {username}.", status_code=400)
    log.info("admin %s created user %s%s", admin.id, user.id, " (admin)" if make_admin else "")
    return _page(request, admin, db, notice=f"Created {username}{' as an admin' if make_admin else ''}.")


def _target(db: Session, user_id: int) -> User:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404)
    return target


def _account_page(request: Request, admin: User, target: User, *, notice: str | None = None, error: str | None = None, status_code: int = 200):
    return templates.TemplateResponse(
        request,
        "admin_account.html",
        {"user": admin, "target": target, "notice": notice, "error": error, "password_min_length": PASSWORD_MIN_LENGTH},
        status_code=status_code,
    )


@router.get("/users/{user_id}", response_class=HTMLResponse)
def account_page(request: Request, user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _account_page(request, admin, _target(db, user_id))


@router.post("/users/{user_id}/password", response_class=HTMLResponse)
def new_password(
    request: Request,
    user_id: int,
    new_password: Annotated[str, Form(max_length=1024)],
    new_password_repeat: Annotated[str, Form(max_length=1024)],
    password: Annotated[str, Form(max_length=1024)],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = _target(db, user_id)
    if error := confirm_password(request, admin, password):
        log.warning("admin %s failed the password check to set user %s's password", admin.id, target.id)
        return _account_page(request, admin, target, error=error, status_code=400)
    if problem := panel.password_problem(new_password, new_password_repeat):
        return _account_page(request, admin, target, error=problem, status_code=400)
    panel.set_password(target, new_password)
    db.commit()
    if target.id == admin.id:
        login_session(request, target)  # the admin's own sessions end, except this one
    log.info("admin %s set a new password for user %s", admin.id, target.id)
    return _account_page(request, admin, target, notice=f"{target.username} has a new password, and every session of theirs has ended.")


@router.post("/users/{user_id}/logout", response_class=HTMLResponse)
def logout_everywhere(
    request: Request,
    user_id: int,
    password: Annotated[str, Form(max_length=1024)],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = _target(db, user_id)
    if error := confirm_password(request, admin, password):
        log.warning("admin %s failed the password check to log out user %s", admin.id, target.id)
        return _account_page(request, admin, target, error=error, status_code=400)
    panel.log_out_everywhere(target)
    db.commit()
    if target.id == admin.id:
        login_session(request, target)
    log.info("admin %s logged out user %s everywhere", admin.id, target.id)
    return _account_page(request, admin, target, notice=f"Every session of {target.username}'s has ended.")


@router.post("/users/{user_id}/delete", response_class=HTMLResponse)
def delete_account(
    request: Request,
    user_id: int,
    password: Annotated[str, Form(max_length=1024)],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = _target(db, user_id)
    if target.id == admin.id:
        return _account_page(request, admin, target, error="You can't delete your own account.", status_code=400)
    if error := confirm_password(request, admin, password):
        log.warning("admin %s failed the password check to delete user %s", admin.id, target.id)
        return _account_page(request, admin, target, error=error, status_code=400)
    username = target.username
    db.delete(target)  # learner state cascades; ai_requests keep their rows (SET NULL)
    db.commit()
    log.info("admin %s deleted user %s", admin.id, user_id)
    return _page(request, admin, db, notice=f"Deleted {username}.")


@router.get("/users/{user_id}/progress.json")
def progress_json(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    target = _target(db, user_id)
    # Usernames are free text; a header can't carry a quote, a newline or non-Latin-1.
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", target.username)
    filename = f"orbit-progress-{safe}-{datetime.now(get_settings().tz).date().isoformat()}.json"
    return JSONResponse(
        panel.progress_export(db, target),
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


@router.get("/ai", response_class=HTMLResponse)
def ai_spend(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    now = spend.now()
    return templates.TemplateResponse(
        request,
        "admin_ai.html",
        {
            "user": admin,
            "spent": spend.spent_this_month(db, now),
            "budget": spend.budget_microcents(),
            "online": spend.uplink_online(db, now),
            "month": spend.month_bounds(now)[0],
            "requests": panel.month_requests(db, now),
            "tz": get_settings().tz,
        },
    )


@router.get("/system", response_class=HTMLResponse)
def system(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db), catalog: Catalog = Depends(get_catalog)):
    settings = get_settings()
    head = panel.code_head()
    return templates.TemplateResponse(
        request,
        "admin_system.html",
        {
            "user": admin,
            "app_version": settings.app_version,
            "app_commit": settings.app_commit,
            "pyodide_version": PYODIDE_VERSION,
            "code_head": head,
            "db_revision": panel.database_revision(db),
            "catalog": {"tracks": len(catalog.tracks), "units": len(catalog.units), "modules": len(catalog.modules)},
            "counts": panel.table_counts(db),
        },
    )


@router.post("/reset-part", response_class=HTMLResponse)
def reset_part(
    request: Request,
    user_id: Annotated[int, Form()],
    part: Annotated[str, Form(max_length=80)],
    password: Annotated[str, Form(max_length=1024)],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    catalog: Catalog = Depends(get_catalog),
):
    """Reset one module ("module:<slug>") or every module of one unit ("unit:<slug>")."""
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404)
    kind, _, slug = part.partition(":")
    if kind == "module" and slug in catalog.modules:
        slugs, name = [slug], f"“{catalog.modules[slug].title}”"
    elif kind == "unit" and slug in catalog.units:
        slugs, name = list(catalog.units[slug].modules), f"unit {catalog.unit_code(slug)}, {catalog.units[slug].title}"
    else:
        return _page(request, admin, db, error="Choose a module or a unit to reset.", status_code=400)
    if error := confirm_password(request, admin, password):
        log.warning("admin %s failed the password check to reset %s for user %s", admin.id, part, target.id)
        return _page(request, admin, db, error=error, status_code=400)
    panel.reset_modules(db, target.id, slugs)
    db.commit()
    log.info("admin %s reset %s for user %s", admin.id, part, target.id)
    return _page(request, admin, db, notice=f"Reset {name} for {target.username}.")


@router.get("/preview/{slug}", response_class=HTMLResponse)
def preview(request: Request, slug: str, admin: User = Depends(require_admin), catalog: Catalog = Depends(get_catalog)):
    """A module's lesson, quiz and tasks, read-only, locked or not. Nothing here
    writes: no progress row, no XP, and nothing on the page can be answered."""
    module = catalog.modules.get(slug)
    if module is None:
        raise HTTPException(status_code=404)
    return templates.TemplateResponse(
        request,
        "admin_preview.html",
        {"user": admin, "module": module, "unit": catalog.units[module.unit], "unit_code": catalog.unit_code(module.unit)},
    )
