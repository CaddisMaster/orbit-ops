---
title: Addresses and ports
minutes: 20
story: |
  **Mission log, day 29.** The relay network is back up, and nothing can find anything. Mission
  Control can't open the telemetry dashboard, and the relay service says it's fine. "Before
  anyone fixes anything," says Okafor, "find out where we're standing."
quiz:
  - type: choice
    q: "A server with this routing table sends a packet to `10.9.4.17`. Where does it go first?"
    code: |-
      $ ip route
      default via 10.9.3.1 dev eth0 proto static
      10.9.3.0/24 dev eth0 proto kernel scope link src 10.9.3.40
    options:
      - "To the gateway, `10.9.3.1`: `10.9.4.17` isn't on `10.9.3.0/24`, so only the default route matches"
      - "Straight to `10.9.4.17` over `eth0`, since every `10.9` address is on the same network"
      - "Nowhere: there's no route that names `10.9.4.17`"
      - "To `10.9.3.40`, the server's own address"
    answer: 0
    explain: >-
      `/24` means the first three numbers name the network, so `10.9.3.0/24` is `10.9.3.0` to
      `10.9.3.255`. `10.9.4.17` is outside it. The default route is for everything no other
      route matches, which is why it's there at all: the packet goes to the gateway, which knows
      the way to `10.9.4.0/24`.
  - type: choice
    q: "On the server this works. From your laptop, the same dashboard on port 5000 never loads. Why?"
    code: |-
      $ sudo ss -tlnp
      State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess
      LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=812,fd=3))
      LISTEN 0      4096       127.0.0.1:5000      0.0.0.0:*    users:(("dashboard",pid=1440,fd=6))
    options:
      - "The dashboard listens on `127.0.0.1`, the loopback address, so only programs on the server itself can reach it"
      - "Port 5000 is reserved, so other machines can't use it"
      - "The dashboard isn't running: there's no `ESTAB` line for it"
      - "`sshd` is using the network, so nothing else can"
    answer: 0
    explain: >-
      The Local Address column is the address a program listens on. `127.0.0.1` is the machine
      talking to itself, so a connection from anywhere else never reaches it. To be reachable from
      other machines it must listen on `0.0.0.0` (every address), like `sshd` does, or on the
      server's own address. `LISTEN` means it's waiting for connections; `ESTAB` lines are ones in progress.
  - type: choice
    q: "`ss -tlnp` shows a service listening on port 8080, but its Process column is empty. Why?"
    options:
      - "The process runs as another user, and only root sees other users' processes: run it with `sudo`"
      - "Nothing is really listening; an empty Process column means the port is closed"
      - "`-p` only works together with `-a`"
      - "The process has crashed and left the port open"
    answer: 0
    explain: >-
      A normal user sees which process holds a socket only for their own processes. Services
      usually run as their own accounts, so `sudo ss -tlnp` is the usual way to ask "what is
      listening on this port?"
  - type: multi
    q: "Which of these are on the same subnet as `10.0.7.31/24`?"
    options: ["`10.0.7.200`", "`10.0.8.31`", "`10.0.7.1`", "`10.1.7.31`"]
    answer: [0, 2]
    explain: >-
      With `/24`, the first three numbers must match: `10.0.7`. `10.0.7.200` and `10.0.7.1` do;
      `10.0.8.31` and `10.1.7.31` are on other networks, reached through the gateway.
  - type: fill
    q: "Which address does a machine use to talk to itself? (IPv4, as numbers)"
    answer: ["127.0.0.1"]
    explain: >-
      `127.0.0.1`, the loopback address, on the `lo` interface. Packets to it never leave the
      machine. The name `localhost` means it too.
cards:
  - id: subnet-prefix
    section: "Every machine has an address"
    front: "`10.0.7.31/24`: which addresses are on its subnet?"
    back: "`10.0.7.0` to `10.0.7.255`. `/24` means the first 24 bits, the first three numbers, name the network."
  - id: default-route
    section: "`ip route`: where packets go"
    front: What is the default route for?
    back: "Every address no other route matches: those packets go to the gateway it names."
  - id: ss-listening
    section: "`ss`: what's listening, and who's connected"
    accept: ["sudo ss -tlnp", "ss -tlnp"]
    front: List the listening TCP ports, as numbers, with the process holding each
    back: "`sudo ss -tlnp` (without `sudo` you only see your own processes)"
  - id: loopback-vs-any
    section: "`127.0.0.1` versus `0.0.0.0`"
    front: "A service listens on `127.0.0.1:3000`, not `0.0.0.0:3000`. Who can reach it?"
    back: "Only programs on the same machine. `0.0.0.0` means every address the machine has, so other machines too."
terminal:
  task: |
    Mission Control can't open the telemetry dashboard, and nobody knows the relay console's own
    network settings. Find out, and write them to **`~/network.txt`**, one line each, in exactly
    this form:

    ```text
    address ADDRESS/PREFIX
    gateway ADDRESS
    listen PORT PROCESS LOCAL-ADDRESS
    connected PROCESS PEER-ADDRESS:PORT
    ```

    - `address`: the console's address on `eth0`, with its prefix.
    - `gateway`: where its default route goes.
    - A `listen` line for **each TCP port something listens on, apart from `sshd`'s 22**: the port
      number, the process's name, and the local address it listens on.
    - A `connected` line for the relay service's **established connection**: its process and
      the address and port at the other end.

    The services run as their own accounts. Your password for `sudo` is `meridian`.
  cwd: /home/cadet
  groups: [sudo]
  password: meridian
  accounts:
    - {name: relay, uid: 991, comment: Relay service, home: /var/lib/relay}
    - {name: telemetry, uid: 992, comment: Telemetry dashboard, home: /var/lib/telemetry}
  processes:
    - {command: /usr/local/bin/relayd -c /etc/relay/relayd.conf, user: relay, cpu: 0.4}
    - {command: /usr/local/bin/telemetryd, user: telemetry, cpu: 1.1, mem: 2.3}
  network:
    interfaces: [{name: eth0, address: 10.4.1.23/24}]
    gateway: 10.4.1.1
    listening:
      - {port: 8080, process: relayd}
      - {port: 3000, process: telemetryd, address: 127.0.0.1}
    connections:
      - {process: relayd, remote: "10.4.1.20:5432"}
      - {process: sshd, remote: "10.4.1.5:51874", local_port: 22}
    hosts:
      - {name: relay-db, address: 10.4.1.20, services: [{port: 5432}]}
      - {name: ops-desk, address: 10.4.1.5, services: [{port: 22}]}
  files:
    - {path: /home/cadet, type: dir}
  checks:
    - {contains: /home/cadet/network.txt, text: "address 10.4.1.23/24"}
    - {contains: /home/cadet/network.txt, text: "gateway 10.4.1.1"}
    - {contains: /home/cadet/network.txt, text: "listen 8080 relayd 0.0.0.0"}
    - {contains: /home/cadet/network.txt, text: "listen 3000 telemetryd 127.0.0.1"}
    - {contains: /home/cadet/network.txt, text: "connected relayd 10.4.1.20:5432"}
  success: |-
    Okafor reads network.txt twice, and stops at the telemetry line. "127.0.0.1," he says. "It's been talking to itself all along."
  solution:
    - ip addr
    - ip route
    - ss -tlnp
    - sudo ss -tlnp
    - meridian
    - sudo ss -tnp
    - echo "address 10.4.1.23/24" > ~/network.txt
    - echo "gateway 10.4.1.1" >> ~/network.txt
    - echo "listen 8080 relayd 0.0.0.0" >> ~/network.txt
    - echo "listen 3000 telemetryd 127.0.0.1" >> ~/network.txt
    - echo "connected relayd 10.4.1.20:5432" >> ~/network.txt
    - cat ~/network.txt
comms:
  open:
    - {from: meridian, text: "RELAY NETWORK · LINK UP · ROUTES: 2 · NAMES RESOLVED: 0"}
    - {from: mission, text: "*Meridian*, Mission Control. Your relays are answering, but we still can't open the telemetry dashboard on port 3000. Can you check your end?"}
    - {from: okafor, text: "Before anyone touches anything: what's this console's address, where does it send things, and what's listening. Write it down."}
  console_done:
    - {from: meridian, text: "CONSOLE 10.4.1.23/24 · GATEWAY 10.4.1.1 · TELEMETRYD 127.0.0.1:3000 · LOCAL ONLY"}
    - {from: okafor, text: "Telemetry's listening on loopback. It only answers this machine, so Mission could knock all day."}
    - {from: okafor, text: "Don't touch it yet. Where it listens is the telemetry service's own setting, and we'll change it once we know who should reach it."}
  complete:
    - {from: mission, text: "Report received. So it's not your relays, it's where the dashboard listens. Noted."}
    - {from: okafor, text: "Addresses we can read now. Names are next: half the station still can't find the other half by name."}
  window: {open: relay-pass}
---

## Every machine has an address

On a network, every machine has an **IP address**: four numbers from 0 to 255, like
`10.0.7.31`. It's written with a **prefix**, like `10.0.7.31/24`, which says how much of it
names the *network* and how much names the machine on it. `/24` means the first 24 bits, the
first three numbers. So `10.0.7.31/24` is machine 31 on the network `10.0.7.0/24`, which runs
from `10.0.7.0` to `10.0.7.255`, and everything in that range is **on the same subnet**: it can
be reached directly. (The first and last, `.0` and `.255` here, name the network itself and
"everyone on it", so no machine has them.)

| Written | The network part | On the same subnet |
|---|---|---|
| `10.0.7.31/24` | `10.0.7` | `10.0.7.0` – `10.0.7.255` |
| `10.0.7.31/16` | `10.0` | `10.0.0.0` – `10.0.255.255` |
| `10.0.7.31/32` | all of it | only itself |

Some ranges are **private**: `10.0.0.0/8`, `172.16.0.0/12` and `192.168.0.0/16`. They're used
inside networks, never on the public internet, which is why your home router, a cloud's
internal network and the *Meridian* all use them.

## `ip addr`: this machine's addresses

**`ip addr`** (or `ip a`) shows each network **interface** and the addresses on it:

```text
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    inet 127.0.0.1/8 scope host lo
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    link/ether 52:54:00:00:07:1f brd ff:ff:ff:ff:ff:ff
    inet 10.0.7.31/24 brd 10.0.7.255 scope global eth0
    inet6 fe80::5054:ff:fe00:71f/64 scope link
```

- **`lo` is the loopback interface**, and **`127.0.0.1` is the loopback address**: the machine
  talking to itself. Packets to it never leave the machine.
- **`eth0`** is the network card. Its **`inet` line is its IPv4 address, with the prefix**:
  here `10.0.7.31/24`.
- `inet6` lines are IPv6 addresses. One starting `fe80::` exists on every interface and only
  works on the local link. You'll recognise them; this unit doesn't need them.

`ip -br addr` gives one line per interface, and `hostname -I` prints just the addresses.

## `ip route`: where packets go

**`ip route`** (or `ip r`) shows the routing table: for each destination, which way to send it.

```text
default via 10.0.7.1 dev eth0 proto static
10.0.7.0/24 dev eth0 proto kernel scope link src 10.0.7.31
```

| Line | Means |
|---|---|
| `10.0.7.0/24 dev eth0 … scope link` | this subnet is right there on `eth0`: send directly |
| `default via 10.0.7.1 dev eth0` | **everything else goes to the gateway** `10.0.7.1` |

The **default route's `via` is the gateway**: the router that knows how to reach other
networks. A machine with no default route can only talk to its own subnet.

## Ports: which program

The address picks the machine; a **port**, a number from 1 to 65535, picks the program on it.
A program that's waiting for connections on a port is **listening** on it. Some numbers are
conventions:

| Port | Usually |
|---|---|
| 22 | SSH |
| 80, 443 | HTTP, HTTPS |
| 5432 | PostgreSQL |
| 8080, 3000, 8000 | web apps and dashboards, by habit |

A connection always has two ends, each an address and a port: the server's well-known port,
and a temporary one the client's kernel picked.

## `ss`: what's listening, and who's connected

**`ss`** lists the machine's sockets. Its options combine:

| Option | Means |
|---|---|
| `-t` | TCP |
| `-l` | listening sockets only (without it: connections in progress) |
| `-n` | numbers: show `8080`, not the name `http-alt` |
| `-p` | the process holding each socket |

So **`ss -tlnp` lists what's listening**, and **`ss -tnp` lists the established
connections**, with `ESTAB` in the State column:

```text
$ ss -tnp
State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
ESTAB 0      0          10.0.7.31:22       10.0.7.4:50112
```

The **Local Address:Port** column is this machine's end. **Peer Address:Port** is the other
machine's end. That connection is someone logged in over SSH from `10.0.7.4`.

**The Process column is empty for other users' sockets.** As a normal user, `ss -p` only names
your own processes. Services run as their own accounts, so to see who holds a port, ask as
root: **`sudo ss -tlnp`**.

## `127.0.0.1` versus `0.0.0.0`

The **Local Address column says which address a program listens on**, and that decides who can
reach it:

| Listening on | Reachable from |
|---|---|
| `127.0.0.1:3000` | **only this machine**: the loopback interface |
| `0.0.0.0:3000` | **every address the machine has**, so other machines too |
| `10.0.7.31:3000` | that one address: other machines on its network |

`[::]` is IPv6's `0.0.0.0`. A service on `127.0.0.1` works perfectly when you test it from the
server itself, and nobody else can reach it. That's the most common "it works for me" in
networking. The opposite mistake is worse: a database on `0.0.0.0` answers anyone who can reach
the machine.

**On the real station:** this app does both, on purpose. Inside its container, uvicorn listens
on `0.0.0.0:8000`, because Docker forwards connections into the container from outside it. On
the droplet, Compose publishes that port as `127.0.0.1:5002`, so only Nginx, on the same
machine, can reach it: Nginx, listening on 80 and 443, is the only way in to the app. Its
database isn't published at all. `tests/test_repo_hardening.py` refuses a port published
beyond `127.0.0.1`: `"5002:8000"` would put plain HTTP on the droplet's public address.

## Try it

On a real Ubuntu machine (a container may need `sudo apt-get update && sudo apt-get install -y
iproute2 python3`). Your addresses will differ.

```bash
ip -br addr                               # lo and your network card, with their addresses
ip route                                  # the default line names your gateway
ss -tln                                   # what's listening, as numbers
python3 -m http.server 8080 --bind 127.0.0.1 > /dev/null 2>&1 &
sleep 1; ss -tlnp | grep 8080             # 127.0.0.1:8080, and your python3 by name
pkill -f http.server
python3 -m http.server 8080 --bind 0.0.0.0 > /dev/null 2>&1 &
sleep 1; ss -tln | grep 8080              # 0.0.0.0:8080: every address
pkill -f http.server
```
