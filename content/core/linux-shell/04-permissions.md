---
title: Permissions and ownership
minutes: 20
story: |
  **Mission log, day 4.** Someone left the station's master keys in a file every crew member
  can read. Okafor is not amused. "Fix it, before anyone else notices. And this time, look
  before you touch."
quiz:
  - type: choice
    q: After `chmod 640 secrets.txt`, who can do what?
    options:
      - "Owner read+write, group read, others nothing"
      - "Owner read, group write, others nothing"
      - "Owner read+write+execute, group read, others nothing"
      - "Everyone can read; only the owner can write"
    answer: 0
    explain: >-
      Each digit is a sum of read 4, write 2 and execute 1. 6 = 4+2 (rw) for the owner, 4 (r) for
      the group, 0 for everyone else.
  - type: fill
    q: What's the octal (number) form of `rwxr-xr--`?
    answer: ["754", "0754"]
    explain: >-
      Read it in threes and add each one up: rwx = 4+2+1 = 7, r-x = 4+1 = 5, r-- = 4. The owner
      does everything, the group can read and run it, and everyone else can only read it.
  - type: choice
    q: On a **directory**, what does the `x` (execute) bit allow?
    options: ["Running the directory as a program", "Entering it and reaching files inside it", "Listing the names in it", "Deleting it"]
    answer: 1
    explain: >-
      For directories, `x` means you may traverse into it (`cd`, or open a file by path). Listing
      names needs `r`, and creating or deleting entries inside needs `w`.
  - type: multi
    q: Which commands leave a file readable and writable by its owner only, and not executable?
    options: ["`chmod 600 file`", "`chmod 644 file`", "`chmod u=rw,go= file`", "`chmod 700 file`"]
    answer: [0, 2]
    explain: >-
      `600` and `u=rw,go=` are the same thing written two ways. `644` lets everyone read it, and
      `700` adds execute for the owner.
  - type: multi
    q: "You need to run `report.sh`, and your group must still be able to edit it. Which commands do that, and change nothing else?"
    code: |-
      $ stat -c '%a %A %n' report.sh
      660 -rw-rw---- report.sh
    options: ["`chmod u+x report.sh`", "`chmod 700 report.sh`", "`chmod 760 report.sh`", "`chmod a+x report.sh`"]
    answer: [0, 2]
    explain: >-
      `u+x` adds execute for the owner and leaves the rest alone, so 660 becomes 760, and
      writing `760` yourself gets the same result. `700` takes read and write away from the
      group: a number sets every class, not only the one you meant. `a+x` lets the group and
      everyone else run it too, which nobody asked for.
terminal:
  task: |
    First, look at both files' modes (`ls -l`, or `stat -c '%a %A %n' *` to see them as
    numbers too).

    - `scrubber.conf` holds the life-support override code, and right now every crew member
      can read it. Make it **readable and writable by you only**.
    - `purge.sh` is the filter purge you'll run next shift. Make it **executable by you**, and
      change **nothing else**: whoever can read it now should still be able to.

    Check the modes again when you're done.
  cwd: /station/life-support
  files:
    - {path: /station, type: dir}
    - {path: /station/life-support, type: dir}
    - path: /station/life-support/scrubber.conf
      mode: "644"
      contents: |
        # Life support: CO2 scrubber array
        cycle_minutes = 20
        override_code = 7731-ALPHA
    - path: /station/life-support/purge.sh
      mode: "644"
      contents: |
        #!/bin/bash
        echo "Purging scrubber filters..."
    - {path: /station/life-support/README, mode: "644", contents: "Scrubber configs. Ask Okafor before changing anything.\n"}
  checks:
    - {mode: /station/life-support/scrubber.conf, equals: "600"}
    - {mode: /station/life-support/purge.sh, equals: "744"}
  success: |-
    Okafor checks the listing over your shoulder. "600 on the config, 744 on the script. That's how it should have been from the start."
  solution:
    - 'ls -l'
    - "stat -c '%a %A %n' *"
    - 'chmod 600 scrubber.conf'
    - 'chmod u+x purge.sh'
    - "stat -c '%a %A %n' *"
comms:
  open:
    - {from: meridian, text: "ALERT · `/station/life-support/scrubber.conf` · MODE 644 · READABLE BY ALL CREW"}
    - {from: okafor, text: "Cadet. Someone left the life-support override code in a file **everyone on the station can read**."}
    - {from: okafor, text: "Read up on permissions, then fix it from the console. I'll be watching the listing."}
  console_done:
    - {from: meridian, text: "MODE CHANGE LOGGED · `scrubber.conf` 600 · `purge.sh` 744"}
    - {from: okafor, text: "That's the one. Now the systems check, so I know you know *why* it's 600."}
  complete:
    - {from: okafor, text: "Good work. Permissions are how this station decides who gets to break what."}
    - {from: mission, text: "*Meridian*, Mission Control. Supply shuttle *Kestrel* is on final approach to docking arm 2."}
    - {from: meridian, text: "DOCKING ARM 2 · CLEAR · *KESTREL* CAPTURED"}
  window: {complete: shuttle-dock}
cards:
  - id: octal-bits
    section: "Octal: the numbers"
    front: "Octal values of r, w, x"
    back: "r = 4, w = 2, x = 1. Add them per class: 7 = rwx, 6 = rw-, 5 = r-x, 4 = r--."
  - id: directory-execute
    section: "Directories are different"
    front: What does `x` mean on a directory?
    back: Permission to enter/traverse it. Listing names needs `r`; creating or deleting entries needs `w`.
  - id: octal-replaces
    section: "A number replaces everything; a letter changes one thing"
    front: "Why can `chmod 700` break a shared script, when `chmod u+x` doesn't?"
    back: "A number sets all three classes, so `700` also takes the group's and others' permissions away. `u+x` changes only the owner's x."
  - id: chown
    section: "Changing ownership: `chown`"
    front: Change a file's owner and group in one command
    back: "`chown user:group file` (needs root, so usually `sudo chown …`)."
---

## Reading the permission string

The first column of `ls -l` is ten characters:

```text
-rw-r-----  1 sean   ops    4096 Oct  8 18:34 report.csv
│└┬┘└┬┘└┬┘
│ │  │  └ others: ---  (everyone else)
│ │  └ group:  r--  (members of the file's group)
│ └ user:   rw-  (the file's owner)
└ type: - file, d directory, l symlink
```

**Skip the first character, then read the rest in threes**: the owner's three, the group's
three, everyone else's three. Each three is always in the same order, **r**ead, **w**rite,
e**x**ecute, and a dash means "not granted". So `r--` is "read only", and `rw-` is "read and
write, not execute".

## Octal: the numbers

The same permissions are often written as three digits, like `644`: **one digit per class, in
the same order (owner, group, others)**. Each digit is a sum:

| Letter | Value |
|---|---|
| r | 4 |
| w | 2 |
| x | 1 |
| - | 0 |

**To turn letters into a digit, add up the values of the letters that are there.** Here is
`rw-r--r--`, worked through:

| Class | Letters | Sum | Digit |
|---|---|---|---|
| owner | `rw-` | 4 + 2 + 0 | **6** |
| group | `r--` | 4 + 0 + 0 | **4** |
| others | `r--` | 4 + 0 + 0 | **4** |

So `rw-r--r--` is `644`.

**To turn a digit back into letters, split it into 4, 2 and 1, in that order**: take 4 if
it fits (`r`), then 2 if it fits in what's left (`w`), then 1 (`x`). **Each one that doesn't
fit is a dash.** Here is `751`:

| Class | Digit | Split | Letters | Means |
|---|---|---|---|---|
| owner | 7 | 4, 2, 1: all fit | `rwx` | read, write and run |
| group | 5 | 4 fits; 2 doesn't (1 left); 1 fits | `r-x` | read and run, not change |
| others | 1 | 4 doesn't; 2 doesn't; 1 fits | `--x` | run, nothing else |

So `751` is `rwxr-x--x`. Only eight digits are possible, so here is every one, to check your
working against:

| Digit | Letters | Digit | Letters |
|---|---|---|---|
| 0 | `---` | 4 | `r--` |
| 1 | `--x` | 5 | `r-x` |
| 2 | `-w-` | 6 | `rw-` |
| 3 | `-wx` | 7 | `rwx` |

**`stat -c '%a %A %n' FILE` prints a file's mode both ways**, so you can check your
arithmetic (it works on the station console too):

```text
$ stat -c '%a %A %n' notes.txt
644 -rw-r--r-- notes.txt
```

Some modes you'll see again and again:

| Mode | String | Typical use |
|---|---|---|
| `600` | `rw-------` | secrets: `.env`, SSH private keys |
| `644` | `rw-r--r--` | ordinary files everyone may read |
| `700` | `rwx------` | a private directory, or a script only you may read |
| `750` | `rwxr-x---` | a directory shared with one group |
| `755` | `rwxr-xr-x` | programs and public directories |

## Changing permissions: `chmod`

| Command | Does |
|---|---|
| `chmod 600 .env` | octal: sets all three classes at once |
| `chmod u+x deploy.sh` | symbolic: adds execute for the user (the owner) only, and leaves everything else alone |
| `chmod go-w shared.txt` | removes write from group and others |
| `chmod u=rw,go= .env` | sets exactly: the same as 600 |

The symbolic form uses `u` (user/owner), `g` (group), `o` (others), `a` (all), with `+`, `-`
or `=`.

### A number replaces everything; a letter changes one thing

This is the difference that catches people. **An octal mode sets all three classes, including
the ones you weren't thinking about. A symbolic one changes only what it names.**

Say `build.sh` is a script your team edits together, and you want to be able to run it:

```text
$ stat -c '%a %A %n' build.sh
664 -rw-rw-r-- build.sh

$ chmod 700 build.sh                 # "rwx for me"... and nothing for anyone else
$ stat -c '%a %A %n' build.sh
700 -rwx------ build.sh              # the group can't read or edit it any more

$ chmod 664 build.sh                 # put it back
$ chmod u+x build.sh                 # add x for the owner, touch nothing else
$ stat -c '%a %A %n' build.sh
764 -rwxrw-r-- build.sh              # the group and others kept what they had
```

`chmod 700` did make it runnable, and it also took read and write away from the group, which
nobody asked for. That's how a shared script ends up locked away from the team. **When the job
is "add this, change nothing else", use the symbolic form**, or work out the new number from
the old one. Either way, **look at the mode before you change it**: you can't know what to
keep until you've seen it.

## Directories are different

| Bit | On a file | On a directory |
|---|---|---|
| `r` | read the contents | list the names inside |
| `w` | change the contents | create, rename or delete entries inside |
| `x` | run it as a program | enter it and reach the files inside |

A directory with `r` but no `x` lets you see names but not open anything.

## Changing ownership: `chown`

```bash
sudo chown deploy:deploy /opt/orbit-ops      # owner and group
sudo chown -R deploy /opt/orbit-ops/backups  # recursively, owner only
```

Only root can give a file away, which is why `chown` almost always needs `sudo`.

> **On the real station:** setting up this app's server used `install -d -o deploy -g deploy
> -m 750 /opt/orbit-ops` (create a directory with owner, group and mode in one step), and wrote
> `.env` under `umask 077` so it was born `600`. The `umask` subtracts permissions from every new
> file. Files start from `666`, so a normal Ubuntu user (umask `002`) gets `664`, and root (umask
> `022`) gets `644`. Run `umask` to see yours.

## Try it

```bash
mkdir -p ~/scratch && cd ~/scratch
echo "top secret" > key.txt
ls -l key.txt            # -rw-rw-r-- (or -rw-r--r--): anyone on the machine can read it
chmod 600 key.txt
ls -l key.txt            # -rw-------
stat -c '%a %U:%G %n' key.txt    # the octal mode, owner and group
```
