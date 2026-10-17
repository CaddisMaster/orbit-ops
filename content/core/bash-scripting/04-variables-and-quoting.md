---
title: Variables and quoting
minutes: 20
story: |
  **Mission log, day 14.** Last night's cargo report counted half the bay. A new manifest
  arrived called `Spare Parts.csv`, with a space in its name, and the report script tripped over
  it. "The auditor reads that report," says Okafor. "Fix it before she does."
quiz:
  - type: choice
    q: "Why does this line fail?"
    code: |-
      $ backup_dir = /srv/backups
      backup_dir: command not found
    options:
      - "Spaces around `=` make it a command called `backup_dir` with two arguments, not an assignment"
      - "Variable names can't contain an underscore"
      - "`/srv/backups` doesn't exist yet"
      - "Variables have to be declared with `var` first"
    answer: 0
    explain: >-
      An assignment is one word: `backup_dir=/srv/backups`, with no spaces. With spaces, the
      shell reads the first word as a command to run, as it always does.
  - type: choice
    q: "What does this print?"
    code: |-
      $ name=Okafor
      $ echo 'Hello $name' "Hello $name"
    options: ["`Hello $name Hello Okafor`", "`Hello Okafor Hello Okafor`", "`Hello $name Hello $name`", "An error"]
    answer: 0
    explain: >-
      Single quotes keep everything literally, `$` included. Double quotes still expand `$name`
      (and `$(…)`), but keep the result as one word.
  - type: choice
    q: "A script runs this with `file='Crew Roster.txt'`. What happens, and why?"
    code: |-
      $ cat $file
      cat: Crew: No such file or directory
      cat: Roster.txt: No such file or directory
    options:
      - "Unquoted, `$file` is split at the space into two arguments. `cat \"$file\"` keeps it whole"
      - "`cat` can't read files with spaces in their names"
      - "The file has to be renamed without spaces"
      - "`$file` should be written `${file}`"
    answer: 0
    explain: >-
      After expanding an unquoted variable, the shell splits it at spaces and expands any glob
      characters in it. Double quotes stop both. `${file}` only marks where the name ends, so it
      would split just the same.
  - type: fill
    q: "With `a=7` and `b=5`, what does `echo $((a * b + 1))` print?"
    answer: ["36"]
    explain: >-
      `$(( … ))` is integer arithmetic. Inside it, variables don't need their `$`, and the usual
      precedence applies: 7 × 5 + 1.
  - type: choice
    q: "What does `echo \"${REGION:-eu-west}\"` print if `REGION` was never set?"
    options: ["`eu-west`", "Nothing", "`REGION`", "An error"]
    answer: 0
    explain: >-
      `${VAR:-default}` uses the default when VAR is unset or empty, without changing VAR. It's
      how a script takes a setting from the environment but still works without it.
cards:
  - id: no-spaces-around-equals
    section: "Variables"
    front: Assign a variable in bash
    back: "`name=value`, with no spaces around `=`. With spaces it's a command called `name`."
  - id: quote-your-variables
    section: "Why unquoted variables break"
    front: Why write `"$file"` instead of `$file`?
    back: "Unquoted, the value is split at spaces and its globs are expanded. Double quotes keep it one word."
  - id: single-vs-double-quotes
    section: "Quotes: single and double"
    front: "Single vs double quotes"
    back: "`'…'` keeps everything literally. `\"…\"` still expands `$var` and `$(…)`, as one word."
  - id: default-value
    section: "Defaults: `${VAR:-default}`"
    accept: ["${VAR:-default}"]
    front: "Use a default if a variable isn't set"
    back: "`${VAR:-default}`"
terminal:
  task: |
    `/station/bin/cargo-report` writes `/station/cargo/report.txt`: how many items are on each
    manifest in `/station/cargo/manifests`, one item per line. Last night it choked on
    `Spare Parts.csv` and left that count blank. Run it and read its errors first.

    1. **Fix it** so it counts `Spare Parts.csv` too. Every line of its report should read like
       `Food: 22 items`.
    2. **Add a total.** Keep each count in a variable with `$( … )`, then add a last line
       `Total: N items` with the three added up by `$(( … ))`.

    Run it again and check `report.txt`. Edit it with `nano /station/bin/cargo-report`.
  cwd: /home/cadet
  env: {PATH: "/station/bin:/usr/local/bin:/usr/bin:/bin"}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /station/cargo, type: dir, owner: root, group: crew, mode: "775"}
    - {path: /station/cargo/manifests, type: dir, owner: root, group: crew, mode: "775"}
    - path: /station/cargo/manifests/Spare Parts.csv
      contents: |
        o2-sensor,4
        co2-sensor,4
        scrubber-bed,2
        valve-seal,12
        filter-mesh,30
        pump-impeller,2
        fan-belt,6
        pressure-gauge,3
        circuit-board,5
        fuse-10a,40
        coolant-hose,8
        gasket-kit,10
        drive-motor,1
        bearing,24
    - path: /station/cargo/manifests/food.csv
      contents: |
        ration-pack,400
        coffee,60
        tea,40
        rice,25
        oats,30
        dried-fruit,20
        protein-bar,200
        soup,80
        pasta,25
        beans,50
        lentils,30
        sugar,10
        salt,5
        spice-kit,4
        powdered-milk,20
        honey,6
        peanut-butter,12
        crackers,40
        chocolate,30
        vitamin-pack,90
        flour,15
        yeast,4
    - path: /station/cargo/manifests/water.csv
      contents: |
        potable-tank-a,1
        potable-tank-b,1
        grey-tank,1
        filter-cartridge,12
        uv-lamp,4
        purifier-kit,2
        hose-coupling,8
        valve-assembly,3
        test-strips,100
    - {path: /station/bin, type: dir, owner: root, group: crew, mode: "775"}
    - path: /station/bin/cargo-report
      mode: "775"
      contents: |
        #!/usr/bin/env bash
        # The cargo report: how many items are on each manifest.
        dir=${CARGO_DIR:-/station/cargo/manifests}
        report=/station/cargo/report.txt

        parts=$dir/Spare Parts.csv
        food=$dir/food.csv
        water=$dir/water.csv

        echo "Cargo report" > $report
        echo "Spare Parts: $(wc -l < $parts) items" >> $report
        echo "Food: $(wc -l < $food) items" >> $report
        echo "Water: $(wc -l < $water) items" >> $report
  checks:
    - {contains: /station/cargo/report.txt, text: "Spare Parts: 14 items"}
    - {contains: /station/cargo/report.txt, text: "Food: 22 items"}
    - {contains: /station/cargo/report.txt, text: "Water: 9 items"}
    - {contains: /station/cargo/report.txt, text: "Total: 45 items"}
    - {contains: /station/bin/cargo-report, text: "$(("}
    - {executable: /station/bin/cargo-report}
  success: |-
    Okafor runs his finger down the report. "Forty-five, and every one of them counted. The auditor can read that."
  solution:
    - cargo-report
    - cat /station/cargo/report.txt
    - cat /station/bin/cargo-report
    - |-
      cat > /station/bin/cargo-report <<'EOF'
      #!/usr/bin/env bash
      # The cargo report: how many items are on each manifest.
      dir=${CARGO_DIR:-/station/cargo/manifests}
      report=/station/cargo/report.txt

      parts="$dir/Spare Parts.csv"
      food="$dir/food.csv"
      water="$dir/water.csv"

      p=$(wc -l < "$parts")
      f=$(wc -l < "$food")
      w=$(wc -l < "$water")

      echo "Cargo report" > "$report"
      echo "Spare Parts: $p items" >> "$report"
      echo "Food: $f items" >> "$report"
      echo "Water: $w items" >> "$report"
      echo "Total: $((p + f + w)) items" >> "$report"
      EOF
    - cargo-report
    - cat /station/cargo/report.txt
comms:
  open:
    - {from: meridian, text: "CARGO REPORT · SPARE PARTS · COUNT MISSING"}
    - {from: okafor, text: "Someone named a manifest `Spare Parts.csv`, with a space, and the report script counted it as nothing."}
    - {from: okafor, text: "The auditor reads that report. Fix it, and give her a total while you're in there."}
  console_done:
    - {from: meridian, text: "CARGO REPORT · 3 MANIFESTS · 45 ITEMS"}
    - {from: okafor, text: "Every variable in quotes. That's the habit. Most broken scripts are a missing pair of them."}
  complete:
    - {from: okafor, text: "It still does the same thing whatever happens. Tomorrow it learns to decide: if the CO2's high, say so."}
---

## Variables

A variable is a name for a value. Assign it with `=`, and **no spaces** around the `=`:

```bash
bay=/station/cargo          # an assignment
bay = /station/cargo        # NOT an assignment: "bay: command not found"
```

Read it back with a `$` in front: `$bay`. When something follows the name directly, braces
show where the name ends: `${bay}_old` is the value of `bay` followed by `_old`, while `$bay_old`
is a different variable called `bay_old` (probably empty).

Names are letters, digits and underscores, not starting with a digit. By convention, scripts use
lowercase for their own variables and UPPERCASE for ones from the environment, like `PATH` and
`HOME` (day 9).

## Quotes: single and double

| You write | You get | Because |
|---|---|---|
| `echo '$HOME'` | `$HOME` | single quotes keep everything exactly as typed |
| `echo "$HOME"` | `/home/sean` | double quotes expand `$` and `$( )`, but keep the result as one word |
| `echo $HOME` | `/home/sean` | the same here, but see below |

## Why unquoted variables break

After the shell expands an **unquoted** variable, it does two more things to the value:

1. It **splits** it into separate words at every space.
2. It treats any `*` or `?` in it as a **glob** and expands that too.

So with `file='Crew Roster.txt'`, the command `cat $file` becomes `cat Crew Roster.txt`, which
asks for two files called `Crew` and `Roster.txt`. And a redirect from it, `wc -l < $file`,
fails with **`ambiguous redirect`**, because a redirect needs exactly one file name. The same
error appears when the variable is empty.

**The fix is always the same: put double quotes around every expansion**, `"$file"`. It stays
one word, whatever is in it. Assignments need quotes too when the value has a space:
`file="$dir/Crew Roster.txt"`. Unquoted, the shell reads `Roster.txt` as a command to run.

## Command substitution: `$( … )`

`$(command)` runs the command and puts its output in its place, with the last newline removed:

| You write | You get |
|---|---|
| `today=$(date +%F)` | `today` holds `2026-10-11` |
| `count=$(wc -l < "$file")` | `count` holds the number of lines in the file |
| `echo "Logged in as $(whoami)"` | `Logged in as sean` |

Quote it like a variable, `"$(…)"`, when its output might have spaces in it.

## Arithmetic: `$(( … ))`

`$(( … ))` does whole-number arithmetic: `+ - * / %`, with brackets. Inside it, variables don't
need their `$`:

| You write | You get |
|---|---|
| `echo $((7 * 5 + 1))` | `36` |
| `total=$((a + b + c))` | the three added up |
| `echo $((10 / 3))` | `3`: whole numbers only, rounded down |

## Defaults: `${VAR:-default}`

`${VAR:-default}` is VAR's value, or `default` if VAR is unset or empty. Scripts use it to take a
setting from the environment and still work without one:

```bash
backup_dir=${BACKUP_DIR:-/srv/backups}
```

**On the real station:** this app's `test.sh` uses exactly this. It sets
`LOCKFILE="${TEST_SH_LOCKFILE:-/tmp/orbit-ops-test-sh.lock}"`, so a lock file of your own can be
named, and otherwise it uses the usual one. It also checks `"${SKIP_LINT:-}"`: empty unless
someone set it.

## Try it

```bash
name="Crew Roster.txt"
cd "$(mktemp -d)"
echo "Okafor" > "$name"
ls
cat $name                         # two errors: Crew, and Roster.txt
cat "$name"                       # Okafor
echo 'single: $name' "double: $name"
lines=$(wc -l < "$name"); echo "lines=$lines"
echo $((lines + 41))              # 42
echo "${MISSING:-a default}"
```
