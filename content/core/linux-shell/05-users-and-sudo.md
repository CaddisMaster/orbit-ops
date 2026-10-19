---
title: Users, groups and sudo
minutes: 15
story: |
  **Mission log, day 5.** The airlock controller refuses your commands: *permission denied*.
  Okafor sighs. "You're logged in as a cadet. The airlock answers to root. And no, I'm not
  giving you the root password. Learn `sudo`."
quiz:
  - type: choice
    q: What is the user ID (UID) of `root`?
    options: ["0", "1", "1000", "65534"]
    answer: 0
    explain: >-
      Root is always UID 0, and it's the number the kernel checks, not the name. Regular human
      users on Ubuntu usually start at 1000, and 65534 is `nobody`.
  - type: choice
    q: What's the safe way to edit who may use `sudo`?
    options: ["`sudo nano /etc/sudoers`", "`sudo visudo`", "`sudo chmod 777 /etc/sudoers`", "Edit `/etc/passwd`"]
    answer: 1
    explain: >-
      `visudo` (run with `sudo`, since the file is root's) checks the syntax before saving. A typo in `/etc/sudoers` saved directly can lock
      every user out of `sudo` until someone gets in as root another way.
  - type: fill
    q: Type the command that runs `apt update` as root.
    answer: ["sudo apt update"]
    explain: >-
      Prefix the command with `sudo`. It asks for **your** password (not root's) and runs just
      that one command as root.
  - type: choice
    q: Why is membership of the `docker` group a security concern?
    options:
      - "It lets you see other users' files"
      - "Anyone in it can start a container that mounts the host's filesystem as root, so it's effectively root"
      - "It disables `sudo`"
      - "It isn't: Docker sandboxes everything"
    answer: 1
    explain: >-
      The Docker daemon runs as root and does what group members ask, including `docker run -v
      /:/host …`. Treat `docker` group membership like `sudo`.
terminal:
  task: |
    1. The airlock controller only takes orders from members of the `airlock` **group**. Add
       yourself to it, and **append**: if you replace your groups instead, you'll lose `sudo`
       with them. Your password for `sudo` is `meridian`.
    2. Okafor wants to know which login shell the `airlock` service **account** has. That's not
       the group you just joined but the account of the same name, with its own line in
       `/etc/passwd`. Write its login shell, and nothing else, to `airlock-shell.txt` in your
       home directory. *Who am I?* shows which field that is and how to pull it out, and
       `cat airlock-shell.txt` shows what you wrote.

    The console checks after every command, so you're done the moment both parts are true.
  cwd: /home/cadet
  groups: [sudo]
  password: meridian
  accounts:
    - {name: airlock, uid: 990, comment: Airlock controller, home: /var/lib/airlock}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /var/lib/airlock, type: dir, owner: airlock, group: airlock, mode: "750"}
    - {path: /var/lib/airlock/doors.conf, owner: airlock, group: airlock, mode: "640", contents: "outer = sealed\ninner = sealed\n"}
  checks:
    - {contains: /etc/group, text: "airlock:x:990:cadet"}
    - {contains: /etc/group, text: "sudo:x:27:cadet"}
    - {contains: /home/cadet/airlock-shell.txt, text: /usr/sbin/nologin}
  success: |-
    "Welcome to the airlock group," Okafor says. "It takes effect at your next login, so I'll sign you in fresh at the start of your next shift."
  solution:
    - id
    - getent group airlock sudo
    - sudo usermod -aG airlock cadet
    - meridian
    - getent group airlock sudo
    - id cadet
    - 'grep airlock /etc/passwd | cut -d: -f7 > airlock-shell.txt'
comms:
  open:
    - {from: meridian, text: "AIRLOCK 2 · COMMAND REFUSED · USER cadet NOT AUTHORISED"}
    - {from: okafor, text: "The *Kestrel*'s cargo has to come in through airlock 2, and the controller only takes orders from its own group."}
    - {from: okafor, text: "You're a cadet. The airlock answers to root. And no, I'm not giving you the root password: learn `sudo`."}
  console_done:
    - {from: meridian, text: "GROUP airlock · MEMBER ADDED · cadet · EFFECTIVE AT NEXT LOGIN"}
    - {from: okafor, text: "Appended, not replaced: you've still got sudo. Good. Plenty of people lock themselves out doing that."}
  complete:
    - {from: okafor, text: "Cargo's coming through. Least privilege: you get the airlock, not the whole station."}
    - {from: mission, text: "*Kestrel* reports cargo transfer complete. Thank you, *Meridian*."}
cards:
  - id: id
    section: "Who am I?"
    accept: ["id"]
    front: How do you see your user, UID and groups?
    back: "`id` (or `whoami` for just the name, `groups` for just the groups)."
  - id: usermod-append
    section: "Groups"
    front: Add an existing user to a group without removing their other groups
    back: "`sudo usermod -aG GROUP USER`, e.g. `sudo usermod -aG docker sean`. The `-a` (append) matters; they must log in again for it to apply."
  - id: sudo-vs-su
    section: "sudo: borrowing root for one command"
    front: "`sudo` vs `su`"
    back: "`sudo cmd` runs one command as root using YOUR password and is logged. `su` switches to another user and needs THEIR password."
---

## Who am I?

A **user** is an account on the machine, and a **group** is a named set of users. Every
**process** (a running program; module 06 is about them) runs as a user, and every user belongs
to one or more groups. File permissions (last module) are checked against exactly these: owner,
group, everyone else. The examples here are from a machine where the user is `sean`.

| Command | Shows | For example |
|---|---|---|
| `whoami` | your user name | `sean` |
| `id` | your user and group numbers, and every group you're in | `uid=1000(sean) gid=1000(sean) groups=1000(sean),27(sudo),998(docker)` |
| `id NAME` | the same for another user, as the files say now (*Groups* explains why that can differ) | `id deploy` |
| `groups` | just the group names | `sean sudo docker` |
| `getent group NAME` | **get**s a group's **ent**ry, its line: its name, number and members (give several names for several lines) | `sudo:x:27:sean` |

In `id`'s answer, each number is followed by its name in brackets: `uid=` is your user,
`gid=` your main group (below), and `groups=` every group you're in.

Each user has a number, its **UID** (user ID), and each group a **GID** (group ID). The
**kernel**, the core of Linux that runs every program and checks every permission, only cares
about the numbers. Names are looked up in two plain text files: `/etc/passwd` lists every
account, and `/etc/group` every group.

`grep TEXT FILE` prints only the lines of FILE that contain TEXT, which is how you pick one
account's line out of the whole file:

```bash
grep sean /etc/passwd
# sean:x:1000:1000:Sean:/home/sean:/bin/bash
```

Each line is one account, seven fields separated by `:`:

| Field | In `sean`'s line | Means |
|---|---|---|
| 1 | `sean` | the account's name |
| 2 | `x` | the password is elsewhere, scrambled, in `/etc/shadow`, which only root can read |
| 3 | `1000` | the UID |
| 4 | `1000` | the GID of the account's main group |
| 5 | `Sean` | a comment, usually a full name |
| 6 | `/home/sean` | the home directory |
| 7 | `/bin/bash` | the **login shell**: the program that runs when this account logs in |

Every account has one **main group**, field 4, usually the group of the same name. Any other
group it's in is an **extra group**: that group's line in `/etc/group` lists it as a member.

To pull out one field, cut the line at each `:` and keep the one you want. **`cut -d: -fN`**
does that: **`-d:`** says the fields are separated by `:` (the **d**elimiter), and **`-fN`**
keeps **f**ield N. Field 7 is the login shell, so `-f7` gives the shell; `-f6` gives the home
directory:

```bash
grep sean /etc/passwd | cut -d: -f6             # /home/sean
grep sean /etc/passwd | cut -d: -f6 > home.txt  # the same, written to a file
```

The `|` hands one command's output to the next, and `>` writes output to a file. Both get a
module of their own soon (pipes and redirection), and `cut` gets one after that (text tools).
For now, this one line is enough. **`>` prints nothing when it works**: `cat home.txt` shows
what went in.

`/etc/group` has one line per group, four fields separated by `:`:

| Field | In `sudo:x:27:sean` | Means |
|---|---|---|
| 1 | `sudo` | the group's name |
| 2 | `x` | a placeholder, as in `/etc/passwd`: group passwords are almost never used |
| 3 | `27` | the GID |
| 4 | `sean` | its members, separated by commas (`sean,deploy`) |

A main group doesn't list its own user, so `getent group sean` shows nothing after the last
colon.

## root

`root` is UID 0, and permission checks don't apply to it. That's why you don't work as root day
to day: one typo has no safety net.

## sudo: borrowing root for one command

Put **`sudo`** in front of a command to run that one command as root.

| Command | Does |
|---|---|
| `sudo apt update` | runs `apt update` (refresh the list of software you can install; module 10) as root |
| `sudo -u NAME COMMAND` | runs it as the user NAME instead: `sudo -u www-data whoami` prints `www-data` (the web server's account, *Service accounts* below) |
| `sudo -i` | a root shell: the prompt ends in `#` (module 01), and every command runs as root until you type `exit`. Use it sparingly |
| `sudo -l` | what sudo lets you do. `(ALL : ALL) ALL` means any command, as any user |

The station console has no `apt`, no `visudo` and no `www-data` account, so try those on a
Linux machine.

`sudo` asks for **your own** password, remembers it for a few minutes, and logs every command.
It asks like this:

```text
[sudo] password for sean:
```

On Ubuntu nothing appears as you type, not even dots, so it looks as if the keyboard has
stopped. Type the password and press Enter anyway. The station console shows dots instead.
Who may use it is set in `/etc/sudoers`. On Ubuntu, membership of the `sudo` group is enough.

Always edit sudo rules with **`sudo visudo`**, which refuses to save a file with a syntax error.

You'll also meet **`su`** (switch user), the older way. `su - NAME` starts a shell as NAME (the `-` makes it as if NAME had just logged in, in
NAME's home directory) and
asks for **NAME's** password, and plain `su` means root, so it wants root's password. Ubuntu
sets no root password, so there `su` just says `Authentication failure`, and `sudo -i` is the
way to a root shell. `sudo` is preferred because nobody has to share root's password, and every
command is logged against the person who ran it. The station console doesn't have `su`.

## Groups

**`sudo usermod -aG GROUP USER`** adds USER to GROUP: the group comes first, then the user.
**`-G`** sets the user's extra groups to exactly GROUP: the main group stays, but any extra
group you didn't list, `sudo` included, is gone. **`-a`** makes it **a**dd to them instead.
It needs `sudo` because it changes `/etc/group`, which root owns, and **`usermod` prints nothing
when it works**.

```bash
groups                           # the groups this login started with
groups sean                      # sean's groups as /etc/group says now
sudo usermod -aG docker sean     # add sean to docker (append!)
```

Without `-a`, `usermod -G` *replaces* your groups, and you can lose `sudo` this way.

Group changes apply at your **next login**. Until then, plain `groups` and `id` show the groups
you logged in with, so right after `usermod` the new group looks missing, as if it had failed.
It hasn't. `groups NAME` and `id NAME` read `/etc/group` as it is now, so check with those:

```bash
groups               # sean sudo                (this login, unchanged)
groups sean          # sean : sean sudo docker  (the files, changed)
```

`groups NAME` starts its answer with the name and a colon, then the groups.

## Service accounts

Not every user is a person. On the droplet that runs this app:

- `deploy` owns `/opt/orbit-ops`. GitHub, where the code lives, logs in as `deploy` to put
  each new version on the server, so it never needs root.
- `postgres`, inside the database's container (a sealed-off box, explained below), is the
  database's own account, and owns its data files.
- `www-data` is the account the web server, Nginx, runs as.

Each has just enough access for its one job. That's the **principle of least privilege**, and
you'll see it again in the database account the app connects as.

Nobody should ever log in as a service account, so its login shell is usually
**`/usr/sbin/nologin`**: a program that prints `This account is currently not available.` and
exits. The account can still own files and run its service; it just can't give anyone a shell.

```bash
grep www-data /etc/passwd
# www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
```

An account usually has **a group of the same name**, made along with it. They're two separate
things that happen to share a name: the user `www-data` (in `/etc/passwd`) and the group
`www-data` (in `/etc/group`). `id www-data` shows both: `uid=33(www-data) gid=33(www-data)`.
Adding someone to a group never touches the account of the same name.

**Docker** (a later unit) runs programs in sealed-off boxes called **containers**. Its
**daemon**, the service in the background that does the work, runs as root, and members of the
`docker` group may give it orders.

> ⚠️ **The `docker` group is root in disguise.** Because the daemon runs as root, anyone in the
> group can ask it for a container that has the machine's whole `/` mounted inside it, and do
> anything there as root. Grant it as carefully as `sudo`.

## Try it

Run these one at a time, on a Linux machine or in the station console (there, your `sudo`
password is `meridian`):

```bash
id
id root
getent group sudo
sudo -l
sudo whoami
whoami
```

- `id` shows your UID, your main group and every group you're in. `id root` shows `uid=0(root)`:
  root is UID 0.
- `getent group sudo` prints the `sudo` group's line: its members are the last field.
- `sudo -l` asks for your password, then shows what you may run: `(ALL : ALL) ALL` is
  everything.
- `sudo whoami` prints `root`, and plain `whoami` your own name: `sudo` lasted one command.

On a Linux machine only (not the station console):

```bash
sudo -u www-data whoami
su
sudo visudo -c
```

- `sudo -u www-data whoami` prints `www-data`, the web server's account.
- `su` asks for root's password. Type anything and press Enter: on Ubuntu it answers
  `Authentication failure`, because there isn't one. Use `sudo -i` instead.
- `sudo visudo -c` checks the sudo rules for mistakes and changes nothing.
