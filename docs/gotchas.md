# Gotchas

Each entry is something that already went wrong once (here or in Budget Buddy). Add to it.

## App

- **Jinja typos render as empty strings.** Assert on rendered content in tests.
- **`get_settings()` is `lru_cache`d.** Env vars set after first import are ignored.
- **The rate limiters are in-process memory** (login, and hints' one-a-minute, #123). Correct only
  with one uvicorn process. If you ever add workers, move them to the database or Redis first.
- **`csrf_protect` reads the form body.** Starlette caches it on the request, so route `Form()`
  params still work — but a route reading `request.body()` raw on a form POST would not.
- **Exception handlers for bare `Exception`** run outside `SecurityHeadersMiddleware`, so a 500
  page lacks the CSP header. It also renders no scripts, so this is accepted.

- **Bad content stops startup** (by design). In dev, `uvicorn --reload` can catch a half-written
  set of content files and exit with `ContentError`; it restarts on the next file change.
- **A module's slug is its permanent ID.** Progress is stored against it, so renaming a
  published module's file orphans that progress.
- **`art/` edits don't reload the dev server either.** The map imports `art.ship`'s compartment
  positions, and uvicorn only watches `app/` and `content/`: after changing `art/ship.py`, run
  `python -m art.build` and `docker compose restart web`.
- **Content edits don't reload the dev server.** `--reload-dir content` is set, but uvicorn
  without `watchfiles` reloads on `*.py` only, so a `syllabus.yml` or lesson change needs
  `docker compose restart web` (templates and CSS are picked up without it).

- **htmx does not swap 4xx/5xx responses** by default. A validation message returned with 422
  never appears; return 200 with the re-rendered fragment. Redirects out of an htmx request use
  the `HX-Redirect` header (any status), since a 3xx would be followed inside the swap.

- **"closes #N" anywhere in a PR body links the issue**, even mid-sentence ("a later PR that
  closes #5"). The criteria check then requires all of #N's scenarios. Write "Part of #N" and
  avoid the closing keywords (close/fix/resolve).

- **No `style="…"` in templates, even in SVG.** `style-src 'self'` blocks inline style
  attributes. Use a class, or a presentation attribute (`fill`, `stroke`). Setting
  `el.style.x` from a served JS file is fine: CSSOM writes aren't inline styles to the CSP.
  `tests/test_immersion.py` greps the main pages for `style=`.

- **Link static files with `static_url('css/x.css')`, never `url_for('static', …)` or a bare
  `/static/…`** (#92). An unversioned URL is served `no-cache` and won't change when a release
  does. `tests/test_static.py` checks the main pages. CSS `url(...)` stays relative and
  revalidates on its own. A new Pyodide version means changing `PYODIDE_VERSION` in
  `app/static_files.py` along with `scripts/fetch_pyodide.py` (a test holds them equal).

- **The console's clock is the station's, not the browser's** (#67). Files are dated on a fixed
  clock that starts at 2026-10-08 09:00 and moves a second per command (`sh.now()`), so use it,
  never `new Date()`, for anything a learner can see or a check can read. The server's
  `STATION_NOW` is the same moment, and `test_the_station_clock_matches_the_console` keeps them
  together.

## Containers

- **The host `.env` is mode 600 and the container user is uid 10001.** The app does not read
  `.env` itself (compose's `env_file:` injects it), so do not reintroduce `env_file=` in Settings.
- **Anonymous volumes for caches are root-owned**, so tools run with `--no-cache` /
  `-p no:cacheprovider` in `test.sh`.
- **`.dockerignore` drops `**/*.md`** — except `content/**/*.md`, which the app needs. Keep the
  exception when touching that file.

- **Pyodide lives in `/opt/pyodide`, not `app/static/`** (#53). In development `.:/app` is
  bind-mounted over the image, so anything the Dockerfile puts under `/app` is hidden. A bare
  checkout (CI's Tests job) has no `/opt/pyodide` at all: the `/pyodide` mount is
  `check_dir=False`, and no test may request a file from it. After changing
  `scripts/fetch_pyodide.py`, `docker compose build web`.
- **Playwright's `waitForFunction` evaluates a string**, which the CSP blocks (`'unsafe-eval'`)
  on our pages. Wait on a selector instead (`waitForSelector(…, { state: 'detached' })`).
- **Playwright's screenshots log CSP errors that aren't ours.** To hide the caret it injects a
  `<style>`, which `style-src 'self'` blocks: one "Applying inline style violates…" error per
  screenshot, with the empty string's hash (`sha256-47DEQpj8…`). Count console errors in a run
  that takes no screenshots before blaming the app (#121).

## Deploy scripts

Scripts piped to the droplet over ssh (`… "cd /opt/orbit-ops && bash -s -- args" < scripts/x.sh`),
as `install_compose.sh` and `backup_db.sh` are (#116):

- **The script is stdin.** Anything in it that reads stdin eats the rest of the script, and
  the shell then exits **0** having run nothing more. `docker compose exec -T` forwards stdin,
  so give such commands `< /dev/null`. A test stub for `docker` must read stdin too, or it
  hides this (ours did, until a run against real Postgres).
- **`sh` is dash, and Ubuntu 24.04's dash refuses `set -o pipefail`.** A script that pipes
  something whose failure matters is `#!/bin/bash` and runs as `bash -s`.
- **Check a dump by its completion line**, not by `gzip -t`. A current `pg_dump` writes a
  `\unrestrict` line after `-- PostgreSQL database dump complete`, so look further back than
  the last 3 lines.

## Migrations

- **`alembic revision` fails with `PermissionError`** when run as the container user: it can't
  write into the host-owned bind mount. Run it with `-u "$(id -u):$(id -g)"` (CONTRIBUTING §4).
- **Pass `--rev-id NNNN`** so revision files stay numbered (`0003_…`) instead of random hashes.
- **Review autogenerate's indexes.** It adds a separate index for `index=True` even when a
  unique constraint already leads with that column.

- **Expand-only within a release.** Rollback swaps the image but not the schema, so the previous
  image must work against the new schema.
- **Roles are cluster-wide.** `orbit_app` exists once for both `orbit` and `orbit_test`;
  migration `0002` and its downgrade are written for that.
- **The local `alembic/` directory shadows the library for isort** — `known-third-party` in
  `pyproject.toml` fixes it.
