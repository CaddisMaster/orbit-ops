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
    q: You added an alias to `~/.bashrc`. How do you use it in the shell you already have open?
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
    2. Make it stick: add the line that does it to `~/.bashrc`, so every new shell gets it.
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
  - front: Shell variable vs environment variable
    back: "`NAME=x` is visible only to this shell. `export NAME=x` is also inherited by every program started from it."
  - front: How does the shell find a command?
    back: "It searches the directories in `$PATH`, left to right, and runs the first match."
  - front: Set a variable for one command only
    back: "`NAME=value command`, e.g. `DB_NAME=orbit_test pytest`."
---

## Variables

```bash
echo $HOME               # /home/sean
echo "$USER on $HOSTNAME"
printenv | sort | head   # everything in the environment
```

There are two kinds:

```bash
GREETING=hello           # shell variable: this shell only
export GREETING=hello    # environment variable: inherited by child processes
DB_NAME=orbit_test pytest   # set for ONE command, without changing your shell
```

That last form is exactly what this app's `test.sh` does to point the tests at a separate
database.

## Environment in real deployments

Programs read configuration from their environment instead of from hard-coded values. That's
how one Docker image runs locally and in production with different settings:

- Compose reads `.env` and passes the variables into the container (`env_file:`).
- Inside, Orbit Ops's `app/config.py` reads `DB_HOST`, `SECRET_KEY`, `COOKIE_SECURE` … from the
  environment and checks their types at startup.

Secrets belong in the environment (or a secrets manager), **never** in the code or the image.

## PATH: where commands come from

When you type `python3`, the shell searches every directory in `$PATH`, in order, and runs the
first file with that name:

```bash
echo $PATH
# something like /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

type -a python3        # every python3 on the PATH, in search order
which python3          # just the one that wins
```

The current directory is **not** on the PATH, so you run a local script with an explicit path:
`./deploy.sh`.

Prepend a directory to make its programs win:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Making it stick

Variables set at the prompt vanish when the shell exits. To keep them, add them to a startup
file:

| File | Read by |
|---|---|
| `~/.bashrc` | every new interactive Bash shell |
| `~/.profile` | login shells (SSH sessions, a desktop login) |

After editing, `source ~/.bashrc` applies it to the shell you're in.

## Try it

```bash
export ORBIT=on
bash -c 'echo "child sees: $ORBIT"'
ONEOFF=hi bash -c 'echo "one-off: $ONEOFF"'
echo "after: $ONEOFF"              # empty: it was only for that command
type -a ls python3
```
