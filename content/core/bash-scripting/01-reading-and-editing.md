---
title: Reading and editing on a server
minutes: 20
story: |
  **Mission log, day 11.** The CO2 in hab ring B climbed all night and no alarm sounded.
  MERIDIAN's documentation burned with the old archive, but every machine still carries its
  manual. "I'm not always awake," says Okafor. "The manual is."
quiz:
  - type: choice
    q: "You're fixing the site's Nginx config on the droplet as `deploy`, and saving fails. What went wrong, and what now?"
    code: |-
      $ nano /etc/nginx/sites-available/orbit-ops
        … you make the change, press ^O, then Enter …
      [ Error writing /etc/nginx/sites-available/orbit-ops: Permission denied ]
    options:
      - "The file belongs to root. Leave with ^X (answer N), then reopen it with `sudo nano`"
      - "nano can't write config files: make the change with `sed -i` instead"
      - "The disk is full: free some space and press ^O again"
      - "Press ^O again: nano retries as root the second time"
    answer: 0
    explain: >-
      Files under `/etc` belong to root, and nano runs as you, so it can show the file but not
      write it. `sudo nano` runs the editor as root. `sed -i` would fail the same way without
      `sudo`, and a full disk says "No space left on device", not "Permission denied".
  - type: fill
    q: "`man crontab` shows the `crontab` command. What do you type to read the format of the crontab *file* instead?"
    answer: ["man 5 crontab"]
    explain: >-
      Section 5 is file formats. `crontab(1)` is the command and `crontab(5)` is the file it
      installs: same name, different pages. Without a section number, `man` shows the first one
      it finds.
  - type: choice
    q: "You're in `less /var/log/syslog` (or in `git log`, which pages through less). How do you jump to the next line containing `error`?"
    options: ["Type `/error`, Enter, then `n` for each match after it", "Press Ctrl-F and type `error`", "Quit and run `grep error`, there's no search in less", "Type `:error`"]
    answer: 0
    explain: >-
      `/pattern` searches forward, `n` repeats it and `N` goes back. The same keys work in `man`,
      because man shows its pages in less. `grep` is fine too, but it loses the lines around the
      match that less still shows you.
  - type: choice
    q: |-
      You ran `git commit` without `-m`. The screen fills with `~` down the left edge, and
      typing does strange things. How do you get out without making the commit?
    options: ["Press Esc, then type `:q!` and Enter", "Press Ctrl-C until it stops", "Press ^X, as in nano", "Type `exit` and Enter"]
    answer: 0
    explain: >-
      That's vim. Esc gets you out of whatever mode you're in, and `:q!` quits without saving.
      Git sees a message with nothing but comments and aborts the commit. `:wq` would save and
      commit instead. Ctrl-C and `exit` do nothing useful in vim, and ^X is nano's.
  - type: multi
    q: "Which of these show a log and keep showing new lines as they're written?"
    options: ["`tail -f app.log`", "`less +F app.log`", "`head -f app.log`", "`cat app.log`"]
    answer: [0, 1]
    explain: >-
      `tail -f` follows the end of the file until Ctrl-C. `less +F` does the same, but Ctrl-C
      drops you back into less, so you can scroll and search, and `F` follows again. `head` has
      no `-f`, and `cat` prints what's there and stops.
terminal:
  task: |
    Last night the CO2 in hab ring B reached **6200 ppm** and no alarm sounded. The scrubber
    daemon, `scrubberd`, decides when the alarm goes off, and nobody remembers the setting.

    Read its manual (`man scrubberd`, then the page it sends you to) and find the setting that
    **sounds the alarm**. Then set the alarm to sound at **5000 ppm** in
    `/etc/scrubber/scrubber.conf`, and keep the settings already in it. The file belongs to
    root, so open it with `sudo nano` (your password is `meridian`).
  cwd: /home/cadet
  groups: [sudo]
  password: meridian
  files:
    - {path: /home/cadet, type: dir}
    - path: /etc/scrubber/scrubber.conf
      owner: root
      group: root
      contents: |
        # scrubberd settings. See scrubber.conf(5).
        beds = 2
        cycle_minutes = 20
        co2_warn_ppm = 4000
        log_level = info
    - path: /var/log/scrubber/scrubberd.log
      owner: root
      group: root
      contents: |
        2026-10-07 22:00:00 scrubberd started: 2 beds, 20-minute cycle
        2026-10-07 23:40:00 ring-b CO2 3100 ppm
        2026-10-08 00:20:00 ring-b CO2 3900 ppm
        2026-10-08 01:00:00 ring-b CO2 4600 ppm: over co2_warn_ppm (4000)
        2026-10-08 01:40:00 ring-b CO2 5400 ppm: over co2_warn_ppm (4000)
        2026-10-08 02:14:00 ring-b CO2 6200 ppm: over co2_warn_ppm (4000)
        2026-10-08 02:30:00 bed 2 regenerated, ring-b CO2 falling
    - path: /usr/share/man/man8/scrubberd.8
      owner: root
      group: root
      contents: |
        SCRUBBERD(8)             System Manager's Manual             SCRUBBERD(8)

        NAME
               scrubberd - CO2 scrubber control daemon

        SYNOPSIS
               scrubberd [-f] [-c FILE]

        DESCRIPTION
               scrubberd runs the station's carbon dioxide scrubbers. It reads the
               CO2 sensor in every compartment, cycles the scrubber beds, and decides
               when the cabin alarm sounds.

               It reads its settings from /etc/scrubber/scrubber.conf when it starts,
               and again whenever the file changes. The settings, and what each one
               does, are in scrubber.conf(5).

        OPTIONS
               -c FILE
                      Read the settings from FILE instead of
                      /etc/scrubber/scrubber.conf.

               -f     Stay in the foreground and log to the terminal.

        FILES
               /etc/scrubber/scrubber.conf
                      The settings. See scrubber.conf(5).

               /var/log/scrubber/scrubberd.log
                      What the daemon did, and when.

        SEE ALSO
               scrubber.conf(5)

        Meridian station                 2026-03-14                  SCRUBBERD(8)
    - path: /usr/share/man/man5/scrubber.conf.5
      owner: root
      group: root
      contents: |
        SCRUBBER.CONF(5)           File Formats Manual           SCRUBBER.CONF(5)

        NAME
               scrubber.conf - settings for the CO2 scrubber daemon

        DESCRIPTION
               scrubberd(8) reads /etc/scrubber/scrubber.conf when it starts and
               whenever the file changes. Each line is one setting:

                   name = value

               Lines starting with # are comments. A setting that isn't in the file
               takes its default.

        SETTINGS
               beds = N
                      How many scrubber beds run at once. Default: 2.

               cycle_minutes = N
                      How long a bed absorbs CO2 before it's regenerated.
                      Default: 20.

               co2_warn_ppm = N
                      Write a warning to the log when any compartment's CO2
                      reaches N parts per million. Nothing sounds: it's for
                      whoever reads the log. Default: 4000.

               co2_alarm_ppm = N
                      Sound the cabin alarm when any compartment's CO2 reaches
                      N parts per million. Default: 8000.

               log_level = debug|info|warn
                      How much to write to /var/log/scrubber/scrubberd.log.
                      Default: info.

        EXAMPLE
               Run three beds, and sound the alarm at 6000 ppm:

                   beds = 3
                   co2_alarm_ppm = 6000

        SEE ALSO
               scrubberd(8)

        Meridian station                 2026-03-14              SCRUBBER.CONF(5)
  checks:
    - {contains: /etc/scrubber/scrubber.conf, text: "co2_alarm_ppm = 5000"}
    - {contains: /etc/scrubber/scrubber.conf, text: "co2_warn_ppm = 4000"}
    - {contains: /etc/scrubber/scrubber.conf, text: "beds = 2"}
  success: |-
    The daemon rereads its settings. "Five thousand," Okafor says. "If ring B gets there again, everyone on the station will know."
  solution:
    - man scrubberd | grep scrubber.conf
    - man 5 scrubber.conf | grep alarm
    - echo 'co2_alarm_ppm = 5000' | sudo tee -a /etc/scrubber/scrubber.conf
    - meridian
    - cat /etc/scrubber/scrubber.conf
comms:
  open:
    - {from: meridian, text: "HAB RING B · CO2 6200 PPM AT 02:14 · NO ALARM RAISED"}
    - {from: okafor, text: "The scrubbers wrote a warning in their log. Nobody hears a log."}
    - {from: okafor, text: "MERIDIAN's documentation burned with the old archive. But every machine still carries its manual."}
    - {from: okafor, text: "Learn to read it. I'm not always awake. The manual is."}
  console_done:
    - {from: meridian, text: "SCRUBBERD · SETTINGS RELOADED · CO2 ALARM AT 5000 PPM"}
    - {from: okafor, text: "That warning setting fooled whoever set this up. You read past it. Good."}
  complete:
    - {from: okafor, text: "While you were in the manual, the scrubber controller started complaining about its disk."}
    - {from: okafor, text: "That's tomorrow's job. Get some sleep."}
cards:
  - id: man-sections
    front: "man sections 1, 5 and 8"
    back: "1: commands. 5: file formats, like config files. 8: admin commands and daemons. `man 5 crontab` reads the crontab file's page."
  - id: search-in-less
    front: Search in less (and in man)
    back: "`/pattern` then Enter; `n` for the next match, `N` for the one before. `q` quits."
  - id: save-in-nano
    front: Save and leave in nano
    back: "^O then Enter writes the file. ^X exits, and asks first if there are unsaved changes."
  - id: escape-vim
    front: Get out of vim without saving
    back: "Esc, then `:q!` and Enter. (`:wq` saves and quits.)"
---

## When you don't remember the flag

Nobody remembers every option. People who are good at this know where to look, and the answer
is already on the machine.

| Ask | For | Example |
|---|---|---|
| `CMD --help` | a command's quick summary, printed straight out | `ls --help \| head` |
| `help NAME` | bash's builtins, which have no man page | `help cd` |
| `man CMD` | the full manual page, in a pager | `man tail` |

## Reading a man page

Every page has the same shape, so after a few you can skim any of them:

- **NAME**: one line on what it is.
- **SYNOPSIS**: how to call it. `[brackets]` are optional and `...` means "one or more".
  `tail [OPTION]... [FILE]...` takes any number of options and files.
- **DESCRIPTION** and **OPTIONS**: the detail.
- **FILES**: where it keeps its settings and logs. This is often the section you came for.
- **SEE ALSO**: the related pages.

A man page is shown in **less** (below), so `/pattern` searches it and `q` quits.

The manual is split into **sections**, and two pages can share a name:

| Section | Holds | Example |
|---|---|---|
| 1 | commands anyone can run | `man 1 crontab`: the `crontab` command |
| 5 | file formats | `man 5 crontab`: the file `crontab -e` edits |
| 8 | admin commands and daemons | `man 8 cron`: the daemon that runs it |

That's what the number in `crontab(5)` means. With no number, `man` shows the first page it
finds. A daemon's page usually points you at its config file's page in section 5 under SEE
ALSO, and that's the page you need to change a setting.

## less: reading long files

`less` shows a file a screen at a time, and nothing you press in it can change the file.

| Key | Does |
|---|---|
| Space / `b` | forward / back a screen |
| `g` / `G` | the start / the end |
| `/error` then Enter | search forward; `n` next match, `N` the one before |
| `q` | quit |
| `F` | follow: keep showing new lines as they arrive (Ctrl-C stops) |

`less +F app.log` opens a log already following. `tail -f app.log` does the same without the
pager, and `tail -n 50` prints the last fifty lines and stops. `head -n 20` is the same from the
top.

**On the real station:** `git log`, `journalctl` and `man` all page through less, so these keys
work in all of them. `docker compose logs -f web` follows Orbit Ops's log on the droplet the way
`tail -f` follows a file.

## nano: editing a file

`nano FILE` opens the file, or a new one if it isn't there. You type straight in, and the
commands are along the bottom of the screen. `^` means Ctrl:

| Keys | Does |
|---|---|
| ^O, then Enter | write the file (it asks for the name, and offers the current one) |
| ^X | exit; if there are unsaved changes it asks first (Y, N or ^C) |
| ^W | search ("Where Is") |
| ^K / ^U | cut the current line / paste it back |

Files under `/etc` belong to root, so `nano` can open them for reading but can't save them.
Open them with `sudo nano /etc/…`, and make a copy first if the change is big:
`sudo cp scrubber.conf scrubber.conf.bak`.

In the station console, nano writes, exits, cuts and pastes, but has no search. Find the line
with `less` or `grep -n` first.

**On the real station:** setting up the droplet, the RUNBOOK writes `.env` with
`umask 077 && $EDITOR .env`: an editor opened through the `EDITOR` variable from day 9. `crontab -e` and `git commit`
(without `-m`) open it the same way.

## Enough vim to escape

Sooner or later something opens **vim** without asking: `git commit` on a Mac, `crontab -e` on a
machine where someone chose it, or `vi` out of habit. You don't need to learn it today. You need
to leave it:

| Type | Does |
|---|---|
| Esc | stop typing text and go back to commands |
| `:q!` then Enter | quit **without** saving |
| `:wq` then Enter | save and quit |

To stop it happening, put `export EDITOR=nano` in your `~/.bashrc`. Git, crontab and most other
tools use whatever `EDITOR` names (unless `VISUAL` is set: it wins).

## Try it

On a server or a VM (a Docker container leaves the manual out, so `man` finds nothing there):

```bash
ls --help | head -n 3            # the quick summary
help cd | head -n 2              # a builtin: help, not man
man 5 crontab                    # the file's page: /minute to search, n, then q
less /etc/passwd                 # Space, b, /root, then q
nano ~/notes.txt                 # type a line, ^O Enter to write, ^X to leave
cat ~/notes.txt                  # your line, saved
tail -n 3 /etc/passwd            # the last three accounts
vi ~/notes.txt                   # practise escaping once: Esc, :q!, Enter
```
