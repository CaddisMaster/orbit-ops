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
| `app/main.py` | `create_app()`: middleware order, routers, the static and Pyodide mounts (`app/static_files.py`: `static_url()` versions every URL, `CachedStaticFiles` sets `Cache-Control`, #92), exception handlers (`LoginRequired` → redirect / `HX-Redirect`, `CSRFError` → 403, everything else → logged 500) |
| `app/config.py` | `Settings` (pydantic-settings). `database_url(owner=False)` picks the app role unless `owner=True` (Alembic) |
| `app/db.py` | engine (pool 5, pre-ping), `SessionLocal`, `get_db` |
| `app/models.py` | ORM models |
| `app/security.py` | argon2 hashing with a dummy-hash for timing parity; session login/validate; CSRF; `RateLimiter`; security headers |
| `app/templating.py` | Jinja env with `csrf_token()` and `app_version` globals |
| `app/content/` | `schema.py` (Pydantic models for syllabus and module files), `loader.py` (`load_catalog()` → immutable `Catalog`, collecting every problem before raising `ContentError`), `render.py` (Markdown with raw HTML off, plus Pygments classes) |
| `app/progress.py` | Lock rules and today's mission as **pure functions** of (catalog, completed slugs); `check_answer()`; `record_answer()` (first attempt per question counts; completing scores the module) |
| `app/station_map.py` | the station map as the *Meridian* (#78): a **pure** `layout(catalog, completed)`. Each track's units fill its deck's compartments (`art.ship.SLOTS`) in syllabus order; each compartment gets a state (complete, available or locked, plus shuttered when it has no modules) and a conduit from each prerequisite along the spine. `map.html` lays an SVG in the art's pixel coordinates over `ship.png` |
| `app/console.py` | `console_readout`, a dependency the signed-in pages share: the header's "Systems online 3/10 · Streak 5 · Uplink online" and the comms log (reads only: `streaks.peek()` never records freezes) |
| `app/comms.py` | the comms log, **rebuilt from progress** on each request: completed modules' `open`/`console_done`/`lab_done`/`complete` beats in completion order, plus the current module's briefing (`new` on the first visit) |
| `art/` | the pixel art as stdlib Python: `room.py` (320×180, in layers that stack exactly: the room, and the laptop's deck, lid and shut form (#55); its `GLASS`, `HINGE_Y`, `CLOSE_TAB`, `POWER_LIGHT`, `SLEEP_LIGHT` and `DOCK_PORT` must match `style.css`, which `tests/test_monitor.py` checks), `sprites.py` (shuttle, avatars), `build.py` writes `app/static/img/`; `tests/test_art.py` compares decoded pixels with the committed PNGs |
| `app/static/js/briefing.js` | types a module's briefing out as an incoming transmission; a click or key skips. Progressive enhancement: the server sends the full text, and nothing happens under reduced motion or without JS |
| `app/terminal.py` | terminal exercises on the server: `Report` (the posted final filesystem, size-bounded), `grade()` (this module's checks; the browser's verdict is recorded but never believed), `client_spec()` |
| `app/static/js/python.js`, `pyodide-worker.js`, `challenge.js` | Python in the browser (#53). `python.js` exposes `OrbitPython.run(code)` and starts a module worker on the **first run only**. The worker loads Pyodide from `/pyodide/<version>/` (passed as `?pyodide=` by `python.js`, #92) and runs each program with fresh globals. A run over 5 s is stopped by terminating the worker, since nothing else can interrupt an infinite loop. Pyodide itself is fetched by `scripts/fetch_pyodide.py` (one release, checked by sha256) in the Dockerfile's `pyodide` stage, put in `/opt/pyodide` and mounted at `/pyodide/<version>` (`PYODIDE_VERSION` in `app/static_files.py`, held equal to the fetch script's by a test). The CSP's only allowance for it is `'wasm-unsafe-eval'`. Learner code never runs on the server. `challenge.js` is a module's bonus challenge (#54): an editor with Run and Submit. Submit runs the hidden checks with the module's console files preset as variables, and POSTs which passed. `app/challenge.py` records that verdict (trust-the-client) and pays 30 XP once, and `run_in_cpython()` holds every reference solution to its checks in CI |
| `app/static/js/shell.js`, `manual.js`, `console.js` | the station console: `shell.js` is a **pure** simulated shell over the exercise's filesystem (tested by `node --test tests/js/*.test.js`), with `Nano` and `Pager` state objects for nano and less/man (#66), and `manual.js` holds the man pages and `help` text; `console.js` draws it, and draws nano and the pager in the same panel when a command opens one (our own log + `<input>`, not xterm.js, whose injected `<style>` the CSP blocks) and POSTs the final state to `/modules/{slug}/terminal` |
| `app/game/` | `levels.py`: the level curve and rank bands as **pure functions** of an XP total (`standing()`); `xp.py`: what a completion awards, `award()` (idempotent `INSERT … ON CONFLICT DO NOTHING`), `review_award()` (2 XP a flashcard review, capped at 20 a day under a per-learner advisory lock) and `total_xp()`; `streaks.py`: the streak and freezes as a **pure** `compute(days, today)` (a day is active when a module was completed or the due flashcards were cleared), plus `mark_active()` and `current_streak()`, which records the freezes a request finds it can spend (no scheduler); `badges.py`: the rule evaluators as a **pure** `qualifying(catalog, facts)` over the learner's whole state, plus `award()` (idempotent, like XP), `earned()` and the dashboard/page shelves; `srs.py`: flashcards on SM-2, the rule as a **pure** `review(previous, grade, today)`, plus `queue()` (cards of completed modules, due ones first, then new ones) and `record()` (locks the row, and leaves a card that isn't due alone, so a double submit can't count twice) |
| `app/lab.py` | labs (#121): work on the learner's own machine, checked by the pasted output. `grade(lab, pastes)` runs each box's `contains` / `not_contains` / `regex` / `lines` checks (pure; `\r\n` read as `\n`); `record()`, `passed_slugs()` and `state()` (the last pastes, regraded) are scoped to the user. Nothing a lab asks for runs on the server |
| `app/ai.py` | every model call's pure half (#120): `MODELS` (Haiku 5.5 hints, Sonnet 5.5 lab review; lessons are written in Claude Code sessions, never through the app's key), `PRICES` and `cost_microcents()`, `client()`, `AIUnavailable`. Never touches the database. Each AI feature adds its `_call_*_model(client, model)` seam here |
| `app/spend.py` | the AI ledger and the monthly budget (non-negotiable #7): `run(user_id, purpose, seam)` refuses with no key or no budget left this month (in `APP_TIMEZONE`), calls the seam, and commits the cost in its own session. `uplink_online()` drives the readout's **Uplink** |
| `app/flash.py` | one-shot messages across a redirect, in the session |
| `app/routers/` | `auth` (login/logout), `main` (dashboard, `/badges`, `/healthz`), `learn` (`/syllabus`, `/map`, `/modules/{slug}`, `POST /modules/{slug}/quiz/{index}` → htmx fragment, `POST /modules/{slug}/terminal` → JSON verdict, `POST /modules/{slug}/challenge` → `{correct, xp_gained}`, `POST /modules/{slug}/lab` → the lab section as an htmx fragment, plus the `lab_done` comms out of band on a first pass), `review` (`/review`, `/review/answer?card=` and `POST /review` → the next card as an htmx fragment, or a 303 back to `/review` for a plain form) |

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
| `exercise_attempts` | user_id, module_slug, kind (`quiz`, `terminal`, `challenge`, `lab`), item (question index), submitted (JSONB), correct, created_at | full history; the first attempt per item counts |
| `activity_days` | user_id, day (in `APP_TIMEZONE`; unique with user_id), freeze_used, created_at | a day that counted: active, or a missed day a freeze bridged; the streak is derived |
| `badges_earned` | user_id, badge_slug (unique with user_id), earned_at | badges held; what a badge is lives in `syllabus.yml`, keyed by the slug |
| `xp_events` | user_id, amount (≠ 0), reason, ref (unique with user_id + reason), created_at | the XP ledger; totals, levels and ranks are summed from it, never stored |

| `card_state` | user_id, card_id (`<module-slug>/<card-id>`, unique with user_id), ease (≥ 1.3), interval_days, due_on, reps, lapses, last_reviewed_on | a learner's SM-2 schedule per flashcard; a card with no row is new and due today |
| `ai_requests` | user_id (nullable, **SET NULL** on delete), purpose, model, input/output/cache_read/cache_write tokens, cost_microcents, created_at (indexed) | the AI spend ledger; the month's spend is summed from it (`app/spend.py`). Not per-learner: one key, one bill |

## Roles

| Role | Used by | Can |
|---|---|---|
| `DB_USER` (owner) | Alembic, `pg_dump` | everything in the database |
| `orbit_app` | the web app at runtime (once `DB_APP_USER` is set) | SELECT/INSERT/UPDATE/DELETE on all tables; no DDL, TRUNCATE or `alembic_version` |
