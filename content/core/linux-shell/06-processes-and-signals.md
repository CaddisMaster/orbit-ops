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
    q: Which shell variable holds the exit status of the last command?
    answer: ["$?"]
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
cards:
  - front: SIGTERM vs SIGKILL
    back: "SIGTERM (15, kill's default) asks nicely and can be handled. SIGKILL (9) ends the process immediately and can't be caught."
  - front: What does Ctrl-C send?
    back: "SIGINT (2) to the foreground process."
  - front: Find a process by name
    back: "`pgrep -a nginx` (or `ps aux | grep nginx`)."
---

## What's running?

Every running program is a **process** with a numeric **PID**, an owner, and a parent.

```bash
ps aux | head          # every process: user, PID, %CPU, %MEM, command
ps -ef --forest        # the same, drawn as a parent/child tree
pgrep -a uvicorn       # PIDs and command lines matching a name
top                    # live view, busiest first (q to quit; htop is nicer if installed)
```

PID 1 is the first process the kernel starts (`systemd` on most servers). In a container, PID 1
is whatever the image's `CMD` runs, for this app that's `uvicorn`.

## Signals

A **signal** is a small numbered message the kernel delivers to a process. These are the ones
you'll use:

| Signal | Number | Sent by | Meaning |
|---|---|---|---|
| `SIGTERM` | 15 | `kill` (default), `docker stop`, systemd | please shut down cleanly |
| `SIGINT` | 2 | Ctrl-C | interrupt from the keyboard |
| `SIGHUP` | 1 | closing the terminal; many daemons treat it as "reload config" | hang up |
| `SIGKILL` | 9 | `kill -9` | stop **now**, can't be caught |

```bash
kill 4821              # SIGTERM: polite
kill -9 4821           # SIGKILL: only if TERM didn't work
pkill -f diagnostics   # by matching the command line instead of a PID
```

Programs can **handle** `SIGTERM`: finish the current request, flush to disk, close
connections. `SIGKILL` gives them no chance at all, which is how half-written files and stale
lock files happen. Always try `TERM` first.

`docker stop` follows exactly this pattern: `SIGTERM`, a 10-second grace period, then
`SIGKILL`.

## Exit codes

When a process ends it returns a number: **0 means success**, anything else is failure.

```bash
ls /etc > /dev/null; echo $?      # 0
ls /nope;            echo $?      # 2
```

`&&` runs the next command only if the previous one succeeded, and `||` only if it failed. The
deploy commands in this app's release workflow chain steps that way so a failed backup stops
the deploy.

## Foreground and background

```bash
sleep 300 &        # start in the background; the shell prints its job number and PID
jobs               # list background jobs
fg %1              # bring job 1 to the foreground
# Ctrl-Z           # suspend the foreground job; then `bg` resumes it in the background
```

Background jobs still die when you close the terminal (`SIGHUP`). Anything meant to outlive
your session belongs in a service manager, which is what the systemd unit is for.

## Try it

```bash
sleep 600 &
pgrep -a sleep
kill %1            # SIGTERM via the job number
echo $?            # 0: kill succeeded in sending the signal
jobs               # [1]+ Terminated (if it still says Running, run jobs again)
ls /nope; echo $?  # a failing command's exit status
```
