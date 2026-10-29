# Changelog

All notable changes to Orbit Ops. The format follows [Keep a Changelog](https://keepachangelog.com);
versions follow `VERSIONING.md`. Write entries for someone reading them in a year: what changed
and why it matters, not what the diff says.

## [Unreleased]

### Changed
- The station console's timers behave the way systemd 255's do (#329). `OnCalendar=` takes
  systemd's `*:00/15` step form and refuses `*/15`, as the real one does, so a lesson can no
  longer teach a schedule a server would reject. A `Type=oneshot` service is `activating`
  while its program runs, `systemctl start` waits for it, and it finishes `inactive (dead)` with
  `status=0/SUCCESS` and the journal's `Finished` line, or fails its start out loud. A service
  shows `TriggeredBy:` for the timer that starts it, and `Triggers:` always shows `●`.
- `systemctl status` on the station console picks its journal lines as systemd 255 does (#335):
  the unit's lines from this boot, from its last start on. A unit that starts inactive now
  shows what it logged earlier in the boot, rather than nothing, and lines from the previous
  boot never appear. A service waiting to restart shows none.

## [0.13.0] — 2026-10-28

Unit 1.5, systemd & services, the last unit of the Life Support deck. The station console now
has systemd and a journal, and the deck's mystery ends: the journal from the night of the outage
shows what stopped scrubber B. The database is also dumped every night now, not only on deploy.

**Server:** no migrations and no new env vars. This is the first deploy to install
`backup_db.sh` in `/opt/orbit-ops` for the nightly timer (#324). It replaces the copy installed
by hand on 2026-10-27, which predates #326's private dumps.

### Added
- The station console has systemd (#303), for Unit 1.5: `systemctl` starts, stops, enables and
  reads units whose files are ordinary files in `/usr/lib/systemd/system` and
  `/etc/systemd/system`. Enabling makes the same `.wants/` link a real server does, a running
  service is a process `ps` can see, `Restart=on-failure` brings a crashed one back, an edited
  unit needs `daemon-reload`, and timers show their next run on the station clock. Output was
  checked against systemd 255 on Ubuntu 24.04. Tasks can check that a unit is active, inactive,
  enabled or disabled, and the server grades it from what the console reports.
- The console has a journal (#304): `journalctl` reads an exercise's log entries and what
  systemd writes as units start, stop, crash and restart, by unit, time window (`--since`,
  `--until`), priority, line count and boot, and `systemctl status` ends with the unit's
  latest lines. As on Ubuntu, reading it takes `sudo` or the `adm` group. This is where Unit
  1.5's last module finds what happened on the night of the outage.
- Unit 1.5 module 01, *What a service is* (#305), the first module of systemd & services and
  the unit's first content, so it's no longer "Coming soon". It teaches daemons, systemd as
  PID 1, unit types, `systemctl status` line by line, `list-units` with `--all` and
  `--failed`, and the difference between `inactive` (off, and nothing complains) and `failed`
  (it tried and broke). On the console, after a power cycle, you list the life-support
  services that are down and how: two crashed, and two were never started at all.
- Unit 1.5 module 02, *Starting, stopping and enabling* (#306): running now versus starting at
  boot, `start`/`stop`/`restart`, `reload` or `restart` after a config change, `enable` and
  `disable` as links in `.wants/`, `--now`, `is-active` and `is-enabled`, and why it all needs
  `sudo`. On the console, the two services somebody starts by hand every morning are enabled
  at last, the recycler comes back, and a maintenance purge left running is stopped.
- Unit 1.5 module 03, *Reading unit files* (#307): `systemctl cat`, the `[Unit]`, `[Service]`
  and `[Install]` sections, `ExecStart=` and `User=` (none means root), `After=` versus
  `Wants=` versus `Requires=`, and why the administrator's copy in `/etc/systemd/system`
  beats the package's in `/usr/lib/systemd/system`. On the console, you read what each
  life-support service runs and as whom, and find the one whose copy in `/etc` runs it as root.
- Unit 1.5 module 04, *Writing a service* (#308): a unit file of your own in
  `/etc/systemd/system`, written with `sudo nano` or `echo … | sudo tee -a`, with `User=`,
  `Environment=`, `Restart=on-failure` and `RestartSec=`, then `daemon-reload` and
  `enable --now`, and what `203/EXEC` and `217/USER` mean. On the console, you write the new O2
  monitor's unit, and when its program crashes, the unit brings it back.
- Unit 1.5 module 05, *Timers* (#309): reading a cron line field by field, a timer as a
  `.timer` and a `Type=oneshot` `.service`, `OnCalendar=` next to cron's fields, `Persistent=true`,
  enabling the `.timer` by its full name, `list-timers`, and why a job's output belongs in the
  journal rather than `/dev/null` (`ExecStart=` has no shell to redirect it anyway). On the
  console, you move the weekly filter report from `/etc/cron.d` to a timer on the same schedule.
- Unit 1.5 module 06, *The journal* (#310), the end of systemd & services and of the Life
  Support deck's mystery: what a journal line says, why reading it takes `sudo` or `adm`,
  `journalctl` with `-u`, `--since`/`--until`, `-p`, `-n`, `-r` and `-b`, saving a window with
  `sudo journalctl … > FILE`, and taking a cron job out of service by moving its file. On the
  console, the journal for 02:30–02:45 on the night of the outage shows who stopped scrubber B.
  You file it as evidence, retire the job and bring the controller back.
- The droplet dumps the database every night (#324), not only on deploy. Before this, anything
  done between releases was in no backup at all. A systemd timer runs the deploy's own verified
  dump at 03:30 New York time (and catches up after downtime), keeps the newest 14, and fails
  visibly in `systemctl --failed` when a dump is bad. Each release installs the script the timer
  runs, so it can't drift from the deploy's. The dumps don't leave the droplet yet; that is
  Budget Buddy #535. Installing the timer is a one-time step in RUNBOOK §6.

### Changed
- Dependencies updated (#297, #300, #301): FastAPI 0.143 → 0.161, Starlette 1.9, pydantic
  2.14, pydantic-settings 2.16, Alembic 1.20, and the pinned GitHub Actions. Nothing a learner
  sees changes.

### Security
- Database dumps are always private to `deploy` (#326). The deploy's pre-migration dumps were
  created world-readable (`-rw-rw-r--`) because of the SSH session's umask. Their folder was
  already `drwx------`, so no other account could reach them, but a dump copied out would have
  kept the loose mode. The ones already on the droplet were fixed by hand.

## [0.12.1] — 2026-10-25

One fix, with nothing to do on the server: the laptop screen's text stays a normal reading
size on big windows instead of growing with the desk.

### Fixed
- The text on the laptop screen no longer grows with the window (#293). The room and its art
  still scale with the desk, but lessons, the console and comms stay at about 14-15px. At
  1864x984 lesson text drops from 18.6px to 14.9px, and 1280x720 is unchanged. Lines keep
  their length, so the lesson column is narrower on the glass on bigger windows.

## [0.12.0] — 2026-10-25

An admin panel, so the jobs that needed SQL or a script on the droplet happen in the app. An
admin can reset a learner's progress (all of it, or one module or unit, to replay a module
after a beginner audit), preview any module, create accounts and manage them, and see the
month's AI spend and what's running. Every destructive action asks for the admin's password
again, and anyone else sees a page that doesn't exist.

**Server:** one migration, `0010`, runs before the new image serves. Every account starts as a
non-admin, so after the deploy, promote yours once from the droplet:
`docker compose exec web python -m scripts.create_user <username> --admin`. It asks for a
password and sets it: re-enter the current one to keep it. Your sessions end, so log in again.

### Added
- Accounts can be marked as admins, ready for the admin panel that resets progress and
  creates users from inside the app (#280). Every existing account starts as a non-admin.
- An admin panel at `/admin` (#281). It lists every account with its completed modules and XP,
  and can wipe one account's progress so its modules can be played again from the start. The
  login and the AI spend record stay. The reset asks for the admin's password again, and anyone
  who isn't an admin sees a page that doesn't exist. `create_user.py --admin` makes an admin.
- The admin panel creates accounts too (#282), with the same rules as `create_user.py`: a
  password of at least 12 characters, typed twice, and the admin's own password to confirm.
- Each account has its own admin page (#283): set a new password, log it out everywhere, delete
  it (never your own), or download its progress as JSON to keep before a reset. A deleted
  account's AI spend stays in the month's total.
- Two read-only admin pages (#285). AI spend shows the month's total against the budget and
  every call behind it. System shows the app and Pyodide versions, the migrations, the catalog's
  size and how many learner rows there are. Neither shows anything from the server's secrets.
- The admin panel can reset one module or one unit (#284), so a module changed after a
  beginner audit can be played again without replaying everything. Badges and streak days
  stay. It can also preview any module, locked or not, without recording anything.

### Changed
- The Pyodide version is written in one place (#256), the script that fetches it for the
  image, and the app reads it from there, so an upgrade can't change one copy and miss the
  other. CI now checks that each built image holds the Pyodide version the app serves.

## [0.11.1] — 2026-10-24

Hardening, with nothing new for the learner. The app's container is locked down and can't
rewrite its own code, every image is scanned before it deploys and carries a list of what's in
it, and the database is pinned to an exact Postgres image. The station console's shell and the
content schema are split into small files by area, ready for Unit 1.5. Two Unit 1.1 console
tasks now check exactly what they ask for.

### Security
- The app can no longer rewrite its own code (#263). The image's code and lessons are owned by
  root, and the app runs as a user with no home directory or login shell, so a compromised app
  can't plant changes that outlive it. CI now fails if that user can write anything under
  `/app`. The image no longer carries `psql`; use `docker compose exec db psql` instead.
- The app's container is locked down (#264). Its filesystem is read-only apart from a
  temporary `/tmp`, it has none of Docker's default capabilities, it can't gain privileges
  through setuid programs, and it can run at most 100 processes and threads. The release's
  smoke test runs the image the same way, so a release that needs to write to disk fails
  before deploy approval, not on the droplet. The database container is unchanged: editing
  it recreates the container, so its hardening is a scheduled operation (#266).
- Every image is scanned for known vulnerabilities (#265), on each PR and before each release
  deploys. A critical one with a fix available stops the release. Release images now carry an
  SBOM (a list of everything installed in them) and build provenance (how and where they were
  built), attached in the registry.
- The database image is pinned to Postgres 16.15 by digest (#266), so a pull can no longer
  change the database under a running release, and it can't gain privileges through setuid
  programs. CI and the release smoke test now test against that same Postgres. Applied to the
  droplet by hand on 2026-10-24, before this release (RUNBOOK §5).
- Python 3.14.8 (#265), which fixes a critical CVE (CVE-2026-19445) the new scan found in
  3.14.7. The new base image also brings Debian's fixed OpenSSL.

### Changed
- The station console's shell is now twelve files by area instead of one of 6,275 lines (#255):
  the parser, word expansion, running commands, and the command families (files, text,
  processes, network, names) each have their own. Nothing changes for the learner. Every
  console test, every task's reference solution and the shared grading cases pass unchanged.
  This is groundwork for Unit 1.5, which adds `systemctl` and services to the console.
- The content schema is now a package of small files by area instead of one of 1,136 lines
  (#257). Quiz questions, labs, challenges, the comms log and the syllabus each have a file,
  and the console's specs (files, checks, accounts and processes, network, DNS, firewall)
  have one per family. Authors and learners see no change: content validates exactly as
  before, with the same error messages. This is groundwork for Unit 1.5's systemd specs.

### Fixed
- Two Unit 1.1 console tasks now check what they ask for (#249). Module 07's `alerts.txt` must
  hold the ALERT lines **and nothing else**, so copying all of `core.log` into it no longer
  passes. Module 08's `noisy.txt` must hold the **three** busiest addresses, not every address
  with its count. A `lacks` check can now name a file the learner creates, failing until the
  file exists, as the graders already did.

## [0.11.0] — 2026-10-21

The Unit 1.1 beginner audit. All ten modules were read as a first-day learner would read them,
and rewritten so everything a task, quiz question or card needs is on the page in plain
sentences or tables, not in code comments. Terms are explained before they're used, examples
no longer hand over the task's answer, every Try it says where to run it and what to expect,
and every console task says when it's done. The station console no longer renames a file you
move into a directory that isn't there.

### Fixed
- The station console no longer renames a file when you move or copy it into a directory that
  isn't there (#229). `mv notes.bak backup/` with no `backup` directory used to leave a file
  called `backup`, the very mistake the slash exists to prevent. Now it refuses as real `mv`
  and `cp` do (`cannot move 'notes.bak' to 'backup/': Not a directory`), and the file stays
  put. A directory can still be renamed that way, as on Linux.

### Changed
- Unit 1.1 module 01, *The filesystem tree*, audited as a first-day beginner would read it
  (#224). The console task is three numbered steps, and finding the directory no longer hands
  you the scrubber's time: you read it in the log. The lesson says the root *user* is the
  administrator (not the directory `/`), what `/var` is for, that `cd` prints nothing when it
  works, and what `PATH` and `FILE` in the table stand for. `~`, `.` and `..` are a table rather
  than code comments. Try it has no pipes yet, and it practises `less` and `tail`.
- Unit 1.1 module 02, *Finding your way around*, audited the same way (#226). It says how to
  work out a relative path (up to the directory both paths share, then down), that flags are
  options, that `ls -a` also lists `.` and `..`, that the dot is part of a hidden file's name,
  and that `cd -` is the one `cd` that prints something. The task's steps are numbered and say
  where the relative path starts. Try it is one command per line, with no `&&` or pipes.
- Unit 1.1 module 03, *Making, moving and matching files*, audited the same way (#228). Its
  examples no longer spell out the task's answer (`crash-2026-10-*`, an `archive` one level
  up). It says what a glob is, that a glob can have a path in front (`logs/*.log`), that these
  commands print nothing when they work, and what the slash in `backup/` protects you from.
  Brace ranges are explained, `grep` and `&&` are gone, and Try it has you type `cp -r`, a
  rename, `rm -i`, `rm -r` and `rmdir`, all of which the quiz and cards ask about.
- Unit 1.1 module 04, *Permissions and ownership*, audited the same way (#232). It now says
  what a file's owner, group and mode are before using them, and that you own the task's
  files. It also explains what `stat -c`'s `%a %A %n %U %G` print, what the comma and an empty
  `=` do in `u=rw,go=`, how to change one class's digit, and what a script is. `chmod` and
  `chown` are silent when they work, and `sudo` gets one sentence ahead of module 05. Try it
  takes `x` off a directory to show `Permission denied`, has you try `chown` (refused, as you
  aren't root), and gives a file to root and back on a machine with `sudo`.
- Unit 1.1 module 05, *Users, groups and sudo*, audited the same way (#234). It says what a
  user, group, process, UID, GID and the kernel are before using them. It explains `cut -d:
  -fN` in prose (the task's `cut` was only in a code block), what each field of an
  `/etc/group` line is, a main group against extra groups, and `sudo usermod -aG GROUP USER`
  (and that it's silent). It shows sudo's password prompt, warns that Ubuntu shows nothing as
  you type, and says what Docker and a container are before quiz Q4 relies on them. Try it
  says where to run it, has you type `id root`, and gives `su` and `sudo visudo -c` a
  real-Linux-only block.
- Unit 1.1 module 06, *Processes and signals*, audited the same way (#237). It says what a
  process's name is and that `pgrep` and `pkill` match any part of it, so `pkill o2` aims at
  more than the runaway. It also says you can signal only your own processes. It shows real
  `ps aux` output and explains its columns, `aux` without a dash, `--sort=` and `head` with no
  `-n`. Jobs (`sleep`, `&`, `jobs`, `fg`, `bg`, `kill %1`) are a table, not code comments, and
  `;`, `&&` and `||` each get an example. The console task says when it's done, and to press
  Reset after a KILL sent first. Try it adds Ctrl-C and `ps aux | grep` on a real machine.
- Unit 1.1 module 07, *Pipes and redirection*, audited the same way (#239). It says `>` and
  `>>` create a missing file, and that `>` empties an existing one without asking. It shows
  what `ls` prints for a directory and a missing path (the error first, then a `DIR:` heading),
  which is what the task's file holds. `2>&1` goes before the `|` in a pipeline, and the order
  table says in words where each channel goes. It says the `&` in `2>&1` isn't module 06's
  background `&`, and that `ls` writes one name per line into a file or a pipe. The `sshd` and
  `auth.log` examples are replaced by ones the console can run. Try it says where to run it,
  and has you type `>>`, `/dev/null` and the wrong `2>&1` order, which the quiz asks about.
  The task says when it's done.
- Unit 1.1 module 08, *Text tools*, audited the same way (#241). `grep`'s flags and `sed`'s
  `s/OLD/NEW/`, `g`, `-n` and `-i.bak` are tables and prose, not code comments, on real files
  like `/etc/passwd`. A new section reads an access-log line field by field. The lesson shows
  what `uniq -c` prints (the count first), how to `cut` on a space, and what awk's quotes and
  braces do. The console has a second log, the bridge's web server's, so the lesson's
  examples run there without handing over the task's answer. The task says to put the count
  first, and the Python challenge says it's a bonus for anyone who already knows some.
- Unit 1.1 module 09, *Environment variables and PATH*, audited the same way (#243). It says
  what the environment and a child process are, and tables shell variables, `export` and the
  one-command form instead of leaving them in comments. It says there are no spaces around `=`
  and how double and single quotes treat `$`, that `PATH` is a `:`-separated list searched left
  to right, and what `type -a` and `which` print. The prepend line is taken apart piece by
  piece, with a warning (and the way back) for leaving out `:$PATH`. It says why `bash -c`
  takes single quotes, and shows what the `.bashrc` append writes. Try it practises `source`
  and running a script with `./`. The deployment section is now a short *On the real station*
  note.
- Unit 1.1 module 10, *Installing software with apt*, audited the same way (#245). Every quiz
  answer and card was in a code comment; they're tables and prose now. It says what a package,
  a repository and a dependency are, that `update` installs nothing, that `remove` keeps
  `/etc` settings and neither touches your home, and what `Installed:` and `Candidate:` mean.
  It explains signing keys, `systemctl status` (ahead of Unit 1.5), and images, `RUN` and
  layers before the Dockerfile question, and which apt commands need `sudo` (and why a `RUN`
  line doesn't). Try it says where to run it without an Ubuntu machine of your own, drops
  `$( )`, and installs and removes `tree`, with a note on each line.

## [0.10.0] — 2026-10-17

Fixes from playing Unit 1.1. Modules 04 to 07 now say plainly what their tasks and quizzes need:
how permission numbers are worked out, what a login shell is and why `groups` lags after
`usermod`, what `$?` holds, and what stdin, stdout, stderr and `2>&1` actually mean. The station
console says how much of a task is done (`1 of 2 done`) and has `stat -c`. Okafor is "he"
everywhere.

### Added
- The station console has `stat -c FORMAT` (#206): `stat -c '%a %A %n' FILE` prints a file's
  mode as a number and as letters side by side (`640 -rw-r----- secrets.txt`), the same as GNU
  stat on Ubuntu 24.04. `man chmod` now explains the three classes and how each digit adds up
  r=4, w=2 and x=1.
- The station console says how much of a task is done (#208). Once you've changed something,
  a task with two or more checks shows `1 of 2 done` under the console after each command, so
  fixing one file of two no longer looks the same as fixing none. It never says which check is
  left, since that would give the answer away; the Hint button is for that.

### Changed
- Unit 1.1 module 04, *Permissions and ownership*, shows how the numbers are worked out (#206).
  It reads the string in threes, works a mode from letters to digits and back, gives all eight
  digits in a table, and shows the trap Sean hit: `chmod 700` on a shared script takes the
  group's access away, and `chmod u+x` doesn't. The task now says to look at the modes first
  and to change nothing else, and a last quiz question asks about exactly that.
- Okafor is "he" everywhere (#207). Seven lines across Unit 1.2 and Git had called him "she",
  while Unit 1.4 and the story said "he". A test now holds it.
- Unit 1.1 module 05, *Users, groups and sudo*, explains what its second task asks for (#210).
  The lesson now reads an `/etc/passwd` line field by field and says field 7 is the login
  shell. It says service accounts usually get `/usr/sbin/nologin`, and that a user and a group
  can share a name and still be separate things. It explains why plain `groups` doesn't show a
  group you've just been added to until your next login, while `groups NAME` does. A paragraph
  on `su` now backs the `sudo` vs `su` card. The task's two parts are numbered, and the second
  says it means the `airlock` account, not the group.
- Unit 1.1 module 06, *Processes and signals*, says what `$?` is (#214): the variable holding
  the last command's exit status. It explains that its `$` is typed, unlike the prompt's, and
  that many commands, `kill` included, print nothing when they work. The example no longer
  uses `/dev/null` and `;`, which the next module teaches, and the quiz's `$?` question now asks
  what you type after `echo`.
- Unit 1.1 module 07, *Pipes and redirection*, is rewritten for a beginner (#216). It says in
  plain words what stdin, stdout and stderr are and what a file descriptor is, and uses real
  commands (`ls /etc/hosts /nope`) instead of a `cmd` placeholder. It shows that `>` is `1>`,
  explains `2>&1` piece by piece, including the `&` and why order matters, and gives
  `/dev/null` and "only stdout goes through a pipe" a sentence each. `tee` is explained and
  practised in Try it. The section on pipeline failure moved out: *Robust scripts* teaches
  `pipefail` where scripts are.

## [0.9.0] — 2026-10-16

The relay network: Unit 1.4, Networking, all ten modules. The station console gets a network of
its own, with addresses, DNS, HTTP, a firewall and SSH to other hosts, all simulated in the
browser and checked line for line against Ubuntu 24.04. The labs work on real sites, this app's
included. The Life Support mystery takes its next step: the 02:35 job is still connected, and
not to Mission Control. Unit 1.1 now says what the shell is, and the laptop's screen fits more.

### Added
- The station console has a network (#164), for Unit 1.4. `ip addr` and `ip route` show the
  console's address and gateway, and `ss -tlnp` and `ss -tnp` show what listens and who's
  connected, held by the same processes `ps` lists. `ping` and `nc -zv` reach the other hosts an
  exercise declares, and tell the outcomes apart the way the real tools do: a reply, refused,
  no route, or a timeout. All of it is simulated in the browser and checked line for line
  against Ubuntu 24.04's output. An exercise describes its network under `network:`, and the
  loader rejects a bad address and names the host.
- The console resolves names (#165). `dig`, `host` and `getent hosts` answer from the station's
  DNS, which an exercise fills with A, CNAME, MX, TXT and PTR records under `network.dns`. Every
  console now has a real `/etc/hosts` and `/etc/resolv.conf`, read live. `getent`, `ping` and
  `nc` check `/etc/hosts` before DNS and `dig` doesn't, so a stale line in that file shows up the
  way it does on a real server: `dig` gives one address and `ping` goes to another. NXDOMAIN, a
  resolver that times out or refuses, and reverse lookups all print what BIND 9.18's tools print.
- Unit 1.4, Networking, begins (#167). *Addresses and ports* teaches IP addresses and
  subnets, `ip addr` and `ip route`, ports, and `ss -tlnp` and `ss -tnp`. It also covers why a
  service on `127.0.0.1` answers only its own machine, with this app's own droplet as the
  example. On the console you map the relay console's network with `sudo ss` and find out why
  Mission Control can't reach the telemetry dashboard.
- The console speaks HTTP and has a firewall (#166). `curl` fetches from the station's own
  services, which an exercise defines route by route, with `-v`, `-I`, `-L`, `-o`, `-w` and the
  rest, and fails with curl's real errors (6 no such name, 7 refused, 28 timed out, 60 a bad
  certificate). `ufw` turns the firewall on and off and adds and removes rules, keeping them in
  ufw's own files, as the real one does. And `ssh HOST 'COMMAND'` runs a check from another
  host, so a learner can see a port that `ss` says is listening and the firewall still blocks.
- Unit 1.4 module 02, *Names and DNS* (#168): what DNS does, A, CNAME, MX and PTR records,
  reading `dig` (and `+short`, `-x`), `/etc/hosts` and why it's read first, `/etc/resolv.conf`,
  and TTLs. On the console, Mission Control's uplink doesn't answer because an old line in
  `/etc/hosts` pins it to an address DNS has never heard of: you find it by comparing
  `getent` with `dig`, then remove it.
- Unit 1.4 module 03, *Is it reachable?* (#169): a method for "it doesn't connect" (name,
  route, machine, port), `ping` and why a blocked ping proves little, `nc -zv -w`, and telling
  "refused", "timed out" and "no such name" apart. On the console, Mission's ping monitor is
  wrong about two of four relays, and you find each one's real fault.
- Unit 1.4 module 04, *HTTP by hand* (#170), the unit's first lab: requests and responses,
  methods, status codes, headers, redirects, and `curl` with `-v`, `-I`, `-L`, `-o` and `-w`.
  With real curl you read this app's own `/healthz`: Certbot's redirect from `http://`, the
  status line, and the headers Nginx and the app each send.
- Unit 1.4 module 05, *APIs and JSON* (#171), a lab: reading JSON, `jq` (`.field`, `.[]`,
  `|`, `select`, `-r`), and query strings. With real curl and jq you ask GitHub's public API
  about this app's own repository: its name and branch, its newest releases, and the day the
  first one shipped.
- Unit 1.4 module 06, *TLS and certificates* (#172), a lab: what TLS gives you, certificates
  and chains, Let's Encrypt, SNI, and telling an expired certificate from the wrong one. With
  `openssl` you read this app's certificate, then ask the same server without naming a site
  and get its neighbour's, which is exactly what SNI is for.
- Unit 1.4 module 07, *SSH keys* (#173), a lab: key pairs, `ssh-keygen`, fingerprints,
  `authorized_keys` and `known_hosts`, the host key warning, and `~/.ssh/config` checked with
  `ssh -G`. You make a key, set up a config entry for the relay, and check GitHub's host key
  against the fingerprint GitHub publishes. No server needed.
- Unit 1.4 module 08, *Copying files and tunnels* (#174), a lab: `scp`, `rsync` (`-a -v -n`,
  `--delete`, and the trailing slash that decides what's copied), and `ssh -L` and
  `LocalForward` to reach a service that only listens on a server's localhost. You bring the
  relay's logs home between two local directories, dry-running first, and check a tunnel
  entry with `ssh -G`.
- Unit 1.4 module 09, *Firewalls* (#175): what a host firewall does, default deny, why
  "listening" isn't "reachable", `ufw status`, `allow`/`deny` and allowing one host, the
  first-match rule, and not locking yourself out. On the console, the relay's feed listens and
  Mission's host still gets silence: you test from outside with `ssh`, find an old deny above
  everything, and open the port to Mission's host and no one else.
- Unit 1.4 module 10, *Following a connection* (#176), the unit's last module. It puts the
  unit's tools in order: `sudo ss -tnp` for who holds a connection, `dig -x` and a forward
  lookup to name the peer (a PTR record is only a claim), `curl -v` to ask what's at the other
  end, and writing it up before you stop anything. On the console, the Life Support mystery's
  1.4 clue: the 02:35 job `scrubber-flush` is still connected to `relay.depot-sync.net`, which
  isn't Mission Control. Finishing it earns *Relays Restored*.
- A console task can check that a file **doesn't** contain something (#200): `{lacks: P, text:
  …}`, graded the same in the browser and on the server. Module 09 (*Firewalls*) uses it, so
  opening the feed's port to Mission's host *and* to everyone no longer passes, which is the
  over-opening the lesson warns against.

### Changed
- The laptop's screen fits more (#188). Everything on it is drawn at 85% of its old size, and
  the lesson column keeps its width, so a lesson is about a fifth shorter to scroll and each
  line holds more words. The room around the laptop is unchanged.
- The console's `help` lists its network commands in full (#199): `dig`, `host`, `curl`, `ufw`
  and `ssh` were missing, so a learner in Unit 1.4 who typed `help` didn't find the tool the
  lesson was about.
- Unit 1.1 module 01 now says what the shell is (#196). It opens with the terminal and the
  shell, bash, how to read the prompt, a command and its arguments, and that the shell reads
  the whole line before the command runs. Module 03's globs point back to it. Unit 1.1 had
  used "the shell" without ever explaining it.
- Unit 1.4 modules 02–09 had their content review (#198). Module 07's ssh-config question no
  longer says a bad option logs you in (ssh stops first), and modules 07 and 08 say to add to
  `~/.ssh/config` rather than replace it. Module 05's lab hints point at the mistake instead of
  giving the jq filter, and module 06's `-checkend` example is no longer the lab's own answer.
  Smaller wording fixes in 02, 04, 05, 08 and 09.

## [0.8.0] — 2026-10-14

The desk fits any screen, and the lessons answer back. The app scales with the window and the
room fills a wide one. A wrong quiz answer can be tried again. Flashcards take a typed answer and
link to their lesson. The crew notice promotions and badges. And a mystery starts: why the
station went dark, with clues in the cron module and the Git lab.

### Added
- A mystery runs through Life Support: why the station went dark (#84). The plan is in
  `docs/story.md`: the cause, and the clue each unit uncovers with its own tools. Unit 1.2's
  clue is now in *Scheduling with cron*. Before scheduling anything, the console task has you
  check what already runs at night. In `/etc/cron.d` there's a root job nobody on the crew
  wrote, running at 02:35, five minutes before scrubber B went dark. The lesson now teaches
  system jobs in `/etc/cron.d`, and the crew react on comms.
- Unit 1.3 picks up the mystery (#160). *Reading history*'s lab also builds the station's
  config repo, and a last step finds who added the 02:35 job, with `git log -S` and `git show`:
  `depot-sync`, the supply depot's update feed, on 2026-09-30. Its message, "Update drone
  credential list", doesn't mention the cron job it brought, and the same commit is why the drone
  couldn't log in the night the station went dark. The lesson now says that `-S` searches what
  files contain, not their names. Git's last debrief points the thread at Networking.
- The crew notice promotions and commendations (#83). Reaching a new rank brings a line on
  comms: from Okafor up to Chief Engineer, and from Mission Control for Station Commander.
  Earning a badge brings MERIDIAN's "COMMENDATION LOGGED · <NAME>". The lines arrive after the
  debrief, with the answer, lab pass or review grade that earned them, and stay in the comms
  history at the moment they happened. That includes ranks and badges earned before this
  release. A rank counts once, so regaining it after a hint's cost isn't a second promotion.
  Lines are set per rank and badge in `syllabus.yml` and checked against the cast.

### Changed
- Flashcards say where they come from and take a typed answer (#104). Each card names its unit
  and module, linked, and the part of the lesson it's about, linked straight to that heading
  (lesson headings now have ids). Before the back, type your answer, or leave it blank and
  choose Show answer. Then it's shown beside the card's back. You still grade yourself. A card
  can list exact answers, and typing one marks it matched and preselects Good. Typed answers
  aren't stored. Every existing card now has its lesson section, and 13 have exact answers.
- A wrong quiz answer can be changed (#103). It says "Not quite." and offers **Try again**,
  without showing the right option or the explanation yet. Those appear once you answer right,
  or choose **Show me**. Your first answer is still the one scored: retries don't change the
  module's score, the perfect-quiz bonus or the badge, and each question says whether it was
  right first time. Questions already answered wrong can now be retried too.
- No more dark bars beside the desk on a wide window (#105). A 1080p or 2K browser window is
  wider than 16:9 once the tabs and taskbar take their share, so the desk was letterboxed. Behind
  the scene there's now the same room drawn wider, at the same scale, so the sides show more
  wall and desk, out to a 21:9 monitor. The scene itself is unchanged, and so is a 16:9 window.
- The app grows with the screen (part of #105). On a 2560×1440 monitor the laptop's screen was
  twice the size, but the lesson kept 16px text in a 760px column, a third of the glass. Text,
  the reading column, the comms log, avatars and emblems now scale with the desk: 1rem is an
  80th of the scene's width, between 16px (1280×720, unchanged) and 32px.
- Dependencies: `anthropic` 1.13.0 and `pycparser` 3.11 (#133).

## [0.7.0] — 2026-10-14

Labs and AI: Unit 1.3 Git, eight modules done with real `git` on your own machine, graded from
what you paste. Stuck on any task, ask Claude for a hint that never holds the answer; pass a lab
and Claude reviews your work for bonus XP. Every model call goes through a monthly budget, and
the header shows whether the uplink is online. Finishing Git earns *Every Change Logged*.

**Server:** `ANTHROPIC_API_KEY=` (a key for this app alone) and `AI_MONTHLY_BUDGET_CENTS=500` in
`/opt/orbit-ops/.env` before approving the deploy. Without the key everything works except hints
and lab review, which show "Uplink offline".

### Added
- A place on each exercise attempt for Claude's review of a passed lab: its score, strengths
  and issues. Empty for everything else (#122).
- A database table for AI spend: one row per model call, with its purpose, model, tokens and
  cost. The monthly AI budget will be summed from it. Spend outlives a deleted user, so the
  month's total can't shrink (#120).
- The AI foundation (#120). Every model call goes through one gate that refuses when there's
  no API key or this month's spend has reached `AI_MONTHLY_BUDGET_CENTS`, and records each
  call's tokens and cost. Months follow `APP_TIMEZONE`. Hints will use Haiku 5.5 and lab
  review Sonnet 5.5. The header readout gains **Uplink online/offline**, so you can see
  whether AI features are available. Nothing calls a model yet: hints (#123) and lab review
  (#122) are the first features to.
- Labs (#121): exercises done on your own machine, with real `git` from Unit 1.3 and later
  Docker and a cluster. You paste what the commands printed, and the app checks the text. It
  runs nothing. A failed check shows its hint, and what you pasted stays in the box. The first
  pass is worth 40 XP and brings the crew's `lab_done` reply on comms. A new badge, *Field
  Work*, is earned for passing a first lab. Like a console task, a lab doesn't decide whether a
  module is complete: the quiz still does. Unit 1.3's modules are the first with labs.
- Claude reviews a passed lab (#122), for labs whose author asks for it with a rubric. Once the
  checks pass, the review loads by itself without delaying the pass: a score out of 100, up to
  three things done well and three to do differently. It earns a bonus of up to 20 XP, once.
  It runs on Sonnet 5.5 through the AI budget gate. With no key or no budget left, the lab still
  passes and the review can be asked for later. The checks always decide pass or fail; the
  review never does.
- Hints (#123): stuck on a quiz question, the console, a challenge or a lab, ask for a hint.
  Haiku 5.5 sees the lesson, the task and what you've tried, never the answer key. A reply that
  gives the answer away anyway is replaced with a pointer back to the lesson, free. A hint
  costs 5 XP once per task, however many you ask for, and each task allows one a minute. With
  no key or budget, the buttons say "Hints are offline".
- Unit 1.3 module 01, "Your first repository" (#125), the first module of **Git** and the
  first with a lab. It covers getting git on Ubuntu, a Mac or Windows; `git config` for the
  name and email every commit carries, and why that's per machine; and `init`, `status`, `add`,
  `commit -m` and `log`. It explains what a commit is (a snapshot with an author, a time, a
  message and a parent) and why nobody else's hashes match yours. In the lab you put
  `airmix.conf` under version control in two commits on your own machine, and paste
  `git log --oneline` and `git status`. It names an editor (`nano`, and how to save and leave),
  because the lab edits a file and Unit 1.3 doesn't need Unit 1.2, where nano is taught.
- Unit 1.3 module 02, "Staging and diffs" (#126). It covers the working tree, the index and
  HEAD; `git diff` against `git diff --staged`, and reading a hunk; `git add -p` for staging
  part of a file; `git status --short`'s two columns; and `git restore` with and without
  `--staged`, including the one that can't be undone. In the lab, two fixes sit in the same
  file and only the tested one is committed. You paste the short status, the commit and what's
  left in the file.
- Unit 1.3 module 03, "Reading history" (#127). It covers `git log`'s filters (`--oneline`,
  `--graph`, `-p`, `--author`, `--since`, `-- PATH`), `git show`, and `git blame`, including
  why the commit blame names may only have touched the line. Then `git log -S`, the pickaxe,
  finds where a value was added or removed. In the lab, a month of history by three crew
  members hides who raised the CO2 alarm to 5000 ppm. Blame points at a commit that only
  re-spaced the file, and the pickaxe finds the real one. The setup builds the same history,
  hashes included, on any machine, and runs in zsh as well as bash.
- Unit 1.3 module 04, "Branches and merging" (#128). It covers what a branch is (a name for a
  commit), `git switch -c`, switching, fast-forward against a merge commit, `--no-ff`, the
  merge message's editor (and how to leave vi), reading `git log --graph --all`, and
  `git branch -d`. In the lab, the pump schedule is worked on a branch while `main` takes a
  filter fix, and then the two are joined with a merge commit. You paste the graph showing both
  lines and the merge.
- Unit 1.3 module 05, "Merge conflicts" (#129). It covers why conflicts happen, reading the
  markers, resolving by editing (which may mean neither side's value), `git add` to mark a file
  resolved, finishing with `git commit`, and `git merge --abort`. In the lab, Nakamura and
  Petrov changed the same CO2 warning on two branches, and you settle it at the brief's value
  in a merge commit that says so. Their other changes merge by themselves.
- Unit 1.3 module 06, "Remotes" (#130). It covers a bare repository as the shared copy (on
  disk, no GitHub account needed), `clone`, `origin` and tracking, `remote -v`, `push`, and
  `fetch` against `pull`. Then `git status -sb`'s ahead and behind, and why status needs a fetch
  before you trust it. Then a rejected push, and what git 2.43 says when a pull has diverged.
  In the lab you clone Mission Control's copy, push a fix, then fetch and pull a change
  Nakamura pushed after you.
- Unit 1.3 module 07, "Undoing things" (#131). It covers `git commit --amend` before a push,
  and `git revert` as the safe undo for anything already pushed. Then `git reset` and its
  three modes, with why it's only for commits that are yours alone, and `git reflog` to get
  back a commit `reset --hard` "lost". In the lab, the setup really does run `reset --hard`
  over Okafor's battery fix. You rescue it from the reflog, then revert Petrov's pushed commit
  without rewriting anyone's history.
- Unit 1.3 module 08, "Working together" (#132), the end of **Git**. It covers `.gitignore`
  (generated files and secrets, and why a committed secret must be changed, not deleted), commit
  messages with an imperative, capitalised subject and a body that says why, and `git rebase`
  for a straight history. It walks this project's own issue → branch → PR → squash-merge flow.
  The lab is the first reviewed by Claude: you keep the junk out, make Okafor's two changes as
  one commit each, and rebase onto `main`. The checks decide the pass, and Claude then reviews
  the messages against a rubric. Completing it earns *Every Change Logged*.

### Fixed
- The deploy's pre-migration backup can no longer pass when `pg_dump` fails (#116). It used to
  check only that the dump was valid gzip, and a failed `pg_dump` still leaves one, so a deploy
  could migrate with no usable backup while its log said `backup ok`. The backup is now
  `scripts/backup_db.sh`, run under bash with `pipefail`. It keeps a dump only if `pg_dump`
  succeeded **and** the dump ends with its completion line. Otherwise the deploy stops before
  migrating, and no file is kept. The RUNBOOK's manual dump before a `db` change gets the
  same checks.

## [0.6.1] — 2026-10-12

Bash scripting, finished: Unit 1.2's last six modules, from conditionals and loops to
arguments, functions, robust scripts and cron. Completing it earns *Routine Automated*. The
console's `tar` now fails the way GNU tar does when it can't write its archive.

### Added
- Unit 1.2 module 05, "Conditionals" (#72): `if` as a test of an exit status, `[ ]` and its
  string, number and file tests, `elif`/`else` and why order matters, `[[ ]]`, `&&` and `||` as
  short ifs, `case`, and failing well with `exit N` and `>&2`. Bash compares whole numbers only,
  so the lesson shows how to count a reading like 19.2% in tenths. In the console, `o2-check`
  learns to say `ALERT`, `WARN` or `OK` and to refuse to run without its sensor, then is tested
  against all four cases, including a reading exactly on the alarm line.
- Unit 1.2 module 06, "Loops" (#73): `for` over words, globs, `{1..N}` and a command's output;
  why a glob is safe and `$f` inside the loop isn't; trimming a path to a name with `${f##*/}`
  and `${f%.log}`; `while read -r` line by line; `break` and `continue`; `while` and `until`.
  In the console you write `deck-readings`, which gives all twelve decks' latest CO2 in one
  list. It has to cope with a log named `hydroponics bay.log`, an empty log, a reading exactly
  on the limit, and a deck that was over earlier but isn't now.
- Unit 1.2 module 07, "Arguments and input" (#74): `$0`, `$1`…`$9`, `$#`, `"$@"` (and why not
  `$*`), `shift`, a usage line on stderr with exit 2, an optional argument with `${2:-1}`, and
  `read -r -p` for scripts a person runs. In the console, two report scripts that drifted apart
  as copies become one `deck-report DECK [DAYS]`. It's tested five ways, including no deck, an
  unknown deck and `"hydroponics bay"`.
- Unit 1.2 module 08, "Functions" (#75): defining and calling functions, their own arguments,
  `local`, and the two ways a function answers: data with `echo` and `$( )`, yes or no with its
  exit status. Then sharing them with `source`. In the console, `deck-readings` and
  `co2-alarm` disagree about the galley's 5300 ppm, because one has the limit typed as 50000.
  The learner moves the sensor code into `/station/lib/sensors.sh`, with the limit in one place,
  and makes both scripts source it.
- Unit 1.2 module 09, "Robust scripts" (#76): why bash carries on after a failure, `set
  -euo pipefail` and the exceptions to `-e`, `mktemp -d`, `trap … EXIT` for cleanup, failing
  loudly, and ShellCheck. In the console, last night's `backup-logs` failed, said `backup
  complete` anyway, and left 2.1G of copies in `/tmp`. The learner clears up and hardens it, then
  runs it into the unwritable `/srv/backups` (it must stop with tar's status and leave nothing
  behind) and into a directory of their own (it must succeed).
- Unit 1.2 module 10, "Scheduling with cron" (#77), the end of **Bash scripting**: the five
  fields, `*`, ranges, lists and `*/N`, `crontab -e`/`-l`/`FILE`, cron's small environment
  (a short PATH, `sh`, no `~/.bashrc`, no terminal), keeping a job's output with `>> log 2>&1`,
  and running a job the way cron will with `env -i`. In the console, `shift-check` goes on every
  15 minutes and `backup-logs` at 02:30. Both use full paths and their own logs, and each command
  is run once by hand first. Finishing it completes Unit 1.2 and earns *Routine Automated*.

### Fixed
- When `tar` couldn't write its archive, the console said `tar: FILE: Permission denied`. Now
  it says what GNU tar says, `Cannot open:` and, with `-z`, the `tar (child):` lines and
  `Child returned status 2`. Like GNU, it reports nothing about the files it would have
  archived, because it opens the archive first.

## [0.6.0] — 2026-10-12

Bash scripting, part one: the station console became a real shell for scripts (control flow,
functions, `set -euo pipefail`, traps, nano, man, cron, `find`, `tar` and links), and Unit 1.2
opens with its first four modules. Modules 05–10 follow as 0.6.x releases. It also fixes a
solved console task going unlogged when a file name held a space.

### Added
- The station console runs real shell scripts (#64). It has `if`/`elif`/`else`, `for`,
  `while` and `until` loops with `break` and `continue`, and `case` with glob patterns. Tests
  are written with `test`, `[ ]` and `[[ ]]`, and fail with bash's own messages, including the
  classic `unary operator expected` from an unquoted empty variable. `$(command)` substitutes a
  command's output, `$(( ))` does integer arithmetic, `${file%.log}` and its relatives trim
  names, and `read` takes input from a file, a pipe or the keyboard.
  - Commands can span lines. At the prompt an unfinished `if` or `for` continues on a `> ` line,
    as in bash, and so does a line ending in `|` or `&&`, or one with an open quote. Ctrl-C
    abandons it.
  - A script runs up to a line with a syntax error, then reports the line and stops with
    status 2.
  - sudo can ask for its password inside a loop or a script.
  - A loop that never ends is stopped after 10,000 commands instead of freezing the page.
  - `grep -q` answers yes or no without printing, for `if grep -q …`.
- Console scripts can be robust (#65).
  - **Functions** with `local`, `return` and their own arguments, and `source` loads a library
    of them.
  - **`set -euo pipefail`**, with bash's real exceptions for `-e`: not in an `if` test, not left
    of `&&` or `||`, not after `!`. In a script, an unset variable is reported with the file and
    line, as bash does.
  - **`trap '…' EXIT`** cleans up however a script ends: normally, by `exit 2`, by a `set -e`
    failure, or by Ctrl-C.
  - **Here-documents** (`<<EOF`, `<<'EOF'`, `<<-EOF`) and here-strings (`<<<`) write files and
    feed commands.
  - **`mktemp`** makes private temporary files and directories.
- The console has `find`, disk tools, archives and links (#67).
  - **`find`** searches by name, type, size and age, with `-delete` and `-exec`, and explains
    its mistakes as GNU find does.
  - **`du`, `df` and `free`** report disk and memory use. Deleting files shows up as free space,
    and so does emptying a big log with `> big.log`.
  - **`tar`, `gzip`, `gunzip` and `zcat`** make, list and unpack archives. Archives are
    simulated, but they round-trip exactly and shrink when compressed.
  - **`ln -s` and `readlink`** make and read symbolic links, and every path resolves through
    links.
  - Tasks can now give files a real-looking size and date, and check that a link points the
    right way or that nothing under `/var/log` is too big or too old. The server grades those
    too.
- The console has an editor, a manual and cron (#66).
  - **nano** opens in the console panel. `nano check.sh` lets you write a script right there:
    ^O then Enter saves, and ^X exits, asking first if there are unsaved changes. Saving
    follows file permissions, so `/etc/hostname` is refused for a cadet.
  - **man** opens a pager: Space, b, `/` to search, q to quit. So do **less** and `CMD | less`.
    `CMD --help` and `help cd` work too, and every command the console knows has a page.
  - **crontab -e** opens your crontab in nano. It's checked the way cron reads it and refused
    with cron's own error messages if a line is wrong. `crontab -l` lists it. Nothing actually
    runs on a schedule.

- **Unit 1.2, Bash scripting, opens** with module 01, "Reading and editing on a server" (#68):
  `--help`, `help`, `man` and its sections, `less`, `tail -f`, nano, and enough vim to get out
  of it. In the console you read the scrubber daemon's manual to find the setting that sounds
  the CO2 alarm, past a warning setting that looks like it, and set it with `sudo nano`.
  - Module 02, "Finding things and disk space" (#69): `df`, `du`, `find` by name, size and
    age, `tar` and gzip, symlinks, and why you empty a log a program still holds open
    instead of deleting it. The console task takes a full disk from 97% to under 70%: empty a
    runaway debug log, archive and delete the old logs, and repoint `current.log`. Doing
    only one of the first two steps isn't enough.
  - Module 03, "Your first script" (#70): the shebang, comments, `chmod +x`, `./script` vs
    `bash script`, exit statuses, and where scripts live (`~/bin`, `/usr/local/bin`, the
    PATH). In the console you turn Okafor's sticky note into `/station/bin/shift-check`, make
    it executable, and run it by name.
  - Module 04, "Variables and quoting" (#71): assignment, `$var` and `${var}`, single and
    double quotes, why unquoted expansions split and glob, `$( )`, `$(( ))` and
    `${VAR:-default}`. The console task fixes a cargo report that a manifest called
    `Spare Parts.csv` broke, and gives it a total.
  - Inside a script, the console's errors are bash's own, with the script and line
    (`/station/bin/cargo-report: line 6: Parts.csv: command not found`), even inside `$( )`.
    A redirect from an unquoted or empty variable fails with `ambiguous redirect`, as in bash.
  - A console task can check that a file is **executable** (`{executable: P}`): its owner's
    x bit, so `chmod +x`, `u+x` and `755` all pass.
  - A script on the PATH that isn't executable yet now gets bash's own
    `bash: /station/bin/shift-check: Permission denied`, not "command not found".
  - `man` also finds the pages a program installs in `/usr/share/man`, searching the sections
    in man-db's order (1, 8, 3, 2, 5, …), so a module can give its own daemon a manual.
  - A quiz question can show a script or a command's output as a code block (`code:`), so
    Unit 1.2's "what happens here?" questions read like a terminal, not one run-on line.

### Changed
- Every lesson with a console task now says what the task needs in plain sentences and tables,
  not only in code comments or the Try it (#101). Unit 1.1's commands are tables, and the ideas
  that tripped people up are spelled out:
  - `mv` and `cp` take many files with the destination last;
  - `..` needs its slash;
  - a pattern that matches nothing comes back unchanged;
  - a bare `cd` returns to where the console started;
  - check with `pgrep` that TERM worked before using `kill -9`.

  Lessons also say when the console lacks something they mention (Ctrl-R, `tail -f`, `top`).

### Fixed
- **A solved console task could go unlogged** if the learner had made any file with a space,
  a comma or a `*` in its name: the server refused the whole report. File names may now hold
  any printable character (#71).
- **`rm -i` in the console asked nothing and deleted anyway.** Now `rm -i`, `mv -i` and
  `cp -i` ask first, in GNU's words, and the last of `-f` and `-i` wins (#101).
- Moving several files into a directory that doesn't exist now says `No such file or
  directory`, as real `mv`, `cp` and `ln` do, instead of `Not a directory`.
- A release now reaches your browser straight away (#92). After an update, browsers could keep
  the old stylesheet, scripts and art for hours (Safari did, after the laptop arrived), so a new
  page could be drawn with last release's CSS until a hard reload. Every stylesheet, script and
  image the app links to now carries the release version (`?v=0.6.0`), is cached for a year
  under that address, and changes address with each release. Anything fetched without a version
  checks with the server first. Pyodide's files sit under a path naming their version
  (`/pyodide/314.0.7/`), so Python loads from the browser's cache after the first time.

## [0.5.0] — 2026-10-10

Practice: flashcards on an SM-2 schedule as MERIDIAN's watch drill, Python in the browser with
the first code challenge, a laptop you can close to see the room, and the station map drawn as
the *Meridian* itself, with every unit's story now on show.

### Added
- Flashcard review (#51). Every module you've completed adds its cards to a review queue
  at **Review** in the nav: one card at a time, "Show answer", then Again, Hard, Good or Easy.
  Cards are scheduled with SM-2, so a card you know comes back after a day, then six, then
  longer each time, and one you forget comes back tomorrow. Modules you finished before this
  release count too, so their cards are waiting. Each card now has a permanent `id` in its
  lesson file, so rewording a card keeps its schedule.
- Flashcard reviews count (#52). Each review earns 2 XP, up to 20 a day, and clearing every
  card that's due files today's streak entry, just as finishing a module does. A day with no
  cards due doesn't count by itself. The dashboard says how many cards are due, with a button
  to review them, and the header readout shows "Cards due" on every page, updating as you grade.
- Python code challenges (#54), and the first one: a bonus on Unit 1.1's text-tools module.
  MERIDIAN reports 14 failed logins on the docking port; prove it in Python, against the same
  log you plumbed with `awk`. Write in the editor (Tab indents), **Run** to see what it prints,
  **Submit** to run the checks. A failed check tells you what it was checking, never its code,
  and the first pass is worth 30 XP. Your last attempt is still in the editor when you come
  back. Your code runs only in your browser, never on the server.
- Python can run in the browser (#53), ready for code challenges (#54). Pyodide 314.0.7
  (CPython 3.14, like the server) is served from the app itself, so it adds no third-party
  origin. The image fetches that exact release and refuses it if its sha256 doesn't match, which
  adds about 13.5 MB. It loads only when a program is first run, runs in a Web Worker so the page
  never freezes, and a program still running after 5 seconds is stopped. The CSP gains
  `'wasm-unsafe-eval'` and nothing else.
- A database table for flashcard schedules: each learner's SM-2 state per card (ease, interval,
  due date, reviews in a row, lapses), one row per card per learner. The cards themselves stay in
  the lesson files (#51).

### Changed
- The networking unit restores the station's **relay network**, not "the comms array" (#85), so
  "Comms" means one place on the *Meridian*: the fourth deck, Comms, Sensors & Shields. Its badge
  is now "Relays Restored". The relay is the one you met in Unit 1.1.
- Flashcard review is now MERIDIAN's **watch drill** (#82). The station's readout heads each card
  ("WATCH DRILL · 6 ITEMS · FROM: LIFE SUPPORT"), and clearing the day's drill earns a line from
  the crew, rotating by the date. Code challenges now say who's asking: the text-tools one is
  Okafor's.
- The station map is the *Meridian* itself (#78): a pixel-art ship, side on, with each track's
  deck as a section. Life Support is the hull and habitat ring, Cargo & Fabrication the container
  bay, Comms, Sensors & Shields the mast and dish, and Fleet Command the bow. Every unit is a
  compartment that lights up in its deck's colour when complete, pulses when it's ready to
  start, and is shuttered until it has modules. Each section shows its progress. Point at a
  compartment to see conduits from the units that feed it. Units no longer need a `map:`
  position in `syllabus.yml`: they fill their section's compartments in order.
- The desk's computer is now a laptop, and you can close its lid to see the room (#55). The
  screen is exactly where it was, so nothing in the app moves. "Close lid" on the bezel folds the
  lid down onto the keyboard and shows the whole window: the Earth, the docking arm, and any
  window event that's playing, which now shows in full (the aurora was mostly hidden behind the
  old monitor). Click the shut laptop to open it. It's the same page, never reloaded, so your
  scroll position and a half-typed console command are still there. Under reduced motion the
  lid snaps instead of folding, and without JavaScript the laptop just stays open.

### Fixed
- Every unit's story briefing is now shown (#88). All nineteen were written in `syllabus.yml` and
  loaded, but no page ever displayed them. The syllabus shows each one under its unit as a
  transmission in the deck's colour; the station map's tooltips and unit list open with its first
  sentence; and a unit's first module opens with it when the crew isn't briefing you on comms.
- The console no longer asks you to do something no lesson has shown you (#80). The filesystem
  module now teaches reading a file (`cat`, `less`, `head`, `tail`) and moving into a directory,
  both of which its console task already needed. Its task now asks you to read the log, the
  navigating task says how to read Okafor's note, and the users module shows the one-line
  `grep … | cut -d: -f7 > file` its task asks for, ahead of the modules that teach pipes and
  `cut`. A test now fails if any console task needs a command no lesson up to it has taught.
- With your system set to reduce motion, the relay satellite, the debris field and the aurora
  now appear as stills (#56). Since 0.4.0 they kept animating anyway, and the aurora faded in
  and out, so a still never appeared. Only the shuttle was right.

## [0.4.0] — 2026-10-09

Hands-on and the desk: a station console task in nine of Unit 1.1's ten modules, with sudo,
processes, the environment, awk and sed, and the whole app on a computer at a pixel-art desk,
where the crew's messages tell the unit as one story.

### Added
- All of Unit 1.1 is told on the desk's comms log (#45): ten days of bringing the *Meridian*'s
  life support back, from the first boot to the last green light, with Okafor, MERIDIAN and
  Mission Control. Every briefing, every console task's reply and every debrief is a short
  conversation, and the numbers the station quotes are the ones in your console.
- Three more things happen outside the window: a relay satellite rises as comms come back
  (navigating), a debris field drifts past and sets off the runaway scan (processes and signals),
  and an aurora shimmers over the Earth when the unit is finished (packages). Window events can
  now play at any beat: opening a module, passing its console task, or completing it (#45).
- The desk's monitor looks like a computer (#46): a pixel-art gunmetal case with a bevelled
  bezel, a "MERIDIAN" maker's plate, buttons and a power light in the deck's colour, on a neck
  and foot on the desk. The screen is glass, with faint scanlines, a soft glare and darker
  corners, and its light spills onto the bezel. Lesson text keeps better than 7:1 contrast.
- The desk (#38). Orbit Ops is now a first-person scene: a pixel-art room on the *Meridian*,
  with a window onto the Earth and a docking arm, a desk with a keyboard, a lamp and a coffee mug,
  and the whole app on the monitor in front of you. Desktop browsers only, 1280×720 and up.
  - **A comms log** beside every page holds every message the crew has sent you, in order: Chief
    Engineer Okafor, MERIDIAN (the station's own terse status lines) and Mission Control (with a
    light-delay stamp). New messages arrive one at a time after "… is typing"; Escape or a click
    brings them all in.
  - **Permissions and ownership is the first module told this way:** its briefing arrives on
    comms, passing its console task gets Okafor's reply, and completing it brings the debrief
    while the supply shuttle *Kestrel* docks outside the window.
  - The art is code (`art/`), checked by a test that redraws it, and the CSP is unchanged.
    Under reduced motion messages appear at once and the shuttle is a still, docked.
- Station console tasks in four more Unit 1.1 modules: find the life-support logs
  (filesystem), follow Okafor's hidden note (navigating), capture both output streams for the
  reactor report (pipes and redirection), and find the three noisiest addresses in the docking
  log (text tools). Six of the ten modules now have one (#36).
- The console understands `2>&1` and `&>` (applied left to right, as in bash), `tee`, and
  `cd -` (#36).
- The console now knows users, the environment and processes (#37):
  - **Users:** `sudo` with a real password prompt (masked, never logged or kept in history),
    `sudo -l`/`-i`, and `id`, `groups`, `getent` and `usermod` over generated `/etc/passwd` and
    `/etc/group`. `usermod -G` without `-a` really does take your other groups away, `sudo` included.
  - **Environment:** shell vs exported variables, `VAR=x cmd`, `bash -c` and scripts in a child
    shell, `source`, and commands found on `$PATH`, so a different `python3` earlier on the
    PATH really runs instead.
  - **Processes:** `ps`, `pgrep`, `pkill`, `kill` with signals, background jobs and `jobs`/`fg`,
    on a simulated clock. A process can ignore SIGTERM.
  - **Three new tasks:** join the airlock group without losing sudo (users and sudo), stop a
    runaway diagnostic politely and then impolitely (processes and signals), and make the
    navigation `python3` win and stick (environment and PATH). Nine of Unit 1.1's ten modules
    now have a console task.
- The console has a small `awk` (`-F`, `pattern { print $N }`, `BEGIN`/`END`, comparisons and
  regex matches) and `sed` (`s///g` with groups, `-n`/`p`, `d`, `q`, line and regex addresses,
  `-i.bak`), enough for the text-tools lesson's own pipelines. Anything beyond them says it isn't
  supported rather than giving a wrong answer (#41).
- Every exercise carries a reference solution that CI runs through the console's shell, so a
  task that can't be completed fails the build. Solutions are never sent to the browser (#36).

### Changed
- The starfield behind every page is gone: the desk's window shows real space now (#38).
- Phones are no longer supported: Orbit Ops is built for desktop browsers (#38).

## [0.3.0] — 2026-10-09

Gamify: XP and ranks, a daily streak with freezes, badges, the station map, a station that looks
the part, and the station console for hands-on terminal practice.

### Added
- A database table for the XP ledger: every award is a row saying what earned it, and totals,
  levels and ranks will be summed from it rather than stored. The database refuses to record the
  same award twice (#21).
- XP and ranks. Completing a module earns its XP (50 by default), plus 20 for a perfect quiz,
  once per module no matter how often it is re-answered. Levels follow a curve (level 2 at 100
  XP, level 10 at 2700) and rank titles run from Cadet to Station Commander, defined in
  `syllabus.yml`. The completion message shows the XP earned and announces promotions; the
  dashboard shows level, rank and a bar to the next level (#21).
- A database table for the daily streak: one row per day that counts, either a day with activity
  or a missed day bridged by a freeze. The streak itself is worked out from it (#22).
- A daily streak. Completing a module marks the day (in `APP_TIMEZONE`) active, and the dashboard
  shows the streak, the freezes banked and whether today's log entry is filed yet. Every 7th
  active day banks a freeze (up to 2), and a missed day is bridged automatically if the freezes
  cover the whole gap; otherwise the streak starts again. Nothing runs at midnight: the streak is
  worked out when a page is opened (#22).
- A database table for badges: one row per badge a learner holds, recorded once. What each badge
  is and how it's earned will live in `syllabus.yml` (#23).
- Badges. Finishing a unit, reaching a 7-, 30- or 100-day streak, and a first perfect quiz each
  earn a badge, once. They are defined in `syllabus.yml` (one per unit, 23 in all) and checked
  in CI, so a badge pointing at a unit that doesn't exist fails the build. The completion message
  announces new badges, the dashboard shows the three most recent, and a new Badges page lists
  every badge: earned ones with their date, locked ones dimmed with what it takes to earn them.
  A unit finished before badges existed earns its badge at the next module completion (#23).
- A station map (`/map`, linked from the nav and the dashboard). The syllabus is drawn as the
  *Meridian*: one deck per track, one node per unit, and a line from each prerequisite to the
  unit that needs it. Complete units are lit, ones ready to start pulse, and locked ones are
  dimmed; each node links to its unit on the syllabus and its tooltip gives progress and what
  it's waiting on. A plain list below the drawing carries the same information. Positions come
  from `map: {x, y}` in `syllabus.yml`, with an automatic layout for units without one. No
  JavaScript, and the CSP is unchanged (#24).
- On a narrow phone the top bar shows only the ◎ mark, to fit the four links (#24).
- The station feels like a station (#18):
  - Each deck has its own colour (Life Support teal, Cargo & Fabrication amber, Fleet Command
    violet, Comms, Sensors & Shields rose), carried by its module pages, its syllabus section,
    the mission card and the map.
  - Briefings arrive as an incoming transmission that types itself out; a click or any key shows
    it all at once.
  - A slow starfield drifts behind every page.
  - A console readout under the top bar shows "Systems online 1/10 · Streak 3".
  - The Life Support units have line-art emblems (an air scrubber, a script, a branch, a comms
    dish, a reactor).
  - Completing a module powers up the "System restored" banner.
  - Under the system's reduced-motion setting nothing moves and briefings appear in full. The
    Content-Security-Policy is unchanged.
- The station console: hands-on terminal exercises inside a module (#17). A module can set a
  task over a filesystem it defines, and you do it by typing real commands into a console on the
  page: `ls -l`, `chmod`, `mv`, globs, pipes, redirection, history, Tab completion and Ctrl-C,
  with an on-screen key row on phones. The shell is simulated in the browser, so nothing runs on
  the server. Permissions are enforced as for a normal user. The console says when the task is
  done, and the server re-checks the final filesystem against the module's own checks before
  recording it, so the browser's word isn't taken for it. The first two exercises are in
  "Making, moving and matching files" and "Permissions and ownership". Unsupported commands say
  so and the console carries on.
- Right and wrong quiz answers keep fixed colours (teal and amber) on every deck, so a deck's
  colour never makes them look alike (#18).

## [0.2.0] — 2026-10-08

The learn loop: the full syllabus, Unit 1.1's ten Linux modules, quizzes that complete a
module and unlock the next, and today's mission on the bridge.

### Added
- The curriculum is now content: lessons are Markdown files with YAML front matter under
  `content/`, organised by `syllabus.yml` into tracks and units. The whole curriculum is
  validated at startup and in CI, so a lesson with a broken quiz fails the build with the file
  and field named, rather than breaking a page in production (#4).
- A module page with the story briefing, the lesson (syntax-highlighted code, tables) and the
  quiz, plus a syllabus page listing every track, unit and module. Quiz answers and
  explanations never reach the browser (#4).
- The first module, "The filesystem tree", and `docs/content-authoring.md` describing the format.
- Database tables for learner progress: which modules are started or complete (with a score), and
  every quiz answer submitted. Locked and available are worked out from the syllabus, never
  stored (#5).
- The daily loop works. Quiz questions are answered one at a time and replaced in place with the
  verdict, the right answer and the explanation. Answering the last question completes the module
  with a score (the first answer to each question is the one that counts) and links to the next
  module (#5).
- Modules unlock in order, and units unlock when their prerequisite units are finished. Opening a
  locked module sends you back to the bridge with what to finish first (#5).
- The full syllabus: four tracks (Life Support, Cargo & Fabrication, Fleet Command, and Comms,
  Sensors & Shields) and 19 units, with their prerequisites and story briefings (#6).
- Unit 1.1, **Linux & the shell**, is complete with ten modules: the filesystem, navigating,
  files and globs, permissions, users and sudo, processes and signals, pipes and redirection,
  text tools, environment and PATH, and apt. Every "Try it" block was run on Ubuntu 24.04 before
  merging (#6).
- The dashboard leads with today's mission, the next available module, plus overall progress.
  The syllabus marks every module complete, available or locked (#5).

### Fixed
- `HEAD` requests now get the same status and headers as `GET`, without a body, instead of
  `405 Method Not Allowed`. Uptime monitors and link checkers that use `HEAD` saw the site as
  down (#9).

## [0.1.0] — 2026-10-08

First release: the station's skeleton, live at learn.seandesmet.com.

**Server:** `/opt/orbit-ops/.env` is set up (RUNBOOK §2). After the deploy, set the `orbit_app`
password and `DB_APP_USER`/`DB_APP_PASSWORD` (RUNBOOK §3).

### Added
- The station is built: a FastAPI app with login, a dashboard placeholder and `/healthz`
  (reports the version the image was built as, so a deploy can be verified).
- Security carried over from Budget Buddy: argon2 password hashing, signed session cookies that
  can be revoked by rotating a per-user token, CSRF on every POST (htmx header or form field), a
  login rate limit (10/min), and a nonce-based Content-Security-Policy with framing denied.
- PostgreSQL schema managed by Alembic, with a least-privilege `orbit_app` role whose grants
  extend automatically to tables added by future migrations.
- Docker image (non-root, digest-pinned base, fully pinned dependencies) and a compose file sized
  for the droplet it shares with Budget Buddy: no published database port, 256 MB caps.
- CI (ruff, tests against real Postgres, a migration round-trip, image build), changelog and
  acceptance-criteria checks, and a Release workflow that backs up, migrates, deploys and verifies
  — plus a manual Rollback.
