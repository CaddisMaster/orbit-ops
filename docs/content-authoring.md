# Content authoring

How to write curriculum for Orbit Ops. The schema is enforced by `app/content/schema.py`, both
when the app starts and in CI (`tests/test_content.py`), so a broken lesson fails a PR and never
reaches production. Error messages name the file and the field, for example
`core/linux-shell/03-permissions.md: quiz.2.choice.answer: Value error, answer 4 is not an index into the 4 options`.

## Layout

```
content/
  syllabus.yml                        tracks → units, in teaching order, with prerequisites
  <track>/<unit>/NN-<slug>.md         one module: YAML front matter + Markdown lesson
```

- The **directory names must match the slugs** in `syllabus.yml`.
- The filename gives the module's **position** (`NN`, two digits) and its **slug**, which must be
  unique across the whole curriculum. The slug is the module's permanent ID: learner progress is
  stored against it, so **never rename a published module's slug**. Renumbering `NN` is fine.
- A unit listed in the syllabus with no files yet shows as "Coming soon".

## syllabus.yml

```yaml
ranks:                         # rank titles by level band; first at level 1, levels ascending
  - {title: Cadet, level: 1}
  - {title: Technician, level: 3}
tracks:
  - slug: core                 # lowercase-hyphenated
    title: Core Systems
    deck: Life Support         # the station deck this track brings back online
    blurb: One or two sentences.
    units:
      - slug: linux-shell
        title: Linux & the shell
        briefing: Story text for the unit (Markdown).
        prerequisites: []      # unit slugs that must be finished first; no cycles
        emblem: scrubber       # optional: scrubber | script | branch | antenna | reactor
badges:                        # in the order the badges page shows them
  - slug: unit-linux-shell     # permanent ID, stored when earned: never rename an earned badge
    name: Air Scrubbers Online
    description: Complete the unit "Linux & the shell".   # shown even while locked
    emblem: life-support       # life-support | fabrication | fleet | shields | flame | star
    rule: {unit_complete: linux-shell}
```

On the station map each track is a section of the *Meridian* (`art/ship.py`), and its units
fill that section's compartments in syllabus order. Each section has five. A sixth unit in a
track fails `tests/test_station_map.py` until the art gains a compartment for it.

`emblem` is a line-art illustration drawn in the deck's colour on the syllabus and on the unit's
module pages. The set is fixed (`UnitEmblem` in `app/content/schema.py`, drawn in
`app/templates/partials/_unit_emblem.html`); a new one is an SVG added to both. Each track's
colour is in `app/static/css/style.css` under "Decks", keyed by the track slug, so a new track
needs a `.deck--<slug>` line there too.

A badge's `rule` is one of a fixed set, so content picks the rule but cannot run code:

| Rule | Earned when |
|---|---|
| `{unit_complete: <unit slug>}` | every module in that unit is complete (the unit must exist) |
| `{streak: <days>}` | the daily streak reaches that many days (2 or more) |
| `{first_perfect_quiz: true}` | any module is completed with every quiz answer right first time |

Rules are checked after every module completion against everything the learner has done, so a
badge added later is earned at the learner's next completion. Emblems are inline SVGs in
`app/templates/partials/_emblem.html`; adding one means adding it there and to `Emblem` in
`app/content/schema.py`. A new *kind* of rule is code: a model in the schema and a case in
`app/game/badges.py`.

## A module

```markdown
---
title: The filesystem tree
minutes: 15            # 5–30; aim for 15–20 including the quiz
xp: 50                 # optional, default 50; awarded once on completion (+20 for a perfect quiz)
story: |               # the mission-log briefing (Markdown)
  **Mission log, day 1.** …
quiz:                  # 1–8 questions; aim for 3–5
  - type: choice       # exactly one right option
    q: Which directory is the top of the filesystem?
    options: ["/home", "/", "/root", "~"]
    answer: 1          # 0-based index
    explain: Shown after answering, right or wrong.
  - type: multi        # several right options
    q: Which hold data that changes at runtime?
    options: ["/var/log", "/usr/bin", "/tmp", "/etc"]
    answer: [0, 2]
    explain: …
  - type: fill         # typed answer; compared trimmed and case-insensitively
    q: An absolute path starts with which character?
    answer: ["/"]      # every accepted spelling
    explain: …
cards:                 # optional flashcards, reviewed on an SM-2 schedule (#51)
  - id: etc            # a slug, unique in this module; PERMANENT (see below)
    front: What lives in /etc?
    back: System-wide configuration.
---

## Lesson heading

CommonMark plus tables. Fenced code blocks with a language (```bash, ```python,
```yaml, ```text …) are syntax-highlighted.
```

### A code challenge (optional)

A bonus Python exercise, run in the learner's browser by Pyodide (CPython 3.14). It's worth
30 XP the first time it passes, and doesn't gate completion: the quiz does that.

```yaml
challenge:
  from: okafor           # optional: the cast member asking, shown as "Okafor asks:" (#82)
  task: |-               # Markdown: what to write, and what it's given
    `log` holds the docking log. Finish `failed_logins(log)` …
  inputs: {log: /var/log/docking/access.log}   # optional: variables preset from THIS
                                               # module's console files, so the data is the same
  starter: |-            # what the editor opens with; it must FAIL a check
    def failed_logins(log):
        ...
  checks:                # run after the learner's code, in the same namespace
    - check: assert failed_logins(log) == 14   # a statement; passes if it raises nothing
      says: It finds MERIDIAN's 14 failed logins in the real log.   # shown on failure, never the code
  solution: |-           # CI runs it in CPython and requires every check to pass; never sent to the page
    …
```

- **Write a check for the shortcut, not just the answer.** A naive solution should fail at least
  one check, and its `says` should teach why (the text-tools challenge catches `'401' in line`).
- **Give it someone who wants it done.** A challenge is a job a crew member would rather have
  scripted than done by hand, so name them with `from:` and write the task in that spirit. The
  text-tools one, "check MERIDIAN's arithmetic", is the model.
- **`says` is the hint.** It's all a learner sees of a failed check, so say what's being checked.
- **Numbers the crew quotes must be true.** If a check or the task repeats a comms figure, a test
  should hold them together (`tests/test_challenge.py` does it for text-tools).
- The checks reach the page (the browser runs them), so a determined learner can read them.
  That's the trade for never running learner code on the server.

### Flashcards

In the story, review is **MERIDIAN's watch drill** (#82). MERIDIAN's readout heads it, and when
the day's drill is cleared, one line from `drill.cleared` in `syllabus.yml` is said. It's picked
by the date, so add lines freely: more lines, less repetition.

A module's cards join the learner's review queue (`/review`) once the module is complete. The
front and back are inline Markdown. Each review is scheduled with SM-2 and stored against
`<module-slug>/<id>`. That makes the **`id` permanent, like a module's slug**: reword a card
freely and its schedule carries on, but rename the `id` and the card starts again as new (the
old schedule is ignored, not deleted). Aim for three cards a module, each one fact you'd want in
a week's time, not a summary of the lesson.

### A terminal exercise (optional)

A module can carry a task for the **station console**, a shell simulated in the browser over a
filesystem the module defines. It sits between the lesson and the quiz.

```yaml
terminal:
  task: |                     # what Okafor asks for (Markdown)
    Make `scrubber.conf` **readable and writable by you only**.
  cwd: /station/life-support  # where the console starts; also $HOME, so plain `cd` returns here
  user: cadet                 # optional; default cadet, group crew
  files:                      # the starting filesystem
    - {path: /station, type: dir}            # list a directory to own it
    - {path: /station/life-support, type: dir}
    - path: /station/life-support/scrubber.conf
      mode: "644"             # a quoted octal string; default 644 for files, 755 for dirs
      contents: |
        override_code = 7731
  checks:                     # all must pass; up to 10
    - {mode: /station/life-support/scrubber.conf, equals: "600"}
  success: Okafor nods.       # printed when every check passes
  solution:                   # required: commands that complete the task (never sent to the browser)
    - chmod 600 scrubber.conf
```

**Every module in a shell-based unit has a console task**, unless a comment at the top of its
front matter says why not. In Unit 1.1 that's only 10 (packages): a fake apt would teach the
command names and nothing that matters.

Optional fields for users, processes and the environment (#37):

```yaml
  groups: [sudo]              # the user's supplementary groups
  password: meridian          # sudo's password; in-story and shown in the task, not a secret
  accounts:                   # more lines for /etc/passwd (service accounts)
    - {name: airlock, uid: 990, comment: Airlock controller, home: /var/lib/airlock}
  processes:                  # running when the console starts
    - {command: o2-diagnostics --deep-scan, cpu: 98.7, ignores: [TERM]}   # user defaults to yours
  env: {EDITOR: nano}         # extra exported variables (PATH may be overridden here)
```

Sizes, dates, links, the disk and memory (#67):

```yaml
  disk: {size: 2G, base: "1.5G"}   # for df; base is what the OS uses outside your files (default 20G / 4.2G)
  memory: {total: 1G, used: 300M, cache: 200M}   # for free (default 2G / 820M / 640M, shared 12M)
  files:
    - {path: /var/log/o2/scrubber.log, contents: "sample\n", size: 48M, mtime: "2026-09-20 03:00"}
    - {path: /station/current.log, type: link, target: /var/log/o2/2026-10-10.log}
```

- **`size`** (bytes, or `K`/`M`/`G`, powers of 1024) makes a big file without writing it out:
  `contents` is a sample for `cat`, and `ls`, `du`, `df`, `find -size` and `tar` see the size.
  Writing over the file replaces it (so `> big.log` frees the space), and appending adds to it.
- **`mtime`** dates a file on the **station's clock**, which starts at 2026-10-08 09:00
  (`STATION_NOW` in `app/content/schema.py`, `START_TIME` in `shell.js`; a test holds them
  equal). It can't be later. Ages for `find -mtime` and `max_age` count back from it, so a file
  dated 2026-09-20 is 18 days old for every learner, whatever today's date.
- **`type: link`** with a `target` (stored as written, so a relative target is relative to the
  link's directory). Dangling targets are allowed.

`/etc/passwd`, `/etc/group` and `/root` are generated from these unless you list them yourself.
Known groups keep their usual GIDs (`sudo` 27, `docker` 998); your primary group is 1000.

- **Files you don't own are read-only to the learner.** The shell enforces permissions as a
  normal user with umask `002`. A directory you don't list exists anyway, owned by `root` with
  mode `755`, so the learner can't create files in it. List every directory they need to write
  to.
- **Checks:** `{mode: P, equals: "600"}`, `{owner: P, user: u, group: g}`, `{exists: P, type: file|dir}`,
  `{missing: P}`, `{contains: P, text: "…"}`, `{cwd: P}` (the console must end in directory
  P, for navigation tasks), and for processes `{running: NAME}`, `{stopped: NAME}` and
  `{signalled: NAME, with: TERM}` (NAME is the program's file name, as `ps` shows it; `stopped`
  and `signalled` must name a starting process). For files on disk (#67): `{symlink: P, target:
  T}` (a link at P pointing at exactly T, as written) and `{files_under: DIR, name: "*.gz",
  max_size: 50M, max_age: 30}` (every file below DIR whose name matches, if `name` is given, is at
  most that big and changed at most that many days ago; it needs `max_size`, `max_age` or both,
  and passes when nothing matches, so it reads "nothing in /var/log is over 50M"). `mode`, `owner` and `missing` must name a path in the starting
  filesystem, and `cwd` a directory in it, or validation fails naming the check; `exists` and
  `contains` may name something the learner creates, and so may `symlink`. `files_under` must
  name a starting directory.
- **The `solution` is proven in CI.** `tests/js/solutions.test.js` runs it through the real
  shell and requires the task unsolved before and solved after, with no step needing an unknown
  command (a step may fail on purpose). Node can't read YAML, so after changing any `terminal:`
  block run `docker compose exec -u "$(id -u):$(id -g)" web python -m scripts.export_exercises`
  and commit `tests/js/fixtures/exercises.json`; a test fails while it's stale.
- **What the console knows** (`help` lists it):
  - files: `pwd cd (incl. cd -) ls (-l -a -h -d) cat echo touch mkdir (-p) rmdir cp (-r) mv
    rm (-r -f) chmod (octal and symbolic, -R) chown`
  - text: `grep (-i -v -n -c -q) wc sort uniq head tail cut tee`, and small `awk` and `sed`:
    - awk: `-F SEP`; `pattern { print … }` rules with `BEGIN`/`END`; patterns of `/re/`,
      comparisons (numeric when both sides are numbers), `~ !~ ! && ||`; `print` of `$0`, `$N`,
      `$NF`, `NF`, `NR`, strings and concatenation. No variables, arithmetic, `printf` or arrays.
    - sed: `-n -e -E -i[SUFFIX]`; `s/RE/REPL/[gpI]` (with `&` and `\1`…), `p`, `d`, `q`;
      addresses `N`, `$`, `/re/` and ranges. Basic regexes by default, as GNU sed.
    - Anything outside the subset is refused with "unsupported on the station console".
  - users: `whoami id [user] groups getent sudo (-l -i -u -k) usermod (-aG / -G)`. sudo asks
    for the password through a masked prompt and remembers it for 15 simulated minutes; it
    checks `/etc/group` live, while `id` with no name shows the login's groups (changes apply
    at the next login, as on a real system).
  - environment: `export unset env printenv type (-a) which command -v source bash -c`, plus
    `VAR=x` and `VAR=x cmd`. Child shells see only exported variables. Commands are found on
    `$PATH`: an executable file in the exercise wins over the console's own commands, which
    live in `/usr/bin` and `/bin`; `./script` runs a file (it needs `x`).
  - editing and reading (#66): `nano FILE` opens an editor in the panel (^O then Enter writes,
    ^X exits and asks about unsaved changes, ^K/^U cut and paste a line; Esc then Tab leaves the
    textarea), and saving obeys permissions. `man [5] CMD` and `less FILE` / `CMD | less` open a
    pager (Space, b, j/k, g/G, /pattern, n/N, q); into a pipe they print plain text. `CMD --help`
    and `help BUILTIN` work too. Pages live in `app/static/js/manual.js`: **a command added to
    the console needs a page or a `help` entry** (a test checks every command `help` lists).
    `vi`/`vim` point at nano. `crontab -l -e -r` and `crontab FILE|-` keep the table at
    `/var/spool/cron/crontabs/<user>` (root's spool, mode 1730: `cat` can't read it, as on a
    real system, but a task's `contains` check can). It's checked as cron loads it (`bad
    minute`, `bad day-of-week`, …) and refused if wrong. Nothing runs on a schedule.
  - disk (#67): `find PATH… [EXPR]` (`-name -iname -path -type f|d|l -size [+-]N[ckMG] -mtime
    -mmin -newer -empty -user`, `! -not -a -o ( )`, `-maxdepth -mindepth`, `-print -delete -exec
    cmd {} \;` and `+`; sorted output, never following links), `du (-s -h -a -c -d N
    --max-depth=N)` in whole 4K blocks, `df (-h)` (one drive, `/dev/vda1` on `/`), `free (-h -m)`,
    `tar` (`-c -x -t -z -v -f -C`, bundled or not: archives are simulated, a text file recording
    what's in it, capped at 20 KB of text so the state still reaches the server), `gzip (-d -k)`,
    `gunzip (-k)`, `zcat`, `ln -s (-f -n -v)` (no hard links), `readlink (-f)`. Paths resolve
    through symlinks everywhere; `rm`, `mv`, `ls -l`, `find` and `test -L` act on the link
    itself, and `cd` through a link lands in the real directory (as `cd -P`).
  - processes: `ps (aux, -ef, --sort) pgrep (-a -f -l -u) pkill kill (-9, -TERM, -s, %job)
    sleep jobs fg bg`, `cmd &`, `$!`. Time is simulated: a second per command, and a
    foreground `sleep N` jumps N.
  - syntax: globs, `{a,b}`, `{1..9}`, pipes, `> >> < 2> 2>&1 >&2 &>` (applied left to right,
    as in bash), `; && || &`, `$?`, `$1…$9`, `$#`, `"$@"` (one word per argument), `$(cmd)` and
    backticks (unquoted results are split on `$IFS`), `$((…))` (integers: `+ - * / % **`,
    comparisons, `&& || !`, `?:`; a leading 0 is octal), `${x:-def} ${x:=def} ${x:+alt} ${x:?msg}
    ${#x} ${x%pat} ${x%%pat} ${x#pat} ${x##pat}`.
  - control flow (#64): `if/elif/else/fi`, `for x in …` (and `for x` over `"$@"`),
    `while`/`until`, `break [n]`/`continue [n]`, `case … in pat|pat) … ;; esac` (glob
    patterns), `{ …; }`, `( … )` subshells, `!`, and redirection on any of them (`done <
    file`, `fi > out`, `… done | sort`). Tests: `test`/`[ ]` (strings, `-eq`… integers, `-e -f -d
    -r -w -x -s -z -n`, `! -a -o ( )`, with bash's own error messages) and `[[ ]]` (`&& || ! ( )`,
    `==` against a glob, no word splitting). `read [-r] [-s] [-p prompt] names…` reads standard
    input, split on `$IFS` (`while IFS=, read -r a b`); at the prompt it reads the keyboard, and
    so does a script started there. A command can span lines: at the prompt an unfinished one
    continues on a `> ` line, so a multi-line `solution:` is typed a line at a time. A loop that
    runs 10,000 commands is stopped. Refused with "unsupported on the station console": functions,
    heredocs and `<<<` (#65), `(( ))`, `for ((…))`, `++`/assignment inside `$(( ))`, `[[ =~ ]]`,
    arrays and `select`.

  Anything else prints "command not found". Not yet: `set`, `printf`, `stat`, `top`. Don't set a task that needs more: add the
  command to `app/static/js/shell.js` first, with a test in `tests/js/`.
- **`~` in the prompt** appears only when `cwd` is `/home/<user>`; otherwise the prompt shows
  the path. Starting in `/home/cadet` (listed as a directory) makes the console feel like a
  real login.
- **Still open the module and do it yourself** before merging: CI proves the solution works,
  not that the task reads well.

### Comms: the crew's messages (optional)

A module can send messages to the comms log on the desk's laptop, at three beats: `open`
(the briefing, on the first visit; it replaces the italic `story` on the page), `console_done`
(the first time its console task passes) and `complete` (the debrief). A beat can also play a
window event outside the desk's window.

```yaml
comms:
  open:
    - {from: meridian, text: "ALERT · `scrubber.conf` · MODE 644"}
    - {from: okafor, text: "Cadet. Someone left the override code where **everyone** can read it."}
  console_done:
    - {from: okafor, text: "That's the one."}
  complete:
    - {from: mission, text: "Supply shuttle *Kestrel* on final approach."}
  window: {complete: shuttle-dock}     # any beat; the set: shuttle-dock, relay-pass, debris-drift, aurora
```

- `from` is a slug from `cast:` in `syllabus.yml` (Okafor, MERIDIAN, Mission Control), or
  validation fails naming the file and the character. `text` is inline Markdown.
- `console_done` needs a `terminal:` exercise in the same module.
- A window event plays once, when its beat happens: `open` on the first visit, `console_done`
  with the console's first pass, `complete` with the completing answer. Unit 1.1 uses
  `relay-pass` (02 open), `shuttle-dock` (04 complete), `debris-drift` (06 open) and `aurora`
  (10 complete, the end of the unit).
- **If MERIDIAN quotes a number** (CPU, attempts, a time), it must be true of the exercise:
  `test_the_stations_figures_match_the_exercises` checks Unit 1.1's.
- ⚠️ **Quote any `text` with a comma** when using the `{from: …, text: …}` form: YAML splits an
  unquoted `text: Good, now go` at the comma.
- Write like chat, not like a lesson: a sentence or two per message, three or four messages a
  beat. MERIDIAN speaks in terse status lines with `·` separators.
- The log is rebuilt from progress on every page, in the order modules were completed, so
  editing a module's comms changes what everyone sees in their history too.

The cast is declared in `syllabus.yml`:

```yaml
cast:
  - {slug: okafor, name: Okafor, role: Chief Engineer, avatar: okafor}
  - {slug: mission, name: Mission Control, role: Earth, avatar: mission, delay: "1.3 s"}  # light-delay stamp
```

A new character needs an avatar sprite in `art/sprites.py` (and its name in `Avatar` in
`app/content/schema.py`); a new window event needs a sprite in `art/sprites.py`, its entry in
`WINDOW_SPRITES` (`app/comms.py`), its name in `WindowEvent`, and a rule plus keyframes in
`style.css` whose `left`/`top` also make a sensible still for reduced motion. The art is code: change it in `art/`, run
`docker compose exec -u "$(id -u):$(id -g)" web python -m art.build`, and commit both
(`tests/test_art.py` fails if the PNGs and the scripts disagree).

Raw HTML in lessons is **disabled**: it renders as literal text. Use Markdown.

Formatting inside a code block is literal, so `*word*` in a ```text diagram shows the asterisks.

## Writing guidelines

- **15–20 minutes, all in.** About 500–900 words of lesson, a quiz of 3–5 questions, and a
  "Try it" section with commands to run.
- **One idea per module.** If you need a second big heading that isn't about the first idea,
  that's the next module.
- **Open with the story, then teach for real.** The station story frames the lesson but never
  replaces the technical content.
- **Tie it to something real.** Point at Budget Buddy's or Orbit Ops's own setup when it
  illustrates the point (the RUNBOOKs are full of examples).
- **Quiz the idea, not the trivia.** Every `explain` should teach something, including why the
  wrong options are wrong when that's useful.
- **Fact-check AI drafts like code.** A drafted module is a starting point, not a source.
  Run every command in "Try it" yourself before merging.
