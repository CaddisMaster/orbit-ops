---
# A lab (#452), like every Docker module. Every output quoted here is from a real run on Docker
# Engine 29.7.2 (2026-11-17). Nothing here prunes: a learner's machine may hold volumes they need,
# so the lab and the Try it remove only what they made, by name.
title: Volumes and bind mounts
minutes: 20
story: |
  **Mission log, day 61.** The fabricator was recreated overnight from a fresh image, and its job log
  went with the old container: a week of cuts, gone. "The container is disposable," says Okafor. "The
  log isn't. Keep it somewhere that outlives the container. And the cutting spec goes in read-only:
  nothing in that container edits the spec."
quiz:
  - type: choice
    q: "`cut-plans/` on your machine holds `plan.txt`, but this prints nothing. Why?"
    code: |-
      $ docker run --rm -v cut-plans:/plans alpine:3.24 ls /plans
      $
    options:
      - "`ls` inside Alpine hides files it didn't make, so add `-a`"
      - "A bind mount is read-only until you add `:rw`"
      - "With no `./` or `/` in front, `cut-plans` is a volume's name: Docker made a new, empty volume. Use `./cut-plans`"
      - "The folder is mounted, but files appear only after the container restarts"
    answer: 2
    explain: >-
      `-v` reads the left side as a path only when it starts with `/` or `.`; anything else names a
      volume, and a volume that doesn't exist is created empty, without a word. `docker volume ls`
      now shows a `cut-plans` volume: `docker volume rm cut-plans` removes it.
  - type: choice
    q: "A container writes `/data/scrap.txt` with `-v scrap-log:/data`, and is then removed with `docker rm -f`. Where's the file?"
    options:
      - "In the `scrap-log` volume, which the next container with `-v scrap-log:/data` sees"
      - "Gone: it was in the container's own layer, removed with it"
      - "In the image, so every new container from it has the file"
      - "In `/data` on your machine, since `-v` always uses a folder of the same name"
    answer: 0
    explain: >-
      `/data` was the volume, not the container's layer, so the write went into `scrap-log`, and
      removing the container leaves the volume alone. The image never changes, and a named volume
      lives where Docker keeps them, not in a folder of yours.
  - type: choice
    q: "On Linux, a container writes a file into a bind-mounted folder of yours, and now you can't edit it without `sudo`. What happened, and how do you stop it next time?"
    code: |-
      $ ls -ln cut-plans
      -rw-r--r-- 1    0    0  0 Nov 17 14:26 made-inside
      -rw-rw-r-- 1 1000 1000 17 Nov 17 14:26 plan.txt
    options:
      - "The folder was mounted `:ro`, so Docker locked the file: mount it without `:ro`"
      - "Docker copies files back as root after the container exits: `chown` them every time"
      - "The file is still open in the container: `docker stop` it and the owner changes back"
      - "The container ran as root, uid 0, and files keep the number they're written with: run it with `--user \"$(id -u):$(id -g)\"`"
    answer: 3
    explain: >-
      A bind mount is your own folder, and a file there is owned by whichever uid wrote it. The
      container's process was root (0), so the file is root's. `--user "$(id -u):$(id -g)"` runs it
      as your own uid and gid instead. With `:ro` it couldn't have written at all.
  - type: fill
    q: "Which command lists the volumes Docker has?"
    answer: ["docker volume ls", "docker volume list"]
    explain: >-
      `docker volume ls`: one line per volume, its driver (`local`) and its name. Add
      `--filter dangling=true` to see only the ones no container uses.
  - type: choice
    q: "The containers that used the named volume `scrap-log` were all removed with `docker rm -f`. Someone then runs `docker volume prune -a` and answers `y`. What's lost?"
    options:
      - "Nothing: `prune` only ever removes anonymous volumes"
      - "`scrap-log`: with no container using it, `-a` counts the named volume as unused"
      - "Only the containers' logs, since volumes are never pruned"
      - "Nothing yet: pruned volumes stay until Docker restarts"
    answer: 1
    explain: >-
      The containers were removed, not just stopped, so no container uses the volume any more. Plain `docker volume
      prune` takes only anonymous ones, but `-a` takes every unused volume, named ones too. Check
      `docker volume ls --filter dangling=true` before you prune, or remove by name.
cards:
  - id: volume-or-bind
    section: "Bind mounts"
    front: "In `-v LEFT:/data`, when is LEFT a folder of yours and when is it a volume?"
    back: "A path starting with `/` or `.` is a bind mount of that folder; anything else is a volume's name, created empty if it doesn't exist."
  - id: read-only-mount
    section: "Bind mounts"
    front: "How do you mount a folder so the container can read it but not change it?"
    back: "Add `:ro` at the end: `-v ./cut-plans:/plans:ro`. A write fails with `Read-only file system`."
  - id: user-flag
    section: "Whose files they are"
    front: "How do you make a container write files into a bind mount as you, not as root?"
    accept: ["--user \"$(id -u):$(id -g)\"", "--user $(id -u):$(id -g)", "-u \"$(id -u):$(id -g)\""]
    back: "`--user \"$(id -u):$(id -g)\"` on `docker run`: the process runs with your uid and gid."
  - id: volume-outlives
    section: "Named volumes"
    front: "What happens to a named volume when the container using it is removed?"
    back: "Nothing: it stays until you remove it with `docker volume rm NAME`, which refuses while a container still uses it."
  - id: prune-all
    section: "Cleaning up"
    front: "What does `-a` add to `docker volume prune`?"
    back: "Named volumes: without it, only anonymous ones go. With it, every volume no container uses, a database whose containers were removed included."
lab:
  from: okafor
  task: |-
    Keep the fabricator's job log in a named volume, share the cutting spec read-only, and see whose
    files a container makes. Work in a folder of your own, such as your home folder. On Windows, use Git
    Bash, and run `export MSYS_NO_PATHCONV=1` there first (module 02). If the `fab-log` volume or the
    `bay-specs` folder is left from an earlier try, step 6's commands clear them first.

    1. Make the volume: `docker volume create fab-log`. It prints the name.
    2. Run two jobs, each in a container that's removed when it ends (`--rm`), both writing to the
       volume:
       1. `docker run --rm -v fab-log:/log alpine:3.24 sh -c 'echo "job 1: hull plate" >> /log/jobs.txt'`
       2. `docker run --rm -v fab-log:/log alpine:3.24 sh -c 'echo "job 2: bracket" >> /log/jobs.txt'`

       Each prints nothing when it works: the line goes into the file, not to your screen.
    3. Read the log from a third container: `docker run --rm -v fab-log:/log alpine:3.24 cat /log/jobs.txt`.
       Paste what it prints in the first box.
    4. Make the spec on your machine, and mount its folder read-only in a container that reads it and
       then tries to change it:
       1. `mkdir bay-specs`
       2. `echo "tolerance 0.1 mm" > bay-specs/spec.txt`
       3. `docker run --rm -v ./bay-specs:/specs:ro alpine:3.24 sh -c 'cat /specs/spec.txt; echo 0.5 >> /specs/spec.txt'`

       Paste what the last one prints in the second box.
    5. Mount the folder without `:ro`, and make a file in it twice: first as the container's own user,
       then as you. Each run prints the uid it writes as, and the second lists the folder:
       1. `docker run --rm -v ./bay-specs:/specs alpine:3.24 sh -c 'id -u; touch /specs/made-inside'`
          (prints only the uid: `touch` says nothing when it works)
       2. `docker run --rm --user "$(id -u):$(id -g)" -v ./bay-specs:/specs alpine:3.24 sh -c 'id -u; touch /specs/made-as-me; ls /specs'`

       Paste what both print, one after the other, in the third box.
    6. Clean up: `docker volume rm fab-log`, then `rm -rf bay-specs`. If `docker volume ls` shows a
       `bay-specs` volume, from a run without `./`, remove it too: `docker volume rm bay-specs`. Then
       run `docker volume ls --filter name=fab-log`, and paste what it prints in the last box.
  boxes:
    - prompt: "What the third container printed from `/log/jobs.txt`."
      checks:
        - {contains: "job 1: hull plate", says: "The first job's line, written by a container that's gone", hint: "Did each job's container use -v fab-log:/log, the same volume name?"}
        - {contains: "job 2: bracket", says: "The second job's line, from another removed container"}
        - {regex: 'job 1: hull plate\n(?:.*\n)*?job 2: bracket', says: "Job 1 before job 2: >> added to the end", hint: "Did the second job use >>, which adds to the file, and not >, which replaces it?"}
      example: |
        job 1: hull plate
        job 2: bracket
    - prompt: "What the read-only container printed."
      checks:
        - {contains: "tolerance 0.1 mm", says: "The container read the spec from your folder", hint: "Is it -v ./bay-specs:/specs:ro, with ./ in front? Without it, Docker makes an empty volume called bay-specs."}
        - {contains: "Read-only file system", says: "The write was refused: the mount is read-only", hint: "Does the -v end in :ro?"}
      example: |
        tolerance 0.1 mm
        sh: can't create /specs/spec.txt: Read-only file system
    - prompt: "What the two runs in step 5 printed, the first run's output first."
      checks:
        - {regex: '\A\s*0\s*$', says: "The first run wrote as uid 0, the container's root", hint: "Was the first run made without --user, and is its output pasted first?"}
        - {regex: '^[1-9]\d*\s*$', says: "The second run wrote as your own uid, not 0", hint: "Was it --user \"$(id -u):$(id -g)\", with the quotes and the $( )? If you run Docker as root yourself, id -u is 0 too: use a normal user."}
        - {contains: "made-inside", says: "The first run's file is in the folder"}
        - {contains: "made-as-me", says: "The second run's file is in the folder"}
        - {contains: "spec.txt", says: "The same folder as step 4: the spec is there too"}
      example: |
        0
        1000
        made-as-me
        made-inside
        spec.txt
    - prompt: "What `docker volume ls --filter name=fab-log` printed after the clean-up."
      checks:
        - {contains: "VOLUME NAME", says: "docker volume ls ran and printed its heading"}
        - {not_contains: "fab-log", says: "The fab-log volume is gone", hint: "Did docker volume rm fab-log say volume is in use? Remove the container using it first."}
      example: |
        DRIVER    VOLUME NAME
comms:
  open:
    - {from: meridian, text: "FABRICATOR · RECREATED 02:10 · JOB LOG: LOST WITH OLD CONTAINER · CUTS ON RECORD: 0"}
    - {from: okafor, text: "A week of cuts, gone with a container. The container's disposable. The log isn't."}
    - {from: okafor, text: "Keep the log somewhere that outlives it. And the cutting spec goes in read-only."}
  lab_done:
    - {from: meridian, text: "JOB LOG · VOLUME fab-log · 2 JOBS KEPT ACROSS 3 CONTAINERS · SPEC MOUNT: READ-ONLY, WRITE REFUSED"}
    - {from: okafor, text: "Three containers, one log. Recreate the fabricator as often as you like now."}
  complete:
    - {from: okafor, text: "Containers come and go. Anything that has to stay lives in a volume, and anything they only read goes in read-only."}
---

## Where a container's data goes

Everything a container writes lands in its own layer (module 04), which goes when the container is
removed. **To keep data past a container, mount storage into it: a directory from outside that
appears at a path inside.** A write to that path goes to the storage, not the container's layer, so
removing the container leaves it alone. **`-v SOURCE:/path` on `docker run` mounts SOURCE at
`/path` inside**, and there are two kinds of SOURCE:

| Kind | `-v` | What it is | For |
|---|---|---|---|
| **named volume** | `-v scrap-log:/data` | storage Docker creates and keeps, by name | data the program owns: a database, a log |
| **bind mount** | `-v ./cut-plans:/plans` | a folder of yours, shared as it is | files you edit on your machine: config, source code |

## Named volumes

**`docker volume create NAME` makes a volume and prints its name.** **`-v NAME:/path` mounts it**;
it starts empty, and any number of containers can mount it, one after another or at once. **A volume
outlives every container that used it: it stays until `docker volume rm NAME`**, which prints the
name. **`docker volume rm` refuses with `volume is in use` while any container, even a stopped
one, still uses it**: remove that container first.

| Command | What it shows |
|---|---|
| `docker volume ls` | every volume: its driver (`local`, Docker's own storage on this machine) and name |
| `docker volume ls --filter name=NAME` | only volumes whose name contains NAME, as `--filter` does for `docker ps`; with none, just the heading |
| `docker volume inspect NAME` | its settings, as JSON, with `Mountpoint`, where Docker keeps it |

The `Mountpoint` is under `/var/lib/docker/volumes/`, which is root's on Linux and inside Docker's own
Linux machine on a Mac or Windows. **Read and write a volume through a container, never at its
`Mountpoint`.**

## Bind mounts

**A bind mount shares a folder of yours with the container, and both see the same files**: a change on
either side shows on the other at once. **`-v` reads the left side as a path only when it starts with
`/` or `.`**, so `./cut-plans` is the folder `cut-plans` in the one you're in (a `./` path needs
Docker 23 or newer). **Anything else is a volume's name: `-v cut-plans:/plans` makes a new, empty
volume called `cut-plans`, without a word**, and your folder isn't mounted at all. (A bind mount of a folder that doesn't exist creates it,
on Linux owned by root.)

**`:ro` on the end makes a mount read-only: `-v ./cut-plans:/plans:ro`.** The container can read it,
and any write fails with `Read-only file system`. Use it whenever the container has no business
changing what it's given.

## Whose files they are

**Files carry a number, the uid of whoever wrote them, not a name** (Unit 1.1, *Users and sudo*).
`ls -ln` is `ls -l` with the numbers in place of names: the owner's uid, then the group's gid. **A container's process runs as root, uid 0,
unless the image or `docker run` says otherwise, so a file it writes into a bind mount is owned by
0.** On Linux that file is root's on your machine too, and editing it needs `sudo`. **`id -u` prints
the uid a command runs as**: inside the container, it's the uid the container writes as.

**`--user "$(id -u):$(id -g)"` on `docker run` runs the container's process as your own uid and
gid.** On your machine, `id -u` prints your uid and `id -g` your main group's gid, and `$( )` puts each
command's output in its place (Unit 1.2, *Variables and quoting*). The files it writes are then
yours. **`-u` is the short form of `--user`.** Docker Desktop, on a Mac or Windows, shares your folders through its own Linux machine and
handles owners its own way, so there `ls -ln` may show other numbers; `id -u` inside the container
still says who it writes as.

## Cleaning up

**`docker system df` shows how much space images, containers, volumes and the build cache take, and
how much of it is `RECLAIMABLE`**, used by nothing. Removing things by name is always safe:
`docker rm`, `docker volume rm`. **The prune commands remove everything unused at once, and they ask
first:**

| Command | Removes |
|---|---|
| `docker volume prune` | anonymous volumes no container uses |
| `docker volume prune -a` | **every** volume no container uses, named ones too |

**An anonymous volume is one Docker makes itself, named with a long ID, when `-v /path` gives no
source or an image asks for storage.** They pile up unseen, which is what plain `prune` is for.
(`docker system prune` clears other leftovers, images and build cache among them; module 08 comes
back to it.)

**A volume counts as used while any container uses it, even a stopped one. "Unused" means no
container at all, running or stopped, uses it.** So once the containers using a volume are removed,
not just stopped, it's unused, and `prune -a` deletes it, a database's data included. **Before
pruning, `docker volume ls --filter dangling=true` lists exactly the volumes no container uses.**
This module doesn't practise prune on purpose: it can't tell your volumes from the ones you made
here, and what it deletes is gone.

**On the real station:** `docker-compose.yml` keeps this course's database in a named volume,
`postgres_data`, which Docker names `orbit-ops_postgres_data` after the project. Releases replace the
`web` container, and the data stays. On the development machine, `.:/app` bind-mounts the source code
into `web`, so an edit shows without a rebuild. The image runs as `appuser`, uid 10001, which can't
write into a folder owned by uid 1000, so commands that write files there run with
`-u "$(id -u):$(id -g)"`.

## Try it

```bash
docker volume create try-vol
docker run --rm -v try-vol:/data alpine:3.24 sh -c 'echo kept > /data/note'
docker run --rm -v try-vol:/data alpine:3.24 cat /data/note
docker volume ls --filter name=try-vol
docker volume inspect try-vol
docker run -d --name try-hold -v try-vol:/data alpine:3.24 sleep 300
docker volume rm try-vol
docker rm -f try-hold
docker volume rm try-vol
mkdir try-folder
echo here > try-folder/f
docker run --rm -v try-folder:/d alpine:3.24 ls /d
docker run --rm -v ./try-folder:/d alpine:3.24 ls /d
docker volume rm try-folder
rm -r try-folder
docker system df
docker volume ls --filter dangling=true
```

The first container prints nothing, and the second prints `kept`, written by the first, which is
gone. `inspect` shows the `Mountpoint`. The first `docker volume rm` fails with `volume is in use`
and the container's full ID, and the second, after `docker rm -f`, prints `try-vol`. Mounting
`try-folder` with no `./` lists nothing, because it's a new, empty volume; with `./` it lists `f`.
`docker volume rm try-folder` removes that stray volume, printing its name. `docker system df` and the dangling list
differ on every machine: they're there to read, and nothing here prunes.
