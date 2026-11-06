---
# No console task: a challenge (#403). The station console has no python3 (module 01).
title: Errors and exit codes
minutes: 20
story: |
  **Mission log, day 49.** The bay's nightly cargo report didn't arrive. Its script met one bad
  record, stopped dead, and took the whole night's total with it. "One smudged line," says Okafor,
  "and we know nothing. That's not a script, that's a tripwire."
quiz:
  - type: choice
    q: "Where did this go wrong, and what went wrong?"
    code: |-
      Traceback (most recent call last):
        File "script.py", line 12, in <module>
          report(["T-1 4.5", "T-2 n/a"])
          ~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^
        File "script.py", line 9, in report
          total = total + reading(line)
                          ~~~~~~~^^^^^^
        File "script.py", line 3, in reading
          return float(line.split()[1])
      ValueError: could not convert string to float: 'n/a'
    lang: text
    options:
      - "Line 12: `report` was handed a list when it wanted one line of text"
      - "Line 9, in `report`: `total` was never set, so it couldn't be added to"
      - "Line 3, in `reading`: a field held `n/a`, which `float` can't use"
      - "Nowhere yet: a traceback is only a warning, and the script carried on"
    answer: 2
    explain: >-
      Read it from the bottom. The last line says what went wrong, and the frame just above it says
      where: line 3, in `reading`. The frames above that are only the calls that led there, and the
      `~` and `^` lines just mark the part of a line that was running. A traceback means the script
      stopped.
  - type: choice
    q: "Every line ends up counted as bad, the good ones too. Why?"
    code: |-
      for line in lines:
          try:
              total = total + flaot(line)
          except:
              bad = bad + 1
    lang: python
    options:
      - "`flaot` is a typo: each pass raises a `NameError`, and `except:` catches it"
      - "`try` can't go inside a loop, so the whole loop counts as one failure"
      - "`except:` runs after every pass of a loop, whether or not anything failed"
      - "Adding to `total` inside a `try` block is never allowed, so Python skips it"
    answer: 0
    explain: >-
      A bare `except:` catches every error there is, including a mistake in your own code. Write
      `except ValueError:` and the typo would stop the script with a `NameError` on the first line,
      which is exactly what you'd want.
  - type: choice
    q: "A script ends with `sys.exit(2)`. What does Bash's `echo $?` print straight after running it?"
    options:
      - "`0`, because the script finished without a traceback"
      - "`1`, because every non-zero exit is reported as 1"
      - "Nothing, because Python's exit codes don't reach Bash"
      - "`2`, the status the script asked for"
    answer: 3
    explain: >-
      `sys.exit(N)` is Python's `exit N`, and `$?` sees it. `sys.exit()` with nothing exits 0, and an
      uncaught exception exits 1.
  - type: fill
    q: "Which keyword makes your own function stop with an error, as in `ValueError(\"bad record\")`?"
    answer: ["raise"]
    explain: >-
      `raise ValueError("bad record")` stops the function exactly as an error Python found would, and
      the caller's `except ValueError:` catches it.
  - type: choice
    q: "`report.py` ends with `if __name__ == \"__main__\":` and `sys.exit(main())`. What happens when another script runs `import report`?"
    options:
      - "`main` runs, and then the script that imported it exits along with it"
      - "Nothing runs: imported, `__name__` is `\"report\"`, so the guard's block is skipped"
      - "Python refuses to import any file that calls `sys.exit` anywhere in it"
      - "`main` runs, and Python quietly ignores the `sys.exit` that follows it"
    answer: 1
    explain: >-
      `__name__` is `"__main__"` only in the file Python was asked to run. Imported, the file's
      functions are defined and nothing more, so the importer can call `report.main()` when it wants.
cards:
  - id: traceback-bottom-up
    section: "Reading a traceback"
    front: Which line of a traceback do you read first, and what does it tell you?
    back: "The bottom one: the error's type and message. The frame just above it is where it happened."
  - id: narrow-except
    section: "Catching one error: `try` and `except`"
    front: Why write `except ValueError:` rather than a bare `except:`?
    back: "A bare `except:` catches everything, your own typos and bugs included, so they look like bad data. Name the one error you expect."
  - id: raise-not-made-up
    section: "Raising your own: `raise`"
    front: A function can't do its job with the input it was given. Return 0, or raise?
    back: "Raise, for example `raise ValueError(\"bad record\")`. A made-up 0 gets added up as if it were real."
  - id: main-guard
    section: "Exit codes and the main guard"
    front: What are the last two lines of a script whose `main()` gives back its exit status?
    back: "`if __name__ == \"__main__\":`, then, indented, `sys.exit(main())`."
challenge:
  from: okafor
  task: |-
    `records` is last night's cargo report, one string per crate: the crate, its deck and its mass,
    separated by commas, like `"C-401,A,40.5"`. It's already in the editor. Leave it as it is. Some
    records are bad: a mass that's missing or isn't a number, or a record that hasn't got three
    fields at all.

    Finish three functions:

    1. **`parse_mass(record)`** returns the record's mass as a number. For a record without exactly
       three fields, it **raises a `ValueError`**. A mass that isn't a number raises one already,
       from `float`.
    2. **`summarise(records)`** returns a dict like `{"total": 12.5, "bad": 2}`: the total mass of
       the good records, and how many were bad. It calls `parse_mass` for each record, **catches
       only `ValueError`**, counts it and carries on. Any other error must still stop the script.
    3. **`main(records)`** prints a line of your own about the result, then **gives back** the exit
       status: `0` when every record was good, `1` when any was bad. It returns the number. It
       doesn't call `sys.exit` itself.

    Then finish the script so that, when it's run, it **exits with the status `main(records)` gives
    back**, using the main guard. Run it, and the editor shows the exit code under the output. Then
    Submit to run the checks.
  starter: |-
    import sys

    records = [
        "C-401,A,40.5",
        "C-402,B,12.0",
        "C-403,A,",
        "C-404,C,7.25",
        "C-405,C,heavy",
        "C-406,A",
        "C-407,B,30.0",
    ]


    def parse_mass(record):
        ...


    def summarise(records):
        ...


    def main(records):
        ...


    # Run main as a script here, exiting with the status it gives back.
  checks:
    - check: 'assert parse_mass("C-401,A,40.5") == 40.5'
      says: parse_mass gives a good record's mass as a number.
    - check: |-
        try:
            parse_mass("C-406,A")
            raised = False
        except ValueError:
            raised = True
        assert raised
      says: A record without three fields raises a ValueError, rather than giving back a made-up mass.
    - check: |-
        try:
            parse_mass("C-405,C,heavy")
            raised = False
        except ValueError:
            raised = True
        assert raised
      says: A mass that isn't a number raises a ValueError.
    - check: 'assert summarise(records) == {"total": 89.75, "bad": 3}'
      says: summarise adds up the good records and counts the bad ones, carrying on past each one.
    - check: |-
        try:
            summarise([42])
            surfaced = False
        except AttributeError:
            surfaced = True
        assert surfaced
      says: An error that isn't a bad record, such as a number where a record should be, still stops the script.
    - check: 'assert main(["C-1,A,1.0"]) == 0 and main(records) == 1'
      says: main gives back 0 when every record was good and 1 when any was bad.
    - check: assert __exit_code__ == 1
      says: Run as a script, it exits with the status main gives back, which for these records is 1.
  solution: |-
    import sys

    records = [
        "C-401,A,40.5",
        "C-402,B,12.0",
        "C-403,A,",
        "C-404,C,7.25",
        "C-405,C,heavy",
        "C-406,A",
        "C-407,B,30.0",
    ]


    def parse_mass(record):
        fields = record.split(",")
        if len(fields) != 3:
            raise ValueError(f"expected 3 fields: {record}")
        return float(fields[2])


    def summarise(records):
        total = 0
        bad = 0
        for record in records:
            try:
                mass = parse_mass(record)
            except ValueError:
                bad = bad + 1
                continue
            total = total + mass
        return {"total": total, "bad": bad}


    def main(records):
        result = summarise(records)
        total = result["total"]
        bad = result["bad"]
        print(f"total {total} kg, {bad} bad")
        if bad > 0:
            return 1
        return 0


    if __name__ == "__main__":
        sys.exit(main(records))
comms:
  open:
    - {from: meridian, text: "NIGHTLY CARGO REPORT · STATUS: FAILED AT RECORD 3 OF 7 · TOTAL: NONE"}
    - {from: okafor, text: "One bad line, and the night's report died with it. Seven records, and not one total."}
    - {from: okafor, text: "Skip the bad ones and count them. But if something's actually broken, I want it to break loudly."}
  challenge_done:
    - {from: meridian, text: "NIGHTLY CARGO REPORT · TOTAL: 89.75 KG · BAD RECORDS: 3 · EXIT STATUS: 1"}
    - {from: okafor, text: "Three bad records, and the exit status says so. Cron can tell a clean night from a dirty one now."}
  complete:
    - {from: okafor, text: "A script that fails loudly about the right things. That's half of operations, honestly."}
---

## Reading a traceback

When Python meets an error it can't get past, it stops and prints a **traceback**:

```text
Traceback (most recent call last):
  File "script.py", line 9, in <module>
    print(average(readings))
          ~~~~~~~^^^^^^^^^^
  File "script.py", line 5, in average
    return total / len(readings)
           ~~~~~~^~~~~~~~~~~~~~~
ZeroDivisionError: division by zero
```

Each **frame** is two lines: a `File "script.py", line 5, in average` line saying where, and under
it the code on that line. A line of `~` and `^` under the code, when there is one, only marks the
part of the line that was running. **Read it from the bottom up.** **The last line is the error's type and its
message**: what went wrong. **The frame just above it is where**: the file, the line number, the function (`in average`)
and the line itself. The frames above that are the calls that led there, oldest first, and
`<module>` means the top level of the script. So here `average` was handed an empty list.

The type tells you what kind of problem it is:

| Error | Usually means |
|---|---|
| `ValueError` | **the right type of value, but a value it can't use**: `float("heavy")`, `int("")` |
| `TypeError` | the wrong type altogether: adding text to a number |
| `KeyError`, `IndexError` | a dict key, or a list position, that isn't there |
| `AttributeError` | **a method the value hasn't got**: `.split()` on a number, or `.group()` on `None` |
| `NameError` | a name that was never set, very often a typo |
| `FileNotFoundError` | a path with nothing at it |

## Catching one error: `try` and `except`

**`try` runs a block, and `except ValueError:` runs instead if that error happens inside it.** Then
the script carries on after the whole `try`, rather than stopping:

```python
for text in ["4.5", "n/a", "3"]:
    try:
        level = float(text)
    except ValueError:
        print(f"skipped {text}")
        continue
    print(level)
```

```text
4.5
skipped n/a
3.0
```

**Any other error inside the `try` isn't caught: it stops the script with its traceback, as if the
`try` weren't there.** `except ValueError as error:` also puts the error in a variable, and `print(error)` shows its message.
**Keep the `try` block small, around the line that can fail**. Wrapped around the whole loop, the
first bad value would end the loop instead of one pass of it.

**Name the error you expect.** A bare `except:`, or `except Exception:`, catches every error there is,
including a `NameError` from a typo and an `AttributeError` from a bug: `Exception` is the general
type that every error in the table belongs to. Then a mistake in your own
code looks exactly like bad data, it's quietly counted, and nothing tells you. **An error you didn't
expect should stop the script**, with its traceback, so you can fix it.

## Raising your own: `raise`

**`raise ValueError("message")` stops a function with an error, exactly as if Python had found one**,
and the caller's `except ValueError:` catches it as it would any other:

```python
def tank_level(line):
    fields = line.split()
    if len(fields) != 2:
        raise ValueError(f"not a tank reading: {line}")
    return float(fields[1])
```

`.split()` is module 04's, and `len()` counts the fields it gave back, as it counts any list's items
(module 02). **When a function can't do its job, raise, rather than give back a made-up value.** A 0
or a `None` handed back for a bad line looks like a real answer, and gets added up as one.

## Exit codes and the main guard

**`sys.exit(N)` is Python's version of Bash's `exit N`**, after `import sys`, and Bash's `$?` sees
the number. 0 means success, as always. `sys.exit()` with nothing exits 0, and **an uncaught error
exits 1**, after its traceback. That's how cron, or a Bash script running yours, knows the night
wasn't clean.

**Your own file imports the same way as the standard library's: `import report` loads `report.py`
from the folder you're in, and `report.main()` calls its function**, as `math.ceil()` did in module
03. That's where the next part comes in.

A script usually keeps its work in a function called `main` that **gives back the exit status**, and
ends with these two lines:

```python
if __name__ == "__main__":
    sys.exit(main())
```

**The guard is `if __name__ == "__main__":`, and `sys.exit(main())` runs `main` and hands what it
gives back to `sys.exit` as the exit status.** If `main` takes a parameter, pass it in the brackets as
in any other call: `sys.exit(main(readings))`.

**`__name__` is `"__main__"` when Python runs the file itself**, and the file's name without `.py`
when another script imports it: `"report"` for `report.py`. The double underscores are part of the
name, which Python uses for names it sets itself. So **the guard runs `main` only when the file is run as a script**: imported, its
functions are there to call and nothing happens on its own. That's also what lets a test call
`main()` and check what it gives back, without the whole program exiting. **The editor below the lesson runs your code as a script**, so
there `__name__` is `"__main__"` and the guard runs `main`.

**On the real station:** `scripts/create_user.py` is the script that made your account. Its `main()`
gives back `1` when the password is too short or the two don't match, and `0` once the account is
saved, and the file ends with exactly those two lines.

## Try it

On your own machine, if you have one to hand. Python is the only thing it needs (module 01).

```bash
cd "$(mktemp -d)"
cat > tanks.py <<'EOF'
import sys


def tank_level(line):
    fields = line.split()
    if len(fields) != 2:
        raise ValueError(f"not a tank reading: {line}")
    return float(fields[1])


def main():
    bad = 0
    for line in ["T-1 4.5", "T-2 n/a", "T-3", "T-4 3"]:
        try:
            print(tank_level(line))
        except ValueError as error:
            print("skipped:", error)
            bad = bad + 1
    if bad > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
EOF
python3 tanks.py
echo "exit status: $?"                                   # exit status: 1
python3 -c 'import tanks; print("imported", tanks.__name__)'   # imported tanks: main didn't run
python3 -c 'import tanks; print(tanks.tank_level("T-9 2"))'    # 2.0
python3 -c 'import tanks; tanks.tank_level(42)'
echo "exit status: $?"                                   # exit status: 1
```

The script prints `4.5`, then `skipped: could not convert string to float: 'n/a'`, then
`skipped: not a tank reading: T-3`, then `3.0`. The second-to-last command fails on purpose: `42`
isn't a line of text, so the `AttributeError` isn't caught by anything, and the script stops with
status 1. Read its traceback from the bottom up.
