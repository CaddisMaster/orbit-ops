"""Application factory: middleware, routers, error handling."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.content import load_catalog
from app.routers import auth, learn, main
from app.security import CSRFError, HeadAsGetMiddleware, LoginRequired, SecurityHeadersMiddleware, csrf_protect
from app.templating import templates

log = logging.getLogger("orbit")

SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days: a daily-habit app should not nag for a password


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Load and validate the whole curriculum before serving anything. A
    # ContentError here stops startup — in CI's smoke test, long before
    # production — rather than surfacing as a 500 on one lesson page.
    app.state.catalog = load_catalog()
    log.info("Loaded %d modules in %d units", len(app.state.catalog.modules), len(app.state.catalog.units))
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        lifespan=lifespan,
        title="Orbit Ops",
        version=settings.app_version,
        # No public OpenAPI/Swagger UI: this is an HTML app for one user, and the
        # docs pages need inline scripts the CSP would block anyway.
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        dependencies=[Depends(csrf_protect)],
    )

    # Middleware runs outermost-last-added: headers wrap everything, including
    # responses produced by the session layer.
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret_key,
        session_cookie="orbit_session",
        max_age=SESSION_MAX_AGE,
        same_site="lax",
        https_only=settings.cookie_secure,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(HeadAsGetMiddleware)  # outermost: everything inside sees a GET

    app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")
    app.include_router(main.router)
    app.include_router(auth.router)
    app.include_router(learn.router)

    @app.exception_handler(LoginRequired)
    async def _login_required(request: Request, exc: LoginRequired) -> Response:
        if request.headers.get("hx-request"):
            # A redirect inside an HTMX swap would render the login page into a
            # fragment; HX-Redirect makes the browser navigate instead.
            return Response(status_code=401, headers={"HX-Redirect": "/login"})
        return RedirectResponse("/login", status_code=303)

    @app.exception_handler(CSRFError)
    async def _csrf_failed(request: Request, exc: CSRFError) -> Response:
        return _error_page(request, 403, "Your session expired. Reload the page and try again.")

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> Response:
        return _error_page(request, exc.status_code, "Not found." if exc.status_code == 404 else "Request failed.")

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> Response:
        # Never show the exception (BB non-negotiable: no DB errors to users).
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return _error_page(request, 500, "Something went wrong on the station. It has been logged.")

    return app


def _error_page(request: Request, status: int, message: str) -> HTMLResponse:
    return templates.TemplateResponse(
        request, "error.html", {"status": status, "message": message}, status_code=status
    )


app = create_app()
