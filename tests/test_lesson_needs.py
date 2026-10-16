"""#101: everything a console task needs is plainly on the page, and the
lessons describe the console truthfully.

A lesson "says" something when it's in its prose or a table: not only in a
code block's comment, and not only in Try it, which is for a real machine.
The commands a task's solution uses are checked in tests/test_content.py (#80);
NEEDS below are the ideas behind them, which no parser can find, written down
per module with the words the lesson uses for each."""

import html
import re

import pytest

from app.content import load_catalog


def _sections(module) -> list[str]:
    """The lesson's h2 sections before Try it, as HTML."""
    body = module.body_html.split('<h2 id="sec-try-it">Try it</h2>')[0]
    return [s for s in re.split(r"(?=<h2[ >])", body) if s.strip()]


def _text(fragment: str, code_blocks: bool) -> str:
    if not code_blocks:
        fragment = re.sub(r"<pre.*?</pre>", " ", fragment, flags=re.S)
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def _says(module) -> str:
    return " ".join(_text(s, code_blocks=False) for s in _sections(module))


# For each module with a console task: what the task needs, and the words its lesson
# uses to say it (in its prose or a table, before the task).
NEEDS = {
    "the-filesystem": {
        "logs live under /var/log": "/var/log Logs",
        "ls takes a path, so you can look before you move": "lists what's in a directory, without going there",
        "cd takes an absolute path": "`cd` accepts any path, absolute or relative",
        "cat prints a file": "prints a whole file",
    },
    "navigating": {
        "ls -a shows hidden files": "**all** entries, including hidden dotfiles",
        "a hidden file's name starts with a dot": "Any name beginning with `.` is hidden",
        "each .. goes up one level, and needs its slash": "`..` is a step like any other directory name",
        "a relative path goes up and back down": "up two, then down into",
        "a bare cd returns to where the console started": "home is the directory the task starts in",
    },
    "files-and-globs": {
        "mkdir makes the archive directory": "creates one directory",
        "mv moves several files into a directory": "moves **several** files into a directory",
        "the last argument is the destination": "the last one is where it goes",
        "the destination directory must exist first": "must be a directory that already exists",
        "echo previews what a glob matches": "shows exactly the list",
        "narrow a glob by writing more of the name": "Narrow a pattern by writing more of the name yourself",
        "a glob that matches nothing is left as it is": "A pattern that matches nothing is left as it is",
        "rm deletes without a bin": "There is no recycle bin",
    },
    "permissions": {
        "600 is read and write for the owner only": "secrets",
        "u+x adds execute for the owner only": "adds execute for the user (the owner) only",
        "ls -l shows the permission string": "The first column of `ls -l` is ten characters",
    },
    "users-and-sudo": {
        "sudo asks for your own password": "asks for **your own** password",
        "usermod -aG appends, -G replaces": "Without `-a`, `usermod -G` *replaces* your groups",
        "field 7 of /etc/passwd is the shell": "Field 7 is the shell",
        "cut -d: -f7 pulls a field out": "cut the line at each `:` and keep the one you want",
        "> writes a command's output to a file": "`>` writes output to a file",
    },
    "processes-and-signals": {
        "ps can sort the busiest first": "the busiest first",
        "kill and pkill send TERM by default": "SIGTERM to every process whose name matches",
        "pkill -9 sends KILL by name": "SIGKILL by name",
        "check whether TERM worked before KILL": "Check that it worked",
    },
    "pipes-and-redirection": {
        "ls takes several paths": "`ls` takes several paths",
        "errors go to stderr, a separate stream": "they're **separate streams**",
        "> file 2>&1 sends both into one file": "both end up in `out.log`",
        "grep keeps only matching lines": "prints only the lines of FILE that contain WORD",
    },
    "text-tools": {
        "awk prints a field": "splits each line into fields",
        "uniq -c counts adjacent duplicates": "collapses **adjacent** duplicate lines",
        "sort before uniq": "which is why it almost always comes after `sort`",
        "sort -rn ranks by count": "numbers, largest first",
        "the whole top-N pipeline": "rank by count, keep the top ten",
    },
    "environment-and-path": {
        "the first match on PATH wins": "runs the first file with that name",
        "prepend a directory to make it win": "Prepend a directory to make its programs win",
        "~/.bashrc is read by every new shell": "every new interactive Bash shell",
        "append a line with >>": "**Appending** with `>>` matters",
    },
    "reading-and-editing": {
        "man shows a command's page": "the full manual page",
        "SEE ALSO points at the related pages": "SEE ALSO",
        "section 5 is file formats": "file formats",
        "/pattern searches a page": "`/pattern` searches it",
        "sudo nano edits a root-owned file": "Open them with `sudo nano /etc/…`",
        "^O then Enter writes, ^X exits": "write the file",
    },
    "your-first-script": {
        "a script is a file of commands, run top to bottom": "Anything you can type at the prompt, you can put in a file",
        "the shebang is the first line": "It has to be the very first line",
        "#!/usr/bin/env bash is the one to use": "Use `#!/usr/bin/env bash`",
        "a new file needs the execute bit": "A new file isn't executable",
        "chmod +x adds it": "`chmod +x script.sh` adds the execute bit",
        "a script on the PATH runs by name": "To run a script **by name** from anywhere",
    },
    "variables-and-quoting": {
        "an assignment has no spaces around =": "**no spaces** around the `=`",
        "a value with a space needs quotes when assigned": "Assignments need quotes too when the value has a space",
        "unquoted expansions are split at spaces": "It **splits** it into separate words at every space",
        "a redirect needs exactly one word": "fails with **`ambiguous redirect`**",
        "quote every expansion": "put double quotes around every expansion",
        "$( ) puts a command's output in a variable": "runs the command and puts its output in its place",
        "$(( )) adds numbers, without $ inside": "variables don't need their `$`",
    },
    "conditionals": {
        "if runs on a command's exit status": "checks its exit status",
        "[ ] needs spaces": "**needs spaces**",
        "-f tests for a file, and ! turns a test around": "`!` turns any test around",
        "-lt compares whole numbers": "`-lt` (less than)",
        "decimals are compared in tenths": "count in tenths and compare those",
        "the first true branch wins, so test the worst first": "test the most serious one first",
        "exit N ends the script with that status": "**`exit N` ends the script with status N**",
        ">&2 sends an error to stderr": "Error messages go to stderr with `>&2`",
        "VAR=x cmd sets a variable for one run": "**for a single run**",
    },
    "loops": {
        "for runs once per word": "runs the same commands once for each word in a list",
        "a glob gives one word per file, spaces and all": "**one word per file, spaces and all**",
        "quote the loop variable every time": "**quote it every time**",
        "${f##*/} drops the directory": "everything up to the last `/`",
        "${f%.log} drops the extension": "`%` removes a match from the end",
        "continue carries on with the next one": "**carries on with the next one**",
    },
    "arguments-and-input": {
        "$1 is the first argument": "each argument in turn",
        "$# counts the arguments": "how many arguments there are",
        "quotes decide what counts as one argument": "so quotes decide what counts as one",
        "a usage line goes to stderr": "print a **usage** line",
        "exit 2 means used wrongly": "**Exit status 2 is the convention for \"used wrongly\"**",
        "a different failure gets a different number": "give it a different number",
        "${2:-1} gives an optional argument a default": "`days=${2:-1}` is `$2`, or 1 if there isn't one",
    },
    "functions": {
        "a function is called by its name, like a command": "**call it like any command**",
        "$1 inside a function is the function's own": "**the function's own arguments**",
        "local keeps a variable in its function": "**`local` makes a variable belong to the function**",
        "data is echoed and captured with $( )": "prints it with `echo`",
        "yes or no is the exit status": "sets its exit status",
        "a function's status is its last command's": "**the status of its last command**",
        "source runs a library in the current shell": "runs the file **in the current shell**",
    },
    "robust-scripts": {
        "bash carries on after a failure by default": "**bash carries on with the next line**",
        "set -e stops at the first failure": "**stops the script at the first command that fails**",
        "mktemp -d makes a fresh temp directory": "**`mktemp -d` makes a fresh directory with a unique name**",
        "a trap on EXIT runs however the script ends": "**A trap on `EXIT` runs as the script ends, however it ends**",
        "report success last, after checking": "**Report success last**",
    },
    "scheduling-with-cron": {
        "crontab -e / crontab FILE install a crontab": "replaces it with the contents of FILE",
        "the five fields, in order": "**five time fields, then the command**",
        "*/N is every Nth value": "**every Nth value**, a step",
        "cron's PATH lacks your own directories": "Your own directories, like `~/bin`",
        "write full paths": "**Write full paths**",
        ">> log 2>&1 keeps output and errors": "**append both output and errors to a log**",
        "run the job's command by hand first": "run its command by hand exactly as the crontab says",
        # #84: the night's system jobs, found with the unit's own tools
        "system jobs live in /etc/cron.d, not your crontab": "**`crontab -l` never shows these**",
        "a system job's line names its user": "**the user to run as**",
        "ls and cat read them": "every system job, one file after another",
        "grep over several files names each match's file": "**its file's name in front**",
    },
    "addresses-and-ports": {
        "ip addr's inet line is the address with its prefix": "**`inet` line is its IPv4 address, with the prefix**",
        "the default route's via is the gateway": "**default route's `via` is the gateway**",
        "ss -tlnp lists what's listening": "**`ss -tlnp` lists what's listening**",
        "-n shows port numbers, not names": "numbers: show `8080`, not the name `http-alt`",
        "ss -tnp lists established connections": "**`ss -tnp` lists the established connections**",
        "Peer Address:Port is the other end": "**Peer Address:Port** is the other machine's end",
        "other users' processes need sudo": "**The Process column is empty for other users' sockets.**",
        "the Local Address column is the address it listens on": "**Local Address column says which address a program listens on**",
    },
    "names-and-dns": {
        "getent hosts shows what this machine will use": "**`getent hosts NAME` shows the address this machine will really use**",
        "dig shows what DNS says": "**`dig` shows what DNS says**",
        "dig +short prints only the answers": "**`dig +short NAME` prints only the answers**",
        "dig -x is a reverse lookup": "**`dig -x ADDRESS` is a reverse lookup**",
        "/etc/hosts is read before DNS": "**Programs look names up in `/etc/hosts` first, and only then ask DNS.**",
        "editing /etc/hosts needs sudo": "`/etc/hosts` belongs to root, so changing it needs `sudo`",
        "sed -i '/PATTERN/d' deletes matching lines": "**`sudo sed -i '/PATTERN/d' /etc/hosts`**",
        "delete a stale pin rather than correct it": "**Delete a stale pin rather than correcting it**",
    },
    "is-it-reachable": {
        "check the name, the route, the machine, then the port": "Check in order, from the\noutside in",
        "getent hosts prints nothing when there's no address": "or nothing at all (exit status 2) when there isn't one",
        "ip route get shows the way a packet goes": "**`ip route get ADDRESS` shows the way a packet to it would go**",
        "ping -c COUNT": "**`ping -c COUNT HOST`**",
        "a blocked ping proves little": "**A blocked ping proves little.**",
        "nc -zv -w 3 checks a port": "**`nc -zv -w 3 HOST PORT` checks whether PORT on HOST accepts connections**",
        "refused means the host is up and nothing listens": "**the host is up and said no**",
        "timed out means nothing answered": "**nothing answered at all**",
        "Name or service not known means no such name": "**the name doesn't resolve**",
    },
    "finding-things-and-disk-space": {
        "df shows how full the disk is": "how big each filesystem is",
        "du finds what's using it": "how much the files under each PATH add up to",
        "find by size and by age": "changed **more** than 30 days ago",
        "check find's list before -delete": "Run it without `-delete` first",
        "empty a log that's still open": "Empty the file instead",
        "tar -czf makes a compressed archive": "**c**reate, g**z**ipped",
        "tar -tzf lists an archive": "lis**t** what's inside",
        "ln -sf replaces a link": "replacing a link that's already called NAME",
    },
    # Labs (#121) are checked by what's pasted, so no parser reads their steps: NEEDS is
    # the only test that the lesson teaches them.
    "your-first-repository": {
        "install git on your own machine": "`sudo apt update`, then `sudo apt install git`",
        "check whether a name is set": "prints nothing if it isn't set",
        "set a name and email before the first commit": "`git config --global user.name`",
        "git init makes a repository": "`git init` turns the current directory into a **repository**",
        "add, then commit": "**`git add` first, then `git commit`**",
        "an editor to change the file with": "`nano FILE` opens one",
        "an edited file is added again before its commit": "Changes not staged for commit changed since the last commit, but not added yet",
        "commit -m gives the message": "`git commit -m \"message\"`",
        "log --oneline is a line per commit": "`git log --oneline` shows one line each",
        "a clean status means everything is committed": "nothing to commit, working tree clean",
    },
    "staging-and-diffs": {
        "git diff shows what isn't staged": "what you **haven't staged** yet",
        "git add -p asks about each hunk": "shows you its changes a hunk at a time and asks about each one",
        "- is how it was, + is how it is now": "A line starting with `-` is how it was, `+` is how it is now",
        "y stages a hunk": "stage this hunk",
        "n leaves a hunk unstaged, in the file": "don't stage this hunk; it stays in your working tree",
        "check git diff --staged before committing": "**Check `git diff --staged` before every commit.**",
        "git show HEAD prints the last commit": "the last commit: its message, then its diff",
        "status --short: left is the index, right the working tree": "the left is the index, the right is the working tree",
    },
    "reading-history": {
        "git blame names the last commit to change each line": "labelled by the **last commit that changed it**",
        "what blame names may only have touched the line": "Always `git show` the commit blame names",
        "git show HASH prints one commit": "`git show HASH` prints one commit in full",
        "a short hash is enough": "the seven characters `--oneline` shows are enough",
        "git log -S finds where text was added or removed": "**where it was added or removed**",
        "search for what changed, not the line as it reads today": "Search for **what changed**",
        "--oneline is a line per commit": "a line per commit: short hash and message",
        "-S combines with --oneline": "`--oneline` or `-p` to see the result briefly or in full",
        "blame's first column is the hash to show": "That's the commit's short hash",
        "-S searches contents, so search for what a file says (#160)": "It searches what files **contain**, not their names",
    },
    "branches-and-merging": {
        "switch -c makes a branch and switches to it": "creates a branch called NAME, where you are, and switches to it",
        "switch NAME goes back to a branch": "switches to NAME: your files change to match its newest commit",
        "merge from the branch you're landing on": "switch to `main` first, then merge the branch",
        "both moved: a merge commit": "a new commit with **two parents**",
        "--no-edit keeps git's message": "`--no-edit` keeps it without opening the editor",
        "leaving vi": "type `:wq` and Enter",
        "--graph --all draws every branch": "draws every branch, newest at the top",
        "branch -d deletes a merged branch": "deletes the name NAME, if its commits are merged",
    },
    "merge-conflicts": {
        "the top half is your branch, the bottom the one merging in": "the version on the branch **you're on**",
        "the answer can be neither side": "often a third value",
        "delete every marker line": "**Delete every marker line**",
        "an editor to resolve in": "`nano FILE` opens it",
        "git add marks it resolved": "**`git add FILE`** marks it resolved",
        "git commit finishes the merge, -m says how": "**`git commit`** makes the merge commit. Use `-m` to say how you settled it",
        "clean changes merge by themselves": "Changes to **different** parts of a file merge by themselves",
    },
    "remotes": {
        "git clone URL DIR copies a repository": "copies the repository at URL (a web address or a path) into DIR",
        "git remote -v shows where origin points": "lists the remotes and where they point",
        "git push sends your commits": "sends your branch's new commits to the remote",
        "git fetch changes none of your files": "**without touching your files**",
        "git pull is fetch then merge": "`git fetch`, then merges what it fetched into your branch",
        "status -sb: ahead means push, behind means pull": "one commit you haven't pushed",
        "fetch before trusting status": "**`git fetch` before you trust it**",
        "sh FILE runs a script that isn't executable": "runs with `sh FILE`, even when it isn't executable",
    },
    "undoing-things": {
        "git reflog lists every commit HEAD was on": "lists **every commit `HEAD` has been on**",
        "reset --hard HASH brings a lost commit back": "**`git reset --hard HASH`** moves your branch back to it",
        "only if nothing's been committed since": "If nothing has been committed since",
        "git revert makes a new, opposite commit": "makes a **new commit that does the opposite** of HASH",
        "--no-edit keeps revert's message": "`--no-edit` keeps it",
        "revert is the safe undo for pushed work": "the safe way to undo anything already pushed",
        "reset --hard throws away what's after HASH": "**thrown away**, files and all",
    },
    "working-together": {
        ".gitignore lists what to keep out": "lists them, one pattern per line, and is committed",
        "a directory pattern ends in /": "a directory called `build`, and everything in it",
        "status --ignored --short lists ignored files": "lists them with `!!`",
        "a second -m is the body": "each `-m` is a paragraph",
        "the body says why": "**why**: the reason, which the diff can't show",
        "subjects are imperative and capitalised": "**imperative and capitalised**",
        "one change per commit": "One change per commit",
        "git rebase main replays the branch on top": "replays your commits **on top of** where `main` is now",
        "rebase is run from the branch": "run on your branch, replays your commits",
        "main.. and the %s/%b format": "`git log main..` lists the commits on your branch that `main` doesn't have",
    },
}


def _modules_with_tasks():
    """Every module with a console task or a lab."""
    return [m for m in load_catalog().ordered_modules() if m.terminal or m.lab]


@pytest.mark.criterion(101, "Every console task's needs are written down")
def test_every_console_task_has_its_needs_written_down():
    assert {m.slug for m in _modules_with_tasks()} == NEEDS.keys()


@pytest.mark.criterion(101, "Nothing a task needs is only in a code comment or Try it")
@pytest.mark.parametrize("module", _modules_with_tasks(), ids=lambda m: m.slug)
def test_the_lesson_says_what_its_task_needs(module):
    says = _says(module)
    from app.content.render import render_inline

    for need, words in NEEDS[module.slug].items():
        plain = _text(str(render_inline(words)), code_blocks=True)
        assert plain in says, f"{module.slug}: the lesson doesn't plainly say that {need} (looked for {plain!r})"


# What the station console doesn't have, as a lesson would mention it. A section that
# mentions one must also say "station console", so nobody tries it there and wonders why.
CONSOLE_LACKS = {
    "Ctrl-R": r"Ctrl-R",
    "ls -t": r"\bls -t\b",
    "Ctrl-Z": r"Ctrl-Z",
    "grep -r": r"\bgrep -r\b",
    "grep -C": r"\bgrep\b[^\n]*-C \d",
    "tail -f": r"\btail -f\b",
    "less +F": r"\bless \+F\b",
    "nano's ^W": r"\^W",
    "top": r"(?<![\w-])top(?= +# |\s*\|| *$)|<code>top</code>",
}


@pytest.mark.criterion(101, "The console is described truthfully")
@pytest.mark.parametrize("module", load_catalog().ordered_modules(), ids=lambda m: m.slug)
def test_lessons_say_when_the_console_lacks_something(module):
    for section in _sections(module):
        text = _text(section, code_blocks=True) + " " + section
        for what, pattern in CONSOLE_LACKS.items():
            if re.search(pattern, text, flags=re.M):
                assert "station console" in text, f"{module.slug}: mentions {what}, which the console lacks, without saying so"
    assert "doesn't have `less`" not in module.body_html and "have <code>less</code> yet" not in module.body_html
