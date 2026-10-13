---
# No console task: Unit 1.3 is built on labs (#121). Git runs on your own machine, and the
# station console doesn't simulate it.
title: Undoing things
minutes: 20
story: |
  **Mission log, day 27.** Petrov's "save the motors" commit turned solar tracking off, and every
  copy on the station has pulled it. Overnight someone ran `git reset --hard` on Okafor's battery
  fix, and it's gone from the log. One mistake to undo in public, one to rescue in private.
quiz:
  - type: choice
    q: "`b81e0f3` was pushed yesterday and the whole crew has pulled it. It's wrong. How do you undo it?"
    code: |-
      $ git log --oneline
      a41f9c2 (HEAD -> main, origin/main) Add the dinner rota
      b81e0f3 Turn the galley oven off at night
      0c9a7e2 Track galley.conf
    options:
      - "`git revert b81e0f3`: a new commit that does the opposite, which everyone can pull"
      - "`git reset --hard 0c9a7e2`, then push"
      - "`git commit --amend`"
      - "Delete the line from the file and pretend it never happened"
    answer: 0
    explain: >-
      Once others have a commit, don't rewrite it: `reset` would also throw away the dinner rota,
      and everyone's copy would disagree with yours (your push is rejected, as on day 26). `revert`
      adds a commit on top, so history stays true and anyone can pull the fix. `--amend` only
      changes the newest commit, and that isn't the wrong one.
  - type: choice
    q: "After `git reset --soft HEAD~1`, where is the change the last commit made?"
    options:
      - "Staged: the commit is gone, its change is in the index, ready to commit again"
      - "In the working tree only, not staged"
      - "Gone completely"
      - "Still in the commit: `--soft` doesn't move the branch"
    answer: 0
    explain: >-
      All three modes move the branch back. `--soft` leaves the change staged, `--mixed` (the
      default) leaves it in your files but unstaged, and `--hard` throws it away from both.
  - type: choice
    q: "You ran `git reset --hard HEAD~1` and lost a commit you wanted. Which command gets it back?"
    code: |-
      $ git reflog
      3c4d5e6 (HEAD -> main) HEAD@{0}: reset: moving to HEAD~1
      9f8e7d6 HEAD@{1}: commit: Add the night lighting schedule
      3c4d5e6 (HEAD -> main) HEAD@{2}: commit: Track lights.conf
    options:
      - "`git reset --hard 9f8e7d6`"
      - "`git reset --hard 3c4d5e6`"
      - "`git revert 9f8e7d6`"
      - "None: `reset --hard` deletes commits for good"
    answer: 0
    explain: >-
      The reflog lists every commit `HEAD` has been on, including ones no branch points at any
      more. `9f8e7d6` is the lost commit, and nothing has been committed since the reset, so
      moving the branch back to it restores everything. `3c4d5e6` is where you are now.
  - type: choice
    q: "You committed, then noticed you forgot to add `notes.txt`. You haven't pushed. What's tidiest?"
    options:
      - "`git add notes.txt`, then `git commit --amend --no-edit`"
      - "`git revert HEAD`, then commit everything again"
      - "`git reset --hard HEAD~1`, then start over"
      - "Make a second commit called \"Forgot notes.txt\""
    answer: 0
    explain: >-
      `--amend` replaces the last commit with one that includes whatever's staged now, and
      `--no-edit` keeps its message. It's fine while the commit is only yours. Once it's pushed,
      a new commit is the honest way.
  - type: choice
    q: "You had edited `galley.conf`, never added or committed it, then ran `git reset --hard`. Can the reflog bring the edit back?"
    options:
      - "No: the reflog only remembers commits, and the edit was never in one"
      - "Yes: `git reflog` lists every change to every file"
      - "Yes, with `git reset --soft`"
      - "Only if you run `git revert` first"
    answer: 0
    explain: >-
      `reset --hard` overwrites your working tree, and an edit you never added was never anywhere
      git could find it again. That's why the rule is to commit (or at least check `git status`)
      before anything with `--hard` in it.
cards:
  - id: revert-vs-reset
    front: "Undo a commit others already have"
    back: "`git revert HASH`: a new commit that does the opposite. `reset` rewrites history and is for commits that are only yours."
  - id: reset-modes
    front: "`git reset --soft` / `--mixed` / `--hard` HASH"
    back: "All move the branch to HASH. The changes in between stay staged / stay in your files unstaged / are thrown away."
  - id: reflog
    front: "Get back a commit `reset --hard` \"lost\""
    back: "`git reflog` lists every commit HEAD was on. Find it, then `git reset --hard HASH` (or `git switch -c rescue HASH`)."
  - id: amend
    front: Fix your last commit before pushing
    back: "Stage the fix, then `git commit --amend --no-edit` (or `-m \"new message\"`)."
lab:
  from: okafor
  task: |-
    Rescue Okafor's battery fix, then undo Petrov's commit without rewriting anyone's history.

    1. Run the setup below, once (your name and email set, as on day 21). It makes
       `~/meridian/power` as the station has it: Petrov's
       commit, Nakamura's after it, and Okafor's battery fix, which a `reset --hard` then
       removed. To start again, delete `~/meridian/power` first.
    2. Find Okafor's commit, **Raise the battery reserve to 35%**, in the reflog, and bring it
       back. Nothing has been committed since it was lost.
    3. Undo Petrov's commit, **Turn off solar tracking to save the motors**, with a new commit,
       keeping git's own message (`--no-edit`).
    4. Paste what `git log --oneline -4` and `cat power.conf` print, and the `git reflog` line
       you recovered the battery fix from.
  setup: |-
    mkdir -p ~/meridian/power && cd ~/meridian/power && git init -q -b main
    c() {
      export GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$(echo "$1" | tr 'A-Z' 'a-z')@meridian.example"
      export GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
      export GIT_AUTHOR_DATE="$2 09:00:00 +0000" GIT_COMMITTER_DATE="$2 09:00:00 +0000"
      git add -A && git commit -q -m "$3"
      unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_DATE
    }
    edit() { sed "$2" "$1" > "$1.new" && mv "$1.new" "$1"; }
    printf '# Power settings, habitat ring.\nsolar_tracking = on\npanel_count = 12\npanel_tilt_deg = 35\ninverter = A\nbus_voltage = 120\nbattery_reserve_pct = 30\nbattery_count = 4\nbattery_temp_max_c = 40\nlighting_budget_w = 400\nheater_budget_w = 800\n' > power.conf
    c Okafor 2026-10-02 "Track the power settings"
    edit power.conf 's/^solar_tracking = on$/solar_tracking = off/'
    c Petrov 2026-10-08 "Turn off solar tracking to save the motors"
    edit power.conf 's/^heater_budget_w = 800$/heater_budget_w = 900/'
    c Nakamura 2026-10-09 "Raise the heater budget to 900 W"
    edit power.conf 's/^battery_reserve_pct = 30$/battery_reserve_pct = 35/'
    c Okafor 2026-10-10 "Raise the battery reserve to 35%"
    git reset -q --hard HEAD~1
    unset -f c edit
  boxes:
    - prompt: The output of `git log --oneline -4`.
      checks:
        - {regex: '^[0-9a-f]{7,} (\(.*\) )?Revert "Turn off solar tracking to save the motors" *$', says: "A revert commit undoes Petrov's", hint: "Undo it with a new commit, keeping git's own message. If you did, did a later reset take it away again?"}
        - {regex: '^[0-9a-f]{7,} (\(.*\) )?Raise the battery reserve to 35% *$', says: "Okafor's battery fix is back", hint: "If it came back and then went again, look at the order you did things in. The reflog still has it."}
        - {regex: '^[0-9a-f]{7,} (\(.*\) )?Turn off solar tracking to save the motors *$', says: "Petrov's commit is still in the history: undone, not erased", hint: "Rewriting a commit everyone has pulled leaves their copies disagreeing with yours."}
        - {contains: "Raise the heater budget to 900 W", says: "Nakamura's commit is still there"}
      example: |
        fbe31c0 (HEAD -> main) Revert "Turn off solar tracking to save the motors"
        5b9d2d9 Raise the battery reserve to 35%
        eaa8d17 Raise the heater budget to 900 W
        7e744ed Turn off solar tracking to save the motors
    - prompt: The output of `cat power.conf`.
      checks:
        - {regex: '^solar_tracking = on *$', says: "Solar tracking is back on"}
        - {regex: '^battery_reserve_pct = 35 *$', says: "The battery reserve is 35%"}
        - {regex: '^heater_budget_w = 900 *$', says: "The heater budget is still 900 W"}
      example: |
        # Power settings, habitat ring.
        solar_tracking = on
        panel_count = 12
        panel_tilt_deg = 35
        inverter = A
        bus_voltage = 120
        battery_reserve_pct = 35
        battery_count = 4
        battery_temp_max_c = 40
        lighting_budget_w = 400
        heater_budget_w = 900
    - prompt: The `git reflog` line you recovered the battery fix from.
      checks:
        - {regex: '^[0-9a-f]{7,} (\(.*\) )?HEAD@\{\d+\}: commit: Raise the battery reserve to 35% *$', says: "The reflog's entry for the lost commit", hint: "One line from git reflog: the commit entry for the battery fix, not the reset."}
      example: |
        5b9d2d9 HEAD@{3}: commit: Raise the battery reserve to 35%
comms:
  open:
    - {from: meridian, text: "SOLAR TRACKING · OFF · ARRAY OUTPUT −22%"}
    - {from: okafor, text: "Petrov's \"save the motors\" commit turned solar tracking off, and every copy on the station has it. The panels are pointing at nothing."}
    - {from: okafor, text: "And someone ran `reset --hard` on my battery fix last night. Undo his in public, and find mine: git doesn't really delete a commit."}
  lab_done:
    - {from: meridian, text: "SOLAR TRACKING · ON · BATTERY RESERVE 35% · HISTORY INTACT"}
    - {from: okafor, text: "Reverted, not erased: anyone can see what went wrong and what fixed it. And my fix is back. I owe you a coffee."}
  complete:
    - {from: mission, text: "*Meridian*, Mission Control. Array output's back on our telemetry. We saw the revert come through, message and all."}
    - {from: okafor, text: "Tomorrow, the last of git: writing all this so whoever reads it at 3 a.m. understands it."}
---

## Fix the last commit

`git commit --amend` replaces your last commit with a new one: whatever's staged now, plus a new
message (`-m "…"`) or the old one (`--no-edit`). Use it for a typo in the message or a file you
forgot to add. **Only before you push:** the amended commit is a different commit with a
different hash, and anyone who already has the old one now has a commit you've thrown away.

## Undo a commit everyone has: revert

`git revert HASH` makes a **new commit that does the opposite** of HASH: lines it added are
removed, lines it removed come back. Commits after it are untouched, and the history keeps both,
so anyone can pull the fix like any other. Git opens your editor with a message ready,
`Revert "…"`, saying which commit it reverts; `--no-edit` keeps it.

This is the safe way to undo anything already pushed.

## Move your branch back: reset

`git reset HASH` moves your branch back to HASH, as if the commits after it were never made.
What happens to their changes depends on the mode:

| Command | The commits after HASH | Their changes |
|---|---|---|
| `git reset --soft HASH` | leave the branch | stay **staged** |
| `git reset HASH` (`--mixed`) | leave the branch | stay in your files, **unstaged** |
| `git reset --hard HASH` | leave the branch | **thrown away**, files and all |

`HEAD~1` means one commit before `HEAD`, so `git reset --soft HEAD~1` "uncommits" the last
commit and keeps its change staged. ⚠️ **`--hard` also throws away uncommitted edits**, and the
reflog can't bring those back: it only knows commits. And never reset commits others already have: their copies keep
them, and your push is rejected (day 26).

## Nothing is lost (for a while): the reflog

Commits that no branch points at aren't deleted straight away. `git reflog` lists **every commit
`HEAD` has been on**, newest first, with what moved it:

```text
3c4d5e6 (HEAD -> main) HEAD@{0}: reset: moving to HEAD~1
9f8e7d6 HEAD@{1}: commit: Add the night lighting schedule
```

To get a lost commit back, find its hash there. If nothing has been committed since, **`git reset
--hard HASH`** moves your branch back to it. Otherwise `git switch -c rescue HASH` puts it on a
new branch you can merge. The reflog is only on your machine, and when git tidies up it drops
commits nothing points at once they're about a month old, so rescue things soon.

**On the real station:** this app's `main` is protected on GitHub: changes arrive only by pull
request, with the checks passing, and are squash-merged (`RUNBOOK.md`). So taking a change back
out of `main` means another pull request, the revert way, in the open. A bad *deploy* is a
different undo: the Rollback workflow puts the previous image back, without touching the
history at all.

## Try it

```bash
cd "$(mktemp -d)" && git init -q -b main
git config user.name "Cadet Test" && git config user.email "cadet@meridian.example"
echo "lamps=12" > deck.conf && git add deck.conf && git commit -q -m "Track deck.conf"
echo "fans=4" >> deck.conf && git add deck.conf && git commit -q -m "Ad the fans"
git commit --amend -m "Add the fans"     # [main …] Add the fans: the typo's gone
git revert --no-edit HEAD                # [main …] Revert "Add the fans"
cat deck.conf                            # lamps=12 only
git log --oneline                        # Revert "Add the fans", Add the fans, Track deck.conf
git reset --hard HEAD~1                  # HEAD is now at … Add the fans
git reflog                               # the revert is still listed, at HEAD@{1}
git reset --hard HEAD@{1}                # HEAD is now at … Revert "Add the fans"
git reset --soft HEAD~1 && git status --short   # M  deck.conf: the revert's change, staged
```
