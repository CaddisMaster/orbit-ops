---
title: Functions
minutes: 20
story: |
  **Mission log, day 18.** The galley's CO2 hit 5300 ppm this morning. `deck-readings` flagged
  it, and `co2-alarm` said everything was fine. Each script has its own copy of the code that
  reads a sensor, and its own idea of the limit. "Two answers is no answer," says Okafor. "Write
  it once."
quiz:
  - type: choice
    q: "What does this print?"
    code: |-
      deck=bridge
      check() {
        deck=$1
        echo "checking $deck"
      }
      check galley
      echo "back in the script: $deck"
    options:
      - "`checking galley` then `back in the script: galley`"
      - "`checking galley` then `back in the script: bridge`"
      - "`checking bridge` then `back in the script: bridge`"
      - "An error: `deck` is already set"
    answer: 0
    explain: >-
      Variables in a function are the script's own unless they're declared `local`, so the
      function overwrote `deck`. `local deck=$1` would have left the script's `bridge` alone.
  - type: choice
    q: "A function has to give back a reading like `5300`. How?"
    options:
      - "`echo` it, and the caller captures it with `ppm=$(last_ppm \"$f\")`"
      - "`return 5300`, and the caller reads `$?`"
      - "Assign a global variable called `return`"
      - "`exit 5300`"
    answer: 0
    explain: >-
      `return` only sets a status, 0 to 255, and that's for success or failure. Data is printed
      and captured with `$( )`. `exit` would end the whole script, and 5300 doesn't fit in a
      status anyway.
  - type: choice
    q: "Why does `if over_limit 5300; then` work without any `[ ]`?"
    code: |-
      over_limit() {
        [ "$1" -gt 5000 ]
      }
    options:
      - "A function's status is its last command's, and `if` runs any command and checks its status"
      - "Functions always return true"
      - "`if` adds the `[ ]` itself"
      - "It doesn't: it needs `if [ over_limit 5300 ]`"
    answer: 0
    explain: >-
      With no `return`, a function ends with the status of its last command: here, the test.
      `if` doesn't care whether it runs a command, a test or a function (day 15). `[ over_limit
      5300 ]` would test the string `over_limit`, not run it.
  - type: choice
    q: "`lib.sh` defines `last_ppm`. A script runs `./lib.sh` and then calls `last_ppm`. What happens?"
    options:
      - "`last_ppm: command not found`: `./lib.sh` ran in a child shell, whose functions ended with it"
      - "It works: running a file loads its functions"
      - "It works, but only if `lib.sh` is executable"
      - "`lib.sh` asks whether to export its functions"
    answer: 0
    explain: >-
      Running a script starts a new shell, and everything it defines goes when it ends.
      `source lib.sh` (or `. lib.sh`) runs it in the current shell, so its functions stay.
  - type: fill
    q: "Which keyword makes a variable belong to the function it's declared in?"
    answer: ["local"]
    explain: >-
      `local name=value` inside a function makes a variable that disappears when the function
      returns, and leaves any variable of the same name outside it untouched.
cards:
  - id: define-a-function
    front: Define and call a function in bash
    back: "`greet() { echo \"hello $1\"; }`, then `greet okafor`. No brackets in the call."
  - id: output-vs-status
    front: How does a function give back data, and how does it say yes or no?
    back: "Data: `echo` it, and capture with `$( )`. Yes or no: its status, `return 0`/`1`, or its last command's."
  - id: local
    front: Why use `local` in a function?
    back: "So its variables don't overwrite the script's. Without it, every variable is global."
  - id: source
    front: Use the functions in `lib.sh` from a script
    back: "`source lib.sh` (or `. lib.sh`): it runs in the current shell, so the functions stay defined."
terminal:
  task: |
    `deck-readings` and `co2-alarm` each read the CO2 logs their own way, and disagree about the
    limit: run them and see. Write the sensor code **once**, in a library both of them `source`.

    1. Create `/station/lib/sensors.sh` with two functions, and the limit, 5000 ppm, in one
       place:
       - **`last_ppm FILE`** prints the last reading in FILE, in ppm. With an empty log it
         prints nothing.
       - **`over_limit PPM`** prints nothing. Its **exit status** is the answer: success if PPM is
         over the limit.
    2. Make **both** scripts `source` the library and use `last_ppm` and `over_limit` instead of
       their own copies. Keep what each prints the same.
    3. Run them, saving what they say:

       ```bash
       deck-readings > ~/readings.txt
       co2-alarm galley > ~/alarm.txt
       ```

    `cat` both scripts first: what they do now is what they should still do, with one limit.
  cwd: /home/cadet
  env: {PATH: "/station/bin:/usr/local/bin:/usr/bin:/bin"}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /station/lib, type: dir, owner: root, group: crew, mode: "775"}
    - {path: /station/bin, type: dir, owner: root, group: crew, mode: "775"}
    - path: /station/bin/deck-readings
      mode: "775"
      group: crew
      contents: |
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
    - path: /station/bin/co2-alarm
      mode: "775"
      group: crew
      contents: |
        #!/usr/bin/env bash
        # co2-alarm DECK: sound the alarm if a deck's CO2 is over the limit.
        limit=50000   # 5%

        deck=$1
        last=$(tail -n 1 "/var/log/sensors/$deck.log")
        ppm=$(echo "$last" | cut -d' ' -f4)

        if [ "$ppm" -gt "$limit" ]; then
          echo "ALARM $deck: $ppm ppm"
          exit 1
        fi
        echo "ok $deck: $ppm ppm"
    - {path: /var/log/sensors, type: dir, owner: root, group: root}
    - path: /var/log/sensors/bridge.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 4000 ppm
        2026-10-08 08:25:00 CO2 3950 ppm
        2026-10-08 08:55:00 CO2 3900 ppm
    - path: /var/log/sensors/galley.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 4900 ppm
        2026-10-08 08:25:00 CO2 5100 ppm
        2026-10-08 08:55:00 CO2 5300 ppm
    - path: /var/log/sensors/hydroponics bay.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 4200 ppm
        2026-10-08 08:25:00 CO2 4250 ppm
        2026-10-08 08:55:00 CO2 4300 ppm
    - {path: /var/log/sensors/observation.log, owner: root, group: root, contents: ""}
    - path: /var/log/sensors/workshop.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 CO2 4700 ppm
        2026-10-08 08:25:00 CO2 4900 ppm
        2026-10-08 08:55:00 CO2 5000 ppm
  checks:
    - {contains: /home/cadet/readings.txt, text: "bridge: 3900 ppm\ngalley: 5300 ppm OVER LIMIT\nhydroponics bay: 4300 ppm\nobservation: no reading\nworkshop: 5000 ppm\n"}
    - {contains: /home/cadet/alarm.txt, text: "ALARM galley: 5300 ppm"}
    - {contains: /station/lib/sensors.sh, text: "last_ppm"}
    - {contains: /station/lib/sensors.sh, text: "over_limit"}
    - {contains: /station/bin/deck-readings, text: "/station/lib/sensors.sh"}
    - {contains: /station/bin/deck-readings, text: "over_limit"}
    - {contains: /station/bin/co2-alarm, text: "/station/lib/sensors.sh"}
    - {contains: /station/bin/co2-alarm, text: "over_limit"}
  success: |-
    The galley's alarm light comes on, at last. Okafor flips it off. "Late, but right. And next time the limit changes, it changes in one place."
  solution:
    - deck-readings
    - co2-alarm galley
    - cat /station/bin/deck-readings /station/bin/co2-alarm
    - |-
      cat > /station/lib/sensors.sh <<'EOF'
      # Shared sensor code. Source it; don't run it.
      CO2_LIMIT_PPM=5000

      # last_ppm FILE: print the last reading in FILE, in ppm (nothing if it's empty).
      last_ppm() {
        local last
        last=$(tail -n 1 "$1")
        [ -n "$last" ] || return 1
        echo "$last" | cut -d' ' -f4
      }

      # over_limit PPM: succeed if PPM is over the CO2 limit.
      over_limit() {
        [ "$1" -gt "$CO2_LIMIT_PPM" ]
      }
      EOF
    - |-
      cat > /station/bin/deck-readings <<'EOF'
      #!/usr/bin/env bash
      # Each deck's last CO2 reading, flagged if it's over the alarm line.
      source /station/lib/sensors.sh

      for f in /var/log/sensors/*.log; do
        deck=${f##*/}
        deck=${deck%.log}
        ppm=$(last_ppm "$f")
        if [ -z "$ppm" ]; then
          echo "$deck: no reading"
          continue
        fi
        if over_limit "$ppm"; then
          echo "$deck: $ppm ppm OVER LIMIT"
        else
          echo "$deck: $ppm ppm"
        fi
      done
      EOF
    - |-
      cat > /station/bin/co2-alarm <<'EOF'
      #!/usr/bin/env bash
      # co2-alarm DECK: sound the alarm if a deck's CO2 is over the limit.
      source /station/lib/sensors.sh

      deck=$1
      ppm=$(last_ppm "/var/log/sensors/$deck.log")

      if over_limit "$ppm"; then
        echo "ALARM $deck: $ppm ppm"
        exit 1
      fi
      echo "ok $deck: $ppm ppm"
      EOF
    - deck-readings > ~/readings.txt
    - co2-alarm galley > ~/alarm.txt
    - cat ~/readings.txt ~/alarm.txt
comms:
  open:
    - {from: meridian, text: "GALLEY CO2 5300 PPM · DECK-READINGS: OVER LIMIT · CO2-ALARM: OK"}
    - {from: okafor, text: "Same sensor, same minute, two answers. Someone typed 50000 for the limit in one of them."}
    - {from: okafor, text: "Put the sensor code in `/station/lib/sensors.sh`, once, and make both scripts use it."}
  console_done:
    - {from: meridian, text: "CO2 LIMIT 5000 PPM · DEFINED IN 1 PLACE · 2 SCRIPTS AGREE"}
    - {from: okafor, text: "That's what a library is for. Fix it once and everything that sources it is fixed."}
  complete:
    - {from: okafor, text: "One more thing these scripts do badly: when something fails halfway, they carry on as if it didn't. Tomorrow, we make them stop."}
---

## Defining and calling a function

A function is a name for a group of commands. Define it once, then **call it like any command**,
by its name, with no brackets:

```bash
greet() {
  echo "Good shift, $1"
}

greet okafor          # Good shift, okafor
greet "the night crew"
```

A function has to be defined before the line that calls it runs, so definitions go at the top of
a script. `function greet { … }` is bash's other spelling of the same thing.

## Arguments inside a function

Inside a function, `$1`, `$2`, `$#` and `"$@"` are **the function's own arguments**, not the
script's. The script's arguments are still there when the function returns.

## `local`

Every variable in bash is global unless you say otherwise, so a function that sets `deck=…`
overwrites the script's `deck`. **`local` makes a variable belong to the function**, gone when it
returns:

```bash
lowest() {
  local a=$1 b=$2
  if [ "$a" -lt "$b" ]; then echo "$a"; else echo "$b"; fi
}
```

Declare every variable a function uses as `local`, unless overwriting the script's is the point.

## Output and status: two ways to answer

A function answers in one of two ways, and they're for different things:

| To give back | The function | The caller |
|---|---|---|
| **data**: a reading, a name, a path | prints it with `echo` | captures it: `ppm=$(last_ppm "$f")` |
| **yes or no** | sets its exit status, with `return 0` or `return 1` | tests it: `if over_limit "$ppm"; then` |

`return` ends the function with a status from 0 to 255: it's not for data, so `return 5300`
won't work. Without a `return`, a function's status is **the status of its last command**, so a
function whose last line is a test is a yes-or-no question:

```bash
too_warm() {
  [ "$1" -gt 25 ]
}

if too_warm "$temp"; then echo "open a vent"; fi
```

`if` runs it and checks its status, as with any command (day 15). Don't write `[ too_warm … ]`:
that tests the string `too_warm` instead of running it.

## Sharing functions with `source`

A **library** is a file that only defines functions and settings, for other scripts to use.
`source FILE` (or its short form, `. FILE`) runs the file **in the current shell**, so everything
it defines stays defined afterwards:

```bash
source /station/lib/env.sh
greet okafor
```

Running the library instead, as `./env.sh` or `bash env.sh`, would define the functions in a
child shell that ends straight away, so the script would get `command not found`. A library
doesn't need the execute bit or a shebang, because nothing runs it directly.

**On the real station:** this app's `test.sh` defines two one-line functions,
`web_is_running` and `web_has_dev_deps`, whose exit statuses are their answers. It then asks
`if web_is_running && web_has_dev_deps; then`, and uses the dev container if both say yes, or
builds a throwaway one if not.

## Try it

```bash
cd "$(mktemp -d)"
printf 'greet() { echo "Good shift, $1"; }\nis_even() { [ $(( $1 %% 2 )) -eq 0 ]; }\n' > lib.sh
bash lib.sh; type greet          # bash: type: greet: not found
source lib.sh; greet okafor      # Good shift, okafor
is_even 4 && echo "4 is even"
is_even 7 || echo "7 is odd"
deck=bridge; f() { deck=$1; }; f galley; echo "$deck"         # galley
deck=bridge; g() { local deck=$1; }; g galley; echo "$deck"   # bridge
```
