---
# No console task: a challenge (#398). The station console is a simulated shell and has no python3;
# Python runs in the browser, in the challenge's editor, and on a real machine in Try it.
title: From Bash to Python
minutes: 20
story: |
  **Mission log, day 44.** Life Support is holding, and Okafor has walked you down to the
  fabrication bay. Its job scripts are a heap of Bash that nobody dares touch. "Bash got this bay
  started," he says. "It won't get it any further. Time you learned the next tool."
quiz:
  - type: choice
    q: "What does this print?"
    code: |-
      count = "3"
      print(count * 2)
    lang: python
    options:
      - "`33`: `count` is text, and `*` on text repeats it"
      - "`6`: Python works out that `count` holds a number"
      - "`count * 2`: the name is printed as it's written"
      - "Nothing: it stops with a `TypeError`"
    answer: 0
    explain: >-
      The quotes make `"3"` a string, so `*` repeats it. Python never guesses that text is a number:
      `int(count) * 2` would give `6`. Adding text and a number is what raises a `TypeError`, as
      `count + 2` would. Repeating text is allowed, which makes this mistake easy to miss.
  - type: choice
    q: "This stops with an error. Why, and what fixes it?"
    code: |-
      mass_text = "42.5"
      print(mass_text + 1)
      TypeError: can only concatenate str (not "int") to str
    lang: text
    options:
      - "`mass_text` is a string, so it can't be added to a number. `float(mass_text) + 1` works"
      - "`42.5` is too big for a variable. Use a shorter value"
      - "The variable needs a `$`: `$mass_text + 1`"
      - "`print` can only take one value at a time. Use two `print` lines"
    answer: 0
    explain: >-
      `str` in the message means string and `int` means a whole number. Python refuses to mix them
      and says so, where Bash treats everything as text. `float()` makes a number from the text. A
      `$` is Bash's way of reading a variable; in Python the name alone does it.
  - type: choice
    q: "Which job has outgrown Bash and is the better fit for Python?"
    options:
      - "Read a JSON reply, retry when the service fails, and total the masses inside it"
      - "Run three commands in order"
      - "Move yesterday's logs into an archive directory"
      - "Pipe `grep` into `wc -l` once to count the errors in a log"
    answer: 0
    explain: >-
      Nested data, arithmetic and handling failures are where Bash gets hard to read and easy to get
      wrong. The other three are mostly commands joined together, which is what Bash is for.
  - type: fill
    q: "Which single letter goes before a string's opening quote so that `{crate}` inside it is filled in?"
    answer: ["f"]
    explain: >-
      An f-string: `f"Crate {crate}"`. Without the `f`, the braces and the name are printed as they
      are written. Quotes don't do this in Python, where `"…"` and `'…'` mean the same thing.
  - type: choice
    q: "`#!/usr/bin/env python3` is the first line of `report.py`. What else does `./report.py` need?"
    options:
      - "Execute permission: `chmod +x report.py`"
      - "A `.sh` ending instead of `.py`"
      - "Nothing: Python files can always be run that way"
      - "To be run with `sudo`"
    answer: 0
    explain: >-
      The same rule as a Bash script: the shebang says which program reads the file, and the
      execute bit lets you run it at all. `python3 report.py` needs neither, because you name the
      program yourself and it only has to read the file.
cards:
  - id: python-or-bash
    section: "Why not just more Bash?"
    front: When has a job outgrown Bash?
    back: "When it needs nested data like JSON, real arithmetic, or careful handling of failures. Bash remains the right tool for joining commands together."
  - id: run-a-script
    section: "Three ways to run Python"
    accept: ["python3 report.py"]
    front: Run the script `report.py` with Python, without making it executable
    back: "`python3 report.py`"
  - id: text-to-number
    section: "Values have types"
    accept: ['float("42.5")', "float('42.5')"]
    front: Turn the text `"42.5"` into a number with a decimal point
    back: '`float("42.5")`. `int()` does the same for whole numbers.'
  - id: fill-in-a-string
    section: "Filling in text: f-strings"
    accept: ['f"{crate}"', "f'{crate}'"]
    front: Fill the variable `crate` into a string with an f-string
    back: '`f"{crate}"`. The `f` before the quote is what makes the braces work.'
challenge:
  from: okafor
  task: |-
    The bay's old Bash job writes one receiving line for each delivery, and it's been dropping the
    spacing in crate names and getting the sums wrong. Do this one properly. The scanner gives you
    everything as text:

    ```python
    crate = "hull  plate"
    count_text = "3"
    mass_text = "42.5"
    ```

    Keep those three lines, and below them make four new variables:

    1. `count`: `count_text` as a **whole number**.
    2. `mass`: `mass_text` as a **number with a decimal point**.
    3. `total`: `count` multiplied by `mass`.
    4. `line`: replace the starter's `line = ""` with an f-string that comes out exactly like this,
       with the two spaces in the name kept:

    ```text
    hull  plate: 3 x 42.5 kg = 127.5 kg
    ```

    Build `line` from your variables rather than typing the figures in. Run it to see what it
    prints, then Submit to run the checks.
  starter: |-
    crate = "hull  plate"
    count_text = "3"
    mass_text = "42.5"

    # Your count, mass and total go here.

    line = ""  # replace this with your f-string

    print(line)
  checks:
    - check: assert type(count) is int and count == 3
      says: count is the whole number 3, not the text.
    - check: assert type(mass) is float and mass == 42.5
      says: mass is the number 42.5, not the text.
    - check: assert type(total) is float and total == 127.5
      says: "total is a number: 127.5, from multiplying the two."
    - check: 'assert line == "hull  plate: 3 x 42.5 kg = 127.5 kg"'
      says: line matches the receiving line exactly, with both spaces in the name.
    - check: assert crate == "hull  plate" and count_text == "3" and mass_text == "42.5"
      says: The scanner's three lines are unchanged.
  solution: |-
    crate = "hull  plate"
    count_text = "3"
    mass_text = "42.5"

    count = int(count_text)
    mass = float(mass_text)
    total = count * mass
    line = f"{crate}: {count} x {mass} kg = {total} kg"

    print(line)
comms:
  open:
    - {from: meridian, text: "FABRICATION BAY · JOB SCRIPTS: 41 · BASH: 41 · LAST EDIT WITHOUT INCIDENT: NONE ON RECORD"}
    - {from: okafor, text: "Bash is fine for gluing commands together. This bay stopped being glue a long time ago."}
    - {from: okafor, text: "Python's on every machine here. Start with one receiving line. Get the sums right and keep the crate's name in one piece."}
  complete:
    - {from: okafor, text: "Numbers that are numbers, and a name that stays as it was written. That's already better than the old job."}
    - {from: mission, text: "*Meridian*, Mission Control. The depot inquiry is ongoing. Keep your cargo records tidy, we may ask for them."}
---

## Why not just more Bash?

Bash is built for one thing: running commands and joining them together. For that it's still the
right tool, and nothing in this unit replaces it.

Python is a general-purpose programming language, and it's a better fit once a job needs more than
commands. These are the usual signs:

| The job needs | In Bash | In Python |
|---|---|---|
| Nested data, like a JSON reply | an outside tool such as `jq`, and careful quoting | built in |
| Real arithmetic | whole numbers only: `$((5 / 2))` is `2` | whole numbers and decimals: `5 / 2` is `2.5` |
| Handling failures carefully | exit codes checked by hand | errors that stop the program unless you handle them |

A rough rule: mostly commands, use Bash. Mostly logic and data, use Python.

**On the real station:** this project uses both, for these reasons. `scripts/backup_db.sh` is Bash,
because it mostly runs `docker` and `pg_dump` (PostgreSQL's backup tool) and joins them together.
`scripts/check_criteria.py` is Python, because it reads JSON from GitHub and compares it with what
the tests claim.

## Three ways to run Python

The program is called **`python3`**. Check that you have it with `python3 --version`. Python files
usually end in `.py`, though as with a Bash script, the ending doesn't decide how a file runs.

| How | Command | Good for |
|---|---|---|
| The prompt | `python3` | trying one line. It shows `>>>`, and `exit()` leaves, or hold Ctrl and press D |
| A script file | `python3 report.py` | **running a file**. It needs no special permission |
| An executable | `./report.py` | running it like any other command |

The last one works just as it does for a Bash script: the file's first line is a **shebang**,
`#!/usr/bin/env python3`, and you give it execute permission with `chmod +x report.py`. `env` finds
`python3` on your `PATH`, so the line works wherever Python is installed. Other lines starting with
`#` are comments.

There's a shortcut for a single line, like `bash -c`: `python3 -c 'print(6 / 2)'`. The single quotes
are for your shell, and what's inside them is Python.

**In this unit's first modules you run Python in the editor below the lesson, with its Run button**,
so you don't need it installed. Try it uses your own machine, if you have one to hand. The **station
console doesn't have `python3`**.

## Variables, without the Bash habits

```python
crate = "fuel cell"
print(crate)
```

```text
fuel cell
```

**`print()`** writes a line of output. **The brackets hand it the value to work on.** That's new: a
Bash function is called with no brackets, while in Python you always write them. Three more Bash
habits stop applying:

- **Spaces around `=` are fine**, and normal.
- **You read a variable by its name alone**, with no `$`.
- **Python doesn't split words.** In Bash, an unquoted `echo $name` squeezes the two spaces in
  `"fuel  cell"` into one. **Python keeps a value exactly as it is**, so that worry is gone, though
  text still needs its quotes.

Using a name that was never set is an error (`NameError`) rather than an empty string, so a typo
stops the program instead of quietly carrying on.

## Values have types

Everything in Bash is text. In Python, every value has a **type**, which decides what you can do with it:

| Type | Short for | Is | Example |
|---|---|---|---|
| `str` | string | text, in single or double quotes | `"fuel cell"` |
| `int` | integer | a whole number | `12` |
| `float` | floating point | a number with a decimal point | `2.5` |
| `bool` | Boolean | true or false, spelled with a capital | `True` |

The arithmetic is what you'd expect: `+ - * /`. **`/` always gives a `float`**, so `6 / 2` is `3.0`.
**An `int` and a `float` together give a `float`**, so `2 * 2.5` is `5.0`.

The quotes matter, because **`"12"` is text and `12` is a number**. On text, `+` joins and `*`
repeats: `"12" + "1"` is `"121"`, and `"12" * 2` is `"1212"`.

Whatever a program reads from a file, a scanner or the command line arrives as text, so you
**convert it before doing arithmetic**. A type's name works as its converter:

| Write | Get |
|---|---|
| `int("12")` | the whole number `12` |
| `float("2.5")` | the number `2.5` |

**A converter takes a variable as readily as a quoted value, and `=` keeps its result**, the job
`$( )` did in Bash. Arithmetic is kept the same way:

```python
cells_text = "12"
cells = int(cells_text)
each = float("2.5")
weight = cells * each
print(type(weight))
```

```text
<class 'float'>
```

`type()` tells you what a value is. **A script or the editor shows only what you `print`**, which is
why it's inside `print()` here. At the `>>>` prompt, Python shows each value by itself.

### Reading an error

Mixing text and a number with `+` stops the program, because Python won't guess what you meant. This
is what that looks like in the editor:

```text
Traceback (most recent call last):
  File "script.py", line 2, in <module>
    print(cells_text + 1)
          ~~~~~~~~~~~^~~
TypeError: can only concatenate str (not "int") to str
```

That's a **traceback**. **Read its bottom line first**: it names the error and says what went wrong.
"Concatenate" is Python's word for joining. The lines above it say where: line 2 of the file. Module
06 reads longer ones.

## Filling in text: f-strings

In Bash, double quotes fill in variables. In Python, `"…"` and `'…'` mean the same, and neither
fills in anything. For that you put an **`f` right before the opening quote**, and the name goes in
braces. That's an **f-string**:

```python
cells = 12
each = 2.5
print(f"{cells} cells at {each} kg weigh {cells * each} kg")
```

```text
12 cells at 2.5 kg weigh 30.0 kg
```

Anything in the braces is worked out, and the result is put into the text whatever its type, so
there's no need to convert it first. An f-string makes a value like any other, so you can keep it:
`note = f"{cells} cells"`.

## Try it

On your own machine, if you have one to hand. A Mac may offer to install its developer tools the
first time you run `python3`. On Ubuntu, Python is usually there already. A bare `ubuntu:24.04`
container needs it installed first, as the first line here does: skip that line otherwise.

```bash
sudo apt-get update && sudo apt-get install -y python3
cd "$(mktemp -d)"                               # a scratch directory
python3 --version                               # Python 3.something
echo $((5 / 2))                                 # 2: Bash has whole numbers only
python3 -c 'print(5 / 2)'                       # 2.5
python3 -c 'print(6 / 2)'                       # 3.0: / always gives a float
python3 -c 'print("12" * 2)'                    # 1212: text repeats
python3 -c 'print(int("12") * 2)'               # 24: a number multiplies
python3 -c 'print(type(12))'                    # <class 'int'>
name="fuel  cell"
echo $name                                      # fuel cell: ONE space, Bash split the words
python3 -c 'name = "fuel  cell"; print(name)'   # fuel  cell: TWO spaces, kept
cat > report.py <<'EOF'
#!/usr/bin/env python3
cells = 12
each = 2.5
print(f"{cells} cells at {each} kg weigh {cells * each} kg")
EOF
python3 report.py                               # 12 cells at 2.5 kg weigh 30.0 kg
chmod +x report.py
./report.py                                     # the same, run like a command
python3 -c 'print(crate)'                       # NameError: name 'crate' is not defined
python3 -c 'print("12" + 1)'                    # TypeError: can only concatenate str...
```

The `;` in the `name` line separates two Python statements on one line, as it does in Bash. The
`cat > report.py <<'EOF'` command writes a file: everything up to the line `EOF` goes to `cat` as its
input, and the quotes around the first `EOF` keep it exactly as written. Typed a line at a time, the
shell shows `> ` until it sees `EOF`.

The two commands at the end fail on purpose. Your own machine's traceback may look a little different
from the editor's: read its bottom line.

Then open the prompt. Type `python3`, type `6 / 2` at the `>>>` and press Enter (it shows `3.0` with
no `print`), then type `exit()`.
