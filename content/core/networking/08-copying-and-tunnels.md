---
# No console task: a lab (#121). rsync and ssh are the real ones on your own machine, which
# the station console doesn't simulate.
title: Copying files and tunnels
minutes: 20
story: |
  **Mission log, day 36.** The relay's logs from the outage night need to come home, and its
  admin page won't open from here. "It only listens on the relay itself," says Okafor. "So we
  go through the one door it has: SSH."
quiz:
  - type: choice
    q: "Where do the files end up?"
    code: |-
      $ ls site
      index.html  style.css
      $ rsync -av site /srv/www/
    options:
      - "In `/srv/www/site/`: without a trailing slash on the source, rsync copies the directory itself"
      - "In `/srv/www/`, directly: `index.html` and `style.css` next to whatever was there"
      - "Nowhere: `-a` needs a trailing slash"
      - "In `/srv/www/` with everything else there deleted"
    answer: 0
    explain: >-
      `site` (no slash) means the directory `site`, so rsync creates `/srv/www/site/`.
      `site/` means what's inside it, so the files would land in `/srv/www/` itself. That one
      character is the most common rsync mistake.
  - type: choice
    q: "You're about to sync a backup. What does this dry run tell you to do?"
    code: |-
      $ rsync -avn --delete backups/ /mnt/archive/
      sending incremental file list
      deleting 2025/october.tar.gz
      deleting 2025/september.tar.gz
      deleting 2025/
      ...
      sent 1,114 bytes  received 210 bytes  2,648.00 bytes/sec
      total size is 48,213,004  speedup is 36,415.16 (DRY RUN)
    options:
      - "Stop: `--delete` would remove everything in the archive that isn't in `backups/` now, last year's included. Drop `--delete`, or check `backups/` is the full set"
      - "Run it without `-n`: the dry run shows it works"
      - "Nothing will be deleted: it says DRY RUN"
      - "Add `-v` to see more"
    answer: 0
    explain: >-
      `--delete` makes the destination an exact copy of the source, so whatever isn't in the
      source is removed. Here that's last year's archives. The dry run deleted nothing, which is
      exactly why you run one: it shows what the real run would do.
  - type: choice
    q: "A server's admin page listens on `127.0.0.1:9000`. Your laptop can SSH to the server. How do you open the page in your laptop's browser?"
    options:
      - "`ssh -L 9000:localhost:9000 user@server`, then browse to `http://localhost:9000` on the laptop"
      - "Browse to `http://server:9000`"
      - "`ssh -L 9000:server:22 user@server`"
      - "Change the admin page to listen on `0.0.0.0` first"
    answer: 0
    explain: >-
      `-L LOCAL:HOST:PORT` listens on your laptop's `LOCAL` and carries each connection through
      SSH to `HOST:PORT` as the server sees it, and `localhost` there means the server itself.
      Opening the page to the world (`0.0.0.0`) would work too, and that's exactly what the
      tunnel saves you from doing.
  - type: multi
    q: "Which are true of `rsync -av SRC/ DEST/` run a second time, when nothing has changed?"
    options:
      - "It copies nothing: rsync only sends what differs"
      - "It keeps permissions and times, because `-a` is archive mode"
      - "It deletes files in DEST that aren't in SRC"
      - "It lists every file again, copied or not"
    answer: [0, 1]
    explain: >-
      rsync compares first and sends only differences, which is why it's the tool for a sync you
      run again and again. `-a` keeps permissions, times, owners and links. Nothing is deleted
      without `--delete`, and `-v` lists only what it transferred, so an unchanged run lists no
      files.
  - type: fill
    q: "Which rsync option makes it show what it would do, without doing it?"
    answer: ["-n", "--dry-run"]
    explain: >-
      `-n` (`--dry-run`). rsync prints `(DRY RUN)` on its last line so you know nothing changed.
      Run it before any rsync with `--delete`.
cards:
  - id: trailing-slash
    section: "rsync: copying what changed"
    front: "`rsync -av site DEST/` versus `rsync -av site/ DEST/`?"
    back: "`site` copies the directory itself (DEST/site/…). `site/` copies what's inside it straight into DEST."
  - id: dry-run
    section: "rsync: copying what changed"
    accept: ["rsync -avn --delete backups/ /mnt/archive/", "rsync -avn --delete backups/ /mnt/archive"]
    front: "See what syncing `backups/` to `/mnt/archive/` with `--delete` would do, without doing it"
    back: "`rsync -avn --delete backups/ /mnt/archive/` (`-n` is the dry run)"
  - id: ssh-l
    section: "Tunnels: `ssh -L`"
    accept: ["ssh -L 9000:localhost:9000 admin@server", "ssh -L 9000:127.0.0.1:9000 admin@server"]
    front: "Reach `server`'s `127.0.0.1:9000` at `localhost:9000` on your laptop, logging in as `admin`"
    back: "`ssh -L 9000:localhost:9000 admin@server`"
  - id: scp
    section: "`scp`: one copy"
    front: "Copy `report.txt` to the `logs` directory in your home on `archive`"
    back: "`scp report.txt archive:logs/` (a path after the colon is from your home there)"
lab:
  from: okafor
  task: |-
    Bring the relay's logs home, carefully, and get a tunnel ready for its admin page. It's all
    on your own machine: two directories stand in for the relay and home, and nothing connects
    anywhere.

    1. On Ubuntu, `sudo apt install rsync`. On a Mac, use `brew install rsync`: the rsync macOS
       ships prints differently. Run the setup below once. To start again, delete
       `~/meridian/sync` first.
    2. In `~/meridian/sync`, do a **dry run** of copying `relay/logs` into `home/`, **without a
       trailing slash on the source**. Paste its output in the first box.
    3. Now copy for real, but this time **with** the trailing slash on the source, so the log
       files land straight in `home/`. Paste its output in the second box.
    4. `home/` has a file the relay doesn't. Do a **dry run** of step 3's copy (with the slash) with
       **`--delete`**, and paste it in the third box. Don't run it for real.
    5. Add an entry to `~/.ssh/config` (add to it, don't replace it) called **`relay-admin`**, for the user **`okafor`** at
       **`relay.meridian.example`**, that forwards **port 8080 on your machine to port 8000 on
       the relay's localhost**. Check it without connecting, and paste ssh's `user`, `hostname`
       and `localforward` lines in the last box.
  setup: |-
    mkdir -p ~/meridian/sync/relay/logs ~/meridian/sync/home && cd ~/meridian/sync
    for n in 1006 1007 1008; do echo "relay log, shift $n" > relay/logs/relay-$n.log; done
    echo "Okafor's notes: keep these" > home/notes.txt
  boxes:
    - prompt: The dry run, without a trailing slash on `relay/logs`.
      checks:
        - {regex: '^logs/relay-1008\.log\s*$', says: "Without the slash, rsync would copy the logs directory itself: logs/relay-1008.log", hint: "Bare relay-1008.log? That's with the slash. This step is without it."}
        - {contains: "(DRY RUN)", says: "A dry run: nothing was copied", hint: "No (DRY RUN) at the end? Add -n. (On a Mac, use Homebrew's rsync.)"}
      example: |
        sending incremental file list
        logs/
        logs/relay-1006.log
        logs/relay-1007.log
        logs/relay-1008.log

        sent 144 bytes  received 29 bytes  346.00 bytes/sec
        total size is 66  speedup is 0.38 (DRY RUN)
    - prompt: The real copy, with a trailing slash on `relay/logs/`.
      checks:
        - {regex: '^relay-1006\.log\s*$', says: "The log files themselves, straight into home/", hint: "logs/relay-1006.log? Without the slash, rsync copies the directory. Put the slash on the source."}
        - {regex: '^relay-1008\.log\s*$', says: "All three of them"}
        - {not_contains: "logs/", says: "No logs/ directory made in home/"}
        - {not_contains: "(DRY RUN)", says: "A real run this time", hint: "Take the -n off for this one."}
      example: |
        sending incremental file list
        relay-1006.log
        relay-1007.log
        relay-1008.log

        sent 317 bytes  received 73 bytes  780.00 bytes/sec
        total size is 66  speedup is 0.17
    - prompt: The dry run with `--delete`.
      checks:
        - {regex: '^deleting notes\.txt\s*$', says: "--delete would remove the file that's only in home/", hint: "No deleting line? Use the trailing slash, as in step 3, and --delete."}
        - {contains: "(DRY RUN)", says: "Only a dry run: notes.txt is still there", hint: "Without -n it really deleted notes.txt. Run the setup again and use -n."}
      example: |
        sending incremental file list
        deleting notes.txt

        sent 118 bytes  received 32 bytes  300.00 bytes/sec
        total size is 66  speedup is 0.44 (DRY RUN)
    - prompt: ssh's `user`, `hostname` and `localforward` lines for `relay-admin`.
      checks:
        - {regex: '^user okafor\s*$', says: "The user okafor"}
        - {regex: '^hostname relay\.meridian\.example\s*$', says: "The relay's real name", hint: "hostname relay-admin? HostName says where the entry really goes."}
        - {regex: '^localforward 8080 \[(localhost|127\.0\.0\.1)\]:8000\s*$', says: "Port 8080 here carried to port 8000 on the relay's own localhost", hint: "LocalForward takes your port, then the far end's HOST:PORT, as the relay sees it: localhost there is the relay itself."}
      example: |
        user okafor
        hostname relay.meridian.example
        localforward 8080 [localhost]:8000
comms:
  open:
    - {from: meridian, text: "RELAY LOGS · 3 FILES · NOT YET COPIED · ADMIN PAGE 127.0.0.1:8000 · LOCAL ONLY"}
    - {from: okafor, text: "Copy the logs home, but dry-run everything first. I've watched rsync eat a directory because of one slash."}
    - {from: okafor, text: "And the admin page listens on the relay's localhost on purpose. Don't open it up: tunnel to it."}
  lab_done:
    - {from: meridian, text: "relay-1006.log · relay-1007.log · relay-1008.log · HOME · notes.txt: KEPT · TUNNEL localhost:8080 → relay:8000"}
    - {from: okafor, text: "Logs home, my notes still there, and a tunnel ready for the admin page. That's the order I like things done in."}
  complete:
    - {from: mission, text: "*Meridian*, Mission Control. We have your relay logs from the outage night. The analysis team will want them."}
    - {from: okafor, text: "One more thing stands between a connection and a service: the firewall. Ours, next."}
---

## `scp`: one copy

**`scp SOURCE DEST`** copies files over SSH, with a `host:` in front of whichever side is
remote. It uses everything SSH does: your keys, `~/.ssh/config`'s names, `known_hosts`.

```bash
scp report.txt archive:logs/            # up: to ~/logs/ on archive
scp archive:/var/log/app.log .          # down: into the current directory
scp -r site/ archive:/srv/www/          # -r for a directory
```

A path after the colon that doesn't start with `/` is from your home on that machine. scp is
fine for a one-off copy; for anything you'll do again, or anything big, use rsync.

## rsync: copying what changed

**`rsync` copies only what differs** between the source and the destination, so the second run
of the same copy sends almost nothing. It works between two directories on one machine, or to and
from a host over SSH, with the same `host:path` form as scp. On Ubuntu, `sudo apt install rsync`.
A Mac has one, but recent macOS ships a different rsync that prints differently: `brew install
rsync` gets the usual one.

| Option | Means |
|---|---|
| **`-a`** | **archive mode**: everything below a directory, keeping permissions, times and links |
| **`-v`** | **list each file it transfers** |
| **`-n`** | **dry run: show what it would do, change nothing**, and say `(DRY RUN)` at the end |
| **`--delete`** | **remove from the destination anything that isn't in the source** |

So `rsync -av SRC/ DEST/` is the everyday sync, and `rsync -avn …` is the same command looking
first.

**The trailing slash on the source changes what's copied**, and it's the classic rsync mistake:

| Command | Copies | You get |
|---|---|---|
| `rsync -av site DEST/` | **the directory `site` itself** | `DEST/site/index.html` |
| `rsync -av site/ DEST/` | **what's inside `site`** | `DEST/index.html` |

A slash on the destination makes no difference. Read it as "site, the directory" versus "site's
contents".

**`--delete` makes the destination an exact copy**, which is what you want for a mirror and a
disaster when the source is missing something: every file only the destination has is removed,
for good. **Always dry-run an rsync with `--delete` first**, read the `deleting` lines, and only
then run it without `-n`.

```text
$ rsync -avn --delete site/ /srv/www/
sending incremental file list
deleting old-banner.png
index.html

sent 89 bytes  received 44 bytes  266.00 bytes/sec
total size is 12  speedup is 0.09 (DRY RUN)
```

## Tunnels: `ssh -L`

A service that listens only on `127.0.0.1` (module 01) can't be reached from another machine,
and that's often deliberate: databases, admin pages, dashboards. But if you can SSH to that
machine, **SSH can carry a connection for you**:

```bash
ssh -L 9000:localhost:9000 admin@server
```

**`-L LOCAL:HOST:PORT` listens on your machine's port LOCAL, and sends each connection through
the SSH link to HOST:PORT, as the server sees it.** `localhost` there means the server itself. While
that ssh session is open, `http://localhost:9000` on your laptop *is* the server's admin page,
and nothing on the server had to be opened to the network.

The same thing in `~/.ssh/config`, so `ssh server-admin` sets it up every time:

```text
Host server-admin
    HostName server.example.org
    User admin
    LocalForward 9000 localhost:9000
```

**`LocalForward LOCAL HOST:PORT`** is `-L` with a space instead of the first colon. `ssh -G`
shows it as `localforward 9000 [localhost]:9000`, which is a quick way to check you wrote it the
right way round. Add `-N` to the command (`ssh -N server-admin`) when you only want the tunnel
and no shell.

**On the real station:** the app on the droplet listens on `127.0.0.1:5002` and its database
isn't published to the host at all (module 01), so from outside, Nginx on 443 is the only way
in to the app. A tunnel is how you'd reach the app around Nginx, for a look at what it says before Nginx
gets involved: `ssh -L 5002:127.0.0.1:5002` to the droplet, then `http://localhost:5002` on
your own machine. The deploy copies files the other way, with plain ssh: it streams
`docker-compose.yml` and its scripts over ssh's standard input (`ssh … "cat > …" <
docker-compose.yml`), so nothing on the droplet has to be a git checkout.

## Try it

On your own machine. A container needs the tools first: `sudo apt-get update && sudo apt-get
install -y rsync openssh-client`. Everything happens in `/tmp/try-sync`.

```bash
mkdir -p /tmp/try-sync/src/site /tmp/try-sync/a /tmp/try-sync/b && cd /tmp/try-sync
echo hello > src/site/index.html; echo old > b/stale.txt
rsync -av src/site a/          # site/ and site/index.html: the directory itself
rsync -av src/site/ b/         # index.html: just what's inside
ls a b                         # a: site   b: index.html stale.txt
rsync -av src/site/ b/         # nothing listed: nothing changed
rsync -avn --delete src/site/ b/   # deleting stale.txt ... (DRY RUN)
ls b                           # stale.txt is still there
ssh -G -L 9000:localhost:9000 example.org | grep localforward   # localforward 9000 [localhost]:9000
cd / && rm -r /tmp/try-sync
```
