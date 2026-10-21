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
    q: Which line sends both the listing **and** the error to `out.log`?
    options: ["`ls /etc /nope > out.log 2>&1`", "`ls /etc /nope 2>&1 > out.log`", "`ls /etc /nope | out.log`", "`ls /etc /nope > out.log`"]
    answer: 0
    explain: >-
      Redirections apply left to right. `> out.log` points stdout at the file, then `2>&1` points
      stderr at wherever stdout now goes. In the second form stderr is copied while stdout still
      points at the terminal, so errors don't reach the file.
  - type: fill
    q: What is the special file that discards everything written to it?
    answer: ["/dev/null"]
    explain: >-
      `ls /etc /nope > /dev/null 2>&1` runs `ls` silently, output and errors both thrown away. Reading from `/dev/null` gives nothing at
      all.
  - type: choice
    q: What does a pipe (`|`) connect?
    options:
      - "Both stdout and stderr of the left command to the right command's stdin"
      - "The left command's stdout to the right command's stdin"
      - "The right command's output back into the left one"
      - "Two files"
    answer: 1
    explain: >-
      Only stdout goes through the pipe. In `ls /etc /nope | wc -l` the error still appears on
      your terminal, and `wc` counts only the listing, unless you add `2>&1` before the `|`.
terminal:
  task: |
    The reactor monitor needs a status report for the bridge, in your home directory:

    1. `reactor.txt` must hold **both** the listing of `/station/reactor` **and** the error
       you get for `/station/reactor-b`, which is offline: one `ls` command, given both paths,
       with both streams into the file.
    2. `alerts.txt` must hold every `ALERT` line from `/station/reactor/core.log`, and nothing
       else.

    Read each file with `cat` to check it. The console checks after every command, so you're
    done the moment both files are right.
  cwd: /home/cadet
  files:
    - {path: /home/cadet, type: dir}
    - path: /station/reactor/core.log
      owner: root
      group: root
      contents: |
        02:00 reactor temperature nominal
        02:05 ALERT coolant pressure low
        02:10 reactor temperature nominal
        02:15 ALERT coolant pump 2 stalled
        02:20 operator acknowledged
        02:25 ALERT core temperature rising
        02:30 reactor temperature nominal
    - {path: /station/reactor/coolant.log, owner: root, group: root, contents: "pump 1 ok\npump 2 stalled\n"}
  checks:
    - {contains: /home/cadet/reactor.txt, text: core.log}
    - {contains: /home/cadet/reactor.txt, text: "cannot access '/station/reactor-b'"}
    - {contains: /home/cadet/alerts.txt, text: ALERT coolant pump 2 stalled}
    - {lacks: /home/cadet/alerts.txt, text: nominal}
  success: |-
    "Errors and all, in one file," Okafor says. "That's the report I can actually use."
  solution:
    - ls /station/reactor /station/reactor-b
    - ls /station/reactor /station/reactor-b > reactor.txt 2>&1
    - cat reactor.txt
    - grep ALERT /station/reactor/core.log > alerts.txt
    - wc -l alerts.txt
comms:
  open:
    - {from: mission, text: "Requesting a reactor status report for the bridge, *Meridian*. Errors included, please."}
    - {from: okafor, text: "The reactor monitor prints ten thousand lines a minute. Don't read it. Plumb it."}
  console_done:
    - {from: meridian, text: "REPORT FILED · `reactor.txt` · `alerts.txt` · 3 ALERTS"}
    - {from: okafor, text: "Errors and all, in one file. That's the report I can actually use."}
  complete:
    - {from: mission, text: "Report received. Coolant pump 2 matches what our telemetry showed. Nice work."}
    - {from: okafor, text: "Now that the reactor's talking, let's find out who's been knocking on the front door all night."}
cards:
  - id: file-descriptors
    section: "Three streams"
    front: File descriptors 0, 1, 2
    back: "0 = stdin, 1 = stdout, 2 = stderr."
  - id: truncate-vs-append
    section: "Redirection"
    front: "`>` vs `>>`"
    back: "`>` truncates then writes; `>>` appends."
  - id: tee
    section: "tee: a T-junction"
    front: Save output to a file AND see it on screen
    back: "`ls /etc | tee etc-list.txt` (`tee -a` to append)."
---

## Three streams

A running program has three standard channels for talking to the world outside it. "Std" is
short for standard:

| Number | Name | What it's for | Where it goes unless you say otherwise |
|---|---|---|---|
| 0 | **stdin**, standard input | what the program reads | your keyboard (what `rm -i` reads your `y` from) |
| 1 | **stdout**, standard output | its normal results | your terminal |
| 2 | **stderr**, standard error | its error messages | your terminal |

The number is the channel's **file descriptor** (FD), the number the program uses for it. "FD 1"
just means channel 1, normal output, and "FD 2" means channel 2, errors.

Normal output and error messages both land on your screen, so they look like one stream. But
they're **separate streams**, and you can send them to different places. One command can produce
both: `ls` takes several paths and deals with each in turn, so `ls /etc/hosts /nope` writes the
name `/etc/hosts` to stdout and complains about `/nope` on stderr.

```bash
ls /etc/hosts /nope
# ls: cannot access '/nope': No such file or directory     ← stderr, channel 2
# /etc/hosts                                               ← stdout, channel 1
```

The error comes first, even though `/nope` is the second path: `ls` checks every path it's
given before it lists any. Give it a **directory** and a missing path, and the listing gets a
heading, the directory's name and a colon, because with more than one path `ls` says which
names are in which directory:

```bash
ls /etc /nope
# ls: cannot access '/nope': No such file or directory     ← stderr
# /etc:                                                    ← the heading
# group  hosts  passwd …                                   ← what's in /etc
```

## Redirection

`>` sends a channel's output to a file in place of your screen. With no number in front, it
means channel 1: **`>` is short for `1>`**. That's also how to tell the two streams apart.
Redirect stdout, and whatever is still on your screen came from stderr:

```bash
ls /etc/hosts /nope > out.txt
# ls: cannot access '/nope': No such file or directory     ← still on screen: stderr
cat out.txt
# /etc/hosts                                               ← stdout went into the file
```

| You type | What happens |
|---|---|
| `ls /etc > files.txt` | stdout to a file, which is emptied first (truncated) |
| `ls /etc >> files.txt` | stdout added to the end of the file (appended) |
| `ls /nope 2> errors.txt` | stderr, channel 2, to a file |
| `ls /etc/hosts /nope > out.txt 2>&1` | both into one file: see below |
| `ls /etc/hosts /nope &> out.txt` | Bash's shorthand for the line above (you'll mostly see `2>&1`) |
| `cat < files.txt` | stdin read from a file, in place of the keyboard. `cat` prints the same either way; `<` matters for commands such as `wc` (see *Pipes*) |

**`>` and `>>` create the file if it isn't there**, so there's nothing to `touch` first. If it
is there, **`>` empties it without asking**: the old contents are gone, with no undo, as with
`rm`. Use `>>` to add to a file you want to keep. Like `rm`, a redirection prints nothing when it
works, so check the file with `cat`.

`grep` (module 05) and `>` together keep just the lines you want. `grep root /etc/passwd >
root-lines.txt` writes every line of `/etc/passwd` that contains `root` into `root-lines.txt`,
and nothing else.

On screen, `ls` sets names side by side to save room. Into a file or a pipe it writes **one
name per line**, so `cat` of the file shows a list, and `wc -l` counts names. Nothing went wrong
when the layout changes.

### `2>&1`, piece by piece

`2>&1` sends errors to the same place as normal output. In pieces:

- `2>` redirects channel 2, stderr;
- `&1` sends it to channel 1. The `&` says `1` is a channel number. Without it, `2>1` would write
  the errors into a file called `1`.

It's the same key as module 06's `&`, with a different job. Inside a redirection (`2>&1`, `&>`)
it never sends anything to the background: only an `&` at the very end of a command does that.

So `2>&1` means "send channel 2 to wherever channel 1 is going **right now**". The shell reads
redirections **left to right**, one step at a time, so their order matters:

| You type | First | Then | Result |
|---|---|---|---|
| `ls /etc/hosts /nope > out.txt 2>&1` | channel 1 now goes to `out.txt` | channel 2 goes where channel 1 goes now: `out.txt` | both in the file |
| `ls /etc/hosts /nope 2>&1 > out.txt` | channel 2 goes where channel 1 goes now: your screen | channel 1 now goes to `out.txt` | the error still on screen |

In the first line both end up in `out.txt`. In the second, channel 2 copied where channel 1 was
going before it moved, so the error never reaches the file.

### Throwing output away

`/dev/null` is a special file that throws away whatever is written to it. It never fills up and
never keeps anything, so reading it gives nothing at all. Send output there when you want a command to run but don't want to see
what it says:

```bash
ls /etc > /dev/null                      # the listing vanishes
ls /etc/hosts /nope > /dev/null 2>&1     # silent: output and errors both gone
```

## Pipes

A pipe, `|`, connects one command's **stdout** to the next command's **stdin**. What the left
command would have printed on your screen becomes what the right command reads, and the two run
at the same time. Two small tools get you a long way with pipes, here and in the console:

| Command | Does |
|---|---|
| `grep WORD FILE` | prints only the lines of FILE that contain WORD. With no FILE, it reads stdin: what a `\|` hands it |
| `wc -l FILE` | **w**ord **c**ount: `-l` counts the **l**ines, and prints the count and the name: `12 notes.log`. `wc -l < FILE` prints just the number, as `wc` reads stdin and never learns the name |

```bash
ls /etc | wc -l          # wc counts the listing's lines: you see only the number
ls /etc | grep host      # only the names in /etc that contain "host"
```

**Only stdout goes through a pipe.** Errors skip it and still land on your screen:

```bash
ls /etc/hosts /nope | wc -l
# ls: cannot access '/nope': No such file or directory     ← stderr, straight to the screen
# 1                                                        ← wc counted stdout's one line
ls /etc/hosts /nope 2>&1 | wc -l
# 2                                                        ← 2>&1 first: both went through
```

**To send errors down a pipe too, put `2>&1` before the `|`.** It belongs to the command on
its left, so `ls /etc/hosts /nope | wc -l 2>&1` changes `wc`'s errors, not `ls`'s.

Small tools that each do one thing, chained together, is the core Unix idea. The next module is
the tools that make it powerful.

## tee: a T-junction

Once output goes into a pipe or a file, you no longer see it. `tee` is named after a T-shaped
pipe fitting: it writes what it reads into a file **and** passes it on, to your screen or to the
next command. So you can watch something and keep a copy at the same time. `tee -a` appends
instead of emptying the file first.

```bash
ls /etc | tee etc-list.txt            # see the listing, and keep it in etc-list.txt
ls /etc/hosts /nope 2>&1 | tee both.log   # see both lines, error included, and keep them
```

## Try it

Run these one at a time, on a Linux machine or in the station console:

```bash
cd ~                                 # home, where you can write files
ls /etc/hosts /nope                  # two lines: which one is stderr?
ls /etc/hosts /nope > out.txt        # the error still shows: it's on stderr
cat out.txt                          # only /etc/hosts
ls /etc/hosts /nope > out.txt 2>&1   # now both are in the file
wc -l < out.txt                      # 2
ls /etc/hosts /nope 2>&1 > out.txt   # wrong order: the error is still on screen
cat out.txt                          # only /etc/hosts again
echo first > notes.txt               # > creates notes.txt
echo second >> notes.txt             # >> adds a line to it
cat notes.txt                        # first, then second
echo again > notes.txt               # > empties it first
cat notes.txt                        # only again
ls /etc/hosts /nope > /dev/null 2>&1 # prints nothing at all
ls /etc/hosts /nope | wc -l          # the error skips the pipe, so wc counts 1
ls /etc/hosts /nope 2>&1 | wc -l     # 2: 2>&1 before the pipe sends both through
ls /etc | tee etc-list.txt | wc -l   # tee keeps the listing and passes it on to wc
cat etc-list.txt                     # the copy tee kept
```

The wrong-order line copies channel 2 to the screen before channel 1 moves, so the error stays
on screen and `out.txt` holds only the listing. The `notes.txt` lines show `>>` adding and `>`
replacing. The `/dev/null` line shows nothing,
because both streams went into it. With `2>&1` before the `|`, `wc` counts the error's line
too. After the `tee` line you see only `wc`'s number, since `tee`
passed the listing on to `wc` instead of the screen, and `cat etc-list.txt` shows the copy it
kept.
