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
  - type: choice       # a scenario: something to read, then the question (#68)
    q: Saving fails. What went wrong, and what now?
    code: |-           # optional, any type: a block under `q`, as a fenced block renders
      [ Error writing /etc/nginx/nginx.conf: Permission denied ]
    lang: text         # optional, default text: bash, python, yaml … for highlighting
    options: […]
    answer: 0
    explain: …
cards:                 # optional flashcards, reviewed on an SM-2 schedule (#51)
  - id: etc            # a slug, unique in this module; PERMANENT (see below)
    section: "The directories you'll use most"   # the lesson heading it's about (#104)
    accept: ["/etc"]   # optional: exact answers that mark a typed answer matched
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

### A lab (optional)

Work done on the learner's **own machine** (real `git` from Unit 1.3, later Docker and a
cluster), checked by what they paste back (#121). The server never runs anything; it reads the
text. It's worth 40 XP the first time it passes, and doesn't gate completion: the quiz does that.

```yaml
lab:
  from: okafor             # optional: the cast member asking, shown as "Okafor asks:"
  task: |-                 # Markdown: what to do, step by step
    Put `airmix.conf` under version control in two commits …
  setup: |-                # optional: a shell snippet that builds a known starting point.
    mkdir -p ~/meridian && cd ~/meridian   # shown to copy; it must run as-is in ubuntu:24.04
  boxes:                   # 1–4 paste boxes, each with its own checks
    - prompt: The output of `git log --oneline`.      # Markdown
      checks:
        - {lines: {min: 2, max: 2}, says: "Two commits", hint: "Did the second commit happen?"}
        - {regex: '^[0-9a-f]{7,} ', says: "Short hashes from git log --oneline"}
        - {contains: "Track airmix.conf", says: "The first commit's message"}
        - {not_contains: "Untracked files", says: "Nothing left untracked"}
      example: |           # a REAL run's output, pasted. CI requires it to pass every check;
        3f1c2ab Set the O2 floor to 19.5%                # never sent to the page
        9e0d1f7 Track airmix.conf
```

- **Checks never depend on what differs between machines.** Hashes, dates, times, usernames,
  hostnames, paths under `$HOME` and git's default branch name all vary, which is why there is
  no exact-match check. Match the shape (`^[0-9a-f]{7,} `), or text the task fixed (a commit
  message the steps dictate, a file the `setup` created).
- **`contains` is case-sensitive; `regex` is Python `re` with `MULTILINE`** (`^`/`$` at each
  line). `lines` counts non-blank lines. A Windows paste's `\r\n` is read as `\n`.
- **`says` is listed after every submit**, passed or failed, so write it as what's being
  checked. **`hint` shows only on a failure**: make it the likely mistake ("did the merge
  fast-forward?"), never the answer.
- **The `example` comes from a real run**, the steps followed in `ubuntu:24.04` as a sudo-capable
  non-root user, with output pasted, not written from memory. If a check fails it, the check
  or the steps are wrong.
- ⚠️ **Quote `says` and `hint`** in the `{…}` form. A flow mapping breaks on a `?`, a `,` or a
  `: ` in unquoted text (`hint: Did it happen?}` is a YAML error), the same trap as comms `text`.
- `comms.lab_done` (below) is the crew's reply to the first pass.

**Claude's review (optional, #122).** For work a check can't judge (are the commit messages any
good, is the Dockerfile sensible?), add a rubric and Claude reviews the lab once it passes:

```yaml
lab:
  ai_review: true
  rubric:                  # 1–8 lines, each one thing good work does; required with ai_review
    - Each commit subject says what the change does, in the imperative.
    - The body says why, not what the diff already shows.
  boxes: …
```

- The checks still decide pass or fail. The review is feedback and a bonus of `round(score/5)`
  XP, at most 20, once per lab. It runs on Sonnet 5.5 through the app's budget-checked key, so
  without a key or budget the lab passes and the review waits ("Ask Claude for a review").
- Write the rubric as what good looks like, not as a checklist the checks already cover. The
  model is told to judge only the rubric.
- Keep it to labs whose work has a quality to judge. Most labs don't need one.

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

Each card says where it's from (#104): its unit and module, and its **`section:`**, the `##` or
`###` heading it's about, **exactly as written** after the hashes (backticks and all, in YAML
double quotes). The card links straight to that heading. Every card has one. A section that
isn't a heading in the lesson stops the content loading, naming the file and the card, so
renaming a heading means updating its cards.

On review the learner can type an answer before seeing the back, and it's shown beside it.
Grading stays theirs. **`accept:`** lists exact answers, compared with spaces collapsed but case
kept, and a typed one is marked *matched* with Good preselected. Use it only when there is one
right string (`git reflog`, `*/15 * * * *`), never for a back that's a sentence, and include
the obvious variants (`apt-cache policy nginx`, `apt policy nginx`). A near miss isn't marked
wrong, just not matched.

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

The station network (#164). Every console has one; without `network:` it is the default below
(`NetworkSpec` in `app/content/schema.py`, `DEFAULT_NETWORK` in `shell.js`, a test holds them equal):

```yaml
  network:
    interfaces: [{name: eth0, address: 10.4.0.12/24}]   # the default; lo is always there too
    gateway: 10.4.0.1           # the default route (null: none, so off-subnet is unreachable)
    listening:                  # the console's own sockets; sshd on 22 is always there
      - {port: 8080, process: python3}                    # tcp, on 0.0.0.0, by default
      - {port: 5000, process: telemetry, address: 127.0.0.1}   # this machine only
    connections:                # established TCP, shown by ss -tn
      - {process: psql, remote: "10.4.0.20:5432"}         # out: the local port is ephemeral
      - {process: sshd, remote: "10.4.0.5:51234", local_port: 22}   # in, to a listener
    hosts:
      - {name: db, address: 10.4.0.20, services: [{port: 5432}], filtered: [2222]}
      - {name: beacon, address: 10.4.0.30, ping: false, services: [{port: 22}]}  # up, drops ping
      - {name: md-3, address: 10.4.2.17, up: false}      # down: nothing answers
    dns:                        # #165: what the station's resolver answers
      server: 10.4.0.1          # the default is the gateway (null); /etc/resolv.conf names it
      records:                  # ttl: 300 unless given
        - {name: relay.depot-sync.net, value: 203.0.113.47}              # type A by default
        - {name: www.depot-sync.net, type: CNAME, value: relay.depot-sync.net}
        - {name: depot-sync.net, type: MX, value: "10 mail.depot-sync.net"}
        - {name: depot-sync.net, type: TXT, value: "v=spf1 mx -all"}
        - {name: 47.113.0.203.in-addr.arpa, type: PTR, value: relay.depot-sync.net}
    firewall:                   # #166: ufw, off by default as on a fresh server
      enabled: true
      rules:                    # in order: the first that matches decides
        - {port: 22, proto: tcp}                  # ufw allow 22/tcp
        - {from: 10.4.0.5, port: 8080, proto: tcp}  # ufw allow from 10.4.0.5 to any port 8080 proto tcp
```

HTTP and logging in elsewhere (#166) hang off the same block:

```yaml
    listening:
      - port: 8080
        process: python3
        http:                   # what curl gets from the console's own server
          - {path: /, headers: {Content-Type: text/html}, body: "<h1>relay</h1>\n"}
    hosts:
      - name: relay
        address: 203.0.113.47
        services:
          - port: 443
            tls: trusted        # https: trusted, or expired (curl -v shows which; curl fails with 60)
            http:
              - {path: /status, headers: {Content-Type: application/json}, body: "{\"ok\":true}\n"}
              - {path: /report, method: POST, status: 201}   # status 200 and GET by default
              - {path: /old, status: 301, headers: {Location: "https://relay.depot-sync.net/status"}}
      - {name: mission, address: 10.4.0.5, login: true, services: [{port: 22}]}   # ssh mission.… 'CMD' works
```

- **Addresses are private (`10/8`, `172.16/12`, `192.168/16`) or documentation ranges
  (`203.0.113.0/24` for "outside"), never a real machine's.** The loader refuses anything else.
- A socket's **`process` must be one of `processes:`** (by the name `ps` shows) or `sshd`. `ss -p`
  then shows that process's real PID, killing it closes its sockets, and only root sees which
  process holds a socket that isn't the learner's, as on a real server: a root-owned culprit
  needs `sudo ss -tnp`.
- What a host answers: a `services` port succeeds; a `filtered` port times out; any other port
  is refused. A host that's `up: false`, or an address no host has, answers nothing. On the
  console's subnet that's "No route to host" / "Destination Host Unreachable"; beyond the
  gateway it's silence and a timeout.
- **Names (#165) come from `/etc/hosts`, then DNS**, as `nsswitch.conf`'s `hosts: files dns`
  says. `getent`, `ping` and `nc` go through both; `dig` and `host` ask the resolver only, so a
  name pinned in `/etc/hosts` gives different answers to the two, which is the lesson's trap.
  A host's `name` is **not** in DNS on its own: add a record if it should resolve. A name with
  no record is NXDOMAIN; a CNAME is followed; an MX answer brings its exchange's A record.
  PTR records are written in the reverse form, and ping names its replies from them.
- `/etc/hosts` (a fresh Ubuntu server's, with `meridian` on 127.0.1.1) and `/etc/resolv.conf`
  (`nameserver` + the resolver) are in every console unless you list them, and both are read
  live: edit one and the answers change. The resolver answers unless its host is listed as
  `up: false`; any other host answers DNS only if it has `services: [{port: 53, proto: udp}]`,
  and refuses otherwise. Waiting costs station time: 5 s per timed-out try (dig tries 3 times,
  host and getaddrinfo twice).

- **HTTP (#166):** a service or listener with `http` routes is a web server. A path it doesn't list
  is its `404` (`Not Found`), another method on a listed path is `405`, and a port with no
  `http` gives curl's `(52) Empty reply from server`. Responses carry the route's headers and a
  `Content-Length`, nothing more. `https://` needs `tls`; by address instead of name it fails
  as a real certificate would.
- **The firewall is ufw's own files:** `firewall:` becomes `/etc/ufw/ufw.conf` (`ENABLED=yes|no`)
  and `/etc/ufw/user.rules` (one `### tuple ###` line per rule), written byte for byte as ufw
  0.36.2 writes them, and the console reads them live. **Grade a firewall task with `contains`
  on those files**: `ufw allow from 10.4.0.5 to any port 8080 proto tcp` writes
  `### tuple ### allow tcp 8080 0.0.0.0/0 any 10.4.0.5 in`. The rules file is root's (640), so a
  learner needs `sudo cat`. Rules only touch connections *into* the console from another host;
  anything denied is dropped, so it times out. Ping always gets in.
- **From another host:** `ssh HOST 'COMMAND'` runs one command on a host with `login: true` (by
  a name DNS knows, or its address), and only `nc`, `curl`, `ping`, `hostname`, `echo`, `true`
  and `false` exist there. From there the console is its interface address behind its firewall,
  names come from DNS (not the console's `/etc/hosts`), and other hosts answer as their specs
  say. Any other host refuses with `Permission denied (publickey)`.

`/etc/passwd`, `/etc/group`, `/etc/hosts`, `/etc/resolv.conf`, `/etc/ufw/{ufw.conf,user.rules,user6.rules}` and `/root` are generated from these unless you list them yourself.
Known groups keep their usual GIDs (`sudo` 27, `docker` 998); your primary group is 1000.

- **Files you don't own are read-only to the learner.** The shell enforces permissions as a
  normal user with umask `002`. A directory you don't list exists anyway, owned by `root` with
  mode `755`, so the learner can't create files in it. List every directory they need to write
  to.
- **Checks:** `{mode: P, equals: "600"}`, `{owner: P, user: u, group: g}`, `{exists: P, type: file|dir}`,
  `{missing: P}`, `{executable: P}` (a file its owner can run: the owner's x bit, whatever
  the rest of the mode, so `chmod +x`, `u+x` and `755` all pass; #70), `{contains: P, text: "…"}`, `{cwd: P}` (the console must end in directory
  P, for navigation tasks), and for processes `{running: NAME}`, `{stopped: NAME}` and
  `{signalled: NAME, with: TERM}` (NAME is the program's file name, as `ps` shows it; `stopped`
  and `signalled` must name a starting process). For files on disk (#67): `{symlink: P, target:
  T}` (a link at P pointing at exactly T, as written) and `{files_under: DIR, name: "*.gz",
  max_size: 50M, max_age: 30}` (every file below DIR whose name matches, if `name` is given, is at
  most that big and changed at most that many days ago; it needs `max_size`, `max_age` or both,
  and passes when nothing matches, so it reads "nothing in /var/log is over 50M"). `mode`, `owner` and `missing` must name a path in the starting
  filesystem, and `cwd` a directory in it, or validation fails naming the check; `exists` and
  `contains` may name something the learner creates, and so may `symlink` and `executable`. `files_under` must
  name a starting directory.
- **The `solution` is proven in CI.** `tests/js/solutions.test.js` runs it through the real
  shell and requires the task unsolved before and solved after, with no step needing an unknown
  command (a step may fail on purpose). Node can't read YAML, so after changing any `terminal:`
  block run `docker compose exec -u "$(id -u):$(id -g)" web python -m scripts.export_exercises`
  and commit `tests/js/fixtures/exercises.json`; a test fails while it's stale.
- **What the console knows** (`help` lists it):
  - files: `pwd cd (incl. cd -) ls (-l -a -h -d) cat echo touch mkdir (-p) rmdir cp (-r -i) mv
    (-i -f) rm (-r -f -i) chmod (octal and symbolic, -R) chown`. `-i` asks in GNU's words
    (`rm: remove regular file 'a.log'? `), and the last of `-f`/`-i` wins, as in coreutils.
  - text: `grep (-i -v -n -c -q -E) wc sort uniq head tail cut tee`, and small `awk` and `sed`:
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
    `vi`/`vim` point at nano. An exercise can give its own program a manual: a file at
    `/usr/share/man/man8/scrubberd.8` (plain text, already laid out as man prints it) is what
    `man scrubberd` shows. With no section, `man` searches 1, 8, 3, 2, 5, 4, 6, 7, as man-db
    does, and the console's own page wins within a section. `crontab -l -e -r` and `crontab FILE|-` keep the table at
    `/var/spool/cron/crontabs/<user>` (root's spool, mode 1730: `cat` can't read it, as on a
    real system, but a task's `contains` check can). It's checked as cron loads it (`bad
    minute`, `bad day-of-week`, …) and refused if wrong, as classic cron and cronie do. ⚠️
    Ubuntu 24.04's `crontab` (3.0pl1-184ubuntu2) checks none of the time fields (`61`, even
    `abc`, installs and never runs), and its jobs inherit the cron service's PATH (`cron -P`)
    instead of `/usr/bin:/bin`, so a lesson mustn't say a real crontab refuses a bad time. Nothing
    runs on a schedule.
  - disk (#67): `find PATH… [EXPR]` (`-name -iname -path -type f|d|l -size [+-]N[ckMG] -mtime
    -mmin -newer -empty -user`, `! -not -a -o ( )`, `-maxdepth -mindepth`, `-print -delete -exec
    cmd {} \;` and `+`; sorted output, never following links), `du (-s -h -a -c -d N
    --max-depth=N)` in whole 4K blocks, `df (-h)` (one drive, `/dev/vda1` on `/`), `free (-h -m)`,
    `tar` (`-c -x -t -z -v -f -C`, bundled or not: archives are simulated, a text file recording
    what's in it, capped at 20 KB of text so the state still reaches the server), `gzip (-d -k)`,
    `gunzip (-k)`, `zcat`, `ln -s (-f -n -v)` (no hard links), `readlink (-f)`. Paths resolve
    through symlinks everywhere; `rm`, `mv`, `ls -l`, `find` and `test -L` act on the link
    itself, and `cd` through a link lands in the real directory (as `cd -P`).
  - network (#164): `ip` (`addr`, `link`, `route`, `route get ADDR`, any abbreviation; `-4 -6
    -br`), `ss` (`-t -u -l -a -n -p -4 -6 -H`, combined as `-tulpn`; no filters, and no Unix
    sockets, so no `-t`/`-u` means both), `ping -c N (-q -W)` (a count is required: the console
    can't run until Ctrl-C), `nc -z (-v -w N -n) HOST PORT[-PORT]…` (TCP only, all on stderr as
    Debian's is, success printed even without `-v`), `hostname (-I -i -s -f)`, and for names (#165) `dig NAME [TYPE]
    (+short, -x ADDR, -t TYPE, @SERVER)` (A, CNAME, MX, TXT, PTR and SOA; AAAA and NS are always
    empty), `host [-t TYPE] NAME [SERVER]` and `getent hosts [NAME|ADDR]…`; for HTTP (#166) `curl` (`-v -s -S
    -I -i -L -f -k -o FILE -w FMT -X M -H H -d D -m N --connect-timeout N`; no progress meter,
    `-w` knows `%{http_code} %{url_effective} %{remote_ip} %{num_redirects} %{content_type}`);
    `ufw` (`status [verbose|numbered]`, `enable` (asks y/n), `disable`, `allow`/`deny PORT[/PROTO]`
    and `from ADDR [to any port PORT [proto P]]`, `delete RULE|NUM`; root only); and `ssh HOST
    'COMMAND'`. Output is
    Ubuntu 24.04's (dig and host as BIND 9.18's against a bind9 resolver, curl 8.5.0's, ufw 0.36.2's), column for column (`ss` as when piped, which is how it sizes columns without
    a terminal). Round-trip times are made up but fixed. Waiting is station time: `nc` without
    `-w` on a filtered port takes 2 min 14 s, as the kernel's retries do.
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
    runs 10,000 commands is stopped. Refused with "unsupported on the station console": `(( ))`,
    `for ((…))`, `++`/assignment inside `$(( ))`, `[[ =~ ]]`, `ERR` traps, arrays and `select`.
  - robust scripts (#65): functions (`name() { …; }`, `function name { …; }`) with `local`,
    `return N`, their own `$1… $# "$@"`, `shift` and `$FUNCNAME`; a child script doesn't see
    its parent's, and `source lib.sh` brings a library's in. `set -e -u -x -o pipefail` (and
    `set -euo pipefail`, `set --`, `set -o`), with bash's `-e` exceptions: not in an
    if/while/until test, not left of `&&`/`||`, not after `!`, not for `{ …; }` whose failure was
    one of those (but a *function* that fails does stop it), and `$( )` doesn't inherit it. In a
    script, `set -u` errors name the file and line (`./s.sh: line 4: X: unbound variable`). `trap
    'cmds' EXIT` runs on a normal end, `exit N`, a `set -e` failure and an unbound variable; Ctrl-C
    runs INT then EXIT. Here-documents `<<EOF`, `<<'EOF'` (literal) and `<<-EOF` (tabs
    stripped), here-strings `<<<`, and `mktemp [-d] [TEMPLATE]` (600 / 700, in `/tmp`). At the
    prompt a `set -e` failure prints `logout` and a note, since the console can't close.

  Anything else prints "command not found". Not yet: `set`, `printf`, `stat`, `top`. Don't set a task that needs more: add the
  command to `app/static/js/shell.js` first, with a test in `tests/js/`.
- **`~` in the prompt** appears only when `cwd` is `/home/<user>`; otherwise the prompt shows
  the path. Starting in `/home/cadet` (listed as a directory) makes the console feel like a
  real login.
- **The lesson must say what the task needs, plainly** (#101). Every command the solution uses
  has to appear in the lesson's prose or a table, in this module or an earlier one: a code
  block's comment or the Try it doesn't count (`tests/test_content.py` checks it). The ideas
  behind the commands ("the last argument is the destination", "`..` needs its slash", "check
  that TERM worked") are listed per module in `NEEDS` in `tests/test_lesson_needs.py`, with the
  words the lesson uses for each. A new module with a console task or a lab adds its entry. Point the
  task at the right section if it helps, but don't hand over the answer: an example in the
  lesson should use a different file or directory from the task's.
- **Say when the console lacks something.** A lesson section that mentions a key or command
  the console doesn't have (Ctrl-R, `tail -f`, `top`, nano's ^W, …: `CONSOLE_LACKS` in the
  same test) must say "station console" in that section, so nobody tries it there and wonders
  why.
- **Still open the module and do it yourself** before merging: CI proves the solution works,
  not that the task reads well.

### Comms: the crew's messages (optional)

A module can send messages to the comms log on the desk's laptop, at four beats: `open`
(the briefing, on the first visit; it replaces the italic `story` on the page), `console_done`
(the first time its console task passes), `lab_done` (the first time its lab passes) and
`complete` (the debrief). A beat can also play a
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
- `console_done` needs a `terminal:` exercise in the same module, and `lab_done` a `lab:`.
- A window event plays once, when its beat happens: `open` on the first visit, `console_done`
  with the console's first pass, `lab_done` with the lab's, `complete` with the completing answer. Unit 1.1 uses
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

**The Life Support mystery** (#84) runs through Units 1.1–1.5: why the station went dark.
`docs/story.md` has the answer, and for each unit the clue, the module and the command that
finds it. Read it before writing a Life Support unit. Each clue is found with that unit's own
tools, never just told.

**Promotions and commendations** speak too (#83). A rank in `syllabus.yml` can have `comms:`,
said when the learner first reaches it. Climbing back after a hint's cost dips them below
doesn't count again. A badge can have `comms:` for when it's earned. A badge without any gets
MERIDIAN's `COMMENDATION LOGGED · <NAME>`, so give one its own line only when it's worth more
than the readout.

```yaml
ranks:
  - title: Technician
    level: 3
    comms:
      - {from: okafor, text: "Technician. It means I stop checking everything you touch. Most of it."}
```

They arrive with the response that earned them, after the debrief: the completing answer, the
lab's first pass, or a review grade. A challenge's or a lab review's XP can promote too; that
line shows on the next page. Like the rest of the log they're derived, not stored: a rank's
moment is when the XP ledger first reached it, and a badge's is when it was earned. So editing
a line changes everyone's history.

A new character needs an avatar sprite in `art/sprites.py` (and its name in `Avatar` in
`app/content/schema.py`); a new window event needs a sprite in `art/sprites.py`, its entry in
`WINDOW_SPRITES` (`app/comms.py`), its name in `WindowEvent`, and a rule plus keyframes in
`style.css` whose `left`/`top` also make a sensible still for reduced motion. The art is code: change it in `art/`, run
`docker compose exec -u "$(id -u):$(id -g)" web python -m art.build`, and commit both
(`tests/test_art.py` fails if the PNGs and the scripts disagree).

Raw HTML in lessons is **disabled**: it renders as literal text. Use Markdown.

Formatting inside a code block is literal, so `*word*` in a ```text diagram shows the asterisks.

### Hints (nothing to write)

Every unanswered question, console task, challenge and unpassed lab gets a **Hint** button
(#123). Claude writes the hint from what the learner can see. So the lesson is what makes a good
hint possible: if the idea a task needs isn't in the lesson's prose (the #101 rule), the hint
can't point at it.

- The model never gets a quiz `answer` or `explain`, a console `solution` or `checks`, a
  challenge's check code or `solution`, or a lab's `example`. A challenge's check `says` and a
  lab check's `says` *are* sent: the learner sees them after a submit anyway.
- A reply containing the answer is replaced by a pointer back to the lesson. For a question,
  "the answer" is a fill-in spelling or the right option's text, however short. So a right
  option of `3` or `/` will sometimes catch an innocent hint. That's the safe side to err on.

## Before Sean plays it

Modules are written with Claude in Claude Code sessions, one issue and one PR each. Before a
module's PR, in this order:

1. **Write it**, with the `NEEDS` entry for a console task or a lab.
2. **Run the `content-reviewer` agent** on it (`.claude/agents/content-reviewer.md`, #124).
   It reads the module against this file and reports: the #101 rule (for a **lab**, `NEEDS` is the
   only test of it, since no test parses a lab's steps), the quiz against the lesson, claims against
   the repo, lab checks that hold on any machine, and the Try it script to run. Fix what it
   finds, or say in the PR why not.
3. **Run the Try it** in a fresh `ubuntu:24.04` container as a sudo-capable non-root user, plus
   whatever the reviewer couldn't confirm. For a lab, follow its steps there and paste the real
   output into each box's `example`.
4. **Play it in the browser** as `verify-bot`: the console solution, the challenge, the lab.
5. **Open the PR.** Sean plays it before it merges.

## Writing guidelines

- **15–20 minutes, all in.** About 500–900 words of lesson, a quiz of 3–5 questions, and a
  "Try it" section with commands to run.
- **One idea per module.** If you need a second big heading that isn't about the first idea,
  that's the next module.
- **Open with the story, then teach for real.** The station story frames the lesson but never
  replaces the technical content.
- **Tie it to something real.** Point at Budget Buddy's or Orbit Ops's own setup when it
  illustrates the point (the RUNBOOKs are full of examples).
- **Give each module a scenario question** from Unit 1.2 on: a script or output in `code:`, then
  "what happens?" or "why does this fail?". `q` is inline Markdown, so a fenced block there
  collapses into one line: put it in `code:`.
- **Quiz the idea, not the trivia.** Every `explain` should teach something, including why the
  wrong options are wrong when that's useful.
- **Fact-check every draft like code.** A drafted module is a starting point, not a source.
  Run every command in "Try it" yourself before merging (see "Before Sean plays it").
