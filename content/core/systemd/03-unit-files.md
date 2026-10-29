---
title: Reading unit files
minutes: 20
story: |
  **Mission log, day 41.** The services come up on their own now. Okafor wants the next step:
  "We've been switching these on and off for two days and nobody's read one. What does each of
  them actually run, and as who? Read the files."
quiz:
  - type: choice
    q: "Who does this service run as?"
    code: |-
      $ systemctl cat uplink
      # /usr/lib/systemd/system/uplink.service
      [Unit]
      Description=Long-range uplink
      After=network-online.target

      [Service]
      ExecStart=/usr/local/sbin/uplinkd --port 7100

      [Install]
      WantedBy=multi-user.target
    options:
      - "root: there's no `User=` line, and that's the default"
      - "uplink, the service's own name"
      - "Whoever ran `systemctl start`"
      - "nobody, the unprivileged account"
    answer: 0
    explain: >-
      Without `User=`, systemd runs the program as root, whoever started it. A service that
      doesn't need root should say `User=` with an account of its own, so a bug in it can't
      touch the whole machine.
  - type: choice
    q: "A package upgrade replaced `/usr/lib/systemd/system/relay.service`, but the service still runs your changed settings. Why?"
    options:
      - "There's a copy in `/etc/systemd/system/relay.service`, and the admin's copy there wins over the package's"
      - "Upgrades never change unit files"
      - "systemd caches unit files forever"
      - "`/usr/lib` is read only at the first boot"
    answer: 0
    explain: >-
      `/usr/lib/systemd/system` is the package's, and upgrades overwrite it. `/etc/systemd/system`
      is the administrator's, and a file there with the same name is used instead. That's why
      changes belong in `/etc`. The flip side: your copy doesn't get the package's fixes either.
  - type: choice
    q: "`web.service` has `Wants=cache.service` and `After=cache.service`. The cache fails to start. What happens to `web`?"
    options:
      - "It starts anyway, after the cache's attempt: `Wants` asks for the cache but doesn't depend on it"
      - "It doesn't start: it wants the cache"
      - "It starts before the cache"
      - "systemd refuses to load it"
    answer: 0
    explain: >-
      `Wants=` starts the other unit too, and carries on whatever happens to it. `After=` only
      sets the order: wait for the cache's start to finish first. With `Requires=` instead, the
      web service wouldn't start if the cache failed.
  - type: multi
    q: "Which lines belong in the `[Service]` section?"
    options: ["`ExecStart=`", "`User=`", "`WantedBy=`", "`After=`"]
    answer: [0, 1]
    explain: >-
      `[Service]` says how to run it: the program (`ExecStart=`) and who as (`User=`). `After=`
      is about relations to other units, so it's in `[Unit]`, and `WantedBy=` is about enabling,
      so it's in `[Install]`.
  - type: fill
    q: "Which `systemctl` command shows a service's unit file, with its path at the top? (Leave the service's name off.)"
    answer: ["systemctl cat", "systemctl cat NAME"]
    explain: >-
      `systemctl cat NAME` prints the file systemd is using, after a `#` line naming its path, so
      it also tells you which directory's copy won.
cards:
  - id: systemctl-cat
    section: "`systemctl cat`: the file behind a service"
    accept: ["systemctl cat NAME"]
    front: Show the unit file a service is using (write the service as NAME)
    back: "`systemctl cat NAME`: the file, with its path on the first line"
  - id: no-user-is-root
    section: "Who it runs as"
    front: "A unit file has no `User=` line. Who does the service run as?"
    back: "root"
  - id: etc-beats-usr-lib
    section: "Two directories, and which one wins"
    front: "`/etc/systemd/system` or `/usr/lib/systemd/system`: which wins, and whose is each?"
    back: "`/etc/systemd/system`, the administrator's. `/usr/lib/systemd/system` is the package's, and upgrades overwrite it."
  - id: wants-requires-after
    section: "`After`, `Wants` and `Requires`"
    front: "`After=` versus `Wants=` versus `Requires=`"
    back: "`After=`: order only. `Wants=`: start it too, carry on if it fails. `Requires=`: start it too, and stop when it's stopped; with `After=` as well, don't start if it fails."
terminal:
  task: |
    Okafor wants to know what the life-support services really run. From their unit files,
    write **`~/units.txt`** with these lines, one space between each part:

    - For each of `scrubberd.service`, `recycler.service`, `co2-monitor.service` and
      `o2-backup.service`: the unit, the **program** its `ExecStart=` runs (the full path, no
      options), and the **user** it runs as. For the lesson's `beacon`, that line would be
      `beacon.service /usr/local/sbin/beacond beacon`.
    - `requires UNIT`: the unit that `recycler.service` can't start without, written in full,
      `.service` included.
    - `override UNIT`: the one of the four whose administrator's copy is used instead of the
      package's, in full too.

    Read what systemd is using, not just any file with the right name.
  cwd: /home/cadet
  accounts:
    - {name: scrubber, uid: 990, comment: Scrubber controller, home: /var/lib/scrubber}
    - {name: water, uid: 991, comment: Water recycler, home: /var/lib/water}
    - {name: sensors, uid: 992, comment: Station sensors, home: /var/lib/sensors}
    - {name: o2feed, uid: 993, comment: O2 backup feed, home: /var/lib/o2feed}
  services:
    - name: scrubberd.service
      enabled: true
      unit: |
        [Unit]
        Description=Life support: scrubber controller
        After=network.target

        [Service]
        ExecStart=/usr/local/sbin/scrubberd --cycle 90
        User=scrubber
        Restart=on-failure

        [Install]
        WantedBy=multi-user.target
    - name: co2-monitor.service
      enabled: true
      unit: |
        [Unit]
        Description=Life support: CO2 monitor

        [Service]
        ExecStart=/usr/local/sbin/co2-monitor --interval 30
        User=sensors

        [Install]
        WantedBy=multi-user.target
    - name: recycler.service
      enabled: true
      unit: |
        [Unit]
        Description=Life support: water recycler
        Requires=co2-monitor.service
        After=co2-monitor.service
        Wants=thermal-reg.service

        [Service]
        ExecStart=/usr/local/sbin/recyclerd -c /etc/recycler.conf
        User=water

        [Install]
        WantedBy=multi-user.target
    - name: thermal-reg.service
      enabled: true
      unit: |
        [Unit]
        Description=Life support: thermal regulator

        [Service]
        ExecStart=/usr/local/sbin/thermal-regd
        User=sensors

        [Install]
        WantedBy=multi-user.target
    - name: o2-backup.service
      enabled: true
      dir: /etc/systemd/system
      unit: |
        [Unit]
        Description=Life support: O2 backup feed

        [Service]
        ExecStart=/usr/local/sbin/o2-backupd --verbose

        [Install]
        WantedBy=multi-user.target
  files:
    - {path: /home/cadet, type: dir}
    - path: /usr/lib/systemd/system/o2-backup.service
      owner: root
      group: root
      contents: |
        [Unit]
        Description=Life support: O2 backup feed

        [Service]
        ExecStart=/usr/local/sbin/o2-backupd
        User=o2feed

        [Install]
        WantedBy=multi-user.target
    - {path: /usr/local/sbin/scrubberd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/co2-monitor, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/recyclerd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/thermal-regd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/o2-backupd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
  checks:
    - {contains: /home/cadet/units.txt, text: "scrubberd.service /usr/local/sbin/scrubberd scrubber"}
    - {contains: /home/cadet/units.txt, text: "recycler.service /usr/local/sbin/recyclerd water"}
    - {contains: /home/cadet/units.txt, text: "co2-monitor.service /usr/local/sbin/co2-monitor sensors"}
    - {contains: /home/cadet/units.txt, text: "o2-backup.service /usr/local/sbin/o2-backupd root"}
    - {contains: /home/cadet/units.txt, text: "requires co2-monitor.service"}
    - {contains: /home/cadet/units.txt, text: "override o2-backup.service"}
    - {lacks: /home/cadet/units.txt, text: "requires thermal-reg"}
  success: |-
    Okafor reads the o2-backup line twice. "Root. In the copy in /etc. Somebody 'fixed' that one by hand."
  solution:
    - systemctl cat scrubberd recycler co2-monitor
    - systemctl cat o2-backup
    - ls /etc/systemd/system
    - echo "scrubberd.service /usr/local/sbin/scrubberd scrubber" > ~/units.txt
    - echo "recycler.service /usr/local/sbin/recyclerd water" >> ~/units.txt
    - echo "co2-monitor.service /usr/local/sbin/co2-monitor sensors" >> ~/units.txt
    - echo "o2-backup.service /usr/local/sbin/o2-backupd root" >> ~/units.txt
    - echo "requires co2-monitor.service" >> ~/units.txt
    - echo "override o2-backup.service" >> ~/units.txt
comms:
  open:
    - {from: meridian, text: "LIFE SUPPORT SERVICES · 5 · ACTIVE · ENABLED · UNIT FILES: 6"}
    - {from: okafor, text: "Six files for five services. One of them has two, and I'd like to know which, and why."}
    - {from: okafor, text: "While you're in there: what each one runs, and who as. A service should never be root without a reason."}
  console_done:
    - {from: meridian, text: "O2-BACKUP.SERVICE · /ETC/SYSTEMD/SYSTEM · OVERRIDES PACKAGE COPY · USER: ROOT (PACKAGE COPY: O2FEED)"}
    - {from: okafor, text: "Someone copied o2-backup into /etc to get more logging out of it, and dropped the User= line on the way. So it's been running as root."}
    - {from: okafor, text: "That's not sabotage. That's somebody debugging in a hurry and never cleaning up."}
  complete:
    - {from: okafor, text: "You can read them now. Tomorrow you write one: the new O2 monitor arrived without a unit file, and nothing on this station runs without one."}
---

## `systemctl cat`: the file behind a service

Every unit is a small text file, and **`systemctl cat NAME`** prints the one systemd is using,
with its path on a `#` line first:

```text
$ systemctl cat beacon
# /usr/lib/systemd/system/beacon.service
[Unit]
Description=Docking beacon
After=network.target

[Service]
ExecStart=/usr/local/sbin/beacond --interval 5
User=beacon
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

It takes several names at once. `cat` on the file's path works too, but `systemctl cat`
shows the copy systemd actually uses, which matters below.

## Three sections

A unit file is in `[Section]`s of `Key=value` lines (no spaces needed around the `=`), and a
service has three:

| Section | Says | Keys you'll meet |
|---|---|---|
| `[Unit]` | what it is, and how it relates to other units | `Description=`, `After=`, `Wants=`, `Requires=` |
| `[Service]` | how to run it | `ExecStart=`, `User=`, `Restart=` (module 04) |
| `[Install]` | what enabling it does | `WantedBy=` |

**`ExecStart=` is the command that runs the service**: the program's full path first, then
its options. In the example, the program is `/usr/local/sbin/beacond`, and `--interval 5` is an
option. `network.target` is a target (module 01): `After=network.target` waits until the
network is set up. **`WantedBy=multi-user.target`** is where `enable` puts its link: that's the
`multi-user.target.wants/` directory from module 02. A unit with no `[Install]` section is
`static`: it can't be enabled, so it runs only when started by hand or by another unit (its
`Wants=`, or a timer, module 05).

## Who it runs as

**`User=` names the account the program runs as. With no `User=` line, it runs as root.** It
doesn't matter who typed `systemctl start`: systemd starts it, as whoever the file says.

A service rarely needs root. With an account of its own, a bug or a break-in can only touch
what that account can. That's why packages create accounts for their services: Ubuntu's
clock-sync service runs with `User=systemd-timesync`.

## `After`, `Wants` and `Requires`

Three keys in `[Unit]` relate a service to others, and they do different things:

| Key | Means |
|---|---|
| `After=UNIT` | **order only**: if both are starting, wait for UNIT first. It doesn't start UNIT |
| `Wants=UNIT` | **start UNIT too**, and carry on whether it works or not |
| `Requires=UNIT` | **start UNIT too, and depend on it**: stopping UNIT stops this one too |

`Requires=` doesn't wait on its own: both start at the same time, so this one can be running
before UNIT has failed. **Add `After=` for the full guard**: `Requires=db.service` with
`After=db.service` means "start the database first, and if it fails, don't start this one
either" (`A dependency job for … failed`). That's why the two are almost always paired.

## Two directories, and which one wins

Unit files live in two places:

| Directory | Whose | |
|---|---|---|
| `/usr/lib/systemd/system` | **the package's**: installed and **overwritten on upgrade** | don't edit |
| `/etc/systemd/system` | **the administrator's** | **wins**: a file here with the same name is used instead |

So to change a service, copy its file to `/etc/systemd/system` and edit the copy. The package's
file stays, unused. **The path on `systemctl cat`'s first line, and on `systemctl status`'s
`Loaded:` line, says which copy is in use.** Listing `/etc/systemd/system` shows every copy an
administrator made, among the `.wants/` directories.

After editing a unit file, or adding a copy to `/etc`, **`sudo systemctl daemon-reload`** makes
systemd read the files again. It prints nothing when it works. Until then systemd keeps using
what it loaded: `systemctl cat` still shows the old copy, and for a file it loaded that you
edited, `status` warns that it changed on disk.
On a real server, `sudo systemctl edit NAME` adds just your changes as a small extra file in
`/etc` and reloads for you; the station console doesn't have it.

**On the real station:** the same rule runs this app, one level down. Docker runs it from an
image (the app, packaged with everything it needs: the Docker units cover it), and its
`Dockerfile`, the recipe for that image, says `USER appuser`, so it runs as that account, not
root. It also logs in to its database as `orbit_app`, a database account that can read and
write the data but not change the tables themselves. A bug in the app can only do what those
two accounts can, which is exactly the point of `User=`.

## Try it

On a real Ubuntu machine with systemd and the `cron` package (Ubuntu Server has both):

```bash
systemctl cat cron                        # its path, then [Unit], [Service] and [Install]
systemctl cat cron | grep -e ExecStart -e User   # ExecStart only: no User=, so root
ps aux | grep /usr/sbin/cron              # cron's line says USER root (the other line is your grep)
ls /usr/lib/systemd/system | head -n 5
ls /etc/systemd/system                    # the admin's copies and the .wants/ links
sudo cp /usr/lib/systemd/system/cron.service /etc/systemd/system/
systemctl cat cron | head -n 1            # still /usr/lib/…: systemd hasn't reread the files
sudo systemctl daemon-reload
systemctl cat cron | head -n 1            # /etc/systemd/system/cron.service: the copy wins
sudo rm /etc/systemd/system/cron.service && sudo systemctl daemon-reload
```
