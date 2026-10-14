---
title: Conditionals
minutes: 20
story: |
  **Mission log, day 15.** At 03:00 last night the O2 sensor read 19.2%, below the safe minimum,
  and said so every minute for an hour. Nobody was reading. "A script that only prints a number
  is a script nobody listens to," says Okafor. "Make it decide."
quiz:
  - type: choice
    q: "Why does this test fail?"
    code: |-
      $ o2=19.2
      $ if [ "$o2" -lt 19.5 ]; then echo ALERT; fi
      bash: [: 19.2: integer expression expected
    options:
      - "`-lt` compares whole numbers only, so `19.2` isn't a number to it"
      - "`$o2` shouldn't be in quotes inside `[ ]`"
      - "`[ ]` can't compare numbers; it needs `[[ ]]`"
      - "The `;` before `then` should be a newline"
    answer: 0
    explain: >-
      Bash's arithmetic, `-lt` and `$(( ))` alike, is whole numbers only. Count in smaller
      units instead (19.2% is 192 tenths) and compare those. `[[ ]]` has the same limit, and the
      quotes are right.
  - type: choice
    q: "This script reads 19.2. What does it print?"
    code: |-
      tenths=192
      if [ "$tenths" -lt 205 ]; then
        echo WARN
      elif [ "$tenths" -lt 195 ]; then
        echo ALERT
      else
        echo OK
      fi
    options: ["`WARN`", "`ALERT`", "`WARN` then `ALERT`", "`OK`"]
    answer: 0
    explain: >-
      Only the first branch whose test succeeds runs. 192 is below 205, so it's WARN, and the
      ALERT test is never reached. Test the most serious case first.
  - type: choice
    q: "What does `[ -f \"$conf\" ] || exit 2` do?"
    options:
      - "If `$conf` isn't a file that exists, the script stops with status 2"
      - "If `$conf` exists, the script stops with status 2"
      - "It creates `$conf` if it's missing"
      - "It always exits, with 2 if the file is missing"
    answer: 0
    explain: >-
      `||` runs the right side only when the left side fails. The test fails when there's no
      such file, so that's when `exit 2` runs. It's a one-line guard: `if [ ! -f "$conf" ]; then
      exit 2; fi`.
  - type: choice
    q: "With `file=scrubber.log.gz`, which line does this print?"
    code: |-
      case "$file" in
        *.log) echo "plain log" ;;
        *.gz)  echo "compressed" ;;
        *)     echo "something else" ;;
      esac
    options: ["`compressed`", "`plain log`", "`plain log` then `compressed`", "`something else`"]
    answer: 0
    explain: >-
      A `case` pattern has to match the whole value, like a glob. `*.log` doesn't, because the
      name ends in `.gz`. Only the first matching pattern's commands run, and `*)` catches
      everything else.
  - type: fill
    q: "Which `[ ]` test is true when a string is empty? (`[ ___ \"$name\" ]`)"
    answer: ["-z"]
    explain: >-
      `-z` is true for a zero-length string, `-n` for a non-empty one. Quote the variable: an
      unquoted empty variable vanishes and leaves `[ -z ]`, which is true for the wrong reason.
cards:
  - id: if-runs-a-command
    section: "`if` runs a command"
    front: What does `if` actually check?
    back: "A command's exit status. 0 runs the `then` branch; anything else doesn't. `[ ]` is just a command."
  - id: brackets-need-spaces
    section: "Tests: `[ ]`"
    front: "Why does `[\"$a\" = x]` fail?"
    back: "`[` is a command, so it needs spaces around it and before `]`: `[ \"$a\" = x ]`."
  - id: whole-numbers-only
    section: "Whole numbers only"
    front: Compare `19.2` with `19.5` in bash
    back: "You can't directly: `-lt` is whole numbers only. Compare 192 and 195 tenths instead."
  - id: or-as-a-guard
    section: "`&&` and `||`: short ifs"
    front: "What does `a || b` run?"
    back: "`b` only if `a` fails. `a && b` runs `b` only if `a` succeeds."
terminal:
  task: |
    `/station/bin/o2-check` reads the O2 sensor and prints the reading. That's all it does, so at
    03:00 it printed `O2 19.2%` for an hour and nobody noticed. Make it decide:

    1. **Refuse to run without a sensor.** If the file in `$sensor` doesn't exist, print
       `o2-check: no sensor at PATH` (with the real path) to stderr and **exit 2**.
    2. **Judge the reading.** Print `ALERT`, `WARN` or `OK` in front of it, as in `WARN O2 20.1%`:
       - below 19.5%: `ALERT`, and **exit 1**
       - below 20.5%: `WARN`
       - otherwise: `OK`

    The script already counts the reading in tenths for you, because bash compares whole numbers
    only.

    3. **Test every case** before trusting it at 03:00. MERIDIAN keeps test readings in
       `/station/sensors/test`: `low`, `border` and `normal`. There's no `missing`, on purpose.
       `O2_SENSOR` points the script at one for a single run. Run it on all four, logging what
       it prints and its exit status, like this for `low`:

       ```bash
       O2_SENSOR=/station/sensors/test/low o2-check >> ~/o2-test.log 2>&1; echo "exit $?" >> ~/o2-test.log
       ```

    Edit it with `nano /station/bin/o2-check`.
  cwd: /home/cadet
  env: {PATH: "/station/bin:/usr/local/bin:/usr/bin:/bin"}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /station/sensors, type: dir, owner: root, group: root}
    - {path: /station/sensors/o2, owner: root, group: root, contents: "O2 20.4% (ring A 20.7 · ring B 20.1)\n"}
    - {path: /station/sensors/test, type: dir, owner: root, group: root}
    - {path: /station/sensors/test/low, owner: root, group: root, contents: "O2 19.2% (ring A 19.6 · ring B 18.8)\n"}
    - {path: /station/sensors/test/border, owner: root, group: root, contents: "O2 19.5% (ring A 19.7 · ring B 19.3)\n"}
    - {path: /station/sensors/test/normal, owner: root, group: root, contents: "O2 20.9% (ring A 21.0 · ring B 20.8)\n"}
    - {path: /station/bin, type: dir, owner: root, group: crew, mode: "775"}
    - path: /station/bin/o2-check
      mode: "775"
      group: crew
      contents: |
        #!/usr/bin/env bash
        # The O2 check: is the air safe to breathe?
        # It reads the sensor that O2_SENSOR names, or the live one.
        sensor=${O2_SENSOR:-/station/sensors/o2}

        # The sensor says "O2 19.2% (ring A …)". Keep the number: 19.2
        reading=$(cut -d' ' -f2 "$sensor" | cut -d% -f1)

        # Bash compares whole numbers only, so count in tenths: 19.2 is 192.
        whole=${reading%.*}
        tenth=${reading#*.}
        tenths=$((whole * 10 + tenth))

        echo "O2 $reading%"
  checks:
    - {contains: /home/cadet/o2-test.log, text: "ALERT O2 19.2%\nexit 1"}
    - {contains: /home/cadet/o2-test.log, text: "WARN O2 19.5%\nexit 0"}
    - {contains: /home/cadet/o2-test.log, text: "OK O2 20.9%\nexit 0"}
    - {contains: /home/cadet/o2-test.log, text: "o2-check: no sensor at /station/sensors/test/missing\nexit 2"}
    - {executable: /station/bin/o2-check}
  success: |-
    Okafor reads the log twice. "Four cases, four right answers. Now it can be trusted while we sleep."
  solution:
    - O2_SENSOR=/station/sensors/test/missing o2-check
    - cat /station/bin/o2-check
    - |-
      cat > /station/bin/o2-check <<'EOF'
      #!/usr/bin/env bash
      # The O2 check: is the air safe to breathe?
      # It reads the sensor that O2_SENSOR names, or the live one.
      sensor=${O2_SENSOR:-/station/sensors/o2}

      if [ ! -f "$sensor" ]; then
        echo "o2-check: no sensor at $sensor" >&2
        exit 2
      fi

      # The sensor says "O2 19.2% (ring A …)". Keep the number: 19.2
      reading=$(cut -d' ' -f2 "$sensor" | cut -d% -f1)

      # Bash compares whole numbers only, so count in tenths: 19.2 is 192.
      whole=${reading%.*}
      tenth=${reading#*.}
      tenths=$((whole * 10 + tenth))

      if [ "$tenths" -lt 195 ]; then
        echo "ALERT O2 $reading%"
        exit 1
      elif [ "$tenths" -lt 205 ]; then
        echo "WARN O2 $reading%"
      else
        echo "OK O2 $reading%"
      fi
      EOF
    - O2_SENSOR=/station/sensors/test/low o2-check >> ~/o2-test.log 2>&1; echo "exit $?" >> ~/o2-test.log
    - O2_SENSOR=/station/sensors/test/border o2-check >> ~/o2-test.log 2>&1; echo "exit $?" >> ~/o2-test.log
    - O2_SENSOR=/station/sensors/test/normal o2-check >> ~/o2-test.log 2>&1; echo "exit $?" >> ~/o2-test.log
    - O2_SENSOR=/station/sensors/test/missing o2-check >> ~/o2-test.log 2>&1; echo "exit $?" >> ~/o2-test.log
    - cat ~/o2-test.log
comms:
  open:
    - {from: meridian, text: "O2 19.2% · BELOW SAFE MINIMUM · 03:00–04:00 · UNACKNOWLEDGED"}
    - {from: okafor, text: "An hour. It printed that every minute for an hour and nobody was reading."}
    - {from: okafor, text: "`o2-check` should decide, not just print. ALERT, WARN or OK, and an exit status something else can act on."}
  console_done:
    - {from: meridian, text: "O2 CHECK · 4 CASES · ALERT EXIT 1 · NO SENSOR EXIT 2"}
    - {from: okafor, text: "Good. Without that file test, a missing sensor read as 0% and called an ALERT. A broken sensor isn't an emergency, it's a different job."}
  complete:
    - {from: okafor, text: "It decides now. But four test runs was four lines of typing. Tomorrow it learns to repeat itself."}
---

## `if` runs a command

`if` doesn't evaluate a true-or-false expression, as in most languages. **`if` runs a command and
checks its exit status**: 0 runs the `then` branch, anything else doesn't.

```bash
if grep -q "FAULT" scrubber.log; then
  echo "the scrubber logged a fault"
fi
```

`grep -q` prints nothing and exits 0 if it found a match. Any command works there, which is
why exit statuses (day 13) are the language conditions speak.

## Tests: `[ ]`

To compare values, use the command `test`, usually written `[ … ]`. `[` really is a command, so
it **needs spaces** around it and before the `]`: `[ "$a" = x ]`, never `["$a" = x]`.

| Test | True when |
|---|---|
| `[ "$a" = "$b" ]`, `[ "$a" != "$b" ]` | the strings are equal, or not |
| `[ -z "$a" ]`, `[ -n "$a" ]` | the string is empty, or not |
| `[ "$n" -eq 5 ]` | the numbers are equal; also `-ne`, `-gt`, `-ge`, `-lt` (less than), `-le` |
| `[ -e "$p" ]` | something exists at that path |
| `[ -f "$p" ]`, `[ -d "$p" ]` | it's a regular file, or a directory |
| `[ -r "$p" ]`, `[ -w "$p" ]`, `[ -x "$p" ]` | you can read it, write it, run it |
| `[ ! -f "$p" ]` | `!` turns any test around: here, *not* a file |

Quote the variables inside. Unquoted, an empty one vanishes and `[` sees the wrong number of
words: `[ = x ]` fails with bash's own `unary operator expected`.

## Whole numbers only

`-lt` and the other number tests compare **whole numbers only**. Give one a `19.2` and it fails
with `integer expression expected`. When readings have a decimal place, count in tenths and
compare those:

```bash
temp=21.5                           # degrees
whole=${temp%.*}                    # 21
tenth=${temp#*.}                    # 5
tenths=$((whole * 10 + tenth))      # 215
[ "$tenths" -gt 250 ] && echo "too warm"
```

## `elif` and `else`

```bash
if [ "$pressure" -lt 95 ]; then
  echo "LOW"
elif [ "$pressure" -gt 105 ]; then
  echo "HIGH"
else
  echo "NOMINAL"
fi
```

Bash tries each test in turn and runs **the first one whose test succeeds**, then skips the rest.
So the order matters: when one range sits inside another ("below 50" is also "below 80"),
test the most serious one first. `else` runs when no test succeeded. `fi` closes it.

## `[[ ]]`: bash's own test

`[[ … ]]` is part of bash itself, not a command, so it's more forgiving. It doesn't split
variables (an empty one doesn't break it), `==` compares against a glob (`[[ $host == web-* ]]`),
and `&&` and `||` work inside it. `[ ]` works in every shell, `sh` included; `[[ ]]` only in
bash. In a `#!/usr/bin/env bash` script, either is fine.

## `&&` and `||`: short ifs

For one command, an `if` is often written short:

| You write | Runs the right side |
|---|---|
| `mkdir -p "$dir" && cd "$dir"` | only if the left side **succeeded** |
| `[ -d "$dir" ] \|\| mkdir "$dir"` | only if the left side **failed** |

A guard at the top of a script reads `[ -f "$conf" ] || exit 2`: no config, no run.

## `case`: matching patterns

When one value could match several patterns, `case` reads better than a chain of `elif`s:

```bash
case "$file" in
  *.gz)        zcat "$file" ;;
  *.log|*.txt) cat "$file" ;;
  *)           echo "don't know how to read $file" ;;
esac
```

Each pattern is a glob that has to match the whole value. `|` separates alternatives, `;;` ends
each branch, and only the first match runs. `*)` catches anything left over.

## Failing well

A script that something else runs, like cron, a pipeline or another script, talks back through
its exit status. **`exit N` ends the script with status N**, so give each kind of failure its own
number and say what went wrong. Error messages go to stderr with `>&2` (day 7), so they don't
mix with the script's real output:

```bash
if [ ! -d "$backup_dir" ]; then
  echo "backup: no directory at $backup_dir" >&2
  exit 2
fi
```

To try a script against a test file, set a variable **for a single run** by writing it in front
of the command: `BACKUP_DIR=/tmp/test backup` (day 9).

**On the real station:** every release of this app runs `scripts/install_compose.sh` on the
droplet, and it opens with exactly these guards. A `case` refuses any mode but `release` or
`rollback` with `exit 2`, `if [ ! -f "$STAGED" ]` stops if the new compose file never arrived,
and `if [ "$ACTUAL" != "$EXPECTED" ]` refuses one whose checksum is wrong. GitHub Actions reads
the non-zero status and marks the deploy failed before anything is swapped.

## Try it

```bash
cd "$(mktemp -d)"
echo "FAULT ring-b" > scrubber.log
if grep -q FAULT scrubber.log; then echo "fault found"; fi
[ -f scrubber.log ] && echo "a file"
[ -d scrubber.log ] || echo "not a directory"
[ 19.2 -lt 19.5 ]                   # integer expression expected
echo $?                             # 2: the test itself went wrong
t=19.2; echo $(( ${t%.*} * 10 + ${t#*.} ))   # 192
f=notes.txt.gz
case "$f" in *.gz) echo compressed ;; *) echo plain ;; esac
name=""; [ -z "$name" ] && echo "empty"
```
