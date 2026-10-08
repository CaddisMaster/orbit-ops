# Status

A per-session log, standing decisions and a release ledger. Newest first.

## Standing decisions

- **Stack:** FastAPI + Jinja/htmx + SQLAlchemy 2.0 + Alembic (chosen 2026-10-08 to learn a new
  backend while keeping the server-rendered frontend). Sync routes first; async is a later lesson.
- **One uvicorn process**, no Redis, no scheduler container — RAM on the shared droplet.
- **Content in git**, AI for hints / lab review / drafting (the "hybrid" option).
- **Single user**, but every learner-state query is user-scoped.

## Release ledger

| Version | Date | Highlights |
|---|---|---|
| — | — | nothing released yet |

## Sessions

### 2026-10-08 — project bootstrap

- Planned the app (see `docs/roadmap.md`) and scaffolded milestone v0.1.0 locally: app skeleton,
  auth, security headers, CSRF, rate limit, Alembic (users + `orbit_app` role), Docker, CI,
  release/rollback workflows, docs, Claude harness. 26 tests passing.
- **Not yet done:** GitHub repo creation, issues for v0.1.0, server setup (DNS, Nginx, Certbot,
  `/opt/orbit-ops`, `production` environment), first release.
