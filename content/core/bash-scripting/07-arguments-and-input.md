---
title: Arguments and input
minutes: 20
story: |
  **Mission log, day 17.** Every deck wants its own CO2 report. Last time, someone copied the
  report script once per deck, and the copies drifted: `lab-report` shows two days, and
  `galley-report` has the wrong name in its heading. "One script," says Okafor. "You tell it which deck."
quiz:
  - type: choice
    q: "`./backup.sh /srv/data \"Crew Logs\" 7` is run. What are `$2` and `$#`?"
    options:
      - "`$2` is `Crew Logs`, `$#` is 3"
      - "`$2` is `Crew`, `$#` is 4"
      - "`$2` is `Crew Logs`, `$#` is 4"
      - "`$2` is `/srv/data`, `$#` is 3"
    answer: 0
    explain: >-
      The shell splits the command line before the script ever sees it, and the quotes keep
      `Crew Logs` one argument. `$1` is the first after the script's name (`$0`), and `$#`
      counts them.
  - type: choice
    q: "`wrap.sh` passes its arguments on. What does `./wrap.sh \"a b\" c` print?"
    code: |-
      #!/usr/bin/env bash
      for arg in $*; do
        echo "[$arg]"
      done
    options:
      - "`[a]` `[b]` `[c]`, one per line"
      - "`[a b]` `[c]`, one per line"
      - "`[a b c]`"
      - "Nothing"
    answer: 0
    explain: >-
      Unquoted, `$*` (and `$@`) are split again at every space, so `a b` falls apart. `"$@"`
      gives back exactly the arguments the script was given: `[a b]` then `[c]`.
  - type: choice
    q: "A script is run with no arguments. Why does the usage message go to stderr, and the status to 2?"
    code: |-
      if [ $# -lt 1 ]; then
        echo "usage: deck-report DECK [DAYS]" >&2
        exit 2
      fi
    options:
      - "So it isn't mistaken for the script's real output, and so the caller can tell \"used wrong\" from other failures"
      - "Because `echo` can't write to stdout inside an `if`"
      - "Because exit status 1 is reserved for the shell"
      - "So that it only appears when the script runs from cron"
    answer: 0
    explain: >-
      Anything reading the script's output, like a pipe or a `> file`, shouldn't get an error
      message mixed in. Status 2 is the common convention for "wrong usage": bash's own
      builtins and `grep` use it too.
  - type: fill
    q: "With `$1=galley` and `$2=3`, after `shift` what is `$1`?"
    answer: ["3"]
    explain: >-
      `shift` drops `$1` and moves every other argument down one place, so `$2` becomes `$1`
      and `$#` goes down by one.
  - type: choice
    q: "Which line takes an optional second argument, defaulting to 1?"
    options: ["`days=${2:-1}`", "`days=$2 || 1`", "`days=${1:-2}`", "`days=$2:1`"]
    answer: 0
    explain: >-
      `${VAR:-default}` works on arguments too (day 14). When `$2` is missing or empty, `days`
      is 1.
cards:
  - id: positional-arguments
    section: "Arguments: `$1` to `$9`"
    front: "`$0`, `$1`, `$#` in a script"
    back: "The script's own name, its first argument, and how many arguments there are."
  - id: quoted-at
    section: "`\"$@\"`: passing them all on"
    accept: ["\"$@\""]
    front: Pass all of a script's arguments on, unchanged
    back: "`\"$@\"`, in quotes. Each argument stays one word, spaces and all."
  - id: usage-exit-2
    section: "Checking what you were given"
    front: A script was called wrongly. What does it do?
    back: "Prints a `usage:` line to stderr (`>&2`) and exits 2."
  - id: shift
    section: "`shift`"
    front: What does `shift` do?
    back: "Drops `$1` and moves the rest down: `$2` becomes `$1`, and `$#` goes down by one."
terminal:
  task: |
    `/station/bin` holds two drifted copies, `galley-report` and `lab-report`. Replace them with
    one script, `/station/bin/deck-report`, run as `deck-report DECK [DAYS]`. Each deck's daily
    readings are in `/var/log/sensors/DECK.log`, newest last.

    - It prints a heading line, `DECK: N day report`, then the last N lines of that deck's log.
      `DAYS` is optional, and **defaults to 1**.
    - With **no deck**, it prints `usage: deck-report DECK [DAYS]` to stderr and **exits 2**.
    - With a deck that has **no log**, it prints `deck-report: no such deck: DECK` to stderr and
      **exits 1**.

    Make it executable, and **delete the two copies**. Then test all five ways of calling it,
    logging each one's output and exit status the way you did on day 15:

    ```bash
    deck-report >> ~/report-test.log 2>&1; echo "exit $?" >> ~/report-test.log
    ```

    The other four: `deck-report nowhere`, `deck-report galley`, `deck-report galley 3` and
    `deck-report "hydroponics bay" 2`.
  cwd: /home/cadet
  env: {PATH: "/station/bin:/usr/local/bin:/usr/bin:/bin"}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /station/bin, type: dir, owner: root, group: crew, mode: "775"}
    - path: /station/bin/galley-report
      mode: "775"
      group: crew
      contents: |
        #!/usr/bin/env bash
        # The galley's CO2, last day. Copied from lab-report.
        echo "lab: 1 day report"
        tail -n 1 /var/log/sensors/galley.log
    - path: /station/bin/lab-report
      mode: "775"
      group: crew
      contents: |
        #!/usr/bin/env bash
        # The lab's CO2, last day.
        echo "lab: 1 day report"
        tail -n 2 /var/log/sensors/lab.log
    - {path: /var/log/sensors, type: dir, owner: root, group: root}
    - path: /var/log/sensors/bridge.log
      owner: root
      group: root
      contents: |
        2026-10-04 CO2 3900 ppm
        2026-10-05 CO2 4000 ppm
        2026-10-06 CO2 3850 ppm
        2026-10-07 CO2 3950 ppm
        2026-10-08 CO2 3900 ppm
    - path: /var/log/sensors/galley.log
      owner: root
      group: root
      contents: |
        2026-10-04 CO2 4600 ppm
        2026-10-05 CO2 4750 ppm
        2026-10-06 CO2 4900 ppm
        2026-10-07 CO2 5100 ppm
        2026-10-08 CO2 4700 ppm
    - path: /var/log/sensors/hydroponics bay.log
      owner: root
      group: root
      contents: |
        2026-10-04 CO2 4100 ppm
        2026-10-05 CO2 4150 ppm
        2026-10-06 CO2 4200 ppm
        2026-10-07 CO2 4300 ppm
        2026-10-08 CO2 4250 ppm
    - path: /var/log/sensors/lab.log
      owner: root
      group: root
      contents: |
        2026-10-04 CO2 4400 ppm
        2026-10-05 CO2 4500 ppm
        2026-10-06 CO2 4800 ppm
        2026-10-07 CO2 4300 ppm
        2026-10-08 CO2 4100 ppm
  checks:
    - {contains: /home/cadet/report-test.log, text: "usage: deck-report DECK [DAYS]\nexit 2\n"}
    - {contains: /home/cadet/report-test.log, text: "deck-report: no such deck: nowhere\nexit 1\n"}
    - {contains: /home/cadet/report-test.log, text: "galley: 1 day report\n2026-10-08 CO2 4700 ppm\nexit 0\n"}
    - {contains: /home/cadet/report-test.log, text: "galley: 3 day report\n2026-10-06 CO2 4900 ppm\n2026-10-07 CO2 5100 ppm\n2026-10-08 CO2 4700 ppm\nexit 0\n"}
    - {contains: /home/cadet/report-test.log, text: "hydroponics bay: 2 day report\n2026-10-07 CO2 4300 ppm\n2026-10-08 CO2 4250 ppm\nexit 0\n"}
    - {executable: /station/bin/deck-report}
    - {missing: /station/bin/galley-report}
    - {missing: /station/bin/lab-report}
  success: |-
    Okafor deletes a note from his console. "One script, every deck, and it tells you how to use it. No more copies."
  solution:
    - ls /station/bin
    - cat /station/bin/galley-report /station/bin/lab-report
    - |-
      cat > /station/bin/deck-report <<'EOF'
      #!/usr/bin/env bash
      # A deck's CO2 readings for the last DAYS days (default 1).
      if [ $# -lt 1 ]; then
        echo "usage: deck-report DECK [DAYS]" >&2
        exit 2
      fi

      deck=$1
      days=${2:-1}
      log="/var/log/sensors/$deck.log"

      if [ ! -f "$log" ]; then
        echo "deck-report: no such deck: $deck" >&2
        exit 1
      fi

      echo "$deck: $days day report"
      tail -n "$days" "$log"
      EOF
    - chmod +x /station/bin/deck-report
    - rm /station/bin/galley-report /station/bin/lab-report
    - deck-report >> ~/report-test.log 2>&1; echo "exit $?" >> ~/report-test.log
    - deck-report nowhere >> ~/report-test.log 2>&1; echo "exit $?" >> ~/report-test.log
    - deck-report galley >> ~/report-test.log 2>&1; echo "exit $?" >> ~/report-test.log
    - deck-report galley 3 >> ~/report-test.log 2>&1; echo "exit $?" >> ~/report-test.log
    - deck-report "hydroponics bay" 2 >> ~/report-test.log 2>&1; echo "exit $?" >> ~/report-test.log
    - cat ~/report-test.log
comms:
  open:
    - {from: meridian, text: "REPORT SCRIPTS · 2 COPIES · CONTENTS DIFFER"}
    - {from: okafor, text: "`galley-report` says *lab* at the top. `lab-report` shows two days when it says one. That's what copies do."}
    - {from: okafor, text: "Write one `deck-report` that takes the deck as an argument, and bin the copies."}
  console_done:
    - {from: meridian, text: "DECK-REPORT · 5 CALLS TESTED · USAGE EXIT 2 · UNKNOWN DECK EXIT 1"}
    - {from: okafor, text: "Galley hit 5100 on the 7th. I'd never have seen that in a one-day report."}
  complete:
    - {from: okafor, text: "It's getting long, though. Tomorrow we break it into functions, so each piece can be read on its own."}
---

## Arguments: `$1` to `$9`

Whatever follows a script's name on the command line reaches it as **positional arguments**:

| In the script | Run as `./report.sh galley 3` |
|---|---|
| `$0` | `./report.sh`: the script's own name, as it was run |
| `$1`, `$2` … `$9` | `galley`, `3`: each argument in turn (`${10}` and up need braces) |
| `$#` | `2`: how many arguments there are |
| `"$@"` | `galley` `3`: all of them, each one still a separate word |

The shell splits the command line into arguments **before** the script runs, so quotes decide
what counts as one: `./report.sh "hydroponics bay" 2` has two arguments, and `$1` is
`hydroponics bay`. Inside the script, quote it as usual: `"$1"`.

## `"$@"`: passing them all on

`"$@"`, in double quotes, is every argument exactly as it was given. It's how a script hands
its arguments on to another command:

```bash
exec pytest -q "$@"      # every argument you gave, passed to pytest unchanged
```

Unquoted, `$@` and `$*` are split at spaces all over again, so `"hydroponics bay"` would arrive
as two words. `"$*"` joins them all into **one** word. You almost always want `"$@"`.

## `shift`

`shift` drops `$1` and **moves every other argument down one place**: `$2` becomes `$1`, and `$#`
goes down by one. It's how a script takes one argument off the front and leaves the rest:

```bash
deck=$1
shift
echo "deck $deck, with $# more arguments"
```

## Checking what you were given

A script should check its arguments before it does anything with them. If something is
missing, print a **usage** line that shows how to call it, and stop:

```bash
if [ $# -lt 1 ]; then
  echo "usage: backup.sh DIR [DAYS]" >&2
  exit 2
fi
```

The message goes to stderr with `>&2` (day 15), so it never ends up in a pipe or a file meant
for the real output. **Exit status 2 is the convention for "used wrongly"**: bash's own builtins
use it, and so does `grep`. Something wrong with the input itself, like a name that doesn't
exist, is a different failure, so give it a different number, such as 1.

An optional argument gets its default the way any variable does (day 14): `days=${2:-1}` is
`$2`, or 1 if there isn't one.

## Reading input with `read`

Arguments are for when the script is run. To **ask** for something while it runs, use `read`:

```bash
read -r -p "Which deck? " deck
echo "Reporting on $deck"
```

`-p` shows a prompt, and `-r` keeps backslashes as they are. Use it for scripts a person runs.
A script that cron or a pipeline runs has nobody to answer, so take arguments instead.

**On the real station:** this app's `test.sh` passes everything you give it to pytest with
`"$@"`, so `./test.sh tests/test_auth.py -k rate` runs just those tests. It also checks `$#`: with
no arguments (`[ $# -eq 0 ]`) it runs the JavaScript tests too. And `scripts/install_compose.sh`,
run on the droplet at every release, takes `$1`, `$2` and `$3` as the checksum, the version and
the mode, and refuses a mode it doesn't know with exit 2.

## Try it

```bash
cd "$(mktemp -d)"
printf '#!/usr/bin/env bash\necho "$# args, first: $1"\nfor a in "$@"; do echo "[$a]"; done\n' > args.sh
chmod +x args.sh
./args.sh "crew notes" 7       # 2 args, first: crew notes   then [crew notes] [7]
./args.sh                      # 0 args, first:
set -- galley 3 extra; echo "$1 $#"; shift; echo "$1 $#"   # galley 3   then 3 2
echo "${3:-1}"                 # 1: after the shift there is no $3
read -r -p "Deck? " deck <<< "lab"; echo "deck=$deck"
```
