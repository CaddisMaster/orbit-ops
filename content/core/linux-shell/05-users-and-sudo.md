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
    options: ["`sudo nano /etc/sudoers`", "`visudo`", "`sudo chmod 777 /etc/sudoers`", "Edit `/etc/passwd`"]
    answer: 1
    explain: >-
      `visudo` checks the syntax before saving. A typo in `/etc/sudoers` saved directly can lock
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
      /:/host …`. Treat `docker` group membership like `sudo`. The droplet's `deploy` user is in
      it on purpose and has nothing else.
terminal:
  task: |
    The airlock controller only takes orders from members of the `airlock` group. Add
    yourself to it, and **append**: if you replace your groups instead, you'll lose `sudo` with
    them. Your password for `sudo` is `meridian`.

    Then Okafor wants to know which login shell the `airlock` service account has. Write it,
    and nothing else, to `airlock-shell.txt` in your home directory. It's field 7 of the
    account's line in `/etc/passwd`.
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
    front: How do you see your user, UID and groups?
    back: "`id` (or `whoami` for just the name, `groups` for just the groups)."
  - id: usermod-append
    front: Add an existing user to a group without removing their other groups
    back: "`sudo usermod -aG docker sean`. The `-a` (append) matters; they must log in again for it to apply."
  - id: sudo-vs-su
    front: "`sudo` vs `su`"
    back: "`sudo cmd` runs one command as root using YOUR password and is logged. `su` switches to another user and needs THEIR password."
---

## Who am I?

```bash
whoami        # sean
id            # uid=1000(sean) gid=1000(sean) groups=1000(sean),27(sudo),998(docker)
```

Every process runs as a **user**, and every user belongs to one or more **groups**. File
permissions (last module) are checked against exactly these: owner, group, everyone else.

The kernel only cares about the **numbers** (UID and GID). Names are looked up in plain text
files:

```bash
grep sean /etc/passwd
# sean:x:1000:1000:Sean:/home/sean:/bin/bash
# name:pw:UID:GID:comment:home:shell        (the password hash lives in /etc/shadow)
```

## root

`root` is UID 0, and permission checks don't apply to it. That's why you don't work as root day
to day: one typo has no safety net.

## sudo: borrowing root for one command

```bash
sudo apt update              # run one command as root
sudo -u postgres psql        # run as a different user
sudo -i                      # a root shell (use sparingly; type `exit` to leave)
```

`sudo` asks for **your own** password, remembers it for a few minutes, and logs every command.
Who may use it is set in `/etc/sudoers`. On Ubuntu, membership of the `sudo` group is enough.

Always edit sudo rules with **`visudo`**, which refuses to save a file with a syntax error.

## Groups

```bash
groups                           # my groups
sudo usermod -aG docker sean     # add sean to docker (append!)
```

Without `-a`, `usermod -G` *replaces* your groups, and you can lose `sudo` this way. Group changes
apply at your **next login**.

## Service accounts

Not every user is a person. On the droplet that runs this app:

- `deploy` owns `/opt/orbit-ops` and is in the `docker` group, so GitHub Actions can deploy
  without ever holding a root key.
- `postgres` inside the database container owns the data files.
- `www-data` is the account Nginx's workers run as.

Each has just enough access for its one job. That's the **principle of least privilege**, and
you'll see it again in the database role the app connects as.

> ⚠️ **The `docker` group is root in disguise.** The Docker daemon runs as root, so anyone who can
> talk to it can mount the host's `/` into a container. Grant it as carefully as `sudo`.

## Try it

```bash
id
getent group sudo docker          # who's in these groups
sudo -l                           # what sudo lets you do
sudo whoami                       # root
```
