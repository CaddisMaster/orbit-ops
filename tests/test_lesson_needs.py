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
@pytest.mark.parametrize("module", load_catalog().ordered_modules(), ids=lambda m: m.slug)
def test_lessons_say_when_the_console_lacks_something(module):
    for section in _sections(module):
        text = _text(section, code_blocks=True) + " " + section
        for what, pattern in CONSOLE_LACKS.items():
            if re.search(pattern, text, flags=re.M):
                assert "station console" in text, f"{module.slug}: mentions {what}, which the console lacks, without saying so"
    assert "doesn't have `less`" not in module.body_html and "have <code>less</code> yet" not in module.body_html
