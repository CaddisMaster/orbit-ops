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
      the long format, `-h` makes sizes human-readable, and `-R` (not in this lesson) lists
      every subdirectory too.
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
terminal:
  task: |
    Okafor left you a message in a **hidden** file in `/station/comms/relay`.

    1. Go to `/station/comms/relay`, find the file, and read it (`cat` prints a file).
    2. From `/station/comms/relay`, go where it says. Try a **relative** path; an absolute one
       works too. The console checks only where you end up, so you're done the moment you
       arrive.
  cwd: /home/cadet
  files:
    - {path: /home/cadet, type: dir}
    - {path: /station, type: dir}
    - {path: /station/comms, type: dir}
    - {path: /station/comms/relay, type: dir}
    - {path: /station/comms/relay/frequencies.txt, contents: "relay-1 121.5\nrelay-2 243.0\n"}
    - {path: /station/comms/relay/.okafor, contents: "Meet me at the docking ring: /station/docking/bay-2\n"}
    - {path: /station/docking, type: dir}
    - {path: /station/docking/bay-1, type: dir}
    - {path: /station/docking/bay-2, type: dir}
  checks:
    - {cwd: /station/docking/bay-2}
  success: |-
    Okafor looks up from a crate as you float in. "You found the dotfile. Most people walk straight past those."
  solution:
    - cd /station/comms/relay
    - ls
    - ls -a
    - cat .okafor
    - cd ../../docking/bay-2
    - pwd
comms:
  open:
    - {from: meridian, text: "RELAY SATELLITE RL-7 · RISING · COMMS WINDOW 14 MIN"}
    - {from: okafor, text: "No map, no menu. Just a cursor that knows where it is. Ask it."}
    - {from: okafor, text: "I left you a note in the relay's directory. You'll have to look harder than `ls` to see it."}
  console_done:
    - {from: okafor, text: "Bay 2. You found the dotfile. Most people walk straight past those."}
    - {from: mission, text: "*Meridian*, this is Mission Control. We have you on the relay. Good to hear from you."}
  complete:
    - {from: mission, text: "Send us everything from the outage you can. We'll start the analysis on our side."}
    - {from: okafor, text: "You heard them. Tomorrow we clean up the cargo bay."}
  window: {open: relay-pass}
cards:
  - id: ls-lah
    section: "Looking: `ls`"
    front: What does `ls -lah` show?
    back: Every entry including hidden ones (`-a`), in long format (`-l`), with human-readable sizes (`-h`).
  - id: cd-dash
    section: "Moving: `cd`"
    front: "`cd -` vs `cd ..`"
    back: "`cd -` returns to the previous directory; `cd ..` goes up one level."
  - id: hidden-files
    section: "Hidden files"
    front: What makes a file "hidden" on Linux?
    back: Its name starts with a dot (`.bashrc`, `.env`). There's no hidden attribute; `ls` just skips dotfiles unless you pass `-a`.
---

## Where am I?

The shell always has a **current working directory**: module 01's current directory, by its
full name. Every relative path you type is resolved from there. `pwd` (**p**rint **w**orking **d**irectory) prints it as a full path, and the
prompt shows it too.

## Moving: `cd`

Every row starts from the same place, `/var/log`, and home is `/home/cadet`:

| Command | Takes you to | From `/var/log`, that's |
|---|---|---|
| `cd /etc` | an absolute path: the same place from anywhere | `/etc` |
| `cd nginx` | a relative path: a directory inside where you are | `/var/log/nginx` |
| `cd ..` | up one level | `/var` |
| `cd ../..` | up two levels: each `..` is one step up | `/` |
| `cd ../lib/apt` | up one, then down into `lib/apt` | `/var/lib/apt` |
| `cd ../../etc/nginx` | up two, then down into `etc/nginx` | `/etc/nginx` |
| `cd -` | back to the directory you were in before this one, and prints its path: the one `cd` that isn't silent | wherever you came from |
| `cd` | home (the same as `cd ~`) | `/home/cadet` |

**To work out a relative path between two places**, go up with `..` until you reach a directory
both paths share, then go down from there. From `/var/log` to `/var/lib/apt`, the directory they
share is `/var`: one `..` gets you there, then `lib/apt` goes down, so it's `cd ../lib/apt`.

A path is a list of steps separated by `/`. `..` is a step like any other directory name, so it
needs its slash too: `../archive`, never `..archive`.

**In the station console,** home is the directory the task starts in, so a bare `cd` takes you
back to the start. The prompt shows `~` only when that's `/home/cadet`; anywhere else it shows
the full path.

## Looking: `ls`

On its own `ls` lists names. Its options (also called **flags**, the word most people use) are
where it gets useful:

| Command | Shows |
|---|---|
| `ls -l` | long format: permissions and owner (module 04), size, date |
| `ls -a` | **all** entries, including hidden dotfiles (see below) |
| `ls -h` | with `-l`, sizes like `4.0K` (4 kilobytes) and `12M` (12 megabytes) instead of bytes |
| `ls -ld /etc` | one long line for `/etc` itself, not for what's inside it |

Flags combine: **`ls -lah` is `-l`, `-a` and `-h` written together**, and it's the one you'll
type most. `ls -t` (newest first) is handy too, but it isn't on the station console.

Here's what a line of `ls -l` means:

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

It's a line like the one the server that runs this app shows for its settings file. Owner and group are module 04's
subject, and you can ignore the link count for now. `ls -l` also prints a `total` line first,
which you can ignore too. The `.env` file starts with a dot, so a plain `ls` would not show it
at all.

## Hidden files

Any name beginning with `.` is hidden. Such a file is called a **dotfile**. There's no special
attribute; it's purely a naming convention that `ls` (and most file browsers) respect.
Configuration often lives in dotfiles (`~/.bashrc` holds your shell's settings, and `.env` an app's), so get in the habit
of `ls -a` when something "should be there".

**The dot is part of the name.** To read `.bashrc` you type `cat .bashrc`; `cat bashrc` is a
different file, which probably doesn't exist.

`ls -a` also lists two entries named `.` and `..`. They aren't files: they're module 01's
shortcuts for "this directory" and "the one above", and every directory has them.

## Typing less

- **Tab** completes file and directory names: type the start of one and press Tab. If several
  names match, press it twice to see them all.
- **↑** recalls earlier commands. On a real shell **Ctrl-R** also searches your history as you
  type (the station console has ↑ and Tab, not Ctrl-R).

## Try it

Run these one at a time, on a Linux machine or in the station console:

```bash
cd /etc
pwd
cd -
pwd
cd
pwd
ls ~
ls -a ~
ls -lah ~
ls -ld ~
```

- `cd -` takes you back to where you were before `/etc`, and prints that path. A bare `cd` takes you home.
  `pwd` after each one shows where you landed.
- `ls ~` and `ls -a ~` list the same directory. Count how many more names `-a` shows, and spot
  `.` and `..` among them. (In the station console your home is empty, so `ls ~` prints
  nothing and `-a` adds only `.` and `..`.)
- `ls -ld ~` prints one line, for your home directory itself.
- For Tab, type `cd /e` and press Tab: the shell finishes `/etc/` for you.
