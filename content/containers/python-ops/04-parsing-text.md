---
# No console task: a challenge (#401). The station console has no python3 (module 01).
title: Parsing text
minutes: 20
story: |
  **Mission log, day 47.** The receiving bay logs every crate that comes aboard, through three
  scanners that have never agreed on anything. One uses bars, one uses spaces, and the gate writes
  sentences. "One list of crates," says Okafor. "Out of all three. By tonight."
quiz:
  - type: choice
    q: "What does this print?"
    code: |-
      line = "VALVE   V-3   12.0"
      print(line.split(" "))
    lang: python
    options:
      - "`['VALVE', 'V-3', '12.0']`: `split` drops the extra spaces"
      - "`['VALVE', '', '', 'V-3', '', '', '12.0']`: it splits at every single space, so the doubled ones leave empty strings"
      - "`['VALVE V-3 12.0']`: the runs of spaces are squeezed to one"
      - "Nothing: `split` can't take an argument"
    answer: 1
    explain: >-
      Given a separator, `split` cuts at each one exactly, so three spaces in a row leave two empty
      strings. `split()` with nothing in the brackets splits at any run of whitespace instead, and
      gives `['VALVE', 'V-3', '12.0']`.
  - type: choice
    q: "This stops with an error. Why?"
    code: |-
      match = re.search(r"valve (V-\d+)", "pump room sealed")
      print(match.group(1))
      AttributeError: 'NoneType' object has no attribute 'group'
    lang: text
    options:
      - "`\\d+` only works on lines that start with a digit"
      - "The `r` before the pattern switched the search off"
      - "Groups count from 0, like a list, so it should be `group(0)`"
      - "The pattern isn't in the line, so `re.search` gave back `None`, which has no `.group()`. Test `if match is None:` first"
    answer: 3
    explain: >-
      `NoneType` in the message is the type of `None`. There's no valve in `pump room sealed`, so the
      search found nothing and said so with `None`. Groups do count from 1: `group(0)` is the whole
      match.
  - type: choice
    q: "Which of these needs `re.search` rather than a split?"
    options:
      - "A pump that logs `P-7 read 4.5 bar` one day and `at 4.5 bar, pump P-7` the next"
      - "`P-7,4.5,bar`: commas between fields that never move"
      - "`P-7 4.5 bar`: spaces between fields that never move"
      - "`P-7 | 4.5 | bar`: bars between fields, with spaces around them"
    answer: 0
    explain: >-
      A split finds a field by its position, so it works whenever the fields always come in the same
      order, whatever separates them. When the words move around, the position means nothing, and a
      pattern finds the value by what's next to it.
  - type: fill
    q: "Which string method removes the spaces from both ends of a string?"
    answer: ["strip", ".strip", ".strip()", "strip()"]
    explain: >-
      `"  B ".strip()` gives `"B"`. It removes tabs and newlines at the ends too, and leaves the spaces
      in the middle alone.
  - type: choice
    q: "A comment line reads `# BELT jammed at 02:10`. Which test picks out belt readings without catching it?"
    options:
      - '`if "BELT" in line:`'
      - '`if line.split()[1] == "BELT":`'
      - '`if line.startswith("BELT"):`'
      - '`if line != "#":`'
    answer: 2
    explain: >-
      `in` finds the text anywhere in the line, so the comment matches, and so does the second word of
      the split. `startswith` looks only at the beginning, where the comment has `#`. The last test is
      true for every line but one made of a lone `#`.
cards:
  - id: split-no-argument
    section: "Splitting a line into fields"
    front: What's the difference between `line.split()` and `line.split(" ")`?
    back: "`split()` splits at any run of whitespace and ignores it at the ends. `split(\" \")` splits at every single space, so two in a row leave an empty string."
  - id: startswith-not-in
    section: "Tidying and recognising a line"
    front: To pick out lines that begin with `BELT`, why `line.startswith("BELT")` rather than `"BELT" in line`?
    back: "`in` finds the text anywhere, so a comment that mentions BELT matches too. `startswith` looks only at the beginning."
  - id: search-gives-none
    section: "When a split isn't enough: `re.search`"
    front: "`re.search` found nothing. What did it give back, and what do you test before calling `.group()`?"
    back: "`None`. Test `if match is None:` first, or `.group()` stops with an `AttributeError`."
  - id: group-is-text
    section: "When a split isn't enough: `re.search`"
    front: What does `.group(1)` give you from a match?
    back: "The text the first bracketed group matched, always as a string. Use `float()` or `int()` on it for a number."
challenge:
  from: okafor
  task: |-
    `lines` is one night of the receiving bay's log, a string per line. It's already in the editor.
    Leave it as it is. Each of the three scanners starts its lines with its own name, so that's the
    first field:

    - **`HS-2`**, the hand scanner, puts its fields between `|` bars. After its name come the crate, its
      mass and its deck. Whoever set it up wasn't careful with spaces.
    - **`BELT`**, the belt scanner, separates its fields with spaces. After its name come the same three:
      the crate, its mass, its deck. Sometimes there are several spaces.
    - **`GATE`**, the gate scanner, writes a sentence. Somewhere in it is the crate, which is `C-` and
      digits, the word `deck` and its letter, and the mass followed by a space and `kg`. They don't
      always come in the same order.

    Any other line is not a crate reading: a comment, which starts with `#`, a blank line, or a
    `GATE` line with no crate on it.

    1. Finish **`parse(line)`**. For a crate reading, it returns a dict like
       `{"id": "C-201", "deck": "A", "mass": 40.5}`, with no spaces around the crate or the deck and
       the mass as a number. For any other line, it returns `None`.
    2. Make **`records`**: a list of what `parse` returns for each of `lines`, in order, leaving out
       the `None`s.

    The checks also try `parse` on lines of their own. Run it to see what it prints, then Submit to
    run the checks.
  starter: |-
    import re

    lines = [
        "# receiving bay, night shift",
        "HS-2 | C-201 | 40.5 | A",
        "HS-2 |C-202|  12 | B ",
        "BELT C-203 7.25 C",
        "BELT   C-204   30.0   A",
        "# BELT jammed at 02:10, cleared",
        "GATE crate C-205 on deck B weighed 18.5 kg",
        "GATE weighed 9 kg: crate C-206, deck C",
        "GATE door cycled",
        "",
    ]


    def parse(line):
        ...


    records = []

    for line in lines:
        print(parse(line))
  checks:
    - check: 'assert parse("HS-2 | C-201 | 40.5 | A") == {"id": "C-201", "deck": "A", "mass": 40.5}'
      says: A hand-scanner line gives its crate, deck and mass, with the mass as a number.
    - check: 'assert parse("HS-2 |C-202|  12 | B ") == {"id": "C-202", "deck": "B", "mass": 12.0} and parse("HS-2|C-299|1.5|D") == {"id": "C-299", "deck": "D", "mass": 1.5}'
      says: Hand-scanner fields come out with no spaces around them, however the spaces fall.
    - check: 'assert parse("BELT C-203 7.25 C") == {"id": "C-203", "deck": "C", "mass": 7.25} and parse("BELT C-298 3 D") == {"id": "C-298", "deck": "D", "mass": 3.0}'
      says: A belt line gives its crate, deck and mass.
    - check: 'assert parse("BELT   C-204   30.0   A") == {"id": "C-204", "deck": "A", "mass": 30.0}'
      says: A belt line with several spaces between its fields still parses.
    - check: 'assert parse("# BELT jammed at 02:10, cleared") is None and parse("# receiving bay, night shift") is None and parse("") is None'
      says: A comment or a blank line gives None, even a comment that mentions a scanner.
    - check: 'assert parse("GATE crate C-205 on deck B weighed 18.5 kg") == {"id": "C-205", "deck": "B", "mass": 18.5}'
      says: A gate line gives the crate, deck and mass from its sentence, decimals included.
    - check: 'assert parse("GATE weighed 9 kg: crate C-206, deck C") == {"id": "C-206", "deck": "C", "mass": 9.0} and parse("GATE deck A, 2.5 kg, crate C-300") == {"id": "C-300", "deck": "A", "mass": 2.5}'
      says: The gate's words come in any order, so each one is found by what's next to it, not by its position.
    - check: 'assert parse("GATE door cycled") is None'
      says: A gate line with no crate on it gives None.
    - check: 'assert records == [parse(line) for line in lines if parse(line) is not None] and len(records) == 6'
      says: records holds what parse returns for every crate reading in lines, in order, and nothing else.
    - check: 'assert len(lines) == 10 and lines[5] == "# BELT jammed at 02:10, cleared"'
      says: The log's list is unchanged.
  solution: |-
    import re

    lines = [
        "# receiving bay, night shift",
        "HS-2 | C-201 | 40.5 | A",
        "HS-2 |C-202|  12 | B ",
        "BELT C-203 7.25 C",
        "BELT   C-204   30.0   A",
        "# BELT jammed at 02:10, cleared",
        "GATE crate C-205 on deck B weighed 18.5 kg",
        "GATE weighed 9 kg: crate C-206, deck C",
        "GATE door cycled",
        "",
    ]


    def parse(line):
        if line.startswith("HS-2"):
            fields = line.split("|")
            return {"id": fields[1].strip(), "deck": fields[3].strip(), "mass": float(fields[2])}
        if line.startswith("BELT"):
            fields = line.split()
            return {"id": fields[1], "deck": fields[3], "mass": float(fields[2])}
        if line.startswith("GATE"):
            crate = re.search(r"(C-\d+)", line)
            deck = re.search(r"deck ([A-Z])", line)
            mass = re.search(r"([\d.]+) kg", line)
            if crate is None or deck is None or mass is None:
                return None
            return {"id": crate.group(1), "deck": deck.group(1), "mass": float(mass.group(1))}
        return None


    records = []
    for line in lines:
        record = parse(line)
        if record is not None:
            records.append(record)

    print(records)
comms:
  open:
    - {from: meridian, text: "RECEIVING LOG · LINES: 10 · SCANNERS: 3 · FORMATS: 3"}
    - {from: okafor, text: "Three scanners, three ideas of what a log line is. Bars, spaces, and whatever the gate thinks it's doing."}
    - {from: okafor, text: "I want one list of crates out of it. And someone wrote BELT in a comment last night, so don't count that as a crate."}
  complete:
    - {from: meridian, text: "RECEIVING LOG · RECORDS: 6 · LINES SKIPPED: 4"}
    - {from: okafor, text: "Six crates, one list, and nobody read the gate's prose by hand. Tomorrow it reads the files itself."}
---

## Splitting a line into fields

A log line is one string, and the facts in it are **fields**: the crate, its mass, its deck. Python's
string methods pull them apart.

**`.split()` with nothing in the brackets splits at any run of whitespace** (spaces, tabs) and
ignores it at the ends. It gives back a list, so the fields are read by position, from 0:

```python
line = "PUMP  P-7   4.5"
fields = line.split()
print(fields)
print(fields[1])
```

```text
['PUMP', 'P-7', '4.5']
P-7
```

**Given a separator, `.split()` cuts at each one exactly** and keeps everything else, spaces
included. So two separators in a row leave an empty string between them:

```python
print("P-7,4.5,,bar".split(","))
print("P-7 | 4.5".split("|"))
```

```text
['P-7', '4.5', '', 'bar']
['P-7 ', ' 4.5']
```

Every field is still text, as module 01's were: **use `float()` or `int()` on a field to get a
number**. Both ignore spaces at the ends, so `float(" 4.5")` is `4.5`.

## Tidying and recognising a line

**`.strip()` removes the whitespace from both ends of a string** (spaces, tabs, newlines), and
leaves the middle alone. It's
what a field from a bar-separated line needs:

```python
print("[" + " P-7 ".strip() + "]")
```

```text
[P-7]
```

`+` joins strings, and the brackets are only there to show where the string ends. Like every string
method, `.strip()` gives back a new string, so keep it: `name = name.strip()`.

Before you split a line, find out what kind it is. **`.startswith()` is true when the string begins
with the text you give it**, which is how to tell one scanner's lines from another's:

| Write | True when |
|---|---|
| `line.startswith("PUMP")` | the line **begins** with `PUMP` |
| `line.endswith("bar")` | the line ends with `bar` |
| `"PUMP" in line` | **`in` on a string finds the text anywhere in it**, so `# PUMP serviced` counts too |
| `line == ""` | the line is empty. `not line` asks the same, as module 03 showed |

So when a line's kind is in its first word, `in` is too loose: a comment that mentions a pump would
pass for a pump reading. **Use `startswith` to test the beginning.**

## When a split isn't enough: `re.search`

Some lines aren't fields at all. A pump that writes sentences might log `P-7 read 4.5 bar` and then
`at 3 bar, pump P-9`. The pressure is the third word in one and the second in the other, so its
position tells you nothing. What stays the same is what's next to it: it's a number followed by
` bar`.

That's a job for a **regular expression**, a pattern that describes text. Python's `re` module
searches with one. **`re.search(pattern, text)` looks for the pattern anywhere in the text**. **When
it finds it, it gives back a match**, a value that remembers what it found:

```python
import re

line = "at 3 bar, pump P-9"
match = re.search(r"([\d.]+) bar", line)
print(match.group(1))
```

```text
3
```

**Write a pattern as a raw string, with `r` before the quote**, as here. A raw string keeps every
backslash as you typed it. In a plain string, Python reads some backslash pairs itself (`"\n"` is a
newline), and a pattern needs its backslashes left for `re`.

The pattern is built from pieces:

| Piece | Matches |
|---|---|
| `bar`, `P-`, a space | itself: **outside square brackets, letters, digits, `-` and spaces match themselves** |
| `\d` | **one digit** |
| `[A-Z]` | **one capital letter**. Square brackets match one character from the set inside, and **a `-` between two characters there means every character from one to the other**, so `[0-9]` is any digit and `[a-z]` any small letter |
| `[\d.]` | **one digit or one dot**: inside square brackets, a dot is only a dot |
| `+` | **one or more of the piece before it**, so `\d+` is a whole number like `42` |
| `( )` | **a group**: it captures the text matched inside it |

So `P-\d+` matches `P-9`, and `([\d.]+) bar` matches `3 bar` and keeps the `3`. Outside square
brackets a dot means any character at all, which is why the dot goes inside them.

**`.group(1)` gives the text that the first group matched**, the second group is `.group(2)`, and so
on, while `.group(0)` is the whole match. It's always a string, so `float()` it for a number.

**When the pattern isn't there, `re.search` gives back `None`**, and `None` has no `.group()`. Calling
it stops with this, where `NoneType` is the type of `None`:

```text
AttributeError: 'NoneType' object has no attribute 'group'
```

**Test `if match is None:` before using a match**, as module 03 tested for a missing reading. When
you search for several things, one `if` can ask about them all with `or`: `if a is None or b is None:`
is true when either is missing.

**`is not None` asks the opposite.** A function that gives back `None` for "nothing here" lets the
code that calls it keep only what was found, with `if result is not None:`.

## Split or search?

**A split is enough when the fields always come in the same order**, whatever separates them. It's
shorter to write and easier to read. **Search when the words move around**, or when the value you want
sits in the middle of free text. A log with several formats often needs both: recognise each line's
kind with `startswith`, then use whatever suits that kind.

**On the real station:** `feature_claims` in `scripts/check_criteria.py`, part of what checks this
course's own pull requests, reads files line by line in this very way. It strips each line, uses
`startswith("@")`, `startswith("Feature:")` and `startswith("Rule:")` to tell them apart, and
only for the remaining lines uses a pattern with a group to pull out a title. Its pattern for an
issue tag, `r"@issue-(\d+)\b"`, is a raw string with a group of digits. The `\b` at the end, not
needed in this unit, means the digits must end where the word does.

## Try it

On your own machine, if you have one to hand. Python is the only thing it needs (module 01).

```bash
cd "$(mktemp -d)"
cat > pumps.py <<'EOF'
import re

line = "PUMP  P-7   4.5"
print(line.split())                       # ['PUMP', 'P-7', '4.5']
print(line.split(" "))                    # ['PUMP', '', 'P-7', '', '', '4.5']
print("P-7 | 4.5".split("|"))             # ['P-7 ', ' 4.5']
print("[" + " P-7 ".strip() + "]")        # [P-7]
print(float(" 4.5") + 1)                  # 5.5

print(line.startswith("PUMP"))            # True
print("PUMP" in "# PUMP serviced")        # True: in finds it anywhere
print("# PUMP serviced".startswith("PUMP"))  # False

for text in ["P-7 read 4.5 bar", "at 3 bar, pump P-9", "pump room sealed"]:
    pressure = re.search(r"([\d.]+) bar", text)
    pump = re.search(r"(P-\d+)", text)
    if pressure is None or pump is None:
        print("no reading:", text)
    else:
        print(pump.group(1), float(pressure.group(1)))
EOF
python3 pumps.py
python3 -c 'import re; print(re.search(r"(P-\d+)", "pump room sealed"))'    # None
python3 -c 'import re; print(re.search(r"(P-\d+)", "pump room sealed").group(1))'
```

The loop prints `P-7 4.5`, then `P-9 3.0`, then `no reading: pump room sealed`. The command after it
prints `None`, because the search found nothing. The last command fails on purpose: it calls
`.group()` on that `None`, so read the bottom line of its traceback.
