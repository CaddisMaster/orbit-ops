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

### 2026-10-27 (later): secrets, CI/CD and infrastructure as code; nightly backups live

- **Explained for Sean, no code:** how `.env`, GitHub secrets and gitignored files work across
  the VM, the droplet and GitHub; how CI and `release.yml` deploy; and what a corporate setup
  has that this one doesn't. He chose to pursue **infrastructure as code** only, at **no extra
  money**: no throwaway droplets, LXD containers on the VM instead, Terraform read-only.
- **Filed:** #320 (`.env` values into Bitwarden, as BB does) and milestone *Infrastructure as
  code* with #321 (multi-arch image: the VM is arm64, releases are amd64-only), #322 (Ansible
  app role, blocked by BB #530), #323 (LXD staging), #324, #326. A handoff note for BB's session
  is in the vault (`Budget Buddy/reference/IaC handoff.md`); BB filed #529–#535 from it and
  pushed back on six points, now folded into #322: roles never write compose or `.env`; each
  app declares its own `authorized_keys` line; the Mac has no clone (open decision in BB #530).
- **BB found that Orbit Ops's database had no real backup:** dumps only on deploy, never off the
  droplet, and RUNBOOK §6 claimed otherwise. Sean chose option B.
  - #325 (#324): `infra/systemd/orbit-ops-backup.{service,timer}`, nightly at 03:30 New York
    time, `Persistent=true`, keeps 14 and prunes only after a good dump. `release.yml` now
    installs `backup_db.sh` in `/opt/orbit-ops` (hash-checked) so the timer can't drift.
    Checked under real systemd 255 and with a restore into a scratch database.
  - **Installed on the droplet by Sean from the Mac:** first run `backup ok …
    nightly-20261027-201154.sql.gz (5292 bytes)`, next run 2026-10-28 07:30 UTC.
  - #327 (#326): `umask 077` in `backup_db.sh`. The pre-deploy dumps were `-rw-rw-r--`, though
    `backups/` is `drwx------`, so nothing was reachable. Sean `chmod 600`'d the 16 dumps.
- Gotchas:
  - ⚠️ **On this VM, `lxc` was a stub that installed the LXD snap** when Claude ran `lxc list`
    as a check. LXD 5.21 is installed and **not initialised**: `lxd init` before #322/#323.
  - Firing a oneshot unit in a test loop hits systemd's start limit (5 in 10 s, `start-limit-hit`).
    It isn't a bug in the unit; `systemctl reset-failed` and plant files instead.
  - `ls | tail` hid `nightly-*` behind `pre-deploy-*` (name order) in RUNBOOK §6's step 4.
    Fixed in the wrap: it lists `nightly-*` by name.
- **Left for Sean:** the Mac-clone decision (BB #530); a reserved IP before the 26.04 cutover
  (BB #533); no alert yet when a nightly dump fails; 8 apt updates pending on the droplet. The
  carried items from the earlier session today stand.
- **Next:** #320 (Bitwarden), #321 (multi-arch). #322 waits on BB #530. The curriculum's #309
  and #310 are still open for v0.13.0; nothing released since v0.12.1.

### 2026-10-27: Unit 1.5 modules 01–04 (#305–#308)

- **#314 (#305), module 01 *What a service is*:** daemons, systemd as PID 1, `systemctl
  status` line by line, `list-units` with `--all`/`--failed`, inactive versus failed. Unit 1.5
  is no longer "Coming soon". New test file `tests/test_systemd_unit.py` for the unit.
- **`/cycle`, queue #306–#308.** All content, so all stop-tagged: built to green PRs and left
  open. Sean then asked for them merged, in order:
  - #315 (#306), module 02 *Starting, stopping and enabling*: active versus enabled,
    `reload`/`restart`, `enable` as a `.wants/` link, `--now`, sudo.
  - #316 (#307), module 03 *Reading unit files*: `systemctl cat`, the three sections, no
    `User=` means root, `After`/`Wants`/`Requires`, `/etc` beats `/usr/lib`. The `o2-backup`
    admin copy that runs as root is a new story beat, closed as "not sabotage".
  - #317 (#308), module 04 *Writing a service*: a unit of your own (`sudo nano` taught there,
    since Unit 1.2 isn't a prerequisite), `Restart=on-failure`, `RestartSec=`, `203/EXEC` and
    `217/USER`. Played in the browser with nano, not just `tee`.
- Every module had the content-reviewer, `/beginner-audit` and gotcha-auditor passes, a Try it
  run in the `sysref` container (systemd 255.4 as PID 1) as `cadet`, and a browser play as
  `verify-bot`.
- **Real systemd corrected the drafts** (now in the lessons):
  - `list-units --all` omits a disabled, never-started unit: it isn't loaded. The console
    loads every unit at boot, and module 01 says so. Matching it would be a console issue.
  - A new copy in `/etc` needs `daemon-reload` before `systemctl cat` shows it, and `status`
    doesn't warn about it (it warns only for an edited, loaded file).
  - `Requires=` without `After=` doesn't stop a unit starting when its requirement fails;
    with `After=` it does. Stopping the requirement stops it either way; a crash doesn't.
  - `enable` on a unit with no `[Install]` prints the "no installation config" note, exits 0,
    and `--now` still starts it. The start limit is 5 starts in 10 s, then `failed`.
- Gotchas:
  - ⚠️ **Git's merge mixes up two sections appended at the same place** when they share closing
    lines (`    },`, a figures test's last lines). The conflict hunks looked like "keep both"
    and dropped a test's tail and broke `NEEDS`. For parallel module branches, rebuild each
    shared file as `main`'s version plus the branch's own section, and diff against `main`.
  - ⚠️ **A CHANGELOG splice that searches for the next `- `** walks into the previous release
    when the entry is the last one under Unreleased. Insert after the entry's own indented lines.
  - The cleanup's `sudo` in `sysref` times out between commands: `echo meridian | sudo -S -v` first.
- **Left for Sean:**
  - Module 03's "not sabotage" line, and Okafor's promise there to put `o2-backup` right, which
    nothing pays off yet. Drop it, or have #309/#310 fix it.
  - The same carried items: confirm the production reset, the two leftover files on the droplet,
    the `281-admin-panel` branch, #260.
- **Next:** #309 (module 05, timers), then #310 (the journal and the mystery's reveal), which
  closes the milestone. Nothing released since v0.12.1: v0.13.0 is the console's systemd and
  journal plus modules 01–04 so far. `sysref` stays until #310's Try it is done.

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
