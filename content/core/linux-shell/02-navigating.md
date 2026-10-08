---
title: Finding your way around
minutes: 15
story: |
  **Mission log, day 2.** The terminal blinks a prompt at you and nothing else. "No map,
  no menu," says Okafor. "Just a cursor that knows where it is. Ask it."
quiz:
  - type: choice
    q: You type `cd` with no arguments and press Enter. Where are you now?
    options: ["The root directory, `/`", "Your home directory", "The directory you were in before", "Nowhere: it's an error"]
    answer: 1
    explain: >-
      A bare `cd` takes you home (`~`). It's the quickest way back from deep inside the tree.
  - type: choice
    q: Which `ls` flag shows files whose names start with a dot?
    options: ["`-l`", "`-a`", "`-h`", "`-R`"]
    answer: 1
    explain: >-
      `-a` shows **all** entries, including hidden dotfiles like `.bashrc` and `.env`. `-l` is
      the long format, `-h` makes sizes human-readable, and `-R` recurses into subdirectories.
  - type: choice
    q: What does `cd -` do?
    options: ["Goes up one level", "Returns to the directory you were in before", "Goes to your home directory", "Lists the current directory"]
    answer: 1
    explain: >-
      `cd -` swaps back to the previous directory, which is handy for bouncing between two places
      like `/etc/nginx` and `/var/log/nginx`. Going up one level is `cd ..`.
  - type: fill
    q: Which command prints the directory you're currently in?
    answer: ["pwd"]
    explain: >-
      `pwd` means **p**rint **w**orking **d**irectory. Your prompt often shows it too, but `pwd`
      always gives the full absolute path.
cards:
  - front: What does `ls -lah` show?
    back: Every entry including hidden ones (`-a`), in long format (`-l`), with human-readable sizes (`-h`).
  - front: "`cd -` vs `cd ..`"
    back: "`cd -` returns to the previous directory; `cd ..` goes up one level."
  - front: What makes a file "hidden" on Linux?
    back: Its name starts with a dot (`.bashrc`, `.env`). There's no hidden attribute; `ls` just skips dotfiles unless you pass `-a`.
---

## Where am I?

The shell always has a **current working directory**. Every relative path you type is resolved
from there.

```bash
pwd          # print it: /home/sean
```

## Moving: `cd`

```bash
cd /var/log      # absolute path: works from anywhere
cd nginx         # relative: now in /var/log/nginx
cd ..            # up one level: /var/log
cd -             # back to where you just were: /var/log/nginx
cd               # home: /home/sean (same as cd ~)
```

## Looking: `ls`

On its own `ls` lists names. Its flags are where it gets useful:

| Command | Shows |
|---|---|
| `ls -l` | long format: permissions, owner, size, date |
| `ls -a` | **all** entries, including hidden dotfiles |
| `ls -h` | with `-l`, sizes like `4.0K` and `12M` instead of bytes |
| `ls -t` | newest first (add `-r` to reverse) |
| `ls -d dir` | the directory itself, not its contents |

Flags combine, so `ls -lah` is the one you'll type most. Here's what a line of it means:

```text
-rw------- 1 deploy deploy 293 Oct  8 18:34 .env
│          │ │      │      │   │            └ name
│          │ │      │      │   └ last modified
│          │ │      │      └ size in bytes
│          │ │      └ group
│          │ └ owner
│          └ link count
└ type and permissions (next modules)
```

That's a real line from the droplet that runs this app. The `.env` file starts with a dot, so a
plain `ls` would not show it at all.

## Hidden files

Any name beginning with `.` is hidden. There's no special attribute; it's purely a naming
convention that `ls` (and most file browsers) respect. Configuration often lives in dotfiles
(`~/.bashrc`, `~/.ssh/`, `.gitignore`, `.env`), so get in the habit of `ls -a` when something
"should be there".

## Typing less

- **Tab** completes file and directory names. Press it twice to see all the matches.
- **↑** recalls earlier commands, and **Ctrl-R** searches your history as you type.

## Try it

```bash
cd /etc && pwd
ls -lah | head
cd - && pwd
ls -a ~
```

Notice how many dotfiles your home directory has once you add `-a`.
