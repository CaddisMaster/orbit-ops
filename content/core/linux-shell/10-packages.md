---
# No console task (#37): a simulated apt/dpkg would teach the command names but not what
# matters (real repositories, versions, dependencies). The "Try it" on a real machine covers it.
title: Installing software with apt
minutes: 15
story: |
  **Mission log, day 10.** Life support is stable, but the console is missing half the tools
  you'd expect. "There's a supply depot for that," says Okafor. "Learn to order from it
  properly. And learn to read the label before you install."
quiz:
  - type: choice
    q: What does `sudo apt update` do?
    options:
      - "Upgrades every installed package"
      - "Refreshes the list of available packages and versions, and installs nothing"
      - "Updates apt itself"
      - "Installs security patches only"
    answer: 1
    explain: >-
      `update` downloads the latest package lists from your repositories. `upgrade` is what
      installs newer versions. You almost always run `update` first.
  - type: choice
    q: What's the difference between `apt remove nginx` and `apt purge nginx`?
    options:
      - "None"
      - "`purge` also deletes the package's system configuration files"
      - "`purge` also deletes your home directory files"
      - "`remove` keeps the program and deletes the config"
    answer: 1
    explain: >-
      `remove` keeps files like `/etc/nginx/` so a reinstall picks up your configuration.
      `purge` deletes them too. Neither touches files in your home directory.
  - type: choice
    q: "In a Dockerfile, why does `apt-get install …` end with `&& rm -rf /var/lib/apt/lists/*`?"
    options:
      - "To uninstall apt"
      - "To keep the downloaded package lists out of the image layer, making it smaller"
      - "To force a fresh download next time"
      - "For security: the lists contain passwords"
    answer: 1
    explain: >-
      The package lists are only needed while installing. Deleting them **in the same `RUN`**
      keeps them out of that layer. Deleting them in a later `RUN` wouldn't shrink the image.
      This app's own Dockerfile does exactly this.
  - type: fill
    q: Type the command that lists every file installed by the `nginx` package.
    answer: ["dpkg -L nginx"]
    explain: >-
      `dpkg` is the low-level tool underneath apt. `dpkg -L nginx` lists the package's files, and
      `dpkg -S /usr/sbin/nginx` tells you which package owns a file.
comms:
  open:
    - {from: okafor, text: "Life support is stable. Last job: the console's missing half the tools you'd expect."}
    - {from: okafor, text: "There's a supply depot for that. Learn to order from it properly, and read the label before you install."}
  complete:
    - {from: meridian, text: "LIFE SUPPORT · ALL SYSTEMS NOMINAL · DECK ONLINE"}
    - {from: mission, text: "*Meridian*, Mission Control. That's every life-support system green. Outstanding work, cadet."}
    - {from: okafor, text: "Look out the window. You've earned that one."}
  window: {complete: aurora}
cards:
  - id: update-vs-upgrade
    section: "The package manager"
    front: "`apt update` vs `apt upgrade`"
    back: "`update` refreshes the package lists; `upgrade` installs newer versions of what's installed."
  - id: package-owner
    section: "Asking questions"
    accept: ["dpkg -S /usr/bin/curl"]
    front: Which package owns /usr/bin/curl?
    back: "`dpkg -S /usr/bin/curl`"
  - id: package-versions
    section: "Asking questions"
    accept: ["apt-cache policy nginx", "apt policy nginx"]
    front: See the installed and candidate versions of a package
    back: "`apt-cache policy nginx` (or `apt policy nginx`)."
---

## The package manager

Ubuntu and Debian (the Linux Ubuntu is built on) install software as **packages**: a program and its files, bundled into one
`.deb` file. Packages come from **repositories**, servers that host thousands of them. Most
programs need other packages to run, their **dependencies**, and `apt` works those out and
installs them for you. `apt` is short for Advanced Package Tool. The examples use `htop`, a
live, colourful view of what's running.

| You type | Does |
|---|---|
| `sudo apt update` | downloads the latest lists of what each repository offers, **and installs nothing** |
| `apt search htop` | finds packages whose name or description mention `htop` |
| `apt show htop` | describes a package, before you install it: what it is, its version, its dependencies |
| `sudo apt install htop` | installs it, with its dependencies |
| `sudo apt upgrade` | installs newer versions of everything you already have |
| `sudo apt remove htop` | uninstalls it, but keeps its settings in `/etc` |
| `sudo apt purge htop` | uninstalls it and deletes those settings too |
| `sudo apt autoremove` | removes dependencies that nothing installed needs any more |

`update`, `install`, `upgrade`, `remove`, `purge` and `autoremove` change files root owns, so
they need `sudo` (module 05). `update` writes its lists into `/var/lib/apt/lists/`. `search`,
`show` and everything in *Asking questions* only read, so they don't. Forget `sudo` on
`update` and you get `E: Could not open lock file /var/lib/apt/lists/lock - open (13:
Permission denied)`.

**`update` before `install` or `upgrade`.** `update` only refreshes the lists, so `apt` knows
which versions exist. `upgrade` is what installs them.

When `install` has to add other packages too, dependencies or extras, it lists them and asks
`Do you want to continue? [Y/n]`. `remove` and `purge` ask the same. The capital `Y` is the default, so Enter means yes, and `n`
cancels. A package that needs nothing else installs without asking.

`remove` keeps a package's settings in `/etc`, for nginx `/etc/nginx/`, so a reinstall picks
your configuration up again. `purge` deletes them too. **Neither touches your home directory.**

## Asking questions

`apt` is the newer, friendlier command: it calls older tools for you. Two of those, `apt-cache`
and `dpkg` (**D**ebian **pack**a**g**e), are still the usual way to ask these questions:

| You type | Prints |
|---|---|
| `apt list --installed \| grep nginx` | whether nginx is installed (module 08's `grep` on apt's list) |
| `apt-cache policy nginx` | the version you have, the version you'd get, and which repository it comes from. `apt policy nginx` is the same |
| `dpkg -L nginx` | every file the package installed |
| `dpkg -S /usr/sbin/nginx` | which package owns that file: `nginx: /usr/sbin/nginx` |

`apt-cache policy` starts like this:

```text
htop:
  Installed: (none)
  Candidate: 3.3.0-4build1
```

`Installed:` is the version you have (`(none)` if it isn't installed), and `Candidate:` is the
version `install` or `upgrade` would get you.

`apt list --installed | grep nginx` prints a line such as `nginx/noble,now 1.24.0 amd64
[installed]` if nginx is installed, and nothing at all if it isn't. Into a pipe, `apt` also
prints `WARNING: apt does not have a stable CLI interface. Use with caution in scripts.` That's
harmless: it means scripts shouldn't rely on `apt`'s output, and `2>/dev/null` (module 07) hides
it, since it goes to stderr.

In `dpkg -S`, a package "owns" a file because it installed it. That has nothing to do with the
file's owner that `ls -l` shows (module 04), which for these files is `root`.

## Where packages come from

The repositories `apt` uses are listed in files in `/etc/apt/sources.list.d/` (on Ubuntu 24.04,
`ubuntu.sources`). A directory ending in `.d` holds several files that together make up one
setting. Each repository **signs** its package lists: it holds a secret **key**, and its
signature proves the lists came from it, unchanged. `apt` refuses lists that don't match a key
it trusts. Adding a vendor's repository (Docker's, for example) means adding their **signing
key**. Packages install with `sudo`, so whoever holds that key can run anything on your machine
as root. Only add sources you
actually trust, from the vendor's own instructions.

## Keeping a server patched

A server is **patched** when its security fixes are installed. On Ubuntu servers the
`unattended-upgrades` service installs them automatically, and on anything reachable from the
internet it should be running. `systemctl status NAME` shows whether a service is running
(*Unit 1.5, systemd & services* covers it); `active (running)` is what you want to see:

```bash
systemctl status unattended-upgrades
```

## apt in a Dockerfile

Docker (module 05) builds a container from an **image**, the files a container starts with. A
**Dockerfile** is the recipe for an image, and each `RUN` line in it runs a command and saves the
files it changed as a **layer**. The image is every layer stacked, so anything saved in a layer
stays in the image's size. *Python & Containers* covers all of this; here's the part that's about
apt. Images install packages too, but the goals are different: small, repeatable, and no
questions, because nobody is there to answer them. This app's Dockerfile does:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*
```

- The `\` at the end of the first line carries the command on to the next.
- `apt-get` instead of `apt`: its output stays the same for scripts. `apt` warns that its own CLI
  (command-line interface) may change.
- No `sudo`: a `RUN` line runs as root while the image is built.
- `-y` answers yes to the `[Y/n]` question.
- `--no-install-recommends` skips **recommended** packages: extras that usually go along with the
  package but that it doesn't need to run.
- `rm -rf /var/lib/apt/lists/*` deletes the package lists `update` downloaded, which are needed
  only while installing. `-f` (module 03 taught `-r`) means don't ask, and don't complain if
  something is missing.
- Delete them **in the same `RUN`**. A later `RUN` is a new layer, and a delete there can't shrink
  the layer that saved them.

## Try it

On an Ubuntu machine where you can use `sudo`. The station console has no `apt`. No Ubuntu
machine? Use a cloud server, a virtual machine (Multipass on a Mac, WSL on Windows), or a
container: `docker run -it ubuntu:24.04`. In the container you're already root, so leave out
`sudo`, and `systemctl` won't work. Run these one at a time:

```bash
sudo apt update
apt show tree
apt-cache policy tree
sudo apt install tree
apt-cache policy tree
dpkg -L tree | grep bin
dpkg -S /usr/bin/tree
sudo apt remove tree
apt-cache policy tree
dpkg -L tree | grep /etc
ls /var/lib/apt/lists/ | head
ls /etc/apt/sources.list.d/
apt list --upgradable 2>/dev/null | head
```

- `update` prints a line per repository and ends by saying how many packages can be upgraded
  (or `All packages are up to date.`).
- `apt show` describes `tree`, "displays an indented directory tree".
- The first `apt-cache policy` says `Installed: (none)`, unless `tree` was already there.
- `install` may ask `Do you want to continue? [Y/n]`: press Enter. If `tree` needs nothing
  else, it just installs. The second `apt-cache policy` shows a version after `Installed:`.
- `dpkg -L` with `grep bin` shows `/usr/bin/tree`, and `dpkg -S` prints `tree: /usr/bin/tree`.
- `remove` asks `[Y/n]` too: press Enter. Afterwards `Installed:` is `(none)` again.
- `dpkg -L tree | grep /etc` prints nothing: `tree` keeps no settings in `/etc`, so `purge` would
  remove nothing more than `remove` did. For nginx, `/etc/nginx/` stays after `remove` and goes
  with `purge`.
- `ls /var/lib/apt/lists/` shows the lists `update` downloaded, the files a Dockerfile's
  `rm -rf` deletes. Leave yours alone.
- `ls` shows the files listing your repositories.
- `2>/dev/null` hides `apt list`'s warning, and `head` with no `-n` shows the first 10 lines:
  packages with a newer version waiting, which is what `sudo apt upgrade` would install.

On a real server or virtual machine, also try `systemctl status unattended-upgrades` and look for
`active (running)`.

That's the end of the unit. Life support is back online.
