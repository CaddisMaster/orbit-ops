---
# No console task: Unit 1.3 is built on labs (#121). Git runs on your own machine, and the
# station console doesn't simulate it.
title: Remotes
minutes: 20
story: |
  **Mission log, day 26.** Mission Control keeps the station's master copy of every setting. A fix
  that lives only on your laptop doesn't exist as far as they're concerned, and Nakamura is changing
  the same file from hers.
quiz:
  - type: choice
    q: "What does this mean, and what's the next step?"
    code: |-
      $ git status -sb
      ## main...origin/main [ahead 2]
    options:
      - "You have two commits that `origin` doesn't have yet. `git push` sends them"
      - "`origin` has two commits you don't have. `git pull` gets them"
      - "Two files are changed but not committed"
      - "Your branch is two commits ahead of another local branch called `main`"
    answer: 0
    explain: >-
      `main...origin/main` compares your `main` with git's record of the remote's. **Ahead** is
      what you have and they don't, so push it. **Behind** would be the other way, and needs a
      pull.
  - type: choice
    q: "Your push stops with this. What happened, and what do you do?"
    code: |-
      $ git push
       ! [rejected]        main -> main (fetch first)
      error: failed to push some refs to '/home/cadet/meridian/relay/mission-control.git'
      hint: Updates were rejected because the remote contains work that you do not
      hint: have locally.
    options:
      - "Someone pushed first. `git pull` to bring their work in, then push again"
      - "You don't have permission to push: ask for access"
      - "Your commit is broken: amend it and push again"
      - "Nothing: the push will retry by itself"
    answer: 0
    explain: >-
      Git won't let a push throw away commits on the remote that you've never seen. Pull first,
      which joins their work with yours, then the push goes through. Nothing is lost on either side.
      If you have new commits too, git 2.43 wants `git pull --no-rebase` to join them with a merge.
  - type: choice
    q: "Which of these changes the files in your working tree?"
    options:
      - "`git pull`: it fetches, then merges what it fetched into your branch"
      - "`git fetch`"
      - "`git remote -v`"
      - "`git status -sb`"
    answer: 0
    explain: >-
      `git fetch` only downloads the remote's commits and moves `origin/main`, your record of
      where the remote is. Your branch and files stay as they were until you merge, and `git pull`
      is fetch and merge in one.
  - type: choice
    q: "`git status -sb` says `## main...origin/main`, nothing ahead or behind. Nakamura pushed an hour ago. Why doesn't it show?"
    options:
      - "`status` compares with `origin/main` as of your last fetch. `git fetch` first, and it will say `[behind 1]`"
      - "Her push failed"
      - "`-sb` only shows your own commits"
      - "Pushes take an hour to show up"
    answer: 0
    explain: >-
      Status never asks the remote anything: it compares with git's record, which only moves when
      you fetch, pull or push. Fetch before you trust ahead and behind.
  - type: fill
    q: "What name does `git clone` give the remote it cloned from?"
    answer: ["origin"]
    explain: >-
      Clone calls it `origin` and sets your `main` to track `origin/main`, which is why plain
      `git push` and `git pull` know where to go.
cards:
  - id: remote-origin
    front: What's `origin`?
    back: "The name `git clone` gives the remote it came from. `git remote -v` shows where it points."
  - id: fetch-vs-pull
    front: "`git fetch` vs `git pull`"
    back: "Fetch downloads and moves `origin/main`, changing none of your files. Pull is fetch, then merge into your branch."
  - id: status-sb
    front: "`## main...origin/main [ahead 1, behind 2]`"
    back: "One commit of yours not pushed, two of theirs not pulled, as of the last fetch."
  - id: rejected-push
    front: "`! [rejected] main -> main (fetch first)`"
    back: "Someone pushed first. Pull their work in (with new commits of your own: `git pull --no-rebase`), then push again."
lab:
  from: okafor
  task: |-
    Get your fix into Mission Control's copy, and bring Nakamura's into yours.

    1. Run the setup below, once. It makes `~/meridian/relay` with Mission Control's copy,
       `mission-control.git`, and Nakamura's clone of it. To start again, delete
       `~/meridian/relay` first.
    2. Clone `~/meridian/relay/mission-control.git` into `~/meridian/relay/station`, go into it,
       and check where `origin` points.
    3. In `relay.conf`, set `retry_s` from `60` to **`30`** (any editor: `nano relay.conf` works), and commit it as **`Retry the uplink
       every 30 seconds`**. `git status -sb` now says you're ahead. Push it.
    4. Now Nakamura pushes her change: run her script with `sh ~/meridian/relay/nakamura.sh`.
    5. Back in `station`, fetch, and see what `git status -sb` says. Then pull her commit.
    6. Paste what `git status -sb` and `git log --oneline -3` print.
  setup: |-
    mkdir -p ~/meridian/relay && cd ~/meridian/relay && git init -q -b main seed
    printf 'relay = ground-station-2\nuplink_mhz = 2210\nretry_s = 60\n' > seed/relay.conf
    git -C seed add relay.conf && git -C seed -c user.name=Okafor -c user.email=okafor@meridian.example commit -q -m "Track the relay settings"
    git clone -q --bare seed mission-control.git && rm -rf ~/meridian/relay/seed
    git clone -q mission-control.git nakamura
    git -C nakamura config user.name Nakamura && git -C nakamura config user.email nakamura@meridian.example
    cat > nakamura.sh <<'EOF'
    cd ~/meridian/relay/nakamura && git pull -q && echo 'beacon_interval_s = 30' >> relay.conf && git add relay.conf && git commit -q -m "Add the beacon interval" && git push -q && echo "Nakamura pushed: Add the beacon interval"
    EOF
  boxes:
    - prompt: The output of `git status -sb`, in `~/meridian/relay/station`.
      checks:
        - {regex: '^## main\.\.\.origin/main', says: "Your main tracks Mission Control's", hint: "Run it in ~/meridian/relay/station, the clone you made."}
        - {not_contains: "ahead", says: "Nothing of yours is left unpushed", hint: "Is there a commit you made but didn't push?"}
        - {not_contains: "behind", says: "Nothing of theirs is left unpulled", hint: "Fetching shows what's new; it doesn't bring it into your branch."}
        - {lines: {max: 1}, says: "No uncommitted changes"}
      example: |
        ## main...origin/main
    - prompt: The output of `git log --oneline -3`.
      checks:
        - {lines: {min: 3, max: 3}, says: "Three commits", hint: "Fewer? Someone's commit hasn't reached you. More? Paste only what git printed, not the command."}
        - {regex: '^[0-9a-f]{7,} (\(.*\) )?Add the beacon interval *$', says: "Nakamura's commit, pulled into yours", hint: "Did her script say it pushed? And did you pull after fetching?"}
        - {regex: '^[0-9a-f]{7,} (\(.*\) )?Retry the uplink every 30 seconds *$', says: "Your commit, with the message the task gives", hint: "Check the message letter for letter: it has to match the task's."}
        - {regex: 'Add the beacon interval *\n[0-9a-f]{7,} (\(.*\) )?Retry the uplink every 30 seconds', says: "Hers on top of yours: you pushed first, she pulled it, then you pulled hers", hint: "If your push came after hers, the history won't line up like this. Start again from the setup."}
      example: |
        388e174 (HEAD -> main, origin/main, origin/HEAD) Add the beacon interval
        5d0e4cc Retry the uplink every 30 seconds
        9c89c21 Track the relay settings
comms:
  open:
    - {from: meridian, text: "RELAY.CONF · MASTER COPY: MISSION CONTROL · STATION COPIES: NONE CURRENT"}
    - {from: okafor, text: "Mission Control keeps the station's master copy. A fix on your laptop doesn't exist until it's pushed there."}
    - {from: okafor, text: "Clone it, fix the uplink retry, and push. Nakamura's on the same file, so bring her change in too."}
  lab_done:
    - {from: meridian, text: "MISSION CONTROL · MAIN · 3 COMMITS · STATION COPY: IN SYNC"}
    - {from: okafor, text: "Your fix is in their copy and Nakamura's is in yours. Nobody ahead, nobody behind."}
  complete:
    - {from: mission, text: "*Meridian*, Mission Control. We have the 30-second retry and the beacon interval, both in our copy. First time in a while we've known exactly what you're running."}
    - {from: okafor, text: "Tomorrow: what to do when something you pushed was wrong. Because it will be."}
---

## A remote is another copy

A **remote** is another copy of the repository that you send commits to and get them from.
GitHub is one, but a remote can be anything git can reach: a server over SSH, or just a path on
the same disk. The copy everyone shares is usually **bare**: a repository with no working tree,
only the history (`git init --bare NAME.git`), since nobody edits files there.

| Command | What it does |
|---|---|
| `git clone URL [DIR]` | copies the repository at URL (a web address or a path) into DIR |
| `git remote -v` | lists the remotes and where they point |
| `git push` | sends your branch's new commits to the remote |
| `git fetch` | downloads the remote's new commits, **without touching your files** |
| `git pull` | `git fetch`, then merges what it fetched into your branch |

A clone names its remote **`origin`**, and sets your `main` to **track** `origin/main`, so plain
`git push` and `git pull` know where to go. A branch you create yourself has nothing to track
yet: the first time, `git push -u origin NAME` pushes it and sets that up.

A script someone hands you as a file runs with `sh FILE`, even when it isn't executable, as long
as it's a plain shell script.

## Ahead and behind

`origin/main` is git's record of where the remote's `main` was **when you last fetched** (or
pushed: a push moves it too).
`git status -sb` (short, with the branch) compares your `main` with it:

| `git status -sb` says | Means | So |
|---|---|---|
| `## main...origin/main` | the same commits | nothing to do |
| `[ahead 1]` | one commit you haven't pushed | `git push` |
| `[behind 1]` | one commit of theirs you haven't merged | `git pull` |
| `[ahead 1, behind 1]` | both: you've diverged | `git pull --no-rebase`, then `git push` |

**Status never asks the remote.** Until you fetch, it can't know someone else pushed, so
**`git fetch` before you trust it**. `fetch` is always safe: it moves `origin/main` and nothing
else.

## When someone pushed first

If the remote has commits you don't, git refuses your push rather than throw them away:

```text
 ! [rejected]        main -> main (fetch first)
hint: Updates were rejected because the remote contains work that you do not
hint: have locally.
```

If you'd already fetched, it says `(non-fast-forward)` and that your branch is behind instead.
Either way the cure is the same.

Pull, which brings their work into yours, then push again. When **both** sides have new commits,
git 2.43 stops the pull and asks how to join them (`fatal: Need to specify how to reconcile
divergent branches`). `git pull --no-rebase` joins them with a merge commit, as on day 24, and
may stop at a conflict, as on day 25. The other way, rebase, is day 28.

**On the real station:** this app's `origin` is its repository on GitHub, and nothing reaches
learn.seandesmet.com from a laptop. A change is pushed, reviewed and merged there, and even then
it isn't live until a GitHub Release is published: GitHub Actions builds the image from what was
merged and, once approved, deploys it. A fix that's only committed locally is in none of that,
however finished it is.

## Try it

```bash
cd "$(mktemp -d)" && git init -q --bare -b main hub.git
git clone -q hub.git alice && git clone -q hub.git bob       # warning: You appear to have cloned an empty repository.
cd alice && git config user.name "Alice" && git config user.email "alice@meridian.example"
echo "lamps=12" > deck.conf && git add deck.conf && git commit -q -m "Track deck.conf"
git push -u origin main          # * [new branch] main -> main, and tracking set up
git status -sb                   # ## main...origin/main
cd ../bob && git pull -q && cat deck.conf                    # lamps=12
git config user.name "Bob" && git config user.email "bob@meridian.example"
echo "fans=4" >> deck.conf && git add deck.conf && git commit -q -m "Add the fans" && git push -q
cd ../alice && git status -sb    # ## main...origin/main: no fetch yet, so it doesn't know
git fetch -q && git status -sb   # ## main...origin/main [behind 1]
git pull -q && git log --oneline # Add the fans, Track deck.conf
```
