# Changelog

All notable changes to Orbit Ops. The format follows [Keep a Changelog](https://keepachangelog.com);
versions follow `VERSIONING.md`. Write entries for someone reading them in a year: what changed
and why it matters, not what the diff says.

## [Unreleased]

### Changed
- The desk's computer is now a laptop, and you can close its lid to see the room (#55). The
  screen is exactly where it was, so nothing in the app moves. "Close lid" on the bezel folds the
  lid down onto the keyboard and shows the whole window: the Earth, the docking arm, and any
  window event that's playing, which now shows in full (the aurora was mostly hidden behind the
  old monitor). Click the shut laptop to open it. It's the same page, never reloaded, so your
  scroll position and a half-typed console command are still there. Under reduced motion the
  lid snaps instead of folding, and without JavaScript the laptop just stays open.

## [0.4.0] — 2026-10-09

Hands-on and the desk: a station console task in nine of Unit 1.1's ten modules, with sudo,
processes, the environment, awk and sed, and the whole app on a computer at a pixel-art desk,
where the crew's messages tell the unit as one story.

### Added
- All of Unit 1.1 is told on the desk's comms log (#45): ten days of bringing the *Meridian*'s
  life support back, from the first boot to the last green light, with Okafor, MERIDIAN and
  Mission Control. Every briefing, every console task's reply and every debrief is a short
  conversation, and the numbers the station quotes are the ones in your console.
- Three more things happen outside the window: a relay satellite rises as comms come back
  (navigating), a debris field drifts past and sets off the runaway scan (processes and signals),
  and an aurora shimmers over the Earth when the unit is finished (packages). Window events can
  now play at any beat: opening a module, passing its console task, or completing it (#45).
- The desk's monitor looks like a computer (#46): a pixel-art gunmetal case with a bevelled
  bezel, a "MERIDIAN" maker's plate, buttons and a power light in the deck's colour, on a neck
  and foot on the desk. The screen is glass, with faint scanlines, a soft glare and darker
  corners, and its light spills onto the bezel. Lesson text keeps better than 7:1 contrast.
- The desk (#38). Orbit Ops is now a first-person scene: a pixel-art room on the *Meridian*,
  with a window onto the Earth and a docking arm, a desk with a keyboard, a lamp and a coffee mug,
  and the whole app on the monitor in front of you. Desktop browsers only, 1280×720 and up.
  - **A comms log** beside every page holds every message the crew has sent you, in order: Chief
    Engineer Okafor, MERIDIAN (the station's own terse status lines) and Mission Control (with a
    light-delay stamp). New messages arrive one at a time after "… is typing"; Escape or a click
    brings them all in.
  - **Permissions and ownership is the first module told this way:** its briefing arrives on
    comms, passing its console task gets Okafor's reply, and completing it brings the debrief
    while the supply shuttle *Kestrel* docks outside the window.
  - The art is code (`art/`), checked by a test that redraws it, and the CSP is unchanged.
    Under reduced motion messages appear at once and the shuttle is a still, docked.
- Station console tasks in four more Unit 1.1 modules: find the life-support logs
  (filesystem), follow Okafor's hidden note (navigating), capture both output streams for the
  reactor report (pipes and redirection), and find the three noisiest addresses in the docking
  log (text tools). Six of the ten modules now have one (#36).
- The console understands `2>&1` and `&>` (applied left to right, as in bash), `tee`, and
  `cd -` (#36).
- The console now knows users, the environment and processes (#37):
  - **Users:** `sudo` with a real password prompt (masked, never logged or kept in history),
    `sudo -l`/`-i`, and `id`, `groups`, `getent` and `usermod` over generated `/etc/passwd` and
    `/etc/group`. `usermod -G` without `-a` really does take your other groups away, `sudo` included.
  - **Environment:** shell vs exported variables, `VAR=x cmd`, `bash -c` and scripts in a child
    shell, `source`, and commands found on `$PATH`, so a different `python3` earlier on the
    PATH really runs instead.
  - **Processes:** `ps`, `pgrep`, `pkill`, `kill` with signals, background jobs and `jobs`/`fg`,
    on a simulated clock. A process can ignore SIGTERM.
  - **Three new tasks:** join the airlock group without losing sudo (users and sudo), stop a
    runaway diagnostic politely and then impolitely (processes and signals), and make the
    navigation `python3` win and stick (environment and PATH). Nine of Unit 1.1's ten modules
    now have a console task.
- The console has a small `awk` (`-F`, `pattern { print $N }`, `BEGIN`/`END`, comparisons and
  regex matches) and `sed` (`s///g` with groups, `-n`/`p`, `d`, `q`, line and regex addresses,
  `-i.bak`), enough for the text-tools lesson's own pipelines. Anything beyond them says it isn't
  supported rather than giving a wrong answer (#41).
- Every exercise carries a reference solution that CI runs through the console's shell, so a
  task that can't be completed fails the build. Solutions are never sent to the browser (#36).

### Changed
- The starfield behind every page is gone: the desk's window shows real space now (#38).
- Phones are no longer supported: Orbit Ops is built for desktop browsers (#38).

## [0.3.0] — 2026-10-09

Gamify: XP and ranks, a daily streak with freezes, badges, the station map, a station that looks
the part, and the station console for hands-on terminal practice.

### Added
- A database table for the XP ledger: every award is a row saying what earned it, and totals,
  levels and ranks will be summed from it rather than stored. The database refuses to record the
  same award twice (#21).
- XP and ranks. Completing a module earns its XP (50 by default), plus 20 for a perfect quiz,
  once per module no matter how often it is re-answered. Levels follow a curve (level 2 at 100
  XP, level 10 at 2700) and rank titles run from Cadet to Station Commander, defined in
  `syllabus.yml`. The completion message shows the XP earned and announces promotions; the
  dashboard shows level, rank and a bar to the next level (#21).
- A database table for the daily streak: one row per day that counts, either a day with activity
  or a missed day bridged by a freeze. The streak itself is worked out from it (#22).
- A daily streak. Completing a module marks the day (in `APP_TIMEZONE`) active, and the dashboard
  shows the streak, the freezes banked and whether today's log entry is filed yet. Every 7th
  active day banks a freeze (up to 2), and a missed day is bridged automatically if the freezes
  cover the whole gap; otherwise the streak starts again. Nothing runs at midnight: the streak is
  worked out when a page is opened (#22).
- A database table for badges: one row per badge a learner holds, recorded once. What each badge
  is and how it's earned will live in `syllabus.yml` (#23).
- Badges. Finishing a unit, reaching a 7-, 30- or 100-day streak, and a first perfect quiz each
  earn a badge, once. They are defined in `syllabus.yml` (one per unit, 23 in all) and checked
  in CI, so a badge pointing at a unit that doesn't exist fails the build. The completion message
  announces new badges, the dashboard shows the three most recent, and a new Badges page lists
  every badge: earned ones with their date, locked ones dimmed with what it takes to earn them.
  A unit finished before badges existed earns its badge at the next module completion (#23).
- A station map (`/map`, linked from the nav and the dashboard). The syllabus is drawn as the
  *Meridian*: one deck per track, one node per unit, and a line from each prerequisite to the
  unit that needs it. Complete units are lit, ones ready to start pulse, and locked ones are
  dimmed; each node links to its unit on the syllabus and its tooltip gives progress and what
  it's waiting on. A plain list below the drawing carries the same information. Positions come
  from `map: {x, y}` in `syllabus.yml`, with an automatic layout for units without one. No
  JavaScript, and the CSP is unchanged (#24).
- On a narrow phone the top bar shows only the ◎ mark, to fit the four links (#24).
- The station feels like a station (#18):
  - Each deck has its own colour (Life Support teal, Cargo & Fabrication amber, Fleet Command
    violet, Comms, Sensors & Shields rose), carried by its module pages, its syllabus section,
    the mission card and the map.
  - Briefings arrive as an incoming transmission that types itself out; a click or any key shows
    it all at once.
  - A slow starfield drifts behind every page.
  - A console readout under the top bar shows "Systems online 1/10 · Streak 3".
  - The Life Support units have line-art emblems (an air scrubber, a script, a branch, a comms
    dish, a reactor).
  - Completing a module powers up the "System restored" banner.
  - Under the system's reduced-motion setting nothing moves and briefings appear in full. The
    Content-Security-Policy is unchanged.
- The station console: hands-on terminal exercises inside a module (#17). A module can set a
  task over a filesystem it defines, and you do it by typing real commands into a console on the
  page: `ls -l`, `chmod`, `mv`, globs, pipes, redirection, history, Tab completion and Ctrl-C,
  with an on-screen key row on phones. The shell is simulated in the browser, so nothing runs on
  the server. Permissions are enforced as for a normal user. The console says when the task is
  done, and the server re-checks the final filesystem against the module's own checks before
  recording it, so the browser's word isn't taken for it. The first two exercises are in
  "Making, moving and matching files" and "Permissions and ownership". Unsupported commands say
  so and the console carries on.
- Right and wrong quiz answers keep fixed colours (teal and amber) on every deck, so a deck's
  colour never makes them look alike (#18).

## [0.2.0] — 2026-10-08

The learn loop: the full syllabus, Unit 1.1's ten Linux modules, quizzes that complete a
module and unlock the next, and today's mission on the bridge.

### Added
- The curriculum is now content: lessons are Markdown files with YAML front matter under
  `content/`, organised by `syllabus.yml` into tracks and units. The whole curriculum is
  validated at startup and in CI, so a lesson with a broken quiz fails the build with the file
  and field named, rather than breaking a page in production (#4).
- A module page with the story briefing, the lesson (syntax-highlighted code, tables) and the
  quiz, plus a syllabus page listing every track, unit and module. Quiz answers and
  explanations never reach the browser (#4).
- The first module, "The filesystem tree", and `docs/content-authoring.md` describing the format.
- Database tables for learner progress: which modules are started or complete (with a score), and
  every quiz answer submitted. Locked and available are worked out from the syllabus, never
  stored (#5).
- The daily loop works. Quiz questions are answered one at a time and replaced in place with the
  verdict, the right answer and the explanation. Answering the last question completes the module
  with a score (the first answer to each question is the one that counts) and links to the next
  module (#5).
- Modules unlock in order, and units unlock when their prerequisite units are finished. Opening a
  locked module sends you back to the bridge with what to finish first (#5).
- The full syllabus: four tracks (Life Support, Cargo & Fabrication, Fleet Command, and Comms,
  Sensors & Shields) and 19 units, with their prerequisites and story briefings (#6).
- Unit 1.1, **Linux & the shell**, is complete with ten modules: the filesystem, navigating,
  files and globs, permissions, users and sudo, processes and signals, pipes and redirection,
  text tools, environment and PATH, and apt. Every "Try it" block was run on Ubuntu 24.04 before
  merging (#6).
- The dashboard leads with today's mission, the next available module, plus overall progress.
  The syllabus marks every module complete, available or locked (#5).

### Fixed
- `HEAD` requests now get the same status and headers as `GET`, without a body, instead of
  `405 Method Not Allowed`. Uptime monitors and link checkers that use `HEAD` saw the site as
  down (#9).

## [0.1.0] — 2026-10-08

First release: the station's skeleton, live at learn.seandesmet.com.

**Server:** `/opt/orbit-ops/.env` is set up (RUNBOOK §2). After the deploy, set the `orbit_app`
password and `DB_APP_USER`/`DB_APP_PASSWORD` (RUNBOOK §3).

### Added
- The station is built: a FastAPI app with login, a dashboard placeholder and `/healthz`
  (reports the version the image was built as, so a deploy can be verified).
- Security carried over from Budget Buddy: argon2 password hashing, signed session cookies that
  can be revoked by rotating a per-user token, CSRF on every POST (htmx header or form field), a
  login rate limit (10/min), and a nonce-based Content-Security-Policy with framing denied.
- PostgreSQL schema managed by Alembic, with a least-privilege `orbit_app` role whose grants
  extend automatically to tables added by future migrations.
- Docker image (non-root, digest-pinned base, fully pinned dependencies) and a compose file sized
  for the droplet it shares with Budget Buddy: no published database port, 256 MB caps.
- CI (ruff, tests against real Postgres, a migration round-trip, image build), changelog and
  acceptance-criteria checks, and a Release workflow that backs up, migrates, deploys and verifies
  — plus a manual Rollback.
