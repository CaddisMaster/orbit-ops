---
title: Pipes and redirection
minutes: 20
story: |
  **Mission log, day 7.** The reactor monitor prints ten thousand lines a minute, and
  somewhere in there are the three that matter. "Don't read it," says Okafor. "Plumb it."
quiz:
  - type: choice
    q: What does `>>` do in `echo "done" >> run.log`?
    options: ["Overwrites `run.log`", "Appends to the end of `run.log`", "Reads from `run.log`", "Sends errors to `run.log`"]
    answer: 1
    explain: >-
      `>>` appends, so the file is created if missing and kept if present. A single `>` truncates
      the file first, which is how logs get wiped by accident.
  - type: choice
    q: Which line sends both normal output **and** errors to `out.log`?
    options: ["`cmd > out.log 2>&1`", "`cmd 2>&1 > out.log`", "`cmd | out.log`", "`cmd > out.log`"]
    answer: 0
    explain: >-
      Redirections apply left to right. `> out.log` points stdout at the file, then `2>&1` points
      stderr at wherever stdout now goes. In the second form stderr is copied while stdout still
      points at the terminal, so errors don't reach the file.
  - type: fill
    q: What is the special file that discards everything written to it?
    answer: ["/dev/null"]
    explain: >-
      `cmd > /dev/null 2>&1` runs a command silently. Reading from `/dev/null` gives an immediate
      end-of-file.
  - type: choice
    q: What does a pipe (`|`) connect?
    options:
      - "Both stdout and stderr of the left command to the right command's stdin"
      - "The left command's stdout to the right command's stdin"
      - "The right command's output back into the left one"
      - "Two files"
    answer: 1
    explain: >-
      Only stdout goes through the pipe. Errors still appear on your terminal unless you add
      `2>&1` before the `|` (or use `|&` in Bash).
cards:
  - front: File descriptors 0, 1, 2
    back: "0 = stdin, 1 = stdout, 2 = stderr."
  - front: "`>` vs `>>`"
    back: "`>` truncates then writes; `>>` appends."
  - front: Save output to a file AND see it on screen
    back: "`cmd | tee out.log` (`tee -a` to append)."
---

## Three streams

Every process starts with three open **file descriptors**:

| FD | Name | Default |
|---|---|---|
| 0 | stdin | your keyboard |
| 1 | stdout | your terminal |
| 2 | stderr | your terminal |

Normal output and error messages both land on your screen, but they're **separate streams**,
and you can send them to different places.

## Redirection

```bash
ls /etc > files.txt          # stdout to a file (truncates it first)
ls /etc >> files.txt         # stdout appended
ls /nope 2> errors.txt       # stderr to a file
cmd > out.log 2>&1           # both into one file (order matters!)
cmd &> out.log               # Bash shorthand for the line above
sort < names.txt             # stdin from a file
cmd > /dev/null 2>&1         # silence: throw everything away
```

### Why `2>&1` order matters

Redirections are processed **left to right**, and `2>&1` means "make FD 2 point wherever FD 1
points *right now*".

```bash
cmd > out.log 2>&1     # 1 → file, then 2 → (where 1 is) file          ✓ both in file
cmd 2>&1 > out.log     # 2 → (where 1 is) terminal, then 1 → file      ✗ errors on screen
```

## Pipes

A pipe connects one command's **stdout** to the next command's **stdin**, and they run at the
same time:

```bash
ps aux | grep uvicorn
cat /var/log/syslog | tail -n 50      # works, but `tail -n 50 /var/log/syslog` is simpler
docker compose logs web 2>&1 | grep -i error     # include stderr in what grep sees
```

Small tools that each do one thing, chained together, is the core Unix idea. Next module is the
tools that make it powerful.

## tee: a T-junction

`tee` writes its input to a file **and** passes it on:

```bash
./test.sh 2>&1 | tee test-run.log      # watch it live and keep a copy
```

## Pipelines and failure

By default a pipeline's exit status is the **last** command's. So `false | true` "succeeds".
Scripts use `set -o pipefail` so any failing stage fails the whole pipeline. This app's
`test.sh` starts with `set -euo pipefail` for exactly that reason.

## Try it

```bash
ls /etc /nope > out.txt            # the error still shows: it's on stderr
ls /etc /nope > out.txt 2>&1       # now both are in the file
wc -l < out.txt
ls /etc | wc -l                    # how many entries in /etc?
```
