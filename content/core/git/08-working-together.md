---
# No console task: Unit 1.3 is built on labs (#121). Git runs on your own machine, and the
# station console doesn't simulate it.
title: Working together
minutes: 20
story: |
  **Mission log, day 28.** The station's history is full of commits called "fix", "stuff" and
  "update lighting.conf". At 3 a.m., with an alarm going, none of them tell anyone anything.
  Chief Okafor wants every change to explain itself.
quiz:
  - type: choice
    q: "Which is the best message for the commit called `fix` (`7c03d5f`), which slowed the pumps at night?"
    code: |-
      $ git log --oneline
      4e1a9b2 stuff
      7c03d5f fix
      2b8e6a1 update pumps.conf
    options:
      - "`Slow the night pumps to 900 rpm`, with a body: `The pumps woke the ring B crew; 900 rpm still meets the flow minimum.`"
      - "`Fixed the pumps.`"
      - "`pumps.conf: pump_speed 1200 -> 900`"
      - "`Changes requested by Okafor`"
    answer: 0
    explain: >-
      The subject says what the commit does, in the imperative ("Slow", as in "this commit will…"),
      and the body says **why**, which the diff can't. The third option repeats the diff, and the
      fourth names a person instead of a reason. "Fixed the pumps." says neither what nor why.
  - type: choice
    q: "Last week `secrets.env` was committed and pushed. Today it's deleted and added to `.gitignore`. Is the secret safe?"
    options:
      - "No: it's still in the commit from last week, in every copy. Change the secret itself"
      - "Yes: deleting the file removes it from git"
      - "Yes: `.gitignore` hides it from everyone who pulls"
      - "Only once `git status` stops listing it"
    answer: 0
    explain: >-
      Every commit is a snapshot, so the one with the secret still has it, and anyone with the
      repository can `git show` it. Ignoring and deleting only stop the *next* commit including
      it. A pushed secret is published: replace it (a new password, a new key) and treat the old
      one as known.
  - type: choice
    q: "You add `build/` to `.gitignore`, but `git status` still says this. Why?"
    code: |-
      $ git status --short
       M build/app.js
    options:
      - "`build/app.js` was already tracked, and `.gitignore` only affects untracked files. `git rm --cached` stops tracking it"
      - "`.gitignore` takes effect at the next commit"
      - "The pattern needs to be `build/*`"
      - "`.gitignore` only works in the repository's top directory"
    answer: 0
    explain: >-
      `.gitignore` tells git which **untracked** files to leave alone. A file git already tracks
      keeps being tracked. `git rm --cached FILE` removes it from the index (not from your disk),
      and once that's committed, the ignore rule applies.
  - type: choice
    q: "What does `git rebase main` do, on your branch?"
    options:
      - "Replays your branch's commits on the end of `main`, as new commits, so the history is one straight line"
      - "Merges `main` into your branch with a merge commit"
      - "Moves `main` forward to your branch"
      - "Deletes the commits `main` already has"
    answer: 0
    explain: >-
      Rebase takes each of your commits and makes it again on top of where `main` is now, so they
      get new hashes. That's why it's only for commits nobody else has yet, the same rule as
      `reset` (day 27).
  - type: fill
    q: "Imperative mood: which word should this subject start with? (`____ the corridors to 20% at night`: Dimmed, Dims or Dim?)"
    answer: ["Dim"]
    explain: >-
      A subject finishes the sentence "If applied, this commit will…": *Dim the corridors*. It
      matches the messages git writes itself, like `Merge branch …` and `Revert "…"`.
cards:
  - id: commit-message
    front: A good commit message
    back: "Subject: what it does, imperative, capitalised, ~50 characters, no full stop. Blank line. Body: **why**."
  - id: gitignore-tracked
    front: "`.gitignore` doesn't stop a file being tracked. Why not?"
    back: "It only applies to untracked files. `git rm --cached FILE` stops tracking one, keeping it on disk."
  - id: secret-in-history
    front: You pushed a secret. What now?
    back: "Change the secret. It's in the history, in every copy: deleting or ignoring the file only protects future commits."
  - id: rebase
    front: "`git rebase main`"
    back: "Replays your branch's commits on top of `main` as new commits: a straight history. Only for commits nobody else has."
lab:
  from: okafor
  ai_review: true
  rubric:
    - Each subject says what the commit does, in the imperative mood ("Dim", not "Dimmed" or "Dims"), in about 50 characters or fewer.
    - Each body says why the change was made, using Okafor's reasons, instead of repeating what the diff shows.
    - The `.gitignore` commit says why each thing is kept out of the repository - the reports are generated, and `secrets.env` holds a secret.
    - Each message describes a single change, never two joined with "and", so any of them could be reverted on its own.
    - Someone reading the log at 3 a.m., with no other context, would understand each commit.
  task: |-
    Make the night-lighting branch a history worth reading, then put it on top of `main`.

    1. Run the setup below, once (your name and email set, as on day 21). It makes
       `~/meridian/lighting` and leaves you on the branch `night-lighting`, with two files git
       shouldn't track: `report/`, rebuilt every night by the lighting service, and
       `secrets.env`, which holds the relay's token. To start again, delete `~/meridian/lighting`
       first.
    2. Keep `report/` and `secrets.env` out of the repository with a `.gitignore`, and commit it.
    3. Okafor's two changes to `lighting.conf`, **one commit each**:
       - `corridor_night_pct` from `60` to **`20`**. *Her reason: the night shift sleeps off the
         corridors, and at 60% the light under the doors keeps them awake.*
       - `night_starts` from `22:00` to **`21:00`**. *Her reason: the night shift now starts an
         hour earlier, and the lights should change with it.*
    4. Every commit gets a subject and a body that says why, in your own words.
    5. Nakamura has added a commit to `main` since the branch started. Rebase `night-lighting`
       onto `main`.
    6. Paste what each command below prints. Claude reviews your commit messages once the
       checks pass.
  setup: |-
    mkdir -p ~/meridian/lighting && cd ~/meridian/lighting && git init -q -b main
    c() {
      export GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$(echo "$1" | tr 'A-Z' 'a-z')@meridian.example"
      export GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
      export GIT_AUTHOR_DATE="$2 09:00:00 +0000" GIT_COMMITTER_DATE="$2 09:00:00 +0000"
      git add -A && git commit -q -m "$3"
      unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_DATE
    }
    printf 'corridor_night_pct = 60\ncabin_night_pct = 40\nnight_starts = 22:00\nnight_ends = 06:00\n' > lighting.conf
    c Okafor 2026-10-05 "Track the lighting settings"
    git switch -q -c night-lighting
    git switch -q main
    printf 'galley_pct = 80\ngalley_after_hours_pct = 30\n' > galley.conf
    c Nakamura 2026-10-11 "Track the galley lighting"
    git switch -q night-lighting
    mkdir -p report && printf '<h1>Lighting report</h1>\n' > report/lighting-2026-10-12.html
    printf 'RELAY_TOKEN=c0ffee-not-a-real-token\n' > secrets.env
    unset -f c
  boxes:
    - prompt: "The output of `git log --format='%s%n%b---' main..`: your branch's commit messages."
      checks:
        - {regex: '\A\s*(?:(?:(?!---$)[^\n]*\n)+---[ \t]*(?:\n|\Z)){3}\s*\Z', says: "Three commits on the branch", hint: "One for the .gitignore and one for each of Okafor's changes. Paste only what git printed."}
        - {regex: '\A\s*(?:(?!---$)[^\n]*\S[^\n]*\n(?:[ \t]*\n)*(?!---$)[^\n]*\S[^\n]*\n(?:(?!---$)[^\n]*\n)*---[ \t]*(?:\n|\Z)\s*){3}\Z', says: "Every commit has a body as well as a subject", hint: "A second -m gives a commit its body: git commit -m \"Subject\" -m \"Why\"."}
        - {regex: '\A\s*(?:[A-Z][^\n]*[^.\s][ \t]*\n(?:(?!---$)[^\n]*\n)*---[ \t]*(?:\n|\Z)\s*){3}\Z', says: "Every subject starts with a capital and has no full stop", hint: "Check each subject's first letter and last character. And paste only what git printed, not the command."}
      example: |
        Start night lighting at 21:00
        The night shift now starts at 21:00, an hour earlier, and the lights should change with it.
        ---
        Dim the corridors to 20% at night
        The night shift sleeps off the corridors, and at 60% the light under the doors kept them awake.
        ---
        Ignore the generated reports and the relay secret
        The reports are rebuilt from the logs every night, and secrets.env holds the relay token, which must never leave this machine.
        ---
    - prompt: The output of `git status --ignored --short`.
      checks:
        - {regex: '^!! report/ *$', says: "report/ is ignored", hint: "A line in .gitignore for the directory: its name with a / at the end."}
        - {regex: '^!! secrets\.env *$', says: "secrets.env is ignored"}
        - {not_contains: "??", says: "Nothing is left untracked", hint: "Is .gitignore itself committed? Untracked files show as ??."}
        - {not_contains: "M ", says: "Every change is committed"}
      example: |
        !! report/
        !! secrets.env
    - prompt: The output of `git log --oneline --graph --all`.
      checks:
        - {not_contains: "|", says: "One straight line: the branch is rebased, not merged", hint: "Rebase night-lighting onto main, rather than merging."}
        - {regex: '\A\s*(?:\* [^\n]*\n){3}\* [0-9a-f]{7,} (\([^)]*\) )?Track the galley lighting *$', says: "Your three commits sit on top of Nakamura's"}
      example: |
        * 9964aeb (HEAD -> night-lighting) Start night lighting at 21:00
        * 2e809ab Dim the corridors to 20% at night
        * 69a18ac Ignore the generated reports and the relay secret
        * a98dc2d (main) Track the galley lighting
        * 5dd8052 Track the lighting settings
    - prompt: The output of `cat lighting.conf`.
      checks:
        - {regex: '^corridor_night_pct = 20 *$', says: "The corridors are at 20% at night"}
        - {regex: '^night_starts = 21:00 *$', says: "Night lighting starts at 21:00"}
      example: |
        corridor_night_pct = 20
        cabin_night_pct = 40
        night_starts = 21:00
        night_ends = 06:00
comms:
  open:
    - {from: meridian, text: "LIFE SUPPORT LOG · 214 COMMITS · MESSAGES \"fix\": 41 · \"stuff\": 12"}
    - {from: okafor, text: "Forty-one commits called \"fix\". At 3 a.m., with an alarm going, which one do I revert?"}
    - {from: okafor, text: "The night lighting's yours. Keep the junk out, one change per commit, and every message says why. Claude reads them after you, and so will I."}
  lab_done:
    - {from: meridian, text: "NIGHT-LIGHTING · 3 COMMITS · REBASED ON MAIN · IGNORED: REPORT/, SECRETS.ENV"}
    - {from: okafor, text: "I could read those half asleep, and one day I will. That's the standard now."}
  complete:
    - {from: meridian, text: "UNIT · GIT · COMPLETE · EVERY CHANGE: AUTHOR · REASON · HISTORY"}
    - {from: mission, text: "*Meridian*, Mission Control. We can read your station's history from here, and it makes sense. That's Git done, cadet."}
    - {from: okafor, text: "Look outside. The shuttle's bringing the next crew, and they'll learn this station from its log. Make it worth reading."}
  window: {complete: shuttle-dock}
---

## Keep things out: .gitignore

Some files must never be committed: files a program **generates** (reports, builds, logs), which
can always be made again, and above all **secrets** (passwords, tokens, keys). A file called
`.gitignore`, usually at the top of the repository, lists them, one pattern per line, and is committed
like any other file:

| Pattern | Ignores |
|---|---|
| `credentials.env` | a file with that name, in any directory |
| `*.log` | every file whose name ends in `.log` |
| `build/` | a directory called `build`, and everything in it |
| `!keep.log` | an exception, after the `*.log` line: `keep.log` isn't ignored after all |

Ignored files no longer show as untracked, and `git add .` skips them. `git status --ignored
--short` lists them with `!!`.

⚠️ **`.gitignore` only affects untracked files.** A file git already tracks stays tracked:
`git rm --cached FILE` removes it from the index, keeping it on disk. And a secret that was ever
committed is in that commit's snapshot for good, in every copy. Ignoring or deleting it now
protects only future commits, so **change the secret itself**.

## Messages that explain themselves

A commit message is for whoever reads the log later, under pressure. The conventions:

| Part | The rule | Example |
|---|---|---|
| subject | what the commit does, **imperative and capitalised**, about 50 characters, no full stop | `Dim the corridors to 20% at night` |
| a blank line | separates them; git adds it for you | |
| body | **why**: the reason, which the diff can't show | `The night shift sleeps off the corridors…` |

"Imperative" means it finishes the sentence *If applied, this commit will…*: "Dim", not "Dimmed"
or "Dims". `git commit -m "Subject" -m "Body"` writes both: each `-m` is a paragraph. One change
per commit, too: then each can be understood, and reverted, alone.

## A tidy branch: rebase

While you work on a branch, `main` moves on. Merging it in works (day 24) but leaves a merge
commit in your branch's story. **`git rebase main`**, run on your branch, replays your commits
**on top of** where `main` is now, as new commits. The history becomes one straight line.

- Rebased commits get **new hashes**, so only rebase commits nobody else has yet: the same rule
  as `reset` (day 27).
- If a replayed commit conflicts, fix it as on day 25, `git add` the file, then
  `git rebase --continue`. `git rebase --abort` puts the branch back as it was.
- `git log main..` lists the commits on your branch that `main` doesn't have, and
  `--format='%s%n%b---'` prints each one's subject (`%s`) and body (`%b`).

## The whole flow, on the real station

**On the real station:** every change to this app takes the same path, and this module took it
too:

1. An **issue** says what and why, with acceptance criteria (#132).
2. A **branch** named after it, `132-working-together`, made from `main`.
3. **Commits** whose subjects are imperative and capitalised and whose bodies say why (the rule
   in `CLAUDE.md`).
4. A **pull request** saying `Closes #132`. CI runs the checks, and nothing merges until they
   pass.
5. A **squash merge**: the branch becomes one commit on `main`, titled by the pull request.
   Then a check that CI passes on `main` too.

And the `.gitignore` here keeps out `.env`, `*.env`, `backups/` and more, each with a comment
saying why. One comment records a real trap: `*.env` matches only names *ending* in `.env`, so
`.env.bak`, which holds real secrets, needed its own line.

## Try it

```bash
cd "$(mktemp -d)" && git init -q -b main
git config user.name "Cadet Test" && git config user.email "cadet@meridian.example"
echo "lamps=12" > deck.conf && git add deck.conf && git commit -q -m "Track deck.conf"
git switch -q -c fans
echo "token=abc123" > key.env && echo "*.env" > .gitignore
git status --short --ignored     # ?? .gitignore, and !! key.env
git add .gitignore && git commit -q -m "Ignore env files" -m "They hold tokens, which must never be committed."
echo "fans=4" >> deck.conf && git add deck.conf && git commit -q -m "Add the deck fans" -m "The deck runs warm with the new lamps."
git switch -q main && echo "heaters=2" > heat.conf && git add heat.conf && git commit -q -m "Track heat.conf"
git switch -q fans && git rebase main      # Successfully rebased and updated refs/heads/fans.
git log --oneline --graph --all  # one straight line: fans' two commits above main's
git log --format='%s%n%b---' main..        # each subject, its body, then ---
```
