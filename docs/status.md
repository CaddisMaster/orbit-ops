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
| 0.2.0 | 2026-10-08 | Learn loop: syllabus, Unit 1.1 (10 modules), quizzes, completion, locking; migration `0003` |
| 0.1.0 | 2026-10-08 | Skeleton live at learn.seandesmet.com; pipeline proven end to end; app on `orbit_app` |

## Sessions

### 2026-10-08 (evening) — v0.2.0 shipped; XP and streaks merged

- **Released v0.2.0.** The `release-prep` agent said GO, with no blockers. The CHANGELOG cut was
  #20. Release run `37864244817`: backup ok, migration, `running version 0.2.0`, healthy.
  `/healthz` reports `0.2.0` / `63cf507`, and Budget Buddy stayed green. Alembic's upgrade lines
  don't appear in the deploy log, only the one-off `web-run` container. Checking a module page
  on production would confirm `0003`.
- Milestones: v0.2.0 is closed and **v0.3.0 — Gamify** is open, holding #17, #18 and four new
  issues: #21 XP, #22 streaks, #23 badges, #24 station map.
- **#21 done** (#25 `0004 xp_events`, #26 feature).
  - Awards are idempotent through a unique `(user_id, reason, ref)` and
    `INSERT … ON CONFLICT DO NOTHING`.
  - Level *n*→*n+1* costs `100·n^1.5` in total. That's an interpretation: the issue's literal
    wording would need 100 XP to *be* level 1.
  - Rank bands live in `syllabus.yml` (Cadet 1 … Station Commander 21).
  - No backfill for completions made before the ledger existed.
- **#22 done** (#27 `0005 activity_days`, #28 feature).
  - The streak is a pure function of the rows and today, so there's no scheduler.
  - The first request that finds a gap it can bridge writes the `freeze_used` rows.
  - A frozen day keeps a run alive but doesn't lengthen it.
  - A gap is bridged only if the freezes cover all of it.
- ⚠️ **Before releasing v0.3.0:** confirm the droplet's `.env` sets `APP_TIMEZONE` to Sean's
  zone (it defaults to UTC, so the streak day would roll over at UTC midnight). Release-prep won't
  flag it, because the variable isn't new.
- Process notes:
  - `gh pr merge --delete-branch` also deletes the *local* branch. For a stacked branch, check
    that the old base tree equals `origin/main` (`git diff --quiet`), then
    `git reset origin/main` (keeping the working tree). That replaces the stash dance.
  - SQLAlchemy 2.1 deprecates `Result.tuples()`: rows already unpack as tuples.
  - Tests that depend on "today" pin `app.game.streaks._now` and set `get_settings().app_timezone`
    with monkeypatch, because the dev container's `.env` may not be UTC.
- **Next:**
  1. #23 badges. Its `badges_earned` migration goes first. Evaluate after completion and after
     the streak update.
  2. #24 station map.
  3. #17 and #18.
  4. Cut v0.3.0 once the milestone is empty, after the `APP_TIMEZONE` check.

### 2026-10-08 (afternoon) — milestone v0.2.0 built, not yet released

- Every v0.2.0 issue is closed:
  - #11 (#4): the content format and loader
  - #12 (#9): HEAD → GET
  - #13: the `0003` progress tables, in a PR of their own
  - #14 (#5): quizzes, completion, locking and today's mission
  - #15 (#6): the full syllabus (4 tracks, 19 units) and Unit 1.1's ten modules
  - #16 (#3): the `gotcha-auditor` and `release-prep` agents
- **v0.2.0 is NOT cut.** Sean chose to release it in a later session. Production is still 0.1.0.
  Start that session with the `release-prep` agent: one expand-only migration (`0003`, the
  pipeline applies it), no new env vars.
- Found by driving the browser, not by tests: htmx ignores 4xx (validation fragments are 200),
  and quiz text needed inline Markdown. Found by **running every "Try it" in `ubuntu:24.04`**:
  wrong umask claim, a missing `mkdir`, and a misplaced `echo $?`. Both checks are now habits
  (the PR template and `docs/content-authoring.md`).
- Filed for v0.3.0 (no milestone yet, because v0.2.0 is still the open one): #17, a simulated
  terminal exercise (xterm.js plus our own JS shell; **no server-side shell on the shared
  droplet**), and #18, immersion (starfield, deck colours, typed briefings, emblems; CSP must not
  change).
- **Next:**
  1. Cut v0.2.0.
  2. Close its milestone, open v0.3.0, and move #17 and #18 into it.
  3. File the remaining v0.3.0 issues: the XP ledger, levels/ranks, streaks + freezes, badges,
     the station map.
- Process notes:
  - A stacked branch is replayed onto `main` after its base squash-merges (stash → new branch),
    because `git push --force` is denied.
  - `gh pr update-branch` brings a PR up to date server-side.
  - Never write "closes #N" anywhere in a PR body that only partly does the work: GitHub links it,
    and the criteria check then demands every scenario.

### 2026-10-08 — project bootstrap

- Planned the app (`docs/roadmap.md`) and built milestone v0.1.0's skeleton: the app, auth,
  security headers, CSRF, rate limit, Alembic (users + the `orbit_app` role), Docker, CI,
  release/rollback workflows, docs, and the Claude setup. 26 tests passing; CI green on the
  first push.
- GitHub: the repo is public, squash-only, with branch protection (Lint, Tests, Image builds,
  changelog, criteria), secret scanning + push protection, and labels. The `production`
  environment exists with a required reviewer, and the repo var `DROPLET_USER=deploy` is set.
- Milestone **v0.1.0**: #1 droplet setup, #2 cut v0.1.0 + least-privilege role, #3 port the
  `gotcha-auditor` / `release-prep` agents. v0.2.0 issues filed without a milestone: #4 content
  schema/loader, #5 quizzes + completion, #6 syllabus + Unit 1.1.
- Budget Buddy's RUNBOOK now records the shared droplet (BB #478 / #479).
- Notes are set up like BB's: `CLAUDE.local.md` → `personal-vault`, memory in
  `personal-vault/claude/memory/orbit-ops`, diary and reference notes in
  `obsidian-vault/Orbit Ops/`.
- **Shipped v0.1.0 the same day.** Droplet setup (#1) was done from the Mac: DNS, Nginx, a
  single-name Certbot lineage, `/opt/orbit-ops` and `.env`, and a **new dedicated deploy key**
  (BB's private key exists only in BB's GitHub secrets, so it couldn't be copied, and a
  per-app key can be revoked on its own). Release run `37826926927`: smoke test passed, deploy
  approved, backup taken, migrations run, `0.1.0` verified. Then the app was switched to
  `orbit_app` and the learner account created on production (#2).
- The ghcr package came out public on its own (public repo), so the droplet needs no
  `docker login`.
- Found while verifying: `HEAD` returns 405 (#9).
- **Next:** milestone v0.2.0 (Learn loop): done the same afternoon, see above.
