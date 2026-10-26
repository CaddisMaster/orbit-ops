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

## Release ledger

| Version | Date | Highlights |
|---|---|---|
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

### 2026-10-26: Dependabot cleared, #258, and the console's systemd and journal (#303, #304)

- **Dependabot:** #297 (actions) merged. #298 (pip, 12 updates), and #299 after it, closed
  themselves when asked to `@dependabot rebase` once #297 put them behind `main`, so the 12
  were re-applied by hand as #300 (dev image rebuilt, suite green). The 13th, jiter, came
  as #301 and merged. fastapi went 0.143 → 0.161. #253 is gone with them.
- **#302 (#258):** non-negotiable #1 now says what a second account needs (database-backed
  limiters, a server-checkable challenge verdict). It matters more since `/admin` can create
  accounts (#282).
- **Milestone v0.13.0 — systemd** (13) filed: console issues #303 and #304, then module
  issues #305–#310. All console tasks, no labs: a Mac has no systemd. Sean approved the
  breakdown unchanged.
- **#311 (#303):** `systemctl`, unit files and timers in `shell/systemd.js` (part 13), with
  `services:` in the schema and the `active`/`inactive`/`enabled`/`disabled` checks.
- **#312 (#304):** `journalctl` and `journal:`, systemd's own log lines at journald's
  priorities, boots (the console boots at 08:00, so the outage night is `-b -1`), the
  non-adm refusal, and `systemctl status`'s log tail.
- Both were compared line by line with systemd 255.4 booted as PID 1 in a privileged
  `ubuntu:24.04` container (`docs/content-authoring.md` has the recipe). The only exception is
  the `-- Boot ID --` line: containers share the host's boot, so it's taken from systemd's
  source.
- Gotchas:
  - ⚠️ **`@dependabot rebase` on a group PR can close it** ("updatable in another way")
    instead of rebasing. Merge one group PR, wait for Dependabot to re-cut the rest, and
    don't ask it to rebase.
  - ⚠️ **Branch protection wants PRs up to date with `main`**, so merging one PR blocks
    the next until it's rebased.
  - ⚠️ **The console has no `printf`.** A `printf '…' > f` in a test leaves an empty file. Write
    files in tests with a heredoc through `sh.run`.
  - ⚠️ **A plain `ubuntu:24.04` container has no systemd as PID 1**, and without `polkitd` a
    non-root `systemctl` says `Failed to connect to bus`. Install both to compare outputs.
- **Left for Sean:** the same items as 2026-10-25 (confirm the production reset, the two
  leftover files on the droplet, the `281-admin-panel` branch, #260). The `sysref` systemd
  container on the VM can go (`docker rm -f sysref`) once Unit 1.5's Try it runs are done.
- **Next:** #305, Unit 1.5 module 01 "What a service is", then #306–#310 in order. The reveal
  is #310. Nothing has been released since v0.12.1: the systemd console work is on `main`,
  unreleased.

### 2026-10-25: `/cycle`, the admin panel, and v0.12.0 and v0.12.1 shipped

- **`/cycle`** (a user-level skill in `personal-vault`, shared with Budget Buddy): Sean approves
  a queue of issues once, Claude merges the auto-tagged ones on green and leaves stop-tagged
  ones (auth, migrations, visual, AI spend, content) as open PRs. Two rounds ran this session.
  Voice dictation was looked at first and dropped: Claude Code's `/voice` needs a local mic,
  and the VM has none.
- **v0.12.0, the admin panel** (milestone filed this session, #280–#285, PRs #286–#291):
  - #286 (#280): migration `0010`, `users.is_admin`. Verified by hand on a scratch database
    (a user made at 0009 upgrades to false; downgrade drops only the column).
  - #287 (#281): `/admin`, `require_admin` (404), `confirm_password`, the full progress reset
    (six tables; `users` and `ai_requests` stay), `create_user.py --admin`.
  - #288 (#282): create accounts, `PASSWORD_MIN_LENGTH` shared with the script.
  - #289 (#285): `/admin/ai` (from `app.spend`, so it can't disagree with the gate) and
    `/admin/system`. `path_separator = os` in `alembic.ini` silences Alembic's warning.
  - #290 (#283): a page per account (new password, log out everywhere, delete, progress JSON);
    acting on yourself keeps the current session.
  - #291 (#284): reset one module or unit (XP refs matched with `split_part`, card reviews on
    part 2), and `/admin/preview/<slug>`, read-only, no answers. All 38 modules preview.
  - Shipped as v0.12.0 (#292, run `40223396007`): `backup ok (8629 bytes)`, `running version
    0.12.0`. Sean promoted his account from the Mac and confirmed `/admin` works.
- **v0.12.1** (#293, #294, #295): the screen's text no longer grows with the window. Sean
  picked from screenshots; checked at three sizes in Playwright, the console answering `pwd`.
  Release run `40226594551`: `backup ok (5291 bytes)`, `running version 0.12.1`. The dump was
  smaller than v0.12.0's 8629 bytes, which fits Sean having reset his progress from `/admin`.
- Gotchas:
  - ⚠️ **`ci.yml` runs only on PRs into `main`.** A PR stacked on another branch shows no
    checks at all. Build each issue off `main` instead, and merge `main` in after its
    neighbour lands.
  - ⚠️ **The permission classifier refused a force-push plus a remote branch delete**, and
    then `gh release create` ("Create Public Surface") until Sean said "publish" in so many
    words. Merging `main` into the branch (a normal push) worked in place of the force-push.
  - ⚠️ **"Keep both sides" on add/add conflicts can drop a shared line**: a function lost its
    closing `)`. Where a branch's change sits inside code `main` reworked, take `main`'s file
    and re-apply the branch's additions instead.
  - ⚠️ A literal apostrophe in a Jinja template isn't escaped (only variables are), so a test
    looks for `'`, not `&#39;`.
- **Left for Sean:**
  - Confirm the reset of his production progress took (the smaller dump suggests it did), and replay.
  - From the Mac: `rm docker-compose.yml.v0.11.0 backups/pre-db-change.sql.gz` in
    `/opt/orbit-ops`, and delete the leftover `281-admin-panel` branch on GitHub.
  - #260 still waits on his decision.
- **Next:** #258 (a docs note), Dependabot's #253 in its own release, then Unit 1.5,
  *systemd & services*, as a **v0.13.0** milestone (a console issue for `systemctl`, unit files
  and `journalctl`, then ~6 modules, the mystery's reveal last).

### 2026-10-24: two splits, #266 on the droplet, and v0.11.1 shipped

- **Merged on Sean's word**, one issue and one PR each:
  - #272 (#255): `shell.js` (6,275 lines) is 12 classic scripts under `app/static/js/shell/`
    sharing a namespace `S`, plus `shell.js` as the public face, loaded last. ES modules were
    ruled out because CI's Node might not `require()` them. A generator (acorn, in the
    scratchpad) moved every chunk unchanged and computed the imports, and a line diff showed
    only the old `COMMANDS` literal's 3 framing lines gone. `module.html` loops over the parts,
    and a test holds the loop's order equal to `PARTS`. Checked in Playwright with no CSP errors.
  - #273 (#257): `schema.py` (1,136 lines) is `app/content/schema/`, with `terminal/` holding
    one file per spec family. Generated the same way. `addresses.py` and `Message` in `comms.py`
    exist to keep the imports one-way. `__init__` re-exports all 95 public names.
  - #276 (#256): the Pyodide version lives only in `scripts/fetch_pyodide.py`, and the app
    imports it. CI's image job checks that `/opt/pyodide/pyodide.mjs` carries the served version.
  - #277 (#248): `/beginner-audit` titles scenarios as plain sentences, with `# covers N`
    comments. A fresh audit of Unit 1.2 module 01 passed `check_criteria` as filed.
  - #274: RUNBOOK §5 now matches the real run (row counts, a private dump, the compose file
    fetched at a commit and its checksum checked).
- **#266 was applied on the droplet by Sean from the Mac** (RUNBOOK §5): Postgres 16.14 →
  16.15 with `no-new-privileges`, and both apps stayed healthy. The rows `8|19|7` were the same
  before and after, which also confirms migration `0007` on production. Closed with the results
  in a comment.
- **Shipped v0.11.1** on Sean's go:
  - the CHANGELOG cut was #275, with #249 moved under Fixed to match a PATCH;
  - release run `40144135611`, the first real run of SBOM/provenance, the locked-down smoke
    test and the `scan` job, all green;
  - the database guard accepted the compose file, `backup ok (8096 bytes)`, `running version
    0.11.1`;
  - all 12 `shell/*.js` files are served on production, and Budget Buddy is 200.
- Gotchas:
  - ⚠️ **Write overwrites an existing file without warning.** #277 created
    `tests/test_beginner_audit.py`, which already held #217's four tests, and dropped them.
    #278 restored them. Its first body said "a PR that closes #217", which linked #217, so the
    criteria check failed until the wording changed. That's the gotcha in `docs/gotchas.md`,
    still live.
  - ⚠️ The dev `web` container can't write to the bind mount, so `ruff --fix` in it fails. Run
    the pinned ruff from a scratch venv on the host.
  - ⚠️ Pasting a block that ends with a heading line runs the heading as a command on the
    droplet. Harmless here (`Then: command not found`), but keep paste blocks pure commands.
- **Left for Sean:**
  - Open module 08 on learn.seandesmet.com: run a console command (the split shell's first
    production load) and the bonus Python challenge (#264's check after the release).
  - From the Mac: `docker inspect orbit-ops-web-1` (read-only, `[ALL]`, no-new-privileges),
    then delete `docker-compose.yml.v0.11.0` and `backups/pre-db-change.sql.gz` from
    `/opt/orbit-ops`.
  - Decide #260 (Claude's view: delete `sweeper` and `test-first`; keep `gotcha-auditor` only
    as a required pre-PR step).
  - Unit 1.2 module 01's audit (8 findings, the worst being nano's exit question, recognising
    vim, `NAME(N)` → `man N NAME`, and Git assumed in Q3/Q4) is in this session's transcript,
    not filed. Decide whether Unit 1.2 gets the Unit 1.1 audit treatment before Unit 1.5.
- **Next:**
  1. #258 (a short docs note), then Dependabot's #253 in its own release.
  2. Unit 1.5, *systemd & services*: a v0.12.0 milestone, a console issue (`systemctl`,
     unit files, `journalctl -u/--since/--until` in a new `shell/systemd.js` and
     `schema/terminal/services.py`), then ~6 module issues, with the mystery's reveal last
     (`docs/story.md`).
