---
# No console task: a challenge (#400). The station console has no python3 (module 01).
title: Conditions, functions and imports
minutes: 20
story: |
  **Mission log, day 46.** You've found the crate check in four of the bay's scripts, pasted from
  one to the next. Three of them agree. "Then one's wrong," says Okafor, "and we've been loading
  by it for a year. Write it once, and make the others call it."
quiz:
  - type: choice
    q: "What does this print?"
    code: |-
      def double(n):
          print(n * 2)

      result = double(4)
      print(result)
    lang: python
    options:
      - "`8`, then `8`"
      - "`8`, then `None`: the function prints but returns nothing"
      - "`8` only: `result` was never set, so the second `print` is skipped"
      - "Nothing: a function can't contain `print`"
    answer: 1
    explain: >-
      Printing shows a value to a person, and returning hands it to the code that called the
      function. `double` has no `return`, so it gives back `None`, and that's what `result` holds.
      Writing `return n * 2` would make `result` 8.
  - type: choice
    q: "A crate's mass is really 0, and this reports it as missing. Why?"
    code: |-
      mass = 0
      if not mass:
          print("no mass recorded")
    lang: python
    options:
      - "`0` isn't a valid value for a variable"
      - "`not` only works on `True` and `False`"
      - "`0` counts as false in a condition. `if mass is None:` asks only about a missing value"
      - "The `print` should come before the `if`"
    answer: 2
    explain: >-
      `0`, `""`, `[]`, `{}` and `None` all count as false, so `not mass` can't tell an empty crate
      from a missing reading. `is None` asks that one question and nothing else.
  - type: choice
    q: "`mass` is 500. What does this print?"
    code: |-
      if mass > 10:
          print("big")
      elif mass > 100:
          print("huge")
      else:
          print("small")
    lang: python
    options:
      - "`huge`: Python picks the closest match"
      - "`big`, then `huge`: both are true"
      - "`small`"
      - "`big`: the first true condition wins and the rest are skipped"
    answer: 3
    explain: >-
      Conditions are tried from the top, and only the first true one runs. Here `huge` can never
      happen, so test the narrower case first: `mass > 100`, then `mass > 10`.
  - type: fill
    q: "What does a function give back if it never reaches a `return`?"
    answer: ["None"]
    explain: >-
      `None`, Python's value for nothing at all. It's the usual sign of a function that prints its
      answer when it should return it.
  - type: choice
    q: "After `import math`, which line works?"
    options:
      - "`ceil(2.1)`"
      - "`math.ceil(2.1)`"
      - "`import.math.ceil(2.1)`"
      - "`math[ceil](2.1)`"
    answer: 1
    explain: >-
      `import math` gives you the module under its own name, and a dot reaches what's inside it.
      Plain `ceil` was never defined, so it stops with a `NameError`.
cards:
  - id: return-or-print
    section: "Functions: write it once"
    front: What's the difference between `return` and `print` in a function?
    back: "`print` shows a value to a person. `return` hands it to the code that called the function. A function with no `return` gives back `None`."
  - id: is-none
    section: "What counts as false"
    accept: ["if mass is None:", "mass is None"]
    front: Test whether `mass` is missing, without treating 0 as missing
    back: "`if mass is None:`"
  - id: falsy-values
    section: "What counts as false"
    front: Which values count as false in a condition?
    back: "`False`, `None`, `0`, `0.0`, and anything empty: `\"\"`, `[]`, `{}`. Everything else counts as true."
  - id: first-true-wins
    section: "Conditions: `if`, `elif`, `else`"
    front: In an `if`/`elif`/`else`, how many branches run?
    back: "One at most: the first whose condition is true. So test the narrower case first."
challenge:
  from: okafor
  task: |-
    Write the crate check once, as a function, and make the bay's count use it. A crate is a dict
    like the last module's, and any key may be missing. Finish three functions.

    **1. `classify(crate)`** returns one of four strings. Apply these rules in this order:

    | The crate | Returns |
    |---|---|
    | its `"hazard"` is true, whatever else it says | `"hazmat"` |
    | it has no mass: no `"mass"` key, or its value is `None` | `"rescan"` |
    | its mass is **over** 100 | `"heavy"` |
    | anything else | `"standard"` |

    A mass of exactly 100 is `"standard"`, and so is a mass of 0: an empty crate has a mass.

    **2. `lifts(mass)`** returns how many trips the bay's loader needs. It takes 40 kg a trip and
    can't do part of a trip, so 40 kg is one trip and 41 kg is two.

    **3. `count_classes(crates)`** takes a list of crates and returns a dict of how many fall in each
    class, like `{"heavy": 2, "standard": 1}`. **It must call `classify`**, not repeat the rules.

    Each `...` is a placeholder that does nothing: replace it. The checks call your functions with
    crates of their own, so every function has to `return` its answer rather than print it. The
    lines at the bottom are there for you to try them out.
  starter: |-
    import math


    def classify(crate):
        ...


    def lifts(mass):
        ...


    def count_classes(crates):
        ...


    print(classify({"mass": 140}))
    print(lifts(41))
    print(count_classes([{"mass": 140}, {"mass": 5}, {}]))
  checks:
    - check: 'assert classify({"mass": 140}) == "heavy" and classify({"mass": 40}) == "standard"'
      says: A crate over 100 is heavy, and a lighter one is standard. The answer is returned, not printed.
    - check: 'assert classify({"mass": 100}) == "standard"'
      says: A mass of exactly 100 isn't over 100.
    - check: 'assert classify({"mass": 500, "hazard": True}) == "hazmat" and classify({"mass": 5, "hazard": False}) == "standard"'
      says: A true hazard beats the mass, and a false hazard doesn't count.
    - check: 'assert classify({"hazard": True}) == "hazmat"'
      says: A hazard counts even when the crate has no mass.
    - check: 'assert classify({}) == "rescan" and classify({"mass": None}) == "rescan"'
      says: No mass means rescan, whether the key is missing or holds None.
    - check: 'assert classify({"mass": 0}) == "standard"'
      says: A mass of 0 is a real mass, not a missing one.
    - check: assert lifts(40) == 1 and lifts(41) == 2 and lifts(120) == 3 and lifts(0) == 0
      says: Trips round up to whole trips, and an exact fit needs no extra one.
    - check: 'assert count_classes([{"mass": 140}, {"mass": 150}, {"mass": 5}, {}]) == {"heavy": 2, "standard": 1, "rescan": 1} and count_classes([]) == {}'
      says: count_classes counts each class, and an empty list gives an empty dict.
    - check: 'real = classify; classify = lambda crate: "probe"; result = count_classes([{}]); classify = real; assert result == {"probe": 1}'
      says: count_classes calls classify rather than repeating its rules.
  solution: |-
    import math


    def classify(crate):
        if crate.get("hazard"):
            return "hazmat"
        mass = crate.get("mass")
        if mass is None:
            return "rescan"
        if mass > 100:
            return "heavy"
        return "standard"


    def lifts(mass):
        return math.ceil(mass / 40)


    def count_classes(crates):
        counts = {}
        for crate in crates:
            kind = classify(crate)
            counts[kind] = counts.get(kind, 0) + 1
        return counts


    print(classify({"mass": 140}))
    print(lifts(41))
    print(count_classes([{"mass": 140}, {"mass": 5}, {}]))
comms:
  open:
    - {from: meridian, text: "CRATE CHECK · COPIES FOUND: 4 · COPIES IN AGREEMENT: 3"}
    - {from: okafor, text: "Four copies of one rule. Someone fixed a bug in three of them and went to lunch."}
    - {from: okafor, text: "One function. Everything else calls it. And mind the empty crates: zero isn't the same as nothing."}
  complete:
    - {from: okafor, text: "Good. Next time that rule changes, it changes in one place."}
    - {from: meridian, text: "CRATE CHECK · COPIES: 1"}
---

## Conditions: `if`, `elif`, `else`

**`if` runs a block when its condition is true**, with the same `:` and indentation as a loop:

```python
level = 12
if level < 20:
    print("low")
elif level > 80:
    print("high")
else:
    print("ok")
```

```text
low
```

`elif` means "else if", and `else` runs when nothing above it was true. Both are optional: with no
`else`, it's possible for nothing to run.

**The conditions are tried from the top, and only the first true one runs**, so order matters when
they overlap. Every level above 80 is also above 20, which makes `level > 80` the **narrower** test.
Write `level > 20` first and the `level > 80` branch can never run, so put the narrower test first.

There's no `[ ]` or `-lt` to remember: comparisons look the same for numbers and text.

| Write | True when |
|---|---|
| `level == 12` | they're equal. **Two `=` to compare**, because one `=` assigns |
| `level != 0` | they differ |
| `level > 100` | **greater than**, and strictly so: `100 > 100` is false. `<` is less than |
| `level >= 100` | greater than or equal. `<=` is less than or equal |
| `"mass" in door` | that key is in the dict, or that item is in the list |
| `level > 20 and level < 80` | both are true. `or` needs either one |
| `not sealed` | `sealed` isn't true |

## What counts as false

A condition doesn't have to be a comparison. Python treats some values as false:

| Counts as false | Everything else counts as true |
|---|---|
| `False`, `None`, `0`, `0.0`, `""`, `[]`, `{}` | `True`, `12`, `"text"`, `[0]` |

Anything empty counts as false, and a list holding something counts as true, even if that something
is `0`. So **a value can be the condition by itself**, which is handy for asking "is there anything
here?", as in `if notes:`.

**This is the reverse of Bash**, where `if` checks an exit status and 0 means success. Python's `if`
looks at the value, and 0 is false.

**But it can't tell `0` from nothing**: `if not level:` is true for a reading of 0 as well as for a
missing one.

**`None` is Python's value for nothing at all**, and `.get()` gives it back when a key is missing and
you name no default. **To ask about that alone, write `is None`**, which is how Python is always
asked about `None`, rather than with `==`:

```python
level = 0
if level is None:
    print("no reading")
else:
    print(f"reading: {level}")
```

```text
reading: 0
```

Comparing `None` with a number stops with a `TypeError`, so test for it first.

## Functions: write it once

**`def` defines a function**, once, and you **call** it as often as you like, with brackets. Defining
it runs nothing: the block runs when it's called.

```python
def describe(level):
    if level is None:
        return "no reading"
    if level < 20:
        return "low"
    return "ok"


print(describe(12))
print(describe(None))
```

```text
low
no reading
```

The name in the brackets of `def` is a **parameter**: a variable that holds whatever the caller
passes in, doing the job of Bash's `$1`. Separate several with commas. A function has to be defined
before the line that calls it runs.

**`return` hands a value back to the caller and ends the function** on the spot, which is why the
example needs no `else`: once a `return` has run, nothing below it does. **`print` only shows a value
to a person; the caller can't use it.** A function that never reaches a `return` gives back `None`.

Bash's `return` only sets an exit status, and a Bash function hands back text by printing it, so this
is a real change. Variables made inside a function stay inside it, with no `local` needed.

**A function can call another function and use what it returned**, and that's how one rule stays in
one place:

```python
def alarm(level):
    state = describe(level)
    if state == "low":
        return "sound the alarm"
    return "quiet"


print(alarm(12))
```

```text
sound the alarm
```

A function's indented block can't be empty, so you'll sometimes see `...` as a placeholder. It does
nothing.

## Imports: code that's already written

A **module** is a file of ready-written Python code. That's Python's word, and nothing to do with this
course's modules. Python comes with a large **standard library** of them, covering most everyday jobs.
**`import` brings one in, and a dot reaches what's inside it.** Imports go at the top of the file:

```python
import math

print(math.ceil(2.1))
print(math.floor(2.9))
```

```text
3
2
```

**`math.ceil()` rounds up to the next whole number**, and leaves one that's already whole alone.
`math.floor()` rounds down. `int()` on a decimal simply drops the part after the point, which rounds
down too. The rest of this unit uses `pathlib`, `json`, `csv` and more, all imported this same way.

**On the real station:** the code running your challenges has this very choice in it. `sys.exit()` is
Python's version of Bash's `exit`, and `_exit_code` in `app/static/py/challenge_runner.py` works out
the status it asked for, held in `stop.code`. It starts with `if stop.code is None:` and returns 0,
because exiting with nothing means success. Writing `if not stop.code:` there would be a bug:
`sys.exit("")` gives an empty message, which Python counts as a failure, and `not` would call it
success.

## Try it

On your own machine, if you have one to hand. Python is the only thing it needs (module 01).

```bash
cd "$(mktemp -d)"
cat > levels.py <<'EOF'
import math


def describe(level):
    if level is None:
        return "no reading"
    if level < 20:
        return "low"
    return "ok"


def shout(level):
    print(describe(level).upper())


print(describe(12))             # low
print(describe(0))              # low: 0 is a real reading
print(describe(None))           # no reading
print(describe(50))             # ok

answer = shout(50)              # OK: shout printed it
print(answer)                   # None: shout returned nothing

print(math.ceil(2.1))           # 3
print(math.ceil(2.0))           # 2: already whole
print(int(2.9))                 # 2: the decimals are dropped

if not 0:
    print("0 counts as false")  # printed
if [0]:
    print("[0] counts as true") # printed: the list isn't empty

level = 90
if level > 20:                  # the wider test first: wrong
    print("warm")               # this prints, for 90
elif level > 80:
    print("hot")                # this can never run
else:
    print("cold")

if level > 20 and level < 80:
    print("in range")           # not printed: 90 is too high
print("mass" in {"mass": 3})    # True
EOF
python3 levels.py
python3 -c 'print(None > 1)'    # TypeError: '>' not supported...
```

`shout` calls `describe`, then calls `.upper()`, a method that gives back a string in capitals, on what
`describe` returned. The last command fails on purpose: read the bottom line of its traceback.

Then swap the `warm` and `hot` tests in `levels.py` so the narrower one comes first, and run it again.
It prints `hot`.
