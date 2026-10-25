"""The admin panel (#281). Admins only: everyone else gets a 404.
Each destructive action asks for the admin's password again."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app import admin as panel
from app.db import get_db
from app.models import User
from app.security import confirm_password, require_admin
from app.templating import templates

router = APIRouter(prefix="/admin")
log = logging.getLogger("orbit.admin")


def _page(request: Request, admin: User, db: Session, *, notice: str | None = None, error: str | None = None, status_code: int = 200):
    return templates.TemplateResponse(
        request,
        "admin.html",
        {"user": admin, "learners": panel.learners(db), "notice": notice, "error": error},
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
