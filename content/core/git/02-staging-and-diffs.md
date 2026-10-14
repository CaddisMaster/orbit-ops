---
# No console task: Unit 1.3 is built on labs (#121). Git runs on your own machine, and the
# station console doesn't simulate it.
title: Staging and diffs
minutes: 20
story: |
  **Mission log, day 22.** Two fixes went into `scrubber.conf` today. The pressure alarm has been
  through the test bed; the new regeneration temperature hasn't. Only one of them can ship
  tonight, and they're in the same file.
quiz:
  - type: choice
    q: "`git status --short` says this, and you run `git commit -m \"Tune the air\"`. What goes into the commit?"
    code: |-
      $ git status --short
      M  airmix.conf
       M pumps.conf
      MM scrubber.conf
      ?? notes.txt
    options:
      - "`airmix.conf`'s change and the staged part of `scrubber.conf`: only what's in the index"
      - "All four files, since each has changed"
      - "`airmix.conf`, `pumps.conf` and `scrubber.conf`, but not the untracked `notes.txt`"
      - "Only `airmix.conf`: a file with changes in both columns can't be committed"
    answer: 0
    explain: >-
      A commit takes the **index**, the left column. `M ` is staged, ` M` is changed but not
      staged, and `MM` is both: part of `scrubber.conf` is staged and a later edit isn't, so only
      the staged part goes in. `??` is untracked and never goes in without `git add`.
  - type: choice
    q: "`git status` lists a file under \"Changes to be committed\", but `git diff` prints nothing. Why?"
    options:
      - "`git diff` compares the working tree with the index, and everything is staged. `git diff --staged` shows it"
      - "The change was lost when it was staged"
      - "`git diff` only works after the first commit"
      - "`git diff` needs the file's name"
    answer: 0
    explain: >-
      Plain `git diff` shows what you **haven't** staged yet. Once every change is staged, there's
      nothing left between the working tree and the index. `git diff --staged` compares the
      index with the last commit: what the next commit will contain.
  - type: choice
    q: "Which command throws away an edit for good?"
    options:
      - "`git restore FILE`"
      - "`git restore --staged FILE`"
      - "`git diff FILE`"
      - "`git add -p FILE`, answering `n` to every hunk"
    answer: 0
    explain: >-
      `git restore FILE` puts the file back as the index has it, and the edit was never in any
      commit, so there's nothing to get it back from. `--staged` only takes the change out of the
      index; the edit stays in the file. Answering `n` in `git add -p` just leaves a hunk unstaged.
  - type: fill
    q: "Which option makes `git diff` show what the next commit will contain? (`git diff --______`)"
    answer: ["staged", "cached"]
    explain: >-
      `--staged` compares the index with `HEAD`, the last commit. `--cached` is an older name for
      the same thing, and you'll still see it in scripts and answers online.
  - type: choice
    q: "`git add -p` shows a hunk you're not ready to commit and asks `(1/2) Stage this hunk [y,n,q,a,d,j,J,g,/,e,?]?`. What do you answer?"
    options:
      - "`n`: leave it out of the index, and move on to the next hunk"
      - "`d`: delete the change from the file"
      - "`q`: stage it and quit"
      - "`s`: skip it for good"
    answer: 0
    explain: >-
      `y` stages the hunk and `n` leaves it unstaged; the edit stays in your file either way. `q`
      quits without staging this hunk or any after it, `d` leaves this hunk and every later one
      in the file unstaged, and `s` **splits** a hunk into smaller ones when it can.
cards:
  - id: three-places
    section: "Three places a change can be"
    front: The three places a change can be, in git
    back: "The **working tree** (your files), the **index** (staged: the next commit) and **HEAD** (the last commit)."
  - id: diff-vs-staged
    section: "Seeing the difference"
    front: "`git diff` vs `git diff --staged`"
    back: "`git diff`: working tree against the index (not staged yet). `--staged`: the index against HEAD (what the next commit holds)."
  - id: status-short
    section: "The short status"
    front: "`git status --short`: what do `M `, ` M` and `MM` mean?"
    back: "Left column is the index, right is the working tree. `M ` staged, ` M` changed but not staged, `MM` some of each."
  - id: restore
    section: "Taking it back"
    front: "`git restore --staged FILE` vs `git restore FILE`"
    back: "`--staged` unstages and keeps the edit. Without it, the edit is thrown away, with no undo."
lab:
  from: okafor
  task: |-
    Commit the tested fix to `scrubber.conf`, and only that one.

    1. Run the setup below. It makes a repository in `~/meridian/scrubbers` with
       `scrubber.conf` committed, then makes today's two changes to it. It commits, so your name
       and email must be set first (day 21).
    2. `git diff` shows both changes: **`pressure_drop_alarm_kpa`**, which is tested, and
       **`regen_temp_c`**, which isn't.
    3. Stage the pressure alarm change, and only that one.
    4. Check what's staged before you commit.
    5. Commit it with the message **`Lower the pressure-drop alarm to 2.5 kPa`**.
    6. Paste what `git status --short`, `git show HEAD` and `git diff` print. If one opens in
       a pager, make the terminal taller so it fits on one screen, or press `q` and run it again.
  setup: |-
    mkdir -p ~/meridian/scrubbers && cd ~/meridian/scrubbers && git init -q
    cat > scrubber.conf <<'EOF'
    # CO2 scrubbers, habitat ring.
    beds = 2
    bed_swap_minutes = 45
    pressure_drop_alarm_kpa = 4.0
    fan_rpm = 2400
    fan_fault_rpm = 900

    # Bed regeneration: heat the spent bed to drive the CO2 off.
    regen_vent = overboard
    regen_minutes = 30
    regen_cooldown_minutes = 15
    regen_max_cycles_per_day = 32
    regen_temp_c = 200
    EOF
    git add scrubber.conf && git commit -q -m "Track scrubber.conf"
    cat > scrubber.conf <<'EOF'
    # CO2 scrubbers, habitat ring.
    beds = 2
    bed_swap_minutes = 45
    pressure_drop_alarm_kpa = 2.5
    fan_rpm = 2400
    fan_fault_rpm = 900

    # Bed regeneration: heat the spent bed to drive the CO2 off.
    regen_vent = overboard
    regen_minutes = 30
    regen_cooldown_minutes = 15
    regen_max_cycles_per_day = 32
    regen_temp_c = 240
    EOF
  boxes:
    - prompt: The output of `git status --short`.
      checks:
        - {regex: '^ ?M scrubber\.conf *$', says: "scrubber.conf still has a change, and it isn't staged", hint: "Look at the left column: is something still in the index? Was the commit made?"}
        - {lines: {max: 1}, says: "Nothing else has changed", hint: "Paste only what git printed, not the command."}
      example: |2  # the 2 keeps the leading space: " M" is unstaged
         M scrubber.conf
    - prompt: The output of `git show HEAD`.
      checks:
        - {contains: "Lower the pressure-drop alarm to 2.5 kPa", says: "The newest commit, with the message the task gives", hint: "Check the message letter for letter: it has to match the task's."}
        - {contains: "+pressure_drop_alarm_kpa = 2.5", says: "It lowers the pressure alarm"}
        - {not_contains: "regen_temp_c = 240", says: "The untested regeneration change isn't in it", hint: "Something went in that shouldn't have. Look at what each hunk changed before you answer y."}
      example: |
        commit 198ea12cdefa0695ef6002a4a645d6e24e113ec5 (HEAD -> master)
        Author: Verify Bot <verify@meridian.example>
        Date:   Tue Oct 13 12:12:37 2026 +0000

            Lower the pressure-drop alarm to 2.5 kPa

        diff --git a/scrubber.conf b/scrubber.conf
        index 6af5623..fdc3744 100644
        --- a/scrubber.conf
        +++ b/scrubber.conf
        @@ -1,7 +1,7 @@
         # CO2 scrubbers, habitat ring.
         beds = 2
         bed_swap_minutes = 45
        -pressure_drop_alarm_kpa = 4.0
        +pressure_drop_alarm_kpa = 2.5
         fan_rpm = 2400
         fan_fault_rpm = 900

    - prompt: The output of `git diff`.
      checks:
        - {contains: "+regen_temp_c = 240", says: "The regeneration change is still in your file, not committed", hint: "Was the regeneration change thrown away, staged or committed? It should still be in your file, unstaged."}
        - {not_contains: "pressure_drop_alarm_kpa", says: "The pressure alarm change isn't left over"}
      example: |
        diff --git a/scrubber.conf b/scrubber.conf
        index fdc3744..dc2f380 100644
        --- a/scrubber.conf
        +++ b/scrubber.conf
        @@ -10,4 +10,4 @@ regen_vent = overboard
         regen_minutes = 30
         regen_cooldown_minutes = 15
         regen_max_cycles_per_day = 32
        -regen_temp_c = 200
        +regen_temp_c = 240
comms:
  open:
    - {from: meridian, text: "SCRUBBER.CONF · 2 CHANGES · TESTED: 1 · UNTESTED: 1"}
    - {from: okafor, text: "Two fixes went into `scrubber.conf` today. The pressure alarm has been on the test bed all week. The regeneration temperature hasn't been near it."}
    - {from: okafor, text: "Ship the alarm tonight. The other one stays in your file until it's been tested, not in a commit."}
  lab_done:
    - {from: meridian, text: "COMMIT · PRESSURE-DROP ALARM 2.5 kPa · REGEN_TEMP_C: NOT STAGED"}
    - {from: okafor, text: "Just the alarm, and the regen change still sitting in your file. That's what the index is for."}
  complete:
    - {from: meridian, text: "SCRUBBER BED 2 · PRESSURE DROP 2.9 kPa · ALARM RAISED · BED SWAPPED"}
    - {from: okafor, text: "The new alarm caught a clogged bed on its first night. At 4.0 we'd have found out tomorrow, by breathing it."}
    - {from: mission, text: "*Meridian*, Mission Control. One change, one commit, and a message that says what it does. Keep sending them like that."}
---

## Three places a change can be

Day 21's two steps, `git add` then `git commit`, are there because git keeps **three versions**
of every tracked file:

| Place | What it is | You change it with |
|---|---|---|
| **working tree** | the files on your disk, as you edit them | your editor |
| **index** (the staging area) | the next commit, being put together | `git add` |
| **HEAD** | the last commit | `git commit` |

`git add` copies a file from the working tree into the index, and `git commit` turns the index
into a commit. So you choose what goes in a commit, and an edit can wait in your working tree
for as long as it needs to.

## Seeing the difference

| Command | Compares | Shows |
|---|---|---|
| `git diff` | the working tree with the index | what you **haven't staged** yet |
| `git diff --staged` | the index with HEAD | what the **next commit** will contain |
| `git show HEAD` | HEAD with its parent | the last commit: its message, then its diff |

`--cached` is an older name for `--staged`. A diff marks each changed line, with a few unchanged
lines around it for context:

```diff
@@ -2,3 +2,3 @@
 lamps = 12
-lamp_hours = 16
+lamp_hours = 14
 lamp_colour = warm
```

A line starting with `-` is how it was, `+` is how it is now, and a space means unchanged. Each
`@@` block is a **hunk**: one group of changes close together, here starting at line 2.

**Check `git diff --staged` before every commit.** It's the commit you're about to make, and the
best moment to catch a change that shouldn't be in it.

## Staging part of a file

`git add FILE` stages the whole file. `git add -p FILE` (`-p` for patch) shows you its changes a
hunk at a time and asks about each one:

| You answer | It does |
|---|---|
| `y` | stage this hunk |
| `n` | don't stage this hunk; it stays in your working tree |
| `s` | split this hunk into smaller ones, if it can |
| `q` | quit; nothing from this hunk on is staged |
| `?` | explain every answer |

Changes several lines apart are separate hunks, so two fixes in one file can go into separate
commits, or one now and one later.

## The short status

`git status --short` prints a line per file with **two columns**: the left is the index, the
right is the working tree.

| Shows | Means |
|---|---|
| `M ` | modified and staged |
| ` M` | modified, not staged |
| `MM` | some of the change staged, and more since |
| `A ` | a new file, staged |
| `??` | untracked |

A file with no line has nothing to commit.

## Taking it back

| Command | It does |
|---|---|
| `git restore --staged FILE` | takes the file out of the index; your edit stays in the file |
| `git restore FILE` | throws the edit away, putting the file back as the index has it |

⚠️ **`git restore FILE` has no undo.** The edit was never in a commit, so git has nothing to get
it back from. Reach for `--staged` first, and run `git diff` before you throw anything away.

**On the real station:** Claude's lab review needed a new database column, and the column
was merged on its own. Pull request #139 carried the migration and the model, and #140 came
after it with the code that uses them. In this project a migration always stands alone,
because bundling it "obscures the deploy ordering it depends on" (`CONTRIBUTING.md`). It's the
same choice as staging one hunk, at the scale of a pull request: each piece holds one change,
so you can see exactly what it does.

## Try it

```bash
cd "$(mktemp -d)" && git init -q
git config user.name "Cadet Test" && git config user.email "cadet@meridian.example"
seq 1 20 > levels.txt && git add levels.txt && git commit -q -m "Track levels.txt"
seq 1 20 | sed 's/^2$/two/; s/^19$/nineteen/' > levels.txt
git status --short               #  M levels.txt
git diff                         # two hunks: 2 became two, and 19 became nineteen
git add -p levels.txt            # answer y to the first hunk, n to the second
git status --short               # MM levels.txt: some staged, some not
git diff --staged                # only -2 +two
git diff                         # only -19 +nineteen
git restore --staged levels.txt
git status --short               #  M levels.txt: nothing staged, both edits still there
git restore levels.txt
git status --short               # nothing: both edits are gone, for good
```
