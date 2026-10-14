---
# No console task: Unit 1.3 is built on labs (#121). Git runs on your own machine, and the
# station console doesn't simulate it.
title: Your first repository
minutes: 20
story: |
  **Mission log, day 21.** The air-mix settings changed twice last week. Nobody knows who changed
  them, or what they said before. Chief Okafor pins a note to the life-support hatch: "From today,
  if it isn't committed, it didn't happen."
quiz:
  - type: choice
    q: "You edited `pumps.conf`, and `git status` says this. You run `git commit -m \"Lower the pump speed\"` next. What happens?"
    code: |-
      $ git status
      On branch master
      Changes not staged for commit:
        (use "git add <file>..." to update what will be committed)
        (use "git restore <file>..." to discard changes in working directory)
      	modified:   pumps.conf

      no changes added to commit (use "git add" and/or "git commit -a")
    options:
      - "Nothing is committed: the change was never added, so there's nothing staged to commit"
      - "Git commits the new `pumps.conf`, since it can see the file changed"
      - "Git commits an empty snapshot with that message"
      - "The commit fails because `pumps.conf` was never tracked"
    answer: 0
    explain: >-
      A commit records what's **staged**, and `git add` is what stages a change. Git can see that
      `pumps.conf` changed, and says so, but it only commits what it was told to. The file *is*
      tracked: an untracked one would be listed under "Untracked files". `git add pumps.conf`,
      then commit.
  - type: choice
    q: "On a new laptop, your first commit stops with this. What fixes it?"
    code: |-
      Author identity unknown

      *** Please tell me who you are.
    options:
      - "`git config --global user.name \"…\"` and `git config --global user.email \"…\"`, then commit again"
      - "Run the commit again with `sudo`"
      - "`git init` again: the repository wasn't created properly"
      - "Log in to GitHub first"
    answer: 0
    explain: >-
      Every commit records an author, and git takes it from your configuration. It's set **per
      machine**, in `~/.gitconfig`, so a new laptop starts without one. It has nothing to do with
      GitHub. `sudo` runs git as root, which has its own empty configuration: the same error, plus
      files in `.git` that root now owns.
  - type: multi
    q: Which of these does a commit record?
    options:
      - "A snapshot of every tracked file, as it was staged"
      - "Who made it, and when"
      - "The commit it came after: its parent"
      - "Every file in the directory, tracked or not"
    answer: [0, 1, 2]
    explain: >-
      A commit is a whole snapshot of the tracked files, not just the lines that changed, plus an
      author, a time, a message and a parent. Untracked files aren't in it: git keeps only what
      you `git add`.
  - type: choice
    q: "You and Okafor each make a commit called `Track airmix.conf`, of the same file. Why do your hashes differ?"
    options:
      - "The hash is worked out from everything in the commit: the author and time differ, so the hash does too"
      - "Git picks a random hash for every commit"
      - "Hashes depend on the machine's hostname"
      - "They don't: the same message and the same file give the same hash"
    answer: 0
    explain: >-
      A commit's hash is a fingerprint of all of it: the snapshot, the author, the times, the
      message and the parent. Change any of those and the hash changes. That's what makes it a
      safe name for exactly one commit, and also why nobody else's hashes will match yours.
  - type: fill
    q: "Which command turns the current directory into a git repository? (`git ____`)"
    answer: ["init"]
    explain: >-
      `git init` creates the hidden `.git` directory, where git keeps every commit. Delete `.git`
      and the history is gone, but the files you're working on stay.
cards:
  - id: what-a-commit-is
    section: "What a commit is"
    front: What's in a commit?
    back: "A snapshot of every tracked file, plus an author, a time, a message and its parent. The hash names all of it."
  - id: git-identity
    section: "Tell git who you are"
    front: Tell git who you are, on this machine
    back: "`git config --global user.name \"Your Name\"` and `git config --global user.email \"you@example.com\"`. Kept in `~/.gitconfig`."
  - id: add-then-commit
    section: "A repository, and the three commands you'll use most"
    front: The two steps that record a change
    back: "`git add FILE` stages it, then `git commit -m \"message\"` records what's staged."
  - id: untracked
    section: "A repository, and the three commands you'll use most"
    front: "\"Untracked files\" in `git status`"
    back: "Git can see the file but has never been told to keep it. `git add` it."
lab:
  from: okafor
  task: |-
    Put the air-mix settings under version control, in **two commits**, on your own machine.

    1. Run the setup below. It creates `~/meridian/life-support/airmix.conf`, the settings as
       they are today.
    2. If `git config user.name` or `git config user.email` prints nothing, set it first.
    3. Make `~/meridian/life-support` a repository, and commit `airmix.conf` exactly as it is,
       with the message **`Track airmix.conf`**.
    4. Okafor's change: in `airmix.conf`, set `o2_floor` from `19.0` to **`19.5`**, with any
       editor. Commit it with the message **`Set the O2 floor to 19.5%`**.
    5. In `~/meridian/life-support`, run `git log --oneline` and `git status`, and paste what
       each printed below.
  setup: |-
    mkdir -p ~/meridian/life-support && cd ~/meridian/life-support
    cat > airmix.conf <<'EOF'
    # Habitat ring air mix. Percentages by volume.
    o2_floor = 19.0
    o2_target = 20.9
    co2_ceiling_ppm = 5000
    EOF
  boxes:
    - prompt: The output of `git log --oneline`.
      checks:
        - {lines: {min: 2, max: 2}, says: "Two commits, and only two", hint: "Paste only what git printed, not the command. One line? The second commit may not have happened: was the edited file added before it?"}
        - {regex: '^[0-9a-f]{7,} (\(.*\) )?Track airmix\.conf *$', says: "The first commit, with the message the task gives", hint: "Check the message letter for letter: it has to match the task's."}
        - {regex: '^[0-9a-f]{7,} (\(.*\) )?Set the O2 floor to 19\.5% *$', says: "The O2 change, with the message the task gives", hint: "Check the message letter for letter: it has to match the task's."}
      example: |
        1d1ba4d (HEAD -> master) Set the O2 floor to 19.5%
        f474e13 Track airmix.conf
    - prompt: The output of `git status`.
      checks:
        - {regex: '^On branch ', says: "It's from git status, inside the repository", hint: "Did you run it in ~/meridian/life-support? Outside a repository git says so instead."}
        - {contains: "nothing to commit, working tree clean", says: "Every change is committed", hint: "Is there a change you saved but didn't add and commit? git status names it. A backup like airmix.conf.bak counts as untracked too."}
      example: |
        On branch master
        nothing to commit, working tree clean
comms:
  open:
    - {from: meridian, text: "AIRMIX.CONF · CHANGED 2× LAST WEEK · BY: UNKNOWN · FROM: UNKNOWN"}
    - {from: okafor, text: "Somebody changed the air mix twice last week. Nobody signed for it, and nobody kept the old values."}
    - {from: okafor, text: "From today, if it isn't committed, it didn't happen. Start with `airmix.conf`."}
  lab_done:
    - {from: meridian, text: "LIFE-SUPPORT REPO · 2 COMMITS · WORKING TREE CLEAN"}
    - {from: okafor, text: "Two commits, two messages, and your name on both. Next time the mix changes, we'll know who did it and what it was before."}
  complete:
    - {from: meridian, text: "AIRMIX.CONF · O2 FLOOR 19.5% · AUTHOR: CADET"}
    - {from: mission, text: "*Meridian*, Mission Control. We've had six different air mixes reported from you this month. Glad to hear there'll be one answer from now on."}
    - {from: okafor, text: "Every change has an author now. Tomorrow: what changed, line by line, before it goes in."}
---

## Getting git

**Git** keeps the history of a directory: every version of every file you tell it about, who
changed it, when, and why. It runs on your own machine, so this unit's labs are done in your own
terminal, not the station console. First check you have it:

| Your machine | How to get git |
|---|---|
| Ubuntu or Debian | `sudo apt update`, then `sudo apt install git` (packages, day 10) |
| macOS | run `git --version`; if git is missing, macOS offers to install the Command Line Tools, which include it |
| Windows | install Git for Windows, and use its Git Bash terminal |

`git --version` prints the version once it's installed, for example `git version 2.43.0`.

## Tell git who you are

Every commit records an **author**: a name and an email. Git takes them from its configuration,
which is **per machine**: a new laptop, a server or a container starts with none, and the first
commit stops with `Author identity unknown`. (Some machines, Macs among them, guess a name from
your username and the computer's name instead, and commit with a warning telling you to set
one.) Set them once, on each machine:

| Command | What it does |
|---|---|
| `git config --global user.name "Your Name"` | sets the name your commits carry |
| `git config --global user.email "you@example.com"` | sets the email |
| `git config user.name` | prints the name that's set, and prints nothing if it isn't set |

`--global` writes them to `~/.gitconfig`, for every repository of yours on that machine. Inside
a repository, leaving out `--global` sets a name for that repository alone.

## A repository, and the three commands you'll use most

`git init` turns the current directory into a **repository**. It creates a hidden `.git`
directory, where git keeps the history, and nothing else changes. (It may also print a few
`hint:` lines about the default branch's name: ignore them until day 24.) Then, over and over:

| Command | What it does |
|---|---|
| `git status` | says what's changed since the last commit, and what's staged for the next |
| `git add FILE` | **stages** the file as it is now: it goes into the next commit |
| `git commit -m "message"` | records everything staged, as one commit, with that message |
| `git log` | lists the commits, newest first; `git log --oneline` shows one line each |

Change files with any editor: git only sees the result. In a terminal, `nano FILE` opens one,
and ^O then Enter saves, ^X leaves.

Recording a change is always two steps: **`git add` first, then `git commit`**. The pause
between them is on purpose: you choose what goes in the commit. `git status` tells you where
each file stands:

| `git status` says | Meaning |
|---|---|
| Untracked files | git sees the file but has never been told to keep it |
| Changes to be committed | staged: the next commit will include it |
| Changes not staged for commit | changed since the last commit, but not added yet |
| nothing to commit, working tree clean | every change is committed |

`git log --oneline` prints a short hash and the message, a line per commit. In a terminal, git
adds the branch's name to the newest one, `(HEAD -> master)` or `(HEAD -> main)` depending on
your git. Branches are day 24. A long log opens in a pager, as `less` does (day 11): `q` quits.

## What a commit is

A commit is a **snapshot**: every tracked file as it was staged, not just the lines that
changed. With it go:

- the **author** and the **time**;
- the **message**, saying what changed;
- its **parent**, the commit it came after. The first commit has none, which is why `git
  commit` says `(root-commit)` the first time.

The **hash**, like `9cf8131`, is worked out from all of that. Change one letter of a file, the
author or the time, and you get a different hash. So a hash names exactly one commit, and
nobody else's will match yours, even for the same file and message.

**On the real station:** this app's history is a git repository too, with more than seventy
commits. `git log --format='%h %an %s' | tail -n 1` shows the first, `2c176cf`, *Bootstrap Orbit
Ops*, by **Sean Desmet**: it was committed on the development machine, whose `~/.gitconfig`
spells it that way. All the rest are by **Sean DeSmet**, because they were squash-merged on
GitHub, which takes the author from the GitHub account. Same person, two machines, two configurations, and every commit
says which.

## Try it

```bash
git --version                        # git version 2.43.0, or similar
git config user.name                 # your name, or nothing if it isn't set
cd "$(mktemp -d)" && git init        # Initialized empty Git repository in …/.git/
git config user.name "Cadet Test"    # this repository only: yours stays as it is
git config user.email "cadet@meridian.example"
echo "pump_speed = 1200" > pumps.conf
git status                           # Untracked files: pumps.conf
git add pumps.conf
git status                           # Changes to be committed: new file: pumps.conf
git commit -m "Track pumps.conf"     # (root-commit) … 1 file changed, 1 insertion(+)
echo "pump_speed = 1100" > pumps.conf
git commit -m "Lower the pump speed" # no changes added to commit: it wasn't added
git add pumps.conf && git commit -m "Lower the pump speed"
git log --oneline                    # two lines, newest first
git status                           # nothing to commit, working tree clean
```
