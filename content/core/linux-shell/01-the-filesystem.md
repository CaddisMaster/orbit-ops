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
    options: ["/etc", "/bin", "/tmp", "/proc"]
    answer: 0
    explain: >-
      System-wide configuration lives in `/etc`, for example `/etc/nginx/` or
      `/etc/ssh/sshd_config`.
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
cards:
  - front: What lives in `/etc`?
    back: System-wide configuration files (e.g. `/etc/ssh/sshd_config`, `/etc/nginx/`).
  - front: What lives in `/var`?
    back: Variable data that changes while the system runs — logs (`/var/log`), caches, databases, mail.
  - front: Absolute vs relative path?
    back: Absolute starts at `/` and means the same thing from anywhere. Relative is resolved from your current directory.
---

## One tree, one root

Windows gives every disk its own letter: `C:\`, `D:\`. Linux doesn't. There is **one tree**,
and it starts at a single directory called **root**, written `/`. Every file on the machine,
on every disk, has exactly one place in that tree.

```text
/
├── bin  → usr/bin       programs everyone can run
├── etc                  system configuration
├── home
│   └── sean             your files
├── opt                  add-on software (and Orbit Ops itself: /opt/orbit-ops)
├── root                 the root user's home — not the same as /
├── tmp                  scratch space, often wiped on reboot
├── usr                  installed programs and their libraries
└── var
    └── log              logs
```

Extra disks don't get letters. They are **mounted** onto a directory somewhere in the tree,
like plugging a module into a socket on the station's wall.

## The directories you'll use most

| Directory | What's in it | You'll go there to… |
|---|---|---|
| `/etc` | Configuration, as plain text | change how a service behaves |
| `/var/log` | Logs | find out what went wrong |
| `/home/<you>` | Your own files (`~` is shorthand) | work |
| `/opt` | Software installed outside the package manager | find a deployed app |
| `/tmp` | Throwaway files | stash something briefly |
| `/usr/bin` | Programs (`ls`, `python3`, `git`…) | see what's installed |

This layout isn't random. It follows the **Filesystem Hierarchy Standard**, which is why an
Ubuntu droplet and a Debian container feel the same once you know your way around.

> **On the real station:** the droplet that serves this app keeps its deploy files in
> `/opt/orbit-ops`, its web server config in `/etc/nginx/sites-available/`, and its logs under
> `/var/log/nginx/`. That's three directories from the table above.

## Absolute and relative paths

A **path** names a place in the tree.

- An **absolute path** starts with `/` and means the same thing no matter where you are:
  `/var/log/syslog`.
- A **relative path** has no leading `/` and is resolved from your **current directory**: if
  you're in `/var`, then `log/syslog` means `/var/log/syslog`.

Three shortcuts work in any path:

```bash
~      # your home directory, e.g. /home/sean
.      # the directory you're in
..     # the directory above it
```

So from `/var/log`, the path `../lib` is `/var/lib`, and `~/notes.txt` is
`/home/sean/notes.txt` wherever you are.

## Try it

On any Linux machine (or the `jupiter` VM), run:

```bash
ls /
ls /etc | head
ls -l /var/log | head
```

The first shows the top of the tree. The second lists the first few config files. The third
shows log files with their sizes and dates. You'll meet `ls -l` properly later in this unit.
