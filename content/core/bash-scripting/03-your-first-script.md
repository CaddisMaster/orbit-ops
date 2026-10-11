---
title: Your first script
minutes: 20
story: |
  **Mission log, day 13.** Okafor sticks a note to your console: the commands she types at the
  start of every shift, in the order she types them. "Make the station type them," she says.
  "I'd like to drink my coffee while it's hot."
quiz:
  - type: choice
    q: "You wrote `backup.sh` and try to run it. What's wrong, and what's the fix?"
    code: |-
      $ ./backup.sh
      bash: ./backup.sh: Permission denied
      $ ls -l backup.sh
      -rw-rw-r-- 1 deploy deploy 212 Oct 11 09:00 backup.sh
    options:
      - "It has no execute bit: `chmod +x backup.sh`, or run it with `bash backup.sh`"
      - "It needs root: `sudo ./backup.sh`"
      - "The shebang is wrong: change it to `#!/bin/sh`"
      - "The current directory isn't on the PATH: use `backup.sh` without `./`"
    answer: 0
    explain: >-
      `rw-rw-r--` has no `x` anywhere, so the kernel refuses to run the file. `chmod +x` adds it.
      `bash backup.sh` works without it, because then bash is the program being run, and it
      only needs to *read* the file. `sudo` wouldn't help a file that isn't executable.
  - type: choice
    q: "What is the first line of a script, `#!/usr/bin/env bash`, for?"
    options:
      - "It tells the system which program runs the file when you run it as `./script`"
      - "It's a comment, so bash ignores it and it does nothing"
      - "It makes the file executable"
      - "It imports bash's built-in commands"
    answer: 0
    explain: >-
      `#!` (the "shebang") names the interpreter. `env` finds `bash` on your PATH, so the
      script works wherever bash is installed. Bash does read the line as a comment, but by
      then the system has already used it to pick bash. It doesn't set the execute bit:
      `chmod` does.
  - type: fill
    q: "A script's last line is `exit 3`. You run it, then type `echo $?`. What does it print?"
    answer: ["3"]
    explain: >-
      A script's exit status is the number it passes to `exit`. Without an `exit`, it's the
      status of the last command it ran. 0 means success and anything else means failure, which
      is what `&&`, `||` and `if` look at.
  - type: choice
    q: "You put `shift-check` in `~/bin` and made it executable, but the shell can't find it. What's going on?"
    code: |-
      $ ls -l ~/bin
      -rwxrwxr-x 1 sean sean 120 Oct 11 09:00 shift-check
      $ shift-check
      shift-check: command not found
    options:
      - "`~/bin` isn't on your PATH yet: Ubuntu adds it at login only if it existed then, so log in again (or `export PATH=\"$HOME/bin:$PATH\"`)"
      - "Scripts must end in `.sh` to be found"
      - "It needs `sudo` because it's in a bin directory"
      - "`~/bin` is a system directory, so the shell ignores it"
    answer: 0
    explain: >-
      The shell looks for a command only in the directories on `$PATH`. Ubuntu's `~/.profile`
      adds `~/bin` when you log in, but only if the directory already exists, so a `~/bin` made
      during this session isn't on it yet. `echo $PATH` shows what is.
cards:
  - id: shebang
    front: "What does `#!/usr/bin/env bash` at the top of a script do?"
    back: "It names the program that runs the script: `env` finds `bash` on the PATH."
  - id: run-a-script
    front: "`./script.sh` vs `bash script.sh`"
    back: "`./script.sh` needs the execute bit (`chmod +x`). `bash script.sh` only reads the file, so it doesn't."
  - id: exit-status
    front: "A script's exit status"
    back: "The number passed to `exit`, or else the last command's status. 0 is success; `echo $?` shows it."
  - id: personal-bin
    front: "Where do your own scripts go, so you can run them by name?"
    back: "`~/bin` (on Ubuntu, on the PATH from your next login). For every user: `/usr/local/bin`, with sudo."
terminal:
  task: |
    Okafor's sticky note is in your home directory: `sticky-note.txt`. Turn it into a script.

    1. Write `/station/bin/shift-check` (nano is easiest). Its first line is the shebang
       `#!/usr/bin/env bash`, and after it come the note's commands, one per line.
    2. Make it **executable**.
    3. `/station/bin` is on your `PATH`, so run it **by name**, `shift-check`, and save what it
       prints to `shift-report.txt` in your home directory.
  cwd: /home/cadet
  env: {PATH: "/station/bin:/usr/local/bin:/usr/bin:/bin"}
  files:
    - {path: /home/cadet, type: dir}
    - path: /home/cadet/sticky-note.txt
      contents: |
        START OF SHIFT (every. single. shift.)

        cat /station/sensors/o2
        tail -n 1 /var/log/scrubber/scrubberd.log
        df -h /

        - O. (the other nine can wait)
    - {path: /station/bin, type: dir, owner: root, group: crew, mode: "775"}
    - {path: /station/sensors/o2, owner: root, group: root, contents: "O2 20.6% (ring A 20.8 · ring B 20.4)\n"}
    - path: /var/log/scrubber/scrubberd.log
      owner: root
      group: root
      contents: |
        2026-10-08 07:55:00 scrubbers nominal: 2 beds, ring-b CO2 3500 ppm
        2026-10-08 08:25:00 scrubbers nominal: 2 beds, ring-b CO2 3450 ppm
        2026-10-08 08:55:00 scrubbers nominal: 2 beds, ring-b CO2 3400 ppm
  checks:
    - {exists: /station/bin/shift-check, type: file}
    - {contains: /station/bin/shift-check, text: "#!/usr/bin/env bash"}
    - {executable: /station/bin/shift-check}
    - {contains: /home/cadet/shift-report.txt, text: "O2 20.6%"}
    - {contains: /home/cadet/shift-report.txt, text: "ring-b CO2 3400 ppm"}
    - {contains: /home/cadet/shift-report.txt, text: /dev/vda1}
  success: |-
    Okafor reads the report over your shoulder, coffee in hand. "Three commands, one word. Now do that for the other nine."
  solution:
    - cat sticky-note.txt
    - echo '#!/usr/bin/env bash' > /station/bin/shift-check
    - echo 'cat /station/sensors/o2' >> /station/bin/shift-check
    - echo 'tail -n 1 /var/log/scrubber/scrubberd.log' >> /station/bin/shift-check
    - echo 'df -h /' >> /station/bin/shift-check
    - shift-check
    - chmod +x /station/bin/shift-check
    - shift-check
    - shift-check > shift-report.txt
    - cat shift-report.txt
comms:
  open:
    - {from: okafor, text: "Every shift starts the same way: me, a coffee going cold, and the same commands typed in the same order."}
    - {from: okafor, text: "I left you the list. Make the station type them."}
  console_done:
    - {from: meridian, text: "SHIFT CHECK · O2 20.6% · SCRUBBERS NOMINAL · DISK OK"}
    - {from: okafor, text: "One word instead of three commands. And it'll never forget one, which I do."}
  complete:
    - {from: okafor, text: "It runs the same thing every time. Next it needs to be told *what* to check: which ring, which threshold."}
    - {from: okafor, text: "That means variables, and quoting them properly. Tomorrow."}
---

## A script is a file of commands

Anything you can type at the prompt, you can put in a file, one command per line, and run the
file instead. The shell reads it top to bottom, exactly as if you'd typed each line.

```bash
#!/usr/bin/env bash
# Start-of-shift check: what Okafor types every morning.
cat /etc/hostname
free -h
df -h /
```

That's a whole script: the shebang, a comment, and three commands.

## The first line: the shebang

The first line, starting with `#!` (say "shebang"), tells the system **which program runs the
file**. You'll see two forms:

| First line | Means |
|---|---|
| `#!/usr/bin/env bash` | run it with whichever `bash` is first on the PATH: works on any system |
| `#!/bin/bash` | run it with the bash at exactly `/bin/bash` |
| `#!/bin/sh` | run it with the plain POSIX shell, which has fewer features than bash |

Use `#!/usr/bin/env bash`. It has to be the very first line, with nothing before it, not even
a blank line. Anywhere else it's ignored, and a script started from bash may still seem to work,
because bash falls back to running it itself. Started from anything else, it won't.

## Comments

A `#` starts a **comment**: the rest of the line is for people, and bash skips it. Say *why*
the script does something, because the commands already say what. Bash reads the shebang as a
comment too, but by then the system has already used it.

## Making it runnable

A new file isn't executable, so running it fails with **`Permission denied`**. There are two
ways to run a script:

| How | Needs the execute bit? | What happens |
|---|---|---|
| `bash script.sh` | no | bash is the program; it only reads the file |
| `./script.sh` | **yes** | the system runs the file, using its shebang |
| `script.sh` (just the name) | **yes** | the same, but the shell has to find it on the PATH |

`chmod +x script.sh` adds the execute bit (day 4), and from then on `./script.sh` works. The
`./` means "the one in this directory": the current directory isn't on the PATH (day 9).

## Exit statuses

Every script ends with a number, like every command (day 6): **0 means success**, anything else
means failure.

| Line | Status the script ends with |
|---|---|
| `exit 0` | 0: success |
| `exit 1` | 1: failure (any number from 1 to 255) |
| no `exit` at all | the status of the last command it ran |

`echo $?` straight after running it shows the number. It matters because whatever runs your
script decides what to do next from it: `./check.sh && ./deploy.sh` deploys only if the check
succeeded.

## Where scripts live

To run a script **by name** from anywhere, put it in a directory that's on your `PATH`:

| Directory | For | Notes |
|---|---|---|
| `~/bin` | your own scripts | Ubuntu's `~/.profile` adds it to the PATH at login, if it exists by then |
| `/usr/local/bin` | scripts for every user on the machine | owned by root, so `sudo` to put things there |
| the project's own directory | scripts that belong to one project | run them with `./`, like `./test.sh` |

`type NAME` tells you which file runs when you type NAME (day 9).

**On the real station:** this app's `test.sh` starts with `#!/usr/bin/env bash` and is
executable (`-rwxrwxr-x`), so you run it as `./test.sh`. The deploy script
`scripts/install_compose.sh` isn't executable at all. The release workflow pipes it into the
droplet's shell over SSH (`sh -s … < scripts/install_compose.sh`), and because `sh` only reads
it, the execute bit doesn't matter. That's `bash script.sh` at a distance.

## Try it

```bash
mkdir -p ~/scratch && cd ~/scratch
printf '#!/usr/bin/env bash\n# my first script\necho "Shift check on $(hostname)"\nexit 3\n' > check.sh
cat check.sh
./check.sh                  # Permission denied: no execute bit yet
bash check.sh; echo $?      # runs, then 3
chmod +x check.sh
./check.sh; echo $?         # runs, then 3
ls -l check.sh              # -rwxrwxr-x
```
