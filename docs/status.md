# Status

A per-session log, standing decisions and a release ledger. Newest first.

## Standing decisions

- **Stack:** FastAPI + Jinja/htmx + SQLAlchemy 2.0 + Alembic (chosen 2026-10-08 to learn a new
  backend while keeping the server-rendered frontend). Sync routes first; async is a later lesson.
- **One uvicorn process**, no Redis, no scheduler container — RAM on the shared droplet.
- **Content in git**, AI for hints / lab review / drafting (the "hybrid" option).
- **Single user**, but every learner-state query is user-scoped.
- **Desktop only** (Mac/Windows browsers, 1280×720 and up), decided 2026-10-09 for the desk
  (#38). No phone layouts or phone criteria in new work.
- **The station console is a simulated shell** in the browser (`static/js/shell.js`), never a
  server-side one. It's drawn with our own markup, not xterm.js: xterm injects `<style>`
  elements that `style-src 'self'` blocks (#17).
- **The art is code** (`art/`, stdlib Python → `app/static/img/`), checked by redrawing it.
- **Comms, locks and streaks are derived from progress**, never stored.
- **Learner code never runs on the server.** The console is `shell.js` and Python is Pyodide, both
  in the browser. Challenge verdicts are the browser's, and the server only records them
  (trust-the-client, #54).
- **Pyodide is self-hosted** in `/opt/pyodide` (the dev bind mount hides `/app`). It is fetched at
  build by `scripts/fetch_pyodide.py`, pinned by sha256, and the CSP's only addition is
  `'wasm-unsafe-eval'` (#53).
- **The map's layout is the art's** (`art/ship.py` SLOTS). Units fill their deck's compartments in
  order, and `map:` is gone from the syllabus (#78).
- **No console task may need an untaught command.** `test_content.py` enforces it for Unit 1.1
  (#80). Extend it to each new unit.
- **Static files are versioned by the release** (`static_url()`, `?v=`), cached immutably, and
  revalidated when unversioned. Pyodide's path carries its version (#92).
- **The console's clock is the station's** (2026-10-08 09:00 plus a second per command), never
  the browser's, so ages and dates are the same for every learner and on the server (#67).
- **The console checks itself against the real tools.** Each new capability was compared
  snippet by snippet with bash 5.2 and GNU find/du/tar in a scratch harness. Differences are
  either fixed or deliberate (sorted `find` output, simulated archives, no hard links).
- **Releases:** Sean decides when. On his go, Claude cuts the CHANGELOG, merges it and publishes
  the Release, and Sean approves `production`.

## Release ledger

| Version | Date | Highlights |
|---|---|---|
| 0.5.0 | 2026-10-10 | SM-2 flashcards as MERIDIAN's watch drill (XP, streak, dashboard); self-hosted Pyodide and the first code challenge; the laptop with a closing lid; the map as the *Meridian*; unit briefings shown; migration `0007` |
| 0.4.0 | 2026-10-09 | Console tasks in 9/10 Unit 1.1 modules (sudo, processes, env, awk/sed); the pixel-art desk, its computer and the comms log; Unit 1.1 told as one story |
| 0.3.0 | 2026-10-09 | XP/ranks, streaks + freezes, badges, station map, deck colours, the station console; migrations `0004`–`0006` |
| 0.2.0 | 2026-10-08 | Learn loop: syllabus, Unit 1.1 (10 modules), quizzes, completion, locking; migration `0003` |
| 0.1.0 | 2026-10-08 | Skeleton live at learn.seandesmet.com; pipeline proven end to end; app on `orbit_app` |

## Sessions

### 2026-10-11 — v0.6.0's console built

- **Merged:** #94 cache-busting (#92), and the four console issues: #95 control flow (#64),
  #96 nano/man/cron (#66), #97 find/du/df/tar/links (#67), #98 functions and safe scripting
  (#65). Nothing released: production is still 0.5.0.
- **What the console became:**
  - A real parser and an executor made of generators, so any command can pause for input:
    `read`, sudo's password inside a loop or a script, nano and the pager, and Ctrl-C delivered
    as an interrupt that runs a script's INT and EXIT traps.
  - Output goes through sinks (terminal, pipe, file, `$( )`), so redirects and pipes work on
    whole loops.
  - An unfinished command continues on a `> ` line, as in bash. That changed three old
    assertions: an open quote, a trailing `&&` and a trailing `|` used to be errors.
  - Files can carry a `size` and an `mtime`, and links are real. The server grades two new
    checks: `symlink` and `files_under`.
  - Every command has a man page or `help` text (`app/static/js/manual.js`), and a test keeps
    it that way.
- **Decided this session:**
  - nano's Write Out needs Enter after ^O, as real nano does (the issue's scenario said just ^O).
  - `set -e` at the prompt prints `logout` and a note instead of closing the console.
  - `cd` through a link lands in the real directory (`cd -P`).
  - Hard links are refused, with a hint to use `ln -s`.
- **Process notes:**
  - The comparison harness (same files, same commands, real bash vs `shell.js`) caught about 15
    real bugs that unit tests written from memory had passed. Three of my own test
    expectations were wrong, and the real tools corrected them.
  - ⚠️ A snippet file containing `EOF` lines, written through a shell heredoc, ended that
    heredoc early and ran the rest of the snippets in the repo directory. It made two stray
    files and two `/tmp` entries, which were removed. Write snippet files with the file tool,
    never a shell heredoc.
  - `test.sh`'s ruff runs with `--no-cache`. A plain `docker compose exec web ruff check` fails
    on the cache directory's permissions.
  - The console report now carries `mtime`, `size` and `target`. An older server would reject
    them, so the server and the console must ship together (they do: one image).
- **Next:**
  1. The Unit 1.2 modules, in order: #68 → #77. Each needs a "Try it" run in `ubuntu:24.04`.
  2. When #68 adds Unit 1.2 to the #80 untaught-command check, `_commands()` in
     `tests/test_content.py` must skip shell keywords (`if`, `do`, `done`…).
  3. Release v0.6.0 when Sean says, after the modules.

### 2026-10-10 — v0.5.0 shipped, Unit 1.2 planned

- **Opened v0.5.0** with #51–#54, built all of it, added #55, #80, #82, #85 and #88 along the way,
  and **released v0.5.0**. Release run `38103035747`; `/healthz` 0.5.0 / `8246e28`.
  - Production checks: Pyodide files are served, and Python ran on prod (`45`, 3.14.2) with no CSP
    errors. Budget Buddy stayed green.
  - Migration `0007` ran in smoke. On prod it shows only through Review working, so Sean's
    first visit confirms it.
- **What shipped, by PR:**
  - #57: the laptop and its lid (#55).
  - #58: the reduced-motion fix for window events (#56).
  - #59 `0007 card_state` and #60 SM-2 review (#51). #61: review XP, the streak and the
    dashboard (#52).
  - #62: Pyodide (#53). #63: code challenges (#54), the first a bonus on text-tools.
  - #79: the map as a ship (#78).
  - #81: teaching `cat` before the console needs it (#80).
  - #86: the watch drill and the challenge asker (#82).
  - #87: relay network (#85).
  - #89: unit briefings (#88).
  - #91: the README and the roadmap re-sequence.
- **Decided this session:**
  - The monitor became a laptop whose lid closes (mock-ups of a smaller monitor cramped the app).
  - The first challenge is a bonus in Unit 1.1 (option 1 of 3).
  - Again lowers the ease, and the interval uses the ease from before the grade.
  - Pyodide 314.x runs CPython 3.14, the same as the server.
  - **Roadmap re-sequenced:** v0.6.0 is Bash scripting, v0.7.0 Labs and AI.
- **Content review:** 10 of about 170 modules are written. They're beginner level, the quizzes are
  mostly recall, and there's one scenario question each from Unit 1.2 on. Gaps found and planned
  into 1.2: `man`/`less`, an editor, `find`/`tar`, disk usage, links, quoting.
- **Filed:**
  - v0.6.0 (open): #64–#67 console capabilities, #68–#77 Unit 1.2's ten modules, #92 static
    cache-busting.
  - No milestone: #83 crew notices promotions and badges, #84 the outage mystery thread.
- **Process notes:**
  - Sean found the untaught `cat` by playing the module. A test that walks every console solution
    against the lessons so far found two more gaps.
  - Static files have no cache-busting, so Safari kept old CSS after a change. The fix is a hard
    reload (Cmd+Option+R; Cmd+Shift+R is Reader). Filed as #92.
  - `art/` changes need `docker compose restart web`, because the map imports `art.ship` (now in
    gotchas). `art/` must stay in the image, never in `.dockerignore`.
  - Playwright's `waitForFunction` uses eval, which our CSP blocks. Wait on a selector instead.
  - `gh release create --target` needs a full SHA or a branch name.
  - Two tests had passed for the wrong reason: #54's challenge fixture named a missing file, and
    two review tests assumed three cards per module. Both were fixed when a new test exposed them.
  - Stacked PRs: after the base squash-merges, `gh pr update-branch` may conflict on
    CHANGELOG. Merge `main` into the branch locally (force-push is denied).
- **Next:**
  1. #64, the console's control flow. Everything in Unit 1.2 builds on it.
  2. Then #66 (nano, so learners can write scripts), #67, #65, and the modules in order.
  3. #92 is small and worth doing early in v0.6.0, before the next release.

### 2026-10-09 — v0.3.0 and v0.4.0 shipped

- Started by explaining the "Acceptance criteria" failure emails: PR #13 (a migration-only PR)
  said `Closes #5`, so the check demanded #5's scenarios. Documented in `docs/testing.md` (#30).
- **v0.3.0** (Gamify) was finished and shipped: #23 badges (#31 `0006`, #32), #24 station map
  (#33), #18 immersion (#34), #17 station console (#35). `APP_TIMEZONE` on the droplet is
  `America/New_York` (Sean checked). Release run `37942583419`, `/healthz` 0.3.0 / `236e518`.
- **#17 changed approach mid-issue:** xterm.js 6.0.0 injects `<style>` elements the CSP blocks,
  so Sean chose our own renderer (log + `<input>`).
- **v0.4.0** (Hands-on and the desk), all in one session:
  - #36 (#40) console tasks for 01, 02, 07 and 08, with a `solution:` per exercise that CI runs
    through the shell. The fixture is from `scripts/export_exercises.py`, and
    `check_cases.json` holds both graders to the same verdicts.
  - #37 (#42) sudo with a masked prompt, `/etc/passwd`/`group`, env/PATH/child shells, and a
    process table on a simulated clock. Tasks for 05, 06 and 09; 10 has none (by decision).
  - #41 (#43) small awk and sed that refuse anything outside their subset.
  - #38 (#44) the desk: a pixel-art room, the app on the monitor, the comms log and window events.
  - #46 (#47) the computer drawn in the art, with the HTML as glass only.
  - #45 (#48) all of Unit 1.1 told on comms, plus relay-pass, debris-drift and aurora.
  - Release run `37952415044`, `/healthz` 0.4.0 / `73dfbcb`. No migrations.
- Roadmap re-sequenced: Pyodide and flashcards move to **v0.5.0**, labs and AI to **v0.6.0**.
- Process notes:
  - The dev server doesn't reload on `content/` edits (uvicorn without `watchfiles`):
    `docker compose restart web`. It's in gotchas.
  - Reading a command's real transcript caught more shell bugs than the tests did (`$?`
    timing, `ls` headers and order, `ps` CPU time and PID reuse). Keep doing it for new
    commands.
  - YAML flow mappings split unquoted text at commas: quote comms `text`.
- **Next:** open milestone v0.5.0 (Practice: Pyodide, flashcards) and file its issues.
  Candidates on the way: refine the art (lamp light, mug steam), a `find`/`tar` subset, and
  `.dockerignore` for `art/` and `tests/` (harmless today, flagged by release-prep).

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
