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
| 1.4 Networking | 10 Following a connection | `scrubber-flush`, still running as root since 02:35, holds a connection to **`203.0.113.47:443`**, whose PTR record is **`relay.depot-sync.net`** (and the name points back). Mission Control's `mission.meridian` is `10.4.1.40`. Asked for `/`, the relay says `Server: depot-relay` and "awaiting controller state from meridian/scrubber-b". The crew leave the job running: it's evidence | `sudo ss -tnp` (`ss -tnp` alone doesn't name root's process), `dig -x ADDR +short`, `dig NAME +short`, `curl -v https://relay.depot-sync.net/` | written (#176) |
| 1.5 systemd | 06 The journal | The journal for 02:30–02:45 on 2026-10-08 (the previous boot: the console booted at 08:00): `CRON[5120]` starts `scrubber-flush` at 02:35:01, it logs `sending controller state to 203.0.113.47`, then `reply: FLUSH` at 02:39:58 and `stopping scrubberd.service`, and systemd logs `Stopping scrubberd.service` at 02:40:00. **The reveal**: the crew save the window as evidence, move `scrubber-maint` out of `/etc/cron.d` (kept, not deleted), restart the controller, and Mission Control names the address as not theirs and opens an inquiry into the depot's update feed. Okafor stopped `scrubberd` again at 08:06 (`sudo` in this boot's journal) until he knew | `sudo journalctl --since "2026-10-08 02:30" --until "2026-10-08 02:45" > FILE`, `-u`, `-b -1 -p warning`, `sudo mv` | written (#310) |

## How the crew carry it

- **Okafor** (he/him, decided 2026-10-17, #207) suspects early and says little. He keeps evidence rather than deleting it ("If
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

# Cargo & Fabrication: the manifest discrepancies

The thread for Unit 2.1 (#395), planned on 2026-11-05 and not yet written. The Life Support rule
holds: the learner finds each clue with the unit's own tools, and the crew only react.

## What happened (kept open past this unit)

The depot shipment of **2026-09-30**, the day the poisoned update came aboard, also delivered **a
crate its manifest doesn't list**. The bay logged it, nobody asked why, and it has sat in the hold
since. Okafor keeps it sealed: "If it's what I think it is, it's evidence."

Unit 2.1 shows that the depot's records and what arrived disagree, and only for that shipment. It
doesn't say what's in the crate, who sent `FLUSH`, or how the update got through. Those stay open
for **Unit 4.5 (DevSecOps: supply chain)**.

## The clues

| Unit | Module | The clue | What finds it | Status |
|---|---|---|---|---|
| 2.1 Python | 05 Files and paths | The 2026-09-30 receiving file has a crate no other record mentions | `pathlib`'s `glob`, reading each file in a loop | planned (#402) |
| 2.1 Python | 07 JSON and CSV | Comparing the depot's manifest (JSON) with what the bay received (CSV), only the 2026-09-30 shipment disagrees | `json`, `csv.DictReader`, comparing sets by key | planned (#404) |
| 2.1 Python | 12 Capstone | The reconciled record ties the mismatch to the `depot-sync` feed, and it goes to Mission Control's inquiry | The learner's own CLI: `argparse`, `requests` with retries, `logging` | planned (#409) |

The modules between them stay ordinary fabrication-bay jobs, with a line or two of comms at most.
Use only the dates and names in the Life Support section above, and put any new outside address in
`203.0.113.0/24`.
