---
title: Scheduling with cron
minutes: 20
story: |
  **Mission log, day 20.** The scripts work. `shift-check` reads the air, and `backup-logs` fails
  out loud. But someone still has to remember to run them, and at 02:30 nobody does. "The station
  doesn't sleep," says Okafor. "Make it do its own rounds."
quiz:
  - type: choice
    q: "When does this job run?"
    code: |-
      30 2 * * 1-5 /usr/local/bin/backup.sh
    options:
      - "At 02:30, Monday to Friday"
      - "Every 30 minutes, from 02:00 to 05:00"
      - "At 30 past every hour on the 2nd of each month"
      - "At 02:30 on the 1st to the 5th of each month"
    answer: 0
    explain: >-
      The fields are minute, hour, day of month, month, day of week. Minute 30, hour 2, any day,
      any month, days of the week 1 to 5 (Monday to Friday; 0 and 7 are Sunday).
  - type: choice
    q: "`report.sh` works when you run it. Under cron it fails every time. What's the likeliest reason?"
    code: |-
      $ crontab -l
      0 6 * * * report.sh >> /var/log/report.log 2>&1
      $ tail -n 1 /var/log/report.log
      /bin/sh: 1: report.sh: not found
    options:
      - "Cron's PATH has only the system directories, so it can't find `report.sh` by name. Use its full path"
      - "Cron can't run scripts, only commands"
      - "The job needs `sudo`"
      - "`>>` doesn't work in a crontab"
    answer: 0
    explain: >-
      Cron runs jobs with a small environment: a short PATH of system directories, `sh` as the
      shell, none of your `~/.bashrc`. Your PATH found `report.sh`; cron's doesn't. Full paths fix
      it, for the script and for anything it needs.
  - type: choice
    q: "What does `*/15` mean in the minute field?"
    options: ["Minutes 0, 15, 30 and 45", "Once, 15 minutes after cron starts", "Minute 15 only", "Every minute for 15 minutes"]
    answer: 0
    explain: >-
      `*/N` is every Nth value of the field's range, starting from its first: 0, 15, 30, 45. It's
      the same as writing the list `0,15,30,45`.
  - type: choice
    q: "A job has no redirect. Where does its output go?"
    code: |-
      */5 * * * * /station/bin/shift-check
    options:
      - "Cron tries to email it to the user, and on most servers nobody ever reads it"
      - "To the terminal of whoever is logged in"
      - "To `/var/log/cron.log`"
      - "Nowhere: cron jobs can't print"
    answer: 0
    explain: >-
      There's no terminal under cron. Output is mailed to the crontab's owner, which usually
      means it's lost. Append it to a log with `>> FILE 2>&1`, so errors are kept too.
  - type: fill
    q: "Which command lists your crontab without opening an editor? (`crontab __`)"
    answer: ["-l"]
    explain: >-
      `crontab -l` prints it, and `crontab -e` opens it in your editor and checks it when you
      save. `crontab -r` deletes it, with no undo, and `r` is right next to `e`.
cards:
  - id: cron-fields
    section: "The five fields"
    front: The five fields of a crontab line, in order
    back: "Minute, hour, day of month, month, day of week. Then the command."
  - id: cron-step
    section: "The five fields"
    accept: ["*/15 * * * *"]
    front: "Every 15 minutes, in cron"
    back: "`*/15 * * * *`"
  - id: cron-environment
    section: "Cron's environment is not yours"
    front: Why does a script that works by hand fail under cron?
    back: "Cron's environment is small: a PATH of system directories only, `sh`, no `~/.bashrc`, no terminal. Use full paths."
  - id: cron-logging
    section: "Keep what jobs say"
    front: Keep a cron job's output and errors
    back: "Append both to a log: `… >> /var/log/job.log 2>&1`."
terminal:
  task: |
    **First, check the night.** Before you add a job at 02:30, find out what this machine already
    runs between 02:00 and 02:59. Copy the line of **every system job that starts in that hour**
    into `~/night-jobs.txt`.

    Then put both routines on a schedule, in your crontab (`crontab -e`, or write a file and load
    it with `crontab FILE`):

    - **`shift-check` every 15 minutes**, using a step in the minute field;
    - **`backup-logs` every night at 02:30**.

    Each job appends **both its output and its errors** to its own log in `/var/log/routines`:
    `shift-check.log` and `backup-logs.log`, written as `>> /var/log/routines/NAME.log 2>&1`.
    Remember whose PATH cron has.

    Before you trust a job to run at 02:30, **run its command once by hand, exactly as the
    crontab says**, and check its log. Nothing actually runs on a schedule in the station console,
    so this is the only run you'll see.
  cwd: /home/cadet
  env: {PATH: "/station/bin:/usr/local/bin:/usr/bin:/bin"}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /station/bin, type: dir, owner: root, group: crew, mode: "775"}
    - path: /station/bin/shift-check
      mode: "775"
      group: crew
      contents: |
        #!/usr/bin/env bash
        # The shift check: air, scrubbers, disk.
        cat /station/sensors/o2
        tail -n 1 /var/log/scrubber/scrubberd.log
        df -h /
    - path: /station/bin/backup-logs
      mode: "775"
      group: crew
      contents: |
        #!/usr/bin/env bash
        # backup-logs: archive the scrubber logs, then tidy up.
        set -euo pipefail

        dest=${BACKUP_DEST:-/srv/backups}
        archive="$dest/scrubber-logs.tar.gz"
        work=$(mktemp -d)
        trap 'rm -rf "$work"' EXIT

        cp /var/log/scrubber/*.log "$work"/
        tar -czf "$archive" -C "$work" .
        [ -f "$archive" ]
        echo "backup complete"
    - {path: /station/sensors, type: dir, owner: root, group: root}
    - {path: /station/sensors/o2, owner: root, group: root, contents: "O2 20.8% (ring A 20.9 · ring B 20.7)\n"}
    - {path: /var/log/scrubber, type: dir, owner: root, group: root}
    - path: /var/log/scrubber/scrubberd.log
      owner: root
      group: root
      contents: |
        2026-10-08 08:25:00 scrubbers nominal: 2 beds, ring-b CO2 3300 ppm
        2026-10-08 08:55:00 scrubbers nominal: 2 beds, ring-b CO2 3250 ppm
    - {path: /var/log/scrubber/ring-a.log, owner: root, group: root, contents: "2026-10-08 08:55:00 ring-a CO2 3200 ppm\n"}
    - {path: /var/log/routines, type: dir, owner: root, group: crew, mode: "775"}
    - {path: /srv/backups, type: dir, owner: root, group: crew, mode: "775"}
    # The Life Support mystery (#84, docs/story.md): a job nobody on the crew wrote.
    - {path: /etc/cron.d, type: dir, owner: root, group: root}
    - path: /etc/cron.d/logrotate
      owner: root
      group: root
      contents: |
        # rotate the station's logs
        0 4 * * *  root  /usr/sbin/logrotate /etc/logrotate.conf
    - path: /etc/cron.d/clock-sync
      owner: root
      group: root
      contents: |
        # keep the station clock on Mission Control's time (Okafor, 2025-11)
        0 2 * * *  root  /usr/local/sbin/clock-sync
    - path: /etc/cron.d/scrubber-maint
      owner: root
      group: root
      contents: |
        # nightly controller flush. do not remove
        35 2 * * *  root  /usr/local/sbin/scrubber-flush >/dev/null 2>&1
    - {path: /usr/local/sbin, type: dir, owner: root, group: root}
    - {path: /usr/local/sbin/clock-sync, owner: root, group: root, mode: "755", contents: "#!/bin/sh\nchronyc makestep\n"}
    - {path: /usr/local/sbin/scrubber-flush, owner: root, group: root, mode: "700", contents: "#!/bin/sh\n"}
  checks:
    - {contains: /home/cadet/night-jobs.txt, text: "0 2 * * *  root  /usr/local/sbin/clock-sync"}
    - {contains: /home/cadet/night-jobs.txt, text: "35 2 * * *  root  /usr/local/sbin/scrubber-flush >/dev/null 2>&1"}
    - {contains: /var/spool/cron/crontabs/cadet, text: "*/15 * * * * /station/bin/shift-check >> /var/log/routines/shift-check.log 2>&1"}
    - {contains: /var/spool/cron/crontabs/cadet, text: "30 2 * * * /station/bin/backup-logs >> /var/log/routines/backup-logs.log 2>&1"}
    - {contains: /var/log/routines/shift-check.log, text: "O2 20.8%"}
    - {contains: /var/log/routines/backup-logs.log, text: "backup complete"}
  success: |-
    Okafor reads the crontab over your shoulder. "Every fifteen minutes, and half past two. Full paths, logs for both." Then he reads night-jobs.txt, and doesn't say anything for a while.
  solution:
    - ls /etc/cron.d
    - cat /etc/cron.d/*
    - grep ' 2 \* \* \*' /etc/cron.d/* > ~/night-jobs.txt
    - cat ~/night-jobs.txt
    - crontab -l
    - /station/bin/shift-check >> /var/log/routines/shift-check.log 2>&1
    - /station/bin/backup-logs >> /var/log/routines/backup-logs.log 2>&1
    - cat /var/log/routines/shift-check.log /var/log/routines/backup-logs.log
    - |-
      crontab - <<'EOF'
      # m h dom mon dow command
      */15 * * * * /station/bin/shift-check >> /var/log/routines/shift-check.log 2>&1
      30 2 * * * /station/bin/backup-logs >> /var/log/routines/backup-logs.log 2>&1
      EOF
    - crontab -l
comms:
  open:
    - {from: meridian, text: "ROUTINES · 2 · SCHEDULED: 0"}
    - {from: okafor, text: "`shift-check` every quarter-hour, `backup-logs` at half two. Neither of them should need one of us awake."}
    - {from: okafor, text: "And keep what they say. A job that fails at 02:30 with nobody listening is last night all over again."}
  console_done:
    - {from: meridian, text: "CRONTAB · CADET · 2 JOBS · NEXT: SHIFT-CHECK IN 15 MIN"}
    - {from: okafor, text: "Full paths, logs for both. That's a crontab I'd sign off."}
    - {from: meridian, text: "/ETC/CRON.D/SCRUBBER-MAINT · 02:35 NIGHTLY · ROOT · OUTPUT DISCARDED · AUTHOR: NONE ON RECORD"}
    - {from: okafor, text: "02:35. Five minutes before scrubber B went dark. `clock-sync` is mine. Nobody on this crew wrote that other one."}
  complete:
    - {from: meridian, text: "02:30 · BACKUP-LOGS · BACKUP COMPLETE · ARCHIVE SENT"}
    - {from: mission, text: "*Meridian*, Mission Control. Tonight's log archive arrived on schedule, and nobody had to stay up for it. That's Bash scripting done, cadet."}
    - {from: okafor, text: "The routines run themselves now. Go and get some sleep. The station's got it."}
    - {from: okafor, text: "And leave `scrubber-maint` exactly where it is. If it's what I think it is, it's evidence."}
  window: {complete: relay-pass}
---

## cron runs things on a schedule

`cron` is a small service on every Linux server. Once a minute it reads everyone's **crontab**,
a table of jobs, and runs any whose time has come. Each user has their own:

| Command | What it does |
|---|---|
| `crontab -e` | opens your crontab in your editor, and installs it when you save |
| `crontab -l` | lists it |
| `crontab FILE` | replaces it with the contents of FILE (`crontab -` reads standard input) |
| `crontab -r` | deletes it, with no undo. `r` is next to `e` on the keyboard |

## The five fields

Each line is **five time fields, then the command**:

```text
# ┌ minute (0–59)
# │ ┌ hour (0–23)
# │ │ ┌ day of month (1–31)
# │ │ │ ┌ month (1–12)
# │ │ │ │ ┌ day of week (0–7: 0 and 7 are Sunday)
  0 6 * * 1  /usr/local/bin/weekly-report
```

A job runs when **every field matches** the time. Each field can be written several ways:

| You write | Means | Example |
|---|---|---|
| `*` | every value | `*` in the hour field: every hour |
| a number | that value | `30` in the minute field: at half past |
| `a-b` | a range | `1-5` in the day-of-week field: Monday to Friday |
| `a,b,c` | a list | `0,12` in the hour field: midnight and noon |
| `*/N` | **every Nth value**, a step | `*/10` in the minute field: 0, 10, 20 … 50 |

So `0 6 * * 1` is 06:00 every Monday, and `*/10 8-17 * * 1-5` is every ten minutes during
working hours on weekdays. Lines starting with `#` are comments.

**Check the times yourself.** Many versions of cron refuse an impossible one, like minute `61`,
with `bad minute`, and so does the station console. Ubuntu 24.04's installs it without a word,
and the line simply never runs.

## System jobs: `/etc/cron.d`

Your crontab isn't the only one. Jobs that packages and admins install for the whole machine
live in **`/etc/cron.d/`**, one file per set of jobs (and in the older single file
`/etc/crontab`). They use the same five fields with one addition: **the user to run as**,
between the time and the command.

```text
# /etc/cron.d/logrotate
0 4 * * *  root  /usr/sbin/logrotate /etc/logrotate.conf
```

That's 04:00 every day, as `root`. **`crontab -l` never shows these**, so to know what a
machine does at night you have to read them:

| Command | What it shows |
|---|---|
| `ls /etc/cron.d` | the job files |
| `cat /etc/cron.d/*` | every system job, one file after another |
| `grep PATTERN /etc/cron.d/*` | the matching lines, each with **its file's name in front** (`/etc/cron.d/logrotate:0 4 * * * …`), because grep was given several files |

## Cron's environment is not yours

A job runs **without you**: no terminal, no login, and almost none of your environment:

- **`PATH` is short.** Debian's cron and Red Hat's give jobs `PATH=/usr/bin:/bin`; Ubuntu 24.04's
  passes on the cron service's own, the system directories. Your own directories, like `~/bin`
  or a project's, are on none of them, so your scripts aren't found by name. **Write full
  paths** in the crontab, and inside the scripts it runs.
- The shell is `sh`, not bash, for the crontab line itself. Your script's own shebang still
  picks bash for the script.
- Nothing from `~/.bashrc`: no aliases, no variables you set there.
- The working directory is your home directory, so relative paths point somewhere you may not
  expect.
- `%` means "new line" to cron, so a `date +%F` in a crontab line must be written `date +\%F`.

That's why a script that works perfectly by hand can fail every night under cron. To find out
first, **run the job with an environment like cron's**: `env -i` starts a command with an empty
environment, so `env -i HOME="$HOME" PATH=/usr/bin:/bin sh -c 'COMMAND'` sees roughly what a cron
job sees.

## Keep what jobs say

With no terminal, a job's output is **emailed** to the crontab's owner, and on most servers
nobody reads that mail. So **append both output and errors to a log**:

```text
*/10 * * * * /usr/local/bin/sync-mirror >> /var/log/sync-mirror.log 2>&1
```

`>>` appends, and `2>&1` (after the `>>`, day 7) sends errors to the same place. A job that
fails at 02:30 then leaves its reason where you'll find it in the morning.

**Before you trust a job, run its command by hand exactly as the crontab says:** the same
full paths, the same redirect. If it fails there, it would fail at 02:30 too, and you'd only find
out in the morning.

The station console has `crontab` and checks what you write as cron does, but nothing actually
runs on a schedule there.

**On the real station:** this app runs nothing from cron, on purpose. It's one uvicorn process
with no scheduler, to save memory on a small droplet. Your streak is worked out from your history
each time a page asks, instead of by a nightly job that could fail at 02:30 with nobody watching.
Timers that start whole services are systemd's job, in Unit 1.5.

## Try it

```bash
crontab -l > ~/crontab.saved 2>/dev/null     # keep yours: the next line replaces it
printf '*/15 * * * * /bin/date >> /tmp/when.log 2>&1\n' | crontab -
crontab -l                                    # the */15 line back
crontab ~/crontab.saved                       # yours again (empty if you had none)
cd "$(mktemp -d)"
printf '#!/bin/sh\necho "hello from my-job"\n' > my-job; chmod +x my-job
env -i HOME="$HOME" PATH=/usr/bin:/bin sh -c 'my-job'          # sh: 1: my-job: not found
env -i HOME="$HOME" PATH=/usr/bin:/bin sh -c "$PWD/my-job"     # hello from my-job
```
