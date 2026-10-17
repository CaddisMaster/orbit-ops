---
title: Loops
minutes: 20
story: |
  **Mission log, day 16.** Every deck has a CO2 sensor, and every sensor writes its own log in
  `/var/log/sensors`. That's twelve files. Okafor wants each deck's latest reading at every
  shift change. "Not twelve `tail`s," he says. "One script that does it for us."
quiz:
  - type: choice
    q: "One of the logs is called `hydroponics bay.log`. What goes wrong?"
    code: |-
      for f in /var/log/sensors/*.log; do
        tail -n 1 $f
      done
    options:
      - "`tail` gets `/var/log/sensors/hydroponics` and `bay.log` as two files, because `$f` isn't quoted"
      - "The glob splits the name, so the loop runs once for `hydroponics` and once for `bay.log`"
      - "Nothing: `for` handles spaces by itself"
      - "Globs skip files with spaces in their names"
    answer: 0
    explain: >-
      The glob itself is safe: each file it matches is one word, spaces and all. The damage is
      inside the loop, where an unquoted `$f` is split again. `tail -n 1 "$f"` fixes it.
  - type: choice
    q: "What does this print?"
    code: |-
      for n in {1..5}; do
        [ "$n" -eq 2 ] && continue
        [ "$n" -eq 4 ] && break
        echo "$n"
      done
    options: ["`1 3` (one per line)", "`1 3 5`", "`1 2 3`", "`1`"]
    answer: 0
    explain: >-
      `continue` skips the rest of this pass and goes on with the next one, so 2 isn't printed.
      `break` leaves the loop entirely, so nothing after 3 is.
  - type: choice
    q: "Which reads a file one line at a time, keeping each line exactly as written?"
    options:
      - "`while read -r line; do …; done < crew.txt`"
      - "`for line in $(cat crew.txt); do …; done`"
      - "`for line in crew.txt; do …; done`"
      - "`while line; do …; done < crew.txt`"
    answer: 0
    explain: >-
      `while read -r` takes one line per pass from the redirected file, and `-r` keeps
      backslashes as they are. `$(cat …)` splits on every space, not just the line ends, and
      `for line in crew.txt` loops once, over the name itself.
  - type: choice
    q: "In `/var/log/old` there are no `.log` files at all. What does this print?"
    code: |-
      for f in /var/log/old/*.log; do
        echo "found $f"
      done
    options:
      - "`found /var/log/old/*.log`"
      - "Nothing; the loop doesn't run"
      - "An error: no such file"
      - "`found` with nothing after it"
    answer: 0
    explain: >-
      A glob that matches nothing is left as it is, so the loop runs once with the pattern
      itself. Guard it with `[ -e "$f" ] || continue`, or with bash's `shopt -s nullglob`.
  - type: fill
    q: "With `f=/var/log/sensors/galley.log`, what does `echo \"${f##*/}\"` print?"
    answer: ["galley.log"]
    explain: >-
      `##*/` removes the longest match of `*/` from the front: everything up to the last slash.
      `${f%.log}` would remove `.log` from the end.
cards:
  - id: for-over-a-glob
    section: "Looping over file names safely"
    front: Loop over every `.log` file in a directory
    back: "`for f in /var/log/*.log; do …; done`, with `\"$f\"` quoted inside."
  - id: while-read
    section: "`while read`: one line at a time"
    front: Read a file line by line
    back: "`while read -r line; do …; done < file`"
  - id: break-continue
    section: "`break` and `continue`"
    front: "`break` vs `continue`"
    back: "`continue` skips to the next pass; `break` leaves the loop."
  - id: strip-dir-and-extension
    section: "Looping over file names safely"
    front: "From `f=/var/log/galley.log`, get `galley`"
    back: "`name=${f##*/}` (drop the directory), then `${name%.log}` (drop the extension)."
terminal:
  task: |
    Write `/station/bin/deck-readings`: a script that loops over every log in
    `/var/log/sensors` and prints **each deck's last reading**, one line per deck, named after its
    log file without the `.log`:

    ```text
    bridge: 3900 ppm
    ```

    - If the reading is **over 5000 ppm**, the alarm line you set on day 11, end the line with
      ` OVER LIMIT`, as in `stores: 5200 ppm OVER LIMIT`. Exactly 5000 isn't over.
    - A log with nothing in it gets `DECK: no reading`, and the loop carries on to the next one.

    Mind the names: one deck's log has a space in it. Make it executable, then save what it
    prints:

    ```bash
    deck-readings > ~/readings.txt
    ```
  cwd: /home/cadet
  env: {PATH: "/station/bin:/usr/local/bin:/usr/bin:/bin"}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /station/bin, type: dir, owner: root, group: crew, mode: "775"}
    - {path: /var/log/sensors, type: dir, owner: root, group: root}
    - path: /var/log/sensors/airlock.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 3100 ppm
        2026-10-08 08:25:00 CO2 3150 ppm
        2026-10-08 08:55:00 CO2 3200 ppm
    - path: /var/log/sensors/bridge.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 4100 ppm
        2026-10-08 08:25:00 CO2 4000 ppm
        2026-10-08 08:55:00 CO2 3900 ppm
    - path: /var/log/sensors/cargo.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 3600 ppm
        2026-10-08 08:25:00 CO2 3500 ppm
        2026-10-08 08:55:00 CO2 3550 ppm
    - path: /var/log/sensors/engineering.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 4400 ppm
        2026-10-08 08:25:00 CO2 4500 ppm
        2026-10-08 08:55:00 CO2 4600 ppm
    - path: /var/log/sensors/galley.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 4700 ppm
        2026-10-08 08:25:00 CO2 5000 ppm
        2026-10-08 08:55:00 CO2 5300 ppm
    - path: /var/log/sensors/hydroponics bay.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 4200 ppm
        2026-10-08 08:25:00 CO2 4250 ppm
        2026-10-08 08:55:00 CO2 4300 ppm
    - path: /var/log/sensors/lab.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 5600 ppm
        2026-10-08 08:25:00 CO2 4800 ppm
        2026-10-08 08:55:00 CO2 4100 ppm
    - path: /var/log/sensors/medbay.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 3300 ppm
        2026-10-08 08:25:00 CO2 3300 ppm
        2026-10-08 08:55:00 CO2 3350 ppm
    - {path: /var/log/sensors/observation.log, owner: root, group: root, contents: ""}
    - path: /var/log/sensors/quarters-a.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 3800 ppm
        2026-10-08 08:25:00 CO2 3700 ppm
        2026-10-08 08:55:00 CO2 3650 ppm
    - path: /var/log/sensors/quarters-b.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 3750 ppm
        2026-10-08 08:25:00 CO2 3800 ppm
        2026-10-08 08:55:00 CO2 3850 ppm
    - path: /var/log/sensors/workshop.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 4600 ppm
        2026-10-08 08:25:00 CO2 4800 ppm
        2026-10-08 08:55:00 CO2 5000 ppm
  checks:
    - {contains: /home/cadet/readings.txt, text: "bridge: 3900 ppm\n"}
    - {contains: /home/cadet/readings.txt, text: "galley: 5300 ppm OVER LIMIT\n"}
    - {contains: /home/cadet/readings.txt, text: "hydroponics bay: 4300 ppm\n"}
    - {contains: /home/cadet/readings.txt, text: "lab: 4100 ppm\n"}
    - {contains: /home/cadet/readings.txt, text: "observation: no reading\n"}
    - {contains: /home/cadet/readings.txt, text: "quarters-a: 3650 ppm\nquarters-b: 3850 ppm\nworkshop: 5000 ppm\n"}
    - {executable: /station/bin/deck-readings}
  success: |-
    Okafor reads down the list. "Twelve decks in one look. And the galley's over: that'll be the ovens again."
  solution:
    - ls /var/log/sensors
    - tail -n 1 /var/log/sensors/galley.log
    - |-
      cat > /station/bin/deck-readings <<'EOF'
      #!/usr/bin/env bash
      # Each deck's last CO2 reading, flagged if it's over the alarm line.
      limit=5000

      for f in /var/log/sensors/*.log; do
        deck=${f##*/}
        deck=${deck%.log}
        last=$(tail -n 1 "$f")
        if [ -z "$last" ]; then
          echo "$deck: no reading"
          continue
        fi
        ppm=$(echo "$last" | cut -d' ' -f4)
        if [ "$ppm" -gt "$limit" ]; then
          echo "$deck: $ppm ppm OVER LIMIT"
        else
          echo "$deck: $ppm ppm"
        fi
      done
      EOF
    - chmod +x /station/bin/deck-readings
    - deck-readings > ~/readings.txt
    - cat ~/readings.txt
comms:
  open:
    - {from: meridian, text: "SENSOR LOGS · 12 DECKS · CO2 · LAST CHECKED BY HAND"}
    - {from: okafor, text: "Twelve decks, twelve logs. Someone opens each one at shift change, when they remember."}
    - {from: okafor, text: "Write me `deck-readings`: every deck's latest reading in one list, and shout about any that's over."}
  console_done:
    - {from: meridian, text: "DECK READINGS · 12 DECKS · 1 OVER LIMIT · 1 NO READING"}
    - {from: okafor, text: "Galley at 5300. That's the ovens. I'll send someone."}
    - {from: okafor, text: "And observation has no reading at all. A dead sensor is quieter than a bad one, which is why you checked."}
  complete:
    - {from: okafor, text: "One thing I'd change: I can't ask it about a single deck. Tomorrow it takes arguments."}
---

## `for`: once per word

`for` runs the same commands once for each word in a list, with a variable set to that word:

```bash
for ring in a b c; do
  echo "checking ring $ring"
done
```

The list can come from anywhere the shell makes words:

| You write | It loops over |
|---|---|
| `for ring in a b c` | the words you typed |
| `for f in /var/log/*.log` | every file the glob matches, **one word per file, spaces and all** |
| `for n in {1..12}` | the numbers 1 to 12 |
| `for user in $(cut -d: -f1 /etc/passwd)` | a command's output, split at spaces and newlines |

`do` starts the body and `done` ends it. On one line, the same loop is
`for ring in a b c; do echo "$ring"; done`.

## Looping over file names safely

A glob is the safe way to get file names: a file called `crew notes.txt` stays one word. The
danger is **inside** the loop. Unquoted, `$f` is split at the space all over again (day 14), so
**quote it every time** you use it: `"$f"`.

Two more things go wrong with globs:

- **No match.** A pattern that matches nothing is left as it is, so the loop runs once with
  `/var/log/*.log` itself. Guard against it with `[ -e "$f" ] || continue` as the first line of
  the body. Bash can also drop the empty pattern with `shopt -s nullglob`, but the station
  console doesn't have `shopt`.
- **Paths, not names.** `f` holds the whole path. Trim it with parameter expansion:

| With `f=/var/log/sensors/galley.log` | You get | Because |
|---|---|---|
| `${f##*/}` | `galley.log` | `##` removes the longest match from the front: everything up to the last `/` |
| `${f%.log}` | `/var/log/sensors/galley` | `%` removes a match from the end |
| `name=${f##*/}` then `${name%.log}` | `galley` | both, one at a time |

## `while read`: one line at a time

To go through a **file** line by line, read it with `while read -r`:

```bash
while read -r name role; do
  echo "$name is on duty as $role"
done < crew.txt
```

`read` takes one line per pass and splits it into the names you give, the last one getting the
rest of the line. The loop ends when there are no lines left. `-r` keeps backslashes as they are.
Don't use `for line in $(cat file)`: that splits at every space, not just at line ends.

## `break` and `continue`

| Command | What it does |
|---|---|
| `continue` | skips the rest of this pass and **carries on with the next one** |
| `break` | leaves the loop completely |

`continue` is how a loop deals with one bad item, such as an empty file, without stopping the
whole job. `break` is for "found it, stop looking".

## `while` and `until`

`while` repeats as long as a command succeeds, and `until` as long as it fails. Both take any
command, just like `if` (day 15):

```bash
until [ -f /tmp/ready ]; do
  sleep 1
done
```

**On the real station:** this app's release workflow boots each new image for a smoke test, and
waits for it with `for i in $(seq 1 30)`. That tries `/healthz` up to thirty times, two seconds
apart, and `break`s as soon as the app answers. If it never answers, or reports the wrong
version, the release stops before the droplet is touched.

## Try it

```bash
cd "$(mktemp -d)"
touch "crew notes.txt" duty.log
for f in *; do echo "[$f]"; done           # [crew notes.txt] then [duty.log]
for f in *; do ls $f; done                 # errors for crew and notes.txt
for n in {1..3}; do echo "pass $n"; done
printf 'okafor engineer\nreyes pilot\n' > crew.txt
while read -r name role; do echo "$name: $role"; done < crew.txt
for f in *.gz; do echo "got $f"; done      # got *.gz
f=/var/log/sensors/galley.log; name=${f##*/}; echo "${name%.log}"   # galley
```
