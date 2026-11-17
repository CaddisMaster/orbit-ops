---
# A lab (#449), like every Docker module. Its figures (exit 3, 137, three restarts) come from the
# real runs in the examples, and MERIDIAN's lab_done line quotes them (tests/test_docker.py).
title: A container's life
minutes: 20
story: |
  **Mission log, day 58.** The fabricator's overnight cutting job keeps dying, and nobody can say
  whether it ran at all before it did. "A container that stops doesn't vanish," says Okafor. "It
  leaves a status, an exit code and every line it printed. Learn to read them, and the night shift
  can tell me what happened."
quiz:
  - type: choice
    q: "The overnight job isn't in `docker ps`. What happened, and what next?"
    code: |-
      $ docker ps --filter name=nightly-cut --format "{{.Names}} {{.Status}}"
      $ docker ps -a --filter name=nightly-cut --format "{{.Names}} {{.Status}}"
      nightly-cut Exited (2) 6 hours ago
    options:
      - "It never started: `docker ps` would list it if it had ever run"
      - "It's still running in the background, but hidden from `docker ps`"
      - "It ran and its command failed with exit status 2: read `docker logs nightly-cut`"
      - "Docker deleted it 6 hours ago, and `ps -a` lists what used to be there"
    answer: 2
    explain: >-
      `docker ps` lists only running containers; `-a` adds the stopped ones. `Exited (2)` is its
      command's exit status, so it ran and failed. The container keeps everything it printed, so
      `docker logs` shows what it said before it stopped.
  - type: choice
    q: "What does `docker logs` print for a container that stopped hours ago?"
    options:
      - "Everything it printed, from the start: logs stay until the container is removed"
      - "Nothing: logs are only kept while the container is running"
      - "An error, because you must `docker start` it before reading its logs"
      - "Only the last line it printed, as its exit message"
    answer: 0
    explain: >-
      By default Docker keeps a container's output as long as the container exists, running or
      stopped. That's why a stopped container is worth keeping until you've read it, and why `--rm`
      is for jobs you won't need to look back at.
  - type: choice
    q: "`docker stop job` takes 10 seconds, then the container shows `Exited (137)`. Why?"
    options:
      - "`docker stop` always waits 10 seconds, however the program behaves"
      - "The image is broken: 137 is Docker's code for a damaged image"
      - "The container ran out of memory while it was being stopped"
      - "The program ignored the polite SIGTERM, so after 10 seconds Docker sent SIGKILL: 128 + 9 is 137"
    answer: 3
    explain: >-
      `docker stop` sends SIGTERM, waits up to 10 seconds for the program to exit, then sends
      SIGKILL, which can't be ignored. A program killed by signal N exits with 128 + N, and SIGKILL is
      9. A program that handles SIGTERM exits at once, with its own status.
  - type: fill
    q: "Which restart policy brings a container back whenever it stops, but leaves it down if you stopped it yourself, even after Docker restarts?"
    answer: ["unless-stopped", "--restart unless-stopped"]
    explain: >-
      `unless-stopped`. `always` is the same while Docker runs, but also brings back a container you
      stopped once Docker itself restarts, after a reboot for instance.
  - type: choice
    q: "What does `docker start job-watch` do to a stopped container?"
    options:
      - "Makes a fresh container from the same image, with a new ID"
      - "Runs the same container again, with its original command, and keeps its old logs"
      - "Resumes the program exactly where it was stopped, mid-loop"
      - "Nothing until you also run `docker restart job-watch`"
    answer: 1
    explain: >-
      `start` reruns the container you already have: same ID, same name, same command, from the
      beginning. Its earlier output is still in `docker logs`, with the new run's after it.
cards:
  - id: detached
    section: "Running in the background"
    front: "What does `-d` do on `docker run`, and what does it print?"
    back: "Runs the container in the background and hands your terminal back. It prints the container's full ID."
  - id: logs-outlive-the-run
    section: "Reading what it printed"
    front: "Can you read a stopped container's output?"
    back: "Yes: `docker logs NAME` prints everything it printed, until the container is removed. `--tail N` for the last N lines, `-f` to follow."
  - id: stop-sigterm-sigkill
    section: "Stop, start and remove"
    front: "What does `docker stop` do, step by step?"
    back: "Sends SIGTERM, waits up to 10 seconds, then sends SIGKILL. Killed by SIGKILL, the status is 137 (128 + 9)."
  - id: restart-policies
    section: "Restart policies"
    front: "Name Docker's four restart policies."
    back: "`no` (the default), `on-failure` (or `on-failure:N`, at most N restarts), `always` and `unless-stopped`."
lab:
  from: okafor
  task: |-
    Run three jobs the way the night shift does, and read what each one left behind. On Windows, use
    Git Bash (module 01). Use these container names exactly. If one is already in use from an earlier
    try, step 7 removes them all.

    1. Run a job that fails:
       `docker run --name job-fail alpine:3.24 sh -c 'echo cutting panel 7; exit 3'`
    2. Run a job that keeps going, in the background:
       `docker run -d --name job-watch alpine:3.24 sh -c 'i=0; while true; do i=$((i+1)); echo "tick $i"; sleep 1; done'`
    3. Wait a few seconds. Then run these two, and paste what both print in the first box:
       1. `docker ps --filter name=job- --format "{{.Names}} {{.Status}}"`
       2. `docker ps -a --filter name=job- --format "{{.Names}} {{.Status}}"`
    4. Run `docker logs job-fail`, then `docker logs --tail 3 job-watch`, and paste what both print
       in the second box.
    5. Run `docker stop job-watch`, and wait for it: it takes a while, and the lesson says why. Then
       run `docker ps -a --filter name=job-watch --format "{{.Names}} {{.Status}}"`. Paste what both
       print in the third box.
    6. Run a job that fails, with a restart policy:
       `docker run -d --name job-retry --restart on-failure:3 alpine:3.24 sh -c 'echo attempt; exit 1'`
       Wait ten seconds. Then run
       `docker inspect job-retry --format "{{.RestartCount}} {{.State.Status}}"`. If it still says
       `restarting`, wait a little and run it again. Then run `docker logs job-retry`, and paste what
       the last `inspect` and the `logs` printed in the last box.
    7. Clean up: `docker rm -f job-fail job-watch job-retry`. It prints each name as it removes it.
  boxes:
    - prompt: "The two `docker ps` listings: without `-a`, then with it."
      checks:
        - {regex: '^job-watch Up ', says: "job-watch is running in the background", hint: "Was it started with -d, and is its loop still going?"}
        - {regex: '^job-fail Exited \(3\)', says: "job-fail stopped, with its command's exit status, 3", hint: "Was the second listing run with -a? A stopped container only shows there."}
      example: |
        job-watch Up 4 seconds
        job-watch Up 4 seconds
        job-fail Exited (3) 4 seconds ago
    - prompt: "What `docker logs` printed for the two jobs."
      checks:
        - {regex: '^cutting panel 7\s*$', says: "A stopped container's output is still there"}
        - {regex: '(?:^tick \d+\s*\n){2}^tick \d+\s*$', says: "Three lines job-watch printed", hint: "Was it --tail 3, on job-watch?"}
        - {lines: {min: 4, max: 4}, says: "Only the last three, with --tail 3: four lines in all", hint: "Was it --tail 3? Paste only what the two commands printed, not the commands."}
      example: |
        cutting panel 7
        tick 3
        tick 4
        tick 5
    - prompt: "What `docker stop` and the listing after it printed."
      checks:
        - {regex: '^job-watch\s*$', says: "docker stop printed the container's name"}
        - {regex: '^job-watch Exited \(137\)', says: "Stopped by SIGKILL after the grace period: 128 + 9", hint: "Was it stopped with docker stop, and was the listing run with -a?"}
      example: |
        job-watch
        job-watch Exited (137) Less than a second ago
    - prompt: "What `docker inspect` and `docker logs` printed for job-retry."
      checks:
        - {regex: '^3 exited\s*$', says: "Three restarts, then Docker gave up: on-failure:3", hint: "Did you wait a few seconds before inspecting? Was it --restart on-failure:3?"}
        - {regex: '^attempt\s*\n^attempt\s*\n^attempt\s*\n^attempt\s*$', says: "Four runs in its log: the first and three restarts"}
      example: |
        3 exited
        attempt
        attempt
        attempt
        attempt
comms:
  open:
    - {from: meridian, text: "FABRICATOR · NIGHT JOB nightly-cut · LAST SEEN: 02:10 · STATUS: UNKNOWN"}
    - {from: okafor, text: "The night shift says the cutting job \"just stopped\". Stopped how? Nobody looked."}
    - {from: okafor, text: "Run three jobs that end three different ways, and show me you can tell which is which."}
  lab_done:
    - {from: meridian, text: "JOB LOG · job-fail: EXIT 3 · job-watch: STOPPED, EXIT 137 · job-retry: 3 RESTARTS, GAVE UP"}
    - {from: okafor, text: "Failed, stopped, gave up. Three different endings, and each one says so. That's what I want in the night report."}
  complete:
    - {from: okafor, text: "Next time something \"just stops\", the first two commands are `docker ps -a` and `docker logs`."}
---

## Running in the background

A job that runs for hours shouldn't tie up your terminal. **`-d` runs the container in the background
and hands your terminal back, printing the container's full ID**, 64 hex characters. **`docker ps`
lists only running containers**, and **`docker ps -a` adds the stopped ones.** **`--filter name=job-`
matches every container whose name contains `job-`**, so one filter can list a whole set. With
`--format`, a listing that matches nothing prints nothing at all.

**A container's STATUS says where it is in its life:**

| STATUS | Meaning |
|---|---|
| `Up 4 seconds` | running, for that long |
| `Exited (3) 4 seconds ago` | stopped, and its command's exit status was 3 |
| `Restarting (1) Less than a second ago` | its restart policy (*Restart policies*, below) is starting it again after exit status 1 |

**The number in `Exited (N)` is the exit status of the container's command**, exactly as `$?` was in
Unit 1.2: 0 for success, anything else for a failure. Run in the foreground, **`docker run` itself
exits with that status**, so a script can test it.

## Reading what it printed

**`docker logs NAME` prints everything the container printed, running or stopped, until the
container is removed.** That's Docker's default; a container can be set to keep only the newest
lines. Either way, a stopped container is worth keeping until you've read it.

| Option | What it does |
|---|---|
| `--tail 3` | only the last 3 lines |
| `-f` | keeps following new lines as they come, until Ctrl-C |

**Ctrl-C on `docker logs -f` stops the following, not the container.**

## Stop, start and remove

**`docker stop NAME` asks the program to stop with SIGTERM, waits up to 10 seconds, then sends
SIGKILL**, the signals from Unit 1.1, *Processes and signals*. It prints the name when it's done. A
program that handles SIGTERM exits at once. One that ignores it is killed when the 10 seconds are up,
and **a program killed by SIGKILL exits with 137, which is 128 + 9, SIGKILL's number**.

**`sh -c '…'` runs its quoted text in a new `sh`**, like `bash -c` in Unit 1.1, *Environment and
PATH*, **so in `docker run IMAGE sh -c '…'` the shell is the container's process 1.** **A program
running as process 1 ignores SIGTERM unless it sets up its own handler for it**, a `trap` on TERM for
a shell, like the `trap … EXIT` of Unit 1.2. Without one, stopping it takes the full 10 seconds.
**`-t 2` shortens the wait to 2 seconds.**

**`docker start NAME` runs the same stopped container again**: same name, same ID, same command, from
the beginning, and it prints the name. Its old output stays in `docker logs`, with the new run's after
it.

**`docker rm` refuses a running container. `docker rm -f` stops it and removes it in one go**, with
SIGKILL straight away, so save it for containers you're finished with. Both take several names, and
print each one they remove.

## Restart policies

**`--restart POLICY` on `docker run` tells Docker what to do when the container's program ends:**

| Policy | Restarts the container… |
|---|---|
| `no` | never: the default |
| `on-failure:3` | when it exits with a failure, at most 3 times, then gives up |
| `always` | whenever it stops, and again when Docker starts, even after you stopped it |
| `unless-stopped` | the same as `always`, except it stays down if you stopped it |

**A failure is any exit status but 0. `on-failure` alone restarts with no limit; `:N` sets one.**
**`docker stop` always wins while Docker runs**: a policy never fights you. The difference between
the last two shows when Docker itself restarts, after a reboot. Docker waits a little longer before
each restart, so a container that fails over and over doesn't hammer the machine.

**Each restart's output goes into the same `docker logs`, after the last run's**, so `on-failure:3`
leaves up to 4 runs' output: the first and three restarts.

**`docker inspect NAME` prints everything Docker knows about a container**, as JSON, the way `docker
image inspect` does for an image (module 02). **`{{.RestartCount}}` is how many times it was
restarted, and `{{.State.Status}}` is its state in one word: `running`, `exited` or `restarting`**,
the STATUS column without the times.

```text
$ docker run --name job-x alpine:3.24 sh -c 'exit 0'
$ docker inspect job-x --format "{{.RestartCount}} {{.State.Status}}"
0 exited
```

**On the real station:** `docker-compose.yml` gives this course's `web` and `db` containers
`restart: always`, so when the droplet reboots, both come back up without anyone logging in.

## Try it

```bash
docker run -d --name try-ticker alpine:3.24 sh -c 'while true; do date; sleep 2; done'
docker ps --filter name=try-ticker
docker logs --tail 2 try-ticker
docker stop -t 2 try-ticker
docker ps -a --filter name=try-ticker --format "{{.Names}} {{.Status}}"
docker start try-ticker
docker logs try-ticker
docker rm -f try-ticker
docker run --rm alpine:3.24 sh -c 'exit 4'
echo $?
```

`stop -t 2` takes 2 seconds instead of 10, and the status is still `Exited (137)`. After `start`, the
logs have the first run's dates, then the second run's. The last line prints `4`: `docker run` passed
on its command's exit status.

Then follow a running container's logs. The second line keeps printing a new date every 2 seconds:
press Ctrl-C after a few. The next line shows the container still `Up`: Ctrl-C stopped only the
following. The last line removes it.

```bash
docker run -d --name try-follow alpine:3.24 sh -c 'while true; do date; sleep 2; done'
docker logs -f try-follow
docker ps --filter name=try-follow --format "{{.Names}} {{.Status}}"
docker rm -f try-follow
```
