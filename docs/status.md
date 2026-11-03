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
  `droplet-infra` owns the host layer, `backup-export` and the Terraform for the droplet only
  (split out of Budget Buddy, BB #576). DNS isn't in Terraform: all four records, `learn`'s
  included, stay by hand at Squarespace. Orbit Ops owns only its app role (#322), pinning
  `droplet-infra` by SHA (#383). Roles never write `.env` or `docker-compose.yml` (`release.yml` owns those),
  and never remove an Nginx site they didn't create. Tested in LXD containers on the VM; production
  only in check mode, from the Mac, until Sean decides otherwise.
- **Orbit Ops dumps its own database nightly; BB ships it off the droplet** (option B, 2026-10-27).
  `orbit-ops-backup.timer` (#324) runs the deploy's own `backup_db.sh`, which each release
  installs in `/opt/orbit-ops`. Every dump there is `600` (#326). The off-box copy is the VM's
  pull of the newest dump (BB #535, RUNBOOK §6), which runs only while the VM is on.
- **Agents earn their place** (#260, 2026-10-29). `sweeper` and `test-first` were deleted from
  `.claude/agents/`: ported from Budget Buddy at bootstrap, never used here, and each was a file
  to keep in step with BB's. `gotcha-auditor` stays and runs on every branch diff before its PR
  (as `/cycle` does). It earned that on 2026-10-29 by catching #329's JS calendar parser
  accepting steps the schema refused. BB's copies are unaffected.

- **Every `.env` has a recovery copy in Bitwarden** (#320, 2026-10-29): `orbit-ops-env-local`
  and `orbit-ops-env-prod`, every key a field. The droplet has no `bw` and its `.env` stays a
  plain file; edit it first, then the item. The helpers are shared with Budget Buddy, kept once
  in the private vault repo and symlinked in (RUNBOOK §3).

- **A deploy never names an existing `db`** (#384, 2026-11-03). `up -d` compares more than the
  config hash, so a Compose upgrade alone can recreate it (BB #580). `install_compose.sh`'s guard now
  says only whether `db`'s definition changed. Compose upgrades stay automatic: deploys don't depend
  on them, and a bare `up -d` by hand is the RUNBOOK's warning.

## Release ledger

| Version | Date | Highlights |
|---|---|---|
| 0.13.3 | 2026-11-03 | Dependency updates, including `anthropic` 2.3 on API version `2026-10-21` (#364, #372), and a deploy that never names an existing `db` (#384). The first release rehearsed on real rows (#379). A PATCH. No migrations |
| 0.13.2 | 2026-10-30 | Security: the image moves to Python 3.14.10 for CVE-2026-115557 (CRITICAL), which the image scan found in 3.14.8 and which blocked every PR (#351). A PATCH. No migrations |
| 0.13.1 | 2026-10-29 | Fidelity fixes and the first multi-arch image: the console's timers and `systemctl status` match systemd 255 (#336, #338), module 03 drops an unkept promise (#341), and the release image is built for amd64 and arm64, each scanned (#337, #321). A PATCH. No migrations |
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

### 2026-11-03: `droplet-infra`, a release that leaves `db` alone, v0.13.3 on a real dump

- **#383 (#385): the host layer comes from `droplet-infra`,** pinned at `d9805e7`. `droplet_host` is
  byte-identical to the old pin, and `host.yml` now also runs `droplet_export`. One `infra/test.sh`
  passed, and check mode from the Mac at `5b1610c` said `ok=13 changed=0 failed=0 skipped=1`. BB's #577
  can delete its copies. A Claude session on the Mac ran that check from a handoff file, at Sean's
  request, and he pasted the output back. It's a route for read-only Mac steps, not a standing one.
- **#384 (#386): no deploy names an existing `db`.** From BB #580, where a Compose upgrade alone
  recreated BB's `db`. The swap is `--no-deps web`, and `--wait db` runs only with no `db` container.
  Checked on real Compose 5.4.0 with a changed definition standing in for the upgrade.
- **v0.13.3 shipped** (#387, run `41654987267`, commit `61ade0f`), approved by Sean: `backup ok …
  (5290 bytes)`, no migrations, and the log's only recreate is `web`. `learn` reports `0.13.3` and
  BB's `/healthz` is OK. `free -m` on the droplet wasn't checked.
- **#379: a pulled dump restores.** `stage.sh` built 0.13.2, restored `orbit-ops_2026-11-03.sql.gz`
  and deployed 0.13.3 on it: `PASS`, every table's count kept, `db` not recreated. That was also the
  first run of #384's steps and the new pin in staging. The container is deleted. Production's owner
  is `orbit`, which settles #323's question about other owners. Still arm64, with no migration that
  does something.
- **Sean's call, left to my judgement: Compose upgrades stay automatic** for Orbit Ops. BB's question
  is still his, since the plugin is shared.
- Gotchas:
  - **I exported `COMPOSE_PROJECT_NAME` for a scratch project, and `./test.sh` in the same command
    inherited it,** so it tried to start the dev stack under that name and failed on port 5435. The
    dev stack wasn't touched, and the strays are gone. Scope it to one command.
  - **`gh pr checks --watch` right after `gh pr create` exits 1** before the checks register. Look
    before reading it as a failure.
- **Unreleased on `main`:** nothing that reaches the image.
- **Next:**
  - #375: Sean's live hint and lab review, the first real call on `anthropic` 2.x.
  - Unit 2.1 can be planned any time.
  - #361 when its scan clears.

### 2026-11-02 (later): dumps leave the droplet, the docs catch up (#377, #380)

- **BB #535 and BB #533 closed the same day.** The VM now pulls the newest dump (RUNBOOK §6), and
  `learn`'s record is at Squarespace, by hand. #378 (#377) brings the RUNBOOK, this file and
  `CLAUDE.md` in line. No change reaches the image.
- **#381 (#380): `lxc launch` gets `</dev/null`.** From a Claude session stdin is an open socket,
  and `lxc launch` reads config from it. One `infra/test.sh` with the fix: `PASS` in 1m58s. The
  hang is BB's measurement, not reproduced here, and `infra/stage.sh` wasn't run.
- **Filed:** #379 (restore a pulled dump, which holds real rows, so it waits for Sean's go; do it in
  the next release's rehearsal) and personal-vault #2 (pulled files are `664` in `775`/`755`
  directories, against `600`/`700` on the droplet; Sean is the VM's only login user, so low risk).
- Gotcha: after a squash-merge, a PR that needs updating can read its **old** run as passing while
  it's `BLOCKED`, so `gh pr checks --watch` returns early. Wait for `mergeStateStatus` to say `CLEAN`.
- **Unreleased on `main`, reaching the image:** still only #372 and #364.
- **Next:**
  - The release, when Sean calls it, rehearsed with `infra/stage.sh` on a pulled dump, which also
    does #379. Then #375.
  - Unit 2.1 can be planned any time.
  - #361 when its scan clears.

### 2026-11-02: #322 closed from the Mac, the IaC milestone done, `anthropic` 2.x

- **#322 is closed.** Sean's check-mode run from the Mac, at `4960694`:
  `ok=13 changed=0 failed=0 skipped=1`. No differences, so nothing to fix in the role or record in
  the RUNBOOK. The skipped task is the systemd reload, which runs only after a unit changes. The
  *Infrastructure as code* milestone is closed; its off-box half is BB #535, still open.
- **The documented check failed on the Mac first.** `ansible-core` 2.21.5 needs Python 3.12 or
  newer and the Mac's default `python3` is older. #374 (#373) puts `brew install python@3.12` and
  `--no-deps` plus `pip check` in `infra/README.md`. Filed BB #567 for BB's identical block.
- **#372:** eight minor and patch bumps.
- **#364: `anthropic` 1.13 to 2.3, so requests now send API version `2026-10-21`.** No code changed:
  we send no sampling parameters, documents in assistant turns or citations in user turns, don't
  call the Admin API, and pass one credential. The key now goes as `Authorization: Bearer`, and
  nothing of ours reads `X-Api-Key`. The SDK's licence moves from MIT to Apache 2.0.
  - **Not exercised:** no test calls the real API and the VM has no key, so #375 is Sean's hint and
    lab review on production after the next release. `spend.run` turns an API error into "AI
    unavailable".
- **#361 (Python 3.15.0) stays open:** the image scan fails on a CRITICAL. A new minor gets its own
  look once a fixed image exists.
- **Sean moved to a Budget Buddy session to finish the IaC work** (BB #535, BB #533). This session
  stays open for its status update.
- **Both closed later that day, and #377 records what changed here.** Dumps now reach the VM
  (RUNBOOK §6), though no pulled dump has been restored. BB #533 ended up holding the droplet only,
  so `learn`'s record stays by hand at Squarespace; the RUNBOOK had sent it to DigitalOcean.
- Gotchas:
  - **Mac steps run in zsh:** `read -rp` fails there with `read: -p: no coprocess`.
  - A PR whose checks are still running reads `BLOCKED`. Wait rather than reaching for `--admin`.
- **Unreleased on `main`, reaching the image:** #372 and #364. A PATCH by the look of it.
- **Next:**
  - The release, when Sean calls it, rehearsed with `infra/stage.sh`, ideally on a real dump. Then #375.
  - Unit 2.1 can be planned any time.
  - #361 when its scan clears.
