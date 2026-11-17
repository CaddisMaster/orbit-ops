---
# A lab (#455), like every Docker module. Every output quoted here is from a real run on Docker
# Engine 29.7.2 (runc) with alpine:3.24 (2026-11-17). The setup chmods the script to 644 in the
# Dockerfile itself, so the 126 happens on every machine, Windows included, whatever modes the
# build context had.
title: When a container won't start
minutes: 20
story: |
  **Mission log, day 64.** The night shift left three failed jobs and a note: "Fabricator broken,
  didn't touch anything." The cutter never started, the sorter never started, and the press stopped
  halfway with nothing in its log. "Three failures, three different reasons," says Okafor. "Docker
  wrote down every one of them. Read what it says before anyone rebuilds anything."
quiz:
  - type: choice
    q: "The welder job printed nothing and its log is empty. What happened, and what's the fix?"
    code: |-
      $ docker inspect day-welder --format '{{.State.ExitCode}} {{.State.OOMKilled}}'
      137 true
    options:
      - "Someone ran `docker stop` on it: start it again"
      - "Its command wasn't found: check the spelling in `CMD`"
      - "It used more memory than its `--memory` limit allowed, and the kernel killed it: raise the limit, or make the job use less"
      - "The image is damaged: pull it again"
    answer: 2
    explain: >-
      137 is 128 + 9, killed by SIGKILL, and `OOMKilled` `true` says who sent it: the kernel, because
      the container went over its memory limit. A `docker stop` that ran out of patience also gives
      137, but with `OOMKilled` `false`. A program killed outright has no chance to print anything.
  - type: choice
    q: "Why does this fail, and what now?"
    code: |-
      $ docker run --name day-planer planer
      docker: Error response from daemon: Conflict. The container name "/day-planer" is already in use by container "fbe5e18d68b526dd321be6acfca82a0a93428ccf3fd5d2d08eed9c07c2e74311". You have to remove (or rename) that container to be able to reuse that name.
      $ echo $?
      125
    options:
      - "A container with that name exists already, even a stopped one: `docker rm day-planer`, or pick another name"
      - "The image `planer` is still running: `docker stop` it"
      - "125 means the image's command crashed: read `docker logs`"
      - "Container names must differ from image names: rename the image"
    answer: 0
    explain: >-
      125 means Docker itself refused, before any container started. Names are unique among all
      containers, stopped and created ones too: the failed run from earlier still holds it. A
      container and an image can share a name; they're different things.
  - type: choice
    q: "Both runs failed before the container started. Which exit code goes with which?"
    code: |-
      run A: exec: "/opt/weld.sh": permission denied
      run B: exec: "/opt/plane.sh": stat /opt/plane.sh: no such file or directory
    options:
      - "A is 127 and B is 126"
      - "A is 126, found but can't be run, and B is 127, not found"
      - "Both are 125, because Docker reported them"
      - "Both are 1, the usual failure"
    answer: 1
    explain: >-
      126: the program is there but can't run, here because it isn't executable. 127: there's no
      such program. Docker uses the same codes a shell does. 125 is for Docker's own
      refusals, such as a name in use or a flag it doesn't know.
  - type: fill
    q: "Which `docker run` flag replaces the program an image runs, so you can start a shell in an image whose own program won't run?"
    answer: ["--entrypoint", "--entrypoint sh"]
    explain: >-
      `--entrypoint sh`, before the image name. Words after the image name are then the shell's own
      arguments, such as `-c 'ls -l /opt'`.
  - type: choice
    q: "A job's container shows `Exited (137)`, and `{{.State.OOMKilled}}` is `false`. What's the likely story?"
    options:
      - "It ran out of memory, and Docker hid it"
      - "Its program wasn't found"
      - "Someone killed it: `docker kill`, or a `docker stop` it didn't answer within 10 seconds (module 03)"
      - "It finished its work normally"
    answer: 2
    explain: >-
      137 is SIGKILL, and with `OOMKilled` `false` the kernel's memory limit didn't send it. That
      leaves `docker kill`, which sends SIGKILL at once, or `docker stop` giving up after 10 seconds,
      as module 03 showed. A
      normal finish is `Exited (0)`.
cards:
  - id: exit-125-126-127
    section: "What the exit code says"
    front: "Exit codes 125, 126 and 127 from `docker run`: what does each mean?"
    back: "125: Docker itself refused (a flag, a name in use). 126: the program is there but can't run. 127: no such program."
  - id: oom-137
    section: "Out of memory"
    front: "Exit 137: how do you tell an out-of-memory kill from `docker stop`?"
    back: "`docker inspect NAME --format '{{.State.OOMKilled}}'`: `true` for the kernel's memory limit, `false` for a stop or kill."
  - id: state-fields
    section: "Asking Docker what happened"
    front: "Which `docker inspect` fields tell you why a container failed?"
    back: "`.State.Status`, `.State.ExitCode`, `.State.OOMKilled`, and `.State.Error`, Docker's own message when it couldn't start it."
  - id: entrypoint-sh
    section: "Looking inside an image that won't run"
    front: "How do you look inside an image whose own program fails at once?"
    accept: ["docker run --rm -it --entrypoint sh IMAGE", "docker run --rm --entrypoint sh IMAGE -c 'ls -l /app'"]
    back: "`docker run --rm -it --entrypoint sh IMAGE`: a shell in place of its program."
lab:
  from: okafor
  task: |-
    Find out why each of the night shift's three jobs failed, from what Docker reports, then fix the
    cutter. On Windows, use Git Bash (module 01), and run `export MSYS_NO_PATHCONV=1` there first (module 02):
    steps 3 and 4 have paths starting with `/`. If a container name below is left from an earlier try,
    step 6's first command clears them; it says `No such container` for any that are already gone,
    which is fine.

    1. Run the setup below. It makes `~/meridian/night-shift` with the cutter's script, `cut.sh`, and
       the night shift's `Dockerfile`, and builds the image `night-cutter` from them. Stay in that
       folder.
    2. **The cutter.** Run these three, one after another, and paste everything they print, in order,
       in the first box:
       1. `docker run --name night-cutter night-cutter; echo "exit $?"`
       2. `docker inspect night-cutter --format '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}'`
       3. `docker run --rm --entrypoint sh night-cutter -c 'ls -l /app'`
    3. **The sorter.** Run these two, and paste what they print in the second box:
       1. `docker run --name night-sorter night-cutter /app/sort.sh; echo "exit $?"`
       2. `docker run --rm --entrypoint sh night-cutter -c 'ls /app'`
    4. **The press**, run with a 32 MB memory limit and a command that keeps using memory (`tail`
       reading `/dev/zero`, as the lesson's *Out of memory* explains). Run these three, and paste what they print in
       the third box. The second prints nothing.
       1. `docker run --name night-press --memory 32m --memory-swap 32m alpine:3.24 tail /dev/zero; echo "exit $?"`
       2. `docker logs night-press`
       3. `docker inspect night-press --format '{{.State.ExitCode}} {{.State.OOMKilled}}'`
    5. **Fix the cutter.** Run `cat Dockerfile` and find the line that sets `cut.sh`'s mode. Change it
       in `nano` (Unit 1.2, *Reading and editing*) or any editor, using what step 2 showed and Unit
       1.1, *Permissions*. Changing `cut.sh` on your machine won't help: the `Dockerfile` sets the
       mode inside the image, after `COPY`. Then build again:
       `docker build -t night-cutter .`. Then run these, and paste everything they print in the last
       box:
       1. `docker run --name night-cutter night-cutter; echo "exit $?"`
       2. `docker rm night-cutter`
       3. `docker run --name night-cutter night-cutter; echo "exit $?"`
    6. Clean up: `docker rm night-cutter night-sorter night-press`, then `docker rmi night-cutter`,
       then `cd ~ && rm -r ~/meridian/night-shift`.
  setup: |-
    mkdir -p ~/meridian/night-shift && cd ~/meridian/night-shift
    printf '#!/bin/sh\necho "cutter: 3 hull plates cut"\n' > cut.sh
    printf 'FROM alpine:3.24\nCOPY cut.sh /app/cut.sh\nRUN chmod 644 /app/cut.sh\nCMD ["/app/cut.sh"]\n' > Dockerfile
    docker build -t night-cutter .
  boxes:
    - prompt: "What the three cutter commands printed."
      checks:
        - {contains: "permission denied", says: "Docker couldn't run cut.sh: permission denied", hint: "Did the setup's build finish, and is this the night-cutter image?"}
        - {regex: '^exit 126\s*$', says: "Exit 126: found, but it can't be run"}
        - {regex: '^created 126 false\s*$', says: "Never started (created), exit code 126, not a memory kill", hint: "Was the inspect run on the container night-cutter, with the three fields in that order?"}
        - {regex: '^-rw-r--r--\s.*cut\.sh\s*$', says: "Inside the image, cut.sh has no x bit: -rw-r--r--", hint: "Was it --entrypoint sh, before the image name, and -c 'ls -l /app' after it?"}
      example: |
        docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "/app/cut.sh": permission denied

        Run 'docker run --help' for more information
        exit 126
        created 126 false
        total 4
        -rw-r--r--    1 root     root            43 Nov 17 20:27 cut.sh
    - prompt: "What the two sorter commands printed."
      checks:
        - {contains: "no such file or directory", says: "There's no /app/sort.sh to run", hint: "Was the command after the image /app/sort.sh?"}
        - {regex: '^exit 127\s*$', says: "Exit 127: not found"}
        - {regex: '^cut\.sh\s*$', says: "The image's /app holds only cut.sh"}
      example: |
        docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "/app/sort.sh": stat /app/sort.sh: no such file or directory

        Run 'docker run --help' for more information
        exit 127
        cut.sh
    - prompt: "What the three press commands printed."
      checks:
        - {regex: '^exit 137\s*$', says: "Exit 137: killed with SIGKILL", hint: "Was it --memory 32m --memory-swap 32m? Without a limit, tail would run until you stop it."}
        - {regex: '^137 true\s*$', says: "OOMKilled is true: the memory limit killed it", hint: "Was the inspect run on night-press, with ExitCode then OOMKilled?"}
      example: |
        exit 137
        137 true
    - prompt: "What the fixed cutter's commands printed."
      checks:
        - {contains: "is already in use", says: "The first run was refused: the failed container still holds the name", hint: "Was the first run made before docker rm?"}
        - {regex: '^exit 125\s*$', says: "Exit 125: Docker itself refused"}
        - {regex: '^night-cutter\s*$', says: "docker rm removed the old container, printing its name"}
        - {contains: "cutter: 3 hull plates cut", says: "The rebuilt cutter ran its script", hint: "Does the Dockerfile's chmod give the script an x bit now, and was the image built again?"}
        - {regex: '^exit 0\s*$', says: "and exited 0"}
      example: |
        docker: Error response from daemon: Conflict. The container name "/night-cutter" is already in use by container "f0b23b20b52588890763e4ab6d08ac55fb7e6242232c34e5543f2d684839da9a". You have to remove (or rename) that container to be able to reuse that name.

        Run 'docker run --help' for more information
        exit 125
        night-cutter
        cutter: 3 hull plates cut
        exit 0
comms:
  open:
    - {from: meridian, text: "NIGHT SHIFT · 3 JOBS FAILED · cutter: NEVER STARTED · sorter: NEVER STARTED · press: STOPPED, LOG EMPTY"}
    - {from: okafor, text: "\"Didn't touch anything.\" They never do."}
    - {from: okafor, text: "Read what Docker wrote down for each one before anyone rebuilds anything. Then fix the cutter."}
  lab_done:
    - {from: meridian, text: "NIGHT SHIFT · cutter: 126, SCRIPT NOT EXECUTABLE · sorter: 127, NO SUCH FILE · press: 137, OOMKilled · cutter: FIXED, EXIT 0"}
    - {from: okafor, text: "Three failures, three exit codes, three different fixes. And not one of them needed a guess."}
  complete:
    - {from: okafor, text: "Before you change anything: the exit code, the log, and inspect's State. Docker usually tells you."}
---

## What the exit code says

**A container's exit code is your first clue**, and `docker run` hands it back as its own, so
`echo "exit $?"` right after shows it (Unit 1.2). A program's own failures are its own codes, like
module 03's `exit 3`. A few codes come from Docker or the kernel:

| Code | Means | For example |
|---|---|---|
| `125` | **Docker itself refused**, before any container ran | a flag it doesn't know, a name already in use |
| `126` | **the program is there but can't be run** | a script without its x bit: `permission denied` |
| `127` | **no such program** | a typo, or a file the image doesn't have: `no such file or directory` |
| `137` | **killed with SIGKILL**: 128 + 9 | `docker stop` after 10 s (module 03), `docker kill`, or **out of memory** |

**`docker kill NAME` sends SIGKILL at once**, with no SIGTERM and no wait, so it always gives 137;
`docker stop` gives 137 only when its 10 seconds run out.

**126 and 127 are the codes a shell gives too**: bash says 127 for a command it can't find, and 126
for one it found but can't run. Here they can come from Docker, when it can't start the container's
program at all, or from a shell inside one that can't find a command (`sh: sorter: not found`).

**Container names are unique among every container, stopped and created ones included.** A failed
`docker run --name X` still leaves container X behind, so running it again gives 125 with
`Conflict. The container name "/X" is already in use`. **`docker rm X` frees the name**, printing it.

## Asking Docker what happened

**`docker logs NAME`** (module 03) shows what the program printed, and **an empty log is a clue
too**: a program that never started, or was killed outright, printed nothing. **`docker ps -a`
shows `Created` for a container whose program never started**, and `Exited (CODE)` for one that ran.

**`docker inspect NAME` keeps the container's last state under `.State`**, and `--format` picks
fields out of it, separated by spaces:

| Field | Holds |
|---|---|
| `{{.State.Status}}` | `created` (never started), `running`, `exited` |
| `{{.State.ExitCode}}` | the exit code |
| `{{.State.OOMKilled}}` | `true` if the kernel killed it for going over its memory limit |
| `{{.State.Error}}` | Docker's own message, when it couldn't start the program |

## Out of memory

**`--memory 32m` on `docker run` caps the container at 32 MB.** **`--memory-swap` set to the same
figure stops it using swap, disk standing in for memory, so the cap is the whole limit.** Go over it
and the kernel kills the program with SIGKILL: **exit 137, nothing printed, and `OOMKilled`, short
for out-of-memory killed, `true`.**
That last field is what tells it apart from `docker stop`, which also gives 137 with `OOMKilled`
`false`. The fix is a higher limit, or a job that uses less.

**`/dev/zero` is a special file that gives zero bytes forever, and never a newline.** `tail` keeps
the last lines in memory, so on `/dev/zero` its one line grows until something stops it: a quick
way to fill a memory limit on purpose.

**On the real station:** `docker-compose.yml` gives this course's `db` and `web` a `mem_limit` of
`256m` each, so neither can take memory from Budget Buddy on the shared droplet, and `restart:
always`. If `web` went over its limit, the kernel would kill it with 137 and Docker would start it
again, and **a restart clears `OOMKilled` back to `false`**. What's left is exit code 137 and
`{{.RestartCount}}` going up, and Docker's own event log, `docker events`, which records an `oom`
event.

## Looking inside an image that won't run

**An image can name an `ENTRYPOINT`, a program that always runs, with `CMD` as its default
arguments.** Many do, so words after the image name go to that program instead of replacing it.
**`--entrypoint sh`, before the image name, runs a shell in its place**, whatever the image says,
and the words after the image are the shell's own: `docker run --rm --entrypoint sh IMAGE -c 'ls -l
/app'` lists `/app`. For an image with only a `CMD`, `docker run --rm IMAGE ls -l /app` works too
(module 07); `--entrypoint sh` works either way. `docker image inspect IMAGE --format
'{{.Config.Entrypoint}} {{.Config.Cmd}}'` shows which the image has. With `-it` and nothing after the image, it's a shell to look around in. `ls -l`
then shows each file's mode: a script needs its x bit (Unit 1.1, *Permissions*) to be run by name.

## Try it

```bash
docker run --rm alpine:3.24 sh -c 'sorter'
echo "exit $?"
docker run --rm --bogus alpine:3.24 true
echo "exit $?"
docker run --name try-crash alpine:3.24 sh -c 'echo working; exit 3'
docker inspect try-crash --format '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}'
docker ps -a --filter name=try-crash --format "{{.Names}} {{.Status}}"
docker rm try-crash
docker run --name try-missing alpine:3.24 nosuch
docker ps -a --filter name=try-missing --format "{{.Names}} {{.Status}}"
docker inspect try-missing --format '{{.State.Status}} {{.State.Error}}'
docker rm try-missing
docker run --rm --entrypoint sh nginx:1.30-alpine -c 'ls /docker-entrypoint.d'
docker image inspect nginx:1.30-alpine --format '{{.Config.Entrypoint}} {{.Config.Cmd}}'
```

The first prints `sh: sorter: not found` and `exit 127`: the shell inside said it. `--bogus` gives
`unknown flag: --bogus` and `exit 125`, Docker refusing. The crash prints `working`, then `exited 3
false`, and `docker ps -a` shows `try-crash Exited (3)` with how long ago. `nosuch` isn't a program, so
Docker can't start `try-missing` at all: exit 127, `docker ps -a` shows it `Created`, and
`inspect` prints `created` and Docker's message, ending `executable file not found in $PATH`. nginx's image has an
`ENTRYPOINT`, `[/docker-entrypoint.sh]`, with `[nginx -g daemon off;]` as its `CMD`; `--entrypoint sh`
gets past it and lists the scripts that entrypoint runs.
