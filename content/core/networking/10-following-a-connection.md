---
title: Following a connection
minutes: 20
story: |
  **Mission log, day 38.** The relays are up, the firewall's doing its job, and one thing on the
  station is still talking to the outside. `scrubber-flush`, the 02:35 job nobody wrote, went off
  last night as it does every night, and it hasn't finished. "It's waiting for something," says
  Okafor. "I want to know who it's waiting on."
quiz:
  - type: choice
    q: "Something on this server is talking to `198.51.100.23`, and the Process column is empty. Why, and how do you find it?"
    code: |-
      $ ss -tnp
      State Recv-Q Send-Q Local Address:Port   Peer Address:Port Process
      ESTAB 0      0          10.6.0.8:22         10.6.0.2:50114
      ESTAB 0      0          10.6.0.8:41872 198.51.100.23:443
    options:
      - "`ss -p` only names your own processes, so it's someone else's, probably root's: run `sudo ss -tnp`"
      - "The connection is closing, so it has no process any more"
      - "`-n` hides process names: run `ss -tp`"
      - "Nothing holds it: the kernel opened it"
    answer: 0
    explain: >-
      As a normal user, `ss -p` names only your own processes. Services and cron jobs usually
      run as other accounts or root, so their rows come back without a name. `sudo ss -tnp`
      shows every row's process and PID. `-n` only turns port and host names into numbers.
  - type: choice
    q: "You've found the address's name. What does this tell you?"
    code: |-
      $ dig -x 198.51.100.23 +short
      backup.example-cloud.net.
      $ dig backup.example-cloud.net +short
      203.0.113.9
    options:
      - "The name doesn't point back to the address, so the PTR record is only a claim, and you don't know who's at `198.51.100.23` yet"
      - "It's the backup service: the PTR record says so"
      - "DNS is broken on this machine"
      - "The connection is to `203.0.113.9`"
    answer: 0
    explain: >-
      A PTR record is written by whoever controls the address, and they can put any name in it.
      A forward lookup that comes back to the same address confirms it. This one doesn't, so
      "backup" is just a label somebody chose. `ss` already told you the real address: it's
      `198.51.100.23`, whatever the name says.
  - type: choice
    q: "`curl -v https://NAME/` shows a valid certificate for `NAME`. What does that prove?"
    options:
      - "That the server holds a certificate for that name, so you reached the machine the name belongs to. Not that it's one of yours, or friendly"
      - "That the server belongs to your organisation"
      - "That the traffic is harmless"
      - "Nothing: certificates are only checked by browsers"
    answer: 0
    explain: >-
      TLS proves you're talking to whoever controls the name, and encrypts the conversation.
      Anyone can get a valid certificate for a name they own. Whether that's someone you should
      be sending data to is a different question, and the certificate can't answer it.
  - type: choice
    q: "You've found an unknown root process with a connection to an address outside your network. What first?"
    options:
      - "Write down the process, PID, both ends of the connection and the name, before you stop anything"
      - "`sudo kill -9` it straight away"
      - "Reboot the server"
      - "Block the address with ufw, then look at what it was"
    answer: 0
    explain: >-
      Killing it closes the connection, and the peer address, the PID and the command line go
      with it. Record what you can see first. Then deciding what to stop, and how, is a choice
      made with the evidence kept. (And a ufw `deny` only filters incoming connections, not
      this one going out.)
  - type: multi
    q: "Which belong in a write-up of a connection you've followed?"
    options:
      - "The process, its PID and who it runs as"
      - "Both ends: the local and peer address and port"
      - "The peer's name, and whether it points back to the address"
      - "What you did and didn't change"
    answer: [0, 1, 2, 3]
    explain: >-
      All four. Whoever reads it next should be able to find the same thing, trust how you
      named it, and know what's been touched. A note that says only "something's talking to
      the internet" sends them back to the start.
cards:
  - id: whose-connection
    section: "Who: `sudo ss -tnp`"
    accept: ["sudo ss -tnp"]
    front: "List every established TCP connection with the process holding it, root's included"
    back: "`sudo ss -tnp`. Without `sudo`, other users' rows have no process."
  - id: forward-confirm
    section: "Where: name the address, then check the name"
    front: "`dig -x` gave an address's name. How do you check it?"
    back: "Look the name up (`dig NAME +short`). If it gives the same address back, the name is confirmed. If it doesn't, the PTR record is only a claim."
  - id: certificate-proves
    section: "What: ask it with `curl -v`"
    front: "What does a valid certificate for a name prove?"
    back: "That the server controls that name. Not that it's yours, or friendly."
  - id: record-before-kill
    section: "Writing it up"
    front: "Why write down an unknown process's connection before you kill it?"
    back: "Killing it closes the connection: the peer, the PID and the command line go with it."
terminal:
  task: |
    `scrubber-flush`, the job `/etc/cron.d/scrubber-maint` starts at 02:35, is still running,
    and it's connected to something. Find out what, and **don't stop it**: Okafor wants it
    running, as evidence.

    Write it up in **`~/scrubber-flush.txt`**, one line each, in exactly this form:

    ```text
    process NAME
    peer ADDRESS:PORT
    name NAME
    server SERVER
    mission ADDRESS
    ```

    - `process`: the program holding the connection, as `ss` names it.
    - `peer`: the address and port at the **other** end of its connection.
    - `name`: the name that address belongs to, by its PTR record.
    - `server`: what the `Server:` header says when you ask that name for `/` over HTTPS.
    - `mission`: Mission Control's address, the one DNS gives for **`mission.meridian`**, to
      compare.

    Your password for `sudo` is `meridian`.
  cwd: /home/cadet
  groups: [sudo]
  password: meridian
  accounts:
    - {name: telemetry, uid: 992, comment: Telemetry uplink, home: /var/lib/telemetry}
  processes:
    - {command: /usr/local/bin/telemetry-link, user: telemetry, cpu: 0.6}
    - {command: /usr/local/sbin/scrubber-flush, user: root, cpu: 0.0}
  network:
    interfaces: [{name: eth0, address: 10.4.2.5/24}]
    gateway: 10.4.2.1
    connections:
      - {process: telemetry-link, remote: "10.4.1.40:443"}
      - {process: scrubber-flush, remote: "203.0.113.47:443"}
      - {process: sshd, remote: "10.4.1.5:51874", local_port: 22}
    hosts:
      - name: mission
        address: 10.4.1.40
        services:
          - port: 443
            tls: trusted
            http:
              - {path: /, headers: {Server: mission-uplink, Content-Type: text/plain}, body: "mission control uplink: online\n"}
      - {name: ops-desk, address: 10.4.1.5, services: [{port: 22}]}
      - name: depot-relay
        address: 203.0.113.47
        services:
          - port: 443
            tls: trusted
            http:
              - {path: /, headers: {Server: depot-relay, Content-Type: text/plain}, body: "awaiting controller state from meridian/scrubber-b\n"}
    dns:
      records:
        - {name: mission.meridian, value: 10.4.1.40}
        - {name: ops-desk.meridian, value: 10.4.1.5}
        - {name: relay.depot-sync.net, value: 203.0.113.47}
        - {name: 40.1.4.10.in-addr.arpa, type: PTR, value: mission.meridian}
        - {name: 5.1.4.10.in-addr.arpa, type: PTR, value: ops-desk.meridian}
        - {name: 47.113.0.203.in-addr.arpa, type: PTR, value: relay.depot-sync.net}
  files:
    - {path: /home/cadet, type: dir}
    - path: /etc/cron.d/scrubber-maint
      contents: |
        # nightly controller flush. do not remove
        35 2 * * *  root  /usr/local/sbin/scrubber-flush >/dev/null 2>&1
    - {path: /usr/local/sbin/scrubber-flush, owner: root, group: root, mode: "700", contents: "#!/bin/sh\n"}
  checks:
    - {contains: /home/cadet/scrubber-flush.txt, text: "process scrubber-flush\n"}
    - {contains: /home/cadet/scrubber-flush.txt, text: "peer 203.0.113.47:443\n"}
    - {contains: /home/cadet/scrubber-flush.txt, text: "name relay.depot-sync.net"}
    - {contains: /home/cadet/scrubber-flush.txt, text: "server depot-relay\n"}
    - {contains: /home/cadet/scrubber-flush.txt, text: "mission 10.4.1.40\n"}
    - {running: scrubber-flush}
  success: |-
    Okafor reads it down to the last line, then back up to the third. "relay.depot-sync.net," he says. "The depot doesn't run relays. It runs a package mirror."
  solution:
    - ss -tnp
    - sudo ss -tnp
    - meridian
    - dig -x 203.0.113.47 +short
    - dig relay.depot-sync.net +short
    - dig mission.meridian +short
    - curl -v https://relay.depot-sync.net/
    - echo "process scrubber-flush" > ~/scrubber-flush.txt
    - echo "peer 203.0.113.47:443" >> ~/scrubber-flush.txt
    - echo "name relay.depot-sync.net" >> ~/scrubber-flush.txt
    - echo "server depot-relay" >> ~/scrubber-flush.txt
    - echo "mission 10.4.1.40" >> ~/scrubber-flush.txt
    - cat ~/scrubber-flush.txt
comms:
  open:
    - {from: meridian, text: "SCRUBBER-FLUSH · RUNNING · OWNER ROOT · ITS CONNECTIONS: 1 · DESTINATION: UNVERIFIED"}
    - {from: okafor, text: "It went off at 02:35 like every night, and it never finished. It's sitting on a connection, waiting."}
    - {from: okafor, text: "Who it's talking to, the name and the address, and what's at the other end. Write it up. And don't kill it: if it's what I think it is, it's evidence."}
  console_done:
    - {from: meridian, text: "SCRUBBER-FLUSH → 203.0.113.47:443 · RELAY.DEPOT-SYNC.NET · MISSION.MERIDIAN: 10.4.1.40 · MATCH: NONE"}
    - {from: okafor, text: "Not ours, and not Mission's. The depot's update feed brought this job aboard, and the job phones the depot."}
    - {from: okafor, text: "\"Awaiting controller state from scrubber B.\" So it sends them the scrubber's state, every night, and waits for an answer."}
  complete:
    - {from: meridian, text: "RELAY NETWORK · ALL LINKS NOMINAL"}
    - {from: mission, text: "*Meridian*, Mission Control. Every relay green at our end, and we have your write-up. That's networking done, cadet."}
    - {from: okafor, text: "A connection tells you who. It doesn't tell you what was said. For that we need the logs from that night, and every service on this station writes to the journal."}
    - {from: okafor, text: "Which means systemd. It runs the scrubbers, and it'll tell us what scrubber-flush did at 02:40."}
  window: {complete: aurora}
---

## From "something's talking" to an answer

A connection you can't explain is one of the commonest things to land on a sysadmin's desk: a
server sending traffic somewhere at night, a process with a socket nobody recognises. Every tool
it takes is one you've already used in this unit. What's new is putting them in order, and
writing down what you find.

| Question | Tool | From module |
|---|---|---|
| **Who** holds the connection? | `sudo ss -tnp` | 01 |
| **Where** does it go, by address and by name? | `dig -x ADDRESS`, then `dig NAME` | 02 |
| **What** is at the other end? | `curl -v` | 04, 06 |
| What did you find? | a write-up | this one |

## Who: `sudo ss -tnp`

`ss -tnp` (module 01) lists the established TCP connections and the process holding each one.
The column to read is **Peer Address:Port: the other machine's end**. Local Address:Port is this
machine's, usually with a high, random port it picked for the connection.

**As a normal user, the Process column is empty for every socket that isn't yours.** Cron jobs
and services run as root or their own accounts, so the one you're after usually comes back
nameless. **`sudo ss -tnp` names them all**:

```text
$ sudo ss -tnp
State Recv-Q Send-Q Local Address:Port   Peer Address:Port Process
ESTAB 0      0          10.6.0.8:22         10.6.0.2:50114 users:(("sshd",pid=902,fd=4))
ESTAB 0      0          10.6.0.8:41872 198.51.100.23:443  users:(("backup-agent",pid=1433,fd=7))
```

`backup-agent`, PID 1433, is talking to `198.51.100.23` on 443. The peer isn't in the private
ranges (`10/8`, `172.16/12`, `192.168/16`), so it's outside this network. `ps aux | grep
backup-agent` adds who it runs as and its full command line.

## Where: name the address, then check the name

**`dig -x ADDRESS +short` asks for the address's PTR record**: the name it belongs to (module
02).

A PTR record is written by whoever controls the address, and **a PTR record is only a claim**:
they can put any name there. So **check it the other way: look the name up, and see whether it
gives the same address back**.

```text
$ dig -x 198.51.100.23 +short
backup.example-cloud.net.
$ dig backup.example-cloud.net +short
198.51.100.23
```

Both directions agree, so the name is confirmed. If the forward lookup gives a different address,
or nothing, the name tells you nothing you can rely on. Go by the address `ss` showed.

Then compare it with what you expected. If the connection should be to your own backup server,
look that name up too: **`dig NAME +short` for the machine you expected, and see whether the
addresses match**.

## What: ask it with `curl -v`

Knowing the name, ask the other end who it is. **`curl -v https://NAME/`** shows the whole
conversation (module 04): which address it connected to, the server's certificate (module 06),
and the response's headers. **The `Server:` header is what the server says it is**, and the body
is often a status line or an error that says more.

```text
$ curl -v https://backup.example-cloud.net/
*   Trying 198.51.100.23:443...
* Connected to backup.example-cloud.net (198.51.100.23) port 443
…
*  subject: CN=backup.example-cloud.net
…
< HTTP/1.1 200 OK
< Server: archivist
```

Use the name, not the address: by address, the certificate's name usually doesn't match, and
curl stops there.

**A valid certificate proves the server controls the name.** It doesn't prove the name is yours,
or that it's somewhere your data should go. Anyone can get a certificate for a name they own.

## Writing it up

Write down what you found before you change anything. **Killing the process closes its
connection, and the peer, the PID and the command line go with it.** A write-up answers the next
person's questions before they ask:

- **When**: the date and time you looked.
- **Who**: the process, its PID, and who it runs as.
- **Where**: both ends, `LOCAL:PORT → PEER:PORT`, the peer's name, and whether it points back.
- **What**: what the other end says it is.
- **What you did**: and what you deliberately left alone.

Then decide what to stop. A firewall rule won't do it: ufw's defaults allow outgoing connections
(module 09).

**On the real station:** on the droplet, `sudo ss -tnp` shows Nginx's connections: browsers
coming in on 443, and Nginx's own to `127.0.0.1:5002`, the port Compose publishes for this app's
container. During a deploy there's one more: GitHub Actions logged in to `sshd` on 22 as the
deploy user. Anything on that list you can't name is worth following this way.

## Try it

On a real Ubuntu machine (a container needs `sudo apt-get update && sudo apt-get install -y
iproute2 dnsutils curl`). Bash can hold a connection open itself, which gives you one to follow:

```bash
exec 3<>/dev/tcp/1.1.1.1/80        # open a TCP connection on file descriptor 3, and keep it
ss -tnp                            # ESTAB ... 1.1.1.1:80 users:(("ss",...),("bash",...)): bash holds it, ss inherited it
dig -x 1.1.1.1 +short              # one.one.one.one.
dig one.one.one.one +short         # 1.1.1.1 and 1.0.0.1: the name points back
curl -sv https://one.one.one.one/ -o /dev/null 2>&1 | grep -i '^< server'   # < server: cloudflare
exec 3>&-                          # close it
ss -tn                             # no longer ESTAB: FIN-WAIT-1 while it closes, then gone
```
