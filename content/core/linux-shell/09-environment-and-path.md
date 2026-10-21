---
title: Environment variables and PATH
minutes: 15
story: |
  **Mission log, day 9.** The navigation console runs a different `python3` from the one you
  tested with, and the course it plotted is wrong. "Same command, different program," says
  Okafor. "Find out which one runs, and why."
quiz:
  - type: choice
    q: In a fresh shell you run `REGION=eu`, then start a script. What does the script see in `$REGION`?
    options: ["`eu`", "Nothing: the variable wasn't exported", "An error", "It depends on the script's permissions"]
    answer: 1
    explain: >-
      A plain assignment creates a **shell** variable, visible only to the current shell. `export
      REGION=eu` makes it an **environment** variable, which child processes inherit. You can also
      set it for one command: `REGION=eu ./script.sh`.
  - type: choice
    q: Why must you type `./deploy.sh` rather than just `deploy.sh`?
    options:
      - "The `./` makes it executable"
      - "The current directory isn't in `$PATH`, so the shell won't look there"
      - "`./` runs it as root"
      - "It's only needed for Bash scripts"
    answer: 1
    explain: >-
      The shell only searches the directories listed in `$PATH`. Leaving `.` out of `PATH` is
      deliberate: otherwise a malicious file named `ls` in a shared directory could run instead
      of the real one.
  - type: fill
    q: Type a command that shows which file actually runs when you type `python3`.
    answer: ["which python3", "command -v python3", "type python3", "type -a python3"]
    explain: >-
      `which`, `command -v` and `type` all answer it. `type -a python3` lists every match on your
      PATH in order, and the first one wins.
  - type: choice
    q: You added an `export PATH=…` line to `~/.bashrc`. How do you use it in the shell you already have open?
    options: ["Log out and back in", "`source ~/.bashrc`", "`chmod +x ~/.bashrc`", "`export ~/.bashrc`"]
    answer: 1
    explain: >-
      `source` (or `.`) runs the file inside your current shell, so its changes take effect
      there. Running it as `bash ~/.bashrc` would apply them to a child shell that exits
      immediately.
terminal:
  task: |
    The navigation console runs the wrong `python3`. There are three on this machine, and
    the one the navigators need is `/opt/nav/bin/python3`.

    1. Put `/opt/nav/bin` **first** on your `PATH`, then write `python3 --version`'s output
       to `nav.txt` in your home directory.
    2. Make it stick: add that same `export` line to `~/.bashrc`, so every new shell gets it.

    If `ls` and `cat` stop working, the new `PATH` lost the old list: *Putting a directory first*
    says how to get it back. The console checks after every command, so you're done the moment
    `nav.txt` and `~/.bashrc` are both right.
  cwd: /home/cadet
  files:
    - {path: /home/cadet, type: dir}
    - {path: /home/cadet/.bashrc, contents: "# ~/.bashrc: read by every new interactive shell\n"}
    - {path: /usr/local/bin/python3, owner: root, group: root, mode: "755", contents: "#!/bin/bash\necho 'Python 3.8.10 (left over from testing)'\n"}
    - {path: /usr/bin/python3, owner: root, group: root, mode: "755", contents: "#!/bin/bash\necho 'Python 3.12.3'\n"}
    - {path: /opt/nav/bin/python3, owner: root, group: root, mode: "755", contents: "#!/bin/bash\necho 'Python 3.12.3 (navigation build)'\n"}
  checks:
    - {contains: /home/cadet/nav.txt, text: navigation build}
    - {contains: /home/cadet/.bashrc, text: /opt/nav/bin}
  success: |-
    "That's the build the course plots were tested on," Okafor says. "And now it'll still be there tomorrow."
  solution:
    - type -a python3
    - python3 --version
    - 'export PATH="/opt/nav/bin:$PATH"'
    - which python3
    - python3 --version > nav.txt
    - |-
      echo 'export PATH="/opt/nav/bin:$PATH"' >> ~/.bashrc
comms:
  open:
    - {from: mission, text: "*Meridian*, your last course plot is off by 0.3 degrees. Please check your navigation build."}
    - {from: okafor, text: "Same command, different program. Find out which `python3` runs, and why."}
  console_done:
    - {from: meridian, text: "NAVIGATION · python3 3.12.3 (navigation build) · COURSE PLOT VERIFIED"}
    - {from: okafor, text: "That's the build the plots were tested on. And it'll still be there tomorrow."}
  complete:
    - {from: mission, text: "Correction burn confirmed. You're right where we want you."}
    - {from: okafor, text: "One more day. The console's missing half the tools it should have. We'll fix that next."}
cards:
  - id: shell-vs-environment
    section: "Variables"
    front: Shell variable vs environment variable
    back: "`NAME=x` is visible only to this shell. `export NAME=x` is also inherited by every program started from it."
  - id: path-lookup
    section: "PATH: where commands come from"
    front: How does the shell find a command?
    back: "It searches the directories in `$PATH`, left to right, and runs the first match."
  - id: one-command-variable
    section: "Variables"
    front: Set a variable for one command only
    back: "`NAME=value command`, e.g. `ONEOFF=hi bash -c 'echo $ONEOFF'`."
---

## Variables

A **variable** is a name the shell keeps a value under (module 06 met one, `?`). Every process
also carries an **environment**: a set of named values, such as `HOME=/home/cadet` and
`USER=cadet`, that it hands a copy of to every program it starts. Those programs are its
**child processes**. Module 06 said your shell is the parent of every command you type, so a
script you run is a child of your shell. So is `bash -c 'COMMAND'`, which starts a new shell
that runs COMMAND and exits.

| You type | Prints |
|---|---|
| `echo $HOME` | your home directory: `/home/cadet` |
| `echo "$USER in $HOME"` | your user name and home directory: `cadet in /home/cadet` |
| `printenv` | everything in the environment, one `NAME=value` per line |

There are two kinds of variable, and a shortcut for one command:

| You type | Makes | Who sees it |
|---|---|---|
| `GREETING=hello` | a **shell variable** | this shell only: a child doesn't get it |
| `export GREETING=hello` | an **environment variable** | this shell, and every child it starts from now on |
| `GREETING=hello COMMAND` | a variable for **that one command** | COMMAND only: your shell is unchanged afterwards |

**No spaces around `=`.** `GREETING = hello` runs a command called `GREETING` and gets
`command not found`. And like most commands that change something, an assignment or an `export`
prints nothing when it works.

Inside **double quotes** the shell still swaps `$NAME` for its value, so `"$USER in $HOME"`
prints `cadet in /home/cadet`. Inside **single quotes** it doesn't: `echo '$HOME'` prints `$HOME`,
exactly as written. *Variables and quoting* in Unit 1.2 covers quoting properly.

That's why `bash -c` gets its command in **single quotes**: your shell passes `$GREETING` on
untouched, and the child shell swaps in its own value, if it has one. With double quotes your
shell would swap it in first, and the child would seem to see a variable it was never given.

> **On the real station:** servers configure programs the same way. Settings and secrets, such
> as a database password, come from the environment, not from the code: this app reads its own
> from it at startup, and *Python & Containers* shows how Docker hands them over. Secrets
> belong in the environment, **never** in the code.

## PATH: where commands come from

`PATH` is an environment variable that holds a list of directories, **separated by `:`**. When
you type a command name such as `python3`, the shell searches those directories left to right
and runs the first file with that name that you may run (module 04's `x` bit):

```bash
echo $PATH
# something like /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

There `/usr/local/bin` is searched before `/usr/bin`, so a `python3` in `/usr/local/bin` wins.
The `sbin` directories hold programs for administrators. Most programs print their version
with `--version`, a long option (module 06), so `python3 --version` tells you which one ran.

| You type | Prints |
|---|---|
| `type -a NAME` | every NAME on the PATH, in search order: the first one is what runs |
| `which NAME` | only the one that wins (`command -v NAME` prints the same) |

The current directory is **not** on the PATH, so you run a script in it with an explicit path:
`./deploy.sh`. A name with a `/` in it is a path, so the shell runs that file and doesn't search
`PATH` at all. Plain `deploy.sh` gets `command not found`. That's deliberate: otherwise a file
called `ls` that someone left in a shared directory could run instead of the real one.

### Putting a directory first

`PATH` is already an environment variable, so a new value reaches every program you start from
then on. Writing `export` in front is the usual habit, and it does no harm. Prepend a directory to
make its programs win:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

In pieces:

- `$HOME/.local/bin` is the directory being added, a common home for your own programs;
- `:` separates it from the rest of the list;
- `$PATH` is the old list. The shell swaps in its value, so the new `PATH` is your directory
  followed by everything that was there before;
- the double quotes keep the whole value one word, even if a directory has a space in its name,
  and still let the `$`s through.

`export` says nothing, so check with `echo $PATH` or `which NAME`.

**Leave out `:$PATH` and the old list is gone.** `export PATH="$HOME/.local/bin"` leaves only that
one directory, so `ls`, `cat` and nearly everything else become `command not found`. Get them back
with `export PATH=/usr/local/bin:/usr/bin:/bin`, or open a new shell. In the station console,
Reset does the same, but it also puts every file back as it started. The console adds "only
knows the basics" to its `command not found`; after a bad `PATH`, it's the `PATH`, not the
console.

## Making it stick

Variables set at the prompt vanish when the shell exits. To keep them, add them to a startup
file:

| File | Read by |
|---|---|
| `~/.bashrc` | every new interactive Bash shell: one you type into, such as a new terminal window |
| `~/.profile` | the shell you get when you first log in to a machine |

To add a line, edit the file (nano comes in Unit 1.2) or append it with `>>`, in single quotes
so `$PATH` is written as it is rather than expanded now:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

Everything between the single quotes goes into the file exactly as typed, double quotes
included. `>>` prints nothing, so check with `tail -n 1 ~/.bashrc`:

```text
export PATH="$HOME/.local/bin:$PATH"
```

**Appending** with `>>` matters: a single `>` would replace the whole file with that one line.
After editing, `source ~/.bashrc` runs the file in the shell you're in, so you needn't open a new
one. Like `export`, `source` prints nothing when it works.

## Try it

Run these one at a time, on a Linux machine or in the station console:

```bash
GREETING=hello
bash -c 'echo "child sees: $GREETING"'
export GREETING=hello
bash -c 'echo "child sees: $GREETING"'
ONEOFF=hi bash -c 'echo "one-off: $ONEOFF"'
echo "after: $ONEOFF"
echo '$HOME' "$HOME"
type -a ls
echo 'echo hello from a script' > hi.sh
chmod +x hi.sh
./hi.sh
hi.sh
echo 'export ORBIT=on' >> ~/.bashrc
source ~/.bashrc
echo $ORBIT
```

- The first `child sees:` is empty: a shell variable stays in your shell, and the single quotes
  stop yours swapping it in. After `export`, the child gets `hello`.
- `one-off: hi`, then `after:` with nothing: the variable was only for that one command.
- `'$HOME'` prints as written, and `"$HOME"` as your home directory.
- `type -a ls` lists every `ls` on your PATH, in order. On Ubuntu it may start with
  `ls is aliased to …`, a shortcut `.bashrc` sets up, which you can ignore for now.
- `./hi.sh` runs your script, and plain `hi.sh` gets `command not found`: the current directory
  isn't on the PATH.
- After `source`, `echo $ORBIT` prints `on`. The line is harmless, and it stays in your `.bashrc`.
