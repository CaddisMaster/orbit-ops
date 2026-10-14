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
- **Lab setups are pasted into the learner's own shell** (#127 on). They build history with
  fixed `GIT_AUTHOR_*`/`GIT_COMMITTER_*` names and dates, so hashes match on every machine. They
  have **no `#` lines** (interactive zsh, the Mac's shell, runs them as commands), edit with `sed
  … > f.new && mv` (BSD vs GNU `sed -i`), use `git init -b main`, and `unset -f` their helpers.
  Lab examples are captured through a TTY (`script`, with `GIT_PAGER=cat`).
- **Unit 1.3 needs only Unit 1.1**, so a Git lab that edits a file names an editor (`nano`) in
  its own lesson (#149), rather than Git requiring Unit 1.2.
- **Releases:** Sean decides when. On his go, Claude cuts the CHANGELOG, merges it and publishes
  the Release, and Sean approves `production`.

## Release ledger

| Version | Date | Highlights |
|---|---|---|
| 0.8.0 | 2026-10-14 | The desk scales with the screen and fills wide windows (#105); quiz retries (#103); typed, sourced flashcards (#104); the crew notice promotions and badges (#83); the Life Support mystery's 1.2 and 1.3 clues (#84, #160). No migrations |
| 0.7.0 | 2026-10-14 | Labs and AI: Unit 1.3 Git (8 modules, labs on your own machine), Claude hints and lab review behind a monthly budget, the AI gate and **Uplink** readout, the verified pre-deploy backup; migrations `0008`, `0009` |
| 0.6.1 | 2026-10-12 | Unit 1.2 modules 05–10 (conditionals → cron): Bash scripting complete, *Routine Automated*; GNU-style `tar` cannot-open message. PATCH, no migrations |
| 0.6.0 | 2026-10-12 | The console as a real shell (control flow, functions, `set -e`/trap, nano, man, cron, find/du/tar, links); Unit 1.2 modules 01–04; the lesson audit (#101); report paths with spaces accepted; release-versioned static URLs |
| 0.5.0 | 2026-10-10 | SM-2 flashcards as MERIDIAN's watch drill (XP, streak, dashboard); self-hosted Pyodide and the first code challenge; the laptop with a closing lid; the map as the *Meridian*; unit briefings shown; migration `0007` |
| 0.4.0 | 2026-10-09 | Console tasks in 9/10 Unit 1.1 modules (sudo, processes, env, awk/sed); the pixel-art desk, its computer and the comms log; Unit 1.1 told as one story |
| 0.3.0 | 2026-10-09 | XP/ranks, streaks + freezes, badges, station map, deck colours, the station console; migrations `0004`–`0006` |
| 0.2.0 | 2026-10-08 | Learn loop: syllabus, Unit 1.1 (10 modules), quizzes, completion, locking; migration `0003` |
| 0.1.0 | 2026-10-08 | Skeleton live at learn.seandesmet.com; pipeline proven end to end; app on `orbit_app` |

## Sessions

### 2026-10-14 (afternoon) — #105 finished, v0.8.0 shipped, Networking planned

- **#105:**
  - Sean's 1080p screenshot was 1864×984. Rendering at that size locally showed the scene was
    never cropped: a window wider than 16:9 letterboxes it, and the art runs into the bars.
  - Two previews were built on a throwaway branch and compared on a private artifact page:
    A, redraw with margins; B, a wider room behind the scene. **Sean chose B.**
  - #163: `Canvas` takes an `origin`, `room.wide()` draws 432×180, and `body::before` places it
    at the scene's scale. 16:9 is byte-identical, and every existing PNG is unchanged.
- **Released v0.8.0** (run `38575135182`, `542844a`; the cut was #177). Backup ok at 3118
  bytes, no migrations, `/healthz` 0.8.0, BB green.
  - Sean chose 0.8.0 for this release, and the Networking milestone was renamed v0.9.0, which
    keeps milestones and minors one to one. v0.7.0's milestone is closed.
- **Planned Unit 1.4 (milestone v0.9.0 — Networking), 13 issues:**
  - console platform: #164 (network, `ip`/`ss`/`ping`/`nc`), #165 (DNS: `dig`/`host`/`getent`,
    `/etc/hosts`), #166 (`curl` over station HTTP services, and `ufw`)
  - modules #167–#176: 01–03 and 09–10 are console tasks, 04–08 are labs (HTTP, APIs + `jq`,
    TLS, SSH keys, rsync and tunnels). #176 carries the mystery's 1.4 clue and updates
    `docs/story.md`.
  - Decided: the simulated network for story tasks, labs for real-world skills. The station's
    fake hosts can't exist on the real internet.
- **Next:**
  1. #164, the console's station network. Suggested order: #164 → #167 → #165 → #168 → #169 →
     labs #170–#174 → #166 → #175 → #176.
  2. On the desk: the first live hint and lab review; open Review once (`0007` on prod).
  3. The `su` gap in module 05 is still unfiled.

### 2026-10-14 — v0.7.0 shipped; #103, #104, #83, #84, #160 and half of #105

- **Released v0.7.0** (run `38557174800`, `33d4579`), after Sean put a key for this app alone
  and `AI_MONTHLY_BUDGET_CENTS=500` in the droplet's `.env` from the Mac. The cut was #154.
  - The deploy's first real backup logged `backup ok`, 2811 bytes. The script keeps only a dump
    that ends with `dump complete`, so the old 2.8 KB worry is settled.
  - `0008` and `0009` ran in the deploy. `/healthz` reports 0.7.0, and BB is still green.
- **Merged since the release (all unreleased):**
  - #133: Dependabot, `anthropic` 1.13.0 and `pycparser` 3.11.
  - #155: the app scales with the desk, 1rem = scene width / 80, between 16 and 32px (part of
    #105). 1280×720 is unchanged byte for byte.
  - #156 (#103): a wrong quiz answer gets **Try again** / **Show me**, and only the first
    attempt is scored. *Show me* is an attempt with an empty answer, so no migration.
  - #157 (#104): flashcards show their unit, module and lesson section, with links. Lesson
    headings have `sec-` ids. You type the answer before the back, and an exact `accept:` answer
    preselects Good. All 84 cards are backfilled.
  - #158 (#83): promotions and badges speak on comms, derived like everything else. A
    completion's moment is its XP award's (Postgres `now()` is the transaction's start).
  - #159 (#84): `docs/story.md` holds the Life Support mystery. Unit 1.2's cron task now finds
    `/etc/cron.d/scrubber-maint` at 02:35.
  - #161 (#160): *Reading history*'s lab builds `~/meridian/station-config`. Its last step
    finds `depot-sync`'s commit `b26750b` with `git log -S scrubber-flush`.
- **Decided this session:**
  - #103: existing wrong answers become retryable too.
  - #104: grading stays self-graded, and `accept:` is only for single-string answers.
  - #83: a badge without lines gets MERIDIAN's `COMMENDATION LOGGED · NAME`.
  - #160: option 1, a second repo, so the alarms history (HEAD `5bb59d5`) is untouched.
  - Labs allow four boxes, so step 6 puts both pastes in one box.
- **What checking against the real thing found:**
  - `git log -S` searches contents, so the file name `scrubber-maint` finds nothing.
  - htmx focuses `[autofocus]` at settle, about 20 ms after the swap.
  - The console has no `printf`.
  - `/etc/cron.d` user fields were confirmed in `ubuntu:24.04`.
  - Console success text is plain text, not Markdown.
- **Process notes:**
  - The auto-mode classifier refused the release PR's merge until Sean said "merge it".
  - `scripts.export_exercises` must run as the host user (`-u "$(id -u):$(id -g)"`).
  - A test user seeded straight into `module_progress` earns every badge at its first check, so
    its comms fill with commendations. That's an artifact of the seeding, not a bug.
- **Next:**
  1. On the desk: does the readout say **Uplink online**? Ask for the first live hint, and play
     module 08's lab for the first real review. Open Review once to confirm `0007` on prod.
  2. #105's first half: a screenshot from the 2K monitor, plus the browser, zoom and macOS
     scaling.
  3. Release the merged work when Sean says (a MINOR: #103, #104, #83 and #84 change behaviour).
  4. Content gap: module 05 (`users-and-sudo`) has a `sudo` vs `su` card, but the lesson never
     teaches `su`. Not filed yet.
  5. The Mac checks from 2026-10-13 still stand. Next unit: Networking (1.4), with its clue from
     `docs/story.md`.

### 2026-10-13 — Unit 1.3 Git written: all eight modules

- **Merged:** the eight Git modules, one PR each, plus one follow-up.
  - #144 (#125) Your first repository
  - #145 (#126) Staging and diffs
  - #146 (#127) Reading history
  - #147 (#128) Branches and merging
  - #148 (#129) Merge conflicts
  - #150 (#130) Remotes
  - #151 (#131) Undoing things
  - #152 (#132) Working together, the first `ai_review` lab and the end of the unit (*Every Change Logged*)
  - #149: a nano line in module 01, a follow-up to #148's review.
- **Nothing released.** Production is still 0.6.1. v0.7.0's content and platform are both
  merged.
- **How each module was made:**
  - written with a `NEEDS` entry, which now covers labs as well as console tasks (#144)
  - setup, steps and Try it run in `ubuntu:24.04`, under bash and pasted into interactive zsh
  - read by the content-reviewer, whose unconfirmed claims were then run in a container
  - played as `verify-bot` in Playwright, then checked with `/verify`, then the PR
- **Decided this session:**
  - Labs check what can be checked, and each refusal has a test named for the mistake. Module
    08's rubric asks Claude only for what the pastes show and the checks can't judge.
  - Issue deviations, each noted in its PR:
    - module 01's file is in `~/meridian`, not `/etc`
    - module 02 pastes `git show HEAD` and `git diff`, not `--stat`
    - modules 03, 07 and 08 got extra boxes
  - The editor gap: a line in module 01 (#149), not a Unit 1.2 prerequisite. Sean's choice.
- **What checking against the real thing found:**
  - zsh doesn't treat `#` as a comment when pasted. `script` hung on git's pager.
  - The real `add -p` prompt. The `fetch first` vs `non-fast-forward` rejections. git 2.43's
    divergent-pull refusal. `branch -d` refusing a squashed branch. `main` has no merge commits.
  - YAML ate the leading space of ` M file` (use `|2`). Splitting a module on `---` breaks on
    examples that contain `---` (ask the loader).
  - Three hints that were wrong for one of the mistakes their check catches, found in the
    browser.
- **The reviewer caught:**
  - a quiz that handed over the lab's `git revert` hash, and a table that was the lab's `.gitignore`
  - "merging deploys", "history is never rewritten" and "life support fully online": all false
  - the Unit 1.3 editor gap
- **Process notes:**
  - Branch protection is strict. #150 needed `gh pr update-branch` after #149 merged.
  - Sean's local `sean` account had Unit 1.1 marked complete by hand, to open Git without
    replaying it: seven modules, `permissions` included. Unwind if wanted.
- **Next:**
  1. **Release v0.7.0** when Sean says. First `ANTHROPIC_API_KEY` (and optionally
     `AI_MONTHLY_BUDGET_CENTS`) goes in the droplet's `.env`, from the Mac. Migrations `0008`
     and `0009` are expand-only. The first live hint and lab review happen then, so watch
     module 08's rubric on its first real review.
  2. On the Mac: play the Git labs, and check the two things the VM couldn't. Does Apple git
     build module 03's history with HEAD `5bb59d5`? Does an empty clone land on `main`
     (module 06's Try it)?
  3. Still open from before: Review loads on prod (`0007`), and a pre-deploy dump ends with
     `dump complete`.
  4. #103–#105, #83, #84 when Sean picks them. Next unit after the release: Networking (1.4).

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
