---
title: Is it reachable?
minutes: 20
story: |
  **Mission log, day 31.** The uplink's fixed, and traffic still isn't getting through the far
  relays. Mission Control's ping monitor has an opinion about each of them. "It's wrong twice,"
  says Okafor, "and I want to know which two."
quiz:
  - type: choice
    q: "The app can't reach its database. From the app server you run this. What does it tell you?"
    code: |-
      $ nc -zv -w 3 db.example.internal 5432
      nc: connect to db.example.internal (10.20.0.8) port 5432 (tcp) failed: Connection refused
    options:
      - "The database machine is up and reachable, but nothing is listening on 5432: the database isn't running, or listens on another port or address"
      - "The database machine is down"
      - "A firewall is dropping the connection"
      - "The name `db.example.internal` doesn't resolve"
    answer: 0
    explain: >-
      A refusal is an answer: a machine at `10.20.0.8` got the connection and said no, because
      nothing was listening on that port. So the name resolved (nc printed the address), the
      route works and the machine is up. Look at the database itself: is it running, and is it
      listening on `5432` on an address you can reach (`sudo ss -tlnp` on that machine)?
  - type: choice
    q: "Is `vault` up?"
    code: |-
      $ ping -c 2 vault.example.internal
      PING vault.example.internal (10.20.4.9) 56(84) bytes of data.

      --- vault.example.internal ping statistics ---
      2 packets transmitted, 0 received, 100% packet loss, time 1044ms
      $ nc -zv -w 3 vault.example.internal 443
      Connection to vault.example.internal (10.20.4.9) 443 port [tcp/https] succeeded!
    options:
      - "Yes: its port 443 accepts connections. It, or a firewall in front of it, just drops ping"
      - "No: 100% packet loss means it's down"
      - "Only half of it: ping and nc disagree, so its network card is failing"
      - "You can't tell without `traceroute`"
    answer: 0
    explain: >-
      A connection that succeeds is proof the machine is up. Ping is a separate kind of packet
      (ICMP) that many firewalls and cloud networks drop on purpose, so no reply to ping proves
      very little. Check the port the service really uses.
  - type: choice
    q: "`nc -zv -w 3 HOST 22` says `timed out`. What do you know?"
    options:
      - "Nothing answered at all: the host is down, or something between you drops the connection, like a firewall"
      - "The host is up and SSH isn't running on it"
      - "The name doesn't resolve"
      - "SSH is running, but rejected your key"
    answer: 0
    explain: >-
      A timeout means silence: no "yes", no "no". A host that's up and has nothing on the port
      would have refused at once. So either nothing is at that address, or something drops the
      packets on the way, which is exactly what a firewall set to drop does.
  - type: choice
    q: "`ping db.example.internal` prints `Temporary failure in name resolution`. What's the likeliest cause?"
    options:
      - "This machine couldn't reach its DNS server, so it couldn't ask about the name at all"
      - "The name doesn't exist in DNS"
      - "The database is down"
      - "Ping is blocked"
    answer: 0
    explain: >-
      `Temporary failure in name resolution` means no DNS server answered, so it's worth trying
      again. A name DNS says doesn't exist gives `Name or service not known`. Either way nothing
      was sent to the database: the lookup failed first.
  - type: multi
    q: "Which of these prove the host is up?"
    options:
      - "`Connection refused`"
      - "`succeeded!`"
      - "`64 bytes from …`"
      - "`timed out: Operation now in progress`"
    answer: [0, 1, 2]
    explain: >-
      A refusal, a successful connection and a ping reply all came from the machine itself. A
      timeout is the absence of any answer, so it can't tell you the host is up.
cards:
  - id: three-failures
    section: "Refused, timed out, or no name"
    front: "`Connection refused`, `timed out`, `Name or service not known`: what does each mean?"
    back: "Refused: the host is up and nothing listens on the port. Timed out: nothing answered (down, or a firewall drops it). No name: DNS doesn't know it, so nothing was sent."
  - id: blocked-ping
    section: "`ping`: is anything there?"
    front: "No replies to `ping`. Is the host down?"
    back: "Not necessarily: many firewalls drop ping. Check the service's port with `nc -zv`; a connection, or even a refusal, proves it's up."
  - id: nc-check
    section: "`nc -zv`: is the port open?"
    accept: ["nc -zv -w 3 db.example.internal 5432", "nc -zvw 3 db.example.internal 5432", "nc -z -v -w 3 db.example.internal 5432"]
    front: "Check whether port 5432 on `db.example.internal` accepts connections, giving up after 3 seconds"
    back: "`nc -zv -w 3 db.example.internal 5432`"
  - id: method
    section: "A method: name, route, machine, port"
    front: "Something doesn't connect. In what order do you check?"
    back: "The name (does it resolve?), the route (`ip route get`), the machine (`ping`, which may be blocked), then the port (`nc -zv`)."
terminal:
  task: |
    Mission Control's ping monitor says this about the four far relays the relay console talks
    to:

    | Relay | Ping monitor |
    |---|---|
    | `relay-a.meridian` | unknown |
    | `relay-b.meridian` | up |
    | `relay-c.meridian` | down |
    | `relay-d.meridian` | down |

    Their relay service listens on the port in **`/etc/relay/peers.conf`**. Check each relay
    properly, and write what you find to **`~/relays.txt`**, one line per relay, in this form:

    ```text
    relay-a.meridian RESULT
    ```

    where RESULT is one of **`ok`** (its relay port accepts connections), **`name`** (the name
    doesn't resolve), **`refused`** (the connection is refused) or **`timeout`** (nothing
    answers).
  cwd: /home/cadet
  network:
    interfaces: [{name: eth0, address: 10.4.1.23/24}]
    gateway: 10.4.1.1
    hosts:
      - {name: ns1, address: 10.4.1.53, services: [{port: 53, proto: udp}]}
      - {name: relay-b, address: 10.4.3.11, services: [{port: 22}]}
      - {name: relay-c, address: 10.4.3.12, up: false}
      - {name: relay-d, address: 10.4.3.13, ping: false, services: [{port: 22}, {port: 8443}]}
    dns:
      server: 10.4.1.53
      records:
        - {name: relay.meridian, value: 10.4.1.23}
        - {name: relay-b.meridian, value: 10.4.3.11}
        - {name: relay-c.meridian, value: 10.4.3.12}
        - {name: relay-d.meridian, value: 10.4.3.13}
        - {name: ns1.meridian, value: 10.4.1.53}
        - {name: 23.1.4.10.in-addr.arpa, type: PTR, value: relay.meridian}
        - {name: 11.3.4.10.in-addr.arpa, type: PTR, value: relay-b.meridian}
        - {name: 12.3.4.10.in-addr.arpa, type: PTR, value: relay-c.meridian}
        - {name: 13.3.4.10.in-addr.arpa, type: PTR, value: relay-d.meridian}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /etc/relay, type: dir, owner: root, group: root}
    - path: /etc/relay/peers.conf
      owner: root
      group: root
      contents: |
        # Far relays this console forwards to: name and relay port.
        peer relay-a.meridian 8443
        peer relay-b.meridian 8443
        peer relay-c.meridian 8443
        peer relay-d.meridian 8443
  checks:
    - {contains: /home/cadet/relays.txt, text: "relay-a.meridian name\n"}
    - {contains: /home/cadet/relays.txt, text: "relay-b.meridian refused\n"}
    - {contains: /home/cadet/relays.txt, text: "relay-c.meridian timeout\n"}
    - {contains: /home/cadet/relays.txt, text: "relay-d.meridian ok\n"}
  success: |-
    Okafor runs his finger down relays.txt. "One that doesn't exist, one that's up and not listening, one that's gone quiet. And one that was fine all along."
  solution:
    - cat /etc/relay/peers.conf
    - getent hosts relay-a.meridian
    - dig +short relay-a.meridian
    - nc -zv -w 3 relay-b.meridian 8443
    - ping -c 2 relay-b.meridian
    - nc -zv -w 3 relay-c.meridian 8443
    - ip route get 10.4.3.12
    - ping -c 2 relay-d.meridian
    - nc -zv -w 3 relay-d.meridian 8443
    - echo "relay-a.meridian name" > ~/relays.txt
    - echo "relay-b.meridian refused" >> ~/relays.txt
    - echo "relay-c.meridian timeout" >> ~/relays.txt
    - echo "relay-d.meridian ok" >> ~/relays.txt
    - cat ~/relays.txt
comms:
  open:
    - {from: mission, text: "*Meridian*, Mission Control. Traffic still isn't getting through three of your four far relays."}
    - {from: meridian, text: "PING MONITOR · relay-a ? · relay-b UP · relay-c DOWN · relay-d DOWN"}
    - {from: okafor, text: "That monitor only pings. Check each one properly: does the name resolve, and does its relay port answer? Port's in `peers.conf`."}
  console_done:
    - {from: meridian, text: "relay-a NO NAME · relay-b 8443 REFUSED · relay-c NO ANSWER · relay-d 8443 OPEN"}
    - {from: okafor, text: "relay-a came out in the refit and its name went with it. Somebody left it in `peers.conf`."}
    - {from: okafor, text: "relay-b's up and its relay service isn't listening, relay-c's gone quiet, and relay-d just won't answer a ping. The monitor had relay-b as fine and relay-d as dead."}
  complete:
    - {from: mission, text: "Understood: one name to remove, one service to restart, one relay to send a drone to. And stop trusting our ping monitor."}
    - {from: okafor, text: "Next time something won't connect, we'll know which kind of won't it is before anyone touches it."}
---

## A method: name, route, machine, port

"It doesn't connect" has many causes, and guessing wastes hours. Check in order, from the
outside in, and each step tells you whether the next one is worth doing:

| Step | The question | Command |
|---|---|---|
| 1. Name | Does the name give an address? | `getent hosts NAME` (and `dig` for what DNS says) |
| 2. Route | Does this machine know where to send it? | `ip route get ADDRESS` |
| 3. Machine | Is anything at that address? | `ping -c 2 HOST` (if ping isn't blocked) |
| 4. Port | Does the service accept connections? | `nc -zv -w 3 HOST PORT` |

The last step is the one that matters: it's what the app itself does. The earlier steps tell
you *why* it failed.

## Does the name resolve? Is there a route?

Module 02's tools answer the first question. **`getent hosts NAME`** prints the address this
machine will use, or nothing at all (exit status 2) when there isn't one. When a program can't
get an address, it says one of two things:

- **`Name or service not known`**: DNS answered, and the name doesn't exist. Check the spelling,
  and whether the thing was renamed or removed.
- **`Temporary failure in name resolution`**: no DNS server answered, so the name couldn't be
  looked up at all. That's a problem with this machine's DNS, not with the far end.

With an address in hand, **`ip route get ADDRESS` shows the way a packet to it would go**: the
interface, and the gateway if it isn't on your subnet (`via 10.4.6.1`). If there's no route, it
says `Network is unreachable`, and nothing else will work until there is one.

## `ping`: is anything there?

**`ping -c COUNT HOST`** sends COUNT small packets and reports each reply:

```text
$ ping -c 2 archive.meridian
PING archive.meridian (10.4.6.21) 56(84) bytes of data.
64 bytes from 10.4.6.21: icmp_seq=1 ttl=64 time=0.625 ms
64 bytes from 10.4.6.21: icmp_seq=2 ttl=64 time=0.446 ms

--- archive.meridian ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1004ms
rtt min/avg/max/mdev = 0.446/0.535/0.625/0.089 ms
```

A reply means the machine is up and reachable. Without `-c` a real `ping` runs until Ctrl-C (the
station console asks for a count). No replies looks like one of two things:

- **`Destination Host Unreachable`** lines, for an address on your own subnet: nothing there
  answered "that's me", so there's no machine at that address.
- **Just `100% packet loss`**, for an address beyond the gateway: silence.

**A blocked ping proves little.** Ping uses its own kind of packet (ICMP), and plenty of
firewalls and cloud networks drop it on purpose, while the machine's services work fine. So a
ping reply proves the machine is up, but no reply doesn't prove it's down. Only the port can
settle it.

## `nc -zv`: is the port open?

**`nc`** (netcat) makes network connections. With these options it only checks whether a
connection works, then closes it:

| Option | Means |
|---|---|
| `-z` | just check: connect, send nothing, close |
| `-v` | say what happened (`nc` is silent without it, except on success) |
| `-w 3` | give up after 3 seconds instead of waiting minutes |

So **`nc -zv -w 3 HOST PORT` checks whether PORT on HOST accepts connections**:

```text
$ nc -zv -w 3 archive.meridian 8080
Connection to archive.meridian (10.4.6.21) 8080 port [tcp/http-alt] succeeded!
```

Always give it `-w`. Without one, a connection that nobody answers waits for the kernel to give
up, over two minutes.

## Refused, timed out, or no name

When `nc` fails, **what it says tells you where the problem is**:

| `nc` says | What happened | So |
|---|---|---|
| `succeeded!` | the service accepted the connection | it's reachable: the problem is in the service or the app |
| `Connection refused` | **the host is up and said no**: nothing listens on that port | is the service running, and listening on that port and address (`ss -tlnp` there)? |
| `timed out` | **nothing answered at all** | the host is down, or a firewall on the way drops the connection |
| `No route to host` | on your subnet, nothing has that address | the machine is off, or the address is wrong |
| `Name or service not known` | **the name doesn't resolve**: nothing was sent | fix the name, or DNS |

A refusal is good news of a kind: a machine answered. Refused and timed out are the two people
mix up most, and they point at completely different places: refused means look at the service,
timed out means look at the machine or the firewall.

**On the real station:** this app sits behind Nginx, which passes each request on to
`127.0.0.1:5002`, where the app's container listens. When the container is stopped, Nginx is
still up and answering on 443, but its connection to `127.0.0.1:5002` is **refused**: nothing
listens there. Nginx shows that as `502 Bad Gateway`, which is why the RUNBOOK's first line for a
502 is "`web` not running". The deploy checks the far end of the whole chain: after each release
it fetches `https://learn.seandesmet.com/healthz` until it reports the new version, so a name, a
route or a port that's broken fails the deploy instead of waiting for someone to notice.

## Try it

On a real Ubuntu machine. A container needs the tools first: `sudo apt-get update && sudo
apt-get install -y netcat-openbsd iputils-ping iproute2 python3`. `10.255.255.1` is a private
address that's almost certainly not in use on your network.

```bash
ip route get 10.255.255.1                # via your gateway: there is a route
python3 -m http.server 8080 --bind 127.0.0.1 > /dev/null 2>&1 &
sleep 1; nc -zv 127.0.0.1 8080           # succeeded!: something's listening
pkill -f http.server
sleep 1; nc -zv 127.0.0.1 8080           # Connection refused: up, but nothing listens
nc -zv -w 3 10.255.255.1 80              # timed out after 3 seconds: nothing answers
nc -zv no-such-name.invalid 80           # Name or service not known: nothing was sent
ping -c 2 -W 1 10.255.255.1              # 100% packet loss: silence
```
