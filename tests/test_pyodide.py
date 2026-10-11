"""Python in the browser (#53): the CSP, the pinned download, and loading only
when needed. Running Python needs a browser, so "Python runs in a worker" and
"A runaway program is stopped" are verified with Playwright (see the PR)."""

import hashlib
import re
from pathlib import Path

import pytest

from app import main
from scripts import fetch_pyodide

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "app" / "static" / "js"


def _directives(csp: str) -> dict[str, list[str]]:
    return {d.split()[0]: d.split()[1:] for d in csp.split("; ")}


@pytest.mark.criterion(53, "The CSP allows WebAssembly and nothing more")
@pytest.mark.parametrize("path", ["/login", "/static/js/pyodide-worker.js"])  # a worker gets the CSP of its own script
def test_the_csp_allows_webassembly_and_nothing_more(client, path):
    csp = _directives(client.get(path).headers["content-security-policy"])
    script = csp.pop("script-src")
    assert script[0] == "'self'" and re.fullmatch(r"'nonce-[A-Za-z0-9_-]+'", script[1]) and script[2:] == ["'wasm-unsafe-eval'"]
    assert csp == {  # every other directive exactly as before #53: no new origin anywhere
        "default-src": ["'self'"],
        "style-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
    }


@pytest.mark.criterion(53, "Pyodide is pinned by hash")
def test_pyodide_is_pinned_by_hash():
    assert re.fullmatch(r"\d+\.\d+\.\d+", fetch_pyodide.VERSION)
    assert re.fullmatch(r"[0-9a-f]{64}", fetch_pyodide.SHA256)
    assert re.fullmatch(r"[0-9a-f]{64}", fetch_pyodide.LICENSE_SHA256)
    assert f"/download/{fetch_pyodide.VERSION}/pyodide-core-{fetch_pyodide.VERSION}.tar.bz2" in fetch_pyodide.URL
    assert f"/pyodide/{fetch_pyodide.VERSION}/LICENSE" in fetch_pyodide.LICENSE_URL  # the licence at the same tag
    dockerfile = (ROOT / "Dockerfile").read_text()
    assert re.search(r"^FROM python:[\d.]+-slim@sha256:[0-9a-f]{64} AS pyodide$", dockerfile, re.M)
    assert "RUN python /tmp/fetch_pyodide.py /pyodide\n" in dockerfile
    assert "COPY --from=pyodide /pyodide /opt/pyodide\n" in dockerfile and main.PYODIDE_DIR == Path("/opt/pyodide")


def test_a_download_that_doesnt_match_its_hash_is_refused():
    good = b"pyodide"
    assert fetch_pyodide.verified(good, hashlib.sha256(good).hexdigest(), "x") == good
    with pytest.raises(SystemExit, match="does not match the pinned"):
        fetch_pyodide.verified(b"tampered", hashlib.sha256(good).hexdigest(), "x")


@pytest.mark.criterion(53, "Pyodide is not loaded until needed")
@pytest.mark.parametrize("path", ["/", "/syllabus", "/map", "/badges", "/review", "/modules/the-filesystem"])
def test_pages_without_a_challenge_dont_load_pyodide(logged_in, path):
    page = logged_in.get(path).text
    assert "/pyodide/" not in page and "python.js" not in page


@pytest.mark.criterion(53, "Pyodide is not loaded until needed")
def test_the_runner_starts_the_worker_only_on_the_first_run():
    runner = (JS / "python.js").read_text()
    # the only `new Worker` is inside start(), and start() is only called from run()
    assert runner.count("new Worker(") == 1
    assert runner.index("function start()") < runner.index("new Worker(") < runner.index("function run(")
    assert re.findall(r"\bstart\(\)", runner) == ["start()", "start()"]  # its definition, and `ready || start()`
    worker = (JS / "pyodide-worker.js").read_text()
    assert 'import { loadPyodide } from "/pyodide/pyodide.mjs";' in worker and 'indexURL: "/pyodide/"' in worker


def test_a_runaway_run_is_stopped_by_terminating_the_worker():
    runner = (JS / "python.js").read_text()
    assert "var RUN_TIMEOUT_MS = 5000;" in runner
    timeout = runner[runner.index("var timer = setTimeout(function () {\n          w.removeEventListener") :]
    assert timeout.index("stop();") < timeout.index("timedOut: true")  # stop() terminates; the next run() starts afresh


def test_the_licence_ships_beside_it():
    assert "LICENSE" not in fetch_pyodide.FILES  # fetched separately, at the same tag, by its own hash
    assert "(dest / \"LICENSE\").write_bytes(verified(fetch(LICENSE_URL), LICENSE_SHA256, LICENSE_URL))" in (
        ROOT / "scripts" / "fetch_pyodide.py"
    ).read_text()
