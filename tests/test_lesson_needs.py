"""#101: everything a console task, lab or challenge (#397) needs is plainly on
the page, and the lessons describe the console truthfully.

A lesson "says" something when it's in its prose or a table: not only in a
code block's comment, and not only in Try it, which is for a real machine.
The commands a task's solution uses are checked in tests/test_content.py (#80);
NEEDS below are the ideas behind them, which no parser can find, written down
per module with the words the lesson uses for each."""

import html
import re
from types import SimpleNamespace

import pytest

from app.content.render import render_inline
from tests.conftest import real_catalog


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


# For each module with a console task, a lab or a challenge: what the task needs, and the words
# its lesson uses to say it (in its prose or a table, before the task). One entry covers all of a
# module's tasks. text-tools is the one module with a challenge beside a console task: its entry is
# for the console task, because that challenge is a bonus whose own text says what it uses (#241).
NEEDS = {
    "the-filesystem": {
        "logs live under /var/log": "/var/log Logs",
        "ls takes a path, so you can look before you move": "lists what's in a directory, without going there",
        "cd takes an absolute path": "`cd` accepts any path, absolute or relative",
        "cat prints a file": "prints a whole file",
        "cd prints nothing; the prompt shows where you are": "**`cd` prints nothing when it works**",
        "a bare file name is a relative path": "A file's name on its own is a relative path too",
    },
    "navigating": {
        "ls -a shows hidden files": "**all** entries, including hidden dotfiles",
        "a hidden file's name starts with a dot": "Any name beginning with `.` is hidden",
        "each .. goes up one level, and needs its slash": "`..` is a step like any other directory name",
        "a relative path goes up and back down": "up two, then down into",
        "a bare cd returns to where the console started": "home is the directory the task starts in",
        "the dot is part of a hidden file's name": "**The dot is part of the name.**",
        "a relative path climbs to the shared directory, then down": "go up with `..` until you reach a directory both paths share",
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
        "a glob can have a path in front of it": "unless you put a path in front of it",
        "a trailing slash means into an existing directory": "means \"into the directory `backup`\"",
    },
    "permissions": {
        "600 is read and write for the owner only": "secrets",
        "u+x adds execute for the owner only": "adds execute for the user (the owner) only",
        "ls -l shows the permission string": "The first column of `ls -l` is ten characters",
        "read the string in threes": "**Skip the first character, then read the rest in threes**",
        "each digit adds 4, 2 and 1": "**To turn letters into a digit, add up the values of the letters that are there.**",
        "stat -c shows the mode as a number": "**`stat -c '%a %A %n' FILE` prints a file's mode both ways**",
        "a number replaces all three classes": "**An octal mode sets all three classes, including\nthe ones you weren't thinking about. A symbolic one changes only what it names.**",
        "look before you change it": "**look at the mode before you change it**",
        "chmod prints nothing when it works": "**`chmod` prints nothing when it works**",
        "you own the task's files, and u is the owner": "you own the files in the task",
        "a file's mode is its permissions": "A file's **mode** is what each of those three may do with it",
        "a new number changes only that class's digit": "**To change one class with a number, change only that class's digit**",
        "stat takes several files": "Give it several names, or a glob like `*`",
    },
    "users-and-sudo": {
        "sudo asks for your own password": "asks for **your own** password",
        "usermod -aG appends, -G replaces": "Without `-a`, `usermod -G` *replaces* your groups",
        "grep picks out the lines that contain a word": "prints only the lines of FILE that contain TEXT",
        "field 7 of /etc/passwd is the login shell": "Field 7 is the login shell",
        "a login shell is what runs when the account logs in": "the program that runs when this account logs in",
        "service accounts usually have nologin": "its login shell is usually **`/usr/sbin/nologin`**",
        "an account and a group can share a name": "two separate things that happen to share a name",
        "groups shows the login's groups until the next login": "plain `groups` and `id` show the groups you logged in with",
        "-d: names the separator, -fN the field": "**`-d:`** says the fields are separated by `:`",
        "usermod -aG takes the group, then the user": "the group comes first, then the user",
        "usermod prints nothing when it works": "**`usermod` prints nothing\nwhen it works**",
        "the sudo group lets you use sudo": "membership of the `sudo` group is enough",
        "groups NAME shows the change now": "`groups NAME` and `id NAME` read `/etc/group` as it is now",
        "cut -d: -f7 pulls a field out": "cut the line at each `:` and keep the one you want",
        "> writes a command's output to a file": "`>` writes output to a file",
    },
    "processes-and-signals": {
        "ps can sort the busiest first": "the busiest first",
        "kill and pkill send TERM by default": "SIGTERM to every process whose name matches",
        "pkill -9 sends KILL by name": "SIGKILL by name",
        "check whether TERM worked before KILL": "Check that it worked",
        "$? holds the last command's exit status": "The shell keeps the last command's exit status in a variable named `?`",
        "kill and pkill print nothing when they work": "**`kill` and `pkill` print nothing when they work.**",
        "pgrep and pkill match part of the name": "match any part of the name",
        "you can only signal your own processes": "**You can signal only your own processes.**",
        "a process's name is its program's file name": "A process's **name** is its program's file name",
        "pgrep prints nothing when nothing matches": "**`pgrep` prints nothing when\nno process matches**",
        "an ignored signal doesn't end the process": "an ignored\nsignal does nothing, and the program carries on",
    },
    "pipes-and-redirection": {
        "ls takes several paths": "`ls` takes several paths",
        "errors go to stderr, a separate stream": "they're **separate streams**",
        "> is short for 1>": "**`>` is short for `1>`**",
        "> file 2>&1 sends both into one file": "In the first line both end up in `out.txt`",
        "2>&1 means stderr goes where stdout goes now": "send channel 2 to wherever channel 1 is going **right now**",
        "redirections are read left to right": "redirections **left to right**",
        "grep keeps only matching lines": "prints only the lines of FILE that contain WORD",
        "> creates the file if it's missing": "**`>` and `>>` create the file if it isn't there**",
        "> on an existing file replaces it": "**`>` empties it without asking**",
        "ls heads a directory's names with its name": "the listing gets a\nheading, the directory's name and a colon",
        "the error prints first": "`ls` checks every path it's\ngiven before it lists any",
        "ls writes one name per line into a file": "**one\nname per line**",
        "> works on grep's output too": "`grep` (module 05) and `>` together keep just the lines you want",
    },
    "text-tools": {
        "awk prints a field": "splits each line into fields",
        "uniq -c counts adjacent duplicates": "collapses **adjacent** duplicate lines",
        "sort before uniq": "which is why it almost always comes after `sort`",
        "sort -rn ranks by count": "numbers, largest first",
        "the whole top-N pipeline": "rank by count, keep the top five",
        "uniq -c writes the count first": "`uniq -c` writes **the count first**",
        "sort -n reads the number at the start of a line": "reading the number at the start of each line",
        "a space delimiter is quoted": "the space has to be quoted, **`-d' '`**",
        "awk's program goes in single quotes": "**The quotes stop the shell\ntreating `$1` as one of its own variables**",
        "the address is field 1 of an access-log line": "the **client's address**",
    },
    "environment-and-path": {
        "the first match on PATH wins": "runs the first file with that name",
        "prepend a directory to make it win": "Prepend a directory to make its programs win",
        "~/.bashrc is read by every new shell": "every new interactive Bash shell",
        "append a line with >>": "**Appending** with `>>` matters",
        "directories on PATH are separated by :": "list of directories, **separated by `:`**",
        "$PATH in the new value keeps the old list": "`$PATH` is the old list",
        "type -a lists every match in order": "every NAME on the PATH, in search order",
        "no spaces around =": "**No spaces around `=`.**",
        "leaving out :$PATH loses the old list": "**Leave out `:$PATH` and the old list is gone.**",
        "single quotes write the line as typed": "goes into the file exactly as typed",
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
    "http-by-hand": {
        "install curl on your own machine": "`sudo apt install\ncurl`",
        "curl -I prints only the headers": "**sends `HEAD` and prints only the response's headers**",
        "curl -v shows the whole conversation": "**shows the whole conversation**",
        "the status line comes first": "with a **status line** first",
        "Content-Type says what the body is": "**what kind of data the body is**",
        "Location says where a redirect goes": "**where a redirect goes**",
        "curl follows redirects only with -L": "**curl doesn't follow\na redirect unless you give it `-L`**",
        "-w prints what you ask for after the transfer": "**after the transfer, prints what you ask for**",
        "%{url_effective} is where curl ended": "**`%{url_effective}`** is the address curl ended at",
        "-o /dev/null throws the body away": "`-o /dev/null` throws it away",
    },
    "apis-and-json": {
        "install jq": "install it with `sudo apt\ninstall jq`",
        ".field takes an object's field": "**an object's field**",
        ".[] gives each element of an array": "**each element of an array, in turn**",
        "-r prints strings as plain text": "**`jq -r` prints strings as plain text.**",
        "select keeps the ones that match": "**`select(CONDITION)` keeps only the things for which the condition is true**",
        "== compares": "**`==`** (equal: two `=`)",
        "a query string follows ?": "That's the **query string**",
        "per_page asks for fewer or more": "unless **`per_page`** says otherwise",
        "quote a URL with a query string": "**Put a URL with a query string in quotes**",
    },
    "tls-and-certificates": {
        "s_client opens a TLS connection": "**`openssl s_client -connect HOST:443 -servername HOST`** opens a TLS connection",
        "openssl x509 reads a certificate": "**`openssl x509`** reads\na certificate",
        "-servername sends the name as SNI": "**the name to send as SNI**",
        "-noservername sends no name": "send no name at all",
        "-subject -issuer -dates": "**who it's for, who signed it, and when it's valid**",
        "-checkend SECONDS": "**says whether it will still be valid that many seconds from now**",
        "SNI puts the name in the handshake": "**puts the site's name in the TLS handshake**",
        "no name gets the default certificate": "**A client that sends no name gets the server's default certificate**",
    },
    "ssh-keys": {
        "ssh-keygen makes a key pair": "**`ssh-keygen` makes a key pair.**",
        "-t ed25519 is the type": "**the type**: ed25519",
        "-C sets the comment": "**a label** stored with the public key",
        "-f says where to save it": "**where to save it**",
        "ssh-keygen -lf prints a fingerprint": "**`ssh-keygen -lf FILE` prints a key's fingerprint**",
        "-f - reads standard input": "with **`-f -`** it reads\nthe key from standard input",
        "ssh-keyscan fetches a host key": "**`ssh-keyscan HOST`** asks a server for its host keys",
        "~/.ssh/config gives a host a name": "**`~/.ssh/config` gives a host a short name and its settings**",
        "HostName is the real address": "**the real address or name to connect to**",
        "IdentityFile is the key": "**the private key to use**",
        "ssh -G prints the settings": "**`ssh -G HOST` prints every setting ssh would use for HOST, without connecting**",
        "filter ssh -G with grep -E": "Filter\nit with `grep -E`",
    },
    "copying-and-tunnels": {
        "rsync copies only what differs": "**`rsync` copies only what differs**",
        "-a is archive mode": "**archive mode**",
        "-v lists each file": "**list each file it transfers**",
        "-n is a dry run": "**dry run: show what it would do, change nothing**",
        "--delete removes what isn't in the source": "**remove from the destination anything that isn't in the source**",
        "the trailing slash on the source": "**The trailing slash on the source changes what's copied**",
        "dry-run --delete first": "**Always dry-run an rsync with `--delete` first**",
        "ssh -L carries a connection": "listens on your machine's port LOCAL, and sends each connection through",
        "LocalForward in ~/.ssh/config": "**`LocalForward LOCAL HOST:PORT`** is `-L`",
        "install rsync": "`sudo apt install rsync`",
    },
    "firewalls": {
        "incoming is denied unless a rule allows it": "**nothing gets in unless a rule allows it**",
        "listening isn't reachable": "**a service can be listening on `0.0.0.0` and still unreachable**",
        "test from another machine": "**test from another machine**",
        "ssh OTHER 'COMMAND' runs the test there": "runs the test there\nand prints its answer here",
        "ufw status shows the rules": "**`sudo ufw status` says whether the firewall is on, and lists its rules.**",
        "status numbered numbers them": "**`sudo ufw status numbered`\nnumbers the rules**",
        "allow one host to one port": "**TCP port 5432 from `10.6.0.8` only**",
        "the first rule that matches decides": "**The first rule that matches decides.**",
        "ufw delete RULE": "**`sudo ufw delete RULE` removes a rule, written the way it was added**",
        "don't turn the firewall off": "**Don't fix a firewall by turning it off.**",
    },
    "following-a-connection": {
        "the peer column is the other end": "**Peer Address:Port: the other machine's end**",
        "ss -p names only your own processes": "**As a normal user, the Process column is empty for every socket that isn't yours.**",
        "sudo ss -tnp names them all": "**`sudo ss -tnp` names them all**",
        "dig -x names an address": "**`dig -x ADDRESS +short` asks for the address's PTR record**",
        "a PTR record is only a claim": "**a PTR record is only a claim**",
        "look the name up to check it": "**check it the other way: look the name up, and see whether it\ngives the same address back**",
        "compare with the expected machine's address": "**`dig NAME +short` for the machine you expected, and see whether the\naddresses match**",
        "curl -v shows the Server header": "**The `Server:` header is what the server says it is**",
        "use the name, not the address": "Use the name, not the address",
        "write it down before stopping anything": "**Killing the process closes its\nconnection, and the peer, the PID and the command line go with it.**",
    },
    "services": {
        "list-units lists every service, one row each": "lists them all, one row each",
        "--all brings the inactive ones back": "**Without `--all`, inactive units are left out.**",
        "--failed lists only the failed ones": "**only the failed units**",
        "the ACTIVE column is the state": "The **ACTIVE** column is the state",
        "the DESCRIPTION column is the description": "the **DESCRIPTION** column is the text after the dash",
        "inactive is a state worth reporting": "**`inactive` complains about nothing.**",
        "failed means it went wrong": "**`failed` is systemd telling you something\nbroke**",
        "status takes a name without .service": "You can leave `.service` off a name",
        "a unit's full name ends in its type": "its type is the end of its name",
    },
    "start-stop-enable": {
        "running now and starting at boot are separate": "**`start` doesn't enable, and `enable` doesn't start.**",
        "a service you keep needs both": "A service you want to keep\nneeds both",
        "--now enables and starts in one go": "**`--now` does both at once**",
        "start brings a failed service back": "`start` also\nbrings back a **failed** service",
        "stop is how to end a service": "stops it: systemd sends its program TERM",
        "disable removes the boot link": "`disable` removes the link",
        "changing a service needs sudo": "so put `sudo` in front",
        "they print nothing; check with is-active": "**They print nothing when they work.** Check with `is-active`",
        "is-enabled says enabled or disabled": "usually prints `enabled` or `disabled`",
        "is-active takes several names at once": "Both take several names at once, one answer per line",
        "enable and disable print no link line when there's nothing to change": "there's no `Created symlink`\nor `Removed` line",
    },
    "unit-files": {
        "systemctl cat prints the unit file in use": "prints the one systemd is using",
        "its first line is the path": "with its path on a `#` line first",
        "ExecStart's first word is the program": "the program's full path first, then\nits options",
        "no User= means root": "With no `User=` line, it runs as root.",
        "Requires= is the dependency": "**start UNIT too, and depend on it**",
        "Wants= isn't a dependency": "**start UNIT too**, and carry on whether it works or not",
        "/etc beats /usr/lib": "a file here with the same name is used instead",
        "the path shows which copy is in use": "says which copy is in use",
        "listing /etc/systemd/system shows the admin's copies": "Listing `/etc/systemd/system` shows every copy an\nadministrator made",
    },
    "writing-a-service": {
        "your unit goes in /etc/systemd/system": "A unit file you write goes in **`/etc/systemd/system/`**",
        "sudo nano writes a root-owned file": "opens the file in nano as root",
        "nano: Ctrl-O and Enter, then Ctrl-X": "Ctrl-O and Enter to write it, and Ctrl-X to\nexit",
        "echo | sudo tee -a appends as root": "appends a line to a root-owned file",
        "tee without -a starts the file afresh": "without `-a`, `tee` starts the file afresh",
        "tee prints each line back": "It\nprints each line back as it writes it",
        "Restart= and RestartSec= go in [Service]": "**`Restart=` and `RestartSec=` go in `[Service]`**",
        "a key in the wrong section is ignored": "systemd ignores a key\nin the wrong section",
        "on-failure skips a clean exit, so not always": "**Use `on-failure` for a program that should stay down once it has finished cleanly**",
        "a restart changes the Main PID and since time": "compare the `Main PID` and the `since` time",
        "ExecStart is the program's full path": "the program, by its full path",
        "User= is its own account": "its own account",
        "Environment= sets a variable": "a setting in the program's environment",
        "WantedBy= is what enable needs": "**what lets `enable` work**",
        "on-failure restarts after a crash": "a crash, or an exit with a non-zero status",
        "RestartSec= is the wait": "is how long to wait first, in seconds",
        "daemon-reload finds the new file": "systemd reads the unit files again and finds yours",
        "enable --now starts it and keeps it": "the boot link, and a start",
    },
    "timers": {
        "cron.d jobs: five time fields, then the account": "five time fields, the account to run it\nas, then the command",
        "cron's minute comes first": "**Cron puts the minute first**",
        "cron's day 1 is Monday": "**`1` is Monday through `6` Saturday; Sunday is `0` or `7`**",
        "the account field is who it runs as": "**who it runs as**",
        ">/dev/null 2>&1 throws output away": "**output and errors, both\nthrown away**",
        "a timer is a .timer and a .service": "`NAME.timer` says when, and `NAME.service` says what.",
        "Type=oneshot is a job that finishes": "**a job that runs and finishes**",
        "the service has no [Install]": "**the timer starts it, so you never enable the service**",
        "WantedBy=timers.target lets enable work": "**what lets `enable` work for a timer**",
        "OnCalendar's form, and the day names": "**A day of the week, if you want one: `Mon Tue Wed Thu Fri Sat Sun`.**",
        "*-*-* is every day": "**`*-*-*` is any year, any month, any day**",
        "OnCalendar and Persistent go under [Timer]": "**A timer file has its own section, `[Timer]`**",
        "OnCalendar can't read a cron line": "**`OnCalendar=` can't read a cron line**",
        "Persistent=true catches up": "it runs once as soon as the timer starts again",
        "enable the .timer, written in full": "**Write the `.timer`**",
        "list-timers shows it": "**`systemctl list-timers`** lists the running timers",
        "delete the cron file": "**Moving a job from cron? Delete its cron file**",
        "a service's output goes to the journal": "**goes to the journal**",
        "ExecStart doesn't run a shell": "**`ExecStart=` doesn't run a shell**",
    },
    "the-journal": {
        "reading the journal needs root or adm": "**Reading the whole journal needs root, or the `adm` or `systemd-journal` group.**",
        "so use sudo journalctl": "So use **`sudo journalctl`**",
        "cron logs the job it starts": "**Cron logs each job it starts as `CRON[PID]: (USER) CMD (COMMAND)`**",
        "with no -u, every unit's lines": "**With no `-u`, you get\nevery unit's lines**",
        "--since and --until make a window": "**lines from TIME on**",
        "a time is a date and a time, quoted": "**A time is `\"YEAR-MONTH-DAY HOURS:MINUTES\"`, in quotes because of the space**",
        "the console booted at 08:00": "**The station console booted\nat 08:00**",
        "-b -1 is the previous boot": "**`-b -1` the boot\nbefore**",
        "sudo journalctl > FILE saves it": "**`sudo journalctl … > FILE` saves it.**",
        "a cron.d file is a job only while it's there": "**A file in `/etc/cron.d` is a job only while it's in that directory.**",
        "sudo mv takes a job out, keeping the file": "**`sudo mv`**, and its job stops running, with the file kept as it was",
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
    "from-bash-to-python": {
        "text must be converted before arithmetic": "**convert it before doing arithmetic**",
        "int() makes a whole number from text": "the whole number `12`",
        "float() makes a decimal number from text": "the number `2.5`",
        "* multiplies numbers": "`+ - * /`",
        "an f before the quote fills in braces": "**`f` right before the opening quote**",
        "a value's spacing is kept": "Python keeps a value exactly as it is",
        "a variable is read by its name alone": "**You read a variable by its name alone**",
        "a converter takes a variable and = keeps its result": "**A converter takes a variable as readily as a quoted value, and `=` keeps its result**",
        "an int and a float give a float": "**An `int` and a `float` together give a `float`**",
        "brackets hand a value to print": "**The brackets hand it the value to work on.**",
        "the editor shows only what's printed": "**A script or the editor shows only what you `print`**",
        "a traceback's bottom line says what went wrong": "**Read its bottom line first**",
    },
    "lists-dicts-and-loops": {
        "len counts a list": "**`len()` counts what's in it.**",
        "sorted makes a new list to keep": "**`sorted(codes)` makes a new list in order**",
        ".append adds to a list": "**`.append()` adds an item to the end.**",
        "for runs a block per item": "**`for` runs a block once for each item**",
        "indentation is the block": "**The line ends in `:` and the block is the indented lines under it**",
        "brackets read and set a key": "**Square brackets read a key, and assigning to one sets it**",
        ".get gives a default": "**`.get()` asks instead**",
        "looping over or sorting a dict gives keys": "**a loop over the keys**",
        "sum adds up a dict's values": "**`sum()` can add up**",
        "adding up by key": "**Assigning it back** stores the new count",
        "add an amount instead of 1": "To add up an amount instead of counting, add that amount instead of 1.",
        "text sorts alphabetically": "**Numbers sort by value, and text sorts alphabetically.**",
        "a list is filled in a loop": "**A list is often started empty and filled in a loop:**",
        "a key can be a variable": "**The key in the brackets can be a variable.**",
        "a dict keeps the order keys were added": "**A dict keeps its keys in the order they were added**",
        "sorted gives a dict's keys": "**the keys, as a new list in order**",
        "a loop takes each record in turn": "**Loop over the list to take each record in turn, and read its values by key:**",
        "records may lack a key": "**Records don't all have the same keys, so `.get()` is the safe way to read one that might be missing.**",
        "a record gives both the key and the amount": "**With records, the key comes from one field and the amount from another.**",
    },
    "conditions-functions-and-imports": {
        "if runs a block": "**`if` runs a block when its condition is true**",
        "the first true condition wins": "**The conditions are tried from the top, and only the first true one runs**",
        "== compares": "**Two `=` to compare**",
        "> is strict": "**greater than**, and strictly so",
        "truthiness can't tell 0 from nothing": "**But it can't tell `0` from nothing**",
        "None is nothing at all": "**`None` is Python's value for nothing at all**",
        "is None asks about that alone": "**To ask about that alone, write `is None`**",
        "test for None before comparing": "Comparing `None` with a number stops with a `TypeError`, so test for it first.",
        "def defines a function": "**`def` defines a function**",
        "a parameter holds what's passed in": "a variable that holds whatever the caller passes in",
        "return hands back and ends": "**`return` hands a value back to the caller and ends the function**",
        "print isn't return": "**`print` only shows a value to a person; the caller can't use it.**",
        "a function can use another's answer": "**A function can call another function and use what it returned**",
        "a value can be the condition": "**a value can be the condition by itself**",
        ".get with no default gives None": "`.get()` gives it back when a key is missing",
        "put the narrower test first": "so put the narrower test first",
        "... is a placeholder": "`...` as a placeholder",
        "import and the dot": "**`import` brings one in, and a dot reaches what's inside it.**",
        "math.ceil rounds up": "**`math.ceil()` rounds up to the next whole number**",
    },
    "parsing-text": {
        "split() splits at any run of whitespace": "**`.split()` with nothing in the brackets splits at any run of whitespace**",
        "a split gives a list read by position": "It gives back a list, so the fields are read by position, from 0",
        "split(sep) cuts at each one exactly": "**Given a separator, `.split()` cuts at each one exactly**",
        "a field is text until converted": "**use `float()` or `int()` on a field to get a number**",
        "strip removes whitespace at the ends": "**`.strip()` removes the whitespace from both ends of a string**",
        "a string method gives back a new string": "gives back a new string, so keep it",
        "startswith tests the beginning": "**`.startswith()` is true when the string begins with the text you give it**",
        "in finds text anywhere": "**`in` on a string finds the text anywhere in it**",
        "a comment that mentions a scanner isn't a reading": "a comment that mentions a pump would pass for a pump reading",
        "re.search finds a pattern anywhere": "**`re.search(pattern, text)` looks for the pattern anywhere in the text**",
        "\\d is a digit": "**one digit**",
        "[A-Z] is a capital letter": "**one capital letter**",
        "[\\d.] is a digit or a dot": "**one digit or one dot**",
        "+ repeats": "**one or more of the piece before it**",
        "a group captures": "**a group**: it captures the text matched inside it",
        "group(1) is the first group's text": "**`.group(1)` gives the text that the first group matched**",
        "a group is a string": "It's always a string, so `float()` it for a number.",
        "re.search gives None when it finds nothing": "**When the pattern isn't there, `re.search` gives back `None`**",
        "test for None before .group": "**Test `if match is None:` before using a match**",
        "a pattern is a raw string": "**Write a pattern as a raw string, with `r` before the quote**",
        "split when fields stay put, search when they move": "**Search when the words move around**",
        "recognise the kind, then parse it": "recognise each line's kind with `startswith`, then use whatever suits that kind",
        "a found pattern gives a match": "**When it finds it, it gives back a match**",
        "- in square brackets is a range": "**a `-` between two characters there means every character from one to the other**",
        "or joins several None tests": "one `if` can ask about them all with `or`",
        "is not None keeps what was found": "**`is not None` asks the opposite.**",
    },
    "files-and-paths": {
        "open gives a file object": "**`open()` opens a file and gives back a file object**",
        "with closes the file": "**`with` matters because it closes the file when the block ends, even if an error stops the code inside it.**",
        "a for loop reads line by line": "**A `for` loop over a file object gives you one line at a time**",
        "each line keeps its newline": "**Each line still ends with its newline, `\\n`**",
        "strip before testing": "**Strip each line before you test it**",
        "continue skips a line": "**As in Bash, `continue` skips the rest of this pass and goes on to the next item**",
        "w creates or empties": "**empties it if it's already there**",
        "write adds no newline": "**`.write()` writes exactly the text you give it, and no newline of its own**",
        "open once, before the loop": "**Open the file once, before the loop.**",
        "from pathlib import Path": "**`from pathlib import Path` brings in just the name `Path`**",
        "Path and /": "**`Path(\"logs\")` makes a path, and `/` joins one to the next**",
        "open takes a Path": "**`open()` takes a `Path` as readily as a string.**",
        "stem is the name without its ending": "**the name without its ending**",
        "glob matches names": "**every path in `folder` whose name matches**",
        "glob's order isn't fixed, so sort": "**`glob` gives the paths in no particular order, so wrap it in `sorted()`**",
        "not in is the reverse": "**`not in` asks the reverse of `in`**",
        "no mode means read": "**With no mode after the path, `open()` reads the file**",
        "split()[0] is the first field": "**`line.split()[0]` reads the first field straight from the list that `.split()` gives back**",
        "stem takes no brackets": "**`name`, `stem` and `suffix` take no brackets: they're facts the path already holds**",
        "collect one file's names, check another against them": "Collect one file's names into a list first, and `not in` checks another file against it.",
    },
    "errors-and-exit-codes": {
        "read a traceback from the bottom": "**Read it from the bottom up.**",
        "the last line is the type and message": "**The last line is the error's type and its message**",
        "ValueError is a value it can't use": "**the right type of value, but a value it can't use**",
        "AttributeError is a missing method": "**a method the value hasn't got**",
        "try and except ValueError": "**`try` runs a block, and `except ValueError:` runs instead if that error happens inside it.**",
        "the script carries on after the try": "the script carries on after the whole `try`",
        "keep the try small": "**Keep the `try` block small, around the line that can fail**",
        "name the error you expect": "**Name the error you expect.**",
        "an unexpected error should stop the script": "**An error you didn't expect should stop the script**",
        "raise stops a function with an error": "**`raise ValueError(\"message\")` stops a function with an error, exactly as if Python had found one**",
        "raise rather than a made-up value": "**When a function can't do its job, raise, rather than give back a made-up value.**",
        "len counts the fields": "`len()` counts the fields it gave back",
        "sys.exit is Bash's exit": "**`sys.exit(N)` is Python's version of Bash's `exit N`**",
        "main gives back the exit status": "**gives back the exit status**",
        "__name__ is __main__ when run": "**`__name__` is `\"__main__\"` when Python runs the file itself**",
        "the guard runs main only as a script": "**the guard runs `main` only when the file is run as a script**",
        "other errors still stop the script": "**Any other error inside the `try` isn't caught: it stops the script with its traceback, as if the `try` weren't there.**",
        "a frame is where": "Each **frame** is two lines",
        "import your own file": "**Your own file imports the same way as the standard library's: `import report` loads `report.py` from the folder you're in, and `report.main()` calls its function**",
        "the editor runs it as a script": "**The editor below the lesson runs your code as a script**",
        "sys.exit(main()) hands main's status to sys.exit": "**The guard is `if __name__ == \"__main__\":`, and `sys.exit(main())` runs `main` and hands what it gives back to `sys.exit` as the exit status.**",
        "pass main's parameter in the call": "If `main` takes a parameter, pass it in the brackets",
    },
    "json-and-csv": {
        "json.loads turns text into values": "**`json.loads()` turns JSON text into Python values**",
        "json.dumps turns them back": "**`json.dumps()` turns them back into text**",
        "an object is a dict, an array a list": "**a dict**",
        "json.load and json.dump work on files": "**For a file, drop the `s`: `json.load(f)` reads from a file you've opened, and `json.dump(value, f)` writes to one**",
        "JSON has no sets": "**JSON has nothing like a set.**",
        "sorted turns a set into a list": "**turn a set into a list with `sorted()` before writing it**",
        "read nested data one step at a time": "**Read it one step at a time, left to right**",
        "a loop inside a loop": "**A loop inside a loop walks a list inside a list**",
        "DictReader gives a dict per row": "**`csv.DictReader` reads it one row at a time, each row a dict keyed by the header's names**",
        "every CSV value is a string": "**Every value is a string**",
        "a set has no order and no duplicates": "**no order and no duplicates**",
        "set() is empty": "**`set()` is an empty set**",
        "add puts a value in": "**`.add()` puts a value in**",
        "set(d) is the keys": "**`set(d)` makes a set of a dict's keys.**",
        "sets compare by members": "**`==` asks \"the same values?\", whatever order they came in**",
        "a - b is in a not b": "**what's in `ordered` and not in `counted`**",
        "a | b is in either": "**what's in either**",
        "start each key's set the first time": "start each key's set the first time you meet it",
        "dates sort in date order": "**Dates written `YYYY-MM-DD` sort as text into date order**",
        "a setting by name": "**`indent=2` hands the call an extra setting by name**",
        ".get with an empty set": "**When a key might be missing from one of two dicts, `.get(key, set())` gives an empty set instead**",
    },
    "running-commands": {
        "subprocess.run runs a command": "**`subprocess.run()` runs one command and waits for it to finish.**",
        "the command is a list": "**The command is a list: the program first, then each argument as its own string**",
        "no shell in between": "**There's no shell in between**",
        "returncode is the exit status": "**`.returncode` is the command's exit status**",
        "capture_output keeps output": "**`capture_output=True` keeps what it prints instead, in `.stdout` and `.stderr`**",
        "text makes strings": "**`text=True` makes them strings**",
        "strip the output": "**`.strip()` it**",
        "errors are on stderr": "Programs print their complaints on **stderr**",
        "splitlines gives the lines": "**`.splitlines()` gives a string's lines as a list**",
        "cwd runs it in a folder": "**`cwd`, short for current working directory (Unit 1.1, *Navigating*), runs the command in the folder you name**",
        "a failure doesn't stop the script": "**A command that fails doesn't stop your script.**",
        "check=True raises CalledProcessError": "**`check=True` makes a non-zero exit status raise `subprocess.CalledProcessError`**",
        "a missing program raises FileNotFoundError": "**A program that isn't there raises `FileNotFoundError` before anything runs**",
        "a list keeps a value whole": "**With a list there's no shell to read the `;`, so the whole value is one argument**",
        "never shell=True with outside input": "**Keep to lists, and never use `shell=True` with a value you didn't write yourself.**",
        "sys.executable is this Python": "**`sys.executable` is the path of the Python running your script**",
        "the error carries returncode": "**The error carries the same facts: `error.returncode`**",
        "without capture_output stdout is None": "**Without `capture_output=True`, `.stdout` is `None`**",
        "-c runs a string as code": "**`-c` tells Python to run the string after it as code**",
        "arguments after the code are in sys.argv": "**Anything after the code is handed to it in `sys.argv`**",
    },
    "a-proper-cli": {
        "argparse reads the command line": "**`argparse`, in the standard library, reads the command line instead**",
        "ArgumentParser makes the parser": "**`ArgumentParser` makes the parser**",
        "a name with no dashes is positional": "**`add_argument(\"tank\")` adds a positional argument**",
        "a positional is required": "taken by its place on the command line, and **required**",
        "parse_args gives back args": "**`parse_args()` reads the command line and gives back `args`**",
        "-- makes an option": "**An argument whose name starts with `--` is an option**",
        "a left-out option is None": "**`args.deck`, the text after `--deck`, or `None` when it's left out**",
        "type=float converts and refuses": "**`type=float` converts it, and refuses what isn't a number**",
        "a dash becomes an underscore": "**A dash in the name becomes an underscore in `args`**",
        "help= writes the help page": "**argparse writes a help page from what you added**",
        "a bad command line exits 2": "**It prints the usage line and the problem on stderr, and exits with status 2**",
        "stdout is for the data": "**stdout is for the data**",
        "stderr is for talk": "**stderr is for talk**",
        "a pipe takes stdout only": "**A pipe and `>` take stdout only**",
        "print to stderr": "**`print(..., file=sys.stderr)` prints to stderr**",
        "0, 1 and 2": "**Exit statuses finish the job**",
        "description= opens the help": "`description=` is the line its help page opens with",
        "default= when it's left out": "`default=` is the value when it's left out",
        "help= is the line beside it": "`help=` on each argument is the line beside it",
        "a missing file returns 1": "**To turn a missing file into status 1, put the whole `with open` block inside the `try`.**",
        "an option's usage is in brackets": "**In the usage line, an option is in square brackets, because it's optional, with its value in capitals**",
    },
}


def _modules_with_tasks():
    """Every module with a console task, a lab or a challenge."""
    return [m for m in real_catalog().ordered_modules() if _has_task(m)]


def _has_task(module) -> bool:
    return bool(module.terminal or module.lab or module.challenge)


def _without_an_entry(modules, needs) -> list[str]:
    return [m.slug for m in modules if _has_task(m) and m.slug not in needs]


def _unsaid(module, needs) -> list[str]:
    """What the task needs that the lesson doesn't say in its prose or a table."""
    says = _says(module)
    wanted = {need: _text(str(render_inline(words)), code_blocks=True) for need, words in needs.items()}
    return [f"{module.slug}: the lesson doesn't plainly say that {need} (looked for {plain!r})" for need, plain in wanted.items() if plain not in says]


@pytest.mark.criterion(101, "Every console task's needs are written down")
def test_every_task_has_its_needs_written_down():
    assert _without_an_entry(real_catalog().ordered_modules(), NEEDS) == []
    assert NEEDS.keys() <= {m.slug for m in _modules_with_tasks()}, "an entry for a module with no task"


@pytest.mark.criterion(101, "Nothing a task needs is only in a code comment or Try it")
@pytest.mark.parametrize("module", _modules_with_tasks(), ids=lambda m: m.slug)
def test_the_lesson_says_what_its_task_needs(module):
    assert _unsaid(module, NEEDS[module.slug]) == []


def _a_challenge_module(body_html="", slug="lists-and-loops"):
    return SimpleNamespace(slug=slug, body_html=body_html, terminal=None, lab=None, challenge=object())


@pytest.mark.criterion(397, "A challenge without a NEEDS entry fails")
def test_a_challenge_without_an_entry_is_named():
    module = _a_challenge_module()
    assert _without_an_entry([module], {}) == ["lists-and-loops"]
    assert _without_an_entry([module], {"lists-and-loops": {}}) == []
    # The real rule reads the same way: every real challenge module has an entry.
    challenges = [m for m in real_catalog().ordered_modules() if m.challenge]
    assert challenges and _without_an_entry(challenges, NEEDS) == []


TRY_IT = '<h2 id="sec-try-it">Try it</h2><p>sorted returns a new list</p>'


@pytest.mark.criterion(397, "What a challenge needs is in the lesson's prose")
@pytest.mark.parametrize(
    ("body", "said"),
    [
        ("<h2>Lists</h2><p>sorted returns a new list</p>", True),
        ("<h2>Lists</h2><table><tr><td>sorted returns a new list</td></tr></table>", True),
        ("<h2>Lists</h2><pre><code># sorted returns a new list</code></pre>", False),
        ("<h2>Lists</h2><p>Nothing about it.</p>" + TRY_IT, False),
    ],
)
def test_a_challenges_need_must_be_in_the_prose_or_a_table(body, said):
    problems = _unsaid(_a_challenge_module(body), {"sorted copies": "sorted returns a new list"})
    assert not problems if said else "lists-and-loops" in problems[0] and "sorted copies" in problems[0]


# What the station console doesn't have, as a lesson would mention it. A section that
# mentions one must also say "station console", so nobody tries it there and wonders why.
CONSOLE_LACKS = {
    "Ctrl-R": r"Ctrl-R",
    "su": r"<code>su( [^<]*)?</code>",
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
@pytest.mark.parametrize("module", real_catalog().ordered_modules(), ids=lambda m: m.slug)
def test_lessons_say_when_the_console_lacks_something(module):
    for section in _sections(module):
        text = _text(section, code_blocks=True) + " " + section
        for what, pattern in CONSOLE_LACKS.items():
            if re.search(pattern, text, flags=re.M):
                assert "station console" in text, f"{module.slug}: mentions {what}, which the console lacks, without saying so"
    assert "doesn't have `less`" not in module.body_html and "have <code>less</code> yet" not in module.body_html
