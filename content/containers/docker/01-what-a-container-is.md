---
# No console task: a lab (#447). Docker can't run in the browser, so this runs on the learner's own
# machine, and the server checks what they paste.
title: What a container is
minutes: 20
story: |
  **Mission log, day 56.** The fabrication bay runs every job in a container: the fabricator, the
  scanner, the label printer, each one packed with exactly what it needs. Okafor won't let anyone
  near the fabricator who hasn't run a container of their own. "Install it, run one, look inside
  it," he says. "Then we'll talk about the fabricator."
quiz:
  - type: choice
    q: "On a Linux machine, `docker version` prints this. What's wrong?"
    code: |-
      Client: Docker Engine - Community
       Version:           29.7.2
       API version:       1.55
      failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running
    options:
      - "The `docker` command isn't installed, so it needs installing first"
      - "There's no image on the machine yet, so it needs `docker pull` first"
      - "The client works, but the engine isn't running: start it, with `sudo systemctl start docker`"
      - "The client and the engine are different versions, so both need upgrading"
    answer: 2
    explain: >-
      The `Client:` half printed, so the `docker` command is there. The `Server:` half is missing, and
      the error says the client couldn't reach the engine. On Linux the engine is a service, started
      with `systemctl`; on a Mac or Windows, start Docker Desktop. Images have nothing to do with it:
      `docker version` doesn't touch any.
  - type: choice
    q: "On a fresh machine you run `docker run alpine:3.24 echo hi` three times, without `--rm`. What's on the machine afterwards?"
    options:
      - "One image, and three stopped containers made from it"
      - "Three images, one for each run, and no containers"
      - "One image, and one container that ran three times"
      - "Nothing: each container deleted itself, and so did the image"
    answer: 0
    explain: >-
      The first run pulled the image, and the other two found it already there. Each `docker run`
      makes a **new** container from the image, and without `--rm` a container that has finished
      stays on the machine, stopped, until it's removed.
  - type: choice
    q: "On a Mac, what does `docker run --rm alpine:3.24 uname -s` print?"
    options:
      - "`Darwin`, because the container uses the Mac's own kernel"
      - "Nothing: `uname` only works on the machine itself"
      - "`Alpine`, because that's the image the container came from"
      - "`Linux`, because the container runs on the Linux that Docker Desktop starts"
    answer: 3
    explain: >-
      A container uses the kernel of the machine it runs on, and Linux containers need a Linux one.
      So on a Mac or Windows, Docker runs a small Linux machine of its own, and the containers run
      there. `uname -s` names the kernel, `Linux`. The image only decides the files, which is why
      `/etc/os-release` says Alpine.
  - type: fill
    q: "Which option to `docker run` removes the container as soon as its command ends?"
    answer: ["--rm"]
    explain: >-
      `--rm`. Without it, the stopped container stays behind, and `docker ps -a` lists every one of
      them.
  - type: choice
    q: "What does a container share with the machine it runs on?"
    options:
      - "Its files: a container reads and writes the machine's own folders"
      - "The kernel: it's an ordinary process with its own view of the machine"
      - "Nothing: each container is a complete computer with its own kernel"
      - "Its users and passwords, from the machine's `/etc/passwd`"
    answer: 1
    explain: >-
      A container is a process on the machine's kernel. What it gets of its own is the view: its files
      come from the image, its process list starts at 1, and it has its own hostname. A virtual machine
      is the one with a kernel of its own.
cards:
  - id: image-and-container
    section: "Images and containers"
    front: What's the difference between an image and a container?
    back: "An image is the packed, read-only files and settings for a program. A container is one run of it: many containers can come from one image."
  - id: shares-the-kernel
    section: "A container is a process"
    front: What does a container share with its host, and what does it get of its own?
    back: "It shares the kernel. It gets its own view: files from the image, a process list where its program is PID 1, and its own hostname."
  - id: client-and-engine
    section: "Installing Docker"
    front: "`docker version` prints `Client:` but no `Server:`. What's wrong?"
    back: "The engine isn't running, or the client can't reach it. Start Docker Desktop, or on Linux `sudo systemctl start docker`."
  - id: rm-and-it
    section: "Running a container"
    front: "What do `--rm` and `-it` do on `docker run`?"
    back: "`--rm` removes the container when its command ends. `-it` keeps its input open and gives it a terminal, so you can type into a shell inside it."
lab:
  from: okafor
  task: |-
    Get Docker working on your own machine, run your first containers, and look around inside one.

    1. Install Docker as the lesson's *Installing Docker* says for your system, and start it. On
       Linux, add yourself to the `docker` group and log in again.
    2. Run `docker version`, and paste everything it prints in the first box.
    3. Run `docker run --rm hello-world`, and paste everything it prints in the second box.
    4. Start a shell in an Alpine container with `docker run --rm -it alpine:3.24 sh`. At its `/ #`
       prompt, run these three, one at a time, then `exit`:
       1. `grep PRETTY_NAME /etc/os-release`
       2. `uname -s`
       3. `ps`

       Paste everything from the first `/ #` prompt to `exit` in the third box. On Windows, if Git
       Bash says `the input device is not a TTY`, the lesson's *Installing Docker* says what to do.
    5. Now leave a container behind on purpose, find it, and remove it. Run these three, one at a
       time, and paste what they print in the last box:
       1. `docker run --name cargo-check alpine:3.24 echo still here`
       2. `docker ps -a --filter name=cargo-check --format "{{.Names}} {{.Status}}"`
       3. `docker rm cargo-check`
  boxes:
    - prompt: What `docker version` prints.
      checks:
        - {regex: '^Client:', says: "The docker command runs: its Client half printed"}
        - {regex: '^Server:', says: "The engine answered: its Server half printed", hint: "Is the engine running? Start Docker Desktop, or on Linux the docker service."}
        - {regex: '^\s+Version:\s+\d+\.\d+', says: "Versions are listed"}
        - {not_contains: "permission denied", says: "You're allowed to use the engine", hint: "On Linux: are you in the docker group, and did you log in again after joining it? On Windows: is Docker Desktop running?"}
        - {not_contains: "failed to connect", says: "The client reached the engine", hint: "Is the engine running? Start Docker Desktop, or on Linux the docker service."}
        - {not_contains: "Cannot connect", says: "The client reached the engine (older versions' wording)", hint: "Is the engine running? Start Docker Desktop, or on Linux the docker service."}
      example: |
        Client: Docker Engine - Community
         Version:           29.7.2
         API version:       1.55
         Go version:        go1.26.5
         Git commit:        a7dcaa6
         Built:             Wed Aug  5 18:28:15 2026
         OS/Arch:           linux/arm64
         Context:           default

        Server: Docker Engine - Community
         Engine:
          Version:          29.7.2
          API version:      1.55 (minimum version 1.40)
          Go version:       go1.26.5
          Git commit:       6a43e3d
          Built:            Wed Aug  5 18:28:15 2026
          OS/Arch:          linux/arm64
          Experimental:     false
         containerd:
          Version:          v2.3.3
          GitCommit:        aad11006b869517fcd3009450b6f82da282e1a9b
         runc:
          Version:          1.4.3
          GitCommit:        v1.4.3-0-gbb14dabe
         docker-init:
          Version:          0.19.0
          GitCommit:        de40ad0
    - prompt: What `docker run --rm hello-world` prints.
      checks:
        - {contains: "Hello from Docker!", says: "The hello-world container ran and printed its greeting"}
        - {contains: "your installation appears to be working correctly", says: "Docker says the installation works"}
      example: |
        Unable to find image 'hello-world:latest' locally
        latest: Pulling from library/hello-world
        58dee6a49ef1: Pulling fs layer
        c3bdf82c34d1: Download complete
        58dee6a49ef1: Download complete
        58dee6a49ef1: Pull complete
        Digest: sha256:1e4c05b897a751332ce85c7e9449da2d93514ea2dea6dbb0e2753c9e949b2bfa
        Status: Downloaded newer image for hello-world:latest

        Hello from Docker!
        This message shows that your installation appears to be working correctly.

        To generate this message, Docker took the following steps:
         1. The Docker client contacted the Docker daemon.
         2. The Docker daemon pulled the "hello-world" image from the Docker Hub.
            (arm64v8)
         3. The Docker daemon created a new container from that image which runs the
            executable that produces the output you are currently reading.
         4. The Docker daemon streamed that output to the Docker client, which sent it
            to your terminal.

        To try something more ambitious, you can run an Ubuntu container with:
         $ docker run -it ubuntu bash

        Share images, automate workflows, and more with a free Docker ID:
         https://hub.docker.com/

        For more examples and ideas, visit:
         https://docs.docker.com/get-started/
    - prompt: "Your session inside the Alpine container, from the first `/ #` prompt to `exit`."
      checks:
        - {contains: 'PRETTY_NAME="Alpine Linux v3.24"', says: "Inside, the files are the image's: Alpine 3.24", hint: "Was the container started from alpine:3.24, and was the grep run at its / # prompt?"}
        - {regex: '^Linux\s*$', says: "uname -s names the kernel: Linux, whatever machine you're on"}
        - {regex: '^\s*1\s+root\s+\S+\s+sh\s*$', says: "ps shows the container's shell as process 1", hint: "Was ps run at the container's / # prompt, not on your own machine?"}
        - {regex: '^\s*PID\s+USER', says: "The whole ps listing, with its heading"}
        - {regex: '/ # exit', says: "You left the shell with exit"}
      example: |
        / # grep PRETTY_NAME /etc/os-release
        PRETTY_NAME="Alpine Linux v3.24"
        / # uname -s
        Linux
        / # ps
        PID   USER     TIME  COMMAND
            1 root      0:00 sh
            9 root      0:00 ps
        / # exit
    - prompt: What the three `cargo-check` commands print.
      checks:
        - {contains: "still here", says: "The container ran its echo"}
        - {regex: '^cargo-check Exited \(0\)', says: "Without --rm, the finished container stayed behind, stopped, with exit status 0", hint: "Was it run without --rm, and with --name cargo-check?"}
        - {regex: '^cargo-check\s*$', says: "docker rm removed it, printing its name", hint: "Was docker rm cargo-check run, after the listing?"}
      example: |
        still here
        cargo-check Exited (0) Less than a second ago
        cargo-check
comms:
  open:
    - {from: meridian, text: "FABRICATION BAY · JOBS: CONTAINERISED · FABRICATOR IMAGE: meridian/fabricator:stable · CADET ACCESS: NONE"}
    - {from: okafor, text: "Every job in this bay runs in a container. Same files, same settings, every time it starts."}
    - {from: okafor, text: "You don't touch the fabricator until you've run a container of your own and looked inside it."}
  lab_done:
    - {from: meridian, text: "CADET WORKSTATION · DOCKER CLIENT: OK · ENGINE: OK · TEST CONTAINERS: 3 · LEFT BEHIND: 0"}
    - {from: okafor, text: "Three containers run, and you cleaned up the one you left. That's the habit I want."}
  complete:
    - {from: okafor, text: "A container is just a process that thinks it has the place to itself. Remember that when one misbehaves."}
    - {from: meridian, text: "CADET ACCESS · FABRICATION BAY: OBSERVER"}
---

## Images and containers

**Docker packs a program together with everything it needs into an image**, so it runs the same on
any machine.

**An image is the packed files and settings for a program. It's read-only: running it never
changes it.** **A container is one run of an image**, with a thin layer of its own on top where it
can write. **Many containers can come from one image**, the way many jobs can run from one blueprint.

An image's name can end in a **tag**, after a colon: `alpine:3.24` is version 3.24 of Alpine, a tiny
Linux. **A name with no tag means the tag `latest`**: `hello-world` is `hello-world:latest`, Docker's
own test image, which prints a greeting and stops. Module 02 is all about names.

## A container is a process

**A container is an ordinary process on the machine, and it shares the machine's kernel**, the core
of the operating system that runs every program. What makes it a container is **its own view of the
machine**:

- **its files come from the image**, not from the machine's disk. **`/etc/os-release` is the file
  that names a Linux system's distribution, so inside an Alpine container it says Alpine**, whatever
  your own machine runs.
- **its process list starts at 1, and process 1 is the container's own program**, whatever else runs
  on the machine
- **it has its own hostname**, which Docker sets to the first 12 characters of the container's ID, the
  long hexadecimal number Docker gives every container

Linux builds that view from **namespaces**. A virtual machine, by contrast, runs a kernel of its own,
which makes it heavier and slower to start.

**Linux containers need a Linux kernel. So on a Mac or Windows, Docker runs a small Linux machine of
its own, and the containers run inside it.** That's why **`uname -s`, which names the kernel, says
`Linux` inside a container on any computer.** `uname -r` prints the kernel's version.

## Installing Docker

**Docker is two parts: the `docker` command you type, the client, and the engine that does the work.**
**The engine is a service: a program the system keeps running in the background**, also called the
daemon.

| Your machine | Install |
|---|---|
| Mac | **Docker Desktop** from docker.com. Or OrbStack, or Colima (`brew install colima docker`, then `colima start`): lighter alternatives. |
| Windows | **Docker Desktop**, which runs on WSL 2, Windows' built-in Linux, and offers to set it up. **Run `docker` in Git Bash, as in Unit 2.1.** |
| Ubuntu | **`sudo apt-get install -y docker.io`**, Ubuntu's own package. Docker's newer ones are at docs.docker.com/engine/install. |

Docker Desktop is free for personal use and learning; larger companies pay, so check before using it
at work.

**On Linux, `sudo systemctl start docker` starts the engine, and `systemctl status docker` shows
whether it's running** (`status` came up in Unit 1.1, *Packages*). **On a Mac or Windows, starting
Docker Desktop starts the engine.**

**On Windows, if Git Bash says `the input device is not a TTY`, run that command in PowerShell, or put
`winpty` in front of `docker`.** A TTY is the terminal that `-t`, below, asks for.

**On Linux, `sudo usermod -aG docker $USER` adds you to the `docker` group, so you can use Docker
without `sudo`. It takes effect when you log in again.** Be careful who you add: anyone in that group
can start a container with the whole disk in it, so it's as good as root.

**`docker version` prints a `Client:` half and a `Server:` half.** **If only the client prints, with
an error that it couldn't connect, the engine isn't running**: start it. Newer versions say `failed to
connect to the docker API`, older ones `Cannot connect to the Docker daemon`. **An error with
`permission denied` on Linux means you aren't in the `docker` group yet**, or haven't logged in again
since joining it.

## Running a container

**`docker run IMAGE COMMAND` makes a new container from the image and runs the command in it.** **If
the image isn't on your machine, `run` downloads it first**, from Docker Hub, the public library of
images, and says `Unable to find image … locally` as it does. The next run finds it already there.
**Leave the command off, and the container runs the image's own default program**: that's how
`docker run hello-world` knows what to do.

```bash
docker run alpine:3.24 echo hi
```

```text
hi
```

**When the command ends, the container stops. It isn't deleted: it stays on the machine, stopped.**
**`docker ps -a` lists every container, stopped ones too, and `docker rm NAME` deletes one, printing
its name as it does.** **`--name` gives a container a name of your own**; otherwise Docker makes one
up.

```text
$ docker run --name old-job alpine:3.24 echo done
done
$ docker ps -a --filter name=old-job
CONTAINER ID   IMAGE         COMMAND       CREATED                  STATUS                              PORTS     NAMES
1dbf153e5a6c   alpine:3.24   "echo done"   Less than a second ago   Exited (0) Less than a second ago             old-job
$ docker ps -a --filter name=old-job --format "{{.Names}} {{.Status}}"
old-job Exited (0) Less than a second ago
$ docker rm old-job
old-job
```

**`--filter name=NAME` lists only the containers with that name.** **STATUS says `Exited (0)` for a
container whose command finished with exit status 0** (Unit 1.2), and `Up` for one still running.
**`--format` picks what to print: `"{{.Names}} {{.Status}}"` prints only each container's name and
status**, one line each, instead of the whole table.

Stopped containers pile up, so **`--rm` removes the container as soon as its command ends**.

**`-it` gives you a shell inside the container: `-i` keeps its input open and `-t` gives it a
terminal.** **`sh` is the shell to ask for in Alpine: it's small enough to have no `bash`**, and
asking for `bash` fails with `executable file not found`. You get the container's own prompt, `/ #`,
where `#` means you're root inside it. **`exit` leaves the shell, and the container stops**, because
its program has ended.

```text
$ docker run --rm -it alpine:3.24 sh
/ # hostname
55bfd115234b
/ # exit
```

**On the real station:** this page came out of a container. On the droplet, Docker Engine runs this
course as `web`, from the image `ghcr.io/caddismaster/orbit-ops` each release builds, and `db`, from
`postgres:16.15`, with Budget Buddy's containers beside them.

## Try it

On a Linux machine with Docker, a Mac, or Git Bash on Windows (PowerShell has no `uname`). The first
two lines print different kernel versions on a Mac or Windows, where the container runs on Docker
Desktop's Linux, and the same one on Linux, where it runs on your own kernel.

```bash
uname -r
docker run --rm alpine:3.24 uname -r
docker run --rm alpine:3.24 cat /etc/os-release
docker run --rm alpine:3.24 hostname
docker run --rm alpine:3.24 hostname
docker run --name try-left alpine:3.24 echo left behind
docker ps -a --filter name=try-left
docker rm try-left
docker ps -a --filter name=try-left
```

The two `hostname` lines print two different names: each `run` made a new container. `try-left`
shows as `Exited (0)` until `docker rm` removes it, and the last listing has only its heading.
