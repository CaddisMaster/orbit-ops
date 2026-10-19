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
    options: ["`chmod 600 .env`", "`chmod 644 .env`", "`chmod u=rw,go= .env`", "`chmod 700 .env`"]
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
    You're `cadet`, and you own the files here. First, look at the files' modes (`ls -l`, or
    `stat -c '%a %A %n' *` to see them as numbers too).

    - `scrubber.conf` holds the life-support override code, and right now every crew member
      can read it. Make it **readable and writable by you only**, and runnable by nobody.
    - `purge.sh` is the filter purge you'll run next shift. Make it **executable by you**, and
      change **nothing else**: whoever can read it now should still be able to.

    Check the modes again when you're done. Leave `README` as it is. The console checks after
    every command, so you're done the moment both modes are right.
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
    back: "`chown OWNER:GROUP FILE`, for example `sudo chown deploy:deploy /opt/orbit-ops`. Only root can give a file away, hence `sudo`."
---

## Owner, group and others

Every file has an **owner**: the user who created it, unless someone changed it since. It also
has a **group**, a named set of users (module 05 shows how to join one). Everyone who is
neither the owner nor in the group is **others**.

A file's **mode** is what each of those three may do with it: **read** it (see what's in it),
**write** it (change it) and **execute** it (run it as a program). That's three permissions for
each of the three, nine in all, and each one is called a **bit**: one permission, either
granted or not. A **script** is a text file of commands, usually named with `.sh` at the end:
with execute set, you can run it like a program. Unit 1.2 is where you write them. On the station console you are `cadet`, and you
own the files in the task, so "you" means the owner.

## Reading the permission string

The first column of `ls -l` is ten characters:

```text
-rw-r-----  1 cadet  ops    4096 Oct  8 18:34 report.csv
│└┬┘└┬┘└┬┘
│ │  │  └ others: ---  (everyone else)
│ │  └ group:  r--  (members of the file's group)
│ └ user:   rw-  (the owner, u)
└ type: - file, d directory, l symlink
```

**Skip the first character, then read the rest in threes**: the owner's three, the group's
three, everyone else's three. Each three is always in the same order, **r**ead, **w**rite,
e**x**ecute, and a dash means "not granted". So `r--` is "read only", and `rw-` is "read and
write, not execute". The `l` type is a link, a shortcut to another file; it comes in Unit 1.2,
so you can ignore it for now.

## Octal: the numbers

The same permissions are often written as three digits, like `644`. That's **octal**, counting
in eights: each digit is 0 to 7. There is **one digit per class, in the same order (owner,
group, others)**, and each digit is a sum:

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
arithmetic (it works on the station console too). Give it several names, or a glob like `*`,
and it prints a line for each:

```text
$ stat -c '%a %A %n' notes.txt
644 -rw-r--r-- notes.txt
```

`-c` says "print in this format", and each `%` code is one fact about the file. The quotes keep
the codes and spaces together as one argument:

| Code | Prints |
|---|---|
| `%a` | the mode as a number (`644`) |
| `%A` | the mode as letters (`-rw-r--r--`) |
| `%n` | the file's name |
| `%U` | its owner |
| `%G` | its group |

Some modes you'll see again and again:

| Mode | String | Typical use |
|---|---|---|
| `600` | `rw-------` | secrets, like `.env` |
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

The symbolic form uses `u` (user/owner), `g` (group), `o` (others), `a` (all), with `+` (add),
`-` (take away) or `=` (set exactly). **A comma joins two changes**, and **`=` with nothing after
it takes everything away**, so in `u=rw,go=` the owner gets read and write, and the group and
others get nothing.

**`chmod` prints nothing when it works**, like the commands in module 03. Check with `ls -l` or
`stat`.

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
the old one. **To change one class with a number, change only that class's digit**: adding the
owner's `x` (1) to `664` changes only the first digit, 6 + 1 = 7, so it's `764`. Either way, **look at the mode before you change it**: you can't know what to
keep until you've seen it.

## Directories are different

| Bit | On a file | On a directory |
|---|---|---|
| `r` | read the contents | list the names inside |
| `w` | change the contents | create, rename or delete entries inside |
| `x` | run it as a program | enter it and reach the files inside |

A directory with `r` but no `x` lets you see names but not open anything. Take `x` away from a
directory and even its owner gets `Permission denied` on `cd`. The Try it below does exactly that.

## Changing ownership: `chown`

**`chown OWNER:GROUP FILE` sets a file's owner and group**: the owner, a colon, then the group.
`chown OWNER FILE` sets only the owner. `-R` (a capital R here, unlike `cp -r`) does a whole
directory and everything in it. Like `chmod`, it prints nothing when it works.

Only root can give a file away, so `chown` almost always needs **`sudo`**: put it in front of a
command to run that one command as root, the administrator from module 01. It asks for your
own password. Module 05 covers it properly. The station console can't `sudo` in this task.

```bash
sudo chown deploy:deploy /opt/orbit-ops      # owner deploy, group deploy
sudo chown -R deploy /opt/orbit-ops/backups  # a whole directory, owner only
```

> **On the real station:** setting up this app's server used `install -d -o deploy -g deploy
> -m 750 /opt/orbit-ops` (create a directory with owner, group and mode in one step), and wrote
> `.env` under `umask 077` so it was born `600`. The `umask` takes permissions away from every new
> file. Files start from `666`, so a normal Ubuntu user (umask `002`) gets `664`, and root (umask
> `022`) gets `644`: each digit of the umask is taken away from the same digit of `666`. Run
> `umask` on a Linux machine to see yours (the station console doesn't have it).

## Try it

Run these one at a time, on a Linux machine or in the station console:

```bash
mkdir -p ~/scratch
cd ~/scratch
touch key.txt
ls -l key.txt
chmod 600 key.txt
ls -l key.txt
stat -c '%a %U:%G %n' key.txt
chown root key.txt
mkdir locked
chmod u-x locked
cd locked
chmod u+x locked
cd locked
cd ..
```

- The first `ls -l` shows `-rw-rw-r--` or `-rw-r--r--`: anyone on the machine can read the
  file. (Which one depends on your `umask`; see *On the real station*.) After `chmod 600`, it's
  `-rw-------`.
- `stat -c '%a %U:%G %n'` prints the mode as a number, then the owner and group with a colon
  between them (the colon is just text in the format), then the name.
- `chown root key.txt` answers `Operation not permitted`: only root can give a file away, and
  you aren't root.
- With `x` taken off `locked`, `cd locked` answers `Permission denied`, though you own it. Put
  `x` back and it works.

On a Linux machine where you can use `sudo` (not the station console), give the file away and
take it back. `YOU` is your own username: the part of your prompt before the `@`. On Ubuntu each user also
has a group with the same name (module 05), so `YOU:YOU` puts both back.

```bash
sudo chown root:root key.txt
ls -l key.txt
cat key.txt
sudo chown YOU:YOU key.txt
```

Now root owns it with mode `600`, so you're "others" and get nothing: `cat` answers
`Permission denied`. The last line gives it back.
