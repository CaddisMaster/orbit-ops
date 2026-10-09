# Roadmap — Orbit Ops

## Context
Sean wants a web app he logs into every day to complete one gamified, ~15–20 minute DevOps learning module from a structured curriculum. It will be hosted on the same DigitalOcean droplet as Budget Buddy (BB) and copy BB's git workflow, security posture, docs workflow and release/deploy pipeline. It deliberately uses a different backend stack so building it is also a learning exercise.

**Decisions made**
- Name and URL: **Orbit Ops** at `learn.seandesmet.com`. Repo `caddismaster/orbit-ops`, image `ghcr.io/caddismaster/orbit-ops`.
- Stack: **FastAPI + Jinja2/HTMX + SQLAlchemy 2.0 + Alembic**. It gets its own Postgres 16 container.
- Single user.
- Lessons are Markdown/YAML in the repo. Claude adds hints, reviews lab submissions, and helps draft new modules (the "hybrid" option).
- Exercises: quizzes, in-browser Python challenges (Pyodide), hands-on labs, and spaced-repetition flashcards.
- Gamification: XP, levels and streaks, plus badges and a skill tree, wrapped in a **space station ops** story.
- Tracks: Core (Linux/Bash/Git/Networking), Python + Docker/Compose, Kubernetes + Helm, and CI/CD + IaC + Observability + Security.
- Labs are checked by comparing the answer first; Claude then reviews any pasted config or file.

---

## 1. Architecture

```
orbit-ops/
  app/
    main.py            # create_app(): middleware, routers, templates, lifespan (content load)
    config.py          # pydantic-settings Settings (replaces BB's os.getenv sprawl)
    db.py              # SQLAlchemy engine/session, get_db dependency
    models.py          # ORM models
    security.py        # password hashing, session auth dependency, CSRF, CSP nonce, headers
    content/           # loader + Pydantic schemas for lesson files; in-memory catalog
    game/              # xp.py, levels.py, streaks.py, badges.py, srs.py (pure functions, heavily unit-tested)
    ai.py              # Anthropic client wrapper: hints, lab review, budget cap, request logging
    routers/           # auth, dashboard, modules, exercises, review (flashcards), station (skill tree), admin
    templates/         # base.html, partials/_*.html (HTMX fragments), like BB
    static/            # htmx (vendored, as BB does), css, js/pyodide-worker.js, station.svg
  content/             # THE CURRICULUM (see §3)
  alembic/             # migrations (replaces BB's numbered SQL + migrate.py)
  scripts/             # draft_module.py (Claude-assisted authoring), validate_content.py, seed_dev.py, restore_check.py
  tests/  docs/  .github/  .claude/
  Dockerfile  docker-compose.yml  docker-compose.override.yml  test.sh  pyproject.toml
```

**What changes from BB, and why**
| Concern | BB | Orbit Ops |
|---|---|---|
| Web framework | Flask + Gunicorn | FastAPI under Gunicorn with `uvicorn.workers.UvicornWorker` (1 worker to save RAM). Starts with sync routes and moves to async SQLAlchemy as a later learning step. |
| Data access | raw psycopg2 + namedtuples | SQLAlchemy 2.0 typed ORM (`Mapped[]`). Driver is psycopg 3. |
| Migrations | numbered SQL + `migrate.py --phase` | Alembic. BB's "expand before deploy, contract after" rule is kept as a written convention. |
| Config | `os.getenv` | `pydantic-settings` |
| Auth | Flask-Login + Flask-Bcrypt | Signed session cookie (Starlette `SessionMiddleware`), `argon2-cffi` hashing, a `require_user` dependency, and session-token invalidation (same idea as BB's `sql/37`). |
| CSRF | Flask-WTF global | Custom double-submit token checked by middleware. HTMX sends it through `hx-headers` on `<body>`, same pattern as BB. |
| Rate limit | Flask-Limiter + Redis | `slowapi` with in-memory storage, which is enough for one worker. **No Redis container**, saving RAM. |
| Scheduler | APScheduler worker container | None. Streaks are computed when a request comes in, so nothing needs to run in the background. |

**Security (carried over from BB)**
- CSP with a per-request nonce. It adds `'wasm-unsafe-eval'` and `cdn.jsdelivr.net` so Pyodide can load; Pyodide runs in a Web Worker with a timeout.
- `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and HSTS when `COOKIE_SECURE=1`.
- Cookies are HttpOnly, SameSite=Lax and Secure.
- Login is rate-limited to 10/min.
- The app connects to Postgres as a least-privilege role.
- The container runs as non-root, the base image is pinned by digest, dependencies are pinned exactly, and Actions are pinned by SHA.
- Errors are generic; database exceptions are never shown to the user.
- Optional TOTP MFA is listed as a follow-up issue, since the app is reachable from the internet.

## 2. Data model (Postgres)
Lesson content lives in files and is loaded into memory at startup. The database stores **only the user's state**, keyed by stable content slugs.
- `users`: id, username, password_hash, session_token, timezone, created_at
- `module_progress`: user_id, module_slug, status (locked/available/in_progress/complete), started_at, completed_at, best_score
- `exercise_attempts`: user_id, exercise_id, kind, submitted (jsonb), correct, score, ai_feedback, created_at
- `xp_events`: an XP ledger (user_id, amount, reason, ref, created_at). Totals and levels are computed from it and never stored, which makes them auditable.
- `activity_days`: user_id, day (in the user's timezone), freeze_used. This table drives the streak.
- `badges_earned`: user_id, badge_slug, earned_at
- `card_state`: user_id, card_id, ease, interval_days, due_on, reps, lapses. This is the SM-2 state.
- `ai_requests`: purpose, model, input/output tokens, cost_cents, created_at. It enforces a monthly budget cap.

## 3. Curriculum and content format
**Hierarchy:** Track → Unit → Module (one per day). Each module takes 15–20 minutes: a briefing, the lesson, a 3–5 question quiz, then one exercise (a code challenge, a lab, or a second quiz), with new flashcards added.

```
content/
  syllabus.yml                   # tracks, units, prerequisites (DAG -> skill tree), badge defs, rank titles
  tracks/01-core/01-linux-shell/
    unit.yml                     # mission briefing (story), unit badge
    01-the-filesystem.md         # YAML front matter + Markdown body
```
Each module's front matter holds `slug`, `title`, `minutes`, `xp`, `story` (a mission log intro), and `quiz[]`, which supports multiple choice, multi-select and fill-in. It can also hold:
- `challenge`: Python starter code plus hidden test asserts, run in Pyodide.
- `lab`: steps, `verify` (exact / regex / sha256 of the expected output) and `ai_review: true|false`.
- `cards[]`: front and back for flashcards.

`app/content/schemas.py` validates all of this with Pydantic at startup and in CI (`tests/test_content.py`). It checks that slugs are unique, prerequisites exist, the DAG has no cycles, and every quiz has an answer.

**The space-station story.** Sean is a new cadet on the orbital station *Meridian*. Each track is a station deck that he brings back online:
| Track | Station deck | Units (approx. modules) |
|---|---|---|
| 1 Core | Life Support | Linux & shell (10), Bash scripting (8), Git (8), Networking: DNS/HTTP/TLS/SSH (10), systemd & processes (6) |
| 2 Python + Containers | Cargo & Fabrication | Python for ops: files/subprocess/requests/CLI (12), Docker fundamentals (10), Dockerfile hardening and multi-stage builds (6), Compose (6) |
| 3 Kubernetes | Fleet Command | Pods/Deployments/Services (10), config/secrets/storage (6), Ingress & networking (5), Helm (5), kind/k3s labs (4) |
| 4 Delivery & Reliability | Comms, Sensors & Shields | GitHub Actions CI/CD (8), Terraform (8), Ansible (5), Observability: Prometheus/Grafana/logs (8), DevSecOps: scanning, secrets, supply chain (8) |

That is about 170 modules, roughly 6 months of daily work. Tracks 2–4 unlock as their prerequisite units are finished. Many modules link back to BB's own setup, for example "go read how Budget Buddy deploys".

**How content gets written (hybrid).** `scripts/draft_module.py <unit> <slug>` asks Claude to draft a module from `syllabus.yml` in the content schema. The draft lands on a branch and is reviewed and merged through a PR, like any other change. The first release ships **Unit 1.1 written by hand (10 modules)** plus the complete syllabus. After that, units are drafted ahead of Sean's progress.

## 4. Gamification
- **XP:** module completion is worth 50, a perfect quiz +20, a code challenge +30, a lab +40, and an AI-reviewed lab can add up to +20. Each flashcard review earns 2, capped per day. Using a hint costs 5 XP.
- **Levels and ranks:** levels follow a curve of `100 * n^1.5`. Rank titles are Cadet → Technician → Engineer → Systems Officer → Chief Engineer → Station Commander.
- **Streaks:** a day counts if any module is completed *or* the due flashcards are cleared. Every 7 days of streak earns one freeze, with a maximum of 2. A freeze is used automatically when a day is missed.
- **Badges** come from `syllabus.yml`: the end of each unit, streak milestones (7/30/100), "first lab", "no hints for a whole unit", and so on.
- **Station map (skill tree):** an inline SVG of the *Meridian* where each deck lights up as its units are completed. Locked units are dimmed, each node shows its prerequisites, and nodes link to the units.
- **Dashboard ("Today's mission"):** shows the next available module, the number of flashcards due, the streak flame, an XP bar, recent badges and a mission-log line from the story.

## 5. AI features (`app/ai.py`)
These follow BB's `ai.py` pattern of wrapping the `anthropic` SDK.
- **Hints** use `claude-haiku-4-5-20251001`. They are given the module context and the user's attempt, and are told never to reveal the answer.
- **Lab review** uses `claude-sonnet-5-5`. It reviews a pasted Dockerfile, manifest or workflow against the lab's rubric and returns structured JSON (score, strengths, issues). Deterministic `verify` checks always run first.
- **Module drafting** (the `scripts/` CLI) uses `claude-opus-5-5`.
- There is a monthly spend cap set by `AI_MONTHLY_BUDGET_CENTS`, tracked in `ai_requests`. When the cap is reached, the AI features turn off gracefully.

## 6. Infrastructure on the shared droplet
- `/opt/orbit-ops`, with compose services `web` (`127.0.0.1:5002:8000`) and `db`. The `db` port is **not published** at all; migrations run through `docker compose exec`.
- Postgres is tuned for small memory (`shared_buffers=64MB`, `max_connections=20`). Compose sets `mem_limit` on both services (web 256m, db 256m).
- Logging is capped at 10m × 3, as in BB. `TAG` is required, with no default (BB convention).
- Host Nginx gets `/etc/nginx/sites-available/learn.seandesmet.com`, proxying to 5002. A Certbot certificate is added, plus a DNS A record for `learn`.
- RAM check before going live: measure `free -m` and `docker stats`. Add a 1–2 GB swapfile if it isn't already there.
- **Update BB's `RUNBOOK.md`**, because its "Droplet runs Budget Buddy alone" assumption is no longer true. Add a "Hosted apps & ports" table there and in the Orbit Ops RUNBOOK.

## 7. Repo, workflow and docs (copied from BB, then adapted)
These are copied from `/home/sean/Developer/personal-projects/budget-buddy` and renamed. Hard-coded `/opt/budget-buddy` paths and image names are replaced:
- `.github/workflows/`: `ci.yml` (ruff + pytest + behave + an Alembic job checking `upgrade head` and `downgrade -1`), `changelog.yml`, `criteria.yml`, `release.yml` (build → ghcr → smoke `/healthz` → `production` environment approval → SSH deploy → `pg_dump` → `alembic upgrade` → `compose pull web && up -d` → version check), `rollback.yml`, `site-drift.yml`, plus `dependabot.yml` and the issue templates.
- `.pre-commit-config.yaml`, `pyproject.toml` (ruff rules), `pytest.ini` (`criterion` marker, `loadgroup`), and `test.sh`.
- `VERSIONING.md` (0.MINOR.PATCH), `CONTRIBUTING.md` (issue → `<n>-slug` branch → PR with `Closes #N` → squash merge; one migration per PR), and `CHANGELOG.md` with `[Unreleased]`.
- `CLAUDE.md` follows BB's short "Before you… read…" table format. `docs/` gets architecture, gotchas, testing, deployment, delegation, status and a new `content-authoring.md`. `RUNBOOK.md` is also added.
- `.claude/`: `settings.json` (allowlist, deny reading `.env`), the changelog-guard Stop hook, the agents (`sweeper`, `test-first`, `gotcha-auditor`, `release-prep`), the `/wrap` command, and the `verify` skill pointed at `localhost:5002`. A new `content-reviewer` agent checks drafted modules for accuracy and schema compliance.
- BB's self-checking tests are ported: `test_pinned_dependencies`, `test_csp`, `test_hardening`, `test_doc_claims`, `test_deploy_pinning`.
- The Playwright e2e tests (Pyodide challenge, HTMX quiz flow) are new. Playwright is preferred over Claude in Chrome.

## 8. Milestones (one open at a time, as in BB)
1. **v0.1.0 Skeleton and deploy:** repo, tooling, CI, Docker, FastAPI app factory, settings, `/healthz`, login, security headers/CSRF, Alembic baseline, release and deploy pipeline. **Live at learn.seandesmet.com early**, so the pipeline is proven first.
2. **v0.2.0 Learn loop:** content schema and loader, syllabus, module page (Markdown rendered with syntax highlighting), HTMX quizzes, completion/progress, Unit 1.1 content.
3. **v0.3.0 Gamify:** XP ledger, levels/ranks, streaks and freezes, badges, the dashboard, the station map SVG.
4. **v0.4.0 Hands-on and the desk** (shipped 2026-10-09, added after planning): a simulated station console with a task in nine of Unit 1.1's modules, and the visual novel's first form: a pixel-art desk with the app on its monitor and the crew on a comms log. Desktop only.
5. **v0.5.0 Practice:** Pyodide challenges (Web Worker + CSP), SM-2 flashcards with a review queue.
6. **v0.6.0 Labs and AI:** labs with verify checks, Claude lab review, hints, the budget cap, `draft_module.py`, the `content-reviewer` agent.
7. **Ongoing:** writing units ahead of Sean's progress. Follow-ups: TOTP MFA, async SQLAlchemy refactor, PWA/push reminders reusing BB's `push.js`, and a stats page.

## 9. Bootstrap steps (done in the first session)
1. `mkdir /home/sean/Developer/personal-projects/orbit-ops`, then `git init`. Create a GitHub repo `caddismaster/orbit-ops` (public, like BB? **confirm when creating**) and protect `main`.
2. Copy and adapt BB's tooling and docs (§7). Scaffold the FastAPI app, Dockerfile (base/dev/prod stages, non-root uid 10001) and compose files.
3. Open GitHub issues for milestone v0.1.0 with Given/When/Then acceptance criteria, then work them through the normal PR flow.
4. Server prerequisites done by hand, with Sean's approval: DNS record, Nginx site, Certbot, `/opt/orbit-ops`, a `production` environment with its secrets, and the swap check.

## Verification
- `./test.sh` runs ruff, pytest (unit tests for `game/` XP/level/streak/SRS math, content validation, routes via `TestClient`, security header/CSP tests, pin tests) and behave.
- `docker compose up` locally, then use the `verify` skill and Playwright to log in → finish a module → see XP, streak and badge update → run a Pyodide challenge → review flashcards.
- CI must be green on every PR. Alembic upgrade and downgrade are checked against a Postgres service.
- Release: the smoke `/healthz` check passes in CI, and after deploy `curl https://learn.seandesmet.com/healthz` returns the expected version. Confirm BB is still healthy (`budget.seandesmet.com/healthz`) and that `free -m` shows enough headroom.
