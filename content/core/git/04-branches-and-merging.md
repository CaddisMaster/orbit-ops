---
# No console task: Unit 1.3 is built on labs (#121). Git runs on your own machine, and the
# station console doesn't simulate it.
title: Branches and merging
minutes: 20
story: |
  **Mission log, day 24.** The new pump schedule could save 11% of life support's power, but
  it needs a week on the test bed before anyone trusts it. Life support can't stop taking its
  other fixes for a week while it waits.
quiz:
  - type: choice
    q: "You're on `main` and merge `dim-lights`. Git prints this. What happened?"
    code: |-
      $ git merge dim-lights
      Updating 3a1f2c4..9b8e7d6
      Fast-forward
       deck.conf | 1 +
       1 file changed, 1 insertion(+)
    options:
      - "`main` had no commits of its own since the branch started, so git just moved `main` up to `dim-lights`' commit. There's no merge commit"
      - "Git made a merge commit with two parents"
      - "Git copied `dim-lights`' commits onto `main` as new commits"
      - "Nothing yet: a fast-forward has to be confirmed with `git commit`"
    answer: 0
    explain: >-
      When the branch you're on hasn't moved, there's nothing to join: its commit is already in
      the other branch's history, so git moves the name forward. That's a **fast-forward**. If you
      want a record that the work was a branch, `git merge --no-ff` makes a merge commit anyway.
  - type: choice
    q: What is a branch, in git?
    options:
      - "A name that points at a commit, and moves forward when you commit on it"
      - "A copy of the project's files in another directory"
      - "A separate repository that shares a history"
      - "A list of commits, stored apart from the rest"
    answer: 0
    explain: >-
      A branch is just a name for a commit. `git switch -c` makes a new name pointing where you
      are, and each commit moves the current branch's name on to it. That's why branches are
      cheap enough to make for every change.
  - type: choice
    q: "You try to tidy up and git says this. What does it mean?"
    code: |-
      $ git branch -d pump-test
      error: the branch 'pump-test' is not fully merged.
      If you are sure you want to delete it, run 'git branch -D pump-test'
    options:
      - "`pump-test` has commits that aren't in the branch you're on, so deleting its name would lose track of them"
      - "`pump-test` is the branch you're on, so it can't be deleted"
      - "`pump-test` has uncommitted changes"
      - "Branches can only be deleted with `-D`"
    answer: 0
    explain: >-
      `-d` only deletes a branch whose commits are already merged, so nothing is lost. Merge it
      first, or, if the work really is unwanted, `-D` deletes it anyway.
  - type: fill
    q: "Which option makes `git switch` create the branch and switch to it in one go? (`git switch __ fix-pumps`)"
    answer: ["-c", "--create"]
    explain: >-
      `git switch -c NAME` creates NAME where you are and switches to it. You'll see `git checkout
      -b NAME` in older guides, which does the same.
  - type: choice
    q: "On `cabin-heat` you committed a change to `cabin.conf`. You `git switch main`. What's in `cabin.conf` now?"
    options:
      - "`main`'s version: switching puts your files as that branch's commit has them, and your commit is safe on `cabin-heat`"
      - "Your change, since it's the newest"
      - "Nothing: the file is deleted until you switch back"
      - "Both versions, with conflict markers"
    answer: 0
    explain: >-
      Switching updates the working tree to the commit the branch points at. The change isn't
      lost: it's in a commit, on `cabin-heat`, and switching back brings it back.
cards:
  - id: branch-is-a-name
    front: What is a git branch?
    back: "A name pointing at a commit. Committing moves the current branch's name forward."
  - id: switch-c
    front: Create a branch and start working on it
    back: "`git switch -c NAME` (older: `git checkout -b NAME`)."
  - id: fast-forward
    front: Fast-forward vs merge commit
    back: "If your branch hasn't moved, `git merge` just moves its name forward. If both have, it makes a merge commit with two parents. `--no-ff` always makes one."
  - id: branch-d
    front: "`git branch -d` vs `-D`"
    back: "`-d` deletes a branch only if its commits are merged. `-D` deletes it anyway."
lab:
  from: okafor
  task: |-
    Work on the pump schedule on a branch while `main` takes another fix, then join them.

    1. Run the setup below, once (your name and email set, as on day 21). It makes
       `~/meridian/pumps` on a branch called `main`, with one commit. To start again, delete
       `~/meridian/pumps` first.
    2. Make a branch called **`pump-schedule`** and switch to it.
    3. On it, change `pump_schedule` from `continuous` to **`cycled`** in `pumps.conf`, and
       commit it as **`Cycle the pumps on a schedule`**.
    4. Switch back to `main`. Meanwhile, the filters need changing more often: set
       `filter_change_days` to **`21`** in `filters.conf`, and commit it as **`Change the filters
       every 21 days`**.
    5. The week of testing is over. Merge `pump-schedule` into `main` with a merge commit, keeping
       git's own message (`--no-edit`).
    6. Delete the `pump-schedule` branch, now that its work is in `main`.
    7. Paste what `git log --oneline --graph --all` and `git branch` print.
  setup: |-
    mkdir -p ~/meridian/pumps && cd ~/meridian/pumps && git init -q -b main
    printf 'pump_schedule = continuous\npump_speed = 1200\n' > pumps.conf
    printf 'filter_change_days = 30\n' > filters.conf
    git add -A && git commit -q -m "Track the pump and filter settings"
  boxes:
    - prompt: The output of `git log --oneline --graph --all`.
      checks:
        - {regex: '^\*\s+[0-9a-f]{7,} (\(.*\) )?Merge branch .pump-schedule.', says: "A merge commit joins pump-schedule into main, newest", hint: "Was the merge made from main? And did it keep git's own message?"}
        - {regex: '^\| \* [0-9a-f]{7,} (\(.*\) )?Cycle the pumps on a schedule *$|^\* \| [0-9a-f]{7,} (\(.*\) )?Cycle the pumps on a schedule *$', says: "The pump schedule commit is on a line of its own", hint: "Was the pump change committed on pump-schedule, with the task's message?"}
        - {regex: '^\| \* [0-9a-f]{7,} (\(.*\) )?Change the filters every 21 days *$|^\* \| [0-9a-f]{7,} (\(.*\) )?Change the filters every 21 days *$', says: "The filter fix is on the other line", hint: "Was the filter change committed on main, after switching back?"}
        - {regex: '^\* [0-9a-f]{7,} (\(.*\) )?Track the pump and filter settings *$', says: "Both lines start from the setup's commit"}
      example: |
        *   c15b2f8 (HEAD -> main) Merge branch 'pump-schedule'
        |\
        | * c6781b5 Cycle the pumps on a schedule
        * | 2806943 Change the filters every 21 days
        |/
        * aa3f114 Track the pump and filter settings
    - prompt: The output of `git branch`.
      checks:
        - {regex: '^\* main *$', says: "You're on main"}
        - {not_contains: "pump-schedule", says: "The pump-schedule branch is deleted", hint: "Has the merged branch been deleted yet?"}
      example: |
        * main
comms:
  open:
    - {from: meridian, text: "PUMP SCHEDULE · CYCLED · PROJECTED SAVING 11% · TEST BED: 7 DAYS"}
    - {from: okafor, text: "The new pump schedule goes on the test bed for a week. It doesn't touch `main` until it's passed."}
    - {from: okafor, text: "And the filters can't wait a week. Work on both, and keep them apart until the schedule's earned its place."}
  lab_done:
    - {from: meridian, text: "MAIN · MERGE · PUMP-SCHEDULE + FILTERS 21 DAYS · BRANCH DELETED"}
    - {from: okafor, text: "Two lines of work, one merge, and the graph shows exactly when the schedule joined. That's how I want every test to land."}
  complete:
    - {from: meridian, text: "PUMPS · CYCLED SCHEDULE ACTIVE · LIFE SUPPORT POWER −11%"}
    - {from: okafor, text: "Tomorrow someone will change the same line on two branches. Git won't guess which one's right, and neither should you."}
    - {from: mission, text: "*Meridian*, Mission Control. We see the power drop from here. Nice work, all of you."}
---

## A branch is a name for a commit

A **branch** is a name that points at a commit. The branch you're on moves forward each time
you commit, so its name always points at your newest work. Making one copies nothing: it's a
new name, pointing where you are.

| Command | What it does |
|---|---|
| `git branch` | lists the branches; `*` marks the one you're on |
| `git switch -c NAME` | creates a branch called NAME, where you are, and switches to it |
| `git switch NAME` | switches to NAME: your files change to match its newest commit |
| `git branch -d NAME` | deletes the name NAME, if its commits are merged |

**Switching changes your files.** Git puts the working tree as the other branch's commit has
it, so a change committed on one branch isn't there on the other. Nothing is lost: it's in a
commit, and switching back brings it back. Git refuses to switch if an uncommitted change
would be overwritten, so commit first. Older guides use `git checkout NAME` and `git checkout -b
NAME` for the same jobs.

The first branch is called `main` or `master`, depending on your git and its settings. `git init
-b main` names it `main` from the start.

## Merging

`git merge NAME` brings NAME's work into the branch **you're on**. So to land a branch on `main`,
switch to `main` first, then merge the branch. Git does one of two things:

| Situation | What `git merge` does |
|---|---|
| your branch hasn't moved since NAME started | a **fast-forward**: it moves your branch's name up to NAME's commit. No new commit |
| both branches have new commits | a **merge commit**: a new commit with **two parents**, one from each line |

`git merge --no-ff NAME` makes a merge commit even when a fast-forward was possible. That keeps
a record that the work was done on a branch and joined at that point.

A merge commit needs a message, so git opens your editor with one written already, `Merge branch
'NAME'`. `--no-edit` keeps it without opening the editor. Which editor opens depends on your
machine: often vi, where you type `:wq` and Enter to save and leave, and sometimes nano (^O,
Enter, ^X).

## Reading the graph

`git log --oneline --graph --all` draws every branch, newest at the top, with each commit above
its parents:

```text
*   7d1e0a2 (HEAD -> main) Merge branch 'cabin-heat'
|\
| * 5c9b3f1 Warm the cabins
* | 41aa8e0 Fix the light timer
|/
* 0f3c2d7 Track cabin.conf
```

Each `*` is a commit, and the lines show its parents. Here `main` and `cabin-heat` split after
*Track cabin.conf*, each took a commit, and the merge at the top joins them. `--all` includes
every branch, not only the one you're on.

Delete a branch once it's merged: `git branch -d` checks, and refuses with `not fully merged` if
the branch still has commits that aren't merged. `git branch -D` deletes it anyway, for work
you're sure you don't want.

**On the real station:** nothing in this app is written on `main`. Each change starts as a
branch named after its issue (`<issue number>-slug`, so this module was written on
`128-branches-and-merging`), and reaches `main` only when its pull request is merged on GitHub.
`main` is always the code that passed its checks, and the work in progress never touches it.
Those merges are **squash** merges: a branch's commits become one commit on `main`, so this
repository's `main` has no merge commits at all. That's also why `git branch -d` says `not fully
merged` about a branch that was squashed: its own commits never reached `main`.

## Try it

```bash
cd "$(mktemp -d)" && git init -q -b main
git config user.name "Cadet Test" && git config user.email "cadet@meridian.example"
echo "lights=on" > deck.conf && git add deck.conf && git commit -q -m "Track deck.conf"
git switch -c dim-lights                  # Switched to a new branch 'dim-lights'
echo "brightness=40" >> deck.conf && git add deck.conf && git commit -q -m "Dim the deck lights"
git switch main && cat deck.conf          # lights=on only: main hasn't moved
git merge dim-lights                      # Fast-forward: main moves up to dim-lights
git switch -c heaters
echo "heaters=2" >> deck.conf && git add deck.conf && git commit -q -m "Add the heaters"
git switch main
git merge --no-ff --no-edit heaters       # Merge made by the 'ort' strategy.
git log --oneline --graph --all           # the merge commit, with both parents drawn
git branch -d dim-lights heaters          # Deleted branch dim-lights (was …), and heaters
git branch                                # * main
```
