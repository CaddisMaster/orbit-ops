---
title: Making, moving and matching files
minutes: 20
story: |
  **Mission log, day 3.** The cargo bay's log directory is full of crash dumps from the
  outage. "Move the ones from last week somewhere safe and delete the rest," Okafor says.
  "Carefully. There's no undo on this station."
quiz:
  - type: choice
    q: What does `mkdir -p backups/2026/10` do if `backups` doesn't exist yet?
    options: ["Fails with an error", "Creates all three directories as needed", "Creates only `10`", "Asks for confirmation"]
    answer: 1
    explain: >-
      `-p` creates any missing **p**arent directories, and doesn't complain if they already exist,
      which also makes it safe to run twice in a script.
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
    options: ["`ls`", "The shell, before `ls` runs", "The kernel", "The filesystem"]
    answer: 1
    explain: >-
      The shell expands the pattern into matching names first, so `ls` receives
      `app.log error.log …` as separate arguments. That's why globs work the same with every
      command, and why quoting (`'*.log'`) stops the expansion.
  - type: fill
    q: Type the command that renames `report.txt` to `final.txt` in the current directory.
    answer: ["mv report.txt final.txt"]
    explain: >-
      Renaming is just moving within the same directory: `mv old new`. Careful: if `final.txt`
      already exists, `mv` replaces it without asking (`mv -i` asks).
terminal:
  task: |
    The cargo bay's `logs` directory is full of crash dumps. Okafor wants the ones from
    **October** kept, moved into a new directory `/station/cargo/archive`, and the
    **September** ones deleted. Leave `app.log` where it is. Preview each glob with `echo`
    before you hand it to `mv` or `rm`.
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
    accept: ["cp -r src dest"]
    front: How do you copy a whole directory?
    back: "`cp -r src dest`. Without `-r`, `cp` skips directories."
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
| `touch notes.txt` | creates an empty file (or updates its timestamp) |
| `mkdir reports` | creates one directory |
| `mkdir -p backups/2026/10` | creates a whole path, and doesn't complain if it exists |
| `mkdir ../archive` | creates `archive` one level up, next to the directory you're in |

## Copying, moving, deleting

| Command | Does |
|---|---|
| `cp notes.txt notes.bak` | copies a file |
| `cp -r reports reports-old` | copies a directory and everything in it (**r**ecursive) |
| `mv notes.bak archive/` | moves a file into a directory |
| `mv a.log b.log c.log archive/` | moves **several** files into a directory |
| `mv *.log ../archive/` | the same with a glob, into `archive` one level up |
| `mv draft.txt final.txt` | renames: a move within the same directory |
| `rm final.txt` | deletes a file (`rm a b c` deletes several) |
| `rm -r reports-old` | deletes a directory and its contents |
| `rmdir empty-dir` | deletes a directory, only if it's empty |

**`cp` and `mv` read their arguments the same way: everything before the last one is what to
copy or move, and the last one is where it goes.** With two names, the last can be a new name
(a rename). With more than two, the last must be a directory that already exists, or you get
`target 'archive/': No such file or directory`. Make it first with `mkdir`.

> ⚠️ **There is no recycle bin.** `rm` is permanent and doesn't ask. Add `-i` to be prompted, and
> read every `rm -r` back to yourself before pressing Enter. One stray space turns
> `rm -r ~/scratch` into `rm -r ~ /scratch`: two arguments, the first being your entire home
> directory. (GNU `rm` does refuse `rm -r /` itself, but nothing protects `~`.)

`cp` and `mv` will also **overwrite** an existing destination silently. `-i` makes them ask
first, and `rm -i` asks before each file. Only an answer starting with `y` means yes.

## Globs: patterns the shell expands

| Pattern | Matches | Example |
|---|---|---|
| `*` | any characters, including none | `*.log` → `app.log`, `error.log` |
| `?` | exactly one character | `day?.txt` → `day1.txt`, not `day10.txt` |
| `[abc]` | one of those characters | `[ab]*.md` → names starting with a or b |
| `[0-9]` | one character in the range | `dump-[0-9].core` |

The important part is **who** does the matching. In module 01, the shell reads the whole line
before the command runs, and can rewrite parts of it first. This is what that's for: the shell
replaces the pattern with the list of matching names *before* the command runs:

```bash
echo *.log        # see exactly what a glob expands to, safely
rm *.log          # rm receives: app.log error.log ... (never the pattern itself)
```

So **preview a destructive glob with `echo` first**. `echo` prints whatever it's given, so
`echo *.log` shows exactly the list `rm *.log` would receive. Narrow a pattern by writing more of
the name yourself: `crash-*` matches every crash file, and `crash-2026-10-*` only October's.

**A pattern that matches nothing is left as it is.** `echo crash-09*` prints `crash-09*` back
when no name starts with `crash-09`. That's your sign the pattern is wrong, and it's why
`rm *.lgo` complains about a file literally named `*.lgo`.

Quotes stop expansion: `grep '*.log' file` searches for the literal text `*.log`.

### Braces aren't globs (but they're handy)

`{a,b}` is **brace expansion**: it generates words whether or not files exist.

```bash
mkdir -p project/{src,tests,docs}     # three directories at once
cp config.yml{,.bak}                  # cp config.yml config.yml.bak
```

## Try it

In a scratch directory you can safely mess up:

```bash
mkdir -p ~/scratch && cd ~/scratch
touch day{1..12}.txt
echo day?.txt          # only day1 … day9
echo day1*.txt         # day1, day10, day11, day12
mkdir old && mv day1?.txt old/
ls old
```
