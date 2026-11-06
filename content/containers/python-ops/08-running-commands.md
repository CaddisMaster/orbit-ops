---
# No console task: a lab (#405). The station console has no python3, and a challenge can't start a
# process (Pyodide), so this one runs on the learner's own machine.
title: Running commands
minutes: 20
story: |
  **Mission log, day 51.** The bay's machines already have the tools: git, the scanners' own
  programs, Python itself. What they don't have is anything that runs them in order and notices when
  one fails. "Don't rewrite the tools," says Okafor. "Drive them."
quiz:
  - type: choice
    q: "This prints the version, then `None`. Why `None`?"
    code: |-
      import subprocess

      result = subprocess.run(["git", "--version"])
      print(result.stdout)
    lang: python
    options:
      - "`git --version` prints nothing, so there's nothing for Python to keep"
      - "`stdout` only fills in after a program has exited with 0, and git hasn't"
      - "Without `capture_output=True`, it went to the terminal and wasn't kept"
      - "The list form can't capture output at all, so it needs `shell=True`"
    answer: 2
    explain: >-
      By default the command writes to your terminal as it would in Bash, which is the version you saw,
      and `stdout` is `None`. `capture_output=True` keeps it instead, and `text=True` makes it a string.
  - type: choice
    q: "What happens when this runs in a git repository with no commits yet?"
    code: |-
      import subprocess

      log = subprocess.run(["git", "log"], capture_output=True, text=True)
      print("done", log.returncode)
    lang: python
    options:
      - "It prints `done 128`: a failure doesn't raise without `check=True`"
      - "It stops with a traceback, because `git log` failed and Python saw it"
      - "It prints `done 0`, because Python itself ran the command successfully"
      - "It waits for you to make a first commit, and then it prints `done 0`"
    answer: 0
    explain: >-
      `subprocess.run` hands back the result whatever the exit status, so a failure is yours to notice,
      in `returncode`. `check=True` turns a non-zero status into a `CalledProcessError` instead.
  - type: choice
    q: "`crate` comes from a form someone else fills in. Why is this dangerous?"
    code: |-
      subprocess.run(f"grep {crate} manifest.txt", shell=True)
    lang: python
    options:
      - "`grep` can't search a file that Python has already opened for reading"
      - "An f-string can't be passed to `subprocess.run`, only a plain string"
      - "`shell=True` is much slower, so the bay's scripts would time out"
      - "A shell reads the whole string, so a `;` in `crate` starts a new command"
    answer: 3
    explain: >-
      With `shell=True` the string goes to a shell, which treats `C-1; rm -rf ~` as two commands. A list,
      `["grep", crate, "manifest.txt"]`, passes `crate` as one argument whatever it holds.
  - type: fill
    q: "Which setting, written by name, makes `.stdout` a string rather than bytes?"
    answer: ["text=True", "text"]
    explain: >-
      `text=True`. Without it, captured output is bytes, shown as `b'git version 2.43.0\n'`.
  - type: choice
    q: "What does `subprocess.run([\"no-such-tool\"])` do, when there's no such program?"
    options:
      - "It hands back a result whose `returncode` is 127, as Bash's `$?` would be"
      - "It raises `FileNotFoundError` before anything runs, with no exit status"
      - "It prints `command not found` and then carries on with the next line"
      - "It looks the program up online, installs it, then runs it as asked"
    answer: 1
    explain: >-
      127 is what Bash reports when *it* can't find a program. Here there's no shell, so Python looks for
      the program itself and raises `FileNotFoundError` when it isn't there.
cards:
  - id: list-of-arguments
    section: "Running a command: `subprocess.run`"
    front: How do you write `git log --oneline` for `subprocess.run`?
    accept: ['["git", "log", "--oneline"]', "['git', 'log', '--oneline']"]
    back: '`["git", "log", "--oneline"]`: the program, then each argument as its own string.'
  - id: capture-and-text
    section: "Keeping what it prints"
    front: Which two settings keep a command's output as a string in `.stdout`?
    back: "`capture_output=True` and `text=True`."
  - id: check-raises
    section: "When a command fails"
    front: What does `check=True` change?
    back: "A non-zero exit status raises `subprocess.CalledProcessError`, instead of being handed back for you to notice."
  - id: no-shell-for-input
    section: "Never hand a shell outside input"
    front: Why not `shell=True` with a value someone else gave you?
    back: "The shell reads `;`, `|` and `$( )` in it as commands. A list passes the value as one argument."
lab:
  from: okafor
  task: |-
    Write `bay_tools.py`, a script that drives the tools on your machine and copes with each way a
    command can go wrong. You need Python (module 01) and git: `git --version` prints its version if
    it's installed. If it isn't, Unit 1.3's first module, *Your first repository*, says how to get it
    on a Mac, on Windows (Git Bash) or on Linux.

    1. Run the setup below. It makes `~/meridian/bay-tools` and, inside it, `empty-repo`: a git
       repository with no commits. Stay in `~/meridian/bay-tools`.
    2. Write `bay_tools.py` there, with a `main()` and the main guard (module 06). In `main()`, use
       `subprocess.run` with a **list** of arguments, capturing output as text, to do these five
       things, in this order, printing exactly the lines shown:
       1. Run `git --version` and print `version:` then what it printed, stripped.
       2. Run `git log` **in `empty-repo`, using `cwd=`**, which fails. Print `log: exit` then its exit status, and
          `log:` then the **first line** of what it printed on stderr.
       3. Run the same `git log` again with **`check=True`**, catch the error it raises, and print
          `checked: CalledProcessError` then the error's `returncode`.
       4. Run a program called `no-such-tool`, catch the error, and print
          `missing: FileNotFoundError`.
       5. Set `crate = "C-323; echo INJECTED"`, as if someone had typed it into a form. Run Python
          itself through **`sys.executable`**, with a list of four items: `sys.executable`, then
          `"-c"`, then the code `"import sys; print(sys.argv[1])"`, then `crate`. Print `echo:` then
          what it printed, stripped. The `;` in that code is Python's own, separating two statements,
          and no shell reads it.
    3. Run `python3 bay_tools.py`. On Windows, if `python3` isn't found, use `python` or `py`.
    4. Paste what it prints, then what `cat bay_tools.py` prints.

    Leave the `print` calls separated by commas, as in `print("log: exit", log.returncode)`, so each
    line has one space after its label.
  setup: |-
    mkdir -p ~/meridian/bay-tools && cd ~/meridian/bay-tools
    rm -rf empty-repo && git init -q -b main empty-repo
  boxes:
    - prompt: What `python3 bay_tools.py` prints.
      checks:
        - {regex: '^version: git version \d+\.\d+', says: "git --version ran, and its output was kept", hint: "Is the line printed from what the run kept, or did git print its version straight to the terminal?"}
        - {contains: "log: exit 128", says: "git log's exit status, read from returncode", hint: "Where did git log run? Outside empty-repo it may find another repository, or none."}
        - {regex: '^log: fatal: ', says: "The first line git log printed on stderr", hint: "Which of the two outputs holds git's complaint? Did the setup's git init run?"}
        - {contains: "checked: CalledProcessError 128", says: "check=True raised CalledProcessError, and it was caught", hint: "Is the error caught, and is its own returncode what's printed?"}
        - {contains: "missing: FileNotFoundError", says: "A missing program raised FileNotFoundError, and it was caught"}
        - {regex: '^echo: C-323; echo INJECTED$', says: "The crate name reached the command whole, as one argument", hint: "Did anything between Python and the command read the semicolon?"}
        - {lines: {min: 6, max: 6}, says: "Six lines and nothing else", hint: "Paste only what the script printed. An extra INJECTED line means a shell ran the crate name."}
      example: |
        version: git version 2.43.0
        log: exit 128
        log: fatal: your current branch 'main' does not have any commits yet
        checked: CalledProcessError 128
        missing: FileNotFoundError
        echo: C-323; echo INJECTED
    - prompt: What `cat bay_tools.py` prints.
      checks:
        - {contains: "capture_output=True", says: "Output is captured"}
        - {contains: "text=True", says: "Output is kept as text"}
        - {contains: "check=True", says: "One run uses check=True"}
        - {regex: 'cwd=', says: "git log runs in empty-repo with cwd", hint: "Step 2.2 runs git log in empty-repo with a setting by name."}
        - {contains: "except subprocess.CalledProcessError", says: "The CalledProcessError is caught by name"}
        - {contains: "except FileNotFoundError", says: "The FileNotFoundError is caught by name"}
        - {contains: "sys.executable", says: "Python runs itself through sys.executable"}
        - {not_contains: "shell=True", says: "No command goes through a shell", hint: "A list of arguments needs no shell."}
        - {regex: '__name__\s*==\s*["'']__main__["'']', says: "The script has the main guard", hint: "Module 06's last two lines: is main run through the guard?"}
      example: |
        import subprocess
        import sys


        def main():
            version = subprocess.run(["git", "--version"], capture_output=True, text=True)
            print("version:", version.stdout.strip())

            log = subprocess.run(["git", "log"], cwd="empty-repo", capture_output=True, text=True)
            print("log: exit", log.returncode)
            print("log:", log.stderr.splitlines()[0])

            try:
                subprocess.run(["git", "log"], cwd="empty-repo", capture_output=True, text=True, check=True)
            except subprocess.CalledProcessError as error:
                print("checked: CalledProcessError", error.returncode)

            try:
                subprocess.run(["no-such-tool"], capture_output=True, text=True)
            except FileNotFoundError:
                print("missing: FileNotFoundError")

            crate = "C-323; echo INJECTED"
            echo = subprocess.run([sys.executable, "-c", "import sys; print(sys.argv[1])", crate], capture_output=True, text=True)
            print("echo:", echo.stdout.strip())
            return 0


        if __name__ == "__main__":
            sys.exit(main())
comms:
  open:
    - {from: meridian, text: "BAY TOOLS · INSTALLED: git, python3 · SCRIPTED: NONE"}
    - {from: okafor, text: "Every tool we need is already on these machines. Nothing runs them in order, and nothing notices when one falls over."}
    - {from: okafor, text: "And if any of it ever takes a crate name from a form, that name stays a crate name. Not a command."}
  lab_done:
    - {from: meridian, text: "BAY TOOLS · COMMANDS RUN: 5 · FAILURES HANDLED: 3 · INJECTIONS: 0"}
    - {from: okafor, text: "A failure noticed, a failure raised, a missing tool caught, and the form can't run anything. Good."}
  complete:
    - {from: okafor, text: "Python on top, the old tools underneath. That's how most of this station's automation is going to look."}
---

## Running a command: `subprocess.run`

Python can run any program on the machine, the way a Bash script does, with the standard library's
`subprocess` module. **`subprocess.run()` runs one command and waits for it to finish.** **The
command is a list: the program first, then each argument as its own string**:

```python
import subprocess

subprocess.run(["git", "--version"])
```

```text
git version 2.43.0
```

**There's no shell in between**, so nothing is expanded or split: `*.log` reaches the program as the
five characters `*.log`, and `$HOME` as five too. A value with spaces in it needs no quoting, because it's
already one item of the list.

**`run` gives back a result**, and **`.returncode` is the command's exit status**, Bash's `$?`. Its
facts are read with a dot and no brackets, like a path's `.name` (module 05):

```python
result = subprocess.run(["git", "--version"])
print(result.returncode)
```

```text
git version 2.43.0
0
```

## Keeping what it prints

By default the command prints straight to your terminal, as in Bash, and nothing is kept. **`capture_output=True`
keeps what it prints instead, in `.stdout` and `.stderr`**, and **`text=True` makes them strings**
rather than bytes. Both are settings by name, like `indent=2` in module 07. **Without
`capture_output=True`, `.stdout` is `None`**: nothing was kept. **Without `text=True`, it's bytes**,
the raw characters as the program sent them, shown as `b'git version 2.43.0\n'`, and most string
methods want a string, so ask for text:

```python
result = subprocess.run(["git", "--version"], capture_output=True, text=True)
print(repr(result.stdout))
print(result.stdout.strip())
```

```text
'git version 2.43.0\n'
git version 2.43.0
```

A command's output ends with a newline, so **`.strip()` it**, as with a line from a file (module 05).
Programs print their complaints on **stderr**, so an error message is in `.stderr`, and
**`.splitlines()` gives a string's lines as a list**, so `.splitlines()[0]` is its first line.

**`cwd`, short for current working directory (Unit 1.1, *Navigating*), runs the command in the folder
you name**: `cwd="logs"` runs it in `logs`, as if you'd `cd`'d there first, without changing where your
own script is.

## When a command fails

**A command that fails doesn't stop your script.** `run` hands back the result whatever happened, so
**check `.returncode` yourself**: `if result.returncode != 0:`. Each program picks its own numbers:
**git exits 128 when it stops with a `fatal:` message**, such as `git log` in a folder that isn't a
repository.

**`check=True` makes a non-zero exit status raise `subprocess.CalledProcessError`** instead, which you
catch by name as in module 06. **The error carries the same facts: `error.returncode`**, and
`error.stderr` when output was captured.

```python
try:
    subprocess.run(["ls", "no-such-file"], capture_output=True, text=True, check=True)
except subprocess.CalledProcessError as error:
    print("ls failed:", error.returncode)
```

```text
ls failed: 2
```

`ls` exits 2 on Linux when a file isn't there, and a Mac's `ls` uses its own number: each program picks its own.

**A program that isn't there raises `FileNotFoundError` before anything runs**, so there's no exit
status at all. Bash reports a program it can't find with `command not found` and exit status 127, but
Python never gets that far: with no shell, it looks for the program itself.

| What happened | What you see |
|---|---|
| it ran and succeeded | `returncode` is 0 |
| it ran and failed | `returncode` isn't 0, or with `check=True`, a `CalledProcessError` |
| there's no such program | **`FileNotFoundError`**, whatever the settings |

## Never hand a shell outside input

**`shell=True` hands the command to a shell as one string**, so pipes, `;` and `$( )` all work. That's
exactly the danger. If any part of the string came from someone else, a form, a file, a log line, then
whatever they wrote runs too:

```python
crate = "C-323; echo INJECTED"
subprocess.run(f"echo {crate}", shell=True)
```

```text
C-323
INJECTED
```

The `;` ended one command and started another. Here it's a harmless `echo`, but it could have been
anything you can type. **With a list there's no shell to read the `;`, so the whole value is one
argument**, whatever it holds. **Keep to lists, and never use `shell=True` with a value you didn't
write yourself.**

**`sys.executable` is the path of the Python running your script**, after `import sys`, so
`[sys.executable, "-c", code]` runs Python itself on any machine, whatever it's called there.
**`-c` tells Python to run the string after it as code**, as `python3 -c` did in module 01.
**Anything after the code is handed to it in `sys.argv`**: `sys.argv[1]` is the first.

**On the real station:** `_gh` in `scripts/check_criteria.py`, the check that runs on every pull
request to this course, drives GitHub's `gh` command this way. It runs
`subprocess.run(["gh", …], capture_output=True, text=True)`, checks `returncode` itself and raises an
error carrying `stderr` when it isn't 0, then reads `stdout` with `json.loads` (module 07).

## Try it

On a Mac or Linux machine, if you have one to hand: Python is the only thing it needs (module 01). On
Windows, `shell=True` runs Windows' own `cmd.exe` rather than Bash, which reads `;` and `*` differently,
so the `shell=True` lines won't print what's shown here. The lab above uses no shell, so it works there.

```bash
cd "$(mktemp -d)"
touch a.log b.log
cat > drive.py <<'EOF'
import subprocess
import sys

listing = subprocess.run(["ls"], capture_output=True, text=True)
print(listing.stdout.splitlines())             # ['a.log', 'b.log', 'drive.py']

glob = subprocess.run(["ls", "*.log"], capture_output=True, text=True)
print(glob.returncode)                         # not 0: no file called *.log (2 on Linux)
print(glob.stderr.strip())                     # ls's complaint, with *.log as written

shell = subprocess.run("ls *.log", shell=True, capture_output=True, text=True)
print(shell.stdout.splitlines())               # ['a.log', 'b.log']: a shell expanded it

name = "x; echo INJECTED"
print(subprocess.run(f"echo {name}", shell=True, capture_output=True, text=True).stdout)
print(subprocess.run([sys.executable, "-c", "import sys; print(sys.argv[1])", name], capture_output=True, text=True).stdout)
EOF
python3 drive.py
python3 -c 'import subprocess; subprocess.run(["no-such-tool"])'
```

The first injected line prints `x` and `INJECTED` on two lines, because a shell ran it. The second
prints `x; echo INJECTED` whole. A blank line follows each, because the output's own newline is kept
and `print` adds another. The last command fails on purpose: read the bottom line of its
traceback.
