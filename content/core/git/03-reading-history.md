---
# No console task: Unit 1.3 is built on labs (#121). Git runs on your own machine, and the
# station console doesn't simulate it.
title: Reading history
minutes: 20
story: |
  **Mission log, day 23.** The CO2 alarm is set to 5000 ppm. It should be 2000: by 5000 the crew
  have headaches long before anything beeps. Nobody remembers changing it, but the alarm settings
  have been in git for a month.
quiz:
  - type: choice
    q: "Petrov's commit `9c0d7e21` is called *Line up the equals signs*. What does this tell you about who set the pump speed to 1100?"
    code: |-
      $ git blame pumps.conf
      ^3e1a2b4 (Okafor   2026-08-01 10:00:00 +0000 1) # Pump settings
      9c0d7e21 (Petrov   2026-09-30 14:12:00 +0000 2) pump_speed = 1100
    options:
      - "Only that Petrov's commit last changed that line. Whoever chose 1100 may be earlier: `git log -S 1100` finds them"
      - "Petrov set it to 1100 on 30 September"
      - "Okafor set it, since the file's first commit is hers"
      - "Nothing: `git blame` only works on code, not settings"
    answer: 0
    explain: >-
      `git blame` names the **last** commit to touch each line. Lining up the equals signs changed
      the line's spacing, so that's what blame sees. To find when the value appeared, search for it with `git log -S`, or
      look at the commit with `git show 9c0d7e21` and see what it really changed.
  - type: choice
    q: "A commit changed `co2_alarm_ppm=2000` to `co2_alarm_ppm=5000`. Does `git log -S co2_alarm_ppm` list it?"
    options:
      - "No: the line still contains `co2_alarm_ppm` once, so the number of times it appears didn't change"
      - "Yes: `-S` lists every commit that touched a line containing the string"
      - "Yes, but only with `-p`"
      - "No: `-S` only searches commit messages"
    answer: 0
    explain: >-
      `-S` lists commits where the number of times the string appears **changed**: it was added
      or removed. Changing the value kept one `co2_alarm_ppm`, so that commit isn't listed. Search
      for the value instead, `git log -S 5000`, to find where it came from.
  - type: choice
    q: Which command lists Petrov's commits to `galley.conf` since 10 September?
    options:
      - "`git log --author=Petrov --since=2026-09-10 -- galley.conf`"
      - "`git blame --author=Petrov galley.conf`"
      - "`git log -S Petrov --since=2026-09-10 galley.conf`"
      - "`git show Petrov galley.conf`"
    answer: 0
    explain: >-
      `git log`'s filters combine: `--author` matches the author's name or email, `--since` takes a date (or
      "2 weeks ago"), and `-- PATH` keeps only commits that changed that file. `-S` searches the
      changes for a string, so it would look for "Petrov" in the file, not in the authors.
  - type: fill
    q: "Which option makes `git log` show each commit's changes, not just its message? (`git log __`)"
    answer: ["-p", "--patch", "-u"]
    explain: >-
      `-p` (patch) adds each commit's diff under its message. Add a path to see one file's history
      change by change, or `-1` for only the newest commit.
cards:
  - id: blame-last-touch
    front: What does `git blame` name for each line?
    back: "The **last** commit that changed it: its hash, author and date. That may be a reformat, not the change you're looking for."
  - id: pickaxe
    front: "`git log -S TEXT`"
    back: "Commits where the number of times TEXT appears changed: it was added or removed. Search for the value, not the whole line."
  - id: log-filters
    front: "Narrow `git log` to one person, one file, recent commits"
    back: "`--author=NAME`, `-- PATH` (last), `--since=DATE` or `--since=\"2 weeks ago\"`. They combine."
  - id: git-show
    front: "See one commit in full"
    back: "`git show HASH`: its author, date and message, then its diff. A short hash is enough."
lab:
  from: okafor
  task: |-
    Find out when the CO2 alarm was set to 5000 ppm, who did it, and what they said.

    1. Run the setup below, once. It builds `~/meridian/alarms`, a month of history: 15 commits
       by Okafor, Petrov and Nakamura, with their dates. To start again, delete
       `~/meridian/alarms` first.
    2. In `~/meridian/alarms`, run `git blame alarms.conf` and paste the line for
       `co2_alarm_ppm`.
    3. Look at that commit with `git show`. Did it set the value, or only touch the line?
    4. Find the commit that really set 5000 with `git log -S` and `--oneline`, and paste what it
       printed.
    5. Paste what `git show` prints for that commit. If it opens in a pager, make the terminal
       taller so it fits on one screen, or press `q` and run it again.
  setup: |-
    mkdir -p ~/meridian/alarms && cd ~/meridian/alarms && git init -q
    c() {
      export GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$(echo "$1" | tr 'A-Z' 'a-z')@meridian.example"
      export GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
      export GIT_AUTHOR_DATE="$2 09:00:00 +0000" GIT_COMMITTER_DATE="$2 09:00:00 +0000"
      git add -A && git commit -q -m "$3"
      unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_DATE
    }
    edit() { sed "$2" "$1" > "$1.new" && mv "$1.new" "$1"; }
    printf '# Alarm thresholds, habitat ring.\no2_low_pct=19.5\nco2_alarm_ppm=2000\npressure_low_kpa=95\nsmoke_ppm=50\n' > alarms.conf
    c Okafor 2026-09-01 "Track the alarm thresholds"
    printf 'fan_rpm=1800\nalarm_volume=8\n' > galley.conf;      c Petrov 2026-09-02 "Track the galley settings"
    printf 'Mon  Okafor\n' > rota.txt;                           c Nakamura 2026-09-03 "Start the watch rota"
    edit alarms.conf 's/^smoke_ppm=50$/smoke_ppm=60/';           c Okafor 2026-09-05 "Raise the smoke alarm to 60 ppm"
    echo 'Tue  Petrov' >> rota.txt;                              c Nakamura 2026-09-07 "Add Tuesday's watch"
    edit galley.conf 's/^fan_rpm=1800$/fan_rpm=1500/';           c Petrov 2026-09-08 "Slow the galley fan"
    echo 'humidity_high_pct=70' >> alarms.conf;                  c Okafor 2026-09-10 "Add a humidity alarm"
    echo 'Wed  Nakamura' >> rota.txt;                            c Nakamura 2026-09-11 "Add Wednesday's watch"
    edit galley.conf 's/^alarm_volume=8$/alarm_volume=3/'
    edit alarms.conf 's/^co2_alarm_ppm=2000$/co2_alarm_ppm=5000/'; c Petrov 2026-09-14 "Quieten the galley alarms"
    edit alarms.conf 's/^pressure_low_kpa=95$/pressure_low_kpa=94/'; c Okafor 2026-09-16 "Lower the pressure alarm to 94 kPa"
    echo 'Thu  Okafor' >> rota.txt;                              c Nakamura 2026-09-18 "Add Thursday's watch"
    echo '# alarm_volume: 0 to 10' >> galley.conf;               c Petrov 2026-09-20 "Explain the galley's alarm volume"
    edit alarms.conf 's/=/ = /';                                 c Nakamura 2026-09-22 "Align the settings"
    echo 'Fri  Petrov' >> rota.txt;                              c Okafor 2026-09-25 "Add Friday's watch"
    echo '# O2 sensor replaced 2026-09-27, ring B.' >> alarms.conf; c Nakamura 2026-09-28 "Note the new O2 sensor"
    unset -f c edit
  boxes:
    - prompt: "The line `git blame alarms.conf` prints for `co2_alarm_ppm`."
      checks:
        - {contains: "co2_alarm_ppm = 5000", says: "It's the blame line for the CO2 alarm", hint: "Run it in ~/meridian/alarms, and paste the co2_alarm_ppm line."}
        - {regex: '^[0-9a-f]{7,} \(Nakamura +2026-09-22 [^)]*\) co2_alarm_ppm = 5000 *$', says: "It's from plain git blame, with no options", hint: "Plain git blame alarms.conf: the point is what it shows with no options."}
      example: |
        cb9b8e19 (Nakamura 2026-09-22 09:00:00 +0000 3) co2_alarm_ppm = 5000
    - prompt: "What `git log -S` printed, with `--oneline`."
      checks:
        - {regex: '^[0-9a-f]{7,} (\(.*\) )?Quieten the galley alarms *$', says: "It finds the commit that set 5000", hint: "Search for what that commit changed, not for the line as it looks today: its spacing changed later. And paste the --oneline form."}
      example: |
        025b30b Quieten the galley alarms
    - prompt: "What `git show` printed for that commit."
      checks:
        - {contains: "Quieten the galley alarms", says: "It's the commit git log -S found", hint: "Give git show the hash from git log -S."}
        - {contains: "-co2_alarm_ppm=2000", says: "It shows the value it replaced"}
        - {contains: "+co2_alarm_ppm=5000", says: "It shows the new value"}
        - {regex: '^Author: \S', says: "It shows who made the change", hint: "Paste all of it, from the commit line down."}
      example: |
        commit 025b30b6f43d729166e305726c2a8172866618f6
        Author: Petrov <petrov@meridian.example>
        Date:   Mon Sep 14 09:00:00 2026 +0000

            Quieten the galley alarms

        diff --git a/alarms.conf b/alarms.conf
        index 126e211..fa7d0ed 100644
        --- a/alarms.conf
        +++ b/alarms.conf
        @@ -1,6 +1,6 @@
         # Alarm thresholds, habitat ring.
         o2_low_pct=19.5
        -co2_alarm_ppm=2000
        +co2_alarm_ppm=5000
         pressure_low_kpa=95
         smoke_ppm=60
         humidity_high_pct=70
        diff --git a/galley.conf b/galley.conf
        index a2046ea..ad21993 100644
        --- a/galley.conf
        +++ b/galley.conf
        @@ -1,2 +1,2 @@
         fan_rpm=1500
        -alarm_volume=8
        +alarm_volume=3
comms:
  open:
    - {from: meridian, text: "CO2 ALARM · SET 5000 ppm · SPEC 2000 ppm"}
    - {from: okafor, text: "The CO2 alarm's at 5000. At that level people get headaches long before anything beeps. It should be 2000."}
    - {from: okafor, text: "I want to know when it changed, who changed it, and what they said when they did. The alarm settings have been in git for a month, so it's all there."}
  lab_done:
    - {from: meridian, text: "CO2_ALARM_PPM 2000 → 5000 · PETROV · 2026-09-14 · \"QUIETEN THE GALLEY ALARMS\""}
    - {from: okafor, text: "Petrov, turning the galley's alarm down. The CO2 alarm went with it, in the same commit, and the message only mentions the galley."}
    - {from: okafor, text: "And blame pointed at Nakamura, who only lined up the equals signs. Good thing you didn't stop there."}
  complete:
    - {from: okafor, text: "I've put the alarm back to 2000 and asked Petrov. He thought that line was the galley's. One commit, two changes, and nobody could tell."}
    - {from: meridian, text: "CO2 ALARM · 2000 ppm · RESET BY OKAFOR · REASON IN COMMIT MESSAGE"}
    - {from: mission, text: "*Meridian*, Mission Control. Okafor tells us the alarm's back at 2000 ppm, and why it wasn't. Good detective work, cadet."}
---

## Searching the log

`git log` lists every commit, newest first. On a real project that's thousands, so it takes
filters, and they combine:

| Option | Shows |
|---|---|
| `--oneline` | a line per commit: short hash and message |
| `--graph` | a line drawing of how commits join, down the left; useful once there are branches (day 24) |
| `-p` | each commit's diff under its message (`p` for patch) |
| `-3` | only the newest three |
| `--author=NAME` | only commits whose author's name or email matches NAME |
| `--since=DATE` | only commits after a date: `2026-09-10`, or `"2 weeks ago"` |
| `-- PATH` | only commits that changed that file or directory; it goes last |

So `git log --oneline --author=Okafor -- pumps.conf` is every change Okafor made to the pumps.
The `--` says that what follows is a path, so a file can never be mistaken for anything else.

## Looking at one commit

`git show HASH` prints one commit in full: its author, date and message, then its diff. Any
unique start of the hash will do, so the seven characters `--oneline` shows are enough, and
`git show HEAD` is the newest commit.

## Who last touched a line

`git blame FILE` prints the file with each line labelled by the **last commit that changed it**:

```text
4f2a9c1e (Okafor 2026-10-02 08:30:00 +0000 12) heater_max_c = 24
```

That's the commit's short hash, its author, its date, the line number and the line. A hash
starting with `^` is a line unchanged since the commit where history starts. `git blame -L 10,20
FILE` blames only lines 10 to 20, and `-w` ignores changes that were only spaces.

⚠️ **"Last changed" isn't "decided".** Re-spacing or reformatting a file changes every line it
touches, and blame then names that commit. Always `git show` the commit blame names,
and check it changed what you care about.

## When did this appear?

`git log -S TEXT` (the **pickaxe**) lists the commits where the number of times TEXT appears
changed: **where it was added or removed**. It searches the changes themselves, not the messages,
so it finds a change whatever its commit was called.

- Search for **what changed**, like the value, not the line as it reads today. A line that was
  re-spaced since won't match the old version.
- Add `-- PATH` to search one file, and `--oneline` or `-p` to see the result briefly or in full.

**On the real station:** this app's Content Security Policy allows `'wasm-unsafe-eval'`, which
it otherwise never would. To find out why, `git log --oneline -S "wasm-unsafe-eval" --
app/security.py` prints one commit, `5b9fdf2 Run Python in the browser with self-hosted Pyodide
(#62)`. `git show 5b9fdf2` gives the whole change, and its pull request, #62, gives the reason.
That's how any line in this repository can be traced to the change that made it.

## Try it

```bash
cd "$(mktemp -d)" && git init -q
git config user.name "Cadet Test" && git config user.email "cadet@meridian.example"
echo "lights=on" > deck.conf && git add deck.conf && git commit -q -m "Track deck.conf"
echo "heaters=2" >> deck.conf && git add deck.conf && git commit -q -m "Add the heaters"
git log --oneline --graph             # * … Add the heaters / * … Track deck.conf
git log -p -1                         # the newest commit, with its diff: +heaters=2
git log --oneline --author="Cadet Test" --since=yesterday -- deck.conf    # both commits
git blame deck.conf                   # ^… for lights=on, the other hash for heaters=2
git log --oneline -S heaters          # only: Add the heaters
git show "$(git log --format=%h -S lights)"   # Track deck.conf, with +lights=on
```
