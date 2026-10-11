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
      `update` downloads the latest package indexes from your repositories. `upgrade` is what
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
      - "To keep the downloaded package indexes out of the image layer, making it smaller"
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
      `dpkg` is the low-level tool underneath apt. `dpkg -L pkg` lists a package's files, and
      `dpkg -S /path` tells you which package owns a file.
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
    front: "`apt update` vs `apt upgrade`"
    back: "`update` refreshes the package lists; `upgrade` installs newer versions of what's installed."
  - id: package-owner
    front: Which package owns /usr/bin/curl?
    back: "`dpkg -S /usr/bin/curl`"
  - id: package-versions
    front: See the installed and candidate versions of a package
    back: "`apt-cache policy nginx` (or `apt policy nginx`)."
---

## The package manager

Ubuntu and Debian install software as **packages** (`.deb` files) from **repositories**. `apt`
resolves dependencies, downloads and installs. Underneath it, `dpkg` handles individual
packages.

```bash
sudo apt update                 # 1. refresh what's available
apt search htop                 # find a package
apt show htop                   # read about it before installing
sudo apt install htop           # 2. install (with dependencies)
sudo apt upgrade                # upgrade everything installed
sudo apt remove htop            # uninstall, keep system config files
sudo apt purge htop             # uninstall and delete its config
sudo apt autoremove             # remove dependencies nothing needs any more
```

## Asking questions

```bash
apt list --installed | grep nginx    # is it installed?
apt-cache policy nginx               # installed vs available version, and from where
dpkg -L nginx | head                 # what files did it install?
dpkg -S /usr/sbin/nginx              # which package owns this file?
```

## Where packages come from

Repositories are listed in `/etc/apt/sources.list` and `/etc/apt/sources.list.d/`. Adding a
vendor's repository (Docker's, for example) means trusting their signing key, so only add
sources you actually trust, from the vendor's own instructions.

## Keeping a server patched

On a server, `unattended-upgrades` installs security updates automatically. Check it's enabled
on anything internet-facing:

```bash
systemctl status unattended-upgrades
```

## apt in a Dockerfile

Images install packages too, but the goals are different: small, reproducible, no prompts.
This app's Dockerfile does:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*
```

- `apt-get` instead of `apt`: its output is stable for scripts. (`apt` warns that its own CLI
  may change.)
- `-y` answers yes, because there's nobody to type it.
- `--no-install-recommends` skips optional extras.
- Clean the package lists **in the same `RUN`**. Each `RUN` is a layer, and a later delete
  can't shrink an earlier layer.

## Try it

```bash
apt-cache policy curl
dpkg -S "$(command -v curl)"
dpkg -L curl | grep bin
apt list --upgradable 2>/dev/null | head
```

That's the end of the unit. Life support is back online.
