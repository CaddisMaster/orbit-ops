# Gotchas

Each entry is something that already went wrong once (here or in Budget Buddy). Add to it.

## App

- **Jinja typos render as empty strings.** Assert on rendered content in tests.
- **`get_settings()` is `lru_cache`d.** Env vars set after first import are ignored.
- **The rate limiter is in-process memory.** Correct only with one uvicorn process. If you ever
  add workers, move it to the database or Redis first.
- **`csrf_protect` reads the form body.** Starlette caches it on the request, so route `Form()`
  params still work — but a route reading `request.body()` raw on a form POST would not.
- **Exception handlers for bare `Exception`** run outside `SecurityHeadersMiddleware`, so a 500
  page lacks the CSP header. It also renders no scripts, so this is accepted.

- **Bad content stops startup** (by design). In dev, `uvicorn --reload` can catch a half-written
  set of content files and exit with `ContentError`; it restarts on the next file change.
- **A module's slug is its permanent ID.** Progress is stored against it, so renaming a
  published module's file orphans that progress.

## Containers

- **The host `.env` is mode 600 and the container user is uid 10001.** The app does not read
  `.env` itself (compose's `env_file:` injects it), so do not reintroduce `env_file=` in Settings.
- **Anonymous volumes for caches are root-owned**, so tools run with `--no-cache` /
  `-p no:cacheprovider` in `test.sh`.
- **`.dockerignore` drops `**/*.md`** — except `content/**/*.md`, which the app needs. Keep the
  exception when touching that file.

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
