---
title: What a service is
minutes: 20
story: |
  **Mission log, day 39.** MERIDIAN came back from a power cycle at 08:00, and half the station's
  daemons didn't come back with it. Again. "Nobody restarts anything yet," says Okafor. "First I
  want to know which ones are down, and how."
quiz:
  - type: choice
    q: "What happened to this service?"
    code: |-
      $ systemctl status uplink
      × uplink.service - Long-range uplink
           Loaded: loaded (/usr/lib/systemd/system/uplink.service; enabled; preset: enabled)
           Active: failed (Result: exit-code) since Thu 2026-10-08 08:00:03 UTC; 1h 0min ago
         Duration: 3.002s
          Process: 714 ExecStart=/usr/local/sbin/uplinkd (code=exited, status=1/FAILURE)
         Main PID: 714 (code=exited, status=1/FAILURE)
    options:
      - "systemd started it at boot, and its program exited with an error three seconds later. It isn't running"
      - "It's running, but with errors"
      - "Nobody has started it since boot"
      - "Its unit file is missing"
    answer: 0
    explain: >-
      `failed` means it tried to run and it went wrong: `Result: exit-code` and `status=1/FAILURE`
      say its program ended with exit status 1, and `Duration: 3.002s` says how long it lasted. The
      `Loaded:` line found its file, and `enabled` is why it started at boot. A service nobody
      started would say `inactive (dead)` instead.
  - type: choice
    q: "You know `backup.service` is installed, but `systemctl list-units --type=service` doesn't list it. Why?"
    options:
      - "It isn't running, and `list-units` hides inactive units unless you add `--all`"
      - "It has failed, and failed units are hidden"
      - "`--type=service` only shows services that start at boot"
      - "Only root can see it"
    answer: 0
    explain: >-
      Without `--all`, `list-units` shows what's running and what's failed, and leaves out the
      inactive ones. `--all` brings back the ones systemd has loaded. If it still isn't there,
      `systemctl list-unit-files` lists every unit installed, loaded or not.
  - type: choice
    q: "One service says `inactive (dead)`, another says `failed (Result: exit-code)`. What's the difference?"
    options:
      - "Inactive isn't running and nothing went wrong; failed tried to run and its program stopped with an error"
      - "Inactive is stopped for now and will start soon; failed is stopped for good"
      - "They mean the same: neither is running"
      - "Inactive is disabled; failed is enabled"
    answer: 0
    explain: >-
      Neither is running, but only `failed` says something went wrong. `inactive` is a service
      that was stopped cleanly or never started, and nothing complains about it, which is how a
      service that should be running can stay off for weeks without anyone noticing.
  - type: fill
    q: "What is PID 1, the first process the kernel starts, on Ubuntu?"
    answer: ["systemd", "/sbin/init", "/lib/systemd/systemd", "/usr/lib/systemd/systemd"]
    explain: >-
      systemd. Everything else on the machine is started by it, or by something it started.
      `ps aux` shows its command as `/sbin/init`, a link to systemd kept for old habits.
  - type: fill
    q: "Which command lists only the failed units?"
    answer: ["systemctl --failed", "systemctl list-units --failed", "systemctl list-units --state=failed", "systemctl --state=failed"]
    explain: >-
      `systemctl --failed`, short for `systemctl list-units --failed`. On a healthy server it says
      `0 loaded units listed.`, which makes it a good first command after a reboot.
cards:
  - id: pid-1
    section: "Daemons, and the manager that starts them"
    front: What is PID 1 on Ubuntu, and what does it do?
    back: "systemd. It starts every service at boot, restarts them if told to, and stops them at shutdown."
  - id: list-failed
    section: "`systemctl list-units`: all of them at once"
    accept: ["systemctl --failed", "systemctl list-units --failed", "systemctl list-units --state=failed"]
    front: List only the failed units
    back: "`systemctl --failed`"
  - id: list-all
    section: "`systemctl list-units`: all of them at once"
    accept: ["systemctl list-units --type=service --all", "systemctl list-units --all --type=service"]
    front: List every loaded service, the stopped ones too
    back: "`systemctl list-units --type=service --all`. Without `--all`, inactive units are left out."
  - id: inactive-vs-failed
    section: "Active, inactive, failed"
    front: "`inactive` or `failed`: which one says something went wrong?"
    back: "`failed`: it tried to run and its program stopped with an error. `inactive` is just not running, and nothing complains."
terminal:
  task: |
    MERIDIAN restarted at 08:00, and not every life-support daemon came back. The life-support
    services are the ones whose **description starts with `Life support:`**.

    Find **every life-support service that isn't running** and write each one to
    **`~/down.txt`**, one per line: the unit's full name, `.service` included, then one space,
    then its state, `failed` or `inactive`, as systemd reports it. A line for the lesson's
    `hull-scan` would be:

    ```text
    hull-scan.service failed
    ```

    Leave out the ones that are running, and any service that isn't life support. Don't start
    or stop anything: Okafor wants the list first.
  cwd: /home/cadet
  services:
    - name: scrubberd.service
      enabled: true
      unit: |
        [Unit]
        Description=Life support: scrubber controller

        [Service]
        ExecStart=/usr/local/sbin/scrubberd

        [Install]
        WantedBy=multi-user.target
    - name: thermal-reg.service
      enabled: true
      unit: |
        [Unit]
        Description=Life support: thermal regulator

        [Service]
        ExecStart=/usr/local/sbin/thermal-regd

        [Install]
        WantedBy=multi-user.target
    - name: recycler.service
      enabled: true
      state: failed
      exits: 1
      unit: |
        [Unit]
        Description=Life support: water recycler

        [Service]
        ExecStart=/usr/local/sbin/recyclerd

        [Install]
        WantedBy=multi-user.target
    - name: co2-monitor.service
      enabled: true
      state: failed
      exits: 1
      unit: |
        [Unit]
        Description=Life support: CO2 monitor

        [Service]
        ExecStart=/usr/local/sbin/co2-monitor

        [Install]
        WantedBy=multi-user.target
    - name: o2-backup.service
      state: inactive
      unit: |
        [Unit]
        Description=Life support: O2 backup feed

        [Service]
        ExecStart=/usr/local/sbin/o2-backupd

        [Install]
        WantedBy=multi-user.target
    - name: cabin-fans.service
      state: inactive
      unit: |
        [Unit]
        Description=Life support: cabin fans

        [Service]
        ExecStart=/usr/local/sbin/cabin-fansd

        [Install]
        WantedBy=multi-user.target
    - name: galley-display.service
      enabled: true
      state: failed
      exits: 1
      unit: |
        [Unit]
        Description=Galley menu display

        [Service]
        ExecStart=/usr/local/sbin/galley-display

        [Install]
        WantedBy=multi-user.target
    - name: hydroponics-lights.service
      state: inactive
      unit: |
        [Unit]
        Description=Hydroponics grow lights

        [Service]
        ExecStart=/usr/local/sbin/grow-lights

        [Install]
        WantedBy=multi-user.target
    - name: cron.service
      enabled: true
      unit: |
        [Unit]
        Description=Regular background program processing daemon

        [Service]
        ExecStart=/usr/sbin/cron -f -P

        [Install]
        WantedBy=multi-user.target
  files:
    - {path: /home/cadet, type: dir}
    - {path: /usr/sbin/cron, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/scrubberd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/thermal-regd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/recyclerd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/co2-monitor, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/o2-backupd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/cabin-fansd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/galley-display, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/grow-lights, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
  checks:
    - {contains: /home/cadet/down.txt, text: "recycler.service failed"}
    - {contains: /home/cadet/down.txt, text: "co2-monitor.service failed"}
    - {contains: /home/cadet/down.txt, text: "o2-backup.service inactive"}
    - {contains: /home/cadet/down.txt, text: "cabin-fans.service inactive"}
    - {lacks: /home/cadet/down.txt, text: "scrubberd"}
    - {lacks: /home/cadet/down.txt, text: "thermal-reg"}
    - {lacks: /home/cadet/down.txt, text: "galley-display"}
    - {lacks: /home/cadet/down.txt, text: "hydroponics"}
    - {lacks: /home/cadet/down.txt, text: "cron"}
  success: |-
    Okafor reads the list and taps the bottom two. "Those didn't crash. Nobody ever started them."
  solution:
    - systemctl --failed
    - systemctl list-units --type=service --all
    - systemctl status o2-backup
    - echo "recycler.service failed" > ~/down.txt
    - echo "co2-monitor.service failed" >> ~/down.txt
    - echo "o2-backup.service inactive" >> ~/down.txt
    - echo "cabin-fans.service inactive" >> ~/down.txt
    - cat ~/down.txt
comms:
  open:
    - {from: meridian, text: "POWER CYCLE COMPLETE · BOOT 08:00 · LIFE SUPPORT SERVICES: 6 · RUNNING: 2"}
    - {from: okafor, text: "Two out of six. Same as every time we lose power."}
    - {from: okafor, text: "Nobody restarts anything yet. I want a list: which ones are down, and whether they crashed or just never started."}
  console_done:
    - {from: meridian, text: "RECYCLER · FAILED · CO2-MONITOR · FAILED · O2-BACKUP · INACTIVE · CABIN-FANS · INACTIVE"}
    - {from: okafor, text: "The two that failed tried and crashed. The other two never started at all, and nothing complained, because inactive isn't an error."}
    - {from: okafor, text: "The O2 backup feed was off. Remember that the next time someone asks why the backup didn't take over."}
  complete:
    - {from: okafor, text: "So now we know what's down. Tomorrow we bring it up, and make it stay up after a reboot."}
    - {from: okafor, text: "Someone's been starting these by hand every morning. I'd like to know who, and I'd like them to stop."}
---

## Daemons, and the manager that starts them

A **daemon** is a program that runs in the background, with no terminal, waiting for work:
`sshd` waits for logins, `cron` waits for the next job's time, a web server waits for
requests. Many of their names end in `d` for that reason. When a daemon is run and looked after
by the system, it's called a **service**.

Something has to start them all when the machine boots, in the right order, and look after them
while it runs. On Ubuntu, and on most Linux today, that's **systemd**. It's **PID 1**, the first
process the kernel starts, and everything else is started by it or by something it started. It
starts services at boot, restarts them when they crash if it's told to, collects what they log,
and stops them cleanly at shutdown. `ps aux` shows PID 1's command as `/sbin/init`: that's a
link to systemd, kept from older systems, so it's systemd too.

You talk to systemd with **`systemctl`**. Reading what it knows needs no special rights; changing
anything (module 02) needs `sudo`.

## Units

systemd manages **units**. A unit is one thing it looks after, described by a small text file
(module 03), and its type is the end of its name:

| Unit type | Ends in | Is |
|---|---|---|
| service | `.service` | a daemon or a job: `ssh.service`, `cron.service` |
| timer | `.timer` | a schedule that starts a service (module 05) |
| target | `.target` | a group of units to reach together: `multi-user.target` is "booted, no desktop" |
| socket, mount, path | `.socket`, `.mount`, `.path` | other kinds, not covered in this unit |

You can leave `.service` off a name: `systemctl status cron` means `cron.service`. The station
console knows services and timers.

## `systemctl status`: one service, line by line

**`systemctl status NAME`** is the first thing to read about any service:

```text
● beacon.service - Docking beacon
     Loaded: loaded (/usr/lib/systemd/system/beacon.service; enabled; preset: enabled)
     Active: active (running) since Thu 2026-10-08 08:00:00 UTC; 1h 0min ago
   Main PID: 612 (beacond)
      Tasks: 1 (limit: 2275)
     Memory: 1.2M (peak: 1.6M)
        CPU: 12ms
     CGroup: /system.slice/beacon.service
             └─612 /usr/local/sbin/beacond
```

| Line | Says |
|---|---|
| first line | the unit's name and its **description**, the text after the dash |
| `Loaded:` | systemd found and read its file (the path in brackets), and whether it's **enabled**, started at boot (module 02) |
| `Active:` | **its state**, and since when |
| `Main PID:` | the process running it, as `ps` would show it |
| `CGroup:` | every process that belongs to it: a **cgroup** is the group of processes systemd keeps together for one unit |

`Tasks:`, `Memory:` and `CPU:` are what it's using, and `preset:` on the `Loaded:` line can be
ignored for now. Below all that come its last few log lines, if you're allowed to read the
journal (module 06). The dot at the start is a quick signal: green `●` running, white `○`
stopped, red `×` failed.

A failed service looks like this:

```text
× hull-scan.service - Hull sensor sweep
     Loaded: loaded (/usr/lib/systemd/system/hull-scan.service; enabled; preset: enabled)
     Active: failed (Result: exit-code) since Thu 2026-10-08 08:00:05 UTC; 59min ago
   Duration: 5.004s
    Process: 655 ExecStart=/usr/local/sbin/hull-scan (code=exited, status=1/FAILURE)
   Main PID: 655 (code=exited, status=1/FAILURE)
        CPU: 3ms
```

| Line | Says |
|---|---|
| `Duration:` | how long it ran before it stopped, shown once it isn't running |
| `Process:` | the program it started (its `ExecStart=`, module 03) and how that program ended |
| `Main PID:` | now the process that *was* running it, and how it ended |

The station console leaves out the `Process:` line and says the rest.

## Active, inactive, failed

The `Active:` line is the one you came for. These are the states you'll meet:

| `Active:` says | Means |
|---|---|
| `active (running)` | its program is running |
| `inactive (dead)` | **not running, and nothing went wrong**: stopped cleanly, or never started |
| `failed (Result: exit-code)` | **it tried to run and it went wrong**: its program stopped with an error |
| `activating` | starting up right now |

The difference between the middle two matters. **`failed` is systemd telling you something
broke**: the `Main PID:` line then shows how its program ended, as in `(code=exited,
status=1/FAILURE)`, an exit status of 1. **`inactive` complains about nothing.** A service that
should be running but was never started sits there quietly as `inactive`, so look for both.

## `systemctl list-units`: all of them at once

`status` is one service. **`systemctl list-units --type=service`** lists them all, one row each:

```text
  UNIT              LOAD   ACTIVE SUB     DESCRIPTION
  beacon.service    loaded active running Docking beacon
● hull-scan.service loaded failed failed  Hull sensor sweep
```

The **ACTIVE** column is the state; SUB is the finer detail (`running`, `dead`, `failed`); the
**DESCRIPTION** column is the text after the dash in `status`. **LOAD** says `loaded` when
systemd has read the unit's file. A failed row starts with a red `●` here, where `status`
would show `×`, so on those rows `awk`'s `$1` is the dot, not the unit. On a real machine,
`status` and `list-units` open a pager like `less` when their output is long: `q` quits it.

**Without `--all`, inactive units are left out.** `list-units` shows what's running and what's
failed, so a service that's simply off doesn't appear. Its options:

| Command | Lists |
|---|---|
| `systemctl list-units --type=service` | services running or failed |
| `systemctl list-units --type=service --all` | **every loaded service, inactive ones too** |
| `systemctl --failed` | **only the failed units** (short for `list-units --failed`) |
| `systemctl list-units --state=inactive` | only the inactive ones |
| `systemctl list-unit-files` | every unit installed, loaded or not |

"Loaded" is the catch in `--all` on a real server. systemd reads a unit's file when something
needs it, so a service that isn't enabled and hasn't been started since boot isn't loaded, and
isn't listed even with `--all`. `list-unit-files` lists every unit file on disk, with whether
it's enabled, and `systemctl status NAME` works on any of them. **The station console loads
every unit at boot, so its `--all` lists them all.** A real server's `list-units` also prints
dozens of system services (`systemd-journald`, `ssh`, `cron` and the rest); the station
console lists only the station's.

**On the real station:** the droplet that runs this app has systemd as PID 1 too. Nginx is a
service there, which is why the RUNBOOK's Nginx setup runs `sudo systemctl reload nginx`.
The app itself isn't a systemd service: it runs in Docker containers, and Docker is. On
Ubuntu, installing Docker enables `docker.service`, so systemd starts it at boot. Each
container in `docker-compose.yml` has `restart: always`, so Docker starts it again when it
crashes, and when Docker itself starts at boot. That's a service manager's job, done one level down. When the droplet was rebooted on
2026-10-21, that's what brought the app back with nobody touching it.

## Try it

On a real Ubuntu machine. A plain Docker container doesn't run systemd: use a VM, a server,
or WSL with systemd turned on. Your list will be longer and different.

```bash
ps aux | head -n 2                # PID 1: /sbin/init, which is systemd
systemctl status cron             # Loaded, Active and Main PID; q to quit if it pages
systemctl list-units --type=service | head -n 5
systemctl --failed                # often "0 loaded units listed."
systemctl list-units --type=service --all | grep inactive | head -n 3
systemctl list-unit-files --type=service | head -n 5
```
