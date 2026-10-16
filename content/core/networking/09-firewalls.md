---
title: Firewalls
minutes: 20
story: |
  **Mission log, day 37.** The relay's feed is running. `ss` says it's listening, the relay
  service says it's fine, and Mission Control still can't get a byte out of it. "Listening isn't
  the same as reachable," says Okafor. "Something between them is saying nothing, on purpose."
quiz:
  - type: choice
    q: "The app server, `10.6.0.8`, times out connecting to Postgres here. Why, and what's the narrowest fix?"
    code: |-
      $ sudo ss -tlnp | grep 5432
      LISTEN 0      4096         0.0.0.0:5432       0.0.0.0:*    users:(("postgres",pid=711,fd=6))
      $ sudo ufw status
      Status: active

      To                         Action      From
      --                         ------      ----
      22/tcp                     ALLOW       Anywhere
      22/tcp (v6)                ALLOW       Anywhere (v6)
    options:
      - "Postgres is listening, but the firewall only lets SSH in, so it drops the rest: `sudo ufw allow from 10.6.0.8 to any port 5432 proto tcp`"
      - "Postgres listens on the wrong address: it needs `127.0.0.1`"
      - "`sudo ufw allow 5432`: that's the narrowest rule"
      - "`sudo ufw disable`: the firewall is the problem"
    answer: 0
    explain: >-
      `0.0.0.0:5432` means it's listening on every address, so it's the firewall: incoming is
      denied unless a rule allows it, and only 22/tcp does. Allowing the one host that needs it,
      on the one port, is the narrowest fix. `ufw allow 5432` would open the database to
      everyone who can reach the machine, and disabling the firewall opens everything.
  - type: choice
    q: "You added the allow rule, and `10.6.2.7` still can't reach port 3000. Why?"
    code: |-
      $ sudo ufw status numbered
      Status: active

           To                         Action      From
           --                         ------      ----
      [ 1] 22/tcp                     ALLOW IN    Anywhere
      [ 2] 3000                       DENY IN     Anywhere
      [ 3] 3000/tcp                   ALLOW IN    10.6.2.0/24
    options:
      - "ufw uses the first rule that matches, and rule 2 denies port 3000 to everyone before rule 3 is reached. Delete rule 2"
      - "`10.6.2.7` isn't in `10.6.2.0/24`"
      - "Rules only apply after `ufw reload`"
      - "A DENY rule only affects IPv6"
    answer: 0
    explain: >-
      Rules are checked top to bottom and the first match decides. Rule 2 matches every
      connection to 3000, so rule 3 never gets a look. Remove the blanket deny (`sudo ufw delete
      2`, or `sudo ufw delete deny 3000`), and the allow does its job.
  - type: choice
    q: "You're logged in to a server over SSH, and `ufw` is inactive. What do you do before `sudo ufw enable`?"
    options:
      - "`sudo ufw allow 22/tcp`: once it's on, anything without a rule is dropped, your next SSH connection included"
      - "Nothing: ufw never blocks SSH"
      - "`sudo ufw deny 22/tcp`, to keep attackers out"
      - "Reboot, so the rules load cleanly"
    answer: 0
    explain: >-
      Enabling ufw with no rule for SSH is the classic way to lock yourself out. Your current
      session usually survives, but the next login is dropped, and on a cloud server that can
      mean the provider's emergency console. Allow SSH first, then enable.
  - type: choice
    q: "With ufw's defaults, a connection to a port it doesn't allow is dropped. What does `nc -zv -w 3` on another machine say?"
    options:
      - "`timed out`: a dropped packet gets no answer at all"
      - "`Connection refused`"
      - "`Name or service not known`"
      - "`succeeded!`, because nc only checks the route"
    answer: 0
    explain: >-
      Drop means silence, so the other end waits and times out, the same as a machine that's
      down. A refusal comes from a machine that's reachable and has nothing on the port. That
      difference (module 03) is how you tell "blocked" from "not running".
  - type: multi
    q: "Which are true of ufw's default policy once it's enabled?"
    options:
      - "Incoming connections are denied unless a rule allows them"
      - "Outgoing connections are allowed"
      - "Replies to your own outgoing connections get back in"
      - "It closes connections that are already established"
    answer: [0, 1, 2]
    explain: >-
      `Default: deny (incoming), allow (outgoing)`, as `ufw status verbose` says, and a firewall
      that tracks connections lets the replies to yours back in. Connections already open when
      you enable it carry on.
cards:
  - id: listening-vs-reachable
    section: "Listening isn't reachable"
    front: "`ss` says it's listening on `0.0.0.0`, and other machines time out. What's the likely cause?"
    back: "A firewall dropping incoming connections to that port. Check `sudo ufw status`, and test from outside."
  - id: allow-one-host
    section: "Rules: allow, deny, and who from"
    accept: ["sudo ufw allow from 10.6.0.8 to any port 5432 proto tcp", "ufw allow from 10.6.0.8 to any port 5432 proto tcp"]
    front: "Let only `10.6.0.8` connect to TCP port 5432"
    back: "`sudo ufw allow from 10.6.0.8 to any port 5432 proto tcp`"
  - id: first-match
    section: "Rules: allow, deny, and who from"
    front: "Which ufw rule decides when several match?"
    back: "The first one, in `ufw status numbered` order. An earlier deny beats a later allow."
  - id: ssh-first
    section: "Turning it on without locking yourself out"
    front: "What must you do before `sudo ufw enable` on a server you reach by SSH?"
    back: "`sudo ufw allow 22/tcp` (or `OpenSSH`), or the next login is dropped."
terminal:
  task: |
    The relay's feed listens on **port 9100**, and Mission Control's host,
    **`mission.meridian`**, can't reach it. Find out why, and fix it so that **only Mission's
    host** can reach the feed on **TCP port 9100**: don't open it to anyone else, and keep the
    firewall on.

    You can run a command on Mission's host with `ssh mission.meridian 'COMMAND'`, and on the
    ops desk with `ssh ops-desk.meridian 'COMMAND'`: your key is already on both.

    When it works, save what Mission's host gets from **`http://10.4.1.23:9100/feed`** to
    **`~/feed.txt`**. Your password for `sudo` is `meridian`.
  cwd: /home/cadet
  groups: [sudo]
  password: meridian
  accounts:
    - {name: relay, uid: 991, comment: Relay service, home: /var/lib/relay}
  processes:
    - {command: /usr/local/bin/relay-feed --port 9100, user: relay, cpu: 0.3}
  network:
    interfaces: [{name: eth0, address: 10.4.1.23/24}]
    gateway: 10.4.1.1
    listening:
      - port: 9100
        process: relay-feed
        http:
          - {path: /feed, headers: {Content-Type: application/json}, body: "{\"relay\":\"relay.meridian\",\"uplink\":\"ok\",\"queued\":0}\n"}
    connections:
      - {process: sshd, remote: "10.4.1.5:51874", local_port: 22}
    hosts:
      - {name: mission, address: 10.4.1.40, login: true, services: [{port: 22}]}
      - {name: ops-desk, address: 10.4.1.5, login: true, services: [{port: 22}]}
      - {name: ns1, address: 10.4.1.53, services: [{port: 53, proto: udp}]}
    dns:
      server: 10.4.1.53
      records:
        - {name: relay.meridian, value: 10.4.1.23}
        - {name: mission.meridian, value: 10.4.1.40}
        - {name: ops-desk.meridian, value: 10.4.1.5}
        - {name: ns1.meridian, value: 10.4.1.53}
        - {name: 23.1.4.10.in-addr.arpa, type: PTR, value: relay.meridian}
        - {name: 40.1.4.10.in-addr.arpa, type: PTR, value: mission.meridian}
        - {name: 5.1.4.10.in-addr.arpa, type: PTR, value: ops-desk.meridian}
    firewall:
      enabled: true
      rules:
        - {port: 22, proto: tcp}
        - {action: deny, port: 9100, proto: tcp}
  files:
    - {path: /home/cadet, type: dir}
  checks:
    - {contains: /etc/ufw/user.rules, text: "### tuple ### allow tcp 9100 0.0.0.0/0 any 10.4.1.40 in\n"}
    - {contains: /etc/ufw/ufw.conf, text: "ENABLED=yes\n"}
    - {contains: /home/cadet/feed.txt, text: "\"relay\":\"relay.meridian\",\"uplink\":\"ok\""}
    - {lacks: /etc/ufw/user.rules, text: "### tuple ### allow tcp 9100 0.0.0.0/0 any 0.0.0.0/0 in"}   # ufw allow 9100/tcp: everyone
    - {lacks: /etc/ufw/user.rules, text: "### tuple ### allow any 9100 0.0.0.0/0 any 0.0.0.0/0 in"}   # ufw allow 9100
  success: |-
    Okafor watches the feed scroll on Mission's side. "Open to them, closed to everyone else. That's a firewall doing its job instead of just being in the way."
  solution:
    - sudo ss -tlnp
    - meridian
    - ssh mission.meridian 'nc -zv -w 3 10.4.1.23 9100'
    - sudo ufw status numbered
    - sudo ufw delete deny 9100/tcp
    - sudo ufw allow from 10.4.1.40 to any port 9100 proto tcp
    - ssh mission.meridian 'nc -zv -w 3 10.4.1.23 9100'
    - ssh ops-desk.meridian 'nc -zv -w 3 10.4.1.23 9100'
    - ssh mission.meridian 'curl -s http://10.4.1.23:9100/feed' > ~/feed.txt
    - cat ~/feed.txt
comms:
  open:
    - {from: mission, text: "*Meridian*, Mission Control. Your relay's feed on port 9100 isn't answering us. Not refused: nothing at all."}
    - {from: meridian, text: "relay-feed · 0.0.0.0:9100 · LISTENING · FROM mission.meridian: NO ANSWER"}
    - {from: okafor, text: "It's listening, and Mission gets silence. Find out what's swallowing it, and open it to Mission and nobody else."}
  console_done:
    - {from: meridian, text: "UFW · 9100/tcp ALLOW 10.4.1.40 · FROM mission.meridian: OPEN · FROM ops-desk.meridian: NO ANSWER"}
    - {from: okafor, text: "A deny on 9100, ahead of any allow for it. Somebody closed it for the refit and never opened it again."}
    - {from: okafor, text: "And you didn't just switch it off. Good. A firewall with one door open on purpose is worth ten turned off."}
  complete:
    - {from: mission, text: "*Meridian*, Mission Control. Relay feed live at our end. Queue's empty, uplink's clean."}
    - {from: okafor, text: "One thing left on the relay network, and it's the one I've been waiting for. There's a connection out of this station I want explained."}
---

## What a host firewall does

A **host firewall** is a filter in the machine's own kernel that decides, packet by packet, what
gets in and out. On Ubuntu the friendly front end is **`ufw`**, the uncomplicated firewall. A
fresh Ubuntu server has it installed and **inactive**: everything that listens is reachable.

Once it's on, its default policy is:

| Direction | Default | So |
|---|---|---|
| **Incoming** | **deny** | **nothing gets in unless a rule allows it** |
| Outgoing | allow | the machine can still reach out, and the replies get back in |

A denied connection is **dropped**: the packet is thrown away and nothing is said. The other end
waits and times out, exactly as if the machine weren't there (module 03). That's deliberate: a
refusal would tell a stranger something is there. Ping is let in, so a machine that answers ping
and times out on a port is the usual sign of a firewall.

## Listening isn't reachable

`ss -tlnp` (module 01) shows what's **listening**: a program is waiting on that port. The
firewall decides what's **reachable**: whether a connection from elsewhere ever arrives. The two
are separate questions, and **a service can be listening on `0.0.0.0` and still unreachable**.

From the machine itself you can't tell, because ufw only filters connections that come in from
outside. So **test from another machine**: `nc -zv -w 3 ADDRESS PORT` from there (module 03).
With SSH access to another machine, `ssh OTHER 'nc -zv -w 3 ADDRESS PORT'` runs the test there
and prints its answer here. That's how you'll check the relay: the station console runs one
command on another host this way.

| What the other machine sees | Means |
|---|---|
| `succeeded!` | listening, and the firewall lets it in |
| `Connection refused` | reachable, and nothing listens on that port |
| `timed out` | dropped by a firewall (or the machine is down) |

## `ufw status`

**`sudo ufw status` says whether the firewall is on, and lists its rules.** ufw needs root for
everything, even looking.

```text
$ sudo ufw status
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
5432/tcp                   ALLOW       10.6.0.8
22/tcp (v6)                ALLOW       Anywhere (v6)
```

**To** is the port on this machine (and protocol, if the rule names one), **Action** is allow or
deny, and **From** is who the rule is about. `(v6)` lines are the same rule for IPv6, added for
you when the rule doesn't name an IPv4 address. `sudo ufw status verbose` adds the defaults
(`Default: deny (incoming), allow (outgoing), deny (routed)`), and **`sudo ufw status numbered`
numbers the rules**, for deleting by number.

ufw keeps everything in files: `/etc/ufw/ufw.conf` says `ENABLED=yes` or `no`, and
`/etc/ufw/user.rules` holds each rule as a `### tuple ###` line. It's root's, so read it with
`sudo cat`.

## Rules: allow, deny, and who from

| Command | Lets in |
|---|---|
| `sudo ufw allow 22/tcp` | TCP port 22, from anywhere |
| `sudo ufw allow 8080` | port 8080, TCP and UDP, from anywhere |
| **`sudo ufw allow from 10.6.0.8 to any port 5432 proto tcp`** | **TCP port 5432 from `10.6.0.8` only** |
| `sudo ufw allow from 10.6.0.0/24 to any port 5432 proto tcp` | the same, from a whole subnet |
| `sudo ufw deny 3000` | nobody, to port 3000 (it's denied anyway: this is for overriding a broader allow) |

**Allow what's needed, from whoever needs it, and no more.** A database only the app server
uses should allow only the app server, not the world.

**The first rule that matches decides.** ufw checks rules in order, top to bottom, and stops at
the first one that fits the connection. New rules go at the end, so an earlier `deny` on a port
beats an `allow` added after it: the allow is in the list and never reached. When an allow
"doesn't work", look at `status numbered` for something above it.

**`sudo ufw delete RULE` removes a rule, written the way it was added**: `sudo ufw delete deny
3000`, `sudo ufw delete allow from 10.6.0.8 to any port 5432 proto tcp`. Or **`sudo ufw delete
NUM`**, using the number from `status numbered`; it shows the rule and asks first.

## Turning it on without locking yourself out

**`sudo ufw enable`** turns the firewall on now and at every boot, and **`sudo ufw disable`**
turns it off. Over SSH, enable asks first:

```text
$ sudo ufw enable
Command may disrupt existing ssh connections. Proceed with operation (y|n)? y
Firewall is active and enabled on system startup
```

It asks because **with no rule for SSH, the next SSH connection is dropped**. Your session
usually carries on, and the next login times out, which on a cloud server can mean the
provider's emergency console. **So allow SSH before you enable: `sudo ufw allow 22/tcp`.** Rules
can be added while ufw is off (it says `Rules updated`, and they apply from `enable`), so set
them up first and switch on last.

**Don't fix a firewall by turning it off.** `ufw disable` makes the problem go away by opening
every port on the machine. Find the rule that's missing or in the way, and change that.

**On the real station:** the droplet runs its apps in Docker, and Docker publishes a container's
port by writing its own firewall rules into the kernel, ahead of ufw's. So **a port Docker
publishes on `0.0.0.0` is open to the internet whatever ufw says**: ufw never sees it. That's why
this app's `docker-compose.yml` publishes only to `127.0.0.1:5002`, where nothing outside can
reach it, and why `tests/test_repo_hardening.py` refuses any port published beyond `127.0.0.1`,
with the message "ufw is bypassed". Nginx, on 443, is the way in.

## Try it

On an Ubuntu VM, or a container started with `--privileged` (ufw talks to the kernel's
firewall, which an ordinary container isn't allowed to touch): `sudo apt-get update && sudo
apt-get install -y ufw`. None of this turns the firewall on.

```bash
sudo ufw status                       # Status: inactive, on a fresh install
sudo ufw allow 22/tcp                 # Rules updated: written, applied once enabled
sudo ufw --dry-run allow from 10.0.0.5 to any port 9200 proto tcp | grep 9200   # what it would add
sudo grep tuple /etc/ufw/user.rules   # ### tuple ### allow tcp 22 ...
sudo ufw delete allow 22/tcp          # Rules updated
sudo grep ENABLED /etc/ufw/ufw.conf   # ENABLED=no
```
