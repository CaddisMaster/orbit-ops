# Status

Standing decisions, the release ledger and the last three sessions, newest first. Older
sessions are in [`status-archive.md`](status-archive.md), moved there unchanged by the wrap
(#259), so this file stays short enough to read at the start of a session.

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
- **Names on the console go `/etc/hosts`, then DNS** (#165), as `nsswitch.conf` says: `getent`,
  `ping`, `nc`, `curl` and `ssh` read the file first, while `dig` and `host` ask the resolver only.
  The records are the exercise's `network.dns`. A host's `name` isn't in DNS unless a record says so.
- **The console's firewall is ufw's own files** (#166): `/etc/ufw/ufw.conf` and `user.rules`,
  byte for byte as ufw 0.36.2 writes them, read live. **A firewall task is graded with
  `contains` on the rule's `### tuple ###` line.** Rules apply only to connections into the
  console from another host.
- **"From another host" is `ssh HOST 'COMMAND'`** (#166), for hosts with `login: true`; only
  `nc`, `curl`, `ping`, `hostname`, `echo`, `true` and `false` exist there. Real ssh, chosen
  over an invented command.
- **The console's systemd is its unit files** (#303): units are files read live, enabling is the
  `.wants/` link, and running is runtime state reported as `units`. An exercise declares what
  each program does (`exits`, `runs_for`), since nothing runs. Only declared units exist, so a
  module that mentions `ssh.service` declares it. Reading the journal needs root or `adm`, and
  module 06's reveal relies on that (#304).
- **Labs that read live services check only what can't change** (#170–#173): a redirect's
  `Location`, a certificate's subject and `O = Let's Encrypt` (never its intermediate or dates),
  GitHub's permanent facts and published fingerprint, and the shape of anything that grows.
- **The laptop screen's contents are drawn at 85%** (#188, Sean's pick from previews), with the
  lesson column widened by the same factor. `docs/gotchas.md` has the zoom's JS trap.
- **The containers are locked down** (#263–#266). Root owns the image's code, and `web` runs
  read-only with no capabilities. The deploy's migrations and the release smoke test run the
  same way. `db` keeps its capabilities and gets `no-new-privileges`. Postgres is pinned by tag
  and digest, and any `db` edit is a scheduled operation (RUNBOOK §5), never a release.
- **Image scans run with no write token** (#265). Grype runs on every PR and on the pushed
  digest before the deploy, in a read-only job, and fails on a fixable CRITICAL. It's Grype
  rather than Trivy because Trivy's action, binary and images were hijacked in March 2026.
  Release images carry an SBOM and provenance. Signing waits until the deploy can verify it.
- **A file that a unit is about to grow is split by area first, as a generated pure move** (#255,
  #257). A script parses the old file, moves each block's text unchanged, and computes the imports
  (`S.name` aliases in the shell's parts, Python imports in the schema package). A part may use
  only the parts before it. A line-by-line comparison proves nothing else changed.
- **Releases:** Sean decides when. On his go, Claude cuts the CHANGELOG, merges it and publishes
  the Release, and Sean approves `production`.
- **The admin panel is the one cross-user reader** (#281, 2026-10-25). `app/admin.py` names its
  target user explicitly and only `require_admin` routes call it (non-negotiable #1 says so).
  Non-admins get a 404; every destructive action re-asks the admin's password, counted by the
  login limiter. The first admin is made with `create_user.py --admin` on the droplet.
- **Production's System page can't read the database's revision** (#285): `orbit_app` stays
  locked out of `alembic_version` (0002). Sean kept that over a read grant, since every deploy
  migrates before the new image serves.
- **The screen's text stays 13.5–15.5px at any window size** (#293, 2026-10-25). The art grows
  with the desk; `--screen-scale` steps down with the scene's width so reading text doesn't.
  Sean picked 0.68 at his 1864×984 from screenshots at 0.85, 0.75 and 0.68, small windows
  unchanged. The lesson column keeps its line length in characters.

- **The droplet as code, at no extra cost** (2026-10-27, milestone *Infrastructure as code*).
  Budget Buddy owns the host layer (BB #530's Ansible role) and the Terraform for the droplet and
  DNS, `learn`'s record included (BB #533). Orbit Ops owns only its app role (#322), pinning BB's
  host role by SHA. Roles never write `.env` or `docker-compose.yml` (`release.yml` owns those),
  and never remove an Nginx site they didn't create. Tested in LXD containers on the VM; production
  only in check mode, from the Mac, until Sean decides otherwise.
- **Orbit Ops dumps its own database nightly; BB ships it off the droplet** (option B, 2026-10-27).
  `orbit-ops-backup.timer` (#324) runs the deploy's own `backup_db.sh`, which each release
  installs in `/opt/orbit-ops`. The off-box copy is BB #535. Every dump is `600` (#326).
- **Agents earn their place** (#260, 2026-10-29). `sweeper` and `test-first` were deleted from
  `.claude/agents/`: ported from Budget Buddy at bootstrap, never used here, and each was a file
  to keep in step with BB's. `gotcha-auditor` stays and runs on every branch diff before its PR
  (as `/cycle` does). It earned that on 2026-10-29 by catching #329's JS calendar parser
  accepting steps the schema refused. BB's copies are unaffected.

- **Every `.env` has a recovery copy in Bitwarden** (#320, 2026-10-29): `orbit-ops-env-local`
  and `orbit-ops-env-prod`, every key a field. The droplet has no `bw` and its `.env` stays a
  plain file; edit it first, then the item. The helpers are shared with Budget Buddy, kept once
  in the private vault repo and symlinked in (RUNBOOK §3).

## Release ledger

| Version | Date | Highlights |
|---|---|---|
| 0.13.0 | 2026-10-28 | Unit 1.5 systemd & services complete (6 modules, *Daemons Tamed*), and the Life Support mystery's reveal in the journal (#310): the console's `systemctl`, unit files and timers (#303) and `journalctl` (#304). The nightly database dump (#324) with private dumps (#326), its script installed by each deploy. No migrations
| 0.12.1 | 2026-10-25 | The laptop screen's text stops growing with the window: 13.5–15.5px at every size, 14.9px at 1864×984 (#293). A PATCH. No migrations |
| 0.12.0 | 2026-10-25 | The admin panel (#280–#285): reset a learner's progress (all, or one module or unit), preview any module, create and manage accounts (password, log out everywhere, delete, JSON export), AI spend and System pages; destructive actions re-ask the password. Migration `0010` (`users.is_admin`) |
| 0.11.1 | 2026-10-24 | Hardening, nothing new for the learner: root-owned image code, `web` read-only with no capabilities (#263, #264), Grype scans and an SBOM/provenance on every release (#265), Postgres pinned by digest, applied by hand first (#266); `shell.js` split into 12 parts (#255), the schema a package (#257); two Unit 1.1 tasks check what they ask (#249). A PATCH. No migrations |
| 0.11.0 | 2026-10-21 | The Unit 1.1 beginner audit: `/beginner-audit` (#217) and modules 01–10 rewritten so everything a task, quiz or card needs is in prose or a table (#224–#245); the console refuses `mv f nope/` (#229). A MINOR by the milestone. No migrations |
| 0.10.0 | 2026-10-17 | Fixes from playing Unit 1.1: modules 04–07 say plainly what tasks and quizzes need (#206, #210, #214, #216); the console's `N of M done` line (#208) and `stat -c` (#206); Okafor is he (#207). Planned as 0.9.1, a MINOR because it carries features. No migrations |
| 0.9.0 | 2026-10-17 | Unit 1.4 Networking complete (10 modules, *Relays Restored*): the console's network, DNS, curl, ufw and `ssh HOST 'CMD'` (#164–#166); the mystery's 1.4 clue (#176); Unit 1.1 says what the shell is (#196); the `lacks` check (#200); the screen at 85% (#188). No migrations |
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

### 2026-10-29 (later): IaC status, and #320's Bitwarden recovery copies

- **Explained for Sean:** where the *Infrastructure as code* milestone stands, and why it's
  worth doing. Nothing IaC-proper has started in either repo; the groundwork (plan, backups,
  multi-arch image, secrets decisions) is done, and the path is #320 → BB #530 → #322 → #323.
- **#343 (#320): every `.env` has a Bitwarden copy.** BB's `bw-env.sh`/`bw-seed.sh` turned out
  not to exist anywhere (gitignored on a Mac that no longer had them), so they were rewritten
  from the behaviour BB's Secrets note records and kept once in the private vault repo, which
  each clone symlinks. Tested against a fake `bw` (a JSON file as the vault, argv logged), then
  Sean seeded both items: local 13 keys round-tripped (`MATCH`), prod 13 keys piped from the
  droplet over SSH, matching its 13. RUNBOOK §3 has seed, restore and the edit order.
  `bw` on the VM is `@bitwarden/cli@2026.10.0` from npm.
- Gotchas:
  - ⚠️ **`bw status` can say `locked` for a login that has expired.** It reads local files only.
    The Mac's July login failed `bw unlock` with `invalid_grant`, leaving `BW_SESSION` empty;
    the script's unlocked check stopped it. Fix: `bw logout && bw login`.
  - `bw login`'s closing hint prints the session key. One reached the transcript; `bw lock` and
    a fresh unlock made it worthless.
  - Every PR-body edit re-runs *Acceptance criteria*, and runs against an in-between body stay
    red in the PR's list after a later one passes. Re-run them once the body is final. The
    check reads only `Verified by hand: #N "<exact title>" — why` lines, not a checklist.
- **BB notes** are on BB #530: the shared scripts, the VM symlinks BB still needs, the expired
  Mac login.
- **Unreleased on `main`:** as before (#336, #338, #337, #341, #334, #339), plus #343 (docs).
- **Next:** a release on Sean's word (v0.14.0), which proves #321. #322 waits on BB #530; #323 on
  #322. Still on the droplet: the apt updates and the 26.04 upgrade.

### 2026-10-29: two `/cycle` rounds, the open questions answered, droplet checks done

- **`/cycle`, queue #319 → #329 (auto) → #321 (stop).** Merged:
  - #334 (#319): the real curriculum is parsed once per test process. On one worker, 235 of 249 s
    were 804 parses of `content/`, 298 of them the lifespan of each `TestClient`. Now
    `tests.conftest.real_catalog()` (cached), and `app.main.load_catalog` is rebound to it in
    tests only. CI's "Run tests" went **196 s → 26 s**, `./test.sh` about 45 s → 8 s. A test
    keeps every other test off bare `load_catalog()`.
  - #336 (#329): the console's timers match systemd 255. `OnCalendar=` takes `START/STEP`
    (`*:00/15`) and refuses `*/N` and a step that can't repeat (`*:45/15`), in the schema and
    the console both. `Type=oneshot` is `activating (start)` while it runs, `start` waits for it
    on the station clock (`--no-block` doesn't), then `inactive (dead)` `status=0/SUCCESS`, or a
    failed start with systemd's `Job for … failed`. `exits: 0` is a clean exit. `TriggeredBy: ●`
    for an active timer, and `Triggers: ●` always.
  - #337 (#321, `Part of`): release images for `linux/amd64,linux/arm64` (QEMU), a Grype scan
    leg per platform with `GRYPE_PLATFORM` (checked locally that grype honours it, and that
    scan-action passes its env through). Merged on Sean's word.
- **Second round:** nothing was runnable unattended, so Sean picked #335's criteria. Filed #335
  from #329's comment; criteria written from `sysref` and v255's `show_journal_by_unit`:
  `status` shows the unit's lines **from this boot, from when it last left inactive or failed**,
  not by invocation, and none while in auto-restart. #338 merged.
- **Open questions answered with Sean** (asked with a recommendation each):
  - #260: keep `gotcha-auditor`, delete `sweeper` and `test-first` (#339, a standing decision).
  - #320: `bw` runs on the VM for local (npm `@bitwarden/cli`, as the VM is arm64), the Mac for
    prod; Sean does the vault writes. Recorded on #320 and BB #530.
  - BB #530 / #322: a throwaway pinned `git clone --depth 1` on the Mac for each check-mode run.
  - Module 03's unpaid `o2-backup` promise dropped (#340, #341). Played with Playwright as
    `verify-bot` after marking the 12 modules before it complete; deleted afterwards.
  - Module 05's length stays. `sysref` is removed.
- **Droplet, checked by Sean from the Mac:** `backup_db.sh` is `755 deploy:deploy`, every dump
  `-rw-------`, nightly dumps ran 2026-10-28 and 10-29 at 07:30 UTC (5290–5291 bytes), the
  timer is scheduled, the service `inactive`. `docker-compose.yml.v0.11.0` and
  `backups/pre-db-change.sql.gz` are deleted. The v0.13.0 follow-up is closed.
- Gotchas:
  - ⚠️ **The dev container can't write the repo**, so `ruff --fix` fails with `E902`. Apply
    `ruff check --diff` with `git apply -p0` instead.
  - **A container restart keeps the host's boot ID**: `sysref` can't show "previous boot"
    behaviour. That part of #335 came from systemd's source.
  - Real `systemctl status` of an unloaded (garbage-collected) unit drops `since` and
    `Duration:` but still shows the journal lines. The console keeps every unit loaded.
  - The gotcha-auditor earned its keep: it caught #336's JS parser accepting steps the schema
    refused, and a gap in #334's guard test.
  - A PR that falls `BEHIND` after a neighbour merges: `gh pr update-branch`, wait for CI, merge.
- **Left for Sean:**
  - Next release: check `docker buildx imagetools inspect` lists both platforms, pull the tag on
    the VM and see `/healthz`, both scan legs green, and note `build-push`'s new time (#321
    stays open until then).
  - #320's seeding (vault writes) once the scripts exist. Still: 8 apt updates and the 26.04
    upgrade on the droplet.
- **Unreleased on `main`:** #336, #338 (console code, so the next release is a MINOR: v0.14.0),
  #337 (release workflow), #341 (content), #334 and #339 (tests, docs).
- **Next:** #320 (scripts + RUNBOOK; Sean seeds), then cut a release when Sean says, which also
  proves #321. #322 waits on BB #530; #323 on #322.

### 2026-10-28: Unit 1.5 finished (#309, #310), and v0.13.0 shipped

- **`/cycle`, queue #309 → #310.** Both are content, so both were tagged stop: built to green
  PRs, then merged when Sean said so.
  - #330 (#309), module 05 *Timers*: reading a cron line (cron is new here, since Unit 1.5 needs
    only Unit 1.1), a `.timer` plus a `Type=oneshot` `.service`, `OnCalendar=` next to cron,
    `Persistent=true`, enabling `NAME.timer` in full, `list-timers`. The console task moves the
    weekly filter report from `/etc/cron.d` to a timer.
  - #331 (#310), module 06 *The journal*, **the mystery's reveal**. The 02:30–02:45 window on
    2026-10-08 (the previous boot) shows `CRON[5120]` starting `scrubber-flush`, `reply: FLUSH`
    and `Stopping scrubberd` two seconds later. The learner files the window and the cron file in
    `~/evidence` and restarts `scrubberd`, and Mission opens an inquiry into the depot.
    `docs/story.md`'s 1.5 row is written. Who sent FLUSH stays for Unit 4.5.
- **Real systemd corrected the drafts** (checked in `sysref`, systemd 255.4 as PID 1):
  - `*-*-* *:*/15:00` is refused (the real step form is `*:00/15`). The console accepts it, so
    the lesson teaches no step forms.
  - `ExecStart=` has no shell: `>/dev/null 2>&1` arrives as arguments. A minutely timer fires
    up to a minute late (`AccuracySec=1min`). `User=nobody` logs a "not safe" warning.
  - A user outside `adm` gets `-- No entries --` for a service once they have journal lines of
    their own. The console models a user with none (`No journal files were opened…`).
  - A cron job that exits at once (`logger`) isn't filed under `cron.service`: it has no
    `_SYSTEMD_UNIT`. Module 06 reads a window across all units for that reason.
- **Filed #329:** the console's timers versus systemd: `*/N` steps, no `Type=oneshot`, no
  `TriggeredBy:`, `Triggers:` glyph, and no log lines in `status` for an inactive unit.
- **v0.13.0 released and deployed** on Sean's go. #332 cut the CHANGELOG and added a missing
  line for the Dependabot bumps. Run `40713662755`, commit `51c5f83`, no migrations.
  `backup ok: … pre-deploy-20261028-152437.sql.gz (5290 bytes)`, and `/healthz` reports 0.13.0,
  with Budget Buddy still `ok`. It was the first deploy to install `backup_db.sh` for the
  nightly timer, replacing the hand-installed copy from before #326.
- Gotchas:
  - Building two module branches in parallel worked this time: after the first merged, each
    shared file was rebuilt as `main`'s plus the branch's own section. Each diff against `main`
    then matched the branch's additions line for line.
  - A module's test that indexes `unit_modules(...)[n]` breaks on a branch built without the
    module before it. Find the module by slug.
  - The console's `sudo` remembers the password for 15 simulated minutes, so a solution replayed
    after another `sudo` sends `meridian` as a command. Harmless in CI, which starts fresh.
- **Left for Sean:**
  - From the Mac: check that `/opt/orbit-ops/backup_db.sh` is `755 deploy`, that the new
    pre-deploy dump is `-rw-------`, and that `orbit-ops-backup.timer` is still scheduled. Then
    delete `docker-compose.yml.v0.11.0` and `backups/pre-db-change.sql.gz`. This release is healthy.
  - Unit 1.4 module 10 has `scrubber-flush` still running at 09:00, while Unit 1.5's console
    rebooted at 08:00. Left alone.
  - Module 03's `o2-backup` promise ("we'll put it right") is never paid off: drop the line, or
    fix it in a later unit.
  - Module 05 is about 1,200 words against the 900 guide.
  - `sysref` can go (`docker rm -f sysref`), unless #329 wants it for comparisons.
  - Still carried: the BB #530 Mac-clone decision, #320's `bw` location, #260.
- **Next:** #319 (cache the real curriculum in tests, auto), then #329 (console timers, auto).
  Sean approved that queue. After them, #321.
