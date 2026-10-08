"""Login and logout. Single-user app: accounts are created with
scripts/create_user.py, never through the web."""

from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.security import client_ip, current_user, login_limiter, login_session, verify_password
from app.templating import templates

router = APIRouter()


@router.get("/login", response_class=HTMLResponse)
def login_form(request: Request, user: User | None = Depends(current_user)):
    if user is not None:
        return RedirectResponse("/", status_code=303)
    return templates.TemplateResponse(request, "login.html", {})


@router.post("/login", response_class=HTMLResponse)
def login(
    request: Request,
    username: Annotated[str, Form(max_length=64)],
    password: Annotated[str, Form(max_length=1024)],
    db: Session = Depends(get_db),
):
    if not login_limiter.hit(client_ip(request)):
        return templates.TemplateResponse(
            request, "login.html", {"error": "Too many attempts. Wait a minute and try again."}, status_code=429
        )
    user = db.scalar(select(User).where(User.username == username.strip()))
    if not verify_password(user.password_hash if user else None, password):
        # One message for both cases: never reveal whether the username exists.
        return templates.TemplateResponse(
            request, "login.html", {"error": "Invalid username or password."}, status_code=401
        )
    login_session(request, user)
    return RedirectResponse("/", status_code=303)


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=303)
