---
# No console task: a lab (#406). The station console has no python3, and a challenge can't take
# command-line arguments from a terminal or join a pipeline, so this runs on the learner's own machine.
title: A proper CLI
minutes: 20
story: |
  **Mission log, day 52.** The bay's report script has a line near the top, `DECK = "C"`, and everyone
  who runs it edits that line first. Twice this week someone ran it with somebody else's edit still in
  it. "A tool you have to open to use isn't a tool," says Okafor. "Make it ask."
quiz:
  - type: choice
    q: "The script is run with `--max-level 10`. What is `args.max_level`?"
    code: |-
      parser.add_argument("--max-level", type=float, default=0)
      args = parser.parse_args()
    lang: python
    options:
      - "`\"10\"`: everything typed on a command line arrives as text"
      - "An error: a name with a `-` in it can't be read with a dot"
      - "It's stored under `args[\"max-level\"]`, with the dash, as typed"
      - "`10.0`: converted by `type=float`, under an underscore"
    answer: 3
    explain: >-
      `type=float` makes argparse convert the text, and refuse it if it can't. Python names can't hold a
      `-`, so `--min-mass` is stored as `args.min_mass`.
  - type: choice
    q: "The report lists three crates, then a summary line. Why does `| wc -l` count 4?"
    code: |-
      for crate in crates:
          print(crate)
      print(f"{len(crates)} crates")
    lang: python
    options:
      - "`wc -l` counts the command line itself as one of the lines it read"
      - "The summary went down the pipe too: print it with `file=sys.stderr`"
      - "`print` adds a blank line at the end, and `wc` counts that one too"
      - "A pipe always adds one line of its own, so take 1 from what `wc` says"
    answer: 1
    explain: >-
      A pipe carries stdout only. Data on stdout and remarks on stderr, and `wc -l` counts just the three
      crates, while the summary still shows in the terminal.
  - type: choice
    q: "What does argparse do when it's given `--min-mass heavy` for a `type=float` option?"
    options:
      - "It prints the usage and the error on stderr, and exits with 2"
      - "It sets `args.max_level` to `None`, and the script carries on without it"
      - "It raises a `ValueError` with a traceback, as `float(\"heavy\")` would"
      - "It asks the person to type the value again, and then it carries on"
    answer: 0
    explain: >-
      argparse checks every argument before your code runs, and stops with the usage line, a message
      saying which argument was wrong, and exit status 2, as most command-line tools do for a bad usage.
  - type: fill
    q: "Which `action` makes `--json` an on-off switch: `True` when it's given, `False` when it isn't?"
    answer: ["store_true", "action=\"store_true\"", "action='store_true'"]
    explain: >-
      `parser.add_argument("--json", action="store_true")`. It takes no value of its own.
  - type: choice
    q: "`parser.add_argument(\"path\")` is the only argument, and the script is run with none. What happens?"
    options:
      - "`args.path` is `None`, and the script carries on without a path"
      - "`args.path` is the empty string `\"\"`, so the open fails later on"
      - "argparse stops: `the following arguments are required: path`"
      - "Python asks for the path on the next line, as `input()` would do"
    answer: 2
    explain: >-
      A name without dashes is a positional argument, and a positional is required. Only an option,
      written with `--`, can be left out, and then it's `None` or its `default`.
cards:
  - id: positional-or-option
    section: "Options"
    front: What's the difference between `add_argument("tank")` and `add_argument("--level")`?
    back: "`tank` is positional and required, taken by its place. `--level` is an option, named on the command line, and `None` when it's left out."
  - id: dash-to-underscore
    section: "Options"
    front: Under what name does argparse store `--max-level`?
    accept: ["args.max_level", "max_level"]
    back: "`args.max_level`: the dashes go, and the one in the middle becomes an underscore."
  - id: stderr-for-talk
    section: "stdout is data, stderr is talk"
    front: How do you print a message to stderr?
    back: "`print(message, file=sys.stderr)`, after `import sys`. A pipe or `>` takes stdout only, so it stays on the screen."
  - id: exit-two
    section: "`--help` and errors, for free"
    front: What exit status does argparse give for a bad command line?
    back: "2, after the usage line and a message on stderr. 1 is for the script's own failures."
lab:
  from: okafor
  task: |-
    Turn the bay's report into a command-line tool, `bay_report.py`, that nobody has to edit to run.
    On Windows, do all of it in Git Bash (Unit 1.3, *Your first repository*): the setup, `wc` and `$?`
    are Bash's, and PowerShell has none of them.

    1. Run the setup below. It makes `~/meridian/bay-report` with `received.csv`, the bay's record from
       module 07. Stay in that folder.
    2. Write `bay_report.py` there, with a `main()` that gives back its exit status and the main guard
       (module 06). Use `argparse`, with exactly these, so `--help` reads the same for everyone:
       - the description **`List the crates the bay received.`**
       - a positional **`path`**, with the help **`the bay's received CSV`**
       - an option **`--deck`**, with the help **`only this deck's crates`**. Left out, every deck counts.
       - an option **`--min-mass`**, a `float` that's `0` when it's left out, with the help
         **`only crates at least this heavy, in kg`**
    3. Read the CSV with `csv.DictReader`. If the file isn't there, print
       **`bay_report: can't read PATH`** to **stderr**, with the path given in place of `PATH`, and
       give back `1`.
    4. For each crate that passes both filters, print its date, crate and mass to stdout, on one line
       with a space between each, and the mass as Python prints a `float`, such as `15.0`. Then print
       **`N crates, T kg`** to **stderr**, with the count in place of `N` and the total mass, as Python
       prints it, in place of `T`, and give back `0`.
    5. Run each command in the boxes below, and paste what it prints. In Git Bash, use `python` or `py`
       instead of `python3` if `python3` isn't found.
  setup: |-
    mkdir -p ~/meridian/bay-report && cd ~/meridian/bay-report
    cat > received.csv <<'CSV'
    date,crate,deck,mass
    2026-09-16,C-301,A,40.5
    2026-09-16,C-302,B,12.0
    2026-09-16,C-303,A,7.25
    2026-09-23,C-313,B,4.0
    2026-09-23,C-311,C,15.0
    2026-09-23,C-314,C,11.75
    2026-09-23,C-312,A,26.5
    2026-09-30,C-321,B,30.0
    2026-09-30,C-322,A,18.5
    2026-09-30,C-323,C,61.0
    2026-09-30,C-324,B,9.0
    2026-10-07,C-331,A,22.0
    2026-10-07,C-332,C,8.5
    2026-10-07,C-333,B,40.0
    CSV
  boxes:
    - prompt: What `python3 bay_report.py --help` prints.
      checks:
        - {contains: "usage: bay_report.py", says: "argparse wrote the usage line, named after the script", hint: "Is the file called bay_report.py, and does it make an ArgumentParser?"}
        - {contains: "List the crates the bay received.", says: "The description, as the task gives it"}
        - {regex: '\[--deck DECK\]', says: "An option called --deck", hint: "Is deck in the usage line, in square brackets?"}
        - {regex: '\[--min-mass MIN_MASS\]', says: "An option called --min-mass"}
        - {regex: '(\] |^\s+)path\s*$', says: "A positional called path, last on the usage line", hint: "Does the usage line end in path?"}
        - {contains: "the bay's received CSV", says: "path's help"}
        - {contains: "only this deck's crates", says: "--deck's help"}
        - {regex: 'only crates at least\s+this heavy,\s+in kg', says: "--min-mass's help"}
      example: |
        usage: bay_report.py [-h] [--deck DECK] [--min-mass MIN_MASS] path

        List the crates the bay received.

        positional arguments:
          path                 the bay's received CSV

        options:
          -h, --help           show this help message and exit
          --deck DECK          only this deck's crates
          --min-mass MIN_MASS  only crates at least this heavy, in kg
    - prompt: What `python3 bay_report.py received.csv --deck C --min-mass 10; echo "exit $?"` prints.
      checks:
        - {contains: "2026-09-23 C-311 15.0", says: "A deck C crate over 10 kg is listed"}
        - {contains: "2026-09-30 C-323 61.0", says: "Every deck C crate over 10 kg is listed", hint: "Is every row read, or only the first few?"}
        - {contains: "2026-09-23 C-314 11.75", says: "Crate C-314, the third deck C crate over 10 kg, is listed"}
        - {not_contains: "C-332", says: "A deck C crate under 10 kg is left out", hint: "Is the mass compared with what --min-mass gave, after both are numbers?"}
        - {not_contains: "C-301", says: "Other decks are left out", hint: "Is --deck compared with each row's deck?"}
        - {contains: "3 crates, 87.75 kg", says: "The summary counts and totals what was listed"}
        - {contains: "exit 0", says: "It exits 0", hint: "Does main give back 0, and does the guard hand it to sys.exit?"}
      example: |
        2026-09-23 C-311 15.0
        2026-09-23 C-314 11.75
        2026-09-30 C-323 61.0
        3 crates, 87.75 kg
        exit 0
    - prompt: What `python3 bay_report.py received.csv --deck C --min-mass 10 | wc -l` prints.
      checks:
        - {regex: '^\s*3\s*$', says: "Only the three crates went down the pipe", hint: "Did the summary go to stdout? A pipe carries stdout only."}
        - {contains: "3 crates, 87.75 kg", says: "The summary still reached the screen, on stderr"}
      example: |
        3 crates, 87.75 kg
        3
    - prompt: What `python3 bay_report.py missing.csv; echo "exit $?"; python3 bay_report.py received.csv --min-mass heavy; echo "exit $?"` prints.
      checks:
        - {contains: "bay_report: can't read missing.csv", says: "A missing file gets the script's own message", hint: "What does the script do when open can't find the file?"}
        - {regex: '^exit 1$', says: "and exit status 1", hint: "Does main give back 1 when the file can't be read?"}
        - {contains: "error: argument --min-mass: invalid float value: 'heavy'", says: "argparse refuses a mass that isn't a number", hint: "Does heavy reach your code, or does argparse refuse it first?"}
        - {regex: '^exit 2$', says: "and exits with status 2"}
        - {not_contains: "Traceback", says: "No traceback: every failure is handled"}
      example: |
        bay_report: can't read missing.csv
        exit 1
        usage: bay_report.py [-h] [--deck DECK] [--min-mass MIN_MASS] path
        bay_report.py: error: argument --min-mass: invalid float value: 'heavy'
        exit 2
comms:
  open:
    - {from: meridian, text: "BAY REPORT · CONFIGURED BY: EDITING LINE 4 · EDITS THIS WEEK: 11"}
    - {from: okafor, text: "Eleven edits to one line, and two reports run on someone else's deck."}
    - {from: okafor, text: "Make it take its settings on the command line, say what it wants when asked, and fail properly when it's given nonsense."}
  lab_done:
    - {from: meridian, text: "BAY REPORT · DECK C · AT LEAST 10 KG · CRATES: 3 · 87.75 KG"}
    - {from: okafor, text: "And it's quiet down a pipe. Data on stdout, talk on stderr. Someone else's script can use that now."}
  complete:
    - {from: okafor, text: "Nobody opens it any more. They ask it. That's the difference between a script and a tool."}
---

## Arguments, not edited constants

A script that's changed by editing a line at the top gets run with the wrong edit sooner or later.
**`argparse`, in the standard library, reads the command line instead**: what came after the script's
name, the way Bash's `$1` does, but with names, checks and a help page.

```python
import argparse

parser = argparse.ArgumentParser(description="Report a tank's level.")
parser.add_argument("tank", help="the tank to report")
args = parser.parse_args()
print(f"tank {args.tank}")
```

```text
$ python3 tank.py T-4
tank T-4
```

**`ArgumentParser` makes the parser**, and `description=` is the line its help page opens with.
**`add_argument("tank")` adds a positional argument**: a name with no dashes, taken by its place on the
command line, and **required**. **`parse_args()` reads the command line and gives back `args`**, with
each argument under its own name, `args.tank`. Every value arrives as a string unless you say
otherwise.

## Options

**An argument whose name starts with `--` is an option**: named on the command line, given in any order,
and allowed to be left out.

| Write | Gives |
|---|---|
| `add_argument("--deck")` | **`args.deck`, the text after `--deck`, or `None` when it's left out** |
| `add_argument("--level", type=float, default=0)` | **`type=float` converts it, and refuses what isn't a number**; `default=` is the value when it's left out, used as written: `default=0` stays the whole number `0` |
| `add_argument("--quiet", action="store_true")` | **a switch: `True` when it's given, `False` when it isn't**, with no value after it |

**A dash in the name becomes an underscore in `args`**, since a Python name can't hold one:
`--max-level` is `args.max_level`. Test for a left-out option with `is None`, as in module 03.

## `--help` and errors, for free

**argparse writes a help page from what you added**, printed by `-h` or `--help`, and `help=` on each
argument is the line beside it:

```text
$ python3 tank.py --help
usage: tank.py [-h] tank

Report a tank's level.

positional arguments:
  tank        the tank to report

options:
  -h, --help  show this help message and exit
```

Older Pythons, 3.9 for example, say `optional arguments:` where newer ones say `options:`. **In the
usage line, an option is in square brackets, because it's optional, with its value in capitals**:
`[--level LEVEL]` means `--level` and a value after it, as in a man page's synopsis (Bash scripting,
*Reading and editing on a server*).

**A command line argparse can't use stops the script before your code runs**: a missing positional
(`the following arguments are required: tank`), an unknown option, or a value `type=` refuses
(`argument --level: invalid float value: 'full'`). **It prints the usage line and the problem on stderr, and
exits with status 2**, which most command-line tools use for "you used me wrong".

## stdout is data, stderr is talk

A program has two outputs. **stdout is for the data**, what another program might want. **stderr is for
talk**: errors, warnings, summaries for the person watching. **A pipe and `>` take stdout only**, so
whatever's on stderr still reaches the screen (Unit 1.1, *Pipes and redirection*).

**`print(..., file=sys.stderr)` prints to stderr**, after `import sys`:

```python
print("T-4 3.5")
print("1 tank reported", file=sys.stderr)
```

```text
$ python3 report.py | wc -l
1 tank reported
1
```

`wc -l` counted one line, the data, and the summary went past the pipe to the screen. On a terminal
stdout appears a line at a time, but sent anywhere else it's saved up and written in batches, so the two
outputs can come out in a different order when they aren't going to a terminal.

**Exit statuses finish the job**: 0 for success, 1 for the script's own failures, such as a file that
isn't there, and argparse's 2 for a bad command line. Then a Bash script that runs yours can tell them apart
with `$?`.

**To turn a missing file into status 1, put the whole `with open` block inside the `try`.** `open` is
the line that can fail, and nothing else in the block raises `FileNotFoundError`, so nothing is caught
by mistake. Then `return 1` from the `except`:

```python
try:
    with open(args.tank) as f:
        lines = f.read().splitlines()
except FileNotFoundError:
    print(f"tank.py: can't read {args.tank}", file=sys.stderr)
    return 1
```

**On the real station:** `scripts/create_user.py`, the script that made your account, is a CLI like
this. `parser.add_argument("username")` is its positional, `--admin` is a switch with
`action="store_true"`, and its complaints, such as `Passwords do not match.`, are printed with
`file=sys.stderr` before `main()` gives back 1.

## Try it

On your own machine, if you have one to hand. Python is the only thing it needs (module 01). On
Windows, run it in Git Bash, and use `python` or `py` there if `python3` isn't found.

```bash
cd "$(mktemp -d)"
cat > tank.py <<'EOF'
import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description="Report a tank's level.")
    parser.add_argument("tank", help="the tank to report")
    parser.add_argument("--level", type=float, default=0, help="its level, in bar")
    parser.add_argument("--quiet", action="store_true", help="no summary")
    args = parser.parse_args()
    print(args.tank, args.level)
    if not args.quiet:
        print("1 tank reported", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
EOF
python3 tank.py --help
python3 tank.py T-4 --level 3.5
python3 tank.py T-4 --level 3.5 2>/dev/null
python3 tank.py T-4 --quiet
python3 tank.py T-4 | wc -l
python3 tank.py; echo "exit $?"
python3 tank.py T-4 --level full; echo "exit $?"
```

After the help page, in order:

| Command | Prints |
|---|---|
| `--level 3.5` | `T-4 3.5`, then `1 tank reported` |
| `--level 3.5 2>/dev/null` | `T-4 3.5`: stderr thrown away |
| `--quiet` | `T-4 0`: the default level, as written |
| `\| wc -l` | `1 tank reported` on the screen, then `1`: one line went down the pipe |
| no tank | the usage line, `the following arguments are required: tank`, `exit 2` |
| `--level full` | the usage line, `argument --level: invalid float value: 'full'`, `exit 2` |

The last two fail on purpose. There are no `#` comments on these lines because a Mac's zsh, at its
prompt, passes a `#` and everything after it to the command as arguments.
