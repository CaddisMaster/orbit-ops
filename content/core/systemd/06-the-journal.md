---
title: The journal
minutes: 20
story: |
  **Mission log, day 44.** Scrubber B's controller has been held down since the power cycle,
  and Okafor won't start it again until he knows what stopped it on the night of the outage.
  Every service on the station writes to one log. "It's all in there," he says. "02:30 to 02:45.
  Read it, and keep a copy."
quiz:
  - type: choice
    q: "Why does this show nothing about `water-pump`?"
    code: |-
      $ journalctl -u water-pump
      Hint: You are currently not seeing messages from other users and the system.
            Users in groups 'adm', 'systemd-journal' can see all messages.
            Pass -q to turn off this notice.
      No journal files were opened due to insufficient permissions.
    options:
      - "A service's lines are the system's: reading them needs `sudo`, or the `adm` or `systemd-journal` group"
      - "`water-pump` has never logged anything"
      - "`-u` needs the full name, `water-pump.service`"
      - "The journal was cleared at the last boot"
    answer: 0
    explain: >-
      Without `sudo` or one of those groups, you see only the lines from your own login. `sudo
      journalctl -u water-pump` shows them, and `-u` takes the short name as `systemctl` does.
  - type: choice
    q: "Which shows only the warnings, and anything worse, from the boot before this one?"
    options:
      - "`sudo journalctl -b -1 -p warning`"
      - "`sudo journalctl -b -p warning`"
      - "`sudo journalctl -b -1 -p warning..warning`"
      - "`sudo journalctl -n 1 -p warning`"
    answer: 0
    explain: >-
      `-b -1` is the previous boot (`-b` alone is this one). `-p warning` shows warnings and
      everything more serious, so `err` and `crit` too. `warning..warning` is a range of one
      priority, and would leave the errors out.
  - type: choice
    q: "Does this save the lines to the file?"
    code: |-
      $ sudo journalctl -u water-pump --since "2026-10-07 22:00" --until "2026-10-07 23:00" > ~/pump.log
    options:
      - "Yes: `journalctl` runs as root and can read them, and your own shell writes the file in your home directory"
      - "No: the redirect isn't done as root, so nothing is read"
      - "No: `--since` needs a time without a date"
      - "No: `journalctl` can only print to the screen"
    answer: 0
    explain: >-
      `sudo` covers the command, and the `>` is your shell's, done as you. That's fine here: the
      reading needs root, and the file is yours. It's the other way round from module 04's
      `sudo echo … >> /etc/…`, where the writing was the part that needed root.
  - type: choice
    q: "A job in `/etc/cron.d` must stop running, but the file is evidence. What do you do?"
    options:
      - "Move it out of `/etc/cron.d` with `sudo mv`: a file there is a job only while it's in that directory"
      - "Delete it with `sudo rm`"
      - "`sudo systemctl stop cron`"
      - "`sudo systemctl disable` the job"
    answer: 0
    explain: >-
      Moved out, the file is kept, and cron no longer sees it. Deleting it loses it, stopping
      cron stops every other job too, and a cron job isn't a unit, so `systemctl` can't disable it.
  - type: fill
    q: "Which `journalctl` option shows the lines of one unit only?"
    answer: ["-u", "--unit"]
    explain: >-
      `-u UNIT`, given more than once for several units. Leave it off, and you get every
      unit's lines.
cards:
  - id: journal-window
    section: "Narrowing it down"
    accept: ["sudo journalctl -u NAME --since \"START\" --until \"END\""]
    front: "Read one unit's lines between two times (write them as START and END)"
    back: "`sudo journalctl -u NAME --since \"START\" --until \"END\"`, with times like `\"2026-10-07 22:00\"` in quotes"
  - id: journal-previous-boot
    section: "Boots"
    accept: ["journalctl -b -1", "sudo journalctl -b -1"]
    front: The journal from the boot before this one
    back: "`journalctl -b -1` (`-b` alone is this boot)"
  - id: journal-priority
    section: "Narrowing it down"
    front: "What does `journalctl -p warning` show?"
    back: "Lines at `warning` and anything more serious: `err`, `crit`, `alert`, `emerg`"
  - id: journal-who-reads
    section: "Who can read it"
    front: Who can read the whole journal?
    back: "root (so `sudo`), and members of the `adm` or `systemd-journal` group. Everyone else sees only their own lines."
terminal:
  task: |
    Okafor wants the night of the outage on record, and whatever stopped scrubber B out of
    service.

    - Make a directory **`~/evidence`**, and save **the journal's lines from 02:30 to 02:45 on
      2026-10-08**, all units, in **`~/evidence/outage.log`**. Just that window: nothing
      before 02:30 or after 02:45.
    - **The journal shows which cron job started what stopped it. Take that job's file in
      `/etc/cron.d` out of service without deleting it**: it goes in `~/evidence` too, under
      the same name.
    - Then start **`scrubberd`** again, so it's running.

    Your password for `sudo` is `meridian`.
  cwd: /home/cadet
  groups: [sudo]
  password: meridian
  accounts:
    - {name: scrubber, uid: 990, comment: Scrubber controller, home: /var/lib/scrubber}
    - {name: md-3, uid: 995, comment: Maintenance drone MD-3, home: /var/lib/md-3}
    - {name: okafor, uid: 1001, comment: Okafor, home: /home/okafor}
  services:
    - name: scrubberd.service
      state: inactive
      enabled: true
      unit: |
        [Unit]
        Description=Life support: scrubber controller

        [Service]
        ExecStart=/usr/local/sbin/scrubberd
        User=scrubber
        Restart=on-failure

        [Install]
        WantedBy=multi-user.target
    - name: cron.service
      enabled: true
      unit: |
        [Unit]
        Description=Regular background program processing daemon
        Documentation=man:cron(8)

        [Service]
        ExecStart=/usr/sbin/cron -f -P

        [Install]
        WantedBy=multi-user.target
    - name: ssh.service
      enabled: true
      unit: |
        [Unit]
        Description=OpenBSD Secure Shell server
        Documentation=man:sshd(8) man:sshd_config(5)
        After=network.target

        [Service]
        ExecStart=/usr/sbin/sshd -D

        [Install]
        WantedBy=multi-user.target
  journal:
    - {time: "2026-10-08 02:11:04", identifier: sshd, pid: 4412, unit: ssh.service, message: "Failed password for md-3 from 10.4.2.17 port 50122 ssh2"}
    - {time: "2026-10-08 02:22:47", identifier: sshd, pid: 4415, unit: ssh.service, message: "Failed password for md-3 from 10.4.2.17 port 50188 ssh2"}
    - {time: "2026-10-08 02:28:00", identifier: scrubberd, pid: 702, unit: scrubberd.service, message: "cycle 1141: CO2 0.31%, bed B adsorbing"}
    - {time: "2026-10-08 02:33:00", identifier: scrubberd, pid: 702, unit: scrubberd.service, message: "cycle 1142: CO2 0.31%, bed B regenerating"}
    - {time: "2026-10-08 02:34:51", identifier: sshd, pid: 4418, unit: ssh.service, message: "Failed password for md-3 from 10.4.2.17 port 50241 ssh2"}
    - {time: "2026-10-08 02:35:01", identifier: CRON, pid: 5120, unit: cron.service, message: "(root) CMD (/usr/local/sbin/scrubber-flush >/dev/null 2>&1)"}
    - {time: "2026-10-08 02:35:02", identifier: scrubber-flush, pid: 5121, unit: cron.service, priority: notice, message: "sending controller state to 203.0.113.47"}
    - {time: "2026-10-08 02:38:00", identifier: scrubberd, pid: 702, unit: scrubberd.service, message: "cycle 1143: CO2 0.32%, bed B regenerating"}
    - {time: "2026-10-08 02:39:58", identifier: scrubber-flush, pid: 5121, unit: cron.service, priority: warning, message: "reply: FLUSH"}
    - {time: "2026-10-08 02:39:59", identifier: scrubber-flush, pid: 5121, unit: cron.service, priority: warning, message: "stopping scrubberd.service"}
    - {time: "2026-10-08 02:40:00", identifier: systemd, pid: 1, unit: scrubberd.service, message: "Stopping scrubberd.service - Life support: scrubber controller..."}
    - {time: "2026-10-08 02:40:01", identifier: systemd, pid: 1, unit: scrubberd.service, message: "scrubberd.service: Deactivated successfully."}
    - {time: "2026-10-08 02:40:01", identifier: systemd, pid: 1, unit: scrubberd.service, message: "Stopped scrubberd.service - Life support: scrubber controller."}
    - {time: "2026-10-08 02:52:30", identifier: sshd, pid: 4420, unit: ssh.service, message: "Accepted publickey for okafor from 10.4.0.5 port 50300 ssh2"}
    - {time: "2026-10-08 08:00:00", identifier: systemd, pid: 1, unit: scrubberd.service, message: "Started scrubberd.service - Life support: scrubber controller."}
    - {time: "2026-10-08 08:06:40", identifier: sudo, pid: 811, message: "  okafor : TTY=pts/0 ; PWD=/home/okafor ; USER=root ; COMMAND=/usr/bin/systemctl stop scrubberd"}
    - {time: "2026-10-08 08:06:40", identifier: systemd, pid: 1, unit: scrubberd.service, message: "Stopping scrubberd.service - Life support: scrubber controller..."}
    - {time: "2026-10-08 08:06:41", identifier: systemd, pid: 1, unit: scrubberd.service, message: "scrubberd.service: Deactivated successfully."}
    - {time: "2026-10-08 08:06:41", identifier: systemd, pid: 1, unit: scrubberd.service, message: "Stopped scrubberd.service - Life support: scrubber controller."}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /usr/local/sbin/scrubberd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/scrubber-flush, mode: "700", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/sbin/cron, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/sbin/sshd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - path: /etc/cron.d/scrubber-maint
      owner: root
      group: root
      contents: |
        # nightly controller flush. do not remove
        35 2 * * *  root  /usr/local/sbin/scrubber-flush >/dev/null 2>&1
  checks:
    - {contains: /home/cadet/evidence/outage.log, text: "scrubber-flush[5121]: reply: FLUSH"}
    - {contains: /home/cadet/evidence/outage.log, text: "systemd[1]: Stopping scrubberd.service"}
    - {contains: /home/cadet/evidence/outage.log, text: "CRON[5120]: (root) CMD"}
    - {lacks: /home/cadet/evidence/outage.log, text: "port 50122"}
    - {lacks: /home/cadet/evidence/outage.log, text: "Accepted publickey for okafor"}
    - {missing: /etc/cron.d/scrubber-maint}
    - {contains: /home/cadet/evidence/scrubber-maint, text: "/usr/local/sbin/scrubber-flush"}
    - {active: scrubberd.service}
  success: |-
    Okafor reads the log twice: the reply, then the stop, two seconds apart. "FLUSH," he says. "Somebody told our scrubber to stop, and it did as it was told."
  solution:
    - mkdir ~/evidence
    - sudo journalctl --since "2026-10-08 02:30" --until "2026-10-08 02:45" > ~/evidence/outage.log
    - meridian
    - cat ~/evidence/outage.log
    - sudo mv /etc/cron.d/scrubber-maint ~/evidence/
    - sudo systemctl start scrubberd
    - systemctl status scrubberd
comms:
  open:
    - {from: meridian, text: "SCRUBBERD.SERVICE · INACTIVE · STOPPED 08:06 BY OKAFOR · PREVIOUS STOP: 02:40 (BOOT -1)"}
    - {from: okafor, text: "I stopped it again this morning, on purpose. I'm not starting that controller until I know what stopped it at 02:40."}
    - {from: okafor, text: "The journal keeps everything every service said that night. Get me 02:30 to 02:45, all of it, on file."}
  console_done:
    - {from: meridian, text: "02:39:58 SCRUBBER-FLUSH · REPLY: FLUSH · 02:40:00 SCRUBBERD · STOPPING · /ETC/CRON.D/SCRUBBER-MAINT: REMOVED · SCRUBBERD: ACTIVE"}
    - {from: okafor, text: "Eight nights that job sat in cron.d, sending our scrubber's state out every night and asking what to do. On the eighth, somebody answered."}
    - {from: okafor, text: "It's out of cron, the log's on file, and B is running. I'm sending all of it to Mission."}
  complete:
    - {from: mission, text: "*Meridian*, Mission Control. We have your log. 203.0.113.47 is not ours, and nothing at Mission has ever been called relay.depot-sync.net."}
    - {from: mission, text: "We're opening an inquiry into the supply depot's update feed. Keep everything you've saved. Nothing from the depot comes aboard until we say so."}
    - {from: okafor, text: "So now we know what. Who sent FLUSH, and how it got into an update, that's for later."}
    - {from: meridian, text: "LIFE SUPPORT · ALL SERVICES NOMINAL · DECK RESTORED"}
  window: {complete: aurora}
---

## What the journal is

Every service's output goes to one place: **the journal**, kept by `systemd-journald`. Each
line has the time, the machine's name, who said it, and what they said:

```text
Oct 07 22:14:03 meridian water-pump[811]: pressure 2.1 bar
Oct 07 22:15:00 meridian systemd[1]: Stopping water-pump.service - Water pump...
```

| Part | Here | Means |
|---|---|---|
| time | `Oct 07 22:14:03` | when, on the machine's clock |
| host | `meridian` | the machine |
| **identifier[PID]** | `water-pump[811]` | **the program that wrote the line, and its process ID**. `systemd[1]` is systemd itself, PID 1 |
| message | the rest | what it said |

Three kinds of line end up there: **what a service prints** (module 05), **systemd's own
lines** about units starting, stopping and failing, and **messages a program sends the journal
itself**. A program can do that even when its printed output is thrown away.

**Cron logs each job it starts as `CRON[PID]: (USER) CMD (COMMAND)`**: the account and the
command, as the line in `/etc/cron.d` gave them (module 05). **A program cron runs logs under
`cron.service`**, the unit it runs in, when the journal can tell: one that exits at once
may not be filed under any unit, and `-u` then misses it. That's a reason to read a stretch
of time across every unit, not one unit at a time.

**`journalctl`** reads it, oldest first. On a real terminal a long read opens in a pager, as
`systemctl` does (module 01): `q` quits. The station console prints it all instead.

## Who can read it

**Reading the whole journal needs root, or the `adm` or `systemd-journal` group.** Anyone else
sees only their own lines, and a service's aren't theirs: `journalctl -u` prints `-- No entries
--`, or, for a user who has never logged anything, as on the station console, `No journal files
were opened due to insufficient permissions.`, with a hint naming those groups. So use
**`sudo journalctl`**. On a real Ubuntu server, the first user made at
install is usually in `adm` already; on the station console, you aren't.

**The last lines of `systemctl status` come from the journal** too: the unit's lines since it
last started. Without the permission, `status` leaves them off and doesn't say why.

## Narrowing it down

A whole journal is thousands of lines. These narrow it, and combine. **With no `-u`, you get
every unit's lines**, so `--since` and `--until` alone give a stretch of time across the whole
machine.

| Option | Shows |
|---|---|
| **`-u UNIT`** | **only that unit's lines** (`-u water-pump`; give it twice for two units) |
| **`--since "TIME"`** | **lines from TIME on** |
| **`--until "TIME"`** | **lines up to TIME** |
| `-p PRIORITY` | lines at that priority **or more serious** |
| `-p FROM..TO` | only that range: `-p notice..notice` is notices alone |
| `-n N` | only the last N lines |
| `-r` | newest first |

**A time is `"YEAR-MONTH-DAY HOURS:MINUTES"`, in quotes because of the space**: `--since
"2026-10-07 22:00"`. A time alone, like `--since 22:00`, means today, and `today` and
`yesterday` work as they read. A real `journalctl` also takes `"10 minutes ago"`; the station
console doesn't.

Every line carries a **priority**: how serious the program that wrote it says it is. Most
serious first: `emerg` (emergency), `alert`, `crit` (critical), `err` (error), `warning`,
`notice`, `info`, `debug`. **`-p warning` shows warnings and everything more serious**, never
`notice` or `info`. Most lines are `info`.

```bash
sudo journalctl -u water-pump --since "2026-10-07 22:00" --until "2026-10-07 23:00"
sudo journalctl -p err -n 20     # the last 20 errors and worse
```

## Boots

**`-b` shows only this boot**, since the machine last started, and **`-b -1` the boot
before**. A plain read covers every boot it has, with a `-- Boot … --` line where one ends
and the next begins. Ubuntu keeps the journal on disk (`/var/log/journal`), so it survives a
restart, which is what makes last night readable this morning. **The station console booted
at 08:00**: anything earlier is the previous boot.

## Saving what you find

**`sudo journalctl … > FILE` saves it.** `sudo` covers `journalctl`, which needs root to read;
the `>` is your shell's, done as you, so the file is yours. That's why it works here when
module 04's `sudo echo … >> /etc/…` didn't: there, the writing needed root. **It prints
nothing** but sudo's password prompt: `cat` the file to see what went in.

## Stopping a cron job, keeping the file

**A file in `/etc/cron.d` is a job only while it's in that directory.** Move it out, with
**`sudo mv`**, and its job stops running, with the file kept as it was. Deleting it would
stop the job too, and lose it. `mv` prints nothing: `ls` both directories to check. A cron
job isn't a unit, so `systemctl` can't stop or disable it.

**On the real station:** RUNBOOK §6 checks the nightly database dump (#324) with `journalctl
-u orbit-ops-backup.service`: the timer's oneshot service from module 05, whose output goes
to the journal instead of nowhere.

## Try it

On a real Ubuntu machine with systemd. **`logger "TEXT"`** sends the journal a line of your own
(`-p` sets its priority); the station console doesn't have it.

```bash
logger -p warning "try it: a warning"
logger "try it: plain info"
journalctl -n 5                         # the last 5 lines, with the hint if you're not in adm
sudo journalctl -n 5                    # the same, everything
sudo journalctl -p warning --since "10 minutes ago"   # includes your warning, not the info line
sudo journalctl -u cron -n 5            # cron's lines, and its jobs'
sudo journalctl -b -1 -n 5              # the end of the previous boot, if there was one
sudo journalctl --since today > ~/today.log; wc -l ~/today.log
rm ~/today.log
```
