---
# No console task: a lab (#121). Keys are made with the real ssh-keygen on your own machine,
# which the station console doesn't simulate.
title: SSH keys
minutes: 20
story: |
  **Mission log, day 35.** The relay station needs hands on it, and you're the hands. "I don't
  hand out passwords," says Okafor. "Send me your public key, and check the relay's own key
  before you trust it. That's the whole of it."
quiz:
  - type: choice
    q: "You've connected to `archive.example.org` from this laptop for months. Today you see this. What do you do?"
    code: |-
      @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
      @    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
      @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
      IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!
      ...
      Host key verification failed.
    options:
      - "Stop, and find out from whoever runs the server whether its key really changed (a rebuild, a new server). Only then remove the old line with `ssh-keygen -R` and accept the new key"
      - "Run `ssh-keygen -R archive.example.org` straight away and connect again"
      - "Delete `~/.ssh/known_hosts` so the warning goes away for good"
      - "Generate a new key pair of your own: yours has changed"
    answer: 0
    explain: >-
      The server sent a different host key from the one `known_hosts` remembers. Either the
      server was rebuilt, or something between you is pretending to be it. ssh can't tell
      which, so it refuses. Check through another channel before trusting the new key; removing
      the line first and asking later is exactly what an attacker hopes you'll do. It says
      nothing about your own key.
  - type: choice
    q: "`ssh archive` stops before it connects. What does this tell you?"
    code: |-
      $ cat ~/.ssh/config
      Host archive
          HostName archive.example.org
          Username nakamura
          IdentityFile ~/.ssh/archive_key
      $ ssh -G archive | grep -E '^(user|hostname) '
      /home/cadet/.ssh/config: line 3: Bad configuration option: username
      /home/cadet/.ssh/config: terminating, 1 bad configuration options
    options:
      - "The option is `User`, not `Username`: ssh refuses a config it can't read, and `ssh -G` says which line"
      - "`HostName` must be an IP address"
      - "The key is the wrong type"
      - "`ssh -G` only works after a successful login"
    answer: 0
    explain: >-
      ssh's option is `User`. `ssh -G HOST` prints the settings ssh would use for HOST without
      connecting, and it fails loudly on a mistake like this one, which makes it the quickest
      way to check a config entry.
  - type: choice
    q: "Which half of a key pair goes to the server, and where does it go?"
    options:
      - "The public key (`.pub`), as one line in `~/.ssh/authorized_keys` of the account you log in as"
      - "The private key, in `/etc/ssh/sshd_config`"
      - "The public key, in your own `~/.ssh/known_hosts`"
      - "Both halves, so the server can check them against each other"
    answer: 0
    explain: >-
      The private key never leaves your machine. The server keeps your public key in the
      account's `authorized_keys`, and at login you prove you hold the matching private key.
      `known_hosts` is the other direction: the servers' keys, kept on your side.
  - type: multi
    q: "Which are true of `ssh-keygen -t ed25519 -f ~/.ssh/archive_key`?"
    options:
      - "It writes the private key to `~/.ssh/archive_key` and the public key to `~/.ssh/archive_key.pub`"
      - "The private key file is readable by you only (600)"
      - "The passphrase it asks for protects the private key file if someone copies it"
      - "It uploads the public key to the server"
    answer: [0, 1, 2]
    explain: >-
      ssh-keygen only makes the pair, on this machine. Getting the public key to a server is a
      separate step (`ssh-copy-id`, or adding the line to `authorized_keys`). The passphrase
      encrypts the private key file, so a stolen copy is useless without it.
  - type: fill
    q: "Which file on your machine remembers the host keys of servers you've connected to? (path from your home)"
    answer: ["~/.ssh/known_hosts", ".ssh/known_hosts"]
    explain: >-
      `~/.ssh/known_hosts`. On the first connection ssh asks you to check the server's
      fingerprint, and once you accept, it writes the key there and checks it every time after.
cards:
  - id: key-halves
    section: "Keys instead of passwords"
    front: "What's in `authorized_keys`, and what's in `known_hosts`?"
    back: "`authorized_keys` (on the server): the public keys allowed to log in to that account. `known_hosts` (on your side): the host keys of servers you've accepted."
  - id: keygen
    section: "Making a key"
    accept: ["ssh-keygen -t ed25519 -C cadet-laptop -f ~/.ssh/archive_key", "ssh-keygen -t ed25519 -f ~/.ssh/archive_key -C cadet-laptop"]
    front: "Make an ed25519 key at `~/.ssh/archive_key`, with the comment `cadet-laptop`"
    back: "`ssh-keygen -t ed25519 -C cadet-laptop -f ~/.ssh/archive_key`"
  - id: fingerprint
    section: "Fingerprints"
    accept: ["ssh-keygen -lf ~/.ssh/archive_key.pub"]
    front: "Print the fingerprint of `~/.ssh/archive_key.pub`"
    back: "`ssh-keygen -lf ~/.ssh/archive_key.pub` (`-l` list the fingerprint, `-f` of this file)"
  - id: ssh-g
    section: "`~/.ssh/config` and `ssh -G`"
    front: "How do you see what settings ssh will use for a host, without connecting?"
    back: "`ssh -G HOST`: every setting ssh worked out from `~/.ssh/config` and its defaults. Pipe it to `grep` for the ones you want."
lab:
  from: okafor
  task: |-
    Get ready to work on the relay: a key of your own, a config entry that uses it, and a
    habit of checking a server's key. Everything happens on your own machine; nothing connects
    to the relay.

    1. ssh comes with a Mac and with Ubuntu (`sudo apt install openssh-client` if it's missing).
    2. Make an **ed25519** key pair at **`~/.ssh/meridian_relay`**, with the comment
       **`meridian-relay-lab`**. Give it a passphrase if you like (it doesn't change the
       fingerprint). Paste **the public key's fingerprint** in the first box.
    3. Add an entry to `~/.ssh/config` so that `ssh relay` would log in to
       **`relay.meridian.example`** as the user **`okafor`**, with that key. Then check it without
       connecting, and paste only ssh's `user`, `hostname`, `port` and `identityfile` lines in
       the second box.
    4. GitHub's servers have a host key like any other. Fetch GitHub's **ed25519** host key and
       print its fingerprint, then compare it with the one GitHub publishes (search for
       "GitHub's SSH key fingerprints" on docs.github.com). Paste the fingerprint line in the
       last box.

    Never paste a private key anywhere, here included. Nothing in this lab needs one.
  boxes:
    - prompt: The fingerprint of `~/.ssh/meridian_relay.pub`.
      checks:
        - {regex: '^256 SHA256:[A-Za-z0-9+/]{43} ', says: "A SHA256 fingerprint of a 256-bit key", hint: "ssh-keygen -lf prints one line: the size, the fingerprint, the comment and the type. A long line starting ssh-ed25519 is the key itself, not its fingerprint."}
        - {regex: ' meridian-relay-lab \(ED25519\)\s*$', says: "An ED25519 key with the comment meridian-relay-lab", hint: "Another comment or type? -t ed25519 sets the type and -C the comment. Make the key again with both."}
        - {not_contains: "PRIVATE KEY", says: "No private key in the paste", hint: "That's the private key. Don't paste it anywhere: make a new pair, and use the .pub half for the fingerprint."}
      example: |
        256 SHA256:0W3lTNI26hvTR6CpeNpd0sglyZgsLuPn2VusYl5Ta64 meridian-relay-lab (ED25519)
    - prompt: The `user`, `hostname`, `port` and `identityfile` lines ssh would use for `relay`.
      checks:
        - {regex: '^user okafor\s*$', says: "The user okafor", hint: "The option is User."}
        - {regex: '^hostname relay\.meridian\.example\s*$', says: "The real name behind relay", hint: "hostname relay? The Host line names the entry; HostName says where it really goes."}
        - {regex: '^port 22\s*$', says: "The usual port"}
        - {regex: '^identityfile \S*\.ssh/meridian_relay\s*$', says: "The key from step 2, and only that key", hint: "A list of id_ files? Without IdentityFile ssh tries its defaults."}
        - {lines: {min: 4, max: 4}, says: "Just those four lines", hint: "ssh -G prints about 80 lines: grep -E for the four you need."}
      example: |
        user okafor
        hostname relay.meridian.example
        port 22
        identityfile ~/.ssh/meridian_relay
    - prompt: The fingerprint of GitHub's ed25519 host key.
      checks:
        - {regex: '^256 SHA256:\+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU github\.com \(ED25519\)\s*$', says: "GitHub's ed25519 host key, matching the fingerprint GitHub publishes", hint: "Another type? Ask ssh-keyscan for -t ed25519 only, and pipe it to ssh-keygen -lf - (the - reads standard input)."}
      example: |
        256 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU github.com (ED25519)
comms:
  open:
    - {from: meridian, text: "RELAY STATION · REMOTE ACCESS: KEYS ONLY · PASSWORD LOGIN: DISABLED"}
    - {from: okafor, text: "Make yourself a key. The private half stays with you. You send me the public half, and I add it to the relay."}
    - {from: okafor, text: "And before you ever type yes to a host key, you check its fingerprint. Practise on GitHub's: they publish theirs."}
  lab_done:
    - {from: meridian, text: "KEY meridian-relay-lab · ED25519 · CONFIG: relay → okafor@relay.meridian.example · github.com HOST KEY: MATCHES PUBLISHED"}
    - {from: okafor, text: "That fingerprint's yours. I'll add your public key to the relay. Nobody needs a password, and nobody can guess one."}
  complete:
    - {from: mission, text: "*Meridian*, Mission Control. Relay access logs show key logins only. Exactly as it should be."}
    - {from: okafor, text: "Next: moving files over that connection, and reaching things on the far side of it."}
---

## Keys instead of passwords

A password can be guessed, reused, phished or watched as it's typed. SSH can log you in with a
**key pair** instead: two files made together, where what one signs only the other can
check.

- The **private key** stays on your machine, readable by you only. It never leaves.
- The **public key** goes to every server you want to log in to. It's safe to share: from it,
  nobody can work out the private key.

The server keeps your public key in **`~/.ssh/authorized_keys`** of the account you log in as,
one key per line. At login it sends a challenge, your ssh signs it with the private key, and the
server checks the signature against the public key it has. Nothing secret crosses the network.

Keys work the other way too. Every SSH server has a **host key** of its own, and your side keeps
the host keys of servers you've accepted in **`~/.ssh/known_hosts`**:

| File | Where | Holds |
|---|---|---|
| `~/.ssh/authorized_keys` | **on the server**, in the account you log in as | the public keys allowed to log in |
| `~/.ssh/known_hosts` | **on your side** | the host keys of servers you've accepted |

## Making a key

**`ssh-keygen` makes a key pair.** Its options:

| Option | Means |
|---|---|
| **`-t ed25519`** | **the type**: ed25519, short and modern. Use it unless an old server can't |
| **`-C COMMENT`** | **a label** stored with the public key, to tell keys apart (usually who and which machine) |
| **`-f FILE`** | **where to save it**: the private key at FILE, the public at FILE.pub |

```text
$ ssh-keygen -t ed25519 -C cadet-laptop -f ~/.ssh/archive_key
Generating public/private ed25519 key pair.
Enter passphrase (empty for no passphrase):
Enter same passphrase again:
Your identification has been saved in /home/cadet/.ssh/archive_key
Your public key has been saved in /home/cadet/.ssh/archive_key.pub
```

**The passphrase encrypts the private key file**, so a copy of it is useless without the
passphrase. On a laptop, give it one; ssh's agent remembers it so you type it once per
session. A key a program uses unattended, like a deploy, has none, and is protected by
everything around it instead.

ssh is strict about permissions, because a readable private key is a stolen one:
`~/.ssh` should be `700` and the private key `600`. ssh-keygen makes the key `600`, and makes
`~/.ssh` `700` if it has to create it.

To put your public key on a server you can already reach, `ssh-copy-id -i ~/.ssh/archive_key.pub
user@host` adds it to that account's `authorized_keys`. Otherwise you send the `.pub` file to
whoever runs the server, and they add it.

## Fingerprints

A key is long. Its **fingerprint** is a short hash of it, for checking by eye that two keys are
the same. **`ssh-keygen -lf FILE` prints a key's fingerprint**: `-l` to list it, `-f` for the
file. It reads the public key, or a file of keys like `known_hosts`, and with **`-f -`** it reads
the key from standard input instead:

```text
$ ssh-keygen -lf ~/.ssh/archive_key.pub
256 SHA256:AyUXGIuxMx3tk7vAIMQ5h/vO1LOt2veX53XlpLcx93s cadet-laptop (ED25519)
```

That's the key's size in bits, the fingerprint, its comment and its type. Compare fingerprints
whenever a key changes hands: when you send yours, the person adding it can read it back to you.

**`ssh-keyscan HOST`** asks a server for its host keys without logging in, and prints them in
`known_hosts`'s format, one line per type; `-t ed25519` asks for one type. Piped into
`ssh-keygen -lf -`, it gives you a server's fingerprint to compare with the one its owner
publishes.

## The host key warning

The first time you connect to a server, your side has never seen its host key, so ssh asks:

```text
The authenticity of host 'github.com (140.82.114.3)' can't be established.
ED25519 key fingerprint is SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU.
This key is not known by any other names.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

**Check that fingerprint before typing `yes`**: against the one the server's owner publishes, or
one they read to you. Answering yes writes the key to `known_hosts`, and from then on ssh checks
it every time, silently.

If the key a server sends ever stops matching, ssh refuses to go on:

```text
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!
...
Offending ED25519 key in /home/cadet/.ssh/known_hosts:1
  remove with:
  ssh-keygen -f '/home/cadet/.ssh/known_hosts' -R 'github.com'
Host key verification failed.
```

Either the server was rebuilt and has a new key, or something is pretending to be it. **Find
out which before you do anything**: ask whoever runs the server. Only when you know the change
is real, remove the old line with `ssh-keygen -R HOST` and connect again to accept the new key.

## `~/.ssh/config` and `ssh -G`

Typing `ssh -i ~/.ssh/archive_key nakamura@archive.example.org` every time gets old.
**`~/.ssh/config` gives a host a short name and its settings**. It may not exist yet, and if it
does, add to it (`nano ~/.ssh/config`): `cat > ~/.ssh/config` would replace what's there.

```text
Host archive
    HostName archive.example.org
    User nakamura
    IdentityFile ~/.ssh/archive_key
    IdentitiesOnly yes
```

| Option | Means |
|---|---|
| **`Host NAME`** | the entry's name: the settings below it apply to `ssh NAME` |
| **`HostName`** | **the real address or name to connect to** |
| **`User`** | the account to log in as |
| **`IdentityFile`** | **the private key to use** |
| `IdentitiesOnly yes` | use only that key, not every key the agent holds |
| `Port` | if the server isn't on 22 |

Now `ssh archive` does the lot, and so do `scp` and `git` for that name.

**`ssh -G HOST` prints every setting ssh would use for HOST, without connecting**: what it read
from the config, and the defaults for everything else, about 80 lines of `name value`. Filter
it with `grep -E` for the ones you care about:

```text
$ ssh -G archive | grep -E '^(user|hostname|identityfile) '
user nakamura
hostname archive.example.org
identityfile ~/.ssh/archive_key
```

It's the quickest check of a config entry. A misspelt option is refused with the file and line
(`Bad configuration option`), and a host with no `IdentityFile` shows ssh's list of default
keys (`~/.ssh/id_rsa`, `~/.ssh/id_ed25519` …) instead of yours.

**On the real station:** the deploy logs in to the droplet with a key, every time, as the
`deploy` user. The release workflow (`.github/workflows/release.yml`) writes the private key
from a GitHub secret to `~/.ssh/deploy_key` with `chmod 600`, and connects with `ssh -i
~/.ssh/deploy_key -o IdentitiesOnly=yes -o BatchMode=yes`. `BatchMode=yes` means never ask
anything: no passwords and no "are you sure?". Because nobody is there to check a fingerprint,
it never trusts a host key on first sight either. It writes `known_hosts` from another
secret, `DROPLET_KNOWN_HOSTS`, holding the droplet's host keys, so a server with any
other key fails the deploy instead of receiving it.

## Try it

On your own machine. A container needs the tools first: `sudo apt-get update && sudo apt-get
install -y openssh-client`. These make a throwaway key in `/tmp` and touch nothing in your
`~/.ssh`.

```bash
ssh-keygen -t ed25519 -C try-it -f /tmp/try_key -N ''   # -N '': no passphrase, for a throwaway
ls -l /tmp/try_key /tmp/try_key.pub                     # -rw------- private, -rw-r--r-- public
ssh-keygen -lf /tmp/try_key.pub                         # 256 SHA256:… try-it (ED25519)
cut -c1-40 /tmp/try_key.pub                             # ssh-ed25519 AAAA…: the public key itself
ssh-keyscan -t ed25519 github.com 2>/dev/null | ssh-keygen -lf -   # GitHub's: SHA256:+DiY3wvv…
printf 'Host try\n    HostName try.example.org\n    User nakamura\n    IdentityFile /tmp/try_key\n' > /tmp/try_config
ssh -F /tmp/try_config -G try | grep -E '^(user|hostname|identityfile) '   # the three settings
rm /tmp/try_key /tmp/try_key.pub /tmp/try_config
```
