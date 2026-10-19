---
title: Making, moving and matching files
minutes: 20
story: |
  **Mission log, day 3.** The cargo bay's log directory is full of crash dumps from the
  outage. "Move the ones from last week somewhere safe and delete the old ones," Okafor says.
  "Carefully. There's no undo on this station."
quiz:
  - type: choice
    q: What does `mkdir -p backups/2026/10` do if `backups` doesn't exist yet?
    options: ["Fails with an error", "Creates all three directories as needed", "Creates only `10`", "Asks for confirmation"]
    answer: 1
    explain: >-
      `-p` creates any missing **p**arent directories, and doesn't complain if they already exist,
      which also makes it safe to run twice.
  - type: multi
    q: Which statements about `rm` are true?
    options:
      - "Deleted files don't go to a recycle bin"
      - "`rm -r` deletes a directory and everything in it"
      - "`rm` asks for confirmation before deleting, by default"
      - "`rm -i` asks before each deletion"
    answer: [0, 1, 3]
    explain: >-
      `rm` deletes immediately and permanently, with no bin and no prompt unless you ask for one
      with `-i`. `-r` makes it recursive, so check the path twice before pressing Enter.
  - type: choice
    q: In `ls *.log`, what turns `*.log` into a list of file names?
    options: ["`ls`, after it starts", "The shell, before `ls` runs", "The file names themselves", "The filesystem"]
    answer: 1
    explain: >-
      The shell expands the pattern into matching names first, so `ls` receives
      `app.log error.log …` as separate arguments. That's why globs work the same with every
      command, and why quoting (`echo '*.log'`) stops the expansion.
  - type: fill
    q: Type the command that renames `report.txt` to `final.txt` in the current directory.
    answer: ["mv report.txt final.txt"]
    explain: >-
      Renaming is just moving within the same directory: `mv old new`. Careful: if `final.txt`
      already exists, `mv` replaces it without asking (`mv -i` asks).
terminal:
  task: |
    The cargo bay's `logs` directory is full of **crash dumps**: files a program writes when it
    crashes, named by date. You start in `/station/cargo`, one level above `logs`.

    1. Look inside `logs`.
    2. Make a new directory, `/station/cargo/archive`.
    3. **Move** the **October** dumps into `archive` (moved, not copied: they leave `logs`).
    4. **Delete** the **September** dumps.
    5. Leave `app.log` where it is.

    Preview each glob with `echo` before you hand it to `mv` or `rm`. The console checks after
    every command, so you're done the moment steps 2 to 5 are.
  cwd: /station/cargo
  files:
    - {path: /station, type: dir}
    - {path: /station/cargo, type: dir}
    - {path: /station/cargo/logs, type: dir}
    - {path: /station/cargo/logs/app.log, contents: "bay door cycled\nbay door cycled\n"}
    - {path: /station/cargo/logs/crash-2026-09-12.dump, contents: "core dump 2026-09-12\n"}
    - {path: /station/cargo/logs/crash-2026-09-19.dump, contents: "core dump 2026-09-19\n"}
    - {path: /station/cargo/logs/crash-2026-09-26.dump, contents: "core dump 2026-09-26\n"}
    - {path: /station/cargo/logs/crash-2026-10-02.dump, contents: "core dump 2026-10-02\n"}
    - {path: /station/cargo/logs/crash-2026-10-05.dump, contents: "core dump 2026-10-05\n"}
    - {path: /station/cargo/logs/crash-2026-10-07.dump, contents: "core dump 2026-10-07\n"}
  checks:
    - {exists: /station/cargo/archive/crash-2026-10-02.dump, type: file}
    - {exists: /station/cargo/archive/crash-2026-10-05.dump, type: file}
    - {exists: /station/cargo/archive/crash-2026-10-07.dump, type: file}
    - {missing: /station/cargo/logs/crash-2026-10-02.dump}
    - {missing: /station/cargo/logs/crash-2026-10-05.dump}
    - {missing: /station/cargo/logs/crash-2026-10-07.dump}
    - {missing: /station/cargo/logs/crash-2026-09-12.dump}
    - {missing: /station/cargo/logs/crash-2026-09-19.dump}
    - {missing: /station/cargo/logs/crash-2026-09-26.dump}
    - {exists: /station/cargo/logs/app.log, type: file}
  success: |-
    "Archive's tidy and the old dumps are gone," Okafor says. "And app.log survived. You'd be amazed how often it doesn't."
  solution:
    - 'echo logs/crash-2026-10-*'
    - 'mkdir archive'
    - 'mv logs/crash-2026-10-*.dump archive/'
    - 'echo logs/crash-2026-09-*'
    - 'rm logs/crash-2026-09-*.dump'
comms:
  open:
    - {from: okafor, text: "The cargo bay's log directory is full of crash dumps from the outage."}
    - {from: mission, text: "We need October's dumps for the analysis. September's are from the old firmware: bin them."}
    - {from: okafor, text: "Carefully. There's no undo on this station. `echo` the glob before you hand it to `rm`."}
  console_done:
    - {from: meridian, text: "ARCHIVE · 3 FILES · DELETED · 3 FILES · `app.log` · INTACT"}
    - {from: okafor, text: "And app.log survived. You'd be amazed how often it doesn't."}
  complete:
    - {from: mission, text: "Dumps received. First look: something in life support has been readable by the whole crew."}
    - {from: okafor, text: "That's tomorrow's problem, then. And I have a feeling I know which file."}
cards:
  - id: copy-directory
    section: "Copying, moving, deleting"
    accept: ["cp -r reports reports-old"]
    front: How do you copy the directory `reports`, and everything in it, to `reports-old`?
    back: "`cp -r reports reports-old`. Without `-r`, `cp` refuses to copy a directory."
  - id: who-expands-globs
    section: "Globs: patterns the shell expands"
    front: Who expands `*` in a command?
    back: The shell, before the command runs. The command only sees the resulting file names.
  - id: glob-wildcards
    section: "Globs: patterns the shell expands"
    front: "`?` vs `*` in a glob"
    back: "`?` matches exactly one character; `*` matches any number (including none)."
---

## Creating

| Command | Does |
|---|---|
| `touch notes.txt` | creates an empty file (or updates its timestamp: the "last modified" date `ls -l` shows) |
| `mkdir reports` | creates one directory |
| `mkdir -p backups/2026/10` | creates a whole path, and doesn't complain if it exists (`-p` for **p**arents) |
| `mkdir ../backup` | creates `backup` one level up, next to the directory you're in |

**The commands in this table and the next print nothing when they work**: `touch`, `mkdir`,
`cp`, `mv`, `rm` and `rmdir`, like `cd` in module 01. Silence means it worked. Check with `ls`.
The exceptions are on purpose: `-i` makes `cp`, `mv` and `rm` ask first, and `echo` (below)
prints whatever it's given.

## Copying, moving, deleting

| Command | Does |
|---|---|
| `cp notes.txt notes.bak` | copies a file |
| `cp -r reports reports-old` | copies a directory and everything in it (**r**ecursive) |
| `mv notes.bak backup/` | moves a file into a directory |
| `mv day1.txt day2.txt day3.txt backup/` | moves **several** files into a directory |
| `mv *.txt ../backup/` | the same with a glob (`*` stands for any name; *Globs*, below, explains it), into `backup` one level up |
| `mv draft.txt final.txt` | renames: a move within the same directory |
| `rm final.txt` | deletes a file (`rm day1.txt day2.txt` deletes several) |
| `rm -r reports-old` | deletes a directory and its contents |
| `rmdir backup` | deletes a directory, only if it's empty |

**`cp` and `mv` read their arguments the same way: everything before the last one is what to
copy or move, and the last one is where it goes.** With two names, the last can be a new name
(a rename). With more than two, the last must be a directory that already exists, or you get
`target 'backup/': No such file or directory`. Make it first with `mkdir`.

**A slash at the end of the destination, `backup/`, means "into the directory `backup`".** It's
a safety catch. `mv notes.bak backup` when there's no `backup` directory quietly *renames* your
file to `backup`. With the slash, `mv` stops instead:
`mv: cannot move 'notes.bak' to 'backup/': Not a directory`.

`cp` won't copy a directory without `-r`: `cp reports reports-old` answers
`cp: -r not specified; omitting directory 'reports'`.

> ⚠️ **There is no recycle bin.** `rm` is permanent and doesn't ask. Add `-i` to be prompted, and
> read every `rm -r` back to yourself before pressing Enter. One stray space turns
> `rm -r ~/scratch` into `rm -r ~ /scratch`: two arguments, the first being your entire home
> directory. (Linux's `rm` does refuse `rm -r /` itself, but nothing protects `~`.)

`cp` and `mv` will also **overwrite** an existing destination silently. `-i` makes them ask
first, and `rm -i` asks before each file. Only an answer starting with `y` means yes.

## Globs: patterns the shell expands

A **glob** is a file name with wildcards in it. The shell **expands** it: it swaps the pattern
for every file name that matches, then runs the command.

| Pattern | Matches | For example |
|---|---|---|
| `*` | any characters, including none | `*.log` matches `app.log` and `error.log` |
| `?` | exactly one character | `day?.txt` matches `day1.txt`, not `day10.txt` |
| `[abc]` | one of those characters | `[ab]*.md` matches names starting with a or b |
| `[0-9]` | one character in the range | `dump-[0-9].core` matches `dump-3.core`, not `dump-12.core` |

The important part is **who** does the matching. In module 01, the shell reads the whole line
before the command runs. This is why: the shell replaces the pattern with the list of matching
names *before* the command runs, and the command never sees the pattern:

```bash
echo *.log        # see exactly what a glob expands to, safely
rm *.log          # rm receives: app.log error.log ... (the names, when any match)
```

So **preview a destructive glob with `echo` first**. `echo` prints whatever it's given, so
`echo *.log` shows exactly the list `rm *.log` would receive. Narrow a pattern by writing more of
the name yourself: `day*` matches every day file, and `day1*` only the ones starting `day1`.

**A glob matches names in the directory you're in**, unless you put a path in front of it:
`echo reports/*.txt` matches the `.txt` files inside `reports`, from wherever you stand.

**A pattern that matches nothing is left as it is.** `echo crash-09*` prints `crash-09*` back
when no name starts with `crash-09`. That's your sign the pattern is wrong. It's also why a typo
like `rm *.lgo` (for `*.log`) complains about a file literally named `*.lgo`.

Quotes stop expansion: `echo '*.log'` prints `*.log` itself. Unit 1.2 covers quoting properly.

### Braces aren't globs (but they're handy)

`{a,b}` is **brace expansion**: it generates words whether or not files exist.
`project/{src,tests,docs}` becomes `project/src project/tests project/docs`. A range works too:
`day{1..3}.txt` becomes `day1.txt day2.txt day3.txt`. An empty choice counts as a choice, so
`config.yml{,.bak}` becomes `config.yml config.yml.bak`.

```bash
mkdir -p project/{src,tests,docs}     # three directories at once
cp config.yml{,.bak}                  # cp config.yml config.yml.bak
```

## Try it

In a scratch directory you can safely mess up, on a Linux machine or in the station console.
Run them one at a time:

```bash
mkdir -p ~/scratch
cd ~/scratch
touch day{1..12}.txt
ls
echo day?.txt
echo day1*.txt
echo day[12].txt
mkdir old
mv day1?.txt old/
ls old
cp -r old old-copy
mv day1.txt first.txt
rm -i day2.txt
rm -r old-copy
mv old/* .
rmdir old
ls
```

- `touch day{1..12}.txt` makes twelve empty files, and `ls` shows them.
- The three `echo` lines show what each glob matches: `day?.txt` only `day1` to `day9`;
  `day1*.txt` `day1`, `day10`, `day11` and `day12`; `day[12].txt` only `day1` and `day2`.
- `mv day1?.txt old/` moves `day10` to `day12` into `old`, and `ls old` proves it.
- `cp -r` copies the whole of `old`, `mv` renames `day1.txt`, and `rm -i` asks first: type `y`
  and Enter. `rm -r` deletes the copy.
- `mv old/* .` moves everything in `old` back here (`.` is "this directory", from module 01),
  so `rmdir old` can remove it: `rmdir` only takes an empty directory. The last `ls` shows
  what's left.
