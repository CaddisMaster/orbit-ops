# Architecture

## Request flow

```
Browser ─HTTPS─▶ host Nginx (TLS, learn.seandesmet.com)
                   └─▶ 127.0.0.1:5002 ─▶ web container: uvicorn :8000
                         SecurityHeadersMiddleware   (CSP nonce → request.state.csp_nonce)
                         SessionMiddleware           (signed cookie `orbit_session`)
                         csrf_protect dependency     (app-wide; unsafe methods only)
                         router → require_user → get_db (one Session per request)
                         Jinja template (+ htmx partials)
                                   └─▶ db container: Postgres 16 (compose network only)
```

## Modules

| Module | Responsibility |
|---|---|
| `app/main.py` | `create_app()`: middleware order, routers, static mount, exception handlers (`LoginRequired` → redirect / `HX-Redirect`, `CSRFError` → 403, everything else → logged 500) |
| `app/config.py` | `Settings` (pydantic-settings). `database_url(owner=False)` picks the app role unless `owner=True` (Alembic) |
| `app/db.py` | engine (pool 5, pre-ping), `SessionLocal`, `get_db` |
| `app/models.py` | ORM models |
| `app/security.py` | argon2 hashing with a dummy-hash for timing parity; session login/validate; CSRF; `RateLimiter`; security headers |
| `app/templating.py` | Jinja env with `csrf_token()` and `app_version` globals |
| `app/content/` | `schema.py` (Pydantic models for syllabus and module files), `loader.py` (`load_catalog()` → immutable `Catalog`, collecting every problem before raising `ContentError`), `render.py` (Markdown with raw HTML off, plus Pygments classes) |
| `app/progress.py` | Lock rules and today's mission as **pure functions** of (catalog, completed slugs); `check_answer()`; `record_answer()` (first attempt per question counts; completing scores the module) |
| `app/flash.py` | one-shot messages across a redirect, in the session |
| `app/routers/` | `auth` (login/logout), `main` (dashboard, `/healthz`), `learn` (`/syllabus`, `/modules/{slug}`, `POST /modules/{slug}/quiz/{index}` → htmx fragment) |

## Content

The curriculum lives in `content/` (see `docs/content-authoring.md`) and is loaded **once** in
`app.main.lifespan` into `app.state.catalog`, which routes get through the `get_catalog`
dependency. Lesson HTML is rendered at load time, so pages do no Markdown work per request. The
database never stores content, only learner state keyed by module slug.

## Data model

| Table | Columns | Notes |
|---|---|---|
| `users` | id, username (unique), password_hash, session_token, created_at | rotating `session_token` revokes every session |
| `module_progress` | user_id, module_slug (unique together), status (`in_progress`/`complete`), score 0–100, started_at, completed_at | locked/available is derived, never stored |
| `exercise_attempts` | user_id, module_slug, kind (`quiz`), item (question index), submitted (JSONB), correct, created_at | full history; the first attempt per item counts |

Planned tables (v0.3–v0.5): `xp_events` (ledger — totals
are derived, never stored), `activity_days`, `badges_earned`, `card_state` (SM-2), `ai_requests`.
See `docs/roadmap.md` §2.

## Roles

| Role | Used by | Can |
|---|---|---|
| `DB_USER` (owner) | Alembic, `pg_dump` | everything in the database |
| `orbit_app` | the web app at runtime (once `DB_APP_USER` is set) | SELECT/INSERT/UPDATE/DELETE on all tables; no DDL, TRUNCATE or `alembic_version` |
