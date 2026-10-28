---
title: Timers
minutes: 20
story: |
  **Mission log, day 43.** Monday's crew briefing had no scrubber filter report. Did the job
  run? Did it fail? Nobody can say: it's a cron line that throws away everything it prints.
  "Nothing runs on this station that we can't see afterwards," says Okafor. "systemd has
  timers. Move it."
quiz:
  - type: choice
    q: "This job is moving to a timer. Which `OnCalendar=` keeps it on the same schedule?"
    code: |-
      $ cat /etc/cron.d/purge-logs
      30 22 * * 5 root /usr/local/sbin/purge-logs >/dev/null 2>&1
    options:
      - "`OnCalendar=Fri *-*-* 22:30:00`"
      - "`OnCalendar=*-*-* 30:22:00`"
      - "`OnCalendar=Sat *-*-* 22:30:00`"
      - "`OnCalendar=30 22 * * 5`"
    answer: 0
    explain: >-
      Cron's fields are minute, hour, day of month, month, day of week: `30 22` is 22:30, and day
      `5` is Friday (Monday is `1`, Sunday `0` or `7`). `OnCalendar=` writes the time the usual
      way round, and systemd can't read a cron line at all.
  - type: choice
    q: "You've written `tank-log.service` and `tank-log.timer`, then run this. Why isn't anything scheduled?"
    code: |-
      $ sudo systemctl enable --now tank-log
      The unit files have no installation config (WantedBy=, RequiredBy=, UpheldBy=,
      Also=, or Alias= settings in the [Install] section, and DefaultInstance= for
      template units). This means they are not meant to be enabled or disabled using systemctl.
      ...
    options:
      - "A name with no ending means `.service`, so it enabled the service, which has no `[Install]`. Enable `tank-log.timer`"
      - "The service needs an `[Install]` section with `WantedBy=timers.target`"
      - "It needs `sudo systemctl daemon-reload` first"
      - "Timers can't be enabled: they start at boot by themselves"
    answer: 0
    explain: >-
      `systemctl` reads a bare name as a service. The service is meant to have no `[Install]`:
      the timer starts it. Enable the timer, written in full: `sudo systemctl enable --now
      tank-log.timer`.
  - type: choice
    q: "A timer has `OnCalendar=Mon *-*-* 06:00:00` and `Persistent=true`. The station is powered down from Sunday night until Monday 08:00. What happens?"
    options:
      - "The job runs once, soon after the station is back up on Monday"
      - "Nothing until the following Monday at 06:00"
      - "It runs at 06:00 on Monday anyway, since the time is saved on disk"
      - "It runs once for every minute the station was down"
    answer: 0
    explain: >-
      `Persistent=true` remembers when the timer last ran, so a run missed while the machine (or
      the timer) was down happens once, as soon as the timer starts again. Without it, the job
      waits for next Monday, which is what cron does too.
  - type: choice
    q: "A timer's service has this line. What happens when it runs?"
    code: |-
      ExecStart=/usr/local/sbin/tank-log >/dev/null 2>&1
    options:
      - "`tank-log` gets `>/dev/null` and `2>&1` as two arguments: there's no shell to redirect anything"
      - "Its output is thrown away, as in cron"
      - "systemd refuses to load the unit"
      - "Its output goes to a file called `/dev/null`"
    answer: 0
    explain: >-
      `ExecStart=` runs the program directly, not through a shell, so redirections aren't
      redirections: they're just more words passed to the program. Leave them out, and what the
      job prints goes to the journal, where you want it.
  - type: fill
    q: "What `Type=` goes in the `[Service]` section of a job that runs, does its work and exits?"
    answer: ["oneshot", "Type=oneshot"]
    explain: >-
      `oneshot`. systemd then waits for the program to finish, counts the run as done when it
      exits with status 0, and shows the service as `inactive (dead)` until the next run.
cards:
  - id: timer-two-units
    section: "A timer is two units"
    front: A systemd timer is two unit files, `NAME.timer` and `NAME.service`. What does each say?
    back: "The `.timer` says **when** (`OnCalendar=`); the `.service` says **what** (`ExecStart=`, `User=`). The timer starts the service with its name."
  - id: cron-to-oncalendar
    section: "`OnCalendar=` next to cron"
    accept: ["*-*-* 02:15:00", "OnCalendar=*-*-* 02:15:00"]
    front: "The cron time `15 2 * * *` (every day at 02:15), as an `OnCalendar=` value"
    back: "`*-*-* 02:15:00`: cron puts the minute first; `OnCalendar=` writes the time as hours, minutes, seconds"
  - id: persistent-true
    section: "`Persistent=true`: catching up"
    front: What does `Persistent=true` do in a `[Timer]` section?
    back: If a run was missed while the machine or the timer was down, it runs once as soon as the timer starts again. Cron just skips it.
  - id: enable-the-timer
    section: "Turning it on, and checking"
    accept: ["sudo systemctl enable --now NAME.timer"]
    front: "Start a new timer, called NAME, now and at every boot"
    back: "`sudo systemctl enable --now NAME.timer`, with `.timer` written out: a bare `NAME` means the service"
terminal:
  task: |
    The scrubber filter report runs from a cron file, **`/etc/cron.d/filter-report`**. Read it,
    then move the job to systemd:

    - **`/etc/systemd/system/filter-report.service`** runs the same program, as the same
      account, as a job that runs and finishes, and **throws nothing away**.
    - **`/etc/systemd/system/filter-report.timer`** starts it on **the same schedule**,
      **catches up on a run the station missed** while it was down, and can be enabled.
    - The timer is **active now and enabled**, so `systemctl list-timers` shows it.
    - The cron file is **gone**, so the report doesn't run twice.

    Your password for `sudo` is `meridian`.
  cwd: /home/cadet
  groups: [sudo]
  password: meridian
  accounts:
    - {name: scrubber, uid: 990, comment: Scrubber controller, home: /var/lib/scrubber}
    - {name: airlab, uid: 993, comment: Air sampling, home: /var/lib/airlab}
  services:
    - name: scrubberd.service
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
    - name: air-sample.service
      state: inactive
      unit: |
        [Unit]
        Description=Life support: air sample

        [Service]
        Type=oneshot
        ExecStart=/usr/local/sbin/air-sample
        User=airlab
    - name: air-sample.timer
      enabled: true
      unit: |
        [Unit]
        Description=Life support: air sample every night

        [Timer]
        OnCalendar=*-*-* 03:00:00
        Persistent=true

        [Install]
        WantedBy=timers.target
  files:
    - {path: /home/cadet, type: dir}
    - {path: /usr/local/sbin/scrubberd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/air-sample, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/filter-report, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - path: /etc/cron.d/filter-report
      owner: root
      group: root
      contents: |
        # Scrubber filter wear report, for the Monday crew briefing.
        30 6 * * 1 scrubber /usr/local/sbin/filter-report >/dev/null 2>&1
  checks:
    - {contains: /etc/systemd/system/filter-report.service, text: "ExecStart=/usr/local/sbin/filter-report"}
    - {contains: /etc/systemd/system/filter-report.service, text: "User=scrubber"}
    - {contains: /etc/systemd/system/filter-report.service, text: "Type=oneshot"}
    - {lacks: /etc/systemd/system/filter-report.service, text: "/dev/null"}
    - {contains: /etc/systemd/system/filter-report.timer, text: "OnCalendar=Mon *-*-* 06:30"}
    - {contains: /etc/systemd/system/filter-report.timer, text: "Persistent=true"}
    - {active: filter-report.timer}
    - {enabled: filter-report.timer}
    - {missing: /etc/cron.d/filter-report}
  success: |-
    Okafor reads the timer's next run off your screen. "Monday, 06:30. And if it fails, it'll say so where we can read it."
  solution:
    - cat /etc/cron.d/filter-report
    - echo '[Unit]' | sudo tee /etc/systemd/system/filter-report.service
    - meridian
    - "echo 'Description=Life support: scrubber filter report' | sudo tee -a /etc/systemd/system/filter-report.service"
    - echo '[Service]' | sudo tee -a /etc/systemd/system/filter-report.service
    - echo 'Type=oneshot' | sudo tee -a /etc/systemd/system/filter-report.service
    - echo 'ExecStart=/usr/local/sbin/filter-report' | sudo tee -a /etc/systemd/system/filter-report.service
    - echo 'User=scrubber' | sudo tee -a /etc/systemd/system/filter-report.service
    - echo '[Unit]' | sudo tee /etc/systemd/system/filter-report.timer
    - "echo 'Description=Life support: scrubber filter report, Mondays' | sudo tee -a /etc/systemd/system/filter-report.timer"
    - echo '[Timer]' | sudo tee -a /etc/systemd/system/filter-report.timer
    - echo 'OnCalendar=Mon *-*-* 06:30:00' | sudo tee -a /etc/systemd/system/filter-report.timer
    - echo 'Persistent=true' | sudo tee -a /etc/systemd/system/filter-report.timer
    - echo '[Install]' | sudo tee -a /etc/systemd/system/filter-report.timer
    - echo 'WantedBy=timers.target' | sudo tee -a /etc/systemd/system/filter-report.timer
    - sudo systemctl daemon-reload
    - sudo systemctl enable --now filter-report.timer
    - sudo rm /etc/cron.d/filter-report
    - systemctl list-timers
comms:
  open:
    - {from: meridian, text: "/ETC/CRON.D/FILTER-REPORT · WEEKLY · OUTPUT: DISCARDED · LAST RUN: UNKNOWN"}
    - {from: okafor, text: "The filter report didn't make Monday's briefing. Did it run? Did it fail? That line throws away everything it says, so we can't tell."}
    - {from: okafor, text: "Make it a timer. Same time, same account, nothing thrown away."}
  console_done:
    - {from: meridian, text: "FILTER-REPORT.TIMER · ACTIVE (WAITING) · ENABLED · NEXT: MON 2026-10-12 06:30 · PERSISTENT · CRON.D ENTRY: REMOVED"}
    - {from: okafor, text: "Good. When it fails now, it fails out loud."}
  complete:
    - {from: okafor, text: "A cron job that throws its output away leaves nothing behind. Not when it fails, and not when it does something it shouldn't."}
    - {from: okafor, text: "Tomorrow we read the journal. All of it, back to the night of the outage."}
---

## Reading a cron line

Before timers, scheduled jobs on Linux were **cron** jobs, and most servers still have some.
A file in **`/etc/cron.d/`** holds one job per line: five time fields, the account to run it
as, then the command.

```text
15 2 * * * water /usr/local/sbin/tank-log >/dev/null 2>&1
```

| Field | Here | Means |
|---|---|---|
| minute | `15` | at minute 15 (0–59) |
| hour | `2` | of hour 2: so 02:15 (0–23) |
| day of month | `*` | `*` means any |
| month | `*` | any |
| day of week | `*` | any. **`1` is Monday through `6` Saturday; Sunday is `0` or `7`** |
| account | `water` | **who it runs as** |
| command | the rest | what runs |

**Cron puts the minute first**, so `45 7` is 07:45, not 45:07. `0 4 * * 0` is 04:00 every
Sunday.

The end of the line, `>/dev/null 2>&1`, is Unit 1.1's redirection: **output and errors, both
thrown away**. It keeps the job quiet, and it means that when the job fails, nothing anywhere
says so.

## A timer is two units

systemd's answer is a **timer**: a unit that starts another unit on a schedule. **A timer is two
unit files with the same name: `NAME.timer` says when, and `NAME.service` says what.**

```ini
# /etc/systemd/system/tank-log.service
[Unit]
Description=Log the water tank levels

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/tank-log
User=water
```

```ini
# /etc/systemd/system/tank-log.timer
[Unit]
Description=Log the water tank levels every night

[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

**A timer file has its own section, `[Timer]`**, where a service has `[Service]`:
`OnCalendar=` and `Persistent=` go under it.

| Line | File | Section | Why |
|---|---|---|---|
| `Type=oneshot` | the service | `[Service]` | **a job that runs and finishes**, not a daemon. Between runs it's `inactive (dead)`, and that's normal |
| `ExecStart=`, `User=` | the service | `[Service]` | the program and its account, as in module 04 |
| no `[Install]` | the service | none | **the timer starts it, so you never enable the service** |
| `OnCalendar=` | the timer | `[Timer]` | **when** |
| `Persistent=true` | the timer | `[Timer]` | catch up on a missed run (below) |
| `WantedBy=timers.target` | the timer | `[Install]` | **what lets `enable` work for a timer**. `timers.target` starts every enabled timer at boot, as `multi-user.target` does services |

The timer starts the service with its own name: `tank-log.timer` starts `tank-log.service`.

## `OnCalendar=` next to cron

`OnCalendar=` writes a date and a time the way people do, in three parts:

1. **A day of the week, if you want one: `Mon Tue Wed Thu Fri Sat Sun`.** Leave it out for
   every day.
2. **A date, `YEAR-MONTH-DAY`.** `*` means any, so **`*-*-*` is any year, any month, any day**.
3. **A time, `HOURS:MINUTES:SECONDS`**, in 24-hour time, two digits each: `02:15:00`.

So `Sun *-*-* 04:00:00` is 04:00 on any Sunday. There are words for the common ones too.

| cron | `OnCalendar=` | When |
|---|---|---|
| `15 2 * * *` | `*-*-* 02:15:00` | 02:15 every day |
| `0 4 * * 0` | `Sun *-*-* 04:00:00` | 04:00 every Sunday |
| `0 * * * *` | `hourly` | at the start of every hour |
| `0 0 * * *` | `daily` | at midnight |
| `0 0 * * 1` | `weekly` | at midnight going into Monday |
| `* * * * *` | `minutely` | at the start of every minute |
| `0 0 1 * *` | `monthly` | at midnight on the 1st |

**`OnCalendar=` can't read a cron line**: translate the fields, minute and hour swapped round.
Real systemd reads shorter forms too (`Mon 06:00` for `Mon *-*-* 06:00:00`), and
`systemd-analyze calendar 'Fri *-*-* 18:00:00'` shows when one would next run. The station
console reads only the full form, like `Mon *-*-* 06:00:00`, and the words in the table, and
doesn't have `systemd-analyze`.

## `Persistent=true`: catching up

Cron skips a run it missed: a job due at 02:15 while the machine was off just doesn't happen.
**Without `Persistent=true`, a timer skips it too.**
**With `Persistent=true`, systemd remembers when the timer last ran, and if a run was missed
while the machine or the timer was down, it runs once as soon as the timer starts again**, at
boot. One run, however many were missed. For a weekly job, it's the difference between
running a few minutes late and not for another week.

## Turning it on, and checking

Write both files as root, with `sudo nano` or `sudo tee` (module 04), then:

1. **`sudo systemctl daemon-reload`**, as for any new unit.
2. **`sudo systemctl enable --now NAME.timer`**. **Write the `.timer`**: `systemctl` reads a bare
   name as a service, and the service has no `[Install]`, so you'd get the "no installation
   config" note from module 04 and no schedule.

Then **`systemctl list-timers`** lists the running timers, soonest first:

```text
NEXT                        LEFT LAST PASSED UNIT           ACTIVATES
Fri 2026-10-09 02:15:00 UTC  17h -         - tank-log.timer tank-log.service
```

`NEXT` and `LEFT` are the next run; `LAST` and `PASSED` the last one (`-` before it has ever
run). `--all` adds stopped timers. **`systemctl status NAME.timer`** says `active (waiting)`,
with the next run on its `Trigger:` line. **`systemctl list-timers NAME.timer`** lists just
that one. A timer **can fire up to a minute after its time**:
systemd groups wake-ups to save work. The station console never fires a timer, so there
`LAST` stays `-`.

**Moving a job from cron? Delete its cron file** (`sudo rm`) once the timer is running, or it
runs twice.

## Where the output goes

Whatever a service prints, output and errors, **goes to the journal**, systemd's log, with
the unit's name on every line and its start, finish and exit status around it. Module 06
reads it.

So leave the redirection out. There's another reason: **`ExecStart=` doesn't run a shell**, so
`>/dev/null 2>&1` there isn't a redirection, just two more words passed to the program.

**On the real station:** this app's droplet backs up its database with a timer
(`infra/systemd/orbit-ops-backup.timer`, #324): `OnCalendar=*-*-* 03:30:00
America/New_York` with `Persistent=true` (the last word is a time zone: without one, the
machine's own clock decides), and a `Type=oneshot` service running the backup
script as `User=deploy`. Whether last night's dump worked is in its journal, not thrown away.

## Try it

On a real Ubuntu machine with systemd (a plain Docker container doesn't run it). This timer
runs `date` once a minute, so the journal has something to show.

```bash
sudo nano /etc/systemd/system/stamp.service   # type the three lines, without the #
#   [Service]
#   Type=oneshot
#   ExecStart=/bin/date
sudo nano /etc/systemd/system/stamp.timer     # and these four
#   [Timer]
#   OnCalendar=minutely
#   [Install]
#   WantedBy=timers.target
sudo systemctl daemon-reload
sudo systemctl enable --now stamp.timer       # Created symlink …/timers.target.wants/stamp.timer
systemctl list-timers stamp.timer             # NEXT at the start of the next minute
systemctl status stamp.timer                  # active (waiting), and the Trigger: line
sleep 120; systemctl list-timers stamp.timer  # LAST is filled in: it has run
systemctl status stamp.service                # inactive (dead), status=0/SUCCESS, and TriggeredBy: names the timer
sudo journalctl -u stamp.service              # the date it printed (module 06)
systemd-analyze calendar 'Fri *-*-* 18:00'    # when that would next run
sudo systemctl disable --now stamp.timer
sudo rm /etc/systemd/system/stamp.service /etc/systemd/system/stamp.timer && sudo systemctl daemon-reload
```
