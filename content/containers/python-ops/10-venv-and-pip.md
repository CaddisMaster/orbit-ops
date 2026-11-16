---
# No console task: a lab (#407). The station console has no python3, and Pyodide has no pip, no
# venv and no network, so this runs on the learner's own machine.
# The lab pins requests==2.34.2: the newest on 2026-11-15, with no known vulnerability, and it needs
# Python 3.10. When that version gains an advisory, move the pin (the task, the checks, the examples
# from a new real run, and tests/test_python_ops.py).
title: venv, pip and pinned dependencies
minutes: 20
story: |
  **Mission log, day 53.** The crate labeller worked yesterday. This morning it stops on its first
  line, and nobody touched it. Someone upgraded a library for their own script, and every tool on that
  machine shares the one copy. "Nobody did anything wrong," says Okafor. "The machine let them. Fix
  the machine."
quiz:
  - type: choice
    q: "On Ubuntu 24.04, installing a package stops like this. What's the right next step?"
    code: |-
      $ pip install humanize
      error: externally-managed-environment

      × This environment is externally managed
    lang: text
    options:
      - "Run it again with `sudo`, since only root may install packages"
      - "Make a venv with `python3 -m venv .venv`, activate it, and install there"
      - "Add `--break-system-packages`, which is the setting made for this"
      - "Remove Python with `apt` and install it again, because it's damaged"
    answer: 1
    explain: >-
      Nothing is damaged: this Python belongs to `apt`, and pip is told to keep out of it. `sudo` gets
      the same refusal, and `--break-system-packages` installs into the Python that Ubuntu's own tools
      share, which is the very thing the refusal protects.
  - type: choice
    q: "Two machines install from this file a month apart, and the tool behaves differently on each. Why?"
    code: |-
      humanize
      tabulate>=0.9
    lang: text
    options:
      - "A `requirements.txt` only works on the machine that wrote it"
      - "pip installs the lines in a different order on each machine"
      - "The second machine's venv wasn't activated when the tool ran"
      - "Neither line names an exact version, so each got that day's newest"
    answer: 3
    explain: >-
      A bare name means the newest version on the day of the install, and `>=` means anything from
      there up. Only `name==version` on every line, dependencies included, gives both machines the
      same code, and `pip freeze` writes exactly that.
  - type: choice
    q: "What does `source .venv/bin/activate` change?"
    options:
      - "This shell's `PATH`: the venv's `bin` goes first, so `python` and `pip` are the venv's"
      - "The machine's own Python: it's replaced by the venv's until you deactivate"
      - "Every terminal you open from now on, until the machine is restarted"
      - "The venv's packages: they're copied into the system so that any script can use them"
    answer: 0
    explain: >-
      Activating only changes which `python` and `pip` this one shell finds first. Nothing is installed,
      copied or replaced, a new terminal starts without it, and `deactivate` puts the old `PATH` back.
  - type: fill
    q: "Which two-word command prints every installed package as a `name==version` line?"
    answer: ["pip freeze", "python -m pip freeze", "python3 -m pip freeze"]
    explain: >-
      `pip freeze`. Send it to a file with `pip freeze > requirements.txt`, and
      `pip install -r requirements.txt` installs exactly those versions somewhere else.
  - type: choice
    q: "You ran `pip install Jinja2==3.1.6` in a new venv, and `pip freeze` prints two lines. Why two?"
    code: |-
      Jinja2==3.1.6
      MarkupSafe==3.0.4
    lang: text
    options:
      - "pip always installs MarkupSafe first, as part of making any venv"
      - "`pip freeze` lists the system's packages as well as the venv's"
      - "Jinja2 needs MarkupSafe, so pip brought it, at the newest version that day"
      - "The `==` asked for two packages: the one named and the one after it"
    answer: 2
    explain: >-
      A package's own dependencies come with it, and you didn't pin those. `pip freeze` lists them too,
      at the versions that were installed, which is why the file it writes pins everything.
cards:
  - id: make-a-venv
    section: "A venv: a Python for one project"
    front: Make a venv in a folder called `.venv`
    accept: ["python3 -m venv .venv", "python -m venv .venv"]
    back: "`python3 -m venv .venv`. On Ubuntu, `python3-venv` has to be installed first."
  - id: activate
    section: "A venv: a Python for one project"
    front: Activate the venv in `.venv`, on a Mac or Linux
    accept: ["source .venv/bin/activate", ". .venv/bin/activate"]
    back: "`source .venv/bin/activate`. It puts the venv's `bin` first on this shell's `PATH`, and `deactivate` undoes it."
  - id: externally-managed
    section: "One Python, shared by everything"
    front: Why does Ubuntu 24.04 refuse `pip install` outside a venv?
    back: "The system's Python belongs to `apt`, and Ubuntu's own tools share it. A package installed there is installed for every script on the machine."
  - id: freeze-to-file
    section: "Pinning everything: `requirements.txt`"
    front: Save every installed package and its exact version to `requirements.txt`
    accept: ["pip freeze > requirements.txt"]
    back: "`pip freeze > requirements.txt`. Then `pip install -r requirements.txt` rebuilds the same set."
  - id: by-path
    section: "A venv: a Python for one project"
    front: How does a cron job use a venv, with no shell to activate it in?
    back: "By the path of the venv's own Python: `.venv/bin/python script.py`. Activating is only a convenience for a person at a prompt."
lab:
  from: okafor
  task: |-
    Give one of the bay's tools a Python of its own, with exactly one library in it, and prove what ran
    from where. On Windows, do all of it in Git Bash (Unit 1.3, *Your first repository*), and use
    `python` or `py` wherever a step says `python3`.

    1. Check `python3 --version`. This lab's library needs **Python 3.10 or newer**. A Mac's own
       `python3` can be 3.9: install a current one from python.org, or with `brew install python` if
       you use Homebrew, and open a new terminal. On Ubuntu, install `python3-venv`.
    2. Run the setup below. It makes `~/meridian/bay-env`. Stay in that folder.
    3. Make a venv there called **`.venv`**, and activate it.
    4. Install **`requests`**, a library for talking to web services, at exactly version **`2.34.2`**.
    5. Write `where.py`. It imports `sys` and `requests`, and prints exactly these three lines:
       - `in a venv:` then whether `sys.prefix` differs from `sys.base_prefix`
       - `requests:` then the version `requests` holds about itself
       - `from the venv:` then whether both of these are true: it's running in a venv, and the path
         of `requests`' own file starts with `sys.prefix`

       Each "whether" is `True` or `False`, as Python prints a comparison. Separate the label and
       the value with a comma, as in `print("in a venv:", …)`, so each line has one space after its
       label.
    6. With the venv still active, run `python where.py`, and paste what it prints in the first box.
    7. Write every installed package and its exact version to `requirements.txt`. Paste the file.
    8. Prove the file is enough:
       1. Deactivate the venv.
       2. Delete `.venv`.
       3. Make it again, and activate it.
       4. Install from `requirements.txt`, and paste what that install prints.
    9. Prove which Python is which:
       1. Deactivate once more.
       2. Run `python3 where.py`. **This run is meant to go wrong**: the machine's own Python stops
          with `ModuleNotFoundError`, or prints `in a venv: False` if it has a `requests` of its own.
       3. Run `where.py` again with the venv's own Python **by its path**, without activating.
       4. Paste what both runs print, the traceback included.
  setup: |-
    mkdir -p ~/meridian/bay-env && cd ~/meridian/bay-env
    rm -rf .venv
  boxes:
    - prompt: What `python where.py` prints, with the venv active.
      checks:
        - {contains: "in a venv: True", says: "The Python that ran it is a venv's", hint: "Is the prompt showing (.venv)? Inside a venv the command is python. The value is Python's own True or False."}
        - {regex: '^requests: 2\.34\.2$', says: "requests is the version the task pins", hint: "What did pip install say it installed? A bare name gets the newest."}
        - {contains: "from the venv: True", says: "requests was imported from inside the venv", hint: "Which fact of a module holds the path of its file? Both halves have to be true."}
        - {lines: {min: 3, max: 3}, says: "Three lines and nothing else"}
      example: |
        in a venv: True
        requests: 2.34.2
        from the venv: True
    - prompt: What `cat requirements.txt` prints.
      checks:
        - {regex: '^requests==2\.34\.2$', says: "requests, pinned exactly"}
        - {regex: '^urllib3==\d', says: "urllib3, which requests brought, pinned too", hint: "Was the file written by pip, from what's installed, or typed by hand?"}
        - {regex: '^certifi==\d', says: "certifi, pinned too"}
        - {regex: '^idna==\d', says: "idna, pinned too"}
        - {regex: '^charset[-_]normalizer==\d', says: "charset-normalizer, pinned too"}
        - {not_contains: ">=", says: "No line allows a range of versions"}
        - {lines: {min: 5}, says: "At least five packages: the one asked for and the four it brought"}
      example: |
        certifi==2026.10.23
        charset-normalizer==3.5.2
        idna==3.20
        requests==2.34.2
        urllib3==2.8.0
    - prompt: What `pip install -r requirements.txt` prints, in the venv you made again.
      checks:
        - {regex: 'requests==2\.34\.2 \(from -r requirements\.txt', says: "pip read the pin from the file", hint: "Is the install given the file with -r, or the package's name?"}
        - {regex: 'Successfully installed .*requests-2\.34\.2', says: "and installed it into the new venv", hint: "Requirement already satisfied means it was already there. Was .venv deleted and made again first?"}
        - {not_contains: "externally-managed-environment", says: "The install went into the venv, not the system", hint: "Was the new venv activated before the install?"}
      example: |
        Collecting certifi==2026.10.23 (from -r requirements.txt (line 1))
          Using cached certifi-2026.10.23-py3-none-any.whl.metadata (2.5 kB)
        Collecting charset-normalizer==3.5.2 (from -r requirements.txt (line 2))
          Using cached charset_normalizer-3.5.2-cp312-cp312-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl.metadata (46 kB)
        Collecting idna==3.20 (from -r requirements.txt (line 3))
          Using cached idna-3.20-py3-none-any.whl.metadata (7.2 kB)
        Collecting requests==2.34.2 (from -r requirements.txt (line 4))
          Using cached requests-2.34.2-py3-none-any.whl.metadata (4.8 kB)
        Collecting urllib3==2.8.0 (from -r requirements.txt (line 5))
          Using cached urllib3-2.8.0-py3-none-any.whl.metadata (7.4 kB)
        Using cached certifi-2026.10.23-py3-none-any.whl (135 kB)
        Using cached charset_normalizer-3.5.2-cp312-cp312-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl (246 kB)
        Using cached idna-3.20-py3-none-any.whl (69 kB)
        Using cached requests-2.34.2-py3-none-any.whl (73 kB)
        Using cached urllib3-2.8.0-py3-none-any.whl (135 kB)
        Installing collected packages: urllib3, idna, charset-normalizer, certifi, requests
        Successfully installed certifi-2026.10.23 charset-normalizer-3.5.2 idna-3.20 requests-2.34.2 urllib3-2.8.0
    - prompt: After `deactivate`, what `python3 where.py` prints, then what `where.py` prints when the venv's own Python runs it by its path.
      checks:
        - {regex: 'in a venv: False|ModuleNotFoundError', says: "The machine's own Python isn't the venv: it says so, or it has no requests at all", hint: "Was the venv deactivated before the first of the two runs?"}
        - {contains: "in a venv: True", says: "The venv's Python, run by its path, is in the venv without activating", hint: "The venv's own python is inside the venv's folder. Which folder in there holds its programs?"}
        - {contains: "from the venv: True", says: "and it found the venv's requests"}
      example: |
        Traceback (most recent call last):
          File "/home/cadet/meridian/bay-env/where.py", line 3, in <module>
            import requests
        ModuleNotFoundError: No module named 'requests'
        in a venv: True
        requests: 2.34.2
        from the venv: True
comms:
  open:
    - {from: meridian, text: "CRATE LABELLER · FAILED AT IMPORT · CHANGES TO ITS OWN FILES: NONE"}
    - {from: okafor, text: "Someone wanted a newer library for their own script, so they upgraded it for the whole machine. The labeller found out this morning."}
    - {from: okafor, text: "Every tool gets a Python of its own and a list of exactly what's in it. Since the thirtieth, nothing on this deck installs whatever happens to be newest."}
  lab_done:
    - {from: meridian, text: "BAY ENV · ASKED FOR: 1 · INSTALLED: 5 · PINNED: 5 · REBUILT FROM FILE: YES"}
    - {from: okafor, text: "One asked for, five installed, five written down. Delete the folder and the file brings the same five back."}
  complete:
    - {from: okafor, text: "A tool that carries its own list can't be broken by somebody else's upgrade. Tomorrow it gets something to talk to."}
---

## One Python, shared by everything

The standard library came with Python. Everything else is a **package**: code someone else wrote and
published. A package you import is also called a **library**. **`pip` is Python's installer**: it downloads a package from **PyPI**, the Python Package
Index at pypi.org, and puts it where `import` can find it.

The trouble is where it puts it. A machine's own Python is shared: Ubuntu's own tools are written in
Python and run on it. **A package installed there is installed for every script on the machine**, so
upgrading a library for one script changes it under all the others. That's how a tool nobody touched
stops working.

So **Ubuntu 24.04 refuses**. This is the start of what it prints:

```text
$ pip install Jinja2
error: externally-managed-environment

× This environment is externally managed
╰─> To install Python packages system-wide, try apt install
    python3-xyz, where xyz is the package you are trying to
    install.
```

**"Externally managed" means this Python belongs to `apt`** (Unit 1.1, *Installing software with
apt*), and pip is told to keep out of it. `sudo` gets the same refusal. The rest of the message names
the fix, `python3 -m venv`, and a flag that overrides the refusal, `--break-system-packages`. **That
flag installs into the shared Python anyway**, the very thing the refusal protects, so leave it alone.
Not every machine refuses. On Ubuntu 22.04 the same command
goes ahead, and installs the package for every script your account runs, or with `sudo`, for the whole
machine. The fix is the same on all of them.

## A venv: a Python for one project

**A virtual environment, or venv, is a folder that holds a Python of its own, with its own
packages.** Each project gets one, so nothing a project installs can reach another.

**`python3 -m venv .venv` makes one in a folder called `.venv`.** `-m` runs a module of the standard
library as a program, here `venv`, and `.venv` is the usual name for the folder, hidden like any name
that starts with a dot. It prints nothing when it works. **On Ubuntu it needs the `python3-venv`
package first**, one of `apt`'s (`sudo apt-get install -y python3-venv`), and says `ensurepip is not available`
without it.

Inside the folder is a `bin` folder with the venv's own `python` and `pip`. **Activating the venv puts
that `bin` first on this shell's `PATH`** (Unit 1.1, *Environment variables and PATH*), so `python`
and `pip` now mean the venv's:

| Where | Activate with |
|---|---|
| Mac, Linux | **`source .venv/bin/activate`** |
| Windows, in Git Bash | `source .venv/Scripts/activate`: there the folder is called `Scripts` |

The prompt gains `(.venv)` at its start. **Inside an active venv, type plain `python` and `pip`**:
both are the venv's, on every system. Only this one shell is changed, so a new terminal starts without
it, and **`deactivate` puts the old `PATH` back**. It prints nothing, and `(.venv)` leaves the prompt.

**Activating is only a convenience. The venv's own Python, run by its path, uses the venv's packages
with nothing activated**: `.venv/bin/python report.py`, or `.venv/Scripts/python report.py` on
Windows. That's how a cron job or a systemd service (Unit 1.5) runs a tool in its venv, since neither has
a shell to activate one in.

A script can tell which Python is running it, after `import sys`. **`sys.prefix` is the folder of the
Python that's running: the venv's folder, when it's a venv's.** **`sys.base_prefix` is the Python the
venv was made from.** **Outside a venv the two are equal, so `sys.prefix != sys.base_prefix` is
`True` only in a venv.**

## Installing an exact version

**`pip install NAME==VERSION` installs exactly that version.** Naming an exact version is called
**pinning** it, and `Jinja2==3.1.6` is a **pin**. With the name alone, pip installs the
newest there is on the day you run it, so two machines set up in different weeks get different code.
**Anything looser than `==` isn't a pin**: `Jinja2>=3.1` allows every version from 3.1 up, which is
again the newest of the day.

```text
(.venv) $ pip install Jinja2==3.1.6
…
Successfully installed Jinja2-3.1.6 MarkupSafe-3.0.4
```

Two packages arrived, though one was asked for. Jinja2 needs MarkupSafe, so pip brought it: **a
package's own dependencies come with it.** Nobody pinned that one, so it came at the newest version of
the day.

**An installed package is imported like the standard library**: `import jinja2`, in small letters,
because the name you import isn't always spelled the way the name you install is. **Most packages hold
their own version as a string in `__version__`, and every imported module holds the path of its file
in `__file__`.** So `jinja2.__version__` is `"3.1.6"`, and `jinja2.__file__` is a path inside `.venv`,
one that starts with `sys.prefix`. That alone doesn't prove a venv: a package `apt` installed sits
under its own Python's `sys.prefix`, `/usr`, too. **It's the venv's copy when the path starts with
`sys.prefix` and the Python is a venv's.** **Importing a package that the Python running the script doesn't
have stops with `ModuleNotFoundError`**, whatever some other Python on the machine has installed.

## Pinning everything: `requirements.txt`

**`pip freeze` prints every installed package as a `name==version` line**, the dependencies included:

```text
(.venv) $ pip freeze
Jinja2==3.1.6
MarkupSafe==3.0.4
```

**`pip freeze > requirements.txt` saves that list**, with the `>` from Unit 1.1's *Pipes and
redirection*, and **`pip install -r requirements.txt` installs exactly those versions** into whichever
venv is active. **Each line of the file is what you'd give `pip install`**, so one written by hand can
be a bare name or a `>=`, and only `pip freeze` is sure to pin everything. Each line pip reads is marked `(from -r requirements.txt (line 1))` in what it prints.
**pip only installs what's missing**: for a package that's already there it says
`Requirement already satisfied` and moves on.

**The file goes into git, and the venv never does.** A venv is big, and it only works on the machine
that made it, so `.venv/` goes in `.gitignore` (Unit 1.3, *Working together*). **Delete it whenever
you like, with `rm -rf .venv`, and make it again from the file**: the file is the record, and the
folder is only a copy of it.

A pin holds still, bugs included. Moving to a newer version is then a change to one line of a file,
made on purpose and reviewed like any other change.

**On the real station:** this course's own `requirements.txt` is written this way. Every line is
`name==version`, in two blocks: `direct`, the packages the app asks for, and `transitive`, the ones
those brought. `Jinja2==3.1.6` is in the first and `MarkupSafe==3.0.4` in the second. Its opening
comment says how the second block is made: `pip install` the file, then `pip freeze`. And
`test_every_dependency_is_pinned_exactly` in `tests/test_repo_hardening.py` fails any line that isn't
an exact pin, so a `>=` can't be merged.

## Try it

On Ubuntu 24.04, or in an `ubuntu:24.04` container. On a Mac, skip the second and third lines, which
are Ubuntu's, and the rest runs as written. On Windows, in Git Bash, skip them too, and type
`Scripts` wherever a line has `.venv/bin`.

```bash
cd "$(mktemp -d)"
sudo apt-get update && sudo apt-get install -y python3-pip python3-venv
pip install Jinja2==3.1.6
python3 -m venv .venv
which python3
source .venv/bin/activate
which python pip
pip install Jinja2==3.1.6
pip freeze
python -c 'import jinja2; import sys; print(jinja2.__version__, jinja2.__file__.startswith(sys.prefix))'
pip freeze > requirements.txt
deactivate
python3 -c 'import jinja2'
.venv/bin/python -c 'import sys; print(sys.prefix != sys.base_prefix)'
rm -rf .venv
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -r requirements.txt
```

In order, from the third line:

| Command | Prints |
|---|---|
| the first `pip install` | `error: externally-managed-environment`: Ubuntu's refusal |
| `which python3` | the machine's own: `/usr/bin/python3` on Ubuntu |
| `which python pip` | two paths, both inside `.venv/bin` |
| the second `pip install` | ends `Successfully installed Jinja2-3.1.6` and a MarkupSafe |
| `pip freeze` | `Jinja2==3.1.6` and a `MarkupSafe==` line |
| `python -c …` | `3.1.6 True` |
| `python3 -c 'import jinja2'` | `ModuleNotFoundError`, on a machine whose own Python has no Jinja2 |
| `.venv/bin/python -c …` | `True`, with nothing activated |
| `.venv/bin/pip install -r` | ends `Successfully installed`, with the same two versions |
| the same again | `Requirement already satisfied`, twice |

`python3-pip` is only there so the system has a `pip` to refuse you with: a venv brings its own. pip
may end with a `[notice]` that a newer pip exists, which you can ignore. The
`python3 -c 'import jinja2'` line fails on purpose, where it fails. An Ubuntu server's own Python
often has a Jinja2 that `apt` installed, and there the line prints nothing.
