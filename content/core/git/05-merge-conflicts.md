---
# No console task: Unit 1.3 is built on labs (#121). Git runs on your own machine, and the
# station console doesn't simulate it.
title: Merge conflicts
minutes: 20
story: |
  **Mission log, day 25.** Nakamura lowered the CO2 warning for the night shift. Petrov raised
  it, on his own branch, so dinner stops setting it off. Both changed the same line, both think
  they're right, and the station can only have one value.
quiz:
  - type: choice
    q: "You're on `main`, merging `quiet-fans`. Which version is between `<<<<<<<` and `=======`?"
    code: |-
      <<<<<<< HEAD
      fan_rpm = 1800
      =======
      fan_rpm = 1200
      >>>>>>> quiet-fans
    options:
      - "`main`'s: `HEAD` is the branch you're on, the one being merged into"
      - "`quiet-fans`', since it's the branch being merged"
      - "Whichever was committed first"
      - "The version from before either branch changed it"
    answer: 0
    explain: >-
      The top half, after `<<<<<<< HEAD`, is the branch you're on. The bottom half, down to
      `>>>>>>> quiet-fans`, is the branch you're merging in. Neither half is the original: that's
      only shown if you ask for it (`git config merge.conflictStyle diff3`).
  - type: choice
    q: "You've edited `pumps.conf` to the value you want and removed the markers. `git status` still says this. What next?"
    code: |-
      $ git status
      On branch main
      You have unmerged paths.
        (fix conflicts and run "git commit")
        (use "git merge --abort" to abort the merge)

      Unmerged paths:
        (use "git add <file>..." to mark resolution)
      	both modified:   pumps.conf
    options:
      - "`git add pumps.conf` to mark it resolved, then `git commit` to finish the merge"
      - "`git merge --continue` straight away: git can see the markers are gone"
      - "`git commit -m \"Fix it\"`: committing marks it resolved"
      - "Nothing: the merge finished when the markers were removed"
    answer: 0
    explain: >-
      Git doesn't read the file to decide you're done: **`git add` is how you tell it**. Until
      then, `git commit` refuses with "Committing is not possible because you have unmerged
      files". After the add, `git commit` makes the merge commit. `git merge --continue` does the
      same, but also only after the add.
  - type: choice
    q: Halfway through resolving, you realise you merged the wrong branch. What puts everything back as it was before the merge?
    options:
      - "`git merge --abort`"
      - "`git restore .`"
      - "`git branch -D` the branch you merged"
      - "Deleting the conflict markers"
    answer: 0
    explain: >-
      `git merge --abort` undoes the merge in progress: the files go back to how your branch had
      them, and it's as if you never started. That's only certain if everything was committed
      before you began, so start merges from a clean `git status`. Resolve nothing you don't mean to commit.
  - type: choice
    q: "When does a merge stop with a conflict?"
    options:
      - "When both branches changed the same lines, or lines right next to each other, in different ways since they split"
      - "Whenever both branches changed the same file"
      - "Whenever the two branches have different authors"
      - "Whenever one branch deleted a line"
    answer: 0
    explain: >-
      Git merges changes to different parts of a file by itself, even in the same file. It only
      stops when the same lines (or neighbouring ones) were changed differently on each side,
      because then choosing is a decision, not arithmetic.
cards:
  - id: conflict-why
    front: When does git stop a merge with a conflict?
    back: "When both branches changed the same (or neighbouring) lines differently since they split. Other changes merge by themselves."
  - id: conflict-markers
    front: "`<<<<<<< HEAD` … `=======` … `>>>>>>> NAME`"
    back: "The top half is your branch (HEAD), the bottom half is NAME's. Edit it to the right result and delete all three marker lines."
  - id: finish-merge
    front: Finish a merge once the file's resolved
    back: "`git add FILE` to mark it resolved, then `git commit`."
  - id: merge-abort
    front: Back out of a merge in progress
    back: "`git merge --abort`: everything goes back to how it was before the merge."
lab:
  from: okafor
  task: |-
    Merge Petrov's branch into `main`, and settle the CO2 warning the way the brief says.

    1. Run the setup below, once. It makes `~/meridian/sensors`: `main`, where Nakamura set
       the warning to 800 ppm, and Petrov's branch `galley-warning`, where he set it to 1500.
       To start again, delete `~/meridian/sensors` first.
    2. Look at both lines of work with `git log --oneline --graph --all`.
    3. On `main`, merge `galley-warning`. It stops with a conflict.
    4. Read the conflict in `sensors.conf`. **The brief:** the warning is **`1200`** ppm, so it
       still warns the night shift early and lets the galley cook. Edit the file to one
       `co2_warn_ppm` line at 1200, with no markers left. Leave every other line as the merge
       left it.
    5. Mark it resolved and finish the merge with the message **`Merge galley-warning: CO2
       warning at 1200 ppm`**.
    6. Paste what `cat sensors.conf` and `git log --oneline --graph` print.
  setup: |-
    mkdir -p ~/meridian/sensors && cd ~/meridian/sensors && git init -q -b main
    c() {
      export GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$(echo "$1" | tr 'A-Z' 'a-z')@meridian.example"
      export GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
      export GIT_AUTHOR_DATE="$2 09:00:00 +0000" GIT_COMMITTER_DATE="$2 09:00:00 +0000"
      git add -A && git commit -q -m "$3"
      unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_DATE
    }
    edit() { sed "$2" "$1" > "$1.new" && mv "$1.new" "$1"; }
    printf '# Sensor limits, habitat ring.\nco2_warn_ppm = 1000\nco2_alarm_ppm = 2000\no2_low_pct = 19.5\npressure_low_kpa = 94\nsmoke_ppm = 60\nhumidity_high_pct = 70\n' > sensors.conf
    c Okafor 2026-10-01 "Track the sensor limits"
    git switch -q -c galley-warning
    edit sensors.conf 's/^co2_warn_ppm = 1000$/co2_warn_ppm = 1500/'
    c Petrov 2026-10-05 "Raise the CO2 warning so the galley stops setting it off"
    git switch -q main
    edit sensors.conf 's/^co2_warn_ppm = 1000$/co2_warn_ppm = 800/'
    c Nakamura 2026-10-06 "Lower the CO2 warning for the night shift"
    edit sensors.conf 's/^humidity_high_pct = 70$/humidity_high_pct = 65/'
    c Okafor 2026-10-07 "Lower the humidity alarm to 65%"
    unset -f c edit
  boxes:
    - prompt: The output of `cat sensors.conf`.
      checks:
        - {regex: '^co2_warn_ppm = 1200 *$', says: "The CO2 warning is the brief's value", hint: "Neither branch's number is the answer: read the brief again."}
        - {not_contains: "<<<<<<<", says: "No conflict markers left", hint: "Every marker line goes: the <<<<<<<, the ======= and the >>>>>>> ones."}
        - {not_contains: "=======", says: "No ======= line left"}
        - {not_contains: ">>>>>>>", says: "No >>>>>>> line left"}
        - {lines: {min: 7, max: 7}, says: "One line per setting, none of them doubled", hint: "Is one side's co2_warn_ppm line still there as well as the new one? Paste only the file, not the command."}
        - {contains: "humidity_high_pct = 65", says: "main's other change came through the merge", hint: "The humidity change merged by itself: leave the lines outside the conflict as they are."}
      example: |
        # Sensor limits, habitat ring.
        co2_warn_ppm = 1200
        co2_alarm_ppm = 2000
        o2_low_pct = 19.5
        pressure_low_kpa = 94
        smoke_ppm = 60
        humidity_high_pct = 65
    - prompt: The output of `git log --oneline --graph`.
      checks:
        - {regex: '^\*\s+[0-9a-f]{7,} (\(.*\) )?Merge galley-warning: CO2 warning at 1200 ppm *$', says: "A merge commit, with the message the task gives, newest", hint: "Was the merge finished with a commit, and does its message match the task's letter for letter?"}
        - {regex: '^[|* ]+[0-9a-f]{7,} (\(.*\) )?Raise the CO2 warning so the galley stops setting it off *$', says: "Petrov's commit is in main's history now"}
        - {contains: "|\\", says: "Two lines of work, joined", hint: "Did the merge happen, or was it aborted?"}
      example: |
        *   a843d66 (HEAD -> main) Merge galley-warning: CO2 warning at 1200 ppm
        |\
        | * 4970ef8 (galley-warning) Raise the CO2 warning so the galley stops setting it off
        * | 0fadf2b Lower the humidity alarm to 65%
        * | 548ab9a Lower the CO2 warning for the night shift
        |/
        * 1448122 Track the sensor limits
comms:
  open:
    - {from: meridian, text: "CO2 WARNING · MAIN 800 ppm · GALLEY-WARNING 1500 ppm · ONE LINE · TWO VALUES"}
    - {from: okafor, text: "Nakamura lowered the CO2 warning for the night shift. Petrov raised it so the galley stops setting it off at dinner. Same line, two branches."}
    - {from: okafor, text: "They're both right about something. The brief says 1200. Merge them, settle it, and say so in the commit."}
  lab_done:
    - {from: meridian, text: "MERGE · CO2 WARNING 1200 ppm · CONFLICT MARKERS: 0"}
    - {from: okafor, text: "One value, and a merge commit that says what it is. Petrov and Nakamura have both read it, and neither of them is sulking."}
  complete:
    - {from: meridian, text: "CO2 WARNING · 1200 ppm · NIGHT SHIFT WARNED · GALLEY QUIET"}
    - {from: mission, text: "*Meridian*, Mission Control. Two of your crew disagreed, and the history shows how it was settled. That's rarer than it should be."}
    - {from: okafor, text: "Tomorrow: the station's master copy isn't on the station. Mission Control keeps it, and your fixes don't count until they're there."}
---

## Why conflicts happen

When both branches have new commits, `git merge` combines their changes. Changes to
**different** parts of a file merge by themselves, even in the same file. It's only when both
branches changed the **same lines** (or lines right next to each other) in different ways that
git stops, because choosing between them is a decision, not arithmetic:

```text
Auto-merging lights.conf
CONFLICT (content): Merge conflict in lights.conf
Automatic merge failed; fix conflicts and then commit the result.
```

The merge is now **in progress**. Everything that merged cleanly is staged, and each conflicted
file has both versions written into it. `git status` lists those files under **Unmerged paths**
as `both modified`, and `git status --short` marks them `UU`.

## Reading the markers

Git writes both versions where they clash:

```text
<<<<<<< HEAD
brightness = 90
=======
brightness = 40
>>>>>>> dimmer
```

| Part | Holds |
|---|---|
| from `<<<<<<< HEAD` to `=======` | the version on the branch **you're on** |
| from `=======` to `>>>>>>> NAME` | the version on the branch you're **merging in** |

The original, from before either branch changed it, isn't shown. `git config --global
merge.conflictStyle diff3` adds it between `|||||||` and `=======`, which helps when you can't
tell who changed what. During a merge, `git diff` shows only the conflicted files, in a
combined form with a column for each side. What merged cleanly is already staged, so it's left
out, and so is a file once you've added it.

## Resolving

1. **Edit the file to what it should say,** in any editor. In a terminal, `nano FILE` opens it:
   ^K cuts the line the cursor's on, ^O then Enter saves, ^X leaves. The right content can be
   one side, the other, both, or neither of them: it's a decision, often a third value. **Delete every marker line**:
   the `<<<<<<<`, the `=======` and the `>>>>>>>`.
2. **`git add FILE`** marks it resolved. Git doesn't read the file to decide; the add is how you
   tell it. Until every conflicted file is added, `git commit` refuses with `Committing is not
   possible because you have unmerged files`.
3. **`git commit`** makes the merge commit. Use `-m` to say how you settled it, or leave it off
   and git opens your editor with `Merge branch 'NAME'` written for you.

Changed your mind, or merged the wrong branch? **`git merge --abort`** puts everything back as
it was before the merge. That's only certain when everything was committed before you started,
so begin a merge from a clean `git status`.

**On the real station:** almost every pull request to this app adds a line under `## [Unreleased]`
in `CHANGELOG.md` (CI checks that any change to `app/` does). Two pull requests open at once both
add a line at the same place, so whichever merges second conflicts there. Its resolution is
**both**: keep each entry, delete the markers, and nothing is lost. The other common one is
`docs/status.md`, where most sessions add an entry at the top.

## Try it

```bash
cd "$(mktemp -d)" && git init -q -b main
git config user.name "Cadet Test" && git config user.email "cadet@meridian.example"
echo "brightness = 70" > lights.conf && git add lights.conf && git commit -q -m "Track lights.conf"
git switch -q -c dimmer
echo "brightness = 40" > lights.conf && git add lights.conf && git commit -q -m "Dim the lights"
git switch -q main
echo "brightness = 90" > lights.conf && git add lights.conf && git commit -q -m "Brighten the lights"
git merge dimmer                 # CONFLICT (content): Merge conflict in lights.conf
cat lights.conf                  # <<<<<<< HEAD, 90, =======, 40, >>>>>>> dimmer
git status --short               # UU lights.conf
git merge --abort && cat lights.conf     # brightness = 90: as if you'd never merged
git merge dimmer                 # the same conflict again
echo "brightness = 60" > lights.conf     # the decision: neither side's value
git add lights.conf && git commit -q --no-edit
git log --oneline --graph        # the merge commit joins both lines
```
