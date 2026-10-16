---
title: Names and DNS
minutes: 20
story: |
  **Mission log, day 30.** The relays can see each other now, and half of them still can't
  find Mission Control's uplink by name. The same name, on six consoles, and three different
  answers. "Ask this one what it thinks the name means," says Okafor.
quiz:
  - type: choice
    q: "On a server, the API answers nothing. You check the name it's reached by. What's wrong, and what's the fix?"
    code: |-
      $ getent hosts api.meridian
      10.4.6.9        api.meridian
      $ dig +short api.meridian
      10.4.6.30
      $ ping -c 1 api.meridian
      PING api.meridian (10.4.6.9) 56(84) bytes of data.
    options:
      - "`/etc/hosts` has an old line for `api.meridian`. `getent` and `ping` read it before DNS; `dig` only asks DNS. Remove the line, then check `getent` agrees with `dig`"
      - "DNS is wrong: `dig` gives a different address from `getent`, so the record needs changing"
      - "The DNS server's cache is stale: wait for the TTL to run out"
      - "Nothing's wrong with the name: `ping` would use `dig`'s answer if the API were up"
    answer: 0
    explain: >-
      `getent hosts` answers the way programs do, `/etc/hosts` first and then DNS, and `ping`
      agrees with it: `10.4.6.9`. `dig` skips `/etc/hosts` and shows what DNS says:
      `10.4.6.30`. When they disagree, this machine has a line of its own in `/etc/hosts`. DNS
      is the one everyone else uses, so it's the pin that's stale.
  - type: choice
    q: "What does this tell you about `archive.meridan`?"
    code: |-
      $ dig archive.meridan
      ;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 40211
      ;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1
      ...
      ;; SERVER: 10.4.6.1#53(10.4.6.1) (UDP)
    options:
      - "The DNS server answered, and the answer is that the name doesn't exist. Check the spelling"
      - "The DNS server couldn't be reached"
      - "The name exists but the machine is down"
      - "The name exists but has no address yet; try again after the TTL"
    answer: 0
    explain: >-
      `status: NXDOMAIN` means "no such name", and the `SERVER` line says who said so: the
      server was reached and answered. An unreachable server looks different, `no servers could
      be reached`, and a machine being down is nothing DNS knows about. Here it's a typo:
      `meridan`.
  - type: choice
    q: "You change `shop.example.org`'s A record to a new server. An hour later, some people still reach the old one. Why?"
    options:
      - "Resolvers that looked it up before the change keep their cached answer until its TTL runs out"
      - "DNS changes only take effect at midnight"
      - "Their browsers have the old address in `/etc/resolv.conf`"
      - "A records can't be changed, only deleted and added again"
    answer: 0
    explain: >-
      Every answer carries a TTL, in seconds, and anything that asked keeps the answer that long
      without asking again. With a TTL of 3600, an answer fetched just before the change can be
      used for up to an hour after it. Lowering the TTL a day before a move makes the switch quick.
  - type: multi
    q: "Which of these read `/etc/hosts` before asking DNS?"
    options: ["`getent hosts`", "`dig`", "`ping`", "`curl`"]
    answer: [0, 2, 3]
    explain: >-
      Almost every program looks names up through the system's resolver library, which follows
      `/etc/nsswitch.conf`'s `hosts: files dns`: the file first. `dig` (and `host`) are DNS
      tools: they send the question straight to a DNS server and never read the file.
  - type: fill
    q: "Which file names the DNS server this machine asks? (full path)"
    answer: ["/etc/resolv.conf"]
    explain: >-
      `/etc/resolv.conf`, on its `nameserver` lines. `dig` reports the server it asked on its
      `SERVER` line.
cards:
  - id: files-before-dns
    section: "`/etc/hosts`, and why it wins"
    front: "`getent hosts NAME` and `dig +short NAME` give different addresses. Where's the difference?"
    back: "`/etc/hosts` has a line for NAME. Programs (and `getent`) read it before DNS; `dig` only asks DNS."
  - id: record-types
    section: "Records: A, CNAME, MX and PTR"
    front: "What do A, CNAME, MX and PTR records hold?"
    back: "A: a name's IPv4 address. CNAME: another name it's an alias for. MX: where its mail goes. PTR: an address's name (a reverse lookup)."
  - id: dig-reverse
    section: "`dig +short` and `dig -x`"
    accept: ["dig -x 10.4.6.21", "dig -x 10.4.6.21 +short", "dig +short -x 10.4.6.21"]
    front: "Find the name for the address `10.4.6.21` in DNS"
    back: "`dig -x 10.4.6.21` (add `+short` for just the name)"
  - id: resolv-conf
    section: "`/etc/resolv.conf`: which server to ask"
    accept: ["/etc/resolv.conf"]
    front: "Which file names the DNS server a machine asks?"
    back: "`/etc/resolv.conf`, on its `nameserver` lines. On Ubuntu it's usually `127.0.0.53`, systemd-resolved's local cache."
terminal:
  task: |
    Mission Control's uplink is **`mission.meridian`**. From this relay console it doesn't
    answer, and Mission says their end is fine. Find out what this console thinks the name
    means and why, and fix it. Don't break the console's other names while you're in there.

    Then save the proof that this console and DNS agree, in **`~/names.txt`**: the output of
    `getent hosts mission.meridian`, followed by the output of `dig +short mission.meridian`.

    Your password for `sudo` is `meridian`.
  cwd: /home/cadet
  groups: [sudo]
  password: meridian
  network:
    interfaces: [{name: eth0, address: 10.4.1.23/24}]
    gateway: 10.4.1.1
    hosts:
      - {name: mission, address: 10.4.1.40, services: [{port: 443}]}
      - {name: ns1, address: 10.4.1.53, services: [{port: 53, proto: udp}]}
      - {name: relay-db, address: 10.4.1.20, services: [{port: 5432}]}
      - {name: ops-desk, address: 10.4.1.5, services: [{port: 22}]}
    dns:
      server: 10.4.1.53
      records:
        - {name: mission.meridian, value: 10.4.1.40}
        - {name: uplink.meridian, type: CNAME, value: mission.meridian}
        - {name: relay.meridian, value: 10.4.1.23}
        - {name: relay-db.meridian, value: 10.4.1.20}
        - {name: ops-desk.meridian, value: 10.4.1.5}
        - {name: ns1.meridian, value: 10.4.1.53}
        - {name: 40.1.4.10.in-addr.arpa, type: PTR, value: mission.meridian}
        - {name: 23.1.4.10.in-addr.arpa, type: PTR, value: relay.meridian}
        - {name: 20.1.4.10.in-addr.arpa, type: PTR, value: relay-db.meridian}
        - {name: 5.1.4.10.in-addr.arpa, type: PTR, value: ops-desk.meridian}
        - {name: 53.1.4.10.in-addr.arpa, type: PTR, value: ns1.meridian}
  files:
    - {path: /home/cadet, type: dir}
    - path: /etc/hosts
      owner: root
      group: root
      contents: |
        127.0.0.1 localhost
        127.0.1.1 meridian
        10.4.1.14 mission.meridian

        # The following lines are desirable for IPv6 capable hosts
        ::1     ip6-localhost ip6-loopback
        fe00::0 ip6-localnet
        ff00::0 ip6-mcastprefix
        ff02::1 ip6-allnodes
        ff02::2 ip6-allrouters
  checks:
    - {contains: /home/cadet/names.txt, text: "10.4.1.40       mission.meridian\n10.4.1.40\n"}
    - {contains: /etc/hosts, text: "127.0.0.1 localhost\n"}
    - {contains: /etc/hosts, text: "127.0.1.1 meridian\n"}
  success: |-
    Okafor pings the uplink himself and watches the replies come back from mission.meridian. "Same name, same answer. That's all I wanted."
  solution:
    - getent hosts mission.meridian
    - dig +short mission.meridian
    - dig -x 10.4.1.14
    - cat /etc/hosts
    - sudo sed -i '/^10.4.1.14 /d' /etc/hosts
    - meridian
    - getent hosts mission.meridian > ~/names.txt
    - dig +short mission.meridian >> ~/names.txt
    - cat ~/names.txt
comms:
  open:
    - {from: mission, text: "*Meridian*, Mission Control. Our uplink is up and answering at `mission.meridian`. Some of your relays reach it and some don't."}
    - {from: meridian, text: "UPLINK mission.meridian · RELAY CONSOLE 10.4.1.23 · NO REPLY"}
    - {from: okafor, text: "Same name on every console. Find out what this one thinks it means, and who told it."}
  console_done:
    - {from: meridian, text: "mission.meridian · DNS 10.4.1.40 · /ETC/HOSTS 10.4.1.40 · AGREE"}
    - {from: okafor, text: "A line in `/etc/hosts` for an address DNS has never heard of. Somebody pinned the uplink by hand before the refit, and the uplink moved."}
    - {from: okafor, text: "I'll have the other relays checked for the same line. A pin's fine until the thing it pins moves, and then nobody remembers it's there."}
  complete:
    - {from: mission, text: "Uplink traffic from your relay console, confirmed. Thank you, *Meridian*."}
    - {from: okafor, text: "Names we can read now. Next: when a name resolves fine and the thing still doesn't answer."}
---

## What DNS does

People use names; the network uses addresses. **DNS, the Domain Name System, turns a name into
an address**, like `archive.meridian` into `10.4.6.21`. No machine holds every name: each
domain's owner runs servers for its own names, and a **resolver**, a DNS server near you, asks
around on your behalf and remembers what it learned. Your machine only ever asks the resolver.

Names change hands, machines move to new addresses, and DNS is how everyone finds out. That's
also why so much "the network is broken" is really "the name points at the wrong place".

## Records: A, CNAME, MX and PTR

A name's information is kept in **records**, each of one type:

| Type | Holds | For example |
|---|---|---|
| **A** | the name's IPv4 address | `archive.meridian` → `10.4.6.21` |
| **CNAME** | another name this one is an alias for | `logs.meridian` → `archive.meridian` |
| **MX** | the server that takes the domain's mail | `meridian` → `10 mail.meridian` |
| **PTR** | the name for an address (the reverse) | `10.4.6.21` → `archive.meridian` |

There's also **AAAA**, an IPv6 address, and **TXT**, free text that other services read (mail
senders' rules, proof you own a domain). A CNAME is followed: looking up `logs.meridian` gives
the CNAME, then `archive.meridian`'s A record.

## `dig`: asking DNS

**`dig NAME` asks the DNS server for NAME's A record** and prints the whole answer:

```text
; <<>> DiG 9.18.39-0ubuntu0.24.04.8-Ubuntu <<>> logs.meridian
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 17521
;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 1232
;; QUESTION SECTION:
;logs.meridian.                 IN      A

;; ANSWER SECTION:
logs.meridian.          3600    IN      CNAME   archive.meridian.
archive.meridian.       3600    IN      A       10.4.6.21

;; Query time: 1 msec
;; SERVER: 10.4.6.1#53(10.4.6.1) (UDP)
;; WHEN: Thu Oct 08 09:00:01 UTC 2026
;; MSG SIZE  rcvd: 80
```

Most of it you can skip. Read three things:

- **`status:`** in the header. `NOERROR` means the server answered. **`NXDOMAIN` means the name
  doesn't exist**: the server was reached, and the answer is "no such name", so check the
  spelling. If no server answers at all, dig says `no servers could be reached` instead.
- **The ANSWER SECTION.** Each line is a record: **the name, its TTL in seconds, the class
  (`IN`, always), the type, and the data**. Here `logs.meridian` is a CNAME for
  `archive.meridian`, whose A record is `10.4.6.21`. Names end with a dot: `archive.meridian.`
  is the full name, with nothing more to add.
- **`SERVER:`**, the DNS server that answered.

**`dig NAME TYPE`** asks for another type: `dig meridian MX`, `dig logs.meridian CNAME`.
**`dig @SERVER NAME`** asks a particular server instead of the usual one.

## `dig +short` and `dig -x`

**`dig +short NAME` prints only the answers**, one per line: for `logs.meridian`, the line
`archive.meridian.` and then `10.4.6.21`. For a name that doesn't exist it prints nothing.

**`dig -x ADDRESS` is a reverse lookup**: it asks for the address's PTR record, the name it
belongs to. `dig -x 10.4.6.21 +short` prints `archive.meridian.`. An address with no PTR record
gives `NXDOMAIN`: DNS has never heard of it. Not every address has one, but on a network you
run, an address with no name is worth asking about.

`host NAME` asks the same questions and answers in a sentence, which is quicker to read:
`archive.meridian has address 10.4.6.21`.

## `/etc/hosts`, and why it wins

Before DNS existed, every machine had a list of names and addresses, and it still does:
**`/etc/hosts`**, one address and its names per line:

```text
127.0.0.1 localhost
127.0.1.1 meridian
10.4.6.40 build.meridian
```

**Programs look names up in `/etc/hosts` first, and only then ask DNS.** The order is set in
`/etc/nsswitch.conf`, by the line `hosts: files dns`. So a line in `/etc/hosts` beats whatever
DNS says, for this one machine. That's handy for testing a new server before DNS points at it,
and it's a trap when the line is forgotten and the server moves.

The tools don't all look in the same places:

| Command | Reads `/etc/hosts`? | Asks DNS? |
|---|---|---|
| **`getent hosts NAME`** | **yes, first** | yes, if the file has nothing |
| `ping`, `curl`, `ssh`, your app | yes, first | yes, if the file has nothing |
| **`dig`**, `host` | **no** | **yes, only** |

**`getent hosts NAME` shows the address this machine will really use**, the way programs look
it up. **`dig` shows what DNS says**, which is what every other machine gets. When the two
disagree, the difference is a line in `/etc/hosts`.

One catch on a machine with IPv6: `getent hosts` asks for an IPv6 address first. If
`/etc/hosts` pins a name to an IPv4 address and DNS also has an IPv6 (AAAA) record for it,
`getent hosts` shows DNS's IPv6 address, while `ping` and other programs still use the pin.
`getent ahosts NAME` lists the addresses programs will actually try (the station console
doesn't have it, and its network has no IPv6).

### Fixing it

`/etc/hosts` belongs to root, so changing it needs `sudo`: **`sudo nano /etc/hosts`**, or delete
a line by its pattern with **`sudo sed -i '/PATTERN/d' /etc/hosts`**, where `d` deletes every
line that matches (Unit 1.1 module 08 has `sed`). Anchor the pattern so it can't match more
than you mean: `'/^10\.4\.6\.40 /d'` deletes only the line that starts with that address.
**Delete a stale pin rather than correcting it**: DNS already has the right answer, and a
corrected pin goes stale again the next time the server moves. Then check: `getent hosts NAME`
and `dig +short NAME` should give the same address.

## `/etc/resolv.conf`: which server to ask

The DNS server this machine asks is named in **`/etc/resolv.conf`**, on a **`nameserver`**
line:

```text
nameserver 10.4.6.1
```

`dig`'s `SERVER:` line shows the one it used. On an Ubuntu machine you'll usually find
`nameserver 127.0.0.53`: that's **systemd-resolved**, a small cache on the machine itself,
which passes questions on to the network's real resolver. `resolvectl status` shows which one
(the station console doesn't have it).

## TTLs and caching

Every record comes with a **TTL**, time to live, in seconds: `3600` above. Whoever asked can
keep the answer that long without asking again, and resolvers do, so most lookups never leave
the building. The price is that **a change takes up to the TTL to reach everyone**: change an A
record whose TTL is an hour, and machines that asked just before still use the old address for
up to an hour. Before moving a server, lower the TTL a day ahead, then move it.

**On the real station:** this app's name is a DNS record. `learn.seandesmet.com` has an **A
record pointing at the droplet's address**, set in DigitalOcean's DNS, and `budget.seandesmet.com`
points at the same address: two names, one machine, and Nginx tells the sites apart by the name
the browser asked for. The RUNBOOK's first setup step is `dig +short learn.seandesmet.com`,
which has to print the droplet's address before Certbot runs, because Let's Encrypt checks
the certificate request by visiting that name. Inside the app's container there's DNS too: the
app connects to its database at **`DB_HOST=db`**, a name that's in no `/etc/hosts` file. The
container's `/etc/resolv.conf` says `nameserver 127.0.0.11`, Docker's own DNS server, which
answers with the address of the Compose service called `db`.

## Try it

On a real Ubuntu machine. A container needs the tools first: `sudo apt-get update && sudo
apt-get install -y dnsutils iputils-ping`. Your addresses will differ.

```bash
cat /etc/resolv.conf | grep nameserver   # the DNS server this machine asks
grep hosts /etc/nsswitch.conf            # hosts: files dns: the file, then DNS
dig example.com                          # status: NOERROR, and A records in the ANSWER SECTION
dig +short example.com                   # just the addresses
dig +short no-such-name.invalid         # nothing: no such name
dig -x 1.1.1.1 +short                    # one.one.one.one.: a reverse lookup
echo "10.0.0.99 github.com" | sudo tee -a /etc/hosts
getent hosts github.com                  # 10.0.0.99: /etc/hosts wins
ping -c 1 -W 1 github.com | head -1      # PING github.com (10.0.0.99): so does ping
dig +short github.com                    # DNS's answer, unchanged
sudo sed -i '/^10\.0\.0\.99 /d' /etc/hosts
getent hosts github.com                  # DNS's answer again
```

In a Docker container, `sed -i` fails on `/etc/hosts` with `Device or resource busy`: Docker
mounts that file in from outside, and `sed -i` replaces a file rather than writing into it.
There, delete the line with `sudo nano /etc/hosts` instead, which writes into the file. (The
pin uses `github.com` because it has no IPv6 address in DNS: see the catch above.)
