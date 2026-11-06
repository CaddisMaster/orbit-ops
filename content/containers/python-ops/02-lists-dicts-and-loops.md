---
# No console task: a challenge (#399). The station console has no python3 (module 01).
title: Lists, dicts and loops
minutes: 20
story: |
  **Mission log, day 45.** The bay's cargo count lives on a clipboard, and the totals on it were
  added up by hand. Okafor drops it on your bench. "Every crate's on there. Nobody trusts the sums.
  Get them out of someone's head and into a script."
quiz:
  - type: choice
    q: "What does this print?"
    code: |-
      total = 0
      for mass in [2, 3]:
          total = total + mass
          print(total)
    lang: python
    options:
      - "`5` only: `print` always waits for the loop to finish"
      - "`2`, then `5`: the indented `print` is part of the loop, so it runs each time round"
      - "`2`, then `3`: `total` starts again from 0 each time"
      - "Nothing: `print` can't go inside a loop"
    answer: 1
    explain: >-
      Indentation decides what's in the loop. `print` is indented, so it runs on every pass, after
      `total` has grown. Move it back level with `for` and it would run once, afterwards, printing
      only `5`.
  - type: choice
    q: "This stops with an error. What fixes it?"
    code: |-
      seen = {}
      seen["door"] = seen["door"] + 1
      KeyError: 'door'
    lang: text
    options:
      - "Writing `seen = []`, because a dict can't hold numbers"
      - "Writing `seen[door]`, without the quotes"
      - "Putting the two lines in a `for` loop"
      - "`seen.get(\"door\", 0) + 1`: `get` gives 0 when the key isn't there yet"
    answer: 3
    explain: >-
      Reading a key that isn't there raises a `KeyError`, and on the first pass `"door"` isn't there.
      `get` asks instead of insisting. Without the quotes, `door` would be a variable that was never
      set, so that fails too.
  - type: choice
    q: "What does this print?"
    code: |-
      decks = ["C", "A"]
      sorted(decks)
      print(decks)
    lang: python
    options:
      - "`['A', 'C']`: `sorted` puts the list in order"
      - "`A C`: `print` lays a list out as words"
      - "`['C', 'A']`: `sorted` makes a new list, and nothing kept it"
      - "Nothing: the result of `sorted` has to be printed directly"
    answer: 2
    explain: >-
      `sorted` hands back a new list and leaves the old one alone. Keep the result to use it:
      `decks = sorted(decks)`. The same idea as module 01's converters, where `=` keeps a result.
  - type: fill
    q: "Which dict method gives you a default instead of an error when a key is missing?"
    answer: ["get", ".get", ".get()", "get()"]
    explain: >-
      `crate.get("mass", 0)` gives the value if the key is there and 0 if it isn't. With no second
      argument, a missing key gives `None`, Python's value for nothing at all.
  - type: choice
    q: "`tally` is a dict. What does `for name in tally:` go through?"
    options:
      - "Its keys. `.items()` gives you each key with its value"
      - "Its values"
      - "Each key and value, in turn, as separate passes"
      - "Nothing: only a list can be looped over"
    answer: 0
    explain: >-
      Looping over a dict gives its keys, and `sorted(tally)` and `"x" in tally` work on the keys too.
      Use `.values()` for just the values, or `for name, count in tally.items():` for both.
cards:
  - id: indentation
    section: "Loops: indentation is the syntax"
    front: In a Python `for` loop, what marks which lines are inside it?
    back: "The indentation. The line ending in `:` opens the block, and the first line back at the old level ends it. There's no `do` or `done`."
  - id: dict-get
    section: "Dicts: values by name"
    accept: ['crate.get("mass", 0)', "crate.get('mass', 0)"]
    front: Read the key `"mass"` from the dict `crate`, getting 0 if it isn't there
    back: '`crate.get("mass", 0)`'
  - id: sorted-is-new
    section: "Lists: values in order"
    front: Does `sorted(names)` change `names`?
    back: "No. It makes a new list, so keep it: `names = sorted(names)`."
  - id: count-by-key
    section: "Adding up by key"
    accept: ['seen[code] = seen.get(code, 0) + 1']
    front: Count each `code` in the dict `seen`, whether or not it's been seen before
    back: "`seen[code] = seen.get(code, 0) + 1`"
challenge:
  from: okafor
  task: |-
    Here's the clipboard as Python: `crates` is a list, and each crate is a dict. It's already in
    the editor. Leave it as it is. **Crate `C-105` has no `"mass"` key**, because the scanner missed
    it. Count it as 0 for now.

    Below it, make these five variables:

    1. `total_crates`: how many crates there are.
    2. `totals`: a dict of each deck's total mass, like `{"A": 49.5, …}`.
    3. `decks`: a list of the deck names, in alphabetical order.
    4. `grand`: the total mass of every deck, added up from `totals`.
    5. `report`: a list with one string per deck, in the same order as `decks`, each one like
       this:

    ```text
    A: 49.5 kg
    ```

    Work all of them out from `crates`. Run it to see what it prints, then Submit to run the checks.
  starter: |-
    crates = [
        {"id": "C-101", "deck": "C", "mass": 30.5},
        {"id": "C-102", "deck": "A", "mass": 40.5},
        {"id": "C-103", "deck": "B", "mass": 7.25},
        {"id": "C-104", "deck": "C", "mass": 12.0},
        {"id": "C-105", "deck": "B"},
        {"id": "C-106", "deck": "A", "mass": 9.0},
    ]

    # Your five variables go here. Print them to see how you're doing.
  checks:
    - check: assert total_crates == 6
      says: total_crates counts the crates.
    - check: 'assert totals == {"A": 49.5, "B": 7.25, "C": 42.5}'
      says: totals adds up each deck, counting the crate with no mass as 0.
    - check: 'assert decks == ["A", "B", "C"]'
      says: decks lists the deck names in alphabetical order.
    - check: assert grand == 99.25
      says: grand adds up every deck's total.
    - check: 'assert report == ["A: 49.5 kg", "B: 7.25 kg", "C: 42.5 kg"]'
      says: report has one line per deck, in that order, written as the task shows.
    - check: assert len(crates) == 6 and crates[4] == {"id":"C-105", "deck":"B"}
      says: The clipboard's list is unchanged.
  solution: |-
    crates = [
        {"id": "C-101", "deck": "C", "mass": 30.5},
        {"id": "C-102", "deck": "A", "mass": 40.5},
        {"id": "C-103", "deck": "B", "mass": 7.25},
        {"id": "C-104", "deck": "C", "mass": 12.0},
        {"id": "C-105", "deck": "B"},
        {"id": "C-106", "deck": "A", "mass": 9.0},
    ]

    total_crates = len(crates)

    totals = {}
    for crate in crates:
        deck = crate["deck"]
        totals[deck] = totals.get(deck, 0) + crate.get("mass", 0)

    decks = sorted(totals)
    grand = sum(totals.values())

    report = []
    for deck in decks:
        mass = totals[deck]
        report.append(f"{deck}: {mass} kg")

    print(report)
comms:
  open:
    - {from: meridian, text: "CARGO LEDGER · SOURCE: CLIPBOARD · LAST AUDITED: NO RECORD"}
    - {from: okafor, text: "One clipboard. Every crate on this deck, in three people's handwriting."}
    - {from: okafor, text: "Get me a total per deck. And when the scanner's missed a mass, I want the script to carry on, not fall over."}
  complete:
    - {from: okafor, text: "That's the first time those totals have come from something other than someone's memory."}
    - {from: okafor, text: "Add a crate and the sums follow. That's the whole point. Next, stop pasting the same check in four places."}
---

## Lists: values in order

A **list** holds values in order, in square brackets, separated by commas:

```python
codes = [200, 404, 200]
print(codes)
print(len(codes))
print(codes[0])
```

```text
[200, 404, 200]
3
200
```

**`len()` counts what's in it.** Square brackets after a name read one item, by its position, and
**positions start at 0**, so `codes[0]` is the first and `codes[-1]` the last.

`print` shows a list the way you'd write it in Python, so a list of strings comes out with its
brackets and quotes. `print(["fuel", "air"])` shows `['fuel', 'air']`, and the strings themselves
contain no quotes.

Some functions take a whole list. `sum(codes)` adds it up, and **`sorted(codes)` makes a new list
in order**, leaving the old one alone, so keep the result: `ordered = sorted(codes)`. **Numbers sort
by value, and text sorts alphabetically.**

**`.append()` adds an item to the end.** A name after a dot like this is a **method**, a function
that belongs to a value and works on it. `.append()` changes the list itself, so there's nothing to
keep:

```python
arrivals = []
arrivals.append(200)
print(arrivals)
```

```text
[200]
```

`[]` is an empty list. Don't write `arrivals = arrivals.append(200)`: `.append()` gives back `None`,
Python's value for nothing at all, and the list is lost.

## Loops: indentation is the syntax

**`for` runs a block once for each item**, as in Bash, with the item in the variable you name:

```python
for code in [200, 404]:
    print(f"got {code}")
print("finished")
```

```text
got 200
got 404
finished
```

Bash's `do` and `done` aren't needed. **The line ends in `:` and the block is the indented lines under
it**; the first line back at the old level is outside the loop, which is why `finished` printed once.
Use four spaces, which is what Tab puts in the editor here. Indentation isn't decoration in Python:
wrong spacing changes what the program does, or stops it with an `IndentationError`.

Unlike Bash, a loop over a list needs no quoting, because each item stays whole.

**A list is often started empty and filled in a loop:**

```python
notes = []
for code in [200, 404]:
    notes.append(f"got {code}")
print(notes)
```

```text
['got 200', 'got 404']
```

## Dicts: values by name

A **dict** (dictionary) holds values by name instead of by position, in curly braces. Each entry is
a **key**, a colon and its **value**:

```python
door = {"name": "airlock", "cycles": 12}
print(door["name"])
door["cycles"] = 13
door["sealed"] = True
print(door)
```

```text
airlock
{'name': 'airlock', 'cycles': 13, 'sealed': True}
```

**Square brackets read a key, and assigning to one sets it**, adding the key if it's new. On a dict,
the brackets always mean a key, never a position. Reading a key that isn't there stops with a
`KeyError`. **`.get()` asks instead**: it takes the key and a default to give back when the key is
missing.

```python
print(door.get("colour", "unknown"))
```

```text
unknown
```

**The key in the brackets can be a variable.** With quotes, `door["name"]` means the key called
`name`. Without them, `door[field]` means whichever key the variable `field` holds, and `.get()`
works the same way. A key doesn't have to be text, either: a number works too.

**A dict keeps its keys in the order they were added**, and that order doesn't affect equality: two
dicts with the same keys and values are equal, whatever order they print in.

| Write | Get |
|---|---|
| `"name" in door` | `True` if that key is there |
| `len(door)` | how many keys |
| `door.values()` | just the values |
| `sum(stock.values())` | **`sum()` can add up** the values when they're all numbers: `{"air": 3, "fuel": 4}` gives `7` |
| `sorted(door)` | **the keys, as a new list in order** |
| `for key in door:` | **a loop over the keys** |
| `for key, value in door.items():` | a loop with each key and its value, in two variables |

`{}` is an empty dict.

## Lists of records

A **record** is one dict holding the facts about one thing, such as one door. A list can hold them,
which is what a JSON reply turns into later in this unit. **Loop over the list to take each record in
turn, and read its values by key:**

```python
doors = [
    {"name": "airlock", "cycles": 12},
    {"name": "hatch"},
]
for door in doors:
    name = door["name"]
    cycles = door.get("cycles", 0)
    print(f"{name}: {cycles}")
```

```text
airlock: 12
hatch: 0
```

Putting the value in a variable first keeps the f-string simple. **Records don't all have the same
keys, so `.get()` is the safe way to read one that might be missing.**

Inside brackets, line breaks and indentation don't matter: this is laid out for reading, and it isn't
a block. Python allows a comma after the last item, though JSON doesn't.

## Adding up by key

The commonest loop in operations work adds things up by some key. Here's the simplest case, where
each item is its own key and the amount is 1, counting how often each status code appears:

```python
seen = {}
for code in [200, 404, 200]:
    seen[code] = seen.get(code, 0) + 1
print(seen)
```

```text
{200: 2, 404: 1}
```

`code` has no quotes because it's a variable, so the key is whichever code the loop is on. **The right
side runs first**: read the count so far, using 0 if this is the first time, then add one. **Assigning
it back** stores the new count. The first time a code turns up, `.get()` is what stops a `KeyError`.

To add up an amount instead of counting, add that amount instead of 1. **With records, the key comes
from one field and the amount from another.** Read them from the record first, as in Lists of records,
then use them in this same pattern.

**On the real station:** this repo's own tests loop the same way. `docker-compose.yml` lists the app's
services (its unit comes later), and `tests/test_repo_hardening.py` reads it into dicts. Then
`for name, service in compose["services"].items():` takes the `services` key, itself a dict, and loops
over it to check every service.

## Try it

On your own machine, if you have one to hand. Python is the only thing it needs (module 01).

```bash
cd "$(mktemp -d)"
cat > count.py <<'EOF'
codes = [200, 404, 200, 500]
print(len(codes), codes[0], codes[-1])    # 4 200 500: print takes several values
print(sorted(codes))                      # [200, 200, 404, 500]
print(codes)                              # unchanged: [200, 404, 200, 500]

seen = {}
for code in codes:
    seen[code] = seen.get(code, 0) + 1
print(seen)                               # {200: 2, 404: 1, 500: 1}
print(sum(seen.values()))                 # 4
print(sorted(seen))                       # the keys: [200, 404, 500]

for code, count in seen.items():
    print(f"{code} seen {count} times")   # one line per code
print("finished")                         # once: it's not indented

doors = [{"name": "airlock", "cycles": 12}, {"name": "hatch"}]
notes = []
for door in doors:
    name = door["name"]
    cycles = door.get("cycles", 0)
    notes.append(f"{name}: {cycles}")
print(notes)                              # ['airlock: 12', 'hatch: 0']
print("name" in doors[1], len(doors[1]))  # True 1
EOF
python3 count.py
python3 -c 'door = {}; print(door.get("name", "none"))'    # none
python3 -c 'door = {}; print(door["name"])'                # KeyError: 'name'
```

The last command fails on purpose: read the bottom line of its traceback. Then try removing the
indentation from `print(f"{code} seen {count} times")` in `count.py` and run it again, to see how
Python answers.
