---
title: Robust scripts
minutes: 20
story: |
  **Mission log, day 19.** Last night's log backup failed halfway, said `backup complete`
  anyway, and left 2 GB of copies in `/tmp`. Nobody on board noticed. Mission Control did,
  when no archive arrived. "A script that fails quietly is worse than no script," says Okafor.
  "At least with no script, we'd know."
quiz:
  - type: choice
    q: "Why does this script print `done`, and exit 0?"
    code: |-
      #!/usr/bin/env bash
      cp /var/log/app.log /backups/     # fails: /backups doesn't exist
      echo "done"
    options:
      - "Bash carries on after a failed command unless told not to, and the status is the last command's"
      - "`cp` doesn't set a status when it fails"
      - "`echo` resets every earlier error"
      - "Scripts always exit 0 unless they call `exit 1`"
    answer: 0
    explain: >-
      By default a failed command is just a non-zero `$?` that nobody checks. The script goes on,
      and ends with the status of `echo`, which succeeded. `set -e` makes the first failure stop it.
  - type: choice
    q: "With `set -e`, does this script stop at the `grep`?"
    code: |-
      set -e
      if grep -q FAULT scrubber.log; then
        echo "fault"
      fi
      echo "checked"
    options:
      - "No: a command tested by `if` is allowed to fail, so it prints `checked`"
      - "Yes: `grep` found nothing, so the script stops"
      - "Yes, but only if `scrubber.log` is empty"
      - "No: `set -e` only applies to `cp`, `mv` and `rm`"
    answer: 0
    explain: >-
      `set -e` doesn't stop a script for a command in an `if` or `while` test, one on the left
      of `&&` or `||`, or one after `!`. Those failures are being checked already.
  - type: choice
    q: "`set -o pipefail` is on. What is the status of `grep FAULT missing.log | wc -l`?"
    options:
      - "2: `grep` failed, and pipefail gives the pipeline the failing command's status"
      - "0: `wc -l` succeeded and printed 0"
      - "1: every pipeline that prints 0 fails"
      - "127: the file isn't found"
    answer: 0
    explain: >-
      Without pipefail, a pipeline's status is its **last** command's, so `wc` hides the
      failure. With it, the status is the last non-zero one: grep's 2, for a file it can't read.
  - type: choice
    q: "Where is the temporary directory removed, if `tar` fails halfway?"
    code: |-
      set -euo pipefail
      work=$(mktemp -d)
      trap 'rm -rf "$work"' EXIT
      cp logs/*.log "$work"/
      tar -czf /backups/logs.tar.gz -C "$work" .
    options:
      - "By the trap: `set -e` stops the script, and the EXIT trap runs as it ends"
      - "Nowhere: the script stopped before it got to any `rm`"
      - "Only if the script reaches its last line"
      - "By `mktemp`, which removes its directories itself"
    answer: 0
    explain: >-
      An EXIT trap runs however the script ends: at the last line, at `exit N`, or when `set -e`
      or `set -u` stops it. That's what makes it the place for cleanup.
  - type: fill
    q: "Which `set` option stops a script that uses a variable nobody set? (`set -_`)"
    answer: ["u", "-u"]
    explain: >-
      With `set -u`, `$tpyo` is an error instead of an empty string, so `rm -rf "$tpyo/"*`
      can't quietly become `rm -rf /*`.
cards:
  - id: strict-mode
    section: "`set -euo pipefail`"
    front: "What do `set -e`, `set -u` and `set -o pipefail` do?"
    back: "Stop at the first failed command; treat an unset variable as an error; make a pipeline fail if any part fails."
  - id: set-e-exceptions
    section: "`set -euo pipefail`"
    front: When doesn't `set -e` stop a script?
    back: "For a command tested by `if`/`while`/`until`, on the left of `&&`/`||`, or after `!`."
  - id: trap-exit
    section: "`trap … EXIT`: clean up, whatever happens"
    front: Clean up whatever happens to the script
    back: "`trap 'rm -rf \"$work\"' EXIT`, right after making it."
  - id: mktemp
    section: "`mktemp`: a temp directory of your own"
    accept: ["mktemp -d", "work=$(mktemp -d)"]
    front: Make a private temporary directory
    back: "`work=$(mktemp -d)`: a new, unique directory only you can read (mode 700)."
terminal:
  task: |
    `/station/bin/backup-logs` archives the scrubber logs into `$BACKUP_DEST` (`/srv/backups`
    unless that's set). Last night `/srv/backups` wasn't writable. `tar` failed, the script said
    `backup complete` anyway, and its copies are still in `/tmp/backup-work`. Read the script,
    then:

    1. **Clean up** last night's `/tmp/backup-work`.
    2. **Harden the script:**
       - **any failure stops it**, with the failing command's status;
       - it works in a **fresh temp directory from `mktemp -d`**, **always removed** when it ends,
         whether it succeeded or not;
       - `backup complete` is printed **only** once the archive is really there.
    3. **Test it both ways**, logging each run's output and status as on day 15. First as it
       is, which should fail:

       ```bash
       backup-logs >> ~/backup-test.log 2>&1; echo "exit $?" >> ~/backup-test.log
       ```

       Then into a directory you make, `~/backups`, by setting `BACKUP_DEST` for that run.
       Afterwards nothing big should be left anywhere under `/tmp`.
  cwd: /home/cadet
  env: {PATH: "/station/bin:/usr/local/bin:/usr/bin:/bin"}
  disk: {size: 20G, base: "4.2G"}
  files:
    - {path: /home/cadet, type: dir}
    - {path: /tmp, type: dir, owner: root, group: root, mode: "777"}
    - {path: /tmp/backup-work, type: dir, owner: cadet, group: crew, mode: "775"}
    - {path: /tmp/backup-work/scrubberd.log, owner: cadet, group: crew, contents: "2026-10-07 23:59:00 scrubbers nominal\n", size: 1G}
    - {path: /tmp/backup-work/ring-a.log, owner: cadet, group: crew, contents: "2026-10-07 23:59:00 ring-a CO2 3400 ppm\n", size: 512M}
    - {path: /tmp/backup-work/ring-b.log, owner: cadet, group: crew, contents: "2026-10-07 23:59:00 ring-b CO2 3500 ppm\n", size: 512M}
    - {path: /srv/backups, type: dir, owner: root, group: root, mode: "755"}
    - {path: /var/log/scrubber, type: dir, owner: root, group: root}
    - {path: /var/log/scrubber/scrubberd.log, owner: root, group: root, contents: "2026-10-08 08:55:00 scrubbers nominal\n", size: 1G}
    - {path: /var/log/scrubber/ring-a.log, owner: root, group: root, contents: "2026-10-08 08:55:00 ring-a CO2 3400 ppm\n", size: 512M}
    - {path: /var/log/scrubber/ring-b.log, owner: root, group: root, contents: "2026-10-08 08:55:00 ring-b CO2 3500 ppm\n", size: 512M}
    - {path: /station/bin, type: dir, owner: root, group: crew, mode: "775"}
    - path: /station/bin/backup-logs
      mode: "775"
      group: crew
      contents: |
        #!/usr/bin/env bash
        # backup-logs: archive the scrubber logs, then tidy up.
        dest=${BACKUP_DEST:-/srv/backups}
        work=/tmp/backup-work

        mkdir -p $work
        cp /var/log/scrubber/*.log $work/
        tar -czf $dest/scrubber-logs.tar.gz -C $work . && rm -r $work
        echo "backup complete"
  checks:
    - {missing: /tmp/backup-work}
    - {files_under: /tmp, max_size: 1M}
    - {contains: /home/cadet/backup-test.log, text: "Error is not recoverable: exiting now\nexit 2\n"}
    - {contains: /home/cadet/backup-test.log, text: "backup complete\nexit 0\n"}
    - {exists: /home/cadet/backups/scrubber-logs.tar.gz, type: file}
    - {contains: /station/bin/backup-logs, text: "mktemp -d"}
    - {contains: /station/bin/backup-logs, text: "trap"}
  success: |-
    Okafor watches the failed run stop dead and leave nothing behind. "That's a failure I can see. Mission Control won't have to tell us next time."
  solution:
    - cat /station/bin/backup-logs
    - du -sh /tmp/backup-work
    - rm -r /tmp/backup-work
    - |-
      cat > /station/bin/backup-logs <<'EOF'
      #!/usr/bin/env bash
      # backup-logs: archive the scrubber logs, then tidy up.
      set -euo pipefail

      dest=${BACKUP_DEST:-/srv/backups}
      archive="$dest/scrubber-logs.tar.gz"
      work=$(mktemp -d)
      trap 'rm -rf "$work"' EXIT

      cp /var/log/scrubber/*.log "$work"/
      tar -czf "$archive" -C "$work" .
      [ -f "$archive" ]
      echo "backup complete"
      EOF
    - backup-logs >> ~/backup-test.log 2>&1; echo "exit $?" >> ~/backup-test.log
    - mkdir ~/backups
    - BACKUP_DEST=~/backups backup-logs >> ~/backup-test.log 2>&1; echo "exit $?" >> ~/backup-test.log
    - cat ~/backup-test.log
    - du -sh /tmp
comms:
  open:
    - {from: mission, text: "Meridian, we have no log archive from you last night. Your backup job reported success at 02:00."}
    - {from: meridian, text: "/TMP/BACKUP-WORK · 2.1G · LEFT BY BACKUP-LOGS"}
    - {from: okafor, text: "It failed, said it hadn't, and left its mess behind. Make it fail out loud, and clean up after itself whatever happens."}
  console_done:
    - {from: meridian, text: "BACKUP-LOGS · FAILED RUN: EXIT 2, NOTHING LEFT IN /TMP · GOOD RUN: ARCHIVE WRITTEN"}
    - {from: mission, text: "Archive test received. Thank you, Meridian."}
  complete:
    - {from: okafor, text: "Now it's fit to run with nobody watching. Which is the point: tomorrow, cron runs it every night."}
---

## Bash carries on after a failure

By default, a command that fails just sets `$?` and **bash carries on with the next line**. A
script whose `cp` fails goes on to archive half the files, and then reports success, because
its exit status is only its last command's. Nothing checks unless you make it.

## `set -euo pipefail`

These three options at the top of a script make failures stop it:

| Option | What it does |
|---|---|
| `set -e` | **stops the script at the first command that fails**, with that command's status |
| `set -u` | treats a variable nobody set as an error, instead of quietly using an empty string |
| `set -o pipefail` | makes a pipeline fail if **any** command in it fails, not just the last |

They're usually written together on one line, `set -euo pipefail`, straight after the shebang.

`set -e` has deliberate exceptions. A failure **doesn't** stop the script when the command is:

- the test of an `if`, `while` or `until`;
- on the left of `&&` or `||`;
- after `!`.

In all of those, the script is already checking the result, so failing is allowed. That's also
how you let one command fail on purpose: `grep -q FAULT log || true`.

## `mktemp`: a temp directory of your own

Never use a fixed name like `/tmp/backup-work`: two runs at once share it, and a run that died
leaves it for the next one to trip over. **`mktemp -d` makes a fresh directory with a unique
name** that only you can read, and prints its path:

```bash
scratch=$(mktemp -d)        # e.g. /tmp/tmp.k3J9x0QaZb
```

`mktemp` with no `-d` makes a file instead.

## `trap … EXIT`: clean up, whatever happens

**A trap on `EXIT` runs as the script ends, however it ends**: at the last line, at an `exit N`,
or when `set -e` or `set -u` stops it. Set it straight after making the thing it cleans up:

```bash
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
```

Use single quotes, so `$scratch` is read when the trap runs, not when it's set.

## Failing loudly

When a script stops, the person reading the log needs to know why:

- **Say what failed and where**, on stderr: `echo "backup: $dest isn't writable" >&2`.
- **Check what you depend on, before you start.** `command -v tar >/dev/null || { echo "backup:
  needs tar" >&2; exit 1; }` fails at once, instead of halfway through.
- **Report success last**, after the thing you made has been checked: with `set -e`, a
  `[ -f "$archive" ]` just before the final `echo` stops the script if the file isn't there.

**ShellCheck** is a linter for shell scripts. It catches unquoted variables, `cd` without a
check and dozens more, before anything runs. It isn't on the station console; on a real machine
it's `apt install shellcheck`, then `shellcheck backup.sh`.

**On the real station:** this app's `test.sh` opens with `set -euo pipefail`, and
`scripts/install_compose.sh`, which every release runs on the droplet, with `set -eu`. The
deploy's own commands run under `set -e`. They dump the database first and check the dump with
`gzip -t` before changing anything, so a bad backup stops the release right there.

## Try it

```bash
cd "$(mktemp -d)"
printf 'cp /nope here/\necho "done"\n' > loose.sh
bash loose.sh; echo "exit $?"           # cp's error, done, exit 0
printf 'set -e\ncp /nope here/\necho "done"\n' > strict.sh
bash strict.sh; echo "exit $?"          # cp's error, exit 1
bash -c 'set -o pipefail; grep x /nope | wc -l; echo "exit $?"'   # grep's error, 0, exit 2
bash -c 'd=$(mktemp -d); trap "rm -rf $d; echo cleaned" EXIT; false; echo never' ; echo "exit $?"   # never, cleaned, exit 0
bash -c 'set -e; d=$(mktemp -d); trap "rm -rf $d; echo cleaned" EXIT; false; echo never' ; echo "exit $?"   # cleaned, exit 1
```
