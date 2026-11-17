---
# A lab (#451), like every Docker module. Every output quoted here is from a real run on Docker
# Engine 29.7.2 with nginx:1.30-alpine (2026-11-17).
title: Ports and networks
minutes: 20
story: |
  **Mission log, day 60.** The scanner has a dashboard, and the bay wants it on the console in the
  control room. Okafor wants it there and nowhere else. "Last time someone put a dashboard on the
  network, the whole station could change the cutting tolerance," he says. "Publish it to this
  machine only. And the label printer has to reach the scanner by name, not by an address that
  changes every time it's recreated."
quiz:
  - type: choice
    q: "On a server whose firewall (`ufw`, Unit 1.4) allows only SSH, someone ran this. Port 8080 still answers from the internet. Why, and what's the fix?"
    code: |-
      $ docker run -d --name dash -p 8080:80 nginx:1.30-alpine
      $ docker port dash
      80/tcp -> 0.0.0.0:8080
      80/tcp -> [::]:8080
    options:
      - "The firewall was off: `ufw` doesn't start until the server reboots"
      - "Port 8080 is always open on Linux, whatever the firewall says"
      - "nginx opens its own firewall rule, so delete the container and use another web server"
      - "Docker's published ports go around `ufw`'s rules, and `0.0.0.0` is every address: publish on `127.0.0.1:8080` instead"
    answer: 3
    explain: >-
      With no address in front, `-p` listens on every one of the machine's addresses, and Docker sets
      up its own forwarding, which `ufw`'s rules don't cover. Putting `127.0.0.1:` in front publishes it
      to the machine itself only: this course's own containers are published that way.
  - type: choice
    q: "In `-p 8088:80`, which number is the container's port?"
    options:
      - "`80`: the right-hand side is inside the container, the left on your machine"
      - "`8088`: the left-hand side is always the container's"
      - "Both: Docker opens 8088 and 80 on your machine"
      - "Neither: these are the first and last of a range of ports"
    answer: 0
    explain: >-
      `-p HOST:CONTAINER`. The program inside listens on 80, and Docker forwards your machine's 8088
      to it. Read it left to right, from where you are to where the program is.
  - type: choice
    q: "Two containers on Docker's default network can't reach each other by name: `wget: bad address 'scanner'`. What fixes it?"
    options:
      - "Publish the scanner's port with `-p`, then use its name"
      - "Give the containers names with `--name`, since they have none"
      - "Put both on a network you created, with `docker network create` and `--network`"
      - "Use `localhost` instead: every container shares one address"
    answer: 2
    explain: >-
      Containers find each other by name only on a network you created. The default one doesn't
      do names. `-p` is for reaching a container from your machine, not from another container, and
      `localhost` inside a container is that container itself.
  - type: fill
    q: "Which command lists the ports a container publishes, and where?"
    answer: ["docker port", "docker port NAME", "docker port scan-dash", "docker container port NAME", "docker container port scan-dash"]
    explain: >-
      `docker port NAME`: one line per published port, `CONTAINER-PORT/tcp -> ADDRESS:HOST-PORT`.
  - type: choice
    q: "A container runs with `-p 127.0.0.1:5002:8000`. What can reach it on port 5002?"
    options:
      - "Anything on the internet, since 5002 is published"
      - "Only programs on that same machine, like a web server in front of it"
      - "Only other containers on the same network"
      - "Nothing: `127.0.0.1` means the port is switched off"
    answer: 1
    explain: >-
      `127.0.0.1` is the machine's own loopback address (Unit 1.4), so only programs on the machine
      itself can connect. That's how this course's `web` is published: Nginx on the droplet reaches it
      there, and the internet only reaches Nginx.
cards:
  - id: publish-host-container
    section: "Publishing a port"
    front: "In `-p 127.0.0.1:8088:80`, what are the three parts?"
    back: "The address to listen on (here, this machine only), your machine's port, and the container's port."
  - id: localhost-only
    section: "Publishing a port"
    front: "Why put `127.0.0.1:` in front of a published port?"
    back: "Without it the port listens on every address, and Docker's forwarding goes around `ufw`. With it, only the machine itself can connect."
  - id: user-network-names
    section: "Containers talking to containers"
    front: "How do two containers reach each other by name?"
    back: "Put both on a network you made (`docker network create NET`, then `--network NET`). The default network doesn't do names."
  - id: docker-port
    section: "Publishing a port"
    front: "Which command shows where a container's ports are published?"
    accept: ["docker port NAME", "docker port", "docker container port NAME"]
    back: "`docker port NAME`."
lab:
  from: okafor
  task: |-
    Publish the scanner's dashboard to your machine only, then let another container reach the scanner
    by name. On Windows, use Git Bash (module 01). If port 8088 is taken on your machine, `docker run`
    says `port is already allocated`: run `docker rm scan-dash`, as the lesson says, then pick another
    port and use it everywhere this says 8088. If a name or `bay-net` is left from an earlier try,
    step 6's commands clear them.

    1. Start the dashboard, a web server, published on your machine's loopback address only:
       `docker run -d --name scan-dash -p 127.0.0.1:8088:80 nginx:1.30-alpine`
    2. Run `docker port scan-dash`, and paste what it prints in the first box.
    3. Ask it for its page from your machine: `curl -s http://127.0.0.1:8088/ | grep title`. If
       nothing prints, nginx may still be starting: wait a second and run it again. Paste what it
       prints in the second box.
    4. Make a network and start the scanner on it, with no port published:
       1. `docker network create bay-net`
       2. `docker run -d --name scanner --network bay-net nginx:1.30-alpine`
       3. From another container on the same network, ask for its page by name:
          `docker run --rm --network bay-net alpine:3.24 wget -qO- http://scanner/ | grep title`

       Paste what the last one prints in the third box.
    5. Try the same from a container on Docker's default network, with no `--network`:
       `docker run --rm alpine:3.24 wget -qO- http://scanner/`. It fails on purpose. Paste what it
       prints in the last box.
    6. Clean up: `docker rm -f scan-dash scanner`, then `docker network rm bay-net`.
  boxes:
    - prompt: "What `docker port scan-dash` printed."
      checks:
        - {regex: '^80/tcp -> 127\.0\.0\.1:\d+\s*$', says: "nginx's port 80, published on your machine's loopback address", hint: "Was it -p 127.0.0.1:8088:80, with the address in front?"}
        - {not_contains: "0.0.0.0", says: "Not on every address", hint: "Without 127.0.0.1: in front, -p listens on every address."}
        - {not_contains: "[::]", says: "Not on every IPv6 address either"}
      example: |
        80/tcp -> 127.0.0.1:8088
    - prompt: "What `curl` printed for the dashboard's page."
      checks:
        - {contains: "<title>Welcome to nginx!</title>", says: "The dashboard answered on your machine's port", hint: "Is the container running (docker ps), and is curl asking 127.0.0.1 on the port you published?"}
      example: |
        <title>Welcome to nginx!</title>
    - prompt: "What the container on `bay-net` printed, asking for `http://scanner/`."
      checks:
        - {contains: "<title>Welcome to nginx!</title>", says: "Reached the scanner by its name, over bay-net", hint: "Were both the scanner and the asking container started with --network bay-net?"}
      example: |
        <title>Welcome to nginx!</title>
    - prompt: "What the container on the default network printed."
      checks:
        - {contains: "bad address 'scanner'", says: "The default network doesn't know the scanner's name", hint: "Was this one run without --network?"}
        - {not_contains: "Welcome to nginx", says: "It didn't reach the scanner"}
      example: |
        wget: bad address 'scanner'
comms:
  open:
    - {from: meridian, text: "SCANNER DASHBOARD · PUBLISHED: NOWHERE · LABEL PRINTER → SCANNER: BY ADDRESS, CHANGES WHEN RECREATED"}
    - {from: okafor, text: "Put the dashboard on the control-room console. Only there."}
    - {from: okafor, text: "And the label printer finds the scanner by its name from now on. Addresses move."}
  lab_done:
    - {from: meridian, text: "SCANNER DASHBOARD · PUBLISHED: 127.0.0.1 ONLY · bay-net: scanner REACHED BY NAME · DEFAULT NETWORK: NAME UNKNOWN"}
    - {from: okafor, text: "Visible from this machine, invisible from everywhere else. And the printer stops caring what the scanner's address is today."}
  complete:
    - {from: okafor, text: "Publish only what has to be reached from outside, and only where it has to be reached from. Everything else talks over its own network."}
---

## Publishing a port

**Docker gives containers a private network on your machine, and each container its own IP address
on it.** Nothing outside that network can reach a container until you say so. **`-p HOST:CONTAINER`
on `docker run` publishes a container's port on your machine**: `-p 8088:80` forwards your machine's
port 8088 to port 80 inside, where nginx, a web server, listens. **The left side is your machine, the
right side is the container.** (A tag like `nginx:1.30-alpine` is nginx 1.30, built on Alpine.)

**With no address in front, `-p` listens on every address your machine has, `0.0.0.0` (and `[::]`
for IPv6): anyone who can reach your machine can reach the container.** On a Linux server, **Docker's
forwarding also goes around `ufw`'s rules** (Unit 1.4, *Firewalls*), so a firewall that allows only
SSH doesn't cover a published port. **Put an address in front to listen on that one only: `-p
127.0.0.1:8088:80` publishes to your machine itself**, through its loopback address (Unit 1.4,
*`127.0.0.1` versus `0.0.0.0`*), and nothing else can connect.

**`docker port NAME` lists where a container's ports are published**, one line each:

```text
$ docker port try-open
80/tcp -> 0.0.0.0:8089
80/tcp -> [::]:8089
```

**Each line is the container's port, then `->` and the address and port on your machine.** A
container with nothing published prints nothing. `docker ps` shows the same in its PORTS column
(`{{.Ports}}`), written the other way round, your machine first: `127.0.0.1:8088->80/tcp`.

**If the port on your machine is taken, `docker run` fails with `port is already allocated`, and
leaves the container behind, created but not started.** Running it again with another port then
fails with `is already in use`, for the name: **`docker rm NAME` clears it first.**

## Containers talking to containers

Containers don't need published ports to reach each other. **A network you create lets containers
on it find each other by name.** **`docker network create NAME` makes one, printing its ID, and
`--network NAME` on `docker run` puts a container on it.** **`docker network connect NET NAME` adds a
container that's already running.**

**From another container, use the container's name and its own port, the right side of `-p`, never
the published one.** **A URL with no port means port 80 for `http://`**, which is where nginx
listens, so `http://scanner/` is `http://scanner:80/`. A program listening on 8000 would need
`http://scanner:8000/`. And **`localhost` inside a container is that container itself**, not your
machine.

**Docker's default network, `bridge` in `docker network ls`, is where a container goes without
`--network`, and it doesn't do names**: there a name gives `bad address`. **Use a name, not an
address**: a container gets a new address when it's recreated, but it keeps its name.

**`docker network ls` lists the networks, and `docker network rm NAME` removes one**, printing its
name, once no container uses it. To fetch a page: **`curl -s URL` (Unit 1.4) on your machine, or
`wget -qO- URL` inside Alpine**, which has no `curl`. `-q` turns off wget's progress messages, and
`-O-` writes the page to the screen instead of a file. `| grep title` then keeps the line with the
page's `<title>`, its name, and it runs on your machine, after the page comes out of the container.

| You want to reach it from | Use |
|---|---|
| your own machine | `-p 127.0.0.1:PORT:PORT`, then `127.0.0.1:PORT` |
| anywhere | `-p PORT:PORT`, and know that it's everywhere |
| another container | a network you created, the container's name, and its own port |

**On the real station:** `docker-compose.yml` publishes this course's `web` as
`127.0.0.1:5002:8000`, so only the droplet's own Nginx reaches it, and the internet reaches Nginx.
`db` publishes nothing at all: Compose puts both on a network of their own, and `web` finds the
database by its name, `db`, set as `DB_HOST: db`.

## Try it

`-p 8089:80` publishes on every address, on purpose, to show what `docker port` prints: anyone on
your network can reach it until the `docker rm` line, a few seconds later.

```bash
docker run -d --name try-open -p 8089:80 nginx:1.30-alpine
docker port try-open
docker ps --filter name=try-open --format "{{.Names}} {{.Ports}}"
curl -s http://127.0.0.1:8089/ | grep title
docker network create try-net
docker network connect try-net try-open
docker run --rm --network try-net alpine:3.24 wget -qO- http://try-open/ | grep title
docker network ls
docker rm -f try-open
docker network rm try-net
```

`docker port` shows `0.0.0.0:8089` and `[::]:8089`: no address in front, so every address. A machine
with IPv6 turned off may show only the first. `docker network connect` put `try-open` on `try-net`,
so the Alpine container there finds it by name. `docker network ls` shows `try-net` beside Docker's
own `bridge`, `host` and `none`.
