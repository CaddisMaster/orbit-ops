# The Life Support mystery: why the station went dark

The thread that runs through the Life Support deck (Units 1.1–1.5, #84). Each unit's comms
carry it forward, and the deck's last module reveals it. Write a unit's clue into its content
when the unit is written. This file is the plan; the content is the record.

**The rule:** every clue is something the learner **finds with that unit's own tools**: a
command they've just been taught, run against files the console task (or the lab's setup)
provides. Never a crew member simply saying it. The crew react to what was found; they don't
find it for you.

## What happened (the answer, kept from the learner until 1.5)

On **2026-09-30** a routine update from the supply depot's package mirror came aboard. It
installed two things nobody asked for:

1. **`/etc/cron.d/scrubber-maint`**: a root cron job that runs `/usr/local/sbin/scrubber-flush`
   at **02:35 every night**, with its output thrown away (`>/dev/null 2>&1`).
2. A new **credential list for the maintenance drone MD-3**, which is why the drone spent that
   night failing to log in at the docking port. It was noise, and it hid the job's own traffic.

`scrubber-flush` sends the scrubber controller's state to an address that **isn't Mission
Control** and waits for a reply. Most nights the reply is empty. On the night of **2026-10-08**
the reply was `FLUSH`, and at **02:40** the job stopped `scrubberd` mid-cycle. Scrubber B went
offline, the backup didn't take over, and half the station went dark.

Who sent `FLUSH`, and how a poisoned update got through the depot, is left open. That's
**Unit 4.5 (DevSecOps: supply chain)**: signed packages, provenance, pinning. The answer to
"how did it get aboard" is the lesson there.

## The clues, unit by unit

| Unit | Module | The clue | What finds it | Status |
|---|---|---|---|---|
| 1.1 Linux | 01 The filesystem tree | Scrubber B went offline at **02:40** on the night of the outage | `ls`, `cd`, `cat /var/log/life-support/scrubbers.log` | written |
| 1.1 Linux | 08 Text tools: grep, sort, uniq, cut, sed, awk | The maintenance drone MD-3 (`10.4.2.17`) hammered the login from 02:11 to 02:34 with "the wrong password list". Someone gave it that list | `awk '{print $1}' … \| sort \| uniq -c \| sort -rn` | written |
| 1.2 Bash | 10 Scheduling with cron | A root job nobody on the crew wrote, **`/etc/cron.d/scrubber-maint`**, runs at **02:35**, five minutes before the outage, and throws its output away. Its script is root-only | `ls /etc/cron.d`, `cat`, `grep … /etc/cron.d/*` | written (#84) |
| 1.3 Git | 03 Reading history | In `~/meridian/station-config`, the commit that added `scrubber-maint` (`b26750b`) is by **`depot-sync`**, dated 2026-09-30, with the message "Update drone credential list". The message doesn't match the diff, which adds the cron job *and* the drone's new list | `git log -S scrubber-flush --oneline` (`-S` searches contents, so it's the command the job runs, not the file's name), `git show HASH` | written (#160) |
| 1.4 Networking | to plan | `scrubber-flush` connects to `relay.depot-sync.net`, which resolves to `203.0.113.47`, not Mission Control's address | `dig`, `ss -tnp`, `curl -v` | to write |
| 1.5 systemd | the unit's last module | The journal for 02:30–02:45 on 2026-10-08: `scrubber-flush` logs `reply: FLUSH`, then `Stopping scrubberd…` at 02:40. **The reveal**: the crew disable the job, restart the controller, and Mission Control opens an inquiry into the depot | `journalctl --since … --until …`, `journalctl -u scrubberd`, `systemctl status` | to write |

## How the crew carry it

- **Okafor** suspects early and says little. He keeps evidence rather than deleting it ("If
  it's what I think it is, it's evidence").
- **MERIDIAN** reports facts in readouts (`/ETC/CRON.D/SCRUBBER-MAINT · 02:35 · ROOT ·
  AUTHOR: NONE ON RECORD`) and never speculates.
- **Mission Control** asked for "everything from the outage" on day 2 and is running "the
  analysis" (1.1 module 02). In 1.5 they name the outside address as not theirs.
- Foreshadowing in units that are already written stays to a line or two of comms, and never
  changes a task.

## Dates and times that must agree

- Outage night: **2026-10-08**. The console's station clock starts that morning at 09:00
  (`STATION_NOW`, gotchas.md).
- Drone logins: 02:11–02:34. Job: **02:35**. Scrubber B offline: **02:40**.
- The update came aboard: **2026-09-30**.
- Addresses: the drone is `10.4.2.17`. Outside addresses use the documentation range
  `203.0.113.0/24` (RFC 5737), never a real one.
