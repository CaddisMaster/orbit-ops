"""Fetch Pyodide for the image, checked by hash (#53).

    python scripts/fetch_pyodide.py DEST

Run by the Dockerfile's `pyodide` stage; the result is copied to /opt/pyodide
and served at /pyodide/ (app/main.py). Self-hosted rather than loaded from a
CDN, so the CSP gains no origin, and pinned like everything else
(CLAUDE.md non-negotiable #6): one exact release, its sha256, and only the
files the browser needs. Nothing here goes into git.

To upgrade: change VERSION, then SHA256 to the release asset's digest (GitHub
shows it: `gh api repos/pyodide/pyodide/releases/tags/<VERSION>`), and
LICENSE_SHA256 if the licence changed.

Standard library only: it runs in a bare python image before anything is
installed.
"""

import hashlib
import io
import sys
import tarfile
import urllib.request
from pathlib import Path

VERSION = "314.0.7"  # CPython 3.14, the same as the server
SHA256 = "2abdcc2e35208af406e07724cffa85bc582ced97e9028383ecf5462541393f95"
URL = f"https://github.com/pyodide/pyodide/releases/download/{VERSION}/pyodide-core-{VERSION}.tar.bz2"
LICENSE_URL = f"https://raw.githubusercontent.com/pyodide/pyodide/{VERSION}/LICENSE"
LICENSE_SHA256 = "1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5"
# What the browser loads. Not the CLI (python, python.exe), not the type declarations.
FILES = ("pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json")


def verified(data: bytes, expected: str, what: str) -> bytes:
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected:
        raise SystemExit(f"{what}: sha256 {actual} does not match the pinned {expected}; refusing it")
    return data


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as response:  # noqa: S310 (a fixed https URL)
        return response.read()


def main(dest: Path) -> int:
    archive = verified(fetch(URL), SHA256, URL)
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:bz2") as tar:
        for name in FILES:
            member = tar.extractfile(f"pyodide/{name}")
            if member is None:
                raise SystemExit(f"{URL}: pyodide/{name} is not a file in the archive")
            (dest / name).write_bytes(member.read())
    (dest / "LICENSE").write_bytes(verified(fetch(LICENSE_URL), LICENSE_SHA256, LICENSE_URL))
    for path in sorted(dest.iterdir()):
        print(f"{path.name:22} {path.stat().st_size:>10,} bytes")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python scripts/fetch_pyodide.py DEST")
    sys.exit(main(Path(sys.argv[1])))
