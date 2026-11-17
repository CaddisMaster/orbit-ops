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

- **The server runs the Python that Pyodide runs** (#361, #392, 2026-11-05). CI checks challenge
  solutions on the server's Python and learners run them on Pyodide's, so the two move together, and
  a test holds them to it. Dependabot skips Python minor bumps and still proposes patches. #391 moves
  to 3.15 once Pyodide has a stable build; on 2026-11-05 it had only `315.0.0a2`.

- **A challenge runs through one file** (#396, 2026-11-05). `app/static/py/challenge_runner.py` is what the
  browser's worker fetches and what CI imports, so CI tests what the learner runs. A run behaves like a
  script: `__name__`, `sys.argv` and tracebacks as a real one's, exits reported with their code, and files
  and the working directory fresh each time. It stays standard library only.

- **A unit's release waits until the unit is finished** (Sean, 2026-11-06). A unit counts as complete
  when every module that exists is done, so a release with some modules written would award its badge
  early, for good. v0.14.0 waits for #409.
- **A clue a task finds goes in that task's beat, never in `complete`** (#422). `complete` plays when the
  quiz completes the module, and a challenge or a lab doesn't gate that. `challenge_done` follows the
  browser's verdict, as the challenge's XP does (#54).
- **A module's right answers don't all share a position** (#417). `test_content.py` enforces it with
  no exceptions since #418, whose migration `0011` moved the stored answers with the options.
- **No `# notes` on a Try it's command lines** (#429, Sean's option 3, 2026-11-17). A Mac's zsh passes
  them to the command. The 42 Try its written before carry a `setopt interactive_comments` line above
  their first block, and `test_content.py` freezes that list, so a new module's Try it has none.
- **Prerequisites follow what the labs use** (2026-11-17): `python-ops` requires Git (#441), and `docker`
  requires `python-ops` (#446), whose scripts its modules 07 and 10 containerise.
- **Docker labs run on any working `docker` CLI** (#446). Images are pinned by tag and multi-arch, and
  checks read only what every engine prints (`--format` output, labels), never IDs, digests, dates or
  sizes. Each module's lab and Try it are run for real on the VM's Docker Engine with throwaway names;
  Ubuntu's own `docker.io` was also tried once (#448). Docker Desktop and Git Bash aren't exercised.
- **A lab setup shown on the page mustn't give away a clue** (#448). The bay's fabricator images are
  built from base64-encoded build files, so their dates and authors come out of Docker, not the setup.

## Release ledger

| Version | Date | Highlights |
|---|---|---|
| 0.14.0 | 2026-11-16 | Unit 2.1 *Python for operations* complete (12 modules: 01–07 browser challenges, 08–12 labs, *Fabricator Scripted*) with the manifest thread's three clues; challenges run like scripts, with files and real exits (#396); a `challenge_done` beat (#422); `anthropic` 2.8 and other updates (#419, #434). No migrations |
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

### 2026-11-17: the quiz reorder, Unit 2.2 planned, Docker modules 01–05

- **Sean's decisions:** #429 option 3 (the note now, no `#` notes from here on), `python-ops` requires Git
  (#441), and for Unit 2.2: `docker` requires `python-ops`, a tags-vs-digests clue thread, any working
  `docker` CLI, and the 10-module list as planned. Every merge on his word ("merge #442 then #443 and
  start #429", "merge it and start #N", "merge it and wrap there").
- **#418 (#442, #443): the right answer moves in the 38 older modules.** 117 questions reordered (a choice
  question swaps its right option with one other; "All of them" stays last). Migration `0011` remaps
  `exercise_attempts.submitted` by a position table written into the revision, alone in its PR. A frozen
  fixture of the old options holds content, table and page together. The dev database is at `0011`.
- **#429 (#444)** and **#441 (#445):** above. The scanner for `#` notes matched the issue's count, 268
  lines in 42 modules, and real zsh 5.9 confirmed both the failure and the fix. The 2026-11-16 production
  dump showed no account had completed a module, so the new prerequisite locked nobody out.
- **Unit 2.2 planned:** milestone v0.15.0 (v0.14.0's closed), #446 set up the prerequisite and the clue
  plan (#457), and #447–#456 are the ten modules. **Modules 01–05 written and merged** (#458, #460–#463):
  *What a container is*, *Images, tags and digests* (clue 1: `stable`'s created label says 2026-09-30),
  *A container's life*, *Inside a running container*, *Ports and networks*. Each went through the
  content-reviewer and `/beginner-audit`, every fix in the same PR, its lab followed from scratch on the
  VM and played in the app as `verify-bot`.
- **What the reviews caught:** the setup showing module 10's clue (now base64), Git Bash rewriting
  `/paths` (`MSYS_NO_PATHCONV`, and #459 for module 01), a quiz answer that marked `always` wrong, a check
  that didn't test `--tail`, `docker run --env-file` keeping quotes where Compose strips them, a taken
  port leaving a `Created` container, and in each module the beginner gaps.
- **Not exercised:** Docker Desktop on a Mac or Windows, Git Bash, macOS's `base64 --decode`, amd64.
- Gotchas: a YAML plain value is cut at ` #`, so a lab prompt with `/ #` needs quotes (playing it caught
  it). "closes #N" mid-sentence in a PR body links the issue (hit again on #442). The VM's Docker uses the
  containerd image store: an image ID is the start of its digest there, and a local build has a
  RepoDigests entry, unlike the classic store. Ubuntu's `docker.io` has no buildx. Nested Docker in a
  container needs `-v /var/lib/docker` (overlay on overlay fails). Examples must be pasted from the run,
  never retyped: two hand-written values (a PID, a hostname) were caught and replaced.
- **Unreleased on `main`:** `0011` with the reorder, #444, #445, #457 and Docker modules 01–05. Since the
  hold (2026-11-06) keeps a half-written unit out of a release, all of it now waits for v0.15.0, unless
  Sean decides otherwise. Rehearse `0011` on a production dump in `infra/stage.sh` before that release.
- **Next:**
  - #452–#456, Docker modules 06–10 (#456 is the capstone with clue 2 and Claude's review), and #459.
  - #375: Sean's live hint and lab review on production.

### 2026-11-16: Unit 2.1 finished, v0.14.0 in production

- **Sean's decisions:** Dependabot's #431 and #434 merged ("merge them"), #408 then #409 on "merge it and
  start #409", module 11's depot patched (#437), and "merge it and cut v0.14.0". He approved `production`.
- **Dependabot:** #431 (`docker/login-action` 4.8) and #434 (14 updates, `anthropic` 2.8 among them). The
  classifier refused the first merge until Sean said so. With `main` required up to date, #434 was
  brought level with `gh pr update-branch`, not `@dependabot rebase`, which can close a group PR. The dev
  container was rebuilt and the suite run on the new packages.
- **#408 (#435): module 11, *Talking to an API*.** A lab against `depot.py`, a stdlib server the setup
  writes on `127.0.0.1:8765`: run 34's manifest, a 404, and `latest` after 10 s past a 2 s timeout, then
  the depot stopped. Found in `requests` 2.34.2: Python's own `ConnectionError` doesn't catch
  `requests.exceptions.ConnectionError`. `/beginner-audit` caught two traps that failed the lab while
  following the lesson: a `return` in `main()`'s loop skipped `latest`, and catching `ReadTimeout`, the
  traceback's name, failed the script check.
- **#409 (#436): module 12, *Capstone: retries and logging*,** with `ai_review` and a rubric. A stdlib
  `scanner.py` on `127.0.0.1:8766` answers C-323 busy, slow, read, cycling, so a correct rerun sees the
  same pattern. **Clue 3** is in `lab_done`: C-323 was consigned by `depot-sync`, run 33's others by
  `depot stores` (`docs/story.md`). The reviews caught "never retry a 4xx" against the SDK's 429, C-324
  never scanned, `basicConfig` placed before `--quiet` could be read, and the rubric repeating the checks.
- **#437 (#438):** module 11's depot catches Windows' `ConnectionAbortedError`, as 12's scanner does.
- **v0.14.0 released and deployed** (#439, run `43889147932`, commit `adf0a35`). `release-prep` said GO
  and found the CHANGELOG missing modules 11–12, #396's hint change and the dependency bumps. The log:
  `backup ok … pre-deploy-20261116-145203.sql.gz (5293 bytes)`, no migration, only `web` recreated,
  `Deployed and healthy`. Budget Buddy's `/healthz` 200. `free -m` not checked.
- **Not exercised:** nothing on a Mac or Windows. No live Claude review: the dev stack has no key.
- Gotchas: a lab box holds 10 checks at most, and a module 10–20 minutes (`test_content.py`). The story
  test wants a clue row's module named by its full title. In a Try it, `$!` isn't taught by Unit 1.1, which
  has `&` and `kill %1`. A background job ignores SIGINT, so `pkill -INT` of a server started with `&` in
  a script does nothing: start it with `docker exec -d` to test Ctrl-C. Three `style-src` CSP console
  errors appeared once in Chromium after module 11's first lab pass and never again in four runs.
- **Next:**
  - #375: Sean's live hint and lab review on production, now on `anthropic` 2.8 (the capstone's lab).
  - #418 (remap the 38 live modules' stored quiz answers), Sean's calls on #429 and on Git as a
    prerequisite (Windows learners are sent to Git Bash in 08–12), and planning the next unit.

### 2026-11-15: Unit 2.1 module 10, the first session on Fable 5.2

- **Sean's decisions:** spend Fable 5.2 on the curriculum, in the order #407, #408, #409, then #418 if
  time allows (from a handoff file written in a Budget Buddy session, read once and deleted), and
  "merge and wrap there" after module 10.
- **#407 (#433): module 10, *venv, pip and pinned dependencies*,** the unit's third lab. A venv,
  `requests` at an exact version, `pip freeze` into `requirements.txt`, the venv deleted and rebuilt
  from the file, and `where.py` run by the machine's own Python and by the venv's Python by its path.
  Try it and the lab were run in `ubuntu:24.04`, and it was played in Chromium as `verify-bot`.
- **The lab needs Python 3.10 or newer.** It pins `requests` 2.34.2, the newest on PyPI that day with no
  advisory. 2.32.5, the newest that runs on a Mac's own 3.9, has one (GHSA-gc5v-m9x4-r6x2), so step 1
  has the learner install a current Python. A comment at the top of the module says to move the pin
  when 2.34.2 gains an advisory. #408 and #409 use `requests` too and should keep the same pin.
- **What the reviews caught:** the content-reviewer, a wrong claim about older systems (on
  `ubuntu:22.04` a plain `pip install` goes to the user's own folder, and only `sudo` reaches the
  system) and `>=` never explained. `/beginner-audit`, that apt's `python3-requests` sits under its
  Python's `sys.prefix`, `/usr`, so "the path starts with `sys.prefix`" said `True` outside any venv:
  `where.py`'s third line now asks for both facts. The gotcha-auditor, a lesson at 1,084 words of
  prose against 640–700 in modules 08 and 09: trimmed to 889.
- **Not exercised:** nothing was run on a Mac or on Windows (step 1's Mac advice, `.venv/Scripts`).
- Gotchas: a Try it criterion is claimed by a `Verified by hand: #N "title" — why` line in the PR
  body. A test holds the lesson's `Jinja2==3.1.6` and `MarkupSafe==3.0.4` to `requirements.txt`, so a
  Dependabot bump of either fails until the lesson moves too.
- **Unreleased on `main`:** module 10, on top of 11-06's.
- **Next:**
  - #408, module 11 (*Talking to an API*), then #409, which lifts the release hold. Read modules 01–10
    first, and keep `requests==2.34.2`.
  - #418 after the unit. Sean's calls (#429, Git as a prerequisite), #375 after v0.14.0, and the two
    Dependabot PRs (#431, #432).
