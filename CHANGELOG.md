# Changelog

All notable changes to Orbit Ops. The format follows [Keep a Changelog](https://keepachangelog.com);
versions follow `VERSIONING.md`. Write entries for someone reading them in a year: what changed
and why it matters, not what the diff says.

## [Unreleased]

### Added
- A place on each exercise attempt for Claude's review of a passed lab: its score, strengths
  and issues. Empty for everything else (#122).
- A database table for AI spend: one row per model call, with its purpose, model, tokens and
  cost. The monthly AI budget will be summed from it. Spend outlives a deleted user, so the
  month's total can't shrink (#120).
- The AI foundation (#120). Every model call goes through one gate that refuses when there's
  no API key or this month's spend has reached `AI_MONTHLY_BUDGET_CENTS`, and records each
  call's tokens and cost. Months follow `APP_TIMEZONE`. Hints will use Haiku 5.5 and lab
  review Sonnet 5.5. The header readout gains **Uplink online/offline**, so you can see
  whether AI features are available. Nothing calls a model yet: hints (#123) and lab review
  (#122) are the first features to.
- Labs (#121): exercises done on your own machine, with real `git` from Unit 1.3 and later
  Docker and a cluster. You paste what the commands printed, and the app checks the text. It
  runs nothing. A failed check shows its hint, and what you pasted stays in the box. The first
  pass is worth 40 XP and brings the crew's `lab_done` reply on comms. A new badge, *Field
  Work*, is earned for passing a first lab. Like a console task, a lab doesn't decide whether a
  module is complete: the quiz still does. Unit 1.3's modules are the first with labs.
- Claude reviews a passed lab (#122), for labs whose author asks for it with a rubric. Once the
  checks pass, the review loads by itself without delaying the pass: a score out of 100, up to
  three things done well and three to do differently. It earns a bonus of up to 20 XP, once.
  It runs on Sonnet 5.5 through the AI budget gate. With no key or no budget left, the lab still
  passes and the review can be asked for later. The checks always decide pass or fail; the
  review never does.
- Hints (#123): stuck on a quiz question, the console, a challenge or a lab, ask for a hint.
  Haiku 5.5 sees the lesson, the task and what you've tried, never the answer key. A reply that
  gives the answer away anyway is replaced with a pointer back to the lesson, free. A hint
  costs 5 XP once per task, however many you ask for, and each task allows one a minute. With
  no key or budget, the buttons say "Hints are offline".
- Unit 1.3 module 01, "Your first repository" (#125), the first module of **Git** and the
  first with a lab. It covers getting git on Ubuntu, a Mac or Windows; `git config` for the
  name and email every commit carries, and why that's per machine; and `init`, `status`, `add`,
  `commit -m` and `log`. It explains what a commit is (a snapshot with an author, a time, a
  message and a parent) and why nobody else's hashes match yours. In the lab you put
  `airmix.conf` under version control in two commits on your own machine, and paste
  `git log --oneline` and `git status`.
- Unit 1.3 module 02, "Staging and diffs" (#126). It covers the working tree, the index and
  HEAD; `git diff` against `git diff --staged`, and reading a hunk; `git add -p` for staging
  part of a file; `git status --short`'s two columns; and `git restore` with and without
  `--staged`, including the one that can't be undone. In the lab, two fixes sit in the same
  file and only the tested one is committed. You paste the short status, the commit and what's
  left in the file.
- Unit 1.3 module 03, "Reading history" (#127). It covers `git log`'s filters (`--oneline`,
  `--graph`, `-p`, `--author`, `--since`, `-- PATH`), `git show`, and `git blame`, including
  why the commit blame names may only have touched the line. Then `git log -S`, the pickaxe,
  finds where a value was added or removed. In the lab, a month of history by three crew
  members hides who raised the CO2 alarm to 5000 ppm. Blame points at a commit that only
  re-spaced the file, and the pickaxe finds the real one. The setup builds the same history,
  hashes included, on any machine, and runs in zsh as well as bash.
- Unit 1.3 module 04, "Branches and merging" (#128). It covers what a branch is (a name for a
  commit), `git switch -c`, switching, fast-forward against a merge commit, `--no-ff`, the
  merge message's editor (and how to leave vi), reading `git log --graph --all`, and
  `git branch -d`. In the lab, the pump schedule is worked on a branch while `main` takes a
  filter fix, and then the two are joined with a merge commit. You paste the graph showing both
  lines and the merge.
- Unit 1.3 module 05, "Merge conflicts" (#129). It covers why conflicts happen, reading the
  markers, resolving by editing (which may mean neither side's value), `git add` to mark a file
  resolved, finishing with `git commit`, and `git merge --abort`. In the lab, Nakamura and
  Petrov changed the same CO2 warning on two branches, and you settle it at the brief's value
  in a merge commit that says so. Their other changes merge by themselves.

### Fixed
- The deploy's pre-migration backup can no longer pass when `pg_dump` fails (#116). It used to
  check only that the dump was valid gzip, and a failed `pg_dump` still leaves one, so a deploy
  could migrate with no usable backup while its log said `backup ok`. The backup is now
  `scripts/backup_db.sh`, run under bash with `pipefail`. It keeps a dump only if `pg_dump`
  succeeded **and** the dump ends with its completion line. Otherwise the deploy stops before
  migrating, and no file is kept. The RUNBOOK's manual dump before a `db` change gets the
  same checks.

## [0.6.1] — 2026-10-12

Bash scripting, finished: Unit 1.2's last six modules, from conditionals and loops to
arguments, functions, robust scripts and cron. Completing it earns *Routine Automated*. The
console's `tar` now fails the way GNU tar does when it can't write its archive.

### Added
- Unit 1.2 module 05, "Conditionals" (#72): `if` as a test of an exit status, `[ ]` and its
  string, number and file tests, `elif`/`else` and why order matters, `[[ ]]`, `&&` and `||` as
  short ifs, `case`, and failing well with `exit N` and `>&2`. Bash compares whole numbers only,
  so the lesson shows how to count a reading like 19.2% in tenths. In the console, `o2-check`
  learns to say `ALERT`, `WARN` or `OK` and to refuse to run without its sensor, then is tested
  against all four cases, including a reading exactly on the alarm line.
- Unit 1.2 module 06, "Loops" (#73): `for` over words, globs, `{1..N}` and a command's output;
  why a glob is safe and `$f` inside the loop isn't; trimming a path to a name with `${f##*/}`
  and `${f%.log}`; `while read -r` line by line; `break` and `continue`; `while` and `until`.
  In the console you write `deck-readings`, which gives all twelve decks' latest CO2 in one
  list. It has to cope with a log named `hydroponics bay.log`, an empty log, a reading exactly
  on the limit, and a deck that was over earlier but isn't now.
- Unit 1.2 module 07, "Arguments and input" (#74): `$0`, `$1`…`$9`, `$#`, `"$@"` (and why not
  `$*`), `shift`, a usage line on stderr with exit 2, an optional argument with `${2:-1}`, and
  `read -r -p` for scripts a person runs. In the console, two report scripts that drifted apart
  as copies become one `deck-report DECK [DAYS]`. It's tested five ways, including no deck, an
  unknown deck and `"hydroponics bay"`.
- Unit 1.2 module 08, "Functions" (#75): defining and calling functions, their own arguments,
  `local`, and the two ways a function answers: data with `echo` and `$( )`, yes or no with its
  exit status. Then sharing them with `source`. In the console, `deck-readings` and
  `co2-alarm` disagree about the galley's 5300 ppm, because one has the limit typed as 50000.
  The learner moves the sensor code into `/station/lib/sensors.sh`, with the limit in one place,
  and makes both scripts source it.
- Unit 1.2 module 09, "Robust scripts" (#76): why bash carries on after a failure, `set
  -euo pipefail` and the exceptions to `-e`, `mktemp -d`, `trap … EXIT` for cleanup, failing
  loudly, and ShellCheck. In the console, last night's `backup-logs` failed, said `backup
  complete` anyway, and left 2.1G of copies in `/tmp`. The learner clears up and hardens it, then
  runs it into the unwritable `/srv/backups` (it must stop with tar's status and leave nothing
  behind) and into a directory of their own (it must succeed).
- Unit 1.2 module 10, "Scheduling with cron" (#77), the end of **Bash scripting**: the five
  fields, `*`, ranges, lists and `*/N`, `crontab -e`/`-l`/`FILE`, cron's small environment
  (a short PATH, `sh`, no `~/.bashrc`, no terminal), keeping a job's output with `>> log 2>&1`,
  and running a job the way cron will with `env -i`. In the console, `shift-check` goes on every
  15 minutes and `backup-logs` at 02:30. Both use full paths and their own logs, and each command
  is run once by hand first. Finishing it completes Unit 1.2 and earns *Routine Automated*.

### Fixed
- When `tar` couldn't write its archive, the console said `tar: FILE: Permission denied`. Now
  it says what GNU tar says, `Cannot open:` and, with `-z`, the `tar (child):` lines and
  `Child returned status 2`. Like GNU, it reports nothing about the files it would have
  archived, because it opens the archive first.

## [0.6.0] — 2026-10-12

Bash scripting, part one: the station console became a real shell for scripts (control flow,
functions, `set -euo pipefail`, traps, nano, man, cron, `find`, `tar` and links), and Unit 1.2
opens with its first four modules. Modules 05–10 follow as 0.6.x releases. It also fixes a
solved console task going unlogged when a file name held a space.

### Added
- The station console runs real shell scripts (#64). It has `if`/`elif`/`else`, `for`,
  `while` and `until` loops with `break` and `continue`, and `case` with glob patterns. Tests
  are written with `test`, `[ ]` and `[[ ]]`, and fail with bash's own messages, including the
  classic `unary operator expected` from an unquoted empty variable. `$(command)` substitutes a
  command's output, `$(( ))` does integer arithmetic, `${file%.log}` and its relatives trim
  names, and `read` takes input from a file, a pipe or the keyboard.
  - Commands can span lines. At the prompt an unfinished `if` or `for` continues on a `> ` line,
    as in bash, and so does a line ending in `|` or `&&`, or one with an open quote. Ctrl-C
    abandons it.
  - A script runs up to a line with a syntax error, then reports the line and stops with
    status 2.
  - sudo can ask for its password inside a loop or a script.
  - A loop that never ends is stopped after 10,000 commands instead of freezing the page.
  - `grep -q` answers yes or no without printing, for `if grep -q …`.
- Console scripts can be robust (#65).
  - **Functions** with `local`, `return` and their own arguments, and `source` loads a library
    of them.
  - **`set -euo pipefail`**, with bash's real exceptions for `-e`: not in an `if` test, not left
    of `&&` or `||`, not after `!`. In a script, an unset variable is reported with the file and
    line, as bash does.
  - **`trap '…' EXIT`** cleans up however a script ends: normally, by `exit 2`, by a `set -e`
    failure, or by Ctrl-C.
  - **Here-documents** (`<<EOF`, `<<'EOF'`, `<<-EOF`) and here-strings (`<<<`) write files and
    feed commands.
  - **`mktemp`** makes private temporary files and directories.
- The console has `find`, disk tools, archives and links (#67).
  - **`find`** searches by name, type, size and age, with `-delete` and `-exec`, and explains
    its mistakes as GNU find does.
  - **`du`, `df` and `free`** report disk and memory use. Deleting files shows up as free space,
    and so does emptying a big log with `> big.log`.
  - **`tar`, `gzip`, `gunzip` and `zcat`** make, list and unpack archives. Archives are
    simulated, but they round-trip exactly and shrink when compressed.
  - **`ln -s` and `readlink`** make and read symbolic links, and every path resolves through
    links.
  - Tasks can now give files a real-looking size and date, and check that a link points the
    right way or that nothing under `/var/log` is too big or too old. The server grades those
    too.
- The console has an editor, a manual and cron (#66).
  - **nano** opens in the console panel. `nano check.sh` lets you write a script right there:
    ^O then Enter saves, and ^X exits, asking first if there are unsaved changes. Saving
    follows file permissions, so `/etc/hostname` is refused for a cadet.
  - **man** opens a pager: Space, b, `/` to search, q to quit. So do **less** and `CMD | less`.
    `CMD --help` and `help cd` work too, and every command the console knows has a page.
  - **crontab -e** opens your crontab in nano. It's checked the way cron reads it and refused
    with cron's own error messages if a line is wrong. `crontab -l` lists it. Nothing actually
    runs on a schedule.

- **Unit 1.2, Bash scripting, opens** with module 01, "Reading and editing on a server" (#68):
  `--help`, `help`, `man` and its sections, `less`, `tail -f`, nano, and enough vim to get out
  of it. In the console you read the scrubber daemon's manual to find the setting that sounds
  the CO2 alarm, past a warning setting that looks like it, and set it with `sudo nano`.
  - Module 02, "Finding things and disk space" (#69): `df`, `du`, `find` by name, size and
    age, `tar` and gzip, symlinks, and why you empty a log a program still holds open
    instead of deleting it. The console task takes a full disk from 97% to under 70%: empty a
    runaway debug log, archive and delete the old logs, and repoint `current.log`. Doing
    only one of the first two steps isn't enough.
  - Module 03, "Your first script" (#70): the shebang, comments, `chmod +x`, `./script` vs
    `bash script`, exit statuses, and where scripts live (`~/bin`, `/usr/local/bin`, the
    PATH). In the console you turn Okafor's sticky note into `/station/bin/shift-check`, make
    it executable, and run it by name.
  - Module 04, "Variables and quoting" (#71): assignment, `$var` and `${var}`, single and
    double quotes, why unquoted expansions split and glob, `$( )`, `$(( ))` and
    `${VAR:-default}`. The console task fixes a cargo report that a manifest called
    `Spare Parts.csv` broke, and gives it a total.
  - Inside a script, the console's errors are bash's own, with the script and line
    (`/station/bin/cargo-report: line 6: Parts.csv: command not found`), even inside `$( )`.
    A redirect from an unquoted or empty variable fails with `ambiguous redirect`, as in bash.
  - A console task can check that a file is **executable** (`{executable: P}`): its owner's
    x bit, so `chmod +x`, `u+x` and `755` all pass.
  - A script on the PATH that isn't executable yet now gets bash's own
    `bash: /station/bin/shift-check: Permission denied`, not "command not found".
  - `man` also finds the pages a program installs in `/usr/share/man`, searching the sections
    in man-db's order (1, 8, 3, 2, 5, …), so a module can give its own daemon a manual.
  - A quiz question can show a script or a command's output as a code block (`code:`), so
    Unit 1.2's "what happens here?" questions read like a terminal, not one run-on line.

### Changed
- Every lesson with a console task now says what the task needs in plain sentences and tables,
  not only in code comments or the Try it (#101). Unit 1.1's commands are tables, and the ideas
  that tripped people up are spelled out:
  - `mv` and `cp` take many files with the destination last;
  - `..` needs its slash;
  - a pattern that matches nothing comes back unchanged;
  - a bare `cd` returns to where the console started;
  - check with `pgrep` that TERM worked before using `kill -9`.

  Lessons also say when the console lacks something they mention (Ctrl-R, `tail -f`, `top`).

### Fixed
- **A solved console task could go unlogged** if the learner had made any file with a space,
  a comma or a `*` in its name: the server refused the whole report. File names may now hold
  any printable character (#71).
- **`rm -i` in the console asked nothing and deleted anyway.** Now `rm -i`, `mv -i` and
  `cp -i` ask first, in GNU's words, and the last of `-f` and `-i` wins (#101).
- Moving several files into a directory that doesn't exist now says `No such file or
  directory`, as real `mv`, `cp` and `ln` do, instead of `Not a directory`.
- A release now reaches your browser straight away (#92). After an update, browsers could keep
  the old stylesheet, scripts and art for hours (Safari did, after the laptop arrived), so a new
  page could be drawn with last release's CSS until a hard reload. Every stylesheet, script and
  image the app links to now carries the release version (`?v=0.6.0`), is cached for a year
  under that address, and changes address with each release. Anything fetched without a version
  checks with the server first. Pyodide's files sit under a path naming their version
  (`/pyodide/314.0.7/`), so Python loads from the browser's cache after the first time.

## [0.5.0] — 2026-10-10

Practice: flashcards on an SM-2 schedule as MERIDIAN's watch drill, Python in the browser with
the first code challenge, a laptop you can close to see the room, and the station map drawn as
the *Meridian* itself, with every unit's story now on show.

### Added
- Flashcard review (#51). Every module you've completed adds its cards to a review queue
  at **Review** in the nav: one card at a time, "Show answer", then Again, Hard, Good or Easy.
  Cards are scheduled with SM-2, so a card you know comes back after a day, then six, then
  longer each time, and one you forget comes back tomorrow. Modules you finished before this
  release count too, so their cards are waiting. Each card now has a permanent `id` in its
  lesson file, so rewording a card keeps its schedule.
- Flashcard reviews count (#52). Each review earns 2 XP, up to 20 a day, and clearing every
  card that's due files today's streak entry, just as finishing a module does. A day with no
  cards due doesn't count by itself. The dashboard says how many cards are due, with a button
  to review them, and the header readout shows "Cards due" on every page, updating as you grade.
- Python code challenges (#54), and the first one: a bonus on Unit 1.1's text-tools module.
  MERIDIAN reports 14 failed logins on the docking port; prove it in Python, against the same
  log you plumbed with `awk`. Write in the editor (Tab indents), **Run** to see what it prints,
  **Submit** to run the checks. A failed check tells you what it was checking, never its code,
  and the first pass is worth 30 XP. Your last attempt is still in the editor when you come
  back. Your code runs only in your browser, never on the server.
- Python can run in the browser (#53), ready for code challenges (#54). Pyodide 314.0.7
  (CPython 3.14, like the server) is served from the app itself, so it adds no third-party
  origin. The image fetches that exact release and refuses it if its sha256 doesn't match, which
  adds about 13.5 MB. It loads only when a program is first run, runs in a Web Worker so the page
  never freezes, and a program still running after 5 seconds is stopped. The CSP gains
  `'wasm-unsafe-eval'` and nothing else.
- A database table for flashcard schedules: each learner's SM-2 state per card (ease, interval,
  due date, reviews in a row, lapses), one row per card per learner. The cards themselves stay in
  the lesson files (#51).

### Changed
- The networking unit restores the station's **relay network**, not "the comms array" (#85), so
  "Comms" means one place on the *Meridian*: the fourth deck, Comms, Sensors & Shields. Its badge
  is now "Relays Restored". The relay is the one you met in Unit 1.1.
- Flashcard review is now MERIDIAN's **watch drill** (#82). The station's readout heads each card
  ("WATCH DRILL · 6 ITEMS · FROM: LIFE SUPPORT"), and clearing the day's drill earns a line from
  the crew, rotating by the date. Code challenges now say who's asking: the text-tools one is
  Okafor's.
- The station map is the *Meridian* itself (#78): a pixel-art ship, side on, with each track's
  deck as a section. Life Support is the hull and habitat ring, Cargo & Fabrication the container
  bay, Comms, Sensors & Shields the mast and dish, and Fleet Command the bow. Every unit is a
  compartment that lights up in its deck's colour when complete, pulses when it's ready to
  start, and is shuttered until it has modules. Each section shows its progress. Point at a
  compartment to see conduits from the units that feed it. Units no longer need a `map:`
  position in `syllabus.yml`: they fill their section's compartments in order.
- The desk's computer is now a laptop, and you can close its lid to see the room (#55). The
  screen is exactly where it was, so nothing in the app moves. "Close lid" on the bezel folds the
  lid down onto the keyboard and shows the whole window: the Earth, the docking arm, and any
  window event that's playing, which now shows in full (the aurora was mostly hidden behind the
  old monitor). Click the shut laptop to open it. It's the same page, never reloaded, so your
  scroll position and a half-typed console command are still there. Under reduced motion the
  lid snaps instead of folding, and without JavaScript the laptop just stays open.

### Fixed
- Every unit's story briefing is now shown (#88). All nineteen were written in `syllabus.yml` and
  loaded, but no page ever displayed them. The syllabus shows each one under its unit as a
  transmission in the deck's colour; the station map's tooltips and unit list open with its first
  sentence; and a unit's first module opens with it when the crew isn't briefing you on comms.
- The console no longer asks you to do something no lesson has shown you (#80). The filesystem
  module now teaches reading a file (`cat`, `less`, `head`, `tail`) and moving into a directory,
  both of which its console task already needed. Its task now asks you to read the log, the
  navigating task says how to read Okafor's note, and the users module shows the one-line
  `grep … | cut -d: -f7 > file` its task asks for, ahead of the modules that teach pipes and
  `cut`. A test now fails if any console task needs a command no lesson up to it has taught.
- With your system set to reduce motion, the relay satellite, the debris field and the aurora
  now appear as stills (#56). Since 0.4.0 they kept animating anyway, and the aurora faded in
  and out, so a still never appeared. Only the shuttle was right.

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
