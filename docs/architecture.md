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
| `app/station_map.py` | `layout(catalog, completed)`: the station map as a **pure** function returning decks, nodes (state from `progress.py`'s lock rules) and prerequisite edges in SVG coordinates; `map: {x, y}` from content or an automatic grid |
| `app/console.py` | `console_readout`, a dependency the signed-in pages share: the header's "Systems online 3/10 · Streak 5" and the comms log (reads only: `streaks.peek()` never records freezes) |
| `app/comms.py` | the comms log, **rebuilt from progress** on each request: completed modules' `open`/`console_done`/`complete` beats in completion order, plus the current module's briefing (`new` on the first visit) |
| `art/` | the pixel art as stdlib Python: `room.py` (320×180, in layers that stack exactly: the room, and the laptop's deck, lid and shut form (#55); its `GLASS`, `HINGE_Y`, `CLOSE_TAB`, `POWER_LIGHT`, `SLEEP_LIGHT` and `DOCK_PORT` must match `style.css`, which `tests/test_monitor.py` checks), `sprites.py` (shuttle, avatars), `build.py` writes `app/static/img/`; `tests/test_art.py` compares decoded pixels with the committed PNGs |
| `app/static/js/briefing.js` | types a module's briefing out as an incoming transmission; a click or key skips. Progressive enhancement: the server sends the full text, and nothing happens under reduced motion or without JS |
| `app/terminal.py` | terminal exercises on the server: `Report` (the posted final filesystem, size-bounded), `grade()` (this module's checks; the browser's verdict is recorded but never believed), `client_spec()` |
| `app/static/js/shell.js`, `console.js` | the station console: `shell.js` is a **pure** simulated shell over the exercise's filesystem (tested by `node --test tests/js/*.test.js`); `console.js` draws it (our own log + `<input>`, not xterm.js, whose injected `<style>` the CSP blocks) and POSTs the final state to `/modules/{slug}/terminal` |
| `app/game/` | `levels.py`: the level curve and rank bands as **pure functions** of an XP total (`standing()`); `xp.py`: what a completion awards, `award()` (idempotent `INSERT … ON CONFLICT DO NOTHING`) and `total_xp()`; `streaks.py`: the streak and freezes as a **pure** `compute(days, today)`, plus `mark_active()` and `current_streak()`, which records the freezes a request finds it can spend (no scheduler); `badges.py`: the rule evaluators as a **pure** `qualifying(catalog, facts)` over the learner's whole state, plus `award()` (idempotent, like XP), `earned()` and the dashboard/page shelves; `srs.py`: flashcards on SM-2, the rule as a **pure** `review(previous, grade, today)`, plus `queue()` (cards of completed modules, due ones first, then new ones) and `record()` (locks the row, and leaves a card that isn't due alone, so a double submit can't count twice) |
| `app/flash.py` | one-shot messages across a redirect, in the session |
| `app/routers/` | `auth` (login/logout), `main` (dashboard, `/badges`, `/healthz`), `learn` (`/syllabus`, `/map`, `/modules/{slug}`, `POST /modules/{slug}/quiz/{index}` → htmx fragment, `POST /modules/{slug}/terminal` → JSON verdict), `review` (`/review`, `/review/answer?card=` and `POST /review` → the next card as an htmx fragment, or a 303 back to `/review` for a plain form) |

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
| `activity_days` | user_id, day (in `APP_TIMEZONE`; unique with user_id), freeze_used, created_at | a day that counted: active, or a missed day a freeze bridged; the streak is derived |
| `badges_earned` | user_id, badge_slug (unique with user_id), earned_at | badges held; what a badge is lives in `syllabus.yml`, keyed by the slug |
| `xp_events` | user_id, amount (≠ 0), reason, ref (unique with user_id + reason), created_at | the XP ledger; totals, levels and ranks are summed from it, never stored |

Planned tables (v0.4–v0.5): `card_state` (SM-2), `ai_requests`.
See `docs/roadmap.md` §2.

## Roles

| Role | Used by | Can |
|---|---|---|
| `DB_USER` (owner) | Alembic, `pg_dump` | everything in the database |
| `orbit_app` | the web app at runtime (once `DB_APP_USER` is set) | SELECT/INSERT/UPDATE/DELETE on all tables; no DDL, TRUNCATE or `alembic_version` |
