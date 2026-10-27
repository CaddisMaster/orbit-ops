---
title: Starting, stopping and enabling
minutes: 20
story: |
  **Mission log, day 40.** Another power cycle, the same two services down. The O2 backup feed
  and the cabin fans don't crash: every morning somebody starts them by hand, and every night
  they're gone again. "Today that somebody is you," says Okafor, "and it's the last time."
quiz:
  - type: choice
    q: "After a reboot, `relay.service` is down again, though you started it yesterday. Why?"
    code: |-
      $ systemctl is-active relay
      inactive
      $ systemctl is-enabled relay
      disabled
    options:
      - "It was started but never enabled, so nothing starts it at boot: `sudo systemctl enable --now relay`"
      - "It crashed during the night: `sudo systemctl restart relay`"
      - "Its unit file was deleted by the reboot"
      - "`start` only lasts one hour"
    answer: 0
    explain: >-
      `start` runs it now, and that's all: a reboot forgets it. `disabled` says nothing starts it at
      boot. `enable` makes the link that does, and `--now` starts it in the same command. A crash
      would show `failed`, not `inactive`.
  - type: choice
    q: "You've changed a service's configuration file. It supports `reload`. Which is better, and why?"
    options:
      - "`reload`: the program rereads its configuration without stopping, so nothing it's doing is cut off"
      - "`restart`: reload doesn't really read the file"
      - "`enable`: it applies the new configuration at the next boot"
      - "`daemon-reload`: it reloads every daemon's configuration"
    answer: 0
    explain: >-
      `reload` asks the running program to reread its configuration, so its connections and work
      carry on. `restart` stops it and starts it again, which also works but drops whatever it was
      in the middle of. `enable` is about boot, not configuration, and `daemon-reload` makes
      systemd reread *unit files*, not the program's own configuration (module 03).
  - type: choice
    q: "What does this do?"
    code: |-
      $ systemctl stop relay
      Failed to stop relay.service: Interactive authentication required.
      See system logs and 'systemctl status relay.service' for details.
    options:
      - "Nothing: changing a service needs root, so it has to be `sudo systemctl stop relay`"
      - "It stopped the service, with a warning"
      - "It asked for a password and the wrong one was typed"
      - "The service refuses to be stopped"
    answer: 0
    explain: >-
      Reading a service's state is open to everyone; starting, stopping and enabling are root's.
      Without `sudo`, systemctl had no way to ask for a password here, so it refused, and the
      service is untouched.
  - type: multi
    q: "A service is stopped and disabled. Which of these leave it running now **and** starting at every boot?"
    options:
      - "`sudo systemctl enable --now NAME`"
      - "`sudo systemctl start NAME`, then `sudo systemctl enable NAME`"
      - "`sudo systemctl enable NAME`"
      - "`sudo systemctl restart NAME`"
    answer: [0, 1]
    explain: >-
      `enable --now` does both in one go, and `start` then `enable` does them one at a time.
      `enable` on its own only takes effect at the next boot, and `restart` runs it now without
      touching boot at all.
  - type: fill
    q: "Which `systemctl` command prints just `enabled` or `disabled` for a service? (Leave the service's name off.)"
    answer: ["systemctl is-enabled", "systemctl is-enabled NAME"]
    explain: >-
      `systemctl is-enabled NAME`. Its partner `systemctl is-active NAME` prints `active`,
      `inactive` or `failed`. Both print one word, with an exit status to match, which suits scripts (Unit 1.2).
cards:
  - id: start-vs-enable
    section: "Running now, or starting at boot"
    front: "`start` versus `enable`: what does each do?"
    back: "`start` runs it now, until it stops or the machine reboots. `enable` makes it start at every boot, and doesn't start it now."
  - id: enable-now
    section: "`enable` and `disable`"
    accept: ["sudo systemctl enable --now NAME", "systemctl enable --now NAME"]
    front: Start a service now and at every boot, in one command (write the service as NAME)
    back: "`sudo systemctl enable --now NAME`"
  - id: reload-vs-restart
    section: "`reload` or `restart`?"
    front: "After a config change, why prefer `reload` to `restart` when a service supports it?"
    back: "`reload` makes it reread its configuration without stopping, so connections and work in progress carry on."
  - id: interactive-auth
    section: "Why it needs `sudo`"
    front: "`Interactive authentication required.` from `systemctl stop`: what's wrong?"
    back: "Changing a service needs root, and nothing could ask for a password. Run it with `sudo`."
terminal:
  task: |
    The power cycle has knocked the station's services back to where they were yesterday. Put
    them right, for good this time:

    - The **O2 backup feed** (`o2-backup.service`) and the **cabin fans** (`cabin-fans.service`)
      must be running **and start at every boot**.
    - The **water recycler** (`recycler.service`) failed at boot. The water crew fixed its sensor
      overnight, so it only needs bringing back up.
    - Somebody started the **O2 line purge** (`o2-purge.service`), which must only ever run during
      maintenance, and left it running. Stop it, and make sure it won't start at boot.

    Leave everything else as it is. Your password for `sudo` is `meridian`.
  cwd: /home/cadet
  groups: [sudo]
  password: meridian
  services:
    - name: scrubberd.service
      enabled: true
      unit: |
        [Unit]
        Description=Life support: scrubber controller

        [Service]
        ExecStart=/usr/local/sbin/scrubberd
        ExecReload=/bin/kill -HUP $MAINPID

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
      unit: |
        [Unit]
        Description=Life support: water recycler

        [Service]
        ExecStart=/usr/local/sbin/recyclerd

        [Install]
        WantedBy=multi-user.target
    - name: co2-monitor.service
      enabled: true
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
    - name: o2-purge.service
      unit: |
        [Unit]
        Description=O2 line purge (maintenance only)

        [Service]
        ExecStart=/usr/local/sbin/o2-purge

        [Install]
        WantedBy=multi-user.target
  files:
    - {path: /home/cadet, type: dir}
    - {path: /usr/local/sbin/scrubberd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/thermal-regd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/recyclerd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/co2-monitor, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/o2-backupd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/cabin-fansd, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
    - {path: /usr/local/sbin/o2-purge, mode: "755", owner: root, group: root, contents: "#!/bin/sh\n"}
  checks:
    - {active: o2-backup.service}
    - {enabled: o2-backup.service}
    - {active: cabin-fans.service}
    - {enabled: cabin-fans.service}
    - {active: recycler.service}
    - {inactive: o2-purge.service}
    - {disabled: o2-purge.service}
    - {active: scrubberd.service}
    - {active: co2-monitor.service}
  success: |-
    Okafor checks the list twice. "Running, and they'll still be running tomorrow. Nobody walks the rounds at 08:00 any more."
  solution:
    - systemctl list-units --type=service --all
    - systemctl enable --now o2-backup
    - sudo systemctl enable --now o2-backup
    - meridian
    - sudo systemctl enable --now cabin-fans
    - sudo systemctl start recycler
    - sudo systemctl stop o2-purge
    - systemctl is-enabled o2-purge
    - systemctl is-active o2-backup cabin-fans recycler o2-purge
comms:
  open:
    - {from: meridian, text: "POWER CYCLE COMPLETE · BOOT 08:00 · O2-BACKUP · INACTIVE · CABIN-FANS · INACTIVE · RECYCLER · FAILED"}
    - {from: okafor, text: "Same two down, same as yesterday. They don't crash. Nobody ever told the station to start them."}
    - {from: okafor, text: "And someone's left the O2 purge running. That's a maintenance job. Stop it before it vents something we need."}
  console_done:
    - {from: meridian, text: "O2-BACKUP · ACTIVE · ENABLED · CABIN-FANS · ACTIVE · ENABLED · RECYCLER · ACTIVE · O2-PURGE · INACTIVE · DISABLED"}
    - {from: okafor, text: "Enabled. That's the word that was missing. Started is today; enabled is every day."}
  complete:
    - {from: okafor, text: "Next power cycle they'll come up on their own. I'll believe it when I see it, but I think they will."}
    - {from: okafor, text: "Tomorrow, the files behind all this. Every one of those services is a page of text, and you should read one."}
---

## Running now, or starting at boot

A service has two separate settings, and mixing them up is the most common mistake with
systemd:

| | Means | Set with | Check with |
|---|---|---|---|
| **active** | **running now** | `start`, `stop` | `systemctl is-active NAME` |
| **enabled** | **starts at every boot** | `enable`, `disable` | `systemctl is-enabled NAME` |

They don't depend on each other. A service can be running but not enabled (started by hand:
gone after the next reboot), or enabled but not running (it will start at boot, but someone
stopped it). **`start` doesn't enable, and `enable` doesn't start.** A service you want to keep
needs both.

`is-active` prints one word, usually `active`, `inactive` or `failed`, and `is-enabled`
usually prints `enabled` or `disabled`. Both take several names at once, one answer per line.
Given one name, the exit status is 0 for `active` or `enabled`, so a script (Unit 1.2) can test
it with `if`. (`is-enabled` also says `static` for a unit that can't be enabled at all: its file
has no `[Install]` section, the part that says what starts it at boot, module 03.)

## `start`, `stop` and `restart`

| Command | Does |
|---|---|
| `sudo systemctl start NAME` | starts it, if it isn't running |
| `sudo systemctl stop NAME` | stops it: systemd sends its program TERM, as `kill` does |
| `sudo systemctl restart NAME` | stops it and starts it again |

**They print nothing when they work.** Check with `is-active` or `status` afterwards. `start` also
brings back a **failed** service: it tries again, and if the program now runs, the state is
`active`. A stopped service is `inactive`, not `failed`: you asked for it.

## `reload` or `restart`?

You've changed a service's configuration file, and the program has to read it again. There are
two ways:

| | What happens | Use when |
|---|---|---|
| `sudo systemctl reload NAME` | **the program rereads its configuration and keeps running** | the service supports it |
| `sudo systemctl restart NAME` | the program stops and starts again, and drops what it was doing | it doesn't, or a reload isn't enough |

A reload is gentler: a web server keeps its connections open. Not every service has one; those
that don't refuse, as in `Job type reload is not applicable for unit cron.service.`, and `restart` is the
way. `systemctl cat NAME` shows whether it has one: an `ExecReload=` line (module 03).

Don't confuse either with **`systemctl daemon-reload`**, which makes systemd itself reread the
*unit files* after you edit one (module 03). It doesn't touch a program's own configuration.

## `enable` and `disable`

`enable` makes a service start at boot. It doesn't change the service at all. It makes a
**link**: a **symlink**, a tiny file that only points at another path (Unit 1.2 covers them).
In the message, the path left of `→` is the new link, and the right is the unit file it points
at:

```text
$ sudo systemctl enable beacon
Created symlink /etc/systemd/system/multi-user.target.wants/beacon.service → /usr/lib/systemd/system/beacon.service.
```

At boot, systemd brings up `multi-user.target`, and everything linked in its `.wants/`
directory comes with it. `disable` removes the link (`Removed "/etc/systemd/…"`), so it won't
start at the next boot, and leaves it running for now. **When there's nothing to change**
(`enable` on an enabled service, `disable` on a disabled one) **there's no `Created symlink`
or `Removed` line**: check with `is-enabled`.

**`--now` does both at once**: `sudo systemctl enable --now NAME` enables and starts it, and
`sudo systemctl disable --now NAME` disables and stops it.

## Why it needs `sudo`

Anyone can read a service's state. **Changing it, with `start`, `stop`, `restart`, `reload`,
`enable` or `disable`, needs root**, so put `sudo` in front:

```text
$ systemctl restart beacon
Failed to restart beacon.service: Interactive authentication required.
See system logs and 'systemctl status beacon.service' for details.
```

That's systemctl saying it had no way to ask for a password, and so nothing happened. With
`sudo`, it asks for yours. (Over an ssh session a real server may ask for a password itself;
on the station console, use `sudo`.)

**On the real station:** RUNBOOK §2 applies an Nginx change with `sudo systemctl reload
nginx`, not `restart`. As a reload, it lets visitors mid-request to Budget Buddy and this app
finish instead of cutting them off. The app's containers have no unit files to enable: `restart: always` in
`docker-compose.yml` is the same idea at Docker's level. Docker starts them whenever it starts,
and the services that have to be enabled on the droplet are the ones underneath: Docker and
Nginx.

## Try it

On a real Ubuntu machine with systemd (not a plain Docker container) and the `cron` package,
which Ubuntu Server has:

```bash
systemctl is-active cron; systemctl is-enabled cron   # active, enabled
systemctl stop cron                       # refused: Interactive authentication required. (Over ssh it may ask for a password instead: Ctrl-C, and use sudo.)
sudo systemctl stop cron
systemctl is-active cron                  # inactive
sudo systemctl restart cron; systemctl is-active cron   # silent, then active
sudo systemctl disable cron               # two "SysV" lines (cron's old-style start script, kept in step; ignore them), then Removed "…/cron.service".
sudo systemctl enable --now cron          # the SysV lines, Created symlink …, and it's started
sudo systemctl reload cron                # Job type reload is not applicable: cron has no reload
sudo systemctl reload dbus                # silent: dbus has one, and rereads its configuration
systemctl is-active cron; systemctl is-enabled cron   # active, enabled again
```
