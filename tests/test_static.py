"""Static files are versioned by the release and cached accordingly (#92)."""

import re

import pytest

from app.config import get_settings
from app.static_files import IMMUTABLE, PYODIDE_URL, static_url
from tests.test_challenge import at_text_tools  # noqa: F401 (a fixture)

# Every src= and href= that points at a static file or at Pyodide.
STATIC_REF = re.compile(r'(?:src|href)="(/(?:static|pyodide)/[^"]*)"')


@pytest.mark.criterion(92, "A release changes every static URL")
def test_a_release_changes_every_static_url(client, user, at_text_tools, monkeypatch):  # noqa: F811
    monkeypatch.setattr(get_settings(), "app_version", "0.6.0")
    pages = [client.get("/login").text]
    from tests.conftest import login

    login(client, user.username)
    pages += [client.get(path).text for path in ("/", "/review", "/map", "/modules/text-tools")]
    refs = [ref for page in pages for ref in STATIC_REF.findall(page)]
    assert {"/static/css/style.css?v=0.6.0", "/static/js/python.js?v=0.6.0", "/static/js/shell.js?v=0.6.0"} <= set(refs)
    assert any(ref.startswith("/static/img/") for ref in refs)  # the crew's avatars
    assert [ref for ref in refs if not ref.endswith("?v=0.6.0")] == []
    assert not re.search(r"""url_for\(\s*['"]static""", "".join(pages))  # nothing left unconverted
    assert f'data-pyodide="{PYODIDE_URL}"' in pages[-1]


def test_in_development_the_version_is_the_files_mtime(monkeypatch):
    monkeypatch.setattr(get_settings(), "app_version", "dev")
    assert re.fullmatch(r"/static/css/style\.css\?v=\d{10}", static_url("css/style.css"))
    assert static_url("css/nope.css") == "/static/css/nope.css?v=0"


@pytest.mark.criterion(92, "Versioned static files are cached for good")
@pytest.mark.parametrize("path", ["/static/css/style.css?v=0.6.0", "/static/img/room.png?v=123", "/static/js/pyodide-worker.js?v=1&pyodide=/pyodide/1/"])
def test_versioned_static_files_are_cached_for_good(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable" == IMMUTABLE


@pytest.mark.criterion(92, "Unversioned requests revalidate")
@pytest.mark.parametrize("path", ["/static/css/style.css", "/static/img/room.png", "/static/css/style.css?x=1"])
def test_unversioned_requests_revalidate(client, path):
    response = client.get(path)
    assert response.status_code == 200 and response.headers["cache-control"] == "no-cache"
    again = client.get(path, headers={"if-none-match": response.headers["etag"]})
    assert again.status_code == 304 and again.headers["cache-control"] == "no-cache"


def test_a_missing_file_is_not_cached(client):
    response = client.get("/static/css/nope.css?v=0.6.0")
    assert response.status_code == 404 and "immutable" not in response.headers.get("cache-control", "")
