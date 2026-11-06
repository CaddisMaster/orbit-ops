---
# No console task: a challenge (#402). The station console has no python3 (module 01).
title: Files and paths
minutes: 20
story: |
  **Mission log, day 48.** The bay keeps one receiving file for every shipment from the depot, and
  a stores ledger that's meant to account for every crate in them. Nobody has ever checked one
  against the other. "Then today somebody does," says Okafor. "And it isn't going to be me with a
  pencil."
quiz:
  - type: choice
    q: "What's in `pumps.txt` afterwards?"
    code: |-
      with open("pumps.txt", "w") as f:
          f.write("P-7")
          f.write("P-9")
    lang: python
    options:
      - "Two lines, `P-7` then `P-9`"
      - "Only `P-9`: each `write` replaces the one before"
      - "`P-7P-9` on one line: `write` adds no newline of its own"
      - "Nothing: the file isn't saved until the program ends"
    answer: 2
    explain: >-
      `write` puts down exactly the text it's given. For two lines, end each with `"\n"`, as in
      `f.write("P-7\n")`. The file is saved when the `with` block ends, which is long before the
      program does.
  - type: choice
    q: "This should write three lines, and `tanks.txt` ends up with one. Why?"
    code: |-
      for tank in ["T-1", "T-2", "T-3"]:
          with open("tanks.txt", "w") as f:
              f.write(tank + "\n")
    lang: python
    options:
      - "`write` can only be used once on a file, so the second and third calls are ignored"
      - "`with` deletes the file when its block ends, and only the last pass's file is left"
      - "The loop stops after its first pass, because the `with` block ends it"
      - "`\"w\"` empties the file each time it's opened, so each pass wipes the one before"
    answer: 3
    explain: >-
      Opening with `"w"` starts the file afresh, and here it's opened three times. Put the `with` line
      above the `for`, so the file is opened once and every pass writes into it. `"a"` would add to
      the end instead, but then a second run adds three more lines.
  - type: choice
    q: "The blank lines in this file are still counted. Why?"
    code: |-
      with open("tanks.txt") as f:
          for line in f:
              if line == "":
                  continue
              print("tank:", line)
    lang: python
    options:
      - "`continue` only works in a `while` loop, so the `if` is ignored"
      - "Each line still ends with its newline, so a blank one is `\"\\n\"`"
      - "`==` can't compare text, so the test is never true"
      - "Python leaves blank lines out when it reads a file, so these are lines with spaces"
    answer: 1
    explain: >-
      Reading line by line gives each line with the newline that ended it. `line.strip()` removes
      it, and then a blank line really is `""`.
  - type: fill
    q: "`path` is `Path(\"receiving/2026-09-30.txt\")`. What goes after `path.` to get `2026-09-30`, the name without its ending?"
    answer: ["stem"]
    explain: >-
      `path.stem` is `2026-09-30`, `path.name` is `2026-09-30.txt`, and `path.suffix` is `.txt`.
  - type: choice
    q: "Why write `with open(...) as f:` rather than `f = open(...)`?"
    options:
      - "`with` closes the file when the block ends, even after an error"
      - "Without `with`, `open` can only read a file, never write one"
      - "`with` makes reading faster, because the file is read in one go"
      - "`with` creates the file if it's missing, where plain `open` stops with an error"
    answer: 0
    explain: >-
      Python saves what you write in batches, and closing the file saves the rest. `with` does that
      for you on the way out of the block, whatever happens. Both forms can write, and it's `"w"`,
      not `with`, that creates a missing file.
cards:
  - id: with-closes
    section: "Reading a file: `with open`"
    front: What does `with open(...) as f:` do that `f = open(...)` doesn't?
    back: "It closes the file when the block ends, even if an error stops the code, so everything written is saved."
  - id: lines-keep-newline
    section: "Reading a file: `with open`"
    front: What does each line from `for line in f:` still have on its end?
    back: "Its newline, `\\n`. `line.strip()` removes it."
  - id: w-empties
    section: "Writing a file"
    front: What does opening a file with `"w"` do to what's already in it?
    back: "Empties it. So open it once, before a loop. `\"a\"` adds to the end instead."
  - id: glob-sorted
    section: "Paths with `pathlib`"
    front: Why `sorted(folder.glob("*.txt"))` rather than `folder.glob("*.txt")` alone?
    back: "`glob` gives the paths in no particular order. `sorted` puts them in name order, which for dated names is date order."
challenge:
  from: okafor
  task: |-
    Every shipment from the depot has a file in `receiving/`, named by the date it docked, like
    `2026-09-16.txt`. Each starts with a header line beginning with `#`, then has one line per crate:
    the crate, its deck and its mass, separated by spaces. `stores.txt` is the stores ledger: a
    header line starting with `#`, then one line per crate the bay has shelved, with the crate first. The folder also
    holds a `README.md`, which isn't a shipment. Open the files below the editor to see them.

    Make these, reading the files rather than copying from them:

    1. **`counts`**: a dict of how many crates each shipment brought, keyed by the date, like
       `{"2026-09-16": 3, …}`. Header lines and blank lines aren't crates.
    2. **`unrecorded`**: a list of every crate in a shipment file that `stores.txt` doesn't list.
    3. **`summary.txt`**, next to `stores.txt` rather than in `receiving/`: a file with one line per
       shipment, in date order, each like this, and every line ending with a newline:

    ```text
    2026-09-16: 3 crates
    ```

    The files are written fresh before every run, so nothing you write carries over. Files your code
    writes aren't shown below the editor: to see `summary.txt`, open it, read it back and `print` it.
    Run it to see what it prints, then Submit to run the checks.
  files:
    receiving/2026-10-07.txt: |
      # shipment 2026-10-07 · depot run 34
      C-331 A 22.0
      C-332 C 8.5
      C-333 B 40.0
    receiving/2026-09-16.txt: |+
      # shipment 2026-09-16 · depot run 31
      C-301 A 40.5
      C-302 B 12.0
      C-303 A 7.25

    receiving/2026-09-30.txt: |
      # shipment 2026-09-30 · depot run 33
      C-321 B 30.0
      C-322 A 18.5
      C-323 C 61.0
      C-324 B 9.0
    receiving/2026-09-23.txt: |
      # shipment 2026-09-23 · depot run 32
      C-311 C 15.0
      C-312 A 26.5
      C-313 B 4.0
      C-314 C 11.75
    receiving/README.md: |
      # Receiving
      One file per shipment, named by the date it docked.
    stores.txt: |
      # stores ledger · crate, shelf
      C-301 shelf-2
      C-302 shelf-5
      C-303 shelf-2
      C-311 shelf-7
      C-312 shelf-1
      C-313 shelf-4
      C-314 shelf-7
      C-321 shelf-3
      C-322 shelf-1
      C-324 shelf-6
      C-331 shelf-8
      C-332 shelf-5
      C-333 shelf-4
  starter: |-
    from pathlib import Path

    folder = Path("receiving")

    counts = {}
    unrecorded = []

    # Read stores.txt, then every shipment file in folder, then write summary.txt.

    print(counts)
    print(unrecorded)
  checks:
    - check: 'assert counts == {"2026-09-16": 3, "2026-09-23": 4, "2026-09-30": 4, "2026-10-07": 3}'
      says: counts has each shipment's number of crates, keyed by its date, with header and blank lines left out.
    - check: assert "README" not in counts and "README.md" not in counts
      says: Only the shipment files are counted, not the README.
    - check: 'assert unrecorded == ["C-323"]'
      says: unrecorded lists the crates in the shipment files that stores.txt doesn't.
    - check: 'import os; assert os.path.exists("summary.txt")'
      says: summary.txt is written.
    - check: 'assert open("summary.txt").read().splitlines() == ["2026-09-16: 3 crates", "2026-09-23: 4 crates", "2026-09-30: 4 crates", "2026-10-07: 3 crates"]'
      says: summary.txt has one line per shipment, in date order, written as the task shows.
    - check: 'assert open("summary.txt").read().endswith("crates\n")'
      says: Every line of summary.txt ends with a newline, the last one included.
  solution: |-
    from pathlib import Path

    folder = Path("receiving")

    stored = []
    with open("stores.txt") as stores:
        for line in stores:
            line = line.strip()
            if line == "" or line.startswith("#"):
                continue
            stored.append(line.split()[0])

    counts = {}
    unrecorded = []
    for path in sorted(folder.glob("*.txt")):
        count = 0
        with open(path) as shipment:
            for line in shipment:
                line = line.strip()
                if line == "" or line.startswith("#"):
                    continue
                count = count + 1
                crate = line.split()[0]
                if crate not in stored:
                    unrecorded.append(crate)
        counts[path.stem] = count

    with open("summary.txt", "w") as summary:
        for date in sorted(counts):
            summary.write(f"{date}: {counts[date]} crates\n")

    print(counts)
    print(unrecorded)
comms:
  open:
    - {from: meridian, text: "RECEIVING FILES · SHIPMENTS: 4 · 2026-09-16 TO 2026-10-07 · CHECKED AGAINST STORES: NEVER"}
    - {from: okafor, text: "One file per shipment, and a stores ledger that's supposed to account for every crate in them."}
    - {from: okafor, text: "Read the lot. How many crates each one brought, and whether stores has every one of them."}
  challenge_done:
    - {from: meridian, text: "CRATE C-323 · SHIPMENT 2026-09-30 · DECK C · 61.0 KG · STORES RECORD: NONE"}
    - {from: okafor, text: "Sixty-one kilos. Received, signed for, and nobody ever shelved it."}
    - {from: okafor, text: "The thirtieth. The same day the depot's update came aboard."}
    - {from: okafor, text: "It's in the hold, and it stays sealed. If it's what I think it is, it's evidence."}
  complete:
    - {from: okafor, text: "Four files, one ledger, and a script that reads them so nobody has to."}
    - {from: okafor, text: "If receiving and stores ever disagree, I want to know. Run that check before anyone signs for another shipment."}
---

## Reading a file: `with open`

**`open()` opens a file and gives back a file object**, a value you read the file through. Open it
in a **`with` block**, which closes it again when the block ends. Say `tanks.txt` holds two lines,
`T-1 full` and `T-2 empty`:

```python
with open("tanks.txt") as f:
    text = f.read()
print(text)
```

```text
T-1 full
T-2 empty
```

`f` is the file object's name, and you can call it anything. A second value after the path is the
**mode**, which the next section uses. **With no mode after the path, `open()` reads the file**, and
**`.read()` gives the whole file as one string.** A path that isn't there stops with a `FileNotFoundError`.

**`with` matters because it closes the file when the block ends, even if an error stops the code
inside it.** A closed file is finished with. Python saves what you write in batches, and closing the file
saves the rest, so when you've been writing, closing is what makes sure everything written is saved. Without `with`, you'd have to remember `f.close()` yourself, on every
way out of your code.

**A `for` loop over a file object gives you one line at a time**, which is how to read a log of any
size:

```python
with open("tanks.txt") as f:
    for line in f:
        print(repr(line))
```

```text
'T-1 full\n'
'T-2 empty\n'
```

`repr()` shows a string as Python would write it, quotes and all, which makes the hidden part
visible. **Each line still ends with its newline, `\n`**, so a blank line is `"\n"`, not `""`.
`\n` is written with two characters, and it's one character, the newline. **Strip each line before
you test it**: `line = line.strip()`. `.strip()`, `.split()` and `.startswith()` are all from module
04, and **`line.split()[0]` reads the first field straight from the list that `.split()` gives back**.

**As in Bash, `continue` skips the rest of this pass and goes on to the next item**, which is the
usual way to pass over lines you don't want. This prints only the full tanks:

```python
with open("tanks.txt") as f:
    for line in f:
        line = line.strip()
        if not line.endswith("full"):
            continue
        print(line)
```

```text
T-1 full
```

## Writing a file

**Open a file with `"w"` to write it.** It creates the file, or **empties it if it's already there**.
`"a"` adds to the end instead. **`.write()` writes exactly the text you give it, and no newline of
its own**, so end each line with `"\n"`:

```python
with open("report.txt", "w") as out:
    for tank in ["T-1", "T-2"]:
        out.write(f"{tank}: checked\n")
```

This prints nothing: writing is silent. `report.txt` then holds:

```text
T-1: checked
T-2: checked
```

**Open the file once, before the loop.** A `with open(..., "w")` inside the loop would empty the file
on every pass, leaving only the last line.

## Paths with `pathlib`

`pathlib` is the standard library's module for paths. **`from pathlib import Path` brings in just
the name `Path`**, so you write `Path`, not `pathlib.Path`. **`Path("logs")` makes a path, and `/`
joins one to the next**, with the right separator for the system: the character between folder
names, `/` on Linux and macOS, `\` on Windows.

```python
from pathlib import Path

folder = Path("logs")
log = folder / "tank-2026-10-01.txt"
print(log)
```

```text
logs/tank-2026-10-01.txt
```

**`open()` takes a `Path` as readily as a string.** A path knows things about itself.
**`name`, `stem` and `suffix` take no brackets: they're facts the path already holds**, not methods
that do something. `exists()` and `glob()` do work, so they take brackets:

| Write | Gives, for `logs/tank-2026-10-01.txt` |
|---|---|
| `log.name` | `tank-2026-10-01.txt`, **the last part** |
| `log.stem` | `tank-2026-10-01`, **the name without its ending** |
| `log.suffix` | `.txt` |
| `log.exists()` | **`True` if there's a file or folder at that path** |
| `folder.glob("*.txt")` | **every path in `folder` whose name matches**, with Bash's `*` and `?` |

**`glob` gives the paths in no particular order, so wrap it in `sorted()`**, which puts them in name
order. For files named by date, that's date order.

## Walking a folder

Put those together and a loop reads a whole folder, one file at a time:

```python
for path in sorted(Path("logs").glob("tank-*.txt")):
    with open(path) as f:
        lines = 0
        for line in f:
            lines = lines + 1
    print(path.stem, lines)
```

**`print` takes several values, separated by commas**, and prints them with a space between.

**`not in` asks the reverse of `in`**: `if tank not in seen:` is true when `tank` isn't in the list
`seen`. Collect one file's names into a list first, and `not in` checks another file against it.

**On the real station:** `load_catalog` in `app/content/loader.py` loads this course the same way.
`root / "syllabus.yml"` joins a path, and `sorted(root.rglob("*.md"))` walks the content folder
(`rglob` is `glob` that also looks inside every folder below). Then `path.read_text()` reads each
lesson, this one included, as one string. It's sorted so the modules load in the same order on
every machine.

## Try it

On your own machine, if you have one to hand. Python is the only thing it needs (module 01).

```bash
cd "$(mktemp -d)"
mkdir logs
printf '# tank log\nT-1 full\n\nT-2 empty\n' > logs/tank-2026-10-02.txt
printf '# tank log\nT-3 full\n' > logs/tank-2026-10-01.txt
cat > tanks.py <<'EOF'
from pathlib import Path

folder = Path("logs")
print(folder / "tank-2026-10-01.txt")       # logs/tank-2026-10-01.txt
print((folder / "nope.txt").exists())        # False

with open(folder / "tank-2026-10-02.txt") as f:
    for line in f:
        print(repr(line))                    # each one ends in \n, the blank one is '\n'

seen = []
with open("report.txt", "w") as out:
    for path in sorted(folder.glob("*.txt")):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line == "" or line.startswith("#"):
                    continue
                tank = line.split()[0]
                if tank not in seen:
                    seen.append(tank)
                out.write(f"{path.stem}: {tank}\n")
print(seen)                                  # ['T-3', 'T-1', 'T-2']: the 01 file first
EOF
python3 tanks.py
cat report.txt
python3 -c 'open("nope.txt")'
```

`report.txt` has three lines, starting with `tank-2026-10-01: T-3`, because `sorted` put the first of
October first. The last command fails on purpose: read the bottom line of its traceback.
