---
title: Writing a service
minutes: 20
story: |
  **Mission log, day 42.** The new O2 monitor arrived without a unit file. Its program runs, and
  every so often it crashes, and right now the only thing that brings it back is whoever
  notices the alarm. "Nothing on this station runs without a unit file," says Okafor. "Write
  one, and make it get up by itself."
quiz:
  - type: choice
    q: "You've just saved this file. What's missing before it runs and starts at every boot?"
    code: |-
      $ cat /etc/systemd/system/uplink.service
      [Unit]
      Description=Long-range uplink

      [Service]
      ExecStart=/usr/local/sbin/uplinkd
      User=uplink
      Restart=on-failure

      [Install]
      WantedBy=multi-user.target
    options:
      - "`sudo systemctl daemon-reload`, then `sudo systemctl enable --now uplink`"
      - "Nothing: systemd starts files in `/etc/systemd/system` by itself"
      - "`sudo systemctl restart systemd`"
      - "A reboot, and nothing else"
    answer: 0
    explain: >-
      A saved file does nothing on its own. `daemon-reload` makes systemd read the unit files
      again, and `enable --now` makes the boot link and starts it. (Rebooting would load the
      file, but without `enable` nothing would start it.)
  - type: choice
    q: "A service has `Restart=on-failure`. Which of these does systemd restart it after?"
    options:
      - "Its program crashing, or exiting with a non-zero status"
      - "`sudo systemctl stop NAME`"
      - "Its program exiting with status 0"
      - "All of them"
    answer: 0
    explain: >-
      `on-failure` restarts it when it fails: a non-zero exit, or a crash (a kill by a signal
      it didn't ask for). A clean exit (status 0) and a `systemctl stop` aren't failures, so it stays down.
      `Restart=always` would bring it back after a clean exit too, but never after a `stop`.
  - type: choice
    q: "You started your new service and it failed straight away. What's wrong?"
    code: |-
      $ systemctl status uplink
      × uplink.service - Long-range uplink
           Loaded: loaded (/etc/systemd/system/uplink.service; enabled; preset: enabled)
           Active: failed (Result: exit-code) since Thu 2026-10-08 09:02:11 UTC; 3s ago
         Main PID: 2210 (code=exited, status=217/USER)
    options:
      - "`User=` names an account that doesn't exist on this machine"
      - "The program crashed with exit status 217"
      - "The unit file is in the wrong directory"
      - "It needs `sudo`"
    answer: 0
    explain: >-
      `217/USER` is systemd's own code: it couldn't switch to the user `User=` names, so the
      program never ran. `203/EXEC` is its sibling: the program in `ExecStart=` isn't there or
      can't run. Fix the file, `daemon-reload`, and start it again.
  - type: multi
    q: "Which lines does a minimal service that should start at boot need?"
    options: ["`ExecStart=`", "`WantedBy=`", "`Restart=`", "`Environment=`"]
    answer: [0, 1]
    explain: >-
      `ExecStart=` is the program, so without it there's no service (systemd refuses the unit).
      `WantedBy=` in `[Install]` is what `enable` needs. `Restart=` and `Environment=` are
      optional: add them when the service needs them.
  - type: fill
    q: "Which `Restart=` value brings a service back after a crash but not after a clean exit?"
    answer: ["on-failure", "Restart=on-failure"]
    explain: >-
      `on-failure`. The default is `no`, and `always` restarts after a clean exit too. Pair it
      with `RestartSec=` to wait a few seconds before each try.
cards:
  - id: new-unit-steps
    section: "Loading it"
    front: You've written a new unit file. What runs it now and at every boot?
    back: "`sudo systemctl daemon-reload`, then `sudo systemctl enable --now NAME`"
  - id: restart-on-failure
    section: "`Restart=`: getting up by itself"
    accept: ["Restart=on-failure"]
    front: The `[Service]` line that brings a crashed service back
    back: "`Restart=on-failure` (with `RestartSec=` for the wait between tries)"
  - id: exit-217-203
    section: "Loading it"
    front: "`status=217/USER` and `status=203/EXEC`: what do they mean?"
    back: "217: the `User=` account doesn't exist. 203: the `ExecStart=` program isn't there or can't run."
  - id: sudo-tee
    section: "Where your unit goes"
    accept: ["echo 'LINE' | sudo tee -a FILE", "echo \"LINE\" | sudo tee -a FILE"]
    front: "Append a line to a root-owned FILE (write the line as LINE)"
    back: "`echo 'LINE' | sudo tee -a FILE` (`sudo echo 'LINE' >> FILE` fails: the redirect isn't run as root)"
terminal:
  task: |
    The O2 monitor's program is `/usr/local/sbin/o2-monitor`, and it has a service account,
    `o2mon`. Write its unit file, **`/etc/systemd/system/o2-monitor.service`**, so that:

    - it's described as `Life support: O2 monitor`,
    - it runs the program **as `o2mon`**,
    - the program gets the setting **`O2_FLOOR_PCT=19.5`** in its environment, on a line of
      its own (that's the oxygen level, in percent, that sounds the alarm),
    - it **comes back by itself when it fails** (a crash or an error exit, but not a clean
      exit), after 5 seconds,
    - and it can be enabled to start at boot like the other services.

    Then load it, and get it **running now and starting at every boot**. Your password for
    `sudo` is `meridian`. (The program crashes now and then. To watch your unit bring it back,
    note its `Main PID` and `since` time, `sleep 700`, then look again: both have changed.)
  cwd: /home/cadet
  groups: [sudo]
  password: meridian
  accounts:
    - {name: scrubber, uid: 990, comment: Scrubber controller, home: /var/lib/scrubber}
    - {name: o2mon, uid: 994, comment: O2 monitor, home: /var/lib/o2mon}
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
    - name: o2-monitor.service
      state: inactive
      exits: 1
      runs_for: 600
  files:
    - {path: /home/cadet, type: dir}
    - {path: /usr/local/sbin/scrubberd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/o2-monitor, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
  checks:
    - {contains: /etc/systemd/system/o2-monitor.service, text: "Description=Life support: O2 monitor"}
    - {contains: /etc/systemd/system/o2-monitor.service, text: "ExecStart=/usr/local/sbin/o2-monitor"}
    - {contains: /etc/systemd/system/o2-monitor.service, text: "User=o2mon"}
    - {contains: /etc/systemd/system/o2-monitor.service, text: "Environment=O2_FLOOR_PCT=19.5"}
    - {contains: /etc/systemd/system/o2-monitor.service, text: "Restart=on-failure"}
    - {contains: /etc/systemd/system/o2-monitor.service, text: "RestartSec=5"}
    - {active: o2-monitor.service}
    - {enabled: o2-monitor.service}
  success: |-
    The O2 monitor's light goes green. Okafor watches it for a long moment. "It'll fall over tonight, and get straight back up. That's all I ever wanted from it."
  solution:
    - echo '[Unit]' | sudo tee /etc/systemd/system/o2-monitor.service
    - meridian
    - "echo 'Description=Life support: O2 monitor' | sudo tee -a /etc/systemd/system/o2-monitor.service"
    - echo '[Service]' | sudo tee -a /etc/systemd/system/o2-monitor.service
    - echo 'ExecStart=/usr/local/sbin/o2-monitor' | sudo tee -a /etc/systemd/system/o2-monitor.service
    - echo 'User=o2mon' | sudo tee -a /etc/systemd/system/o2-monitor.service
    - echo 'Environment=O2_FLOOR_PCT=19.5' | sudo tee -a /etc/systemd/system/o2-monitor.service
    - echo 'Restart=on-failure' | sudo tee -a /etc/systemd/system/o2-monitor.service
    - echo 'RestartSec=5' | sudo tee -a /etc/systemd/system/o2-monitor.service
    - echo '[Install]' | sudo tee -a /etc/systemd/system/o2-monitor.service
    - echo 'WantedBy=multi-user.target' | sudo tee -a /etc/systemd/system/o2-monitor.service
    - sudo systemctl daemon-reload
    - sudo systemctl enable --now o2-monitor
    - sleep 700
    - systemctl status o2-monitor
comms:
  open:
    - {from: meridian, text: "O2-MONITOR · PROGRAM PRESENT · UNIT FILE: NONE · RESTARTS TODAY (MANUAL): 3"}
    - {from: okafor, text: "Three times today somebody heard the O2 alarm go quiet and restarted that monitor by hand. I'd like it to be zero."}
    - {from: okafor, text: "Write it a unit file. Its own account, its alarm setting, and it gets back up when it falls over."}
  console_done:
    - {from: meridian, text: "O2-MONITOR.SERVICE · ACTIVE · ENABLED · USER: O2MON · RESTART: ON-FAILURE · 5 S"}
    - {from: okafor, text: "That's the first unit on this station a crew member wrote. Good."}
  complete:
    - {from: okafor, text: "Next, the clock. Half the jobs on this station are cron lines nobody can see. systemd has timers, and they log."}
---

## Where your unit goes

A unit file you write goes in **`/etc/systemd/system/`**, the administrator's directory from
module 03, named after the service: `/etc/systemd/system/beacon.service`. That directory is
root's, so writing there needs `sudo`.

The easiest way is an editor. **nano** is a text editor that runs inside the terminal (Unit
1.2 covers it properly), and **`sudo nano FILE`** opens the file in nano as root (it makes the
file if it isn't there). Type the lines, then **Ctrl-O and Enter to write it, and Ctrl-X to
exit**: Ctrl-O shows the file name at the bottom, already filled in, and Enter confirms it.
Ctrl-X with changes not yet written asks Y or N first.

You can also add one line at a time with `tee` (Unit 1.1). **`echo 'LINE' | sudo tee -a FILE`
appends a line to a root-owned file**, and without `-a`, `tee` starts the file afresh. **It
prints each line back as it writes it**, so you see what went in. `sudo echo 'LINE' >> FILE`
doesn't work: the `>>` is done by your own shell, as you, before `sudo` runs anything.

## A minimal service

```ini
[Unit]
Description=Docking beacon
After=network.target

[Service]
ExecStart=/usr/local/sbin/beacond
User=beacon
Environment=BEACON_INTERVAL=5

[Install]
WantedBy=multi-user.target
```

| Line | Goes in | Why |
|---|---|---|
| `Description=` | `[Unit]` | the name `status` and `list-units` show |
| `After=network.target` | `[Unit]` | for a service that talks to the network: wait until it's up |
| `ExecStart=` | `[Service]` | **the program, by its full path**, then any options. Required |
| `User=` | `[Service]` | **its own account**, never root without a reason (module 03) |
| `Environment=NAME=value` | `[Service]` | **a setting in the program's environment**, as `export` would make one. Write each on its own line |
| `WantedBy=multi-user.target` | `[Install]` | **what lets `enable` work** |

Each key on its own line, `Key=value`, **under its section's heading**: systemd ignores a key
in the wrong section. Without an `[Install]` section, `enable` explains that the unit has "no
installation config" and makes no boot link (`--now` still starts it).

## `Restart=`: getting up by itself

With no `Restart=` line, a service whose program stops just stays stopped: `failed` if it went
wrong, as module 01's did. **`Restart=` and `RestartSec=` go in `[Service]`**, and tell systemd
to start it again:

```ini
[Service]
ExecStart=/usr/local/sbin/beacond
Restart=on-failure
RestartSec=10
```

A program ends one of three ways. A **clean exit** is exit status 0: it finished, and says it
succeeded. An **error exit** is any other status: it says it failed. A **crash** is the program
killed by a signal it didn't ask for (signals are Unit 1.1's processes module).

| `Restart=` | Restarts after |
|---|---|
| `no` | nothing: the default |
| **`on-failure`** | **a crash, or an exit with a non-zero status**, but not a clean exit |
| `always` | any of the three, a clean exit too |

**Use `on-failure` for a program that should stay down once it has finished cleanly**, and
`always` only for one that must never stop. **`RestartSec=`** is how long to wait first, in
seconds. A `systemctl stop` is never restarted, whatever `Restart=` says: you asked for it.

There's a safety catch. A service that has been started 5 times within 10 seconds and fails
again is left `failed`, so a program that dies the moment it starts doesn't loop forever. A
`RestartSec=` of a few seconds keeps a flaky service clear of that limit.

## Loading it

A saved file does nothing on its own. Two commands:

1. **`sudo systemctl daemon-reload`**: systemd reads the unit files again and finds yours.
   It prints nothing.
2. **`sudo systemctl enable --now NAME`**: the boot link, and a start (module 02).

Then **check it with `systemctl status NAME`**. If you edit the file again, `daemon-reload`
again, then `restart`: until the reload, systemd runs the old version.

If it fails straight away, the `Main PID:` line says why:

| `status=` | Means |
|---|---|
| `203/EXEC` | **the `ExecStart=` program isn't there**, or can't run: check the path |
| `217/USER` | **the `User=` account doesn't exist** |
| `1/FAILURE` (or another number) | the program itself ran and exited with that status |

A unit with no `ExecStart=` is refused outright, as a bad unit file setting.

**To see that a restart happened, compare the `Main PID` and the `since` time on the
`Active:` line** before and after: a restarted service has a new process, started at a new
time. While it waits out `RestartSec=`, `Active:` says `activating (auto-restart)`.

**On the real station:** this app has no unit file of its own, but its two Docker files say
the same things. The `Dockerfile` gives the command (`CMD`, like `ExecStart=`) and the account
(`USER appuser`, like `User=`). `docker-compose.yml` gives the settings, from the droplet's
`.env` file, which plays `Environment=`'s part, and `restart: always`, which is
`Restart=always`. When the app's process stops, Docker starts it again, as systemd would.

## Try it

On a real Ubuntu machine with systemd (a VM or a server: a plain Docker container doesn't run
systemd). This service crashes on purpose: `sh -c` runs a command line in a small shell, as
`bash -c` does, and this one waits 5 seconds and exits with status 1.

```bash
sudo nano /etc/systemd/system/flaky.service    # type the four lines below, without the #, then Ctrl-O, Enter, Ctrl-X
#   [Service]
#   ExecStart=/bin/sh -c 'sleep 5; exit 1'
#   Restart=on-failure
#   RestartSec=3
sudo systemctl daemon-reload
sudo systemctl start flaky
systemctl status flaky | head -n 4      # active (running), and its Main PID
sleep 6; systemctl status flaky | head -n 3   # activating (auto-restart): it failed, and it's coming back
sleep 4; systemctl status flaky | head -n 4   # active (running) again, with a new Main PID
sudo systemctl stop flaky                # stopped, and it stays stopped
sudo nano /etc/systemd/system/flaky.service    # add the line User=nobody-here under [Service]
sudo systemctl daemon-reload; sudo systemctl start flaky
systemctl status flaky | grep 'Main PID'      # (code=exited, status=217/USER), and Restart= keeps retrying it
sudo rm /etc/systemd/system/flaky.service && sudo systemctl daemon-reload
```
