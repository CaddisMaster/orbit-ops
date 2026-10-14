---
title: Finding things and disk space
minutes: 20
story: |
  **Mission log, day 12.** The scrubber controller's disk is full, and a full disk stops the
  logging first. "Find what's eating it," says Okafor. "Then put the old logs somewhere safe.
  Don't just delete history."
quiz:
  - type: choice
    q: "The disk is full. You delete a 9 GB log that an app is still writing to, and `df` hasn't moved. Why?"
    code: |-
      $ df -h /
      Filesystem      Size  Used Avail Use% Mounted on
      /dev/vda1        25G   25G     0 100% /
      $ sudo rm /var/log/app/debug.log
      $ df -h /
      Filesystem      Size  Used Avail Use% Mounted on
      /dev/vda1        25G   25G     0 100% /
    options:
      - "The app still has the file open, so its space isn't freed until the app closes it"
      - "`rm` moves files to a hidden trash directory first"
      - "`df` only updates once an hour"
      - "`sudo rm` doesn't really delete root's files"
    answer: 0
    explain: >-
      A deleted file's space is freed when the last program holding it open lets go. The app is
      still writing to it, so the space stays used, and now you can't even see the file.
      Restarting the app frees it. Better: empty the file instead of deleting it, with
      `> debug.log`, and the app carries on writing into the same, now empty, file.
  - type: choice
    q: "Which files does `find /var/log -name '*.log' -mtime +30` print?"
    options:
      - "`.log` files under `/var/log` last changed more than 30 days ago"
      - "`.log` files under `/var/log` changed in the last 30 days"
      - "The 30 biggest `.log` files"
      - "`.log` files created exactly 30 days ago"
    answer: 0
    explain: >-
      `-mtime` counts whole days since the file was last changed: `+30` means more than 30,
      `-30` less than 30, and plain `30` exactly 30. The quotes around `'*.log'` matter, so that
      `find` gets the pattern and not the shell.
  - type: choice
    q: "`df -h` says the disk is 97% used. What's the quickest way to see which directory under `/var` is using it?"
    options: ["`du -sh /var/*`", "`df -h /var`", "`ls -lh /var`", "`free -h`"]
    answer: 0
    explain: >-
      `du` adds up the files under each path you give it, and `-s` gives one total per path. `df`
      only reports the whole filesystem. `ls -lh` shows a directory as its own small entry, not
      what's inside it. `free` is memory, not disk.
  - type: fill
    q: "Type the command that lists what's inside `o2-logs.tar.gz` without unpacking it."
    answer: ["tar -tzf o2-logs.tar.gz", "tar tzf o2-logs.tar.gz", "tar -tf o2-logs.tar.gz", "tar tf o2-logs.tar.gz", "tar -tvzf o2-logs.tar.gz", "tar -tzvf o2-logs.tar.gz"]
    explain: >-
      `-t` lists the contents, `-z` reads gzip and `-f` names the archive. List an archive before
      you delete the originals: it's your proof that they're in there.
  - type: choice
    q: "You're repointing a link to today's log. What now?"
    code: |-
      $ ln -s /var/log/o2/2026-10-08.log current.log
      ln: failed to create symbolic link 'current.log': File exists
    options:
      - "`ln -sf /var/log/o2/2026-10-08.log current.log`: `-f` replaces the old link"
      - "`rm 2026-10-08.log`, then try again"
      - "`cp /var/log/o2/2026-10-08.log current.log`"
      - "`mv current.log 2026-10-08.log`"
    answer: 0
    explain: >-
      `ln -s` won't overwrite a name that exists. `-f` removes the old link first. A copy
      wouldn't follow tomorrow's change, and the other two damage the real log.
terminal:
  task: |
    The scrubber controller's disk is **97% full** and the scrubbers have stopped logging.
    Get it **under 70%** without losing any history:

    1. **Find what's filling `/var`** (`du`, then `find`). One file in `/var/log/o2` is a
       runaway debug log the daemon still holds open. **Empty it, don't delete it.**
    2. **Archive** every log in `/var/log/o2` older than **30 days** into
       `/srv/archive/o2-logs.tar.gz`, compressed. List the archive to check, then **delete
       those originals**.
    3. `/var/log/o2/current.log` still points at last week's log. **Repoint it** at
       `/var/log/o2/2026-10-08.log` (use exactly that path as the target).

    Check with `df -h` as you go.
  cwd: /home/cadet
  disk: {size: 2G, base: 676M}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /srv/archive, type: dir, owner: root, group: crew, mode: "775"}
    - {path: /var/log/o2, type: dir, owner: root, group: crew, mode: "775"}
    - {path: /var/log/syslog, owner: root, group: root, size: 4M, contents: "Oct  8 08:59:58 meridian scrubberd: write failed: No space left on device\n"}
    - {path: /var/cache/apt/pkgcache.bin, owner: root, group: root, size: 48M, mtime: "2026-09-30 06:12", contents: "(binary)\n"}
    - path: /var/log/o2/debug.log
      owner: root
      group: crew
      mode: "664"
      size: 512M
      contents: |
        08:59:57.120 DEBUG bed 1 valve 0.4412 → 0.4413
        08:59:57.121 DEBUG bed 2 valve 0.3810 → 0.3810
        08:59:57.122 DEBUG sensor ring-a CO2 612.004 ppm
    - {path: /var/log/o2/2026-07-23.log, owner: root, group: crew, mode: "664", size: 91M, mtime: "2026-07-23 23:59", contents: "2026-07-23 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-07-30.log, owner: root, group: crew, mode: "664", size: 91M, mtime: "2026-07-30 23:59", contents: "2026-07-30 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-08-06.log, owner: root, group: crew, mode: "664", size: 91M, mtime: "2026-08-06 23:59", contents: "2026-08-06 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-08-13.log, owner: root, group: crew, mode: "664", size: 91M, mtime: "2026-08-13 23:59", contents: "2026-08-13 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-08-20.log, owner: root, group: crew, mode: "664", size: 91M, mtime: "2026-08-20 23:59", contents: "2026-08-20 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-08-27.log, owner: root, group: crew, mode: "664", size: 91M, mtime: "2026-08-27 23:59", contents: "2026-08-27 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-09-03.log, owner: root, group: crew, mode: "664", size: 91M, mtime: "2026-09-03 23:59", contents: "2026-09-03 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-09-10.log, owner: root, group: crew, mode: "664", size: 24M, mtime: "2026-09-10 23:59", contents: "2026-09-10 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-09-17.log, owner: root, group: crew, mode: "664", size: 24M, mtime: "2026-09-17 23:59", contents: "2026-09-17 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-09-24.log, owner: root, group: crew, mode: "664", size: 24M, mtime: "2026-09-24 23:59", contents: "2026-09-24 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-10-01.log, owner: root, group: crew, mode: "664", size: 24M, mtime: "2026-10-01 23:59", contents: "2026-10-01 23:59 scrubbers nominal\n"}
    - {path: /var/log/o2/2026-10-08.log, owner: root, group: crew, mode: "664", size: 8M, mtime: "2026-10-08 08:59", contents: "2026-10-08 08:59 write failed: No space left on device\n"}
    - {path: /var/log/o2/current.log, type: link, target: /var/log/o2/2026-10-01.log, owner: root, group: crew}
  checks:
    - {exists: /var/log/o2/debug.log, type: file}
    - {files_under: /var/log/o2, max_size: 50M, max_age: 30}
    - {exists: /var/log/o2/2026-09-10.log, type: file}
    - {exists: /var/log/o2/2026-10-08.log, type: file}
    - {exists: /srv/archive/o2-logs.tar.gz, type: file}
    - {contains: /srv/archive/o2-logs.tar.gz, text: 2026-07-23.log}
    - {contains: /srv/archive/o2-logs.tar.gz, text: 2026-09-03.log}
    - {files_under: /srv/archive, max_size: 200M}
    - {symlink: /var/log/o2/current.log, target: /var/log/o2/2026-10-08.log}
  success: |-
    The scrubbers start logging again. "Under 70, and nothing lost," Okafor says. "That's the difference between cleaning up and throwing away."
  solution:
    - df -h
    - du -sh /var/*
    - du -h -d 1 /var/log
    - find /var/log/o2 -size +100M
    - '> /var/log/o2/debug.log'
    - cd /var/log/o2
    - find . -name '*.log' -mtime +30
    - tar -czf /srv/archive/o2-logs.tar.gz 2026-07-*.log 2026-08-*.log 2026-09-03.log
    - tar -tzf /srv/archive/o2-logs.tar.gz
    - find . -name '*.log' -mtime +30 -delete
    - ln -sf /var/log/o2/2026-10-08.log current.log
    - readlink current.log
    - df -h
comms:
  open:
    - {from: meridian, text: "SCRUBBER CONTROLLER · DISK 97% · LOGGING SUSPENDED"}
    - {from: okafor, text: "A full disk doesn't crash anything at first. It just quietly stops writing things down."}
    - {from: okafor, text: "Find what's eating the space. Old logs go in the archive, not the bin. We may need them for the outage inquiry."}
  console_done:
    - {from: meridian, text: "SCRUBBER CONTROLLER · LOGGING RESUMED · `current.log` → `2026-10-08.log`"}
    - {from: okafor, text: "A debug log someone left running. Half a gigabyte of valve positions. Nobody needs to know that."}
  complete:
    - {from: okafor, text: "Every shift I type the same checks: the disk, the scrubbers, the logs. Tomorrow you write them down once, as a script."}
cards:
  - id: find-old-files
    section: "find: search by name, type, size and age"
    front: Find files changed more than 30 days ago
    back: "`find DIR -mtime +30` (`-name '*.log'` to narrow it; `-delete` once you've checked the list)."
  - id: df-vs-du
    section: "How full is it, and with what?"
    front: "`df` vs `du`"
    back: "`df -h` shows each filesystem's size, used and free. `du -sh PATH` adds up the files under PATH."
  - id: tar-create-list
    section: "tar and gzip: archives"
    front: Make a compressed archive, and look inside one
    back: "`tar -czf out.tar.gz FILES…` creates it. `tar -tzf out.tar.gz` lists it. (`-x` extracts.)"
  - id: empty-not-delete
    section: "Emptying a file that's still in use"
    front: Free a big log a program is still writing to
    back: "Empty it: `> app.log`. Deleting it frees nothing until the program closes it."
---

## How full is it, and with what?

Two commands, two different questions:

| Command | Answers |
|---|---|
| `df -h` | how big each filesystem is, and how much is used and free |
| `du -sh PATH…` | how much the files under each PATH add up to |
| `free -h` | memory, not disk (it's a different kind of full) |

Start with `df -h` to see *that* the disk is full. Then go down the tree with `du` to find
*where*:

```bash
du -sh /var/*            # one total per directory in /var
du -h -d 1 /var/log      # one level down inside /var/log
```

`-s` means one **s**ummary per path, `-h` is **h**uman sizes (`64M`), and `-d 1` stops at one
level deep. Follow the biggest number down until you reach the files.

## find: search by name, type, size and age

`find` walks a directory tree and prints every path that matches all your tests:

```bash
find /var/log -name '*.log'               # by name: quote the pattern
find /var/log -type f                     # files only (d: directories, l: links)
find /var/log -size +100M                 # bigger than 100 MB
find /var/log -name '*.log' -mtime +30    # changed more than 30 days ago
```

| Test | Means |
|---|---|
| `-mtime +30` | changed **more** than 30 days ago |
| `-mtime -7` | changed in the last 7 days |
| `-size +100M` | bigger than 100 MB (`-size -1M`: smaller than 1 MB) |

Once the list is right, `find` can act on it:

```bash
find /var/log -name '*.log' -mtime +30 -delete            # delete what it printed
find /var/log -name '*.log' -mtime +30 -exec ls -lh {} \; # run a command on each ({} is the file)
```

Run it without `-delete` first, every time. It's the same habit as `echo` before `rm`: see the
list, then act on it.

## Emptying a file that's still in use

When a program has a log open and you delete the file, the space isn't freed until the program
lets go of it, so `df` doesn't move. **Empty the file instead:**

```bash
> /var/log/o2/debug.log      # truncate to 0 bytes; the program keeps writing into it
```

A `>` with no command in front is the redirect from day 7 with nothing to write, so it leaves
the file empty.

## tar and gzip: archives

`tar` bundles files into one archive, and `-z` compresses it with gzip. Logs shrink a lot.

| Command | Does |
|---|---|
| `tar -czf logs.tar.gz FILES…` | **c**reate, g**z**ipped, into the **f**ile `logs.tar.gz` |
| `tar -tzf logs.tar.gz` | lis**t** what's inside |
| `tar -xzf logs.tar.gz` | e**x**tract into the current directory (`-C DIR` to go elsewhere) |
| `gzip big.log` / `gunzip big.log.gz` | compress or uncompress one file in place |

The files you name can be a glob: `tar -czf old.tar.gz 2026-08-*.log`. List the archive before
you delete the originals. That listing is your proof the history is safe.

On a disk that's really full, the archive needs room too, so free what you can first.

## Symbolic links

A **symlink** is a small file that points at another path, like a shortcut:

| Command | Does |
|---|---|
| `ln -s TARGET NAME` | makes a link called NAME that points at TARGET |
| `ln -sf TARGET NAME` | the same, replacing a link that's already called NAME |
| `readlink NAME` | prints where a link points |
| `ls -l NAME` | shows it as `NAME -> TARGET` |

```bash
ln -s /var/log/o2/2026-10-08.log current.log    # current.log → today's log
ln -sf /var/log/o2/2026-10-09.log current.log   # -f: replace the link that's there
readlink current.log                             # where does it point?
ls -l current.log                                # current.log -> /var/log/o2/2026-10-08.log
```

The order is **target first, then the link's name**, the same as `cp` and `mv`. Deleting the
link (`rm current.log`) leaves the target alone.

**On the real station:** every deploy of Orbit Ops writes a gzipped database backup to
`/opt/orbit-ops/backups`, checks it with `gzip -t`, and keeps only the newest 14. That's this
whole module in three lines of the release workflow. Without that last step, a year of deploys
would fill the droplet's disk.

## Try it

```bash
df -h /
du -sh /var/* 2>/dev/null | sort -h | tail -n 3   # the three biggest in /var
mkdir -p ~/scratch && cd ~/scratch
seq 1 100000 > big.log
ls -lh big.log                    # about 576K
tar -czf big.tar.gz big.log
ls -lh big.tar.gz                 # much smaller
tar -tzf big.tar.gz               # big.log
ln -s big.log current.log
readlink current.log              # big.log
find . -name '*.log' -size +100k  # ./big.log (current.log is a link, and find doesn't follow it)
```
