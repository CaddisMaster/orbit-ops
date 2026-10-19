---
title: The filesystem tree
minutes: 15
xp: 50
story: |
  **Mission log, day 1.** The airlock cycles and you float into a control room lit only by
  amber standby lights. One terminal is still awake. Chief Okafor's voice crackles over the
  comm: "Before you touch anything, cadet, learn where things *live*. Every system on this
  station is a file somewhere. Find the right one and you can fix anything."
quiz:
  - type: choice
    q: Which directory is the top of the entire Linux filesystem?
    options: ["/home", "/", "/root", "~"]
    answer: 1
    explain: >-
      `/` (called "root") is the single top of the tree. Everything else, including other
      disks, hangs somewhere below it. `/root` is just the root *user's* home directory.
  - type: choice
    q: A service's configuration file is most likely to be found under…
    options: ["/etc", "/bin", "/tmp", "/home"]
    answer: 0
    explain: >-
      System-wide configuration lives in `/etc`, for example `/etc/nginx/` (a web server's) or
      `/etc/ssh/sshd_config` (the remote-login service's).
  - type: multi
    q: Which of these directories usually hold data that changes while the system runs?
    options: ["/var/log", "/usr/bin", "/tmp", "/etc"]
    answer: [0, 2]
    explain: >-
      `/var` is for variable data such as logs, caches and databases, and `/tmp` is scratch
      space. `/usr/bin` holds installed programs, and `/etc` changes only when someone edits
      the configuration.
  - type: fill
    q: An absolute path always starts with which character?
    answer: ["/"]
    explain: >-
      Absolute paths start at the root, `/`. A path without a leading `/` (like `logs/app.log`)
      is relative to your current directory.
  - type: choice
    q: What does this prompt tell you?
    code: |-
      okafor@relay:/var/log$
    options:
      - "You're `okafor`, on the machine `relay`, in `/var/log`, as a normal user"
      - "You're logged in as `relay`, in Okafor's home directory"
      - "The last command failed in `/var/log`"
      - "You're root, on a machine called `okafor`"
    answer: 0
    explain: >-
      A prompt reads user@machine:directory, then `$` for a normal user (`#` would mean root).
      It's worth a glance before every command: it tells you where a relative path will start
      from, and which machine you're about to change.
terminal:
  task: |
    Configuration lives under `/etc` and logs live under `/var/log`.

    1. **Look** inside `/var/log` without moving: `ls` takes a path too.
    2. **Go to** the directory that holds the **life-support logs**. The console checks after
       every command, so the task is done the moment you're in it. Your prompt shows where
       you are.
    3. **Then read** the scrubbers' log with `cat`: when did scrubber B go offline? Nothing
       checks this step, but note the time. It matters later.
  cwd: /home/cadet
  files:
    - {path: /home/cadet, type: dir}
    - {path: /etc/hostname, owner: root, group: root, contents: "meridian\n"}
    - path: /etc/life-support/scrubbers.conf
      owner: root
      group: root
      contents: |
        cycle_minutes = 20
    - {path: /var/log/syslog, owner: root, group: root, contents: "boot: life support on standby\n"}
    - path: /var/log/life-support/scrubbers.log
      owner: root
      group: root
      contents: |
        02:00 scrubber A: nominal
        02:20 scrubber B: CO2 rising
        02:40 scrubber B: offline
    - {path: /var/log/comms, type: dir, owner: root, group: root}
    - {path: /tmp, type: dir, mode: "777", owner: root, group: root}
  checks:
    - {cwd: /var/log/life-support}
  success: |-
    "Found it," Okafor says. "Now read the scrubbers' log: when did B go down? Remember where the logs live; you'll be back."
  solution:
    - ls /
    - ls /var/log
    - cd /var/log/life-support
    - cat scrubbers.log
comms:
  open:
    - {from: meridian, text: "POWER RESTORED · CONTROL ROOM · LIFE SUPPORT ON STANDBY"}
    - {from: okafor, text: "You're awake. Good. The outage took half the station dark and nobody's sure what still works."}
    - {from: okafor, text: "Before you touch anything, learn where things *live*. Every system on this station is a file somewhere."}
  console_done:
    - {from: meridian, text: "SCRUBBER LOG FOUND · `/var/log/life-support/scrubbers.log` · 3 ENTRIES"}
    - {from: okafor, text: "That's the one. Logs in `/var/log`, config in `/etc`. Remember that and you're never lost."}
  complete:
    - {from: okafor, text: "Day one done. Get some sleep. Tomorrow we find out who else is still out there."}
cards:
  - id: reading-files
    section: "Looking, moving and reading"
    front: Read a short file, and page through a long one
    back: "`cat file` prints all of it. `less file` pages: Space and b to move, `/word` to search, q to quit."
  - id: etc
    section: "The directories you'll use most"
    front: What lives in `/etc`?
    back: System-wide configuration files (e.g. `/etc/nginx/` for the web server).
  - id: var
    section: "The directories you'll use most"
    front: What lives in `/var`?
    back: Variable data the system writes while it runs — logs (`/var/log`), caches, databases.
  - id: absolute-vs-relative
    section: "Absolute and relative paths"
    front: Absolute vs relative path?
    back: Absolute starts at `/` and means the same thing from anywhere. Relative is resolved from your current directory.
  - id: shell-vs-terminal
    section: "The shell: what reads your commands"
    front: The terminal versus the shell?
    back: The terminal is the window. The shell (usually bash) is the program in it that reads each line you type and runs it.
---

## The shell: what reads your commands

The **terminal** is the window you type into. The program inside it that reads what you type
and runs it is the **shell**. Most Linux machines, including Ubuntu (a popular version of Linux), give you **bash**,
and the station console works like it.

The shell shows a **prompt** when it's ready for the next command:

```text
cadet@meridian:/etc$
```

That's **who you are** (`cadet`), **which machine** (`meridian`), and **where you are**
(`/etc`). `~` means your **home directory**, `/home/cadet`, where your own files live. The directory you're in is your **current
directory**, and the prompt always shows it.

The prompt ends in `$` for a normal user and `#` for **root**. Here root is a *user*: the
administrator account, the one allowed to change anything on the machine. The next section uses
"root" for something else, the top directory `/`. Same word, two meanings.

You type a line and press Enter. **The first word is the command and the rest are its
arguments**: in `ls /home`, the command is `ls` and its argument is `/home`. (`ls` lists a
directory and `cd` moves you into one. Both are explained below.) **The shell
reads the whole line before the command runs**. Module 03 shows why that matters.

An error tells you who's complaining. `bash: cd: /nowhere: No such file or directory` starts
with `bash`, so the shell itself is complaining. `ls: cannot access '/nowhere'` comes from the
`ls` program.

## One tree, one root

A **directory** is what Windows and macOS call a folder. Windows gives every disk its own
letter: `C:\`, `D:\`. Linux doesn't. There is **one tree**,
and it starts at a single directory called **root**, written `/`. Every file on the machine,
on every disk, has exactly one place in that tree.

```text
/
├── bin  → usr/bin       programs everyone can run
├── etc                  system configuration
├── home
│   └── cadet            your files
├── opt                  add-on software (and Orbit Ops itself: /opt/orbit-ops)
├── root                 the root user's home — not the same as /
├── tmp                  scratch space, often wiped on reboot
├── usr                  installed programs and the code they share
└── var
    └── log              logs
```

`bin → usr/bin` means `/bin` is a shortcut to `/usr/bin`: one directory, two names.

Extra disks don't get letters. They are **mounted** onto a directory somewhere in the tree,
like plugging a module into a socket on the station's wall.

## The directories you'll use most

| Directory | What's in it | You'll go there to… |
|---|---|---|
| `/etc` | Configuration, as plain text. It rarely changes unless someone edits it | change how a program is set up |
| `/var` | **Variable** data: files the system writes while it runs, such as logs, caches and databases | see what's been happening |
| `/var/log` | Logs | find out what went wrong |
| `/home/cadet` | Your own files (`~` is shorthand for your home) | work |
| `/opt` | Software someone installed by hand, rather than with the system's installer | find a deployed app |
| `/tmp` | Throwaway files that programs create and delete as they run, often wiped on reboot | stash something briefly |
| `/usr/bin` | Programs (`ls`, `python3`, `git`…) | see what's installed |

This layout isn't random. It follows the **Filesystem Hierarchy Standard**, which is why one
Linux machine feels like another once you know your way around.

Much of `/etc` configures **services**: programs that run in the background all the time,
waiting for work, such as a web server.

> **On the real station:** the droplet (the rented server) that serves this app keeps its deploy files in
> `/opt/orbit-ops`, its web server config in `/etc/nginx/sites-available/`, and its logs under
> `/var/log/nginx/`. That's three directories from the table above.

## Absolute and relative paths

A **path** names a place in the tree.

- An **absolute path** starts with `/` and means the same thing no matter where you are:
  `/var/log/syslog`.
- A **relative path** has no leading `/` and is resolved from your **current directory**: if
  you're in `/var`, then `log/syslog` means `/var/log/syslog`.
- **A file's name on its own is a relative path too**: in `/etc`, `cat hostname` reads
  `/etc/hostname`.

Three shortcuts work in any path:

| Shortcut | Means | From `/var/log`, it is… |
|---|---|---|
| `~` | your home directory | `/home/cadet` |
| `.` | the directory you're in | `/var/log` |
| `..` | the directory above it | `/var` |

So from `/var/log`, `ls ..` lists `/var`, and `~/notes.txt` is `/home/cadet/notes.txt`
wherever you are. Module 02 puts all three to work.

## Looking, moving and reading

Six commands get you through this module's console task and its Try it. The next modules go
deeper. In the table, a word in capitals, like `DIR` or `FILE`, stands for a real directory or
file you type in its place. A word starting with `-` is an **option**: it changes what the
command does. `-n 5` means "5 lines", and you can change the number.

| Command | Does | Example |
|---|---|---|
| `ls DIR` | lists what's in a directory, without going there | `ls /etc` |
| `cd DIR` | moves you into a directory | `cd /etc` |
| `cat FILE` | prints a whole file: right for anything short | `cat /etc/hostname` |
| `less FILE` | pages through a long one: Space goes forward and b goes back, `/` then a word to search, q to quit | `less /etc/passwd` |
| `head -n 5 FILE` / `tail -n 5 FILE` | just the first or last 5 lines (in a log, the newest are at the end) | `tail -n 5 /etc/passwd` |

`ls` on its own lists where you are. Give it a path and it lists that directory instead, so you
can look before you move. An empty directory lists as nothing at all. `cd` accepts any path, absolute or relative. **`cd` prints nothing
when it works**: the only sign is the path in your prompt changing. Give it a file instead of a
directory and it refuses with `Not a directory`.

These are how you **read** a file. **nano** is for *editing* one, and it comes in Unit 1.2 along
with the scripts you'll write.

## Try it

If you have a Linux machine, or a Linux server you can log in to, run these there. No Linux
machine? The station console above takes all of them except `head -n 3 os-release`.

```bash
ls /
ls /etc
cd /etc
ls ..
ls ~
cat hostname
head -n 3 os-release
tail -n 3 passwd
less passwd
```

The first shows the top of the tree, and the second the config files. After `cd /etc`, watch
your prompt change. `ls ..` lists the directory above (`/`) and `ls ~` your home, from where
you stand. Then read three files by their names alone: the machine's name, the first lines
describing which Linux it is, and the last three accounts. `less` opens the last one to page
through: press Space, then b, then `/` and type `root` and Enter, then q to get back. A full
Ubuntu install has `less`, but a bare container may answer `less: command not found`. If yours
does, run `less /etc/passwd` in the station console, which has it.
