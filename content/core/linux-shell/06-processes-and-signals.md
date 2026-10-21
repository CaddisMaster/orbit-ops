---
title: Processes and signals
minutes: 20
story: |
  **Mission log, day 6.** A runaway diagnostic is eating all the CPU in the oxygen recycler.
  "Find it, and stop it politely," says Okafor. "If it won't listen, stop it impolitely."
quiz:
  - type: choice
    q: Which signal does `kill 1234` send if you don't name one?
    options: ["`SIGKILL` (9)", "`SIGTERM` (15)", "`SIGINT` (2)", "`SIGHUP` (1)"]
    answer: 1
    explain: >-
      `kill` sends `SIGTERM` by default: a polite request to shut down, which a program can
      handle by finishing its work and cleaning up.
  - type: choice
    q: Which signal can a process neither catch nor ignore?
    options: ["`SIGTERM`", "`SIGINT`", "`SIGKILL`", "`SIGHUP`"]
    answer: 2
    explain: >-
      The kernel ends the process immediately on `SIGKILL` (9), with no chance to save state or
      clean up. Use it only after `SIGTERM` has had a fair chance.
  - type: fill
    q: What do you type after `echo` to print the last command's exit status?
    answer: ["$?", "echo $?"]
    explain: >-
      `echo $?` right after a command prints its exit status: `0` means success, anything else is
      a failure code. Scripts and CI pipelines decide what to do next based on it.
  - type: choice
    q: What does `docker stop` do to the container's main process?
    options:
      - "Sends `SIGKILL` immediately"
      - "Sends `SIGTERM`, waits (10 seconds by default), then sends `SIGKILL`"
      - "Pauses it"
      - "Sends `SIGHUP` to reload it"
    answer: 1
    explain: >-
      That's the graceful-then-forceful pattern from this module. An app that ignores `SIGTERM`
      always takes the full 10 seconds to stop, which is a common cause of slow deploys.
terminal:
  task: |
    Something is eating all the CPU in the oxygen recycler. Find the runaway process and stop
    it: **politely first**, with SIGTERM. If it won't listen, stop it impolitely. Leave the
    recycler daemon itself, `o2-recyclerd`, running.

    The console checks after every command, so you're done the moment the runaway has stopped
    and the daemon is still running. If you send KILL before TERM, the check for asking politely
    can't pass any more: press **Reset** and start again.
  cwd: /home/cadet
  processes:
    - {command: /usr/sbin/o2-recyclerd, user: root, cpu: 1.2, mem: 0.4}
    - {command: o2-diagnostics --deep-scan, cpu: 98.7, mem: 2.1, ignores: [TERM]}
    - {command: /usr/sbin/comms-relayd, user: root, cpu: 0.3}
    - {command: nav-sync --interval 60, cpu: 0.1}
  files:
    - {path: /home/cadet, type: dir}
  checks:
    - {stopped: o2-diagnostics}
    - {signalled: o2-diagnostics, with: TERM}
    - {running: o2-recyclerd}
  success: |-
    The fans spin down. "It ignored TERM? Then KILL was the right call," Okafor says. "But you asked first. Always ask first."
  solution:
    - ps aux --sort=-%cpu | head -n 4
    - pgrep -a o2
    - pkill o2-diagnostics
    - pgrep -a o2-diagnostics
    - pkill -9 o2-diagnostics
    - pgrep -a o2
comms:
  open:
    - {from: meridian, text: "DEBRIS FIELD · BEARING 270 · CLOSEST PASS 4 KM · NO IMPACT RISK"}
    - {from: meridian, text: "DEEP-SCAN STARTED · o2-diagnostics · CPU 98.7%"}
    - {from: okafor, text: "The debris alarm kicked off a deep scan, and it's eating the oxygen recycler's CPU. Find it and stop it."}
    - {from: okafor, text: "Politely first. If it won't listen, impolitely."}
  console_done:
    - {from: meridian, text: "o2-diagnostics · SIGTERM IGNORED · SIGKILL · STOPPED · o2-recyclerd · NOMINAL"}
    - {from: okafor, text: "It ignored TERM? Then KILL was the right call. But you asked first. Always ask first."}
  complete:
    - {from: okafor, text: "The recycler's breathing easy again. So are we, literally."}
  window: {open: debris-drift}
cards:
  - id: term-vs-kill
    section: "Signals"
    front: SIGTERM vs SIGKILL
    back: "SIGTERM (15, kill's default) asks nicely, and a program can catch it. SIGKILL (9) ends the process immediately and can't be caught or ignored."
  - id: ctrl-c
    section: "Signals"
    accept: ["SIGINT"]
    front: What does Ctrl-C send?
    back: "SIGINT (2) to the foreground process."
  - id: find-a-process
    section: "What's running?"
    accept: ["pgrep -a nginx", "ps aux | grep nginx"]
    front: Find a process by name
    back: "`pgrep -a nginx` (or `ps aux | grep nginx`)."
---

## What's running?

Every running program is a **process**. Each one has a **PID** (process ID, a number no other
running process has), an owner (the user it runs as), and a **parent**, the process that started
it. Your shell is the parent of every command you type.

| Command | Shows |
|---|---|
| `ps aux` | every process: who owns it, its PID, how busy it is, and its command |
| `ps aux --sort=-%cpu \| head` | the same, the busiest first, and only the first 10 lines |
| `pgrep -a NAME` | the PID and command line of every process whose name matches NAME |
| `ps aux \| grep NAME` | the same lines of `ps aux` that contain NAME (`grep` from module 05, reading what `\|` hands it) |
| `top` | a live view, busiest first (q quits). The station console can't run full-screen programs, so use the `ps` line above there |

This is what `ps aux` prints, cut to two processes:

```text
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         612  0.0  0.1   6696  2716 ?        Ss   Oct08   0:00 /usr/sbin/cron -f
sean        4821 12.5  1.8  31200 18240 pts/0    R+   09:14   0:42 python3 report.py
```

The first line is a header, and each line after it is one process. Four columns matter for now:

| Column | Means |
|---|---|
| `USER` | the process's owner |
| `PID` | its process ID, the number you signal it by |
| `%CPU` | its share of the **CPU**, the processor that runs every program, right now. A runaway has the highest |
| `COMMAND` | the command line it was started with |

`%MEM` is its share of the memory, and the rest you can ignore for now.

**Three things in that `ps` line are new.**

- `aux` has no dash. It's an older style of option that `ps` still takes: `a` and `x` together
  mean every process, and `u` adds the user and the `%CPU` and `%MEM` columns.
- `--sort=-%cpu` is a **long option**: two dashes, a whole word, then `=` and its value. Here the
  value is the column to sort by, and the `-` in front of it means highest first.
- `|` hands `ps`'s output to `head` (module 05 used `|` the same way). `head` with no file reads
  what it's handed, and with no `-n` it keeps the first 10 lines. The header is one of them, so
  `head -n 4` keeps the header and the three busiest processes.

**What `pgrep` and `pkill` match.** A process's **name** is its program's file name: the first
word of `COMMAND`, without its path. `/usr/sbin/cron -f` is named `cron`. **`pgrep` and `pkill`
match any part of the name**, so `pgrep -a cron` also finds `anacron`, and a short NAME can
catch more than you meant. Check with `pgrep -a` before you `pkill`.

`pgrep -a` prints one line per match, the PID and then the command line: `4821 python3
report.py`. Plain `pgrep NAME`, without `-a`, prints only the PIDs. **`pgrep` prints nothing when
no process matches**, so silence after you stop something means it's gone.

PID 1 is the first process the kernel starts. On most servers it's **systemd**, the program that
starts and looks after the server's long-running services (*Unit 1.5, systemd & services*). In a
container (module 05), PID 1 is the program the container was started to run.

## Signals

A **signal** is a small numbered message the kernel delivers to a process. A program can
**catch** most signals, running its own code when one arrives, or **ignore** them: an ignored
signal does nothing, and the program carries on as if it never came. A signal it neither catches
nor ignores ends it. These are the ones you'll use:

| Signal | Number | Sent by | Meaning |
|---|---|---|---|
| `SIGTERM` | 15 | `kill` (default), `docker stop` (which stops a container), systemd | please shut down cleanly |
| `SIGINT` | 2 | Ctrl-C (hold Ctrl and press C) | interrupt from the keyboard |
| `SIGHUP` | 1 | closing the terminal; many services treat it as "reload your settings" | hang up |
| `SIGKILL` | 9 | `kill -9` | stop **now**: it can't be caught or ignored |

| Command | Sends |
|---|---|
| `kill 4821` | SIGTERM to PID 4821: polite |
| `kill -9 4821` | SIGKILL: only if TERM didn't work |
| `kill %1` | SIGTERM to job 1 (`%` means a job number, not a PID; *Foreground and background* below) |
| `pkill NAME` | SIGTERM to every process whose name matches, no PID needed |
| `pkill -9 NAME` | SIGKILL by name |
| `pkill -f TEXT` | matches anywhere in the command line (`python3 report.py`), not just the name (`python3`) |

People often drop the `SIG`: `TERM` is `SIGTERM` and `KILL` is `SIGKILL`. The `9` in `-9` is
SIGKILL's number from the table above, so `kill -9` means "send signal 9".

**`kill` and `pkill` print nothing when they work.** They only deliver the signal, and they
don't wait to see what happens. **Check that it worked:** run `pgrep -a NAME` again afterwards.
If the process is still listed, it ignored the signal, and that's when you reach for `-9`.

**You can signal only your own processes.** Another user's, root's included, fails with
`Operation not permitted` (`pkill: killing pid 612 failed: Operation not permitted`) and keeps
running. Signalling root's processes needs `sudo` (module 05).

A program that catches `SIGTERM` can finish what it's doing first: save its work to disk and
close its connections. `SIGKILL` gives it no chance at all, which is how half-written files
happen. Always try `TERM` first.

`docker stop` follows exactly this pattern: `SIGTERM`, a 10-second grace period, then
`SIGKILL`.

## Exit codes

When a process ends it returns a number, its **exit status**: **0 means success**, anything
else is failure. It isn't printed. A **variable** is a name the shell keeps a value under.
The shell keeps the last command's exit status in a variable named `?`, and `echo $?` prints it. Every command replaces it, `echo` included, so check it
straight after the command you care about.

The `$` in front of a name means "the value of this variable", and you type it. It's a different
`$` from the one at the end of the prompt, which the shell prints and you never type.
*Environment variables and PATH* covers variables properly.

```bash
cd /etc
echo $?          # 0
cd /nope         # bash: cd: /nope: No such file or directory
echo $?          # 1
```

Not every failure is `1`: `ls` exits with `2` when it can't find what you named. Many commands,
`kill` and `cd` among them, print **nothing** when they work, so an error message or a non-zero
`$?` is how you know one failed. A `kill` that delivers its signal says nothing at all, and
`echo $?` afterwards shows `0`. That only means the signal was delivered, so still check that
it worked, as above.

Three ways to run one command after another:

| You type | Runs the second command |
|---|---|
| `cd /nope; ls` | always: `;` runs one command, then the next, whatever happened |
| `cd /nope && ls` | only if the first succeeded (exit status 0), so here `ls` doesn't run |
| `cd /nope \|\| echo "no such directory"` | only if the first failed, so here the `echo` runs |

Scripts chain steps with `&&` so that one failed step stops the rest.

## Foreground and background

A command in the **foreground** has the terminal: you can't type the next one until it ends,
and Ctrl-C goes to it. A **job** is a command started from your shell, and a job in the
**background** runs while you carry on typing.

| You type | What happens |
|---|---|
| `sleep 300` | waits 300 seconds and does nothing else, which makes it handy for practising |
| `sleep 300 &` | `&` at the end starts it in the background. The prompt comes back at once, after bash prints `[1] 4821`: the job number, then the PID |
| `jobs` | lists your jobs and whether each is `Running` or finished |
| `fg %1` | brings job 1 to the foreground, so the terminal waits for it again |
| Ctrl-Z | suspends (pauses) the foreground job |
| `bg %1` | resumes a suspended job 1 in the background |
| `kill %1` | sends SIGTERM to job 1 |

The station console has `&`, `jobs`, `fg`, `bg` and `kill %1`, but not Ctrl-Z. Its `sleep`
doesn't really wait: the station's clock jumps ahead instead, so there's nothing for Ctrl-C to
interrupt.

Background jobs still die when you close the terminal (`SIGHUP`). Anything meant to outlive
your session belongs to systemd, which *Unit 1.5, systemd & services* covers.

## Try it

Run these one at a time, on a Linux machine or in the station console:

```bash
sleep 600 &
pgrep -a sleep
kill %1            # SIGTERM via the job number
echo $?            # 0: kill succeeded in sending the signal
jobs               # [1]+ Terminated, unless bash has already said so (then nothing)
ls /nope; echo $?  # 2: ls couldn't find /nope
cd /nope && ls     # cd fails, so ls doesn't run
cd /nope || echo "no such directory"   # cd fails, so the echo runs
```

Bash says `[1]+  Terminated` once, at the next prompt or when you run `jobs`, and then forgets
the job. The `+` marks your most recent job.

On a Linux machine only (not the station console), try Ctrl-C and `grep`:

```bash
sleep 30           # then press Ctrl-C: the prompt comes back at once
echo $?            # 130: 128 plus SIGINT's 2, killed by a signal
sleep 600 &
ps aux | grep sleep
kill %1
```

`ps aux | grep sleep` lists two lines: your `sleep`, and the `grep` itself, because its own
command line (something like `grep sleep`) contains the word. `pgrep` leaves itself out, which is one reason to
prefer it.
