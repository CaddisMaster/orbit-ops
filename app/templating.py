"""The shared Jinja environment. Every template gets `request`, from which it
reads the CSP nonce (request.state.csp_nonce) and the CSRF token."""

from pathlib import Path

from fastapi.templating import Jinja2Templates

from app.comms import WINDOW_SPRITES
from app.config import get_settings
from app.content.render import render_inline
from app.flash import pop_flash
from app.security import csrf_token

templates = Jinja2Templates(directory=Path(__file__).parent / "templates")
templates.env.auto_reload = get_settings().templates_auto_reload
templates.env.globals["csrf_token"] = csrf_token
templates.env.globals["pop_flash"] = pop_flash
templates.env.globals["app_version"] = get_settings().app_version
templates.env.filters["md"] = render_inline
templates.env.globals["window_sprites"] = WINDOW_SPRITES
