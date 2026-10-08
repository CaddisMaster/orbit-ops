"""The shared Jinja environment. Every template gets `request`, from which it
reads the CSP nonce (request.state.csp_nonce) and the CSRF token."""

from pathlib import Path

from fastapi.templating import Jinja2Templates

from app.config import get_settings
from app.security import csrf_token

templates = Jinja2Templates(directory=Path(__file__).parent / "templates")
templates.env.auto_reload = get_settings().templates_auto_reload
templates.env.globals["csrf_token"] = csrf_token
templates.env.globals["app_version"] = get_settings().app_version
