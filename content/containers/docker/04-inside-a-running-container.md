---
# A lab (#450), like every Docker module. Every output quoted here is from a real run on Docker
# Engine 29.7.2 (2026-11-17).
title: Inside a running container
minutes: 20
story: |
  **Mission log, day 59.** The bay's controller container has been running for weeks, and since this
  morning it's been cutting to the wrong tolerance. Stopping it would halt the whole bay. "Then don't
  stop it," says Okafor. "Look inside it while it runs, and find out what it was told."
quiz:
  - type: choice
    q: "Why does this fail, and what now?"
    code: |-
      $ docker exec bay-controller ps
      Error response from daemon: container ccd6dd773606cc736ac694704e0a7ae10454de83dd593c4347aa321cadfec56e is not running
    options:
      - "`ps` isn't in the image, so `exec` can't find a program to run"
      - "`exec` needs `-it` to run anything inside a container"
      - "The container has been removed, and its ID is all that's left"
      - "`exec` only works in a running container: `docker start bay-controller`, then try again"
    answer: 3
    explain: >-
      `docker exec` starts a command beside the container's running program, so there has to be one
      running. The container still exists (Docker found it by name and printed its ID): start it,
      then `exec` works. `-it` is only needed for something interactive, like a shell.
  - type: choice
    q: "You write `/tmp/calibration` inside a container with `exec`, then `docker rm -f` it and `docker run` a new one from the same image. Is the file there?"
    options:
      - "No: the file was in the old container's own layer, which went with it"
      - "Yes: `exec` writes into the image, so every new container has it"
      - "Yes, as long as the new container has the same name"
      - "Only if you `docker stop` the old one first instead of using `-f`"
    answer: 0
    explain: >-
      A container writes into its own thin layer on top of the image, which survives `stop` and
      `start` but is removed with the container. The image never changes, so a new container starts
      from it clean. Data that must outlive a container needs a volume (module 06).
  - type: choice
    q: "`bay.env` has the line `TOLERANCE=\"0.2\"`, and the container starts with `--env-file bay.env`. What does `printenv TOLERANCE` print inside it?"
    options:
      - "`0.2`, because Docker removes the quotes as a shell would"
      - "Nothing: a value in quotes is a syntax error, so the line is skipped"
      - "`\"0.2\"`, quotes and all: an env file's values are taken exactly as typed"
      - "`TOLERANCE=0.2`, the whole line"
    answer: 2
    explain: >-
      `docker run --env-file` reads each `NAME=value` line literally: no shell reads it, so quotes stay
      part of the value. Write `TOLERANCE=0.2`. (Compose's `env_file:` is read differently, and strips
      them.)
  - type: fill
    q: "What do you type to run `ps` inside the running container `bay-controller`?"
    answer: ["docker exec bay-controller ps", "docker exec -it bay-controller ps", "docker container exec bay-controller ps"]
    explain: >-
      `docker exec bay-controller ps`: the container's name, then the command, as with `docker run`.
  - type: choice
    q: "A container is started with `-e DB_PASSWORD=…`. Who can read the password?"
    options:
      - "Only the program inside the container: Docker hides it from everyone else"
      - "Anyone who can run `docker inspect` on that machine: it's in the container's settings"
      - "Nobody: Docker encrypts environment variables once the container starts"
      - "Only root on the machine, since `docker inspect` refuses everyone else"
    answer: 1
    explain: >-
      Docker keeps a container's environment in its settings, and `docker inspect` prints them for
      anyone allowed to use Docker. That's one more reason the `docker` group is as good as root
      (module 01).
cards:
  - id: exec
    section: "Running a command beside it"
    front: "How do you get a shell inside the running container `web`?"
    accept: ["docker exec -it web sh"]
    back: "`docker exec -it web sh`. Without `-it` for a one-off command: `docker exec web ps`."
  - id: env-and-env-file
    section: "Settings from outside"
    front: "Two ways to give a container environment variables on `docker run`?"
    back: "`-e NAME=value` for each one, or `--env-file FILE` with one `NAME=value` per line, which `docker run` takes exactly as typed, quotes and all."
  - id: env-in-inspect
    section: "Reading what it was told"
    front: "How do you list a container's environment variables from outside it?"
    back: "`docker inspect NAME --format '{{range .Config.Env}}{{println .}}{{end}}'`"
  - id: what-survives
    section: "What a change survives"
    front: "A file written inside a container: does it survive `stop` and `start`? `rm`?"
    back: "It survives `stop` and `start`, in the container's own layer. `rm` removes it with the container."
lab:
  from: okafor
  task: |-
    Start a stand-in for the bay's controller, then look inside it without stopping it. On Windows,
    use Git Bash with `export MSYS_NO_PATHCONV=1` (module 02): step 6 has paths starting with `/`. If
    `bay-controller` is already in use from an earlier try, `docker rm -f bay-controller` clears it.

    1. Run the setup below. It makes `~/meridian/bay-controller` with the controller's settings in
       `bay.env`. Stay in that folder.
    2. Start the controller in the background, with two settings of its own and the file's:
       `docker run -d --name bay-controller -e BAY=fabrication -e SHIFT=night --env-file bay.env alpine:3.24 sh -c 'while true; do sleep 5; done'`
    3. Ask it what it was told: run `docker exec bay-controller printenv BAY SHIFT MODE TOLERANCE`,
       and paste what it prints in the first box.
    4. See what runs inside it: run `docker exec bay-controller ps`, and paste what it prints in the
       second box.
    5. Read its settings from outside instead:
       `docker inspect bay-controller --format '{{range .Config.Env}}{{println .}}{{end}}'`. Paste what
       it prints in the third box.
    6. Find out what a change inside it survives. Run these one at a time, and paste everything they
       print in the last box:
       1. `docker exec bay-controller sh -c 'echo calibrated > /tmp/calibration'`, which prints
          nothing
       2. `docker stop -t 1 bay-controller`
       3. `docker start bay-controller`
       4. `docker exec bay-controller cat /tmp/calibration`
       5. `docker rm -f bay-controller`
       6. `docker run --rm alpine:3.24 cat /tmp/calibration`

       The last one fails on purpose.
  setup: |-
    mkdir -p ~/meridian/bay-controller && cd ~/meridian/bay-controller
    printf 'MODE=cutting\nTOLERANCE=0.2\n' > bay.env
  boxes:
    - prompt: "What `printenv` printed inside the controller."
      checks:
        - {regex: '^fabrication\s*\n^night\s*$', says: "The two settings given with -e", hint: "Were BAY and SHIFT given with -e when the container started?"}
        - {regex: '^cutting\s*\n^0\.2\s*$', says: "The two settings from bay.env", hint: "Was the container started with --env-file bay.env, from the folder the setup made?"}
        - {lines: {min: 4, max: 4}, says: "One line for each of the four names"}
      example: |
        fabrication
        night
        cutting
        0.2
    - prompt: "What `ps` printed inside the controller."
      checks:
        - {regex: '^\s*1\s+root\s+\S+\s+sh -c while true', says: "The container's own program is process 1"}
        - {regex: '^\s*\d+\s+root\s+\S+\s+ps\s*$', says: "exec's ps ran beside it, in the same container", hint: "Was it docker exec, on bay-controller while it was running?"}
      example: |
        PID   USER     TIME  COMMAND
            1 root      0:00 sh -c while true; do sleep 5; done
            7 root      0:00 sleep 5
           14 root      0:00 ps
    - prompt: "The controller's environment, read with `docker inspect`."
      checks:
        - {regex: '^BAY=fabrication\s*$', says: "BAY, from -e"}
        - {regex: '^SHIFT=night\s*$', says: "SHIFT, from -e"}
        - {regex: '^MODE=cutting\s*$', says: "MODE, from bay.env"}
        - {regex: '^TOLERANCE=0\.2\s*$', says: "TOLERANCE, from bay.env"}
        - {regex: '^PATH=', says: "PATH, which the image set", hint: "Was it the whole range … end template, printing every entry?"}
      example: |
        MODE=cutting
        TOLERANCE=0.2
        BAY=fabrication
        SHIFT=night
        PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    - prompt: "Everything the six commands printed."
      checks:
        - {regex: '^calibrated\s*$', says: "The file survived stop and start", hint: "Was the file written before the stop, and read after the start?"}
        - {contains: "No such file or directory", says: "A new container from the image doesn't have it", hint: "Was the last command a docker run of alpine:3.24, after the rm?"}
        - {regex: '^calibrated\s*$[\s\S]*No such file or directory', says: "In that order: kept, then gone"}
      example: |
        bay-controller
        bay-controller
        calibrated
        bay-controller
        cat: can't open '/tmp/calibration': No such file or directory
comms:
  open:
    - {from: meridian, text: "BAY CONTROLLER · UP 23 DAYS · CUTTING TOLERANCE: OUT OF SPEC SINCE 06:40"}
    - {from: okafor, text: "If we stop that controller, the bay stops with it. So we look inside it while it runs."}
    - {from: okafor, text: "Find out what it was told when it started, and what it's running now."}
  lab_done:
    - {from: meridian, text: "BAY CONTROLLER · INSPECTED LIVE · SETTINGS PASSED IN: 4 · CALIBRATION: SURVIVED STOP, GONE WITH rm"}
    - {from: okafor, text: "Four settings, all readable from outside. And a fix made inside lasts only as long as that container does. Remember that one."}
  complete:
    - {from: okafor, text: "Settings go in from outside, where everyone can see them. Fixes made inside a running container are a sticking plaster."}
---

## Running a command beside it

**`docker exec NAME COMMAND` runs a command inside a running container, beside its own program.**
The container's process 1 carries on as before, and the command's output comes back to your
terminal. **Inside Alpine, plain `ps` lists every process**, no `aux` needed:

```text
$ docker exec try-inside ps
PID   USER     TIME  COMMAND
    1 root      0:00 sh -c while true; do sleep 5; done
    7 root      0:00 sleep 5
   14 root      0:00 ps
```

**Process 1 is the container's own program, and `exec`'s command runs beside it**, here `ps`
itself. The `sleep 5` belongs to the loop: **`while true; do sleep 5; done` never ends, because
`true` is a command that always succeeds.** That keeps the container `Up`, with something for `exec`
to join.

**`docker exec -it NAME sh` gives you a shell inside it**, with `-it` meaning the same as on
`docker run` (module 01). **`exit` leaves that shell, and the container keeps running**, because the
shell was never its process 1. **`exec` only works on a running container**: on a stopped one,
Docker says it `is not running`.

**A `>` on your own command line is read by your own shell, on your machine**, so
`docker exec NAME echo hi > /tmp/f` writes your machine's `/tmp/f`. **To redirect inside the
container, quote the whole command for a shell in there: `docker exec NAME sh -c 'echo hi > /tmp/f'`.**
It prints nothing when it works.

| Watching it | What it shows |
|---|---|
| `docker top NAME` | the container's processes, with the PIDs the machine running them sees: on a Mac or Windows, Docker's own Linux machine |
| `docker stats --no-stream NAME` | CPU and memory use, once; without `--no-stream`, live, until Ctrl-C |

## Settings from outside

Programs read their settings from **environment variables**, the `NAME=value` pairs of Unit 1.1,
*Environment and PATH*. A container gets them when it starts, and they stay fixed: **to change a
setting, you start a new container with the new value.**

| On `docker run` | What it does |
|---|---|
| `-e NAME=value` | sets one variable; repeat it for more |
| `-e NAME` | passes on `NAME` from the environment `docker` runs in: an `export`ed variable, or one set for that one command, `NAME=value docker run …`. A plain `NAME=value` on its own line isn't passed. |
| `--env-file FILE` | sets one variable for each `NAME=value` line in FILE, a file on your machine, found from the folder you're in |

**`docker run` takes an env file's lines exactly as typed: no shell reads them, so quotes become part
of the value.** `TOLERANCE="0.2"` gives `"0.2"`, quotes and all. Blank lines and lines starting with
`#` are skipped. (Compose's `env_file:` reads its file differently, and strips the quotes.)
**`printenv NAME`, run inside the container, prints a variable's value**; given several names, it
prints one value per line, and nothing at all for a name that isn't set.

## Reading what it was told

**`docker inspect NAME` shows the settings a container started with**, from outside, without
touching it. Its environment is a list, `.Config.Env`, and
**`--format '{{range .Config.Env}}{{println .}}{{end}}'` prints it one entry per line**: `range`
goes through the list, inside it `.` is the entry it's on, and `println` prints that with a newline.
You'll see the image's own variables too, such as `PATH`. **So anyone who can run `docker inspect`
can read every setting, passwords included.**

## What a change survives

**A change made inside a container goes into the container's own layer** (module 01). **It survives
`docker stop` and `docker start`, and it's removed with the container.** **A new container from the
same image starts clean**, because the image never changes. So a fix made with `exec` lasts only as
long as that one container: anything that must last goes into the image, or into the settings it
starts with, or onto a volume (module 06).

**On the real station:** this course's `web` container gets its settings, the database password
among them, from the droplet's `.env`, which `docker-compose.yml` passes in with `env_file:`. The
app never reads that file itself: it reads its environment.

## Try it

```bash
docker run -d --name try-inside alpine:3.24 sh -c 'while true; do sleep 5; done'
docker exec try-inside hostname
docker exec try-inside ps
docker top try-inside
docker stats --no-stream try-inside
CREW=okafor docker run --rm -e CREW alpine:3.24 printenv CREW
printf 'TOLERANCE="0.2"\n' > quoted.env
docker run --rm --env-file quoted.env alpine:3.24 printenv TOLERANCE
rm quoted.env
docker stop -t 1 try-inside
docker exec try-inside hostname
docker start try-inside
docker exec -it try-inside sh
```

`hostname` prints the container's short ID. `docker top` shows the same `sh -c while true…` and
`sleep 5` as `ps`, with much larger PIDs. The `CREW=okafor` line prints `okafor`: `-e CREW` passed on
the value set for that one command. The env file's value prints as `"0.2"`, quotes and all. After the
stop, `exec` fails with `is not running`, and works again after `start`. At the last `/ #` prompt,
run `ps` and then `exit`: the listing shows the shell and `ps` beside process 1, and after `exit`,
`docker ps --filter name=try-inside` still shows it `Up`. Then clean up with
`docker rm -f try-inside`.
