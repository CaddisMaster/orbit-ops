# Status archive

Sessions moved out of [`status.md`](status.md) once they were more than three sessions old
(#259). Moved unchanged, newest first. The standing decisions and the release ledger stay in
`status.md`, so read that first.

### 2026-10-30: v0.13.1 shipped, #321 proven, and a handoff to Budget Buddy

- **Nothing was ready to start** (#322 and #323 wait on BB #530, and #321 needed a release),
  so Sean called the release. `release-prep` said GO but questioned 0.14.0: VERSIONING.md gives a
  MINOR only for new surface, and #336/#338 are fidelity fixes under Changed. **Sean picked
  v0.13.1.** #344 cut the CHANGELOG and added the missing Fixed line for #341.
- **v0.13.1 deployed** on Sean's approval: run `40999574486`, commit `902208d`, no
  migrations, `backup ok … pre-deploy-20261030-035749.sql.gz (5291 bytes)`, `/healthz` reports
  0.13.1, and Budget Buddy returned 200.
- **#321 closed**, proven on this release. The tag's index lists `linux/amd64` and
  `linux/arm64`, plus two `unknown/unknown` attestation manifests. Both scan legs were green
  (about 1.5 min each, in parallel). `build-push` took **3m06s**, against about 40 s for
  amd64 only. On `jupiter` the arm64 image migrated a throwaway `postgres:16` to `0010` and served
  `/healthz` under the production lockdown flags, with `uname -m` `aarch64`.
- **Handoff for the BB session**, in the vault next to the 2026-10-27 IaC handoff: Orbit Ops's
  state, #337's recipe for BB #529, what BB #530 needs (`lxd init`, the cross-cutting duties),
  the Bitwarden TODOs, and **a reminder to come back here once BB #530 merges**, with its SHA.
- Gotchas:
  - `release-prep`'s version is worth reading against VERSIONING.md. Console code is not a MINOR
    by itself, only new surface is.
  - The deploy log greps show `::error::` lines that are the script's own source being echoed,
    not errors.
- **After the wrap:**
  - **Docker build cache.** On the VM it was pruned (15 GB freed, 33 GB free now) and capped at
    10 GB by Docker's own garbage collection (`/etc/docker/daemon.json`, `builder.gc`). All dev
    containers came back after the restart. Prompted by Sean weighing JetBrains' remote backend.
  - **Cross-project routing, replacing handoff notes:**
    - Another repo must act → a `cross-repo` issue there (the label now exists in all three
      repos).
    - A shared VM or droplet change → the dated log in `personal-vault` (where: `CLAUDE.local.md`).
    - Urgent → also message the running session.
    - The handoff note was folded into BB #530's comment.
- **Unreleased on `main`:** nothing.
- **Next:** Sean is doing BB #530 in a Budget Buddy session. When it merges, start #322 with BB's
  SHA. Unit 2.1 (Python for operations) isn't blocked: plan its milestone and issues any time.
  Still on the droplet: apt updates and the 26.04 upgrade.

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

### 2026-10-19: `/beginner-audit`, and Unit 1.1 modules 01–05 audited

- **Merged on Sean's word**, one issue and one PR each, all in milestone v0.11.0:
  - #223 (#217): the `/beginner-audit` skill, run as `/beginner-audit <slug> [git-ref]`.
    - It runs in a forked context, is read-only, and returns an issue body with a practice
      table.
    - It's step 3 of "Before Sean plays it".
    - It took three runs on old module 07 to catch all four of Sean's gaps. The `tee` gap was
      found only once the practice table was part of the output: a check the skill keeps "for
      itself" gets skipped.
  - #225 (#224), module 01. The task answered itself: its only check is `cwd`, so the success
    text and comms gave the 02:40 time on the `cd`, before the `cat`. The time is now the log's.
  - #227 (#226), module 02. It now teaches how to work out a relative path, not just finished
    ones. `cd -` prints its path, the one exception to module 01's "cd is silent".
  - #231 (#228), module 03. Its examples were the task's answer (`crash-2026-10-*`, `archive`).
  - #230 (#229), a console bug found playing module 03's Try it. `mv f nope/` renamed the file
    to `nope`, and now it refuses as GNU does. A directory can still be renamed with a slash.
  - #233 (#232), module 04. It defines owner, group and mode. `chown` stays here, with one
    `sudo` sentence: moving it to module 05 would change its card's id and lose its review
    history (Sean deferred to that).
  - #235 (#234), module 05: `cut -d: -fN` in prose, main and extra groups, and Docker before
    Q4.
- **The audit rhythm that held for every module:**
  1. Audit, verify its claims against the module, file the issue.
  2. Fix, then run the content-reviewer and a **second** `/beginner-audit` on the rewrite.
     The second pass found real gaps every time, 4 to 8 per module.
  3. Run Try it in `ubuntu:24.04` and in the station console. That found something every time:
     `less` missing from the bare image, `cd -` printing, the `mv` bug.
  4. Play the task as `verify-bot` with Playwright.
  5. Add `criterion` tests that fail against `main`'s module.
- Gotchas:
  - ⚠️ `docs/content-authoring.md` caps a quiz at **5 questions** (`test_real_modules_follow_the_authoring_guidelines`).
    A sixth question for module 01's time was refused.
  - ⚠️ There is no console check type that sees a command being *run*. Only state is checked.
  - ⚠️ `#210`'s test keeps the word `airlock` out of module 05's lesson, so `sudo -u` examples
    use `www-data`, which is real-Linux-only. The console has only `root`, the task's accounts
    and you.
  - ⚠️ After switching branches mid-session, `/beginner-audit` may come up "Unknown skill"
    until the skill list refreshes. A general-purpose agent told to follow `SKILL.md` is the
    same thing.
  - ⚠️ The Playwright helper split its command list on `|` and broke a pipe. A different
    separator fixed it.
- **Left for Sean:**
  - Module 05's part 2 answer, `/usr/sbin/nologin`, is guessable from the lesson's "usually
    `nologin`". Fixing it needs a new `shell:` and check.
  - `id deploy` on the droplet would say whether Q4's removed `deploy`-in-`docker` claim can
    come back.
  - Sean confirmed nginx logs to `/var/log/nginx/` on the droplet, so module 01's claim stands.
  - Dependabot's #222 (8 bumps, ruff 0.17) is still open.
- **Next:**
  1. Continue the audit with module 06, *Processes and signals*, then 07–10, one issue and PR
     each.
  2. Cut v0.11.0 when Sean says so. It's content plus the #229 console fix, so a MINOR by the
     milestone, with no migrations.
  3. Then Unit 1.5 (systemd).

### 2026-10-17 (evening): v0.10.0 shipped, and a beginner audit planned

- **Merged on Sean's word:**
  - #211, Okafor is he.
  - #213 (#208): the console's status line says `N of M done` for tasks with two or more checks,
    once something has changed. It never says which check is left. The rule is a pure
    `progressNote` in `shell.js`, so a Node test claims it.
  - #215 (#210): module 05.
    - Lesson: `/etc/passwd` field by field, the login shell, `nologin`, a user versus a
      same-name group, why `groups` lags after `usermod`, a `su` paragraph, and what `grep` does.
    - Task: two numbered parts.
    - `su` is in `CONSOLE_LACKS`.
  - #218 (#214): module 06 says what `$?` is, that its `$` is typed, and that silence means
    success. Q3 was reworded in place.
  - #219 (#216): module 07 rewritten for a beginner.
    - The three streams in plain words, `>` is `1>`, and `2>&1` piece by piece.
    - `/dev/null` and "only stdout goes through a pipe" each get a sentence.
    - `tee` is practised in Try it.
    - No `cmd` anywhere, and pipefail is left to *Robust scripts*.
- **Shipped v0.10.0, not v0.9.1.** Release-prep pointed out that `stat -c` and the progress line
  are features, and `VERSIONING.md` makes those a MINOR. Sean chose 0.10.0, so milestone v0.9.1
  was renamed v0.10.0 (now closed) and the audit milestone became v0.11.0.
  - CHANGELOG cut: #220.
  - Run `39054223874`: backup ok, no migrations, `running version 0.10.0`, "Deployed and
    healthy". The public `/healthz` reports `0.10.0` and Budget Buddy answers 200.
  - ⚠️ `gh release create --target <short sha>` is refused ("not a valid tag"). Use `--target
    main` or the full SHA.
- **The finding behind it:** our checks test that a lesson is *right*, not that a beginner can
  *find* the answer.
  - `NEEDS` covers only the console task.
  - The content-reviewer checks quiz answers for correctness.
  - Sean couldn't find `$?`, `/dev/null` or what stdin is.
  - The reviewer, told to read as a learner who had done only the earlier modules, caught module
    07's `grep` example being the task's answer word for word.
- **Next, milestone v0.11.0:**
  1. **#217:** a `/beginner-audit` skill that reads one module end to end as a learner who has
     done only the modules before it. It reports, and Claude files that module's issue.
  2. **The audit:** Unit 1.1 from module 01, one module at a time, thoroughly. Each module gets
     its own issue, filed with its findings, and its own PR.
  3. Unit 1.5 (systemd) waits behind the audit.

### 2026-10-17 (later): v0.9.1 opened, from Sean playing Unit 1.1

Sean played Unit 1.1 modules 03–05 on production and hit three gaps. Milestone **v0.9.1** holds
the fixes.

- **#206 (#209), merged:** module 04's `chmod` task. He answered `chmod 700` where `744` was
  wanted, and couldn't work out quiz Q1's `640`. The lesson went from letters to numbers only,
  offered `700` for a script, and never showed a number removing permissions. It now:
  - reads the string in threes;
  - works a mode both ways, every step shown (`751`), with a dash for a value that doesn't fit;
  - has a table of all eight digits;
  - shows `chmod 700` against `u+x` on a shared `664` script.
  - Also: the task says to look first and change nothing else, Q2 is now `754`, and a new last
    question asks about the mistake. No quiz answer appears on the page (a test holds it).
  - **The console has `stat -c`** (`%a %A %n %U %G %s %F`, `-L`), byte for byte with coreutils
    9.4. Plain `stat` is refused. `man chmod` explains the 4/2/1 sums.
- **#207 (#211), open, waiting for Sean's word:** Okafor is **he** (Sean's decision). Eight lines
  across Bash 03/04/06/07 and Git 03/08 change. The auditor and Nakamura keep "she". The cast and
  `docs/story.md` record it, and `test_okafor_is_he` refuses she/her outside those two modules. It
  was mutation-checked three ways.
- **#208, filed:** the console says `N of M done` for tasks with two or more checks, never which
  one is left.
- **#210, filed:** module 05's second part (the `airlock` account's login shell). "Login shell"
  and `nologin` are never explained, the account and the group share a name without a word,
  `groups` hides a new group until the next login, and the `sudo-vs-su` card tests `su`, which no
  lesson teaches. This is the "`su` gap" carried since earlier sessions, now filed.
- ⚠️ **`./test.sh FILE…` with a pattern that matches nothing runs no tests and prints "no tests
  ran"**, which looks like a pass if you only read the last line. Check the exit status, and
  prefer the full suite.
- **Next:**
  1. Merge #211 on Sean's word, then #208 (console) and #210 (module 05), then cut **v0.9.1**
     (a PATCH: content plus small console fixes, no migrations).
  2. Then plan Unit 1.5, systemd, as before.

### 2026-10-17 — #176, #196, #198–#200 and v0.9.0: Unit 1.4 done and shipped

- **#176 (#195):** module 10, *Following a connection*, the unit's last.
  - The lesson covers `sudo ss -tnp`, `dig -x` and checking that the name points back (a PTR
    record is only a claim), `curl -v` and the `Server:` header (a valid certificate proves the
    name, not the intent), and writing it up before you kill anything.
  - Console: the mystery's 1.4 clue. `scrubber-flush` is still running as root and holds
    `203.0.113.47:443` (`relay.depot-sync.net`, which points back), while Mission Control is
    `10.4.1.40`. The relay says `Server: depot-relay` and "awaiting controller state from
    meridian/scrubber-b". A decoy `telemetry-link` connects to Mission, and a `running` check
    keeps the job alive: it's evidence.
  - `docs/story.md`'s 1.4 row is *written*. Unit 1.4 has all 10 modules, and completing it earns
    *Relays Restored*.
- **#196 (#197), found by Sean playing 1.1 module 03:** no lesson said what the shell was. Module
  01 now opens with the terminal and the shell, bash, reading the prompt, a command and its
  arguments, and the shell reading the line first. Module 03's globs point back to it.
  ⚠️ **Quiz attempts are stored by question index** (`exercise_attempts.item`), so a new question
  goes **last**. Inserting one shifts the production answers. A test holds it.
- **The `content-reviewer` pass over Unit 1.4 modules 02–09** (owed from last session): nothing
  blocking, and three issues:
  - **#198 (#201), content:**
    - Module 07's quiz said a bad ssh option logs in as the wrong user (ssh stops first).
    - Modules 07 and 08 now say add to `~/.ssh/config`, don't replace it.
    - Module 05's lab hints gave the jq filters away.
    - Module 06's `-checkend` example was the lab's answer.
    - Smaller wording fixes.
  - **#199 (#202):** `help` now lists `dig host curl ufw ssh`.
  - **#200 (#203):** a terminal check `{lacks: P, text}`, in both graders with shared parity cases.
    Module 09 refuses opening 9100 to everyone as well as to Mission. It doesn't catch a second
    narrow rule, which would need a counting check.
- **Shipped v0.9.0** on Sean's go. The four PRs were merged one at a time with rebases (CHANGELOG
  and test-file conflicts only). Release-prep said GO, the CHANGELOG cut went in as #204, and the
  release was published on `4497664`. Run `38972057984`: the smoke test passed, Sean approved, the
  backup was taken, there were no migrations, and the release reported `running version 0.9.0`
  then "Deployed and healthy". The public `/healthz` reports `0.9.0`, and Budget Buddy still
  answers 200. Milestone v0.9.0 is closed.
- **How it was checked:**
  - The module 10 and #196 Try its ran in a fresh `ubuntu:24.04` as a sudo-capable user. Two module
    10 comments were corrected to the real output: `ss` lists itself, and a closed connection
    shows `FIN-WAIT-1` first.
  - Module 10 and its quiz were played as `verify-bot`.
  - The content-reviewer ran on every changed module.
- **Found on the way:**
  - The console's `curl -v` names `Meridian Station CA` as every certificate's issuer, the depot
    relay's included. That's odd for the story. Not filed. It would be a per-host `issuer` in the
    console.
  - Real `ss -p` truncates process names to 15 characters, and a module 10 test now holds the
    console's names to that.
  - `RUNBOOK.md` §4 still says the deploy secrets can be Budget Buddy's. Sean still needs to
    confirm it.
- **Next:**
  1. Plan **Unit 1.5, systemd & services** (6 modules in `docs/roadmap.md`), the last of Life
     Support and the mystery's reveal (`journalctl` at 02:30–02:45, `docs/story.md`). It needs a
     milestone (v0.10.0) and its issues, and probably console `systemctl` and `journalctl` first.
  2. Still open from before: the first live hint and lab review, opening Review once (`0007` on
     prod), the unfiled `su` gap in Unit 1.1 module 05, and RUNBOOK §4.

### 2026-10-16 — #165, #166, #168–#175 and #188: Unit 1.4 nearly done

- **Console platform:**
  - **#165 (#182):** DNS. `dig` (full output, `+short`, `-x`, `@SERVER`), `host` and `getent hosts`,
    a real `/etc/hosts` and `/etc/resolv.conf` in every console, read live. Checked against a
    bind9 resolver in containers: 33 commands identical after masking id, time and date.
  - **#166 (#192):** `curl` against routes declared on services and listeners (curl 8.5.0's
    `-v`, errors and exit codes; no progress meter), `ufw` kept in its own files, and `ssh HOST
    'COMMAND'`. `nc` now shares the connection model. ufw's files match real ones byte for byte
    from both the Python writer and the console (fixtures in `tests/js/fixtures/`).
- **Modules (8):**
  - Console tasks: 02 *Names and DNS* (#183, a stale `/etc/hosts` pin), 03 *Is it reachable?*
    (#184, four relays, the ping monitor wrong twice), 09 *Firewalls* (#193, an old `deny` above
    everything; one host, one port, firewall on).
  - Labs: 04 *HTTP by hand* (#185, this app's `/healthz`), 05 *APIs and JSON* (#186, GitHub's API
    for this repo), 06 *TLS and certificates* (#187, the droplet's default certificate is Budget
    Buddy's), 07 *SSH keys* (#190, GitHub's published host-key fingerprint), 08 *Copying files and
    tunnels* (#191, rsync's trailing slash and `--delete`).
  - 37 of about 170 modules are written.
- **#188 (#189):** the screen's two panes have `zoom: 0.85`, and the column is widened to match.
  From previews at 100/90/85%, Sean picked 85% (I'd recommended 90%). Body text is 13.6px at
  1280×720, so the issue's floor moved to 13.5px.
- **How it was checked:** every Try it, and every lab's steps, ran for real in a fresh
  `ubuntu:24.04` as a sudo-capable non-root user. The labs' examples are those runs. Every console
  task was played in the browser with a throwaway `verify-bot`.
- **Found on the way:**
  - `getent hosts` asks for IPv6 first, so an IPv4 pin doesn't show for a name with an AAAA
    record. Module 02's Try it pins `github.com` for that reason.
  - `sed -i` fails on Docker's mounted `/etc/hosts`; `nano` works. ufw needs a `--privileged`
    container.
  - The VM's network seems to intercept public DNS (NOERROR for missing names), so DNS captures
    use containers.
  - Recent macOS ships openrsync, and its built-in `openssl` is LibreSSL: the labs point Mac users
    at Homebrew, and the TLS lab tolerates LibreSSL's spacing. Not tried on a real Mac.
  - `RUNBOOK.md` §4 looks stale: it says the deploy secrets can be Budget Buddy's and that
    `DROPLET_KNOWN_HOSTS` comes from `ssh-keyscan`. Left for Sean to confirm.
- ⚠️ **The `content-reviewer` agent was not run on modules 02–09** (a standing decision above).
  They had real runs, misreadings tests and figures tests instead. Run it over them before
  cutting v0.9.0.
- Sean reset his production password from the Mac with `scripts/create_user`.
- Production is still **v0.8.0**. Nothing released.
- **Next:**
  1. #176, *Following a connection*: the unit's last module, the mystery's 1.4 clue
     (`relay.depot-sync.net`), *Relays Restored*, and `docs/story.md`'s 1.4 row.
  2. A `content-reviewer` pass over Unit 1.4 modules 02–09, then cut **v0.9.0** (a MINOR: new
     console code). No migrations since v0.8.0.
  3. Still open from before: the first live hint and lab review, opening Review once (`0007` on
     prod), and the unfiled `su` gap in Unit 1.1 module 05.

### 2026-10-15 — #164 and #167: the console's network, Unit 1.4 begun

- **#164 (#179):** the station console has a network. A terminal exercise's `network:`
  (`NetworkSpec`) gives the console's interfaces and gateway, its own sockets (each held by a
  starting process, so `ss -p` and `ps` agree, and `kill` closes the socket), and other hosts
  (`services`, `filtered`, `up`, `ping`).
  - `shell.js` has `ip` (addr/link/route/route get), `ss`, `ping -c`, `nc -z` and `hostname`.
  - Without `network:` the console uses `DEFAULT_NETWORK`, `10.4.0.12/24` via `10.4.0.1`, and a
    test holds it equal to `NetworkSpec()`.
  - Names don't resolve yet, except `localhost` and `meridian`. #165 extends `resolveName`.
- **#167 (#180):** Unit 1.4 module 01, *Addresses and ports*. The relay console is at
  `10.4.1.23/24`. `telemetryd` is on `127.0.0.1:3000`, and the services run as their own
  accounts, so the task needs `sudo ss -tlnp`. `tests/test_networking.py` starts Unit 1.4's
  tests, and the untaught-command check now covers Units 1.3 and 1.4.
- **How it was checked:**
  - Real output was captured first: `ip`/`ss` on the 24.04 VM, and `ping`/`nc` from two
    `ubuntu:24.04` containers on a scratch `10.4.0.0/24` network (iptables DROP for a filtered
    port).
  - ss's column widths follow iproute2 v6.1.0 `ss.c`'s non-terminal layout, matched byte for
    byte against the VM.
  - `nc` with no `-w` on a filtered port takes 2 min 14 s of station time.
- **Found on the way:**
  - A `contains` check is a substring. `gateway 10.4.1.12` would have passed
    `gateway 10.4.1.1`, so the console moved to `.23`, and `test_module_01_refuses_the_misreadings`
    holds it.
  - The content-reviewer caught the quiz quoting the task's figures (a test now forbids it) and a
    crew line calling rebinding "a firewall job".
  - `kill %1` in a Try it fails when it isn't run interactively, and `$!` is untaught, so the Try
    it uses `pkill -f`. When testing a `pkill -f` Try it, run it from a script file: a
    `bash -c "…"` wrapper matches its own pattern.
  - A commit went in with a stale exercise fixture because the gate was `grep passed`, not the
    exit status. Fixed in the PR before the merge.
- Production is still **v0.8.0**. Nothing released.
- **Next:**
  1. #165, DNS on the console (`dig`, `host`, `getent`, `/etc/hosts`, through `resolveName`),
     then #168 (module 02). The order after that: #169 → labs #170–#174 → #166 → #175 → #176.
  2. On the desk: the first live hint and lab review, and open Review once (`0007` on prod).
  3. The `su` gap in module 05 is still unfiled.

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
