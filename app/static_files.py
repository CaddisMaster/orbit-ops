"""Static files, versioned so a release reaches every browser (#92).

Every URL the templates emit carries `?v=`: the release version in production,
the file's mtime in development (where the version is always "dev"). A versioned
request is cached for a year; an unversioned one (a CSS `url(...)`, a stale page)
must revalidate. Pyodide carries its version in the path instead, because its
loader builds its own URLs from `indexURL` and wouldn't pass a query along.
"""

from pathlib import Path
from urllib.parse import parse_qs

from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Scope

from app.config import get_settings

STATIC_DIR = Path(__file__).parent / "static"
PYODIDE_DIR = Path("/opt/pyodide")  # the Dockerfile's `pyodide` stage (#53)
PYODIDE_VERSION = "314.0.7"  # scripts/fetch_pyodide.py's VERSION; tests/test_pyodide.py holds them equal
PYODIDE_URL = f"/pyodide/{PYODIDE_VERSION}/"

IMMUTABLE = "public, max-age=31536000, immutable"


def static_url(path: str) -> str:
    version = get_settings().app_version
    if version == "dev":
        try:
            version = str(int((STATIC_DIR / path).stat().st_mtime))
        except OSError:
            version = "0"  # a typo'd path 404s on its own; the page still renders
    return f"/static/{path}?v={version}"


class CachedStaticFiles(StaticFiles):
    """StaticFiles with a Cache-Control header. `immutable=True` is for a mount
    whose path is already versioned, so every file in it can be cached for good."""

    def __init__(self, *args, immutable: bool = False, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.immutable = immutable

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code in (200, 304):  # never pin a 404 for a year
            versioned = self.immutable or "v" in parse_qs(scope["query_string"].decode())
            response.headers["Cache-Control"] = IMMUTABLE if versioned else "no-cache"
        return response
