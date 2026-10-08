# Orbit Ops

A gamified, daily DevOps learning platform: one ~15–20 minute module a day from a structured
curriculum (Linux → Python/Docker → Kubernetes → CI/CD, IaC, observability, security), wrapped in
a space-station story. Single user. FastAPI + Postgres in Docker, deployed at
learn.seandesmet.com on the DigitalOcean droplet it shares with Budget Buddy.

> ⚠️ **This file is the always-loaded core and is kept small.** Detail lives in `docs/` and is
> *not* loaded automatically — **read the relevant file before acting.** The left column is the
> action you are about to take, not a topic (a lesson from Budget Buddy: topic triggers get
> misclassified and go unread).
>
> | Before you… | Read |
> |---|---|
> | start a session — reconcile against `git log` / `gh issue list` | [`docs/status.md`](docs/status.md) |
> | change anything non-trivial in `app/` | [`docs/gotchas.md`](docs/gotchas.md) |
> | write or change anything under `tests/` | [`docs/testing.md`](docs/testing.md) |
> | add an Alembic revision, add an env var, or cut a release | [`docs/deployment.md`](docs/deployment.md) |
> | need the module map, data model or request flow | [`docs/architecture.md`](docs/architecture.md) |
> | write or change anything under `content/` | [`docs/content-authoring.md`](docs/content-authoring.md) |
> | plan the next milestone or a feature's shape | [`docs/roadmap.md`](docs/roadmap.md) |
> | run anything on the droplet | [`RUNBOOK.md`](RUNBOOK.md) |
> | want the reasoning behind a workflow rule | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## Tech stack

- **Backend:** Python 3.14, FastAPI (sync routes for now), SQLAlchemy 2.0 ORM, psycopg 3,
  Alembic, pydantic-settings, argon2-cffi, Starlette sessions. Served by uvicorn (one process).
- **Frontend:** Jinja2 + htmx 2.0.4 (vendored, 0BSD, licence beside it in `app/static/`),
  plain CSS. No build step.
- **Database:** PostgreSQL 16, its own container, not published to the host.
- **Infra:** Docker Compose, ghcr.io, GitHub Actions, host Nginx + Certbot (shared with BB).

## Project map

```
app/main.py          create_app(): middleware, routers, exception handlers
app/config.py        Settings — every env var, typed. Add new ones here AND .env.example
app/db.py            engine, SessionLocal, get_db dependency, Base
app/models.py        ORM models (learner state only; lesson content lives in content/)
app/security.py      argon2 hashing, session auth (require_user), CSRF, rate limiter, CSP headers
app/templating.py    the shared Jinja env (csrf_token, app_version globals)
app/content/         schema.py, loader.py (load_catalog → Catalog), render.py (Markdown, Pygments)
app/progress.py      lock rules + today's mission (pure), check_answer, record_answer
app/routers/         auth.py (login/logout), main.py (dashboard, /healthz), learn.py (syllabus, modules, quiz)
alembic/versions/    migrations (0001 users, 0002 orbit_app role, 0003 module_progress + exercise_attempts)
content/             the curriculum: syllabus.yml + <track>/<unit>/NN-slug.md
scripts/             create_user.py, install_compose.sh (deploy), check_criteria.py (CI)
```

## Non-negotiables

1. **Every query that reads learner state is scoped to the current user**, even though there is
   one user today. It costs nothing and keeps a second account from ever being a rewrite.
2. **Never show an exception to the user.** The catch-all handler logs and renders `error.html`.
3. **Inline `<script>` needs `nonce="{{ request.state.csp_nonce }}"`**; never add
   `'unsafe-inline'` or `'unsafe-eval'` to the CSP. Pyodide (v0.4.0) gets `'wasm-unsafe-eval'`
   only.
4. **Every POST carries the CSRF token** — automatic for htmx (`hx-headers` on `<body>`), a
   hidden `csrf_token` input for plain forms.
5. **Migrations are expand-only within a release.** Drop/rename only in a release *after* the
   code stopped using it. One Alembic revision per PR, nothing else in it.
6. **Dependencies are pinned exactly, transitive included**; actions are pinned by SHA; the base
   image by digest. `tests/test_repo_hardening.py` enforces all three.
7. **AI never reveals quiz answers and never runs without the monthly budget check** (v0.5.0).

## Testing

`./test.sh` — ruff, a fresh `orbit_test` database migrated to head, then pytest in parallel,
all inside the dev container. Real Postgres, no SQL mocks. Details: `docs/testing.md`.

## Versioning, git, release

- `0.MINOR.PATCH`; a release bundles everything merged since the last one (`VERSIONING.md`).
- Issue (Given/When/Then criteria) → branch `<issue#>-slug` → PR with `Closes #N` → squash-merge.
  No direct pushes to `main`. Commit subjects imperative and capitalised; the body says why.
- `CHANGELOG.md` `## [Unreleased]` must be updated by any PR touching `app/` (CI-enforced, and
  the Stop hook in `.claude/hooks/` nudges locally).
- Release = publish a GitHub Release `vX.Y.Z`; `release.yml` deploys after `production` approval.

## Current status

See `docs/status.md`. Milestone **v0.1.0 — Skeleton and deploy** is in progress.

## Maintainer notes (local only)

Host names, the deploy user and vault paths are in the gitignored `CLAUDE.local.md`.
