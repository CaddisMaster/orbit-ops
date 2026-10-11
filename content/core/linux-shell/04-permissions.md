---
title: Permissions and ownership
minutes: 20
story: |
  **Mission log, day 4.** Someone left the station's master keys in a file every crew member
  can read. Okafor is not amused. "Fix it, then tell me how it happened, so it doesn't happen
  again."
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
    q: What's the octal (number) form of `rwxr-x---`?
    answer: ["750", "0750"]
    explain: >-
      rwx = 4+2+1 = 7, r-x = 4+1 = 5, --- = 0. That's exactly what the Orbit Ops deploy
      directory uses: the owner does everything, the group can enter and read, others nothing.
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
terminal:
  task: |
    `scrubber.conf` holds the life-support override code, and right now every crew member can
    read it. Make it **readable and writable by you only**. While you're there, Okafor wants to
    run `purge.sh` herself next shift: make it **executable by you**, without changing who else
    can read it.
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
    - 'chmod 600 scrubber.conf'
    - 'chmod u+x purge.sh'
    - 'ls -l'
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
    front: "Octal values of r, w, x"
    back: "r = 4, w = 2, x = 1. Add them per class: 7 = rwx, 6 = rw-, 5 = r-x, 4 = r--."
  - id: directory-execute
    front: What does `x` mean on a directory?
    back: Permission to enter/traverse it. Listing names needs `r`; creating or deleting entries needs `w`.
  - id: chown
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

Each class gets three bits: **r**ead, **w**rite, e**x**ecute. A dash means "not granted".

## Octal: the numbers

Each permission has a value, and you add them up per class:

| Bit | Value |
|---|---|
| r | 4 |
| w | 2 |
| x | 1 |

So `rw-` = 6, `r-x` = 5, `rwx` = 7, and a full mode is three digits: user, group, others.

| Mode | String | Typical use |
|---|---|---|
| `600` | `rw-------` | secrets: `.env`, SSH private keys |
| `644` | `rw-r--r--` | ordinary files everyone may read |
| `700` | `rwx------` | a private directory or script |
| `750` | `rwxr-x---` | a directory shared with one group |
| `755` | `rwxr-xr-x` | programs and public directories |

## Changing permissions: `chmod`

```bash
chmod 600 .env               # octal: set all three classes at once
chmod u+x deploy.sh          # symbolic: add execute for the user (owner)
chmod go-w shared.txt        # remove write from group and others
chmod u=rw,go= .env          # set exactly: same as 600
```

The symbolic form uses `u` (user/owner), `g` (group), `o` (others), `a` (all), with `+`, `-`
or `=`.

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
