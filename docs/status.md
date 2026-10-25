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

## Release ledger

| Version | Date | Highlights |
|---|---|---|
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

### 2026-10-23: container hardening (#263–#266)

- **The old architecture review file is gone.** All its findings were already filed as
  #255–#260. Only "share tooling with Budget Buddy" has no issue of its own (#260 covers part).
- **Filed from the container-hardening handoff** (checked against the code first) and merged
  on Sean's word, one PR each:
  - #267 (#263): root owns `/app`. The app user has no home or login shell, and `psql` is
    gone. CI runs the built image and fails if `appuser` can write anything under `/app` or
    `/opt/pyodide` (it fails `main`'s old image with `appuser can write /app/scripts`).
  - #268 (#264): `web` is read-only with a tmpfs `/tmp`, `cap_drop: [ALL]`,
    `no-new-privileges` and `pids_limit: 100`. The smoke run uses the same flags for both
    migrations and the app. `--forwarded-allow-ips "*"` stays, with a comment saying why.
    Checked on the production compose file locally: `docker inspect`, migrations through
    `compose run web`, and module 08's Python challenge passing in Playwright.
  - #269 (#265): Grype (`anchore/scan-action` v7.4.2, Grype v0.120.1) scans on every PR, and a
    read-only `scan` job scans the pushed digest before the deploy. Release builds get
    `sbom: true` and `provenance: mode=max`. **The gate's first catch:** CVE-2026-19445
    (CRITICAL) in Python 3.14.7, so the base image moved to 3.14.8.
  - #270 (part of #266): Postgres pinned as `16.15@sha256:9e2cf628…` in the compose file, CI
    and the smoke run, held equal by a test, with `no-new-privileges` on `db`. RUNBOOK §5 is
    rewritten as the procedure. It was rehearsed on a throwaway stack: the guard refused before,
    the dump was verified, the data was intact, `web` was never restarted and `/healthz` stayed
    200, and the guard passed after.
- **Two specs were corrected on contact with the code.** #264's last scenario became a local
  production-compose run (the droplet check is now "After the release"). #265 scans before
  deploy rather than before push, to keep the scanner away from `packages: write`.
- Gotchas:
  - ⚠️ **Docker's `--tmpfs` is `noexec`.** The backup-script tests run a stub `docker` from
    `tmp_path`, so the dev override needs `/tmp:exec`. Overriding a list takes compose's
    `!override` tag, which `yaml.safe_load` can't read. The repo tests have a loader for it.
  - ⚠️ **pytest-xdist outgrows `pids_limit: 100`** (threads count), so dev sets 1000.
  - ⚠️ **A new CVE can fail a PR that didn't touch the image.** Fix it in its own PR, and don't
    ignore it in `.grype.yaml` just to get a PR through.
  - ⚠️ **Nothing proposes Postgres bumps.** `dependabot.yml` has no `docker-compose` entry.
- **Not released.** v0.11.0 is still in production. The next release carries #263–#266 and is
  the first run of the `scan` job, the SBOM/provenance step and the locked-down smoke test.
- **Left for Sean, in this order:**
  1. From the Mac at a quiet time: RUNBOOK §5, "changing the db service", with `main`'s
     `docker-compose.yml`. Comment the two `postgres --version` lines and both `/healthz`
     results on #266, then close it. **Until then the release guard refuses every release.**
  2. Cut the release when he chooses. Afterwards: #264's "After the release" check
     (`docker inspect orbit-ops-web-1`, a Python challenge on learn.seandesmet.com) and the
     SBOM check in #269's body.
  3. Delete the untracked `orbit-ops-container-hardening-handoff.md` once #266 is closed.
     Budget Buddy has its own copy and hasn't started it. BB can copy these four PRs.
- **Next:** #255 (split `shell.js`) before Unit 1.5, as planned. The quick ones still fit
  anywhere: #256, #258, #248, plus #260's decision and Dependabot's #253.

### 2026-10-21: Unit 1.1 modules 06–10 audited, and v0.11.0 shipped

- **Merged on Sean's word**, one issue and one PR each, all in milestone v0.11.0:
  - #238 (#237), module 06:
    - `pgrep`/`pkill` match part of a name, so `pkill o2` also aims at the root-owned daemon;
    - you can signal only your own processes;
    - jobs (`sleep`, `&`, `%1`) are a table;
    - `pgrep`'s silence means the process is gone.
  - #240 (#239), module 07:
    - `>` creates or empties a file;
    - the `DIR:` heading the task's file shows;
    - `2>&1` goes before `|`, and its `&` isn't module 06's;
    - `ls` writes one name per line into a file.
  - #242 (#241), module 08:
    - grep and sed are tables on `/etc/passwd`;
    - an access-log line field by field, and `uniq -c`'s count first;
    - `cut -d' '`, and what awk's quotes keep from the shell;
    - a second log in the console (`/var/log/nginx/access.log`), so examples never touch the task's file.
  - #244 (#243), module 09:
    - the environment and child processes;
    - no spaces around `=`, the quote rules, and why `bash -c` takes single quotes;
    - the prepend line in pieces, with the `:$PATH` trap and the way back;
    - the false `test.sh` claim is gone.
  - #246 (#245), module 10:
    - every quiz answer and card was in a comment;
    - which commands need `sudo`, and the Dockerfile terms behind Q3;
    - Try it on `tree`, with somewhere to run it without Ubuntu.
- **Shipped v0.11.0** the same day, on Sean's go:
  - the CHANGELOG cut was #250;
  - release run `39612989269`: `backup ok (7099 bytes)`, no migrations, `running version 0.11.0`, then "Deployed and healthy";
  - `learn.seandesmet.com/healthz` reports `0.11.0`/`268916d`, and Budget Buddy's `/healthz` is 200.
- **The rhythm held for all five**: the audit, a second audit, the reviewer, Try it in `ubuntu:24.04`, playing as `verify-bot`, and `criterion` tests that fail on `main`.
  - Each second audit found 4 to 7 real gaps.
  - Try it on Ubuntu caught two wrong claims in module 10. `apt install` only asks `[Y/n]` when it adds other packages, and `apt update` doesn't end on `Reading package lists... Done`.
- Gotchas:
  - ⚠️ **The dev app doesn't reload on content edits** (#247). `--reload-dir content` has no `--reload-include`, so only `*.py` triggers it. `docker compose restart web` before any Playwright check, or it plays the old module (it did, once).
  - ⚠️ **CI didn't start for the last three pushes to `main`** (`815bb5d`, `8cfa0ef`, `268916d`): no runs at all. PR runs and the release workflow fired normally. v0.11.0 was published after checking that `main`'s tree equalled the CHANGELOG PR's tested head (`d7108c9`). Not investigated yet.
  - ⚠️ `/beginner-audit` often titles scenarios "… (1)", which `check_criteria.py` won't match (#248). Strip the numbers before filing.
  - ⚠️ A `lacks` check can't name a learner-created file, though both graders already handle one (#249). That's why modules 07 ("nothing else") and 08 ("three") are unenforced.
  - ⚠️ The audit's suggested examples weren't always true of the module's console: `grep nologin` has no `nologin` lines there, and on 24.04 `/usr/sbin/nginx` is `nginx`'s, not `nginx-core`'s. Run each suggestion before taking it.
  - ⚠️ Pygments splits `2>&1` into `2 > & 1` in rendered code, so `criterion` tests on Try it text must avoid the whole token.
  - ⚠️ `test_lessons_say_when_the_console_lacks_something` fires on a mere mention (`htop`, "a friendlier `top`").
- **Left for Sean:**
  - Unit 1.1's only Python challenge (module 08) assumes Unit 2.1's Python. It's now labelled a bonus, but it could move.
  - Module 10's Dockerfile section could move to *Python & Containers* once that's written.
  - Module 09's `.bashrc` check passes on a comment that mentions `/opt/nav/bin`.
  - Dependabot's #222 is still open.
  - Milestone v0.11.0 is closed, and no v0.12.0 milestone exists yet.
- **Next:**
  1. Unit 1.5, *systemd & services*, needs a milestone and its issues. See `docs/roadmap.md`.
  2. The three follow-ups: #247 (one line), #249 (schema plus two task checks), #248 (skill wording).
  3. Find out why push-to-`main` CI stopped firing.
- **Later the same day, on Sean's word:**
  - #252 (#247): the dev app reloads on content edits. `--reload-include` alone did nothing, because uvicorn 0.54 ignores it without `watchfiles`, so `watchfiles==1.3.0` is now a dev dependency.
  - #254 (#249): a `lacks` check may name a file the learner creates. Modules 07 and 08 now enforce "nothing else" and "three".
  - The `main` push CI fired normally for both, so the earlier gap looks like a one-off.
  - An outside architecture review produced #255–#260. The `shell.js` split (#255) goes before Unit 1.5.
  - #261 (#259): this file keeps three sessions, and the rest are in `status-archive.md`. The wrap now says to keep it that way. `architecture.md`'s module table is one line a row.
- **Next (supersedes the list above):**
  1. #255, split `shell.js` by area, **before** any Unit 1.5 work. #257 (schema package) follows just before Unit 1.5's spec classes.
  2. Then Unit 1.5, *systemd & services*: a milestone and its issues.
  3. Quick ones that fit anywhere: #256 (Pyodide version once), #258 (non-negotiable #1's single-user note), #248 (audit scenario titles).
  4. #260 waits on Sean's keep-or-drop decision for the unused agents. #222 (Dependabot) needs its own look.
