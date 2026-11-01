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

### 2026-11-01: back to VS Code, CHOWN gone, #360, and #323's staging

- **Sean moved back to VS Code for all projects** (#365 / #366), two days after PyCharm. PyCharm is
  removed from the Mac and the VM. The Mac session found no separate Gateway install, so
  "Gateway" in older notes was PyCharm's own remote feature.
- **Droplet steps are Mac-only again, by Sean's decision.** The VM route came from Gateway's
  forwarded agent. The Budget Buddy session reports that Sean removed `mac-to-jupiter-vm` from
  root's `authorized_keys` on the droplet. That key stays on the VM, and is what the name on the
  VM's only `authorized_keys` line says it is. Checked here: `SSH_AUTH_SOCK` unset, and `ssh` to
  the droplet says `Permission denied (publickey)`.
- **#368 (#367): dev `web` adds no capabilities.** `CHOWN` was only for PyCharm's interpreter, and
  the hardening test now holds dev to none. A root one-off's `chown` is refused.
- **#369 (#360):** the `bw-*.sh` symlinks are out of the build context. Released images were never
  affected.
- **#370 (#323): `infra/stage.sh <version>` rehearses a release in LXD.** It builds `orbit-stage`
  with production's playbooks and deploys a tag with that tag's own scripts, in `release.yml`'s
  order. It fails if any table's row count changes, and `tests/test_infra.py` fails if its
  commands drift from `release.yml`. Run it while the `production` approval waits (RUNBOOK §5).
  - Checked: 0.13.1 from nothing, a restored dev dump (51 rows), then 0.13.2, with the same counts
    and `/healthz` over HTTPS through Nginx. The app connected as `orbit_app`, with `secure`
    cookies. Deleting a row mid-run made it fail, naming the table.
  - **Not yet exercised:** a real production dump, an owner not named `orbit`, and a migration that
    does something: arm64 images start at 0.13.1, and neither staged release has one.
- **VS Code on the VM:** Python and Pylance, plus an editor-only `.venv` on the system 3.12 in this
  repo, BB and MLIT. It can flag 3.14-only syntax. Nothing runs from it.
- **Budget Buddy #556 and seandesmet.com #42** are closed. #526 no longer needs `CHOWN`.
- Gotchas:
  - **The VM rebooted (16:32)** and lost the `DOCKER-USER` rules again. Re-added, and they'll go
    again next time.
  - **One `lxc launch` failed again**, the second in two days, and a re-run passed. I cut the error
    off with `tail -3`, so the cause is still unknown. Next time, keep the whole output.
  - Merging one PR leaves the next `BEHIND`: `gh pr update-branch`, then wait for its checks.
- **Unreleased on `main`:** nothing that reaches the image.
- **Next:**
  - Sean's check-mode run from the Mac (`infra/README.md`, "Checking production"), then close #322.
  - Dependabot: #363 looks routine; #364 (`anthropic` 2.x) and #361 (Python 3.15) need their own look.
  - Rehearse the next release with a real dump.
  - Unit 2.1 can be planned any time.

### 2026-10-31: #357 and #322, Orbit Ops's layer of the droplet as code

- **#358 (#357):** RUNBOOK and `release-prep` say droplet steps run from the VM or the Mac, after
  the 2026-10-30 reversal. The status line on the production check stays as it is: that's Sean's
  decision, not a claim about reachability.
- **#359 (part of #322): `infra/ansible/roles/orbit_ops_app`.** It covers `/opt/orbit-ops` and
  `backups/`, the `.env` check (never written), the deploy key (non-exclusive), the `learn`
  site and the backup units from `infra/systemd/`. Sean's calls:
  - The site file is **production's post-Certbot file byte for byte** (sha256 `8c758e47…`).
    The LXD test uses a self-signed certificate at the lineage's paths.
  - The site file and the deploy-key line were read from the droplet over SSH from the VM,
    read-only. Production's backup units match `infra/systemd/` exactly.
  - The production check stays **check mode, from the Mac**, in a throwaway pinned clone.
- **BB's host role is pinned at `4632f78`** (BB #549), not `5dad811`. A real run at `5dad811`
  would have swapped production's `docker.io` for `docker-ce`. `ansible-galaxy` can't install a
  role from a subdirectory, so `infra/fetch_host_role.sh` fetches the SHA into a gitignored
  `vendor/`. `app.yml` never runs the host role.
- **`infra/test.sh`** (about 2 min) runs BB's host role, then:
  - three refusals: no `.env`, `.env` mode 644, no certificate;
  - a full run, then a second run and a check-mode run, both `changed=0`;
  - HTTPS through Nginx to a backend on 5002, and the 80→443 redirect.
- **The `gotcha-auditor` found three gaps, all fixed in #359:**
  - ansible-core's dependencies are pinned too, installed `--no-deps`, then `pip check`;
  - Dependabot watches `/infra`;
  - the criteria are claimed (`Part of #322`).
- **Filed:** BB #553 (BB's ansible-core pin has the same gap), BB #554 and orbit-ops #360. Local
  prod builds copy the dangling `bw-*.sh` symlinks into `/app`; released images are
  unaffected.
- Gotchas:
  - **The VM rebooted (12:08)** and lost the `DOCKER-USER` rules for `lxdbr0`. They were re-added
    as documented.
  - One `lxc launch` failed after 5 minutes. A launch by hand took 3 s, and the re-run passed.
  - A handler with `changed_when: false` never notifies the next one. The `nginx -t` and the
    reload share a `listen` topic instead.
  - A `gh pr create --body` heredoc with a quoted `'EOF'` keeps `\"` literally.
- **Unreleased on `main`:** nothing that reaches the image (`infra/` is now in `.dockerignore`).
- **Next:**
  - Sean's check-mode run from the Mac (`infra/README.md`, "Checking production"), then close #322.
  - #323 (staging in LXD) can reuse `infra/test.sh`.
  - #360 is small.
  - Unit 2.1 can be planned any time.

### 2026-10-30 (later): PyCharm set up for all four repos, and v0.13.2 for a critical CVE

- **Sean moved from VS Code to PyCharm 2026.2** (a JetBrains remote backend on the VM), one
  window per repo. `.idea/` is ignored in all four: #348 here, BB #543, MLIT #120,
  seandesmet.com #40. The Claude Code JetBrains plugin is installed and connects with `/ide`.
- **Interpreters:** Docker Compose on `web`, listing both compose files (the override builds the
  dev target, which has pytest). A hand-written interpreter entry broke project opening, because
  2026.2 has no legacy remote-SDK format left. So the wizard made this repo's, and copies of its
  entry serve BB and MLIT.
- **#354 / #355:** to set up, PyCharm runs `chown -R 10001` on its helper volume as root in a
  one-off `web` container, and `cap_drop: [ALL]` (#264) refused it. The dev override now adds
  `CHOWN`. Only root gains it: `appuser`'s `CapEff` is 0 with or without. An extra PyCharm-only
  compose file didn't work, because PyCharm passes `docker compose` its configured files plus
  its own generated override, nothing else.
- **#349 / #350:** the dev database is published on `127.0.0.1:5435` for PyCharm's Database tool
  (BB's dev database is on 5432, MLIT's on 5434). Production's stays unpublished.
- **The image scan went red on every PR:** CVE-2026-115557 (CRITICAL) in Python 3.14.8.
  #351 / #352 moved the base to 3.14.10. **v0.13.2** was cut (#353) and deployed on Sean's
  approval: run `41069462114`, commit `717d9f5`, no migrations,
  `backup ok … pre-deploy-20261030-143449.sql.gz (5291 bytes)`, `/healthz` reports 0.13.2,
  and Budget Buddy returned 200. The empty v0.13.0 milestone is closed.
- **Cross-repo issues:**
  - BB #544: production runs Python 3.14.7, which has both critical CVEs, and BB's CI doesn't
    scan its image. **The most urgent item across the projects.**
  - MLIT #121: Werkzeug 3.1.8, PYSEC-2026-4312.
  - MLIT #122: pin the floating `python:3.14-slim` base.
- Gotchas:
  - PyCharm rewrites its settings on exit, so they can only be edited while it's closed, and
    closing it ends a Claude session running in its terminal. A detached script that waits for
    the backend to exit, then applies the edit, gets around both.
  - The plugin's `getDiagnostics` times out under Gateway, even for an open file. Feedback was
    sent; lint and tests still come from `./test.sh`.
  - `./test.sh` recreates `db` from the checked-out override. Run it on a branch without #350,
    and port 5435 closes until `docker compose up -d db` on `main`.
  - `gh release create --target` needs the full SHA.
  - Merging one PR puts the next behind `main`, so it needs `gh pr update-branch` and a green
    run before it can merge.
- **Unreleased on `main`:** nothing that reaches the image (#355 is dev-only).
- **#322 is unblocked.** BB #539 merged at 00:43 today, before this session, and BB #530's comment
  says #322 needn't wait for the one criterion left there (Sean's check-mode run). Pin
  `5dad811e2ffd37ec9e055847a25470102f2992c8`, role at `infra/ansible/roles/droplet_host/`. The
  variables, LXD's preseed, the `DOCKER-USER` rules and the duties both layers share are in that
  comment, and the LXD and Docker details are also in the shared changes log.
- **Next:** #322 here, from that comment. BB #544 in a Budget Buddy session. Unit 2.1 can be
  planned any time. Sean still has to open MLIT in PyCharm once and enter the BB and MLIT
  database passwords. Still on the droplet: apt updates and the 26.04 upgrade.
