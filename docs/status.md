# Status

A per-session log, standing decisions and a release ledger. Newest first.

## Standing decisions

- **Stack:** FastAPI + Jinja/htmx + SQLAlchemy 2.0 + Alembic (chosen 2026-10-08 to learn a new
  backend while keeping the server-rendered frontend). Sync routes first; async is a later lesson.
- **One uvicorn process**, no Redis, no scheduler container — RAM on the shared droplet.
- **Content in git**, written with Claude in sessions. The app's own API key pays only for
  hints and lab review; no `draft_module.py` (dropped 2026-10-12, #124).
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
- **Lessons say plainly what their task needs** (#101). Every command a solution uses is in the
  lesson's prose or a table (not only a code comment or Try it), and the ideas behind each task
  are listed per module in `NEEDS` (`tests/test_lesson_needs.py`). A section that mentions
  something the console lacks says so. Tasks stay hard; the help is findable.
- **The console checks itself against the real tools.** Each new capability was compared
  snippet by snippet with bash 5.2 and GNU find/du/tar in a scratch harness. Differences are
  either fixed or deliberate (sorted `find` output, simulated archives, no hard links).
- **Content-only work ships as PATCH releases** (#110). When v0.6.0 went out with Unit 1.2
  half written, modules 05–10 moved to a `v0.6.x` milestone and shipped as 0.6.1. A module that
  needs new console code would make its release the next MINOR.
- **Behaviour is graded by a logged run.** The server sees only the end state, so a task about
  a script's behaviour has the learner append each run's output and `exit $?` to a log, and
  the checks pair the two (#72, #74, #76). A trap is proven by `files_under: /tmp` after a failed
  run. Use it only where output alone can't show the behaviour (#75 didn't need it).
- **The console's crontab refuses bad times; Ubuntu 24.04's doesn't** (#77). Kept on purpose
  (#66). Lessons mustn't claim a real crontab refuses them, or quote one PATH for cron jobs
  (`docs/content-authoring.md`).
- **Labs run on the learner's own machine** (#121). The learner pastes the output and the server
  checks the text; nothing runs server-side. Checks never depend on hashes, dates, names or git's
  default branch, so there is no exact-match check. Unit 1.3 (Git) is the first unit built on
  labs; the console never learns `git`. Like a console task, a lab doesn't gate completion.
- **The app's API key pays for runtime AI only** (2026-10-12): hints (Haiku 5.5, #123) and lab
  reviews (Sonnet 5.5, #122), behind one gate (`spend.run`, #120) with a $5/month cap. Lessons
  are written in Claude Code sessions, never through the key; `draft_module.py` was dropped.
- **A hint never sees the answer key, and its reply is checked anyway** (#123). A replaced hint
  is free. Short quiz answers (`-a`, `/`, `3`) sometimes catch an innocent hint: accepted.
- **Every module goes through the `content-reviewer` agent** before its Try it run and PR (#124).
  For a lab it's the only #101 check.
- **Releases:** Sean decides when. On his go, Claude cuts the CHANGELOG, merges it and publishes
  the Release, and Sean approves `production`.

## Release ledger

| Version | Date | Highlights |
|---|---|---|
| 0.6.1 | 2026-10-12 | Unit 1.2 modules 05–10 (conditionals → cron): Bash scripting complete, *Routine Automated*; GNU-style `tar` cannot-open message. PATCH, no migrations |
| 0.6.0 | 2026-10-12 | The console as a real shell (control flow, functions, `set -e`/trap, nano, man, cron, find/du/tar, links); Unit 1.2 modules 01–04; the lesson audit (#101); report paths with spaces accepted; release-versioned static URLs |
| 0.5.0 | 2026-10-10 | SM-2 flashcards as MERIDIAN's watch drill (XP, streak, dashboard); self-hosted Pyodide and the first code challenge; the laptop with a closing lid; the map as the *Meridian*; unit briefings shown; migration `0007` |
| 0.4.0 | 2026-10-09 | Console tasks in 9/10 Unit 1.1 modules (sudo, processes, env, awk/sed); the pixel-art desk, its computer and the comms log; Unit 1.1 told as one story |
| 0.3.0 | 2026-10-09 | XP/ranks, streaks + freezes, badges, station map, deck colours, the station console; migrations `0004`–`0006` |
| 0.2.0 | 2026-10-08 | Learn loop: syllabus, Unit 1.1 (10 modules), quizzes, completion, locking; migration `0003` |
| 0.1.0 | 2026-10-08 | Skeleton live at learn.seandesmet.com; pipeline proven end to end; app on `orbit_app` |

## Sessions

### 2026-10-12 (afternoon) — v0.7.0 opened; its platform half built

- **Opened v0.7.0 — Labs and AI** and filed #120–#132. #116 joined it, to go first. Sean chose:
  Unit 1.3 Git as labs, the roadmap's model split, #116 first.
- **Merged:**
  - #134: the deploy's backup is a verified script (#116).
  - #135 and #137: `0008 ai_requests` and the AI gate (#120). #136 was the same branch, closed by GitHub (see process notes).
  - #138: labs (#121).
  - #139 and #140: `0009` and Claude's lab review (#122).
  - #141: hints (#123).
  - #142: the content-reviewer agent (#124).
- **Nothing released.** Production is still 0.6.1.
- **Decided this session:**
  - **No `draft_module.py`**, and so no Opus in the app. Sean questioned the cost, and the
    sessions already write the lessons. #124 is now the reviewer agent alone, and the roadmap
    says so.
  - Labs don't gate completion. #121 assumed console tasks do, and they never did.
  - Server-side refusal fallbacks were left off for the lab review. On Sonnet 5.5 they only retry
    the `cyber` and `frontier_llm` categories, and they'd need the beta client around `parse()`.
  - Hint XP: 5, once per item; a hint replaced by the guard is free.
- **What checking against the real thing found:**
  - **#116:**
    - Ubuntu 24.04's dash refuses `set -o pipefail`.
    - `docker compose exec -T` under `bash -s` swallowed the rest of the script, which then
      exited **0** with no backup.
    - pg_dump 16.15 puts `\unrestrict` after its completion line.
  - **#122:** the SDK sends a Pydantic class's docstring to the model as the schema. Found with
    the real SDK against `httpx2.MockTransport`.
  - **#121 and #124:** YAML bit twice, so docs that teach YAML are now parsed by tests.
    - An unquoted `?` in a doc example didn't load.
    - The agent's `description` was cut off at ` #101`.
  - **#124:** git isn't in `ubuntu:24.04`; a first commit needs an identity; `git log` in a
    terminal shows `(HEAD -> master)`. All noted on #125.
- **Process notes:**
  - ⚠️ **A stacked PR is closed when its base branch is deleted.** Merging #135 with
    `--delete-branch` closed #136 for good, and it can't be reopened or retargeted. Point a
    feature PR at `main` from the start, even while its migration PR is open. #140 did, and it
    worked.
  - Playwright screenshots log CSP errors (a caret-hiding `<style>`). In gotchas.
  - A new `.claude/agents/*.md` isn't an agent type until the next session, so #124's
    hand-verification ran a general-purpose agent that read and followed the file.
  - No Anthropic key on the VM, so no live API call yet. The droplet needs `ANTHROPIC_API_KEY`
    in `.env` (RUNBOOK §3) before the release.
- **Next:**
  1. The Git modules, #125 → #132. Read #125's comment first, and run each through the
     content-reviewer. Module 08 (#132) is the first `ai_review` lab.
  2. Release v0.7.0 when Sean says, after the key is on the droplet. Migrations `0008` and
     `0009` are expand-only.
  3. Sean, on prod (still open): Review loads (`0007`), and check that a pre-deploy dump ends with
     `dump complete`.
  4. #103–#105 when Sean picks them.

### 2026-10-12 — v0.6.0 and v0.6.1 shipped; Unit 1.2 complete

- **Released v0.6.0** first thing (#110; run `38244098095`, `/healthz` 0.6.0 / `e62a035`), which
  fixed the refused-reports bug on prod. The v0.6.0 milestone closed. Modules 05–10 moved to a
  new **v0.6.x** milestone, to ship as a PATCH.
- **Merged:** #111 conditionals (#72), #112 loops (#73), #113 arguments and input (#74), #114
  functions (#75), #115 robust scripts (#76), #117 scheduling with cron (#77). That completes
  Unit 1.2, and its badge was earned in the browser.
- **Released v0.6.1** (#118; run `38251659082`, `/healthz` 0.6.1 / `72d6e90`). Budget Buddy
  stayed green, and no migrations ran.
- **Every module was checked against the real thing:**
  - the solution, the starting script and the Try it in `ubuntu:24.04` (bash 5.2, GNU tar 1.35,
    cron 3.0pl1-184ubuntu2);
  - a Playwright solve as `verify-bot`;
  - every "On the real station" claim against the file it names.
- **What that checking changed:**
  - **Console:** `tar` that can't write its archive now prints GNU's `Cannot open:` (and the
    `tar (child):` lines with `-z`), and nothing else (#115). GNU's timing-dependent `Wrote
    only 4096 of 10240 bytes` is left out on purpose.
  - **Ubuntu 24.04's cron:** `crontab` validates no time fields, and jobs inherit the service's
    PATH (`cron -P`). The lesson, its Try it and `docs/content-authoring.md` say so. The Try it
    now saves the learner's own crontab and restores it.
  - **Two drafted claims were wrong:** the healthz loop is the smoke test, and the dump check is
    `gzip -t`.
- **Decided this session:**
  - Module 08 shares code between `deck-readings` and a new `co2-alarm`, not `o2-check` as the
    issue said: the O2 sensor's format shares nothing with the CO2 logs.
  - Module 05's starting script already counts in tenths, so the task stays about conditionals.
  - `/tmp` is listed as mode 777 in module 09 (the schema takes no sticky bit), because
    `files_under` needs it in the starting state.
  - `test_no_console_task_needs_an_untaught_command` skips an exercise's own files run by full
    path.
- **Filed:** #116, the deploy's `pg_dump | gzip` has no `pipefail`, so a failed dump can pass
  `gzip -t`. ⚠️ Today's pre-deploy dumps were about 2.8 KB: check one ends with `dump complete`.
- **Process notes:**
  - `check_criteria` failed once on a GitHub GraphQL 504. A rerun of the failed job passed.
  - In a Docker `ubuntu` image, `truncate` makes sparse files (so `du` shows 16K), and the cron
    daemon didn't fire a job reliably. Use `fallocate` for sizes, and `env -i` to show a job's
    environment.
- **Next:**
  1. Open **v0.7.0 — Labs and AI** and file its issues (`docs/roadmap.md`).
  2. #116 is small and protects every deploy, so consider it early.
  3. Sean, on prod: Review loads (`0007`), and module 04's `Spare Parts.csv` solve is logged.
  4. #103–#105 when Sean picks them. #105 still waits on a screenshot.

### 2026-10-11 (evening) — Unit 1.2 modules 01–04, and the lesson audit

- **Merged:** #100 module 01 reading and editing (#68), #102 module 02 finding things and disk
  space (#69), #106 the lesson audit (#101), #107 module 03 your first script (#70), #108 module
  04 variables and quoting (#71).
- **Console and app, beyond the content:**
  - `man` reads an exercise's own pages in `/usr/share/man/manN/`, in man-db's section order.
  - Quiz questions take a `code:` block (the scenario questions need one). Answer options are
    one flex item, so inline code wraps with its sentence.
  - New check `{executable: P}`: the owner's x bit, in both graders and the parity cases.
  - `rm -i`/`mv -i`/`cp -i` ask in GNU's words; the last of `-f`/`-i` wins. `rm -i` used to
    delete without asking.
  - Matched to bash: a non-executable script on PATH is `Permission denied` (126); in a script,
    errors are `script: line N: …` (path as `$0`, lines kept inside `$( )`); `ambiguous
    redirect`; several files into a missing directory is `No such file or directory`.
  - **Server:** report paths may hold any printable character (they're only compared). A space,
    a comma or a `*` used to get the whole report refused.
- **Decided this session:**
  - Module 02's sizes are set so getting under 70% needs both emptying the log and archiving.
  - `cp -n` isn't taught (coreutils 9.4 warns it's non-portable).
  - Console home stays the task's start directory, and lesson 02 now says so; the prompt shows
    `~` only for `/home/cadet`.
  - Lesson examples use different names from the task's, so they never hand over the answer.
- **Filed:** #103 change a wrong quiz answer, #104 typed flashcards with their source, #105 the
  desk on a 2K monitor. **#105 needs a screenshot, the browser, its zoom and the display scaling
  from Sean.** The cut-off didn't reproduce headless; the app also doesn't scale up with the
  screen.
- **Process notes:**
  - Sean played module 03 as a learner and got stuck. What he needed was only in comments and
    Try it, which led to #101. Playing the modules is the best review we have.
  - Every new console message was checked in `ubuntu:24.04` before it was written. That caught
    `dir` being a real command, the blank-line shebang fallback and `cp -n`'s warning.
  - `man` in a Docker `ubuntu` image is a stub: the Try it check removes the dpkg excludes and
    the `/usr/bin/man` diversion first.
- **Next:**
  1. **Cut the release** (see the note at the top).
  2. Then #72 → #77, Unit 1.2 modules 05–10, each with its `NEEDS` entry.
  3. #103–#105 when Sean picks them. #105 waits on his screenshot.

### 2026-10-11 (morning) — v0.6.0's console built

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
