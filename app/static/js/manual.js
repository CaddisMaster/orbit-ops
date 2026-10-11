// The station console's manual (#66): a short page for each command shell.js
// knows, read by `man`, `CMD --help` and `help`. Pages describe only what the
// console does, in the words of the real ones where they fit (GNU coreutils,
// bash, procps, cron), so what's learned here holds on a real server.
//
// PAGES: man pages, by name (section 1 unless `section` says otherwise;
//        "crontab.5" is crontab(5), the file format).
// HELP:  bash's `help` for builtins and keywords (which have no man page,
//        as on Ubuntu: `man cd` finds nothing, `help cd` does).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OrbitManual = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PAGES = {
    ls: {
      summary: "list directory contents",
      synopsis: ["ls [OPTION]... [FILE]..."],
      description: "List information about the FILEs (the current directory by default). Entries are sorted alphabetically.",
      options: [
        ["-a, --all", "do not ignore entries starting with ."],
        ["-d, --directory", "list directories themselves, not their contents"],
        ["-h, --human-readable", "with -l, print sizes like 1K 234M 2G"],
        ["-l", "use a long listing format: mode, links, owner, group, size, time, name"],
      ],
    },
    cat: {
      summary: "concatenate files and print on the standard output",
      synopsis: ["cat [FILE]..."],
      description: "Concatenate FILE(s) to standard output. With no FILE, or when FILE is -, read standard input.",
    },
    echo: {
      summary: "display a line of text",
      synopsis: ["echo [-n] [STRING]..."],
      description: "Echo the STRING(s) to standard output. Your shell has its own echo built in, which is the one that runs; `help echo` describes it.",
      options: [["-n", "do not output the trailing newline"]],
    },
    pwd: {
      summary: "print name of current/working directory",
      synopsis: ["pwd"],
      description: "Print the full filename of the current working directory.",
    },
    touch: {
      summary: "change file timestamps",
      synopsis: ["touch FILE..."],
      description: "Update the modification time of each FILE to the current time. A FILE argument that does not exist is created empty.",
    },
    mkdir: {
      summary: "make directories",
      synopsis: ["mkdir [OPTION]... DIRECTORY..."],
      description: "Create the DIRECTORY(ies), if they do not already exist.",
      options: [["-p, --parents", "no error if existing, make parent directories as needed"]],
    },
    rmdir: {
      summary: "remove empty directories",
      synopsis: ["rmdir DIRECTORY..."],
      description: "Remove the DIRECTORY(ies), if they are empty.",
    },
    rm: {
      summary: "remove files or directories",
      synopsis: ["rm [OPTION]... [FILE]..."],
      description: "Remove (unlink) the FILE(s). By default, rm does not remove directories: use -r for that. There is no undo.",
      options: [
        ["-f, --force", "ignore nonexistent files and arguments, never prompt"],
        ["-r, -R, --recursive", "remove directories and their contents recursively"],
      ],
    },
    cp: {
      summary: "copy files and directories",
      synopsis: ["cp [OPTION]... SOURCE DEST", "cp [OPTION]... SOURCE... DIRECTORY"],
      description: "Copy SOURCE to DEST, or multiple SOURCE(s) to DIRECTORY.",
      options: [["-r, -R, --recursive", "copy directories recursively"]],
    },
    mv: {
      summary: "move (rename) files",
      synopsis: ["mv SOURCE DEST", "mv SOURCE... DIRECTORY"],
      description: "Rename SOURCE to DEST, or move SOURCE(s) to DIRECTORY.",
    },
    chmod: {
      summary: "change file mode bits",
      synopsis: ["chmod [OPTION]... MODE[,MODE]... FILE...", "chmod [OPTION]... OCTAL-MODE FILE..."],
      description: "Change the mode of each FILE to MODE. A symbolic mode is [ugoa][+-=][rwx], like u+x or go-w; an octal mode is digits, like 640 (owner rw, group r, others nothing).",
      options: [["-R, --recursive", "change files and directories recursively"]],
    },
    chown: {
      summary: "change file owner and group",
      synopsis: ["chown [OPTION]... [OWNER][:[GROUP]] FILE..."],
      description: "Change the owner and/or group of each FILE to OWNER and/or GROUP. Only root can give a file away, so this usually runs under sudo.",
      options: [["-R, --recursive", "operate on files and directories recursively"]],
    },
    grep: {
      summary: "print lines that match patterns",
      synopsis: ["grep [OPTION]... PATTERN [FILE]..."],
      description: "Search for PATTERN in each FILE (or standard input) and print each line that matches. The exit status is 0 if a line is selected, 1 if no lines were selected, and 2 if an error occurred.",
      options: [
        ["-c, --count", "print only a count of matching lines per FILE"],
        ["-E, --extended-regexp", "PATTERN is an extended regular expression"],
        ["-i, --ignore-case", "ignore case distinctions in patterns and data"],
        ["-n, --line-number", "prefix each line of output with its line number"],
        ["-q, --quiet", "do not write anything; exit with status 0 if any line matches (for `if grep -q`)"],
        ["-v, --invert-match", "select non-matching lines"],
      ],
    },
    wc: {
      summary: "print newline, word, and byte counts for each file",
      synopsis: ["wc [OPTION]... [FILE]..."],
      description: "Print newline, word, and byte counts for each FILE, and a total line if more than one FILE is specified.",
      options: [["-c, --bytes", "print the byte counts"], ["-l, --lines", "print the newline counts"], ["-w, --words", "print the word counts"]],
    },
    sort: {
      summary: "sort lines of text files",
      synopsis: ["sort [OPTION]... [FILE]..."],
      description: "Write the sorted lines of all FILE(s) to standard output.",
      options: [
        ["-n, --numeric-sort", "compare according to string numerical value"],
        ["-r, --reverse", "reverse the result of comparisons"],
        ["-u, --unique", "output only the first of an equal run"],
      ],
    },
    uniq: {
      summary: "report or omit repeated lines",
      synopsis: ["uniq [OPTION]... [INPUT]"],
      description: "Filter adjacent matching lines from INPUT (or standard input). Repeated lines are only found when they are next to each other, so sort first.",
      options: [["-c, --count", "prefix lines by the number of occurrences"]],
    },
    tee: {
      summary: "read from standard input and write to standard output and files",
      synopsis: ["tee [OPTION]... [FILE]..."],
      description: "Copy standard input to each FILE, and also to standard output.",
      options: [["-a, --append", "append to the given FILEs, do not overwrite"]],
    },
    head: {
      summary: "output the first part of files",
      synopsis: ["head [OPTION]... [FILE]..."],
      description: "Print the first 10 lines of each FILE to standard output.",
      options: [["-n, --lines=NUM", "print the first NUM lines instead of the first 10"]],
    },
    tail: {
      summary: "output the last part of files",
      synopsis: ["tail [OPTION]... [FILE]..."],
      description: "Print the last 10 lines of each FILE to standard output.",
      options: [["-n, --lines=NUM", "output the last NUM lines, instead of the last 10"]],
    },
    cut: {
      summary: "remove sections from each line of files",
      synopsis: ["cut OPTION... [FILE]..."],
      description: "Print selected parts of lines from each FILE to standard output.",
      options: [
        ["-d, --delimiter=DELIM", "use DELIM instead of TAB for field delimiter"],
        ["-f, --fields=LIST", "select only these fields, like 1,3 or 2-4"],
        ["-c, --characters=LIST", "select only these characters"],
      ],
    },
    awk: {
      summary: "pattern scanning and text processing language",
      synopsis: ["awk [-F SEP] 'PROGRAM' [FILE]..."],
      description: "Run PROGRAM, a list of `pattern { action }` rules, against each line. $1, $2… are the line's fields, $0 the whole line, NF the number of fields and NR the line number. The console knows a small part of awk: patterns of /regex/ and comparisons, BEGIN and END, and print.",
      options: [["-F SEP", "use SEP as the field separator"]],
    },
    sed: {
      summary: "stream editor for filtering and transforming text",
      synopsis: ["sed [OPTION]... SCRIPT [FILE]..."],
      description: "Apply SCRIPT to each line of input. The console knows s/RE/REPLACEMENT/[gpI], p, d and q, with addresses N, $, /re/ and ranges.",
      options: [
        ["-n, --quiet", "suppress automatic printing of pattern space"],
        ["-e SCRIPT", "add the script to the commands to be executed"],
        ["-E, -r", "use extended regular expressions in the script"],
        ["-i[SUFFIX]", "edit files in place (makes a backup if SUFFIX is supplied)"],
      ],
    },
    whoami: {
      summary: "print effective user name",
      synopsis: ["whoami"],
      description: "Print the user name associated with the current effective user ID.",
    },
    id: {
      summary: "print real and effective user and group IDs",
      synopsis: ["id [USER]"],
      description: "Print user and group information for USER, or (when USER omitted) for the current process.",
    },
    groups: {
      summary: "print the groups a user is in",
      synopsis: ["groups [USERNAME]..."],
      description: "Print group memberships for each USERNAME or, if no USERNAME is specified, for the current process.",
    },
    getent: {
      summary: "get entries from Name Service Switch libraries",
      synopsis: ["getent DATABASE [KEY]..."],
      description: "Display entries from DATABASE (passwd or group) matching KEY, or all of them.",
    },
    usermod: {
      summary: "modify a user account",
      synopsis: ["usermod [OPTIONS] LOGIN"],
      description: "Modify the system account files. A user's new groups take effect at their next login.",
      options: [
        ["-a, --append", "with -G, add the user to the groups without removing them from others"],
        ["-G, --groups GROUP1[,GROUP2...]", "the list of supplementary groups (without -a, replaces them all)"],
      ],
    },
    sudo: {
      summary: "execute a command as another user",
      synopsis: ["sudo [-u user] command [arg ...]", "sudo -i", "sudo -l", "sudo -k"],
      description: "Run command as the superuser or another user, as allowed by the security policy. sudo asks for your own password and remembers it for 15 minutes.",
      options: [
        ["-i, --login", "run a login shell as the target user"],
        ["-k, --reset-timestamp", "forget the remembered password"],
        ["-l, --list", "list the commands you may run"],
        ["-u, --user=user", "run the command as user instead of root"],
      ],
    },
    clear: { summary: "clear the terminal screen", synopsis: ["clear"], description: "Clear your screen. Ctrl-L does the same." },
    true: { summary: "do nothing, successfully", synopsis: ["true"], description: "Exit with a status code indicating success." },
    false: { summary: "do nothing, unsuccessfully", synopsis: ["false"], description: "Exit with a status code indicating failure." },
    test: {
      summary: "check file types and compare values",
      synopsis: ["test EXPRESSION", "[ EXPRESSION ]"],
      description: "Exit with the status determined by EXPRESSION: 0 if it is true, 1 if false, 2 on an error. Quote variables: [ \"$x\" = yes ] still works when $x is empty. Bash also has [[ ]], which needs no quotes and compares with patterns (`help [[`).",
      options: [
        ["-n STRING", "the length of STRING is nonzero"],
        ["-z STRING", "the length of STRING is zero"],
        ["STRING1 = STRING2", "the strings are equal"],
        ["STRING1 != STRING2", "the strings are not equal"],
        ["INTEGER1 -eq INTEGER2", "INTEGER1 is equal to INTEGER2 (also -ne -lt -le -gt -ge)"],
        ["-d FILE", "FILE exists and is a directory"],
        ["-e FILE", "FILE exists"],
        ["-f FILE", "FILE exists and is a regular file"],
        ["-r FILE", "FILE exists and read permission is granted (also -w write, -x execute)"],
        ["-s FILE", "FILE exists and has a size greater than zero"],
        ["! EXPRESSION", "EXPRESSION is false"],
        ["EXPR1 -a EXPR2", "both are true (-o: either is true)"],
      ],
    },
    env: {
      summary: "run a program in a modified environment",
      synopsis: ["env [NAME=VALUE]... [COMMAND [ARG]...]"],
      description: "Set each NAME to VALUE in the environment and run COMMAND. With no COMMAND, print the resulting environment.",
    },
    printenv: {
      summary: "print all or part of environment",
      synopsis: ["printenv [VARIABLE]..."],
      description: "Print the values of the specified environment VARIABLE(s). If no VARIABLE is specified, print name and value pairs for them all. Only exported variables are in the environment.",
    },
    which: {
      summary: "locate a command",
      synopsis: ["which [-a] filename ..."],
      description: "Print the full path of the files that would run if each name were given as a command, searching $PATH.",
      options: [["-a", "print all matching pathnames of each argument"]],
    },
    bash: {
      summary: "GNU Bourne-Again SHell",
      synopsis: ["bash [script [argument ...]]", "bash -c string [name [argument ...]]"],
      description: "Bash is the shell you're typing into. `bash script.sh` runs a script in a new (child) shell, which sees only exported variables. The console's bash knows pipelines, redirection, $(…), $((…)), if, for, while, until, case, [[ ]], and the builtins `help` lists. Read about one with `help NAME`.",
      options: [["-c string", "read commands from string; name becomes $0 and the arguments $1…"]],
    },
    sleep: {
      summary: "delay for a specified amount of time",
      synopsis: ["sleep NUMBER"],
      description: "Pause for NUMBER seconds. On the console, time is simulated: a foreground sleep jumps the clock.",
    },
    kill: {
      summary: "send a signal to a process",
      synopsis: ["kill [-s signal|-signal] pid|%job ...", "kill -l"],
      description: "Send a signal (TERM by default) to the processes or jobs named. TERM asks a process to finish; KILL (9) can't be caught or ignored, so it's the last resort.",
      options: [["-s signal, -signal", "the signal to send: a name like TERM, HUP, INT, KILL, or a number like 9"], ["-l", "list signal names"]],
    },
    pgrep: {
      summary: "look up processes based on name and other attributes",
      synopsis: ["pgrep [options] pattern"],
      description: "Print the process IDs of the running processes whose names match pattern (a regular expression).",
      options: [
        ["-a, --list-full", "list the full command line as well as the process ID"],
        ["-f, --full", "match against the full command line, not just the process name"],
        ["-l, --list-name", "list the process name as well as the process ID"],
        ["-u, --euid user", "only match processes owned by user"],
      ],
    },
    pkill: {
      summary: "signal processes based on name and other attributes",
      synopsis: ["pkill [-signal] [options] pattern"],
      description: "Send a signal (TERM by default) to each running process whose name matches pattern.",
      options: [["-f, --full", "match against the full command line"], ["-u, --euid user", "only match processes owned by user"]],
    },
    ps: {
      summary: "report a snapshot of the current processes",
      synopsis: ["ps [options]"],
      description: "Display information about a selection of the active processes. With no options, only those started from this terminal.",
      options: [
        ["aux", "every process, with user, %CPU, %MEM and the full command (BSD style)"],
        ["-ef", "every process, with its parent's PID (standard style)"],
        ["--sort=KEY", "sort by KEY, like -%cpu or pid"],
      ],
    },
    nano: {
      summary: "Nano's ANOther editor, inspired by Pico",
      synopsis: ["nano FILE"],
      description: "A small, friendly text editor. It opens FILE, or creates it when you first save. The keys are listed along the bottom, where ^ means Ctrl: ^O writes the file out (then Enter to confirm the name), ^X exits and asks first if there are unsaved changes, ^K cuts the current line and ^U pastes it back. On the console, Esc then Tab leaves the editor without closing it.",
    },
    man: {
      summary: "an interface to the system reference manuals",
      synopsis: ["man [SECTION] PAGE"],
      description: "Show the manual page for PAGE in a pager: Space for the next screen, b to go back, /text to search (n for the next match), q to quit. Sections: 1 is commands, 5 is file formats (`man 5 crontab`). Shell builtins like cd have no page of their own: use `help cd`, or `cd --help`.",
    },
    less: {
      summary: "opposite of more",
      synopsis: ["less [FILE]", "COMMAND | less"],
      description: "Show a file, or a command's output, a screen at a time. Space or f: forward a screen. b: back a screen. j and k, or the arrows: a line. g and G: the start and the end. /pattern: search forward (n repeats it, N goes back). q: quit.",
    },
    more: {
      summary: "display the contents of a file in a terminal",
      synopsis: ["more [FILE]"],
      description: "Show a file a screen at a time. Space for the next screen, q to quit. less does all this and more.",
    },
    crontab: {
      summary: "maintain crontab files for individual users",
      synopsis: ["crontab [file]", "crontab -e", "crontab -l", "crontab -r"],
      description: "Install, list or remove the table cron reads to run your commands on a schedule. The format of each line is in crontab(5): `man 5 crontab`. A crontab with mistakes is refused, not installed.",
      options: [
        ["file", "install file as your crontab (- reads standard input)"],
        ["-e", "edit your crontab in an editor; it's checked and installed when you exit"],
        ["-l", "display your current crontab on standard output"],
        ["-r", "remove your current crontab"],
      ],
    },
    find: {
      summary: "search for files in a directory hierarchy",
      synopsis: ["find [starting-point...] [expression]"],
      description: "Search the directory tree rooted at each starting-point (the current directory by default) by evaluating the expression for each file, and print the names that match. Tests next to each other must all be true (-a is implied); -o means or, ! means not, and ( ) group them (quote or escape them, and the patterns, from the shell). With no action, -print is assumed. find doesn't follow symbolic links. Global options like -maxdepth go before the tests.\n\nNumbers can be +N (more than N), -N (less than N) or N (exactly N). -size rounds up to its unit, so -size -1M matches only empty files.",
      options: [
        ["-name pattern", "the file's name (not its directory) matches the shell pattern, like '*.log'"],
        ["-iname pattern", "like -name, but ignoring case"],
        ["-path pattern", "the whole path matches pattern"],
        ["-type c", "the file is of type c: f (regular file), d (directory) or l (symbolic link)"],
        ["-size n[ckMG]", "the file uses n units of space: c bytes, k kibibytes, M mebibytes, G gibibytes (512-byte blocks with no unit)"],
        ["-mtime n", "the file was last modified n*24 hours ago (+7: more than 7 days ago)"],
        ["-mmin n", "the file was last modified n minutes ago"],
        ["-newer file", "the file was modified more recently than file"],
        ["-empty", "the file is empty and is either a regular file or a directory"],
        ["-user name", "the file is owned by user name"],
        ["-maxdepth levels", "descend at most levels of directories below the starting-points (0: just the starting-points)"],
        ["-mindepth levels", "do not apply any tests or actions at levels less than levels"],
        ["-print", "print the full file name, followed by a newline"],
        ["-delete", "delete files; true if removal succeeded. Test without it first: there is no undo"],
        ["-exec command ;", "run command; {} is replaced by the file name, and the ; must be escaped: \;"],
        ["-exec command {} +", "run command once, with all the file names at the end"],
      ],
    },
    du: {
      summary: "estimate file space usage",
      synopsis: ["du [OPTION]... [FILE]..."],
      description: "Summarize the space used by each FILE, recursively for directories. Space is counted in whole blocks of the disk (4K here), so a 10-byte file uses 4.0K: du can say more than the files' sizes add up to.",
      options: [
        ["-a, --all", "write counts for all files, not just directories"],
        ["-c, --total", "produce a grand total"],
        ["-d, --max-depth=N", "print the total for a directory only if it is N or fewer levels below the command line argument"],
        ["-h, --human-readable", "print sizes in human readable format (e.g., 1K 234M 2G)"],
        ["-s, --summarize", "display only a total for each argument"],
      ],
    },
    df: {
      summary: "report file system space usage",
      synopsis: ["df [OPTION]... [FILE]..."],
      description: "Show how much space is used and available on the file system each FILE is on, or on all of them. The station's console has one disk, mounted at /.",
      options: [["-h, --human-readable", "print sizes in powers of 1024 (e.g., 1023M)"]],
    },
    free: {
      summary: "display amount of free and used memory in the system",
      synopsis: ["free [options]"],
      description: "Display the total amount of free and used physical and swap memory. buff/cache is memory the kernel uses for disk caches and gives back when programs need it, so available, not free, is how much a new program can have.",
      options: [["-h, --human", "show all fields scaled to the shortest three digit unit (B, Ki, Mi, Gi)"], ["-m, --mebi", "display the amount of memory in mebibytes"]],
    },
    tar: {
      summary: "an archiving utility",
      synopsis: ["tar -c [-z] [-v] -f ARCHIVE FILE...", "tar -t [-v] -f ARCHIVE", "tar -x [-v] -f ARCHIVE [-C DIR] [MEMBER...]"],
      description: "Save many files together into a single archive, list it, and restore files from it. The letters can be bundled, so tar -czf logs.tar.gz logs/ creates a gzipped archive of logs/. Leading slashes are removed from member names, so an archive always extracts relative to where you are. On the station console, archives are simulated: a text file recording what's inside.",
      options: [
        ["-c, --create", "create a new archive"],
        ["-t, --list", "list the contents of an archive"],
        ["-x, --extract", "extract files from an archive"],
        ["-f, --file=ARCHIVE", "use archive file ARCHIVE"],
        ["-z, --gzip", "filter the archive through gzip (reading one, tar notices for itself)"],
        ["-v, --verbose", "verbosely list files processed"],
        ["-C, --directory=DIR", "change to DIR before extracting"],
      ],
    },
    gzip: {
      summary: "compress or expand files",
      synopsis: ["gzip [-dk] FILE..."],
      description: "Reduce the size of each FILE, replacing it with FILE.gz, which keeps the same mode and modification time. Text like logs shrinks a lot. gunzip (or gzip -d) puts it back; zcat prints it without unpacking.",
      options: [["-d, --decompress", "decompress"], ["-k, --keep", "keep (don't delete) input files"]],
    },
    gunzip: {
      summary: "compress or expand files",
      synopsis: ["gunzip [-k] FILE.gz..."],
      description: "Restore each FILE.gz made by gzip to FILE, and remove FILE.gz.",
      options: [["-k, --keep", "keep (don't delete) input files"]],
    },
    zcat: {
      summary: "compress or expand files",
      synopsis: ["zcat FILE.gz..."],
      description: "Print the uncompressed contents of each FILE.gz, leaving it compressed: zcat app.log.gz | grep ERROR.",
    },
    ln: {
      summary: "make links between files",
      synopsis: ["ln -s [-f] TARGET LINK_NAME", "ln -s TARGET... DIRECTORY"],
      description: "Create a symbolic link LINK_NAME that points to TARGET, or links in DIRECTORY with the targets' names. TARGET is stored as written: a relative target is relative to the link's directory, not yours. A link to something that doesn't exist (dangling) is allowed. On the station console, only symbolic links can be made.",
      options: [
        ["-s, --symbolic", "make symbolic links instead of hard links"],
        ["-f, --force", "remove existing destination files"],
        ["-n, --no-dereference", "treat LINK_NAME as a normal file if it is a symbolic link to a directory"],
        ["-v, --verbose", "print name of each linked file"],
      ],
    },
    readlink: {
      summary: "print resolved symbolic links or canonical file names",
      synopsis: ["readlink [-f] FILE..."],
      description: "Print the value of a symbolic link: where it points, as written. With -f, print the canonical path instead: every link on the way followed, and . and .. resolved.",
      options: [["-f, --canonicalize", "canonicalize by following every symlink in every component of the given name recursively"]],
    },
    "crontab.5": {
      section: 5,
      name: "crontab",
      summary: "tables for driving cron",
      description: "A crontab file contains instructions for cron of the general form: \"run this command at this time on this date\". Each user has their own crontab. Blank lines, and lines whose first non-space character is #, are ignored. A line like NAME = value sets an environment variable for the commands.\n\nEach other line is five time-and-date fields, followed by a command:\n\n    field          allowed values\n    -----          --------------\n    minute         0-59\n    hour           0-23\n    day of month   1-31\n    month          1-12 (or names: jan, feb, ...)\n    day of week    0-7 (0 or 7 is Sunday, or names: sun, mon, ...)\n\nA field may be an asterisk (*), which always stands for \"first-last\". Ranges of numbers are allowed: 8-11 for an hour means 8, 9, 10 and 11. Lists are allowed: 1,2,5,9. A step after a range or * skips values: */15 in the minute field means every fifteen minutes.\n\nInstead of the five fields, one of these special strings may be used: @reboot, @yearly (or @annually), @monthly, @weekly, @daily (or @midnight), @hourly.\n\nThe command runs with /bin/sh, from your home directory, with very few environment variables, so use full paths. Its output is mailed to you unless redirected.\n\nEXAMPLE:\n\n    # every 15 minutes\n    */15 * * * * /station/bin/o2-check.sh\n    # 5 a.m. on weekdays, output kept in a log\n    0 5 * * 1-5 /station/bin/backup.sh >> /var/log/backup.log 2>&1",
    },
  };

  // bash's `help NAME`, for builtins and keywords.
  var HELP = {
    cd: { usage: "cd [dir]", summary: "Change the shell working directory.", description: "Change the current directory to DIR. The default DIR is the value of the HOME shell variable. `cd -` goes back to the previous directory ($OLDPWD)." },
    pwd: { usage: "pwd", summary: "Print the name of the current working directory." },
    echo: { usage: "echo [-n] [arg ...]", summary: "Write arguments to the standard output.", description: "Display the ARGs, separated by a single space character and followed by a newline, on the standard output.", options: [["-n", "do not append a newline"]] },
    export: { usage: "export [name[=value] ...]", summary: "Set export attribute for shell variables.", description: "Marks each NAME for automatic export to the environment of subsequently executed commands. If VALUE is supplied, assign VALUE before exporting. With no NAME, list the exported variables." },
    unset: { usage: "unset [name ...]", summary: "Unset values and attributes of shell variables.", description: "For each NAME, remove the corresponding variable." },
    type: { usage: "type [-at] name [name ...]", summary: "Display information about command type.", description: "For each NAME, indicate how it would be interpreted if used as a command name: a keyword, a builtin, or a file on $PATH.", options: [["-a", "display all locations containing an executable named NAME"], ["-t", "output a single word: keyword, builtin or file"]] },
    source: { usage: "source filename", summary: "Execute commands from a file in the current shell.", description: "Read and execute commands from FILENAME in the current shell, so the variables it sets stay set. `. filename` is the same." },
    ".": { usage: ". filename", summary: "Execute commands from a file in the current shell.", description: "The same as `source filename`." },
    exit: { usage: "exit [n]", summary: "Exit the shell.", description: "Exits the shell (or a script) with a status of N. If N is omitted, the exit status is that of the last command executed." },
    jobs: { usage: "jobs [-l]", summary: "Display status of jobs.", description: "Lists the active jobs: those started with & in this shell." },
    fg: { usage: "fg [job_spec]", summary: "Move job to the foreground.", description: "Place the job identified by JOB_SPEC (like %1) in the foreground. Without one, the current job." },
    bg: { usage: "bg [job_spec]", summary: "Move jobs to the background." },
    kill: { usage: "kill [-s sigspec | -sigspec] pid | jobspec ...", summary: "Send a signal to a job.", description: "Send the processes identified by PID or JOBSPEC the signal named by SIGSPEC. If SIGSPEC is not present, then SIGTERM is assumed." },
    command: { usage: "command [-v] command [arg ...]", summary: "Execute a simple command or display information about commands.", options: [["-v", "print the command's path, or its name for a builtin"]] },
    help: { usage: "help [pattern]", summary: "Display information about builtin commands.", description: "Displays brief summaries of builtin commands. If PATTERN is specified, gives detailed help on that command. Commands that aren't builtins have manual pages: `man ls`." },
    true: { usage: "true", summary: "Return a successful result." },
    false: { usage: "false", summary: "Return an unsuccessful result." },
    ":": { usage: ":", summary: "Null command.", description: "No effect; the command does nothing. Exit Status: Always succeeds." },
    test: { usage: "test [expr]", summary: "Evaluate conditional expression.", description: "Exits with a status of 0 (true) or 1 (false) depending on the evaluation of EXPR. `man test` lists the operators." },
    "[": { usage: "[ arg... ]", summary: "Evaluate conditional expression.", description: "This is a synonym for the \"test\" builtin, but the last argument must be a literal `]', to match the opening `['." },
    read: {
      usage: "read [-rs] [-p prompt] [name ...]",
      summary: "Read a line from the standard input and split it into fields.",
      description: "Reads a single line from the standard input. The line is split into fields on $IFS, and the first field is assigned to the first NAME, the second to the second, and so on, with any leftovers assigned to the last NAME. With no NAMEs, the line is stored in REPLY. The return code is zero, unless end-of-file is encountered.",
      options: [["-p prompt", "output the string PROMPT without a trailing newline before attempting to read"], ["-r", "do not allow backslashes to escape any characters (almost always what you want)"], ["-s", "do not echo input (for passwords)"]],
    },
    break: { usage: "break [n]", summary: "Exit for, while, or until loops.", description: "Exit a FOR, WHILE or UNTIL loop. If N is specified, break N enclosing loops." },
    continue: { usage: "continue [n]", summary: "Resume for, while, or until loops.", description: "Resumes the next iteration of the enclosing FOR, WHILE or UNTIL loop. If N is specified, resumes the Nth enclosing loop." },
    if: { usage: "if COMMANDS; then COMMANDS; [ elif COMMANDS; then COMMANDS; ]... [ else COMMANDS; ] fi", summary: "Execute commands based on conditional.", description: "The `if COMMANDS' list is executed. If its exit status is zero, then the `then COMMANDS' list is executed. Otherwise, each `elif COMMANDS' list is executed in turn, and if its exit status is zero, the corresponding `then COMMANDS' list is executed and the if command completes. Otherwise, the `else COMMANDS' list is executed, if present." },
    for: { usage: "for NAME [in WORDS ... ] ; do COMMANDS; done", summary: "Execute commands for each member in a list.", description: "The `for' loop executes a sequence of commands for each member in a list of items. If `in WORDS ...;' is not present, then `in \"$@\"' is assumed. For each element in WORDS, NAME is set to that element, and the COMMANDS are executed." },
    while: { usage: "while COMMANDS; do COMMANDS; done", summary: "Execute commands as long as a test succeeds.", description: "Expand and execute COMMANDS as long as the final command in the `while' COMMANDS has an exit status of zero." },
    until: { usage: "until COMMANDS; do COMMANDS; done", summary: "Execute commands as long as a test does not succeed.", description: "Expand and execute COMMANDS as long as the final command in the `until' COMMANDS has an exit status which is not zero." },
    case: { usage: "case WORD in [PATTERN [| PATTERN]...) COMMANDS ;;]... esac", summary: "Execute commands based on pattern matching.", description: "Selectively execute COMMANDS based upon WORD matching PATTERN. The `|' is used to separate multiple patterns. Patterns are globs: *.log, [0-9]*, and * to catch everything else." },
    "[[": { usage: "[[ expression ]]", summary: "Execute conditional command.", description: "Returns a status of 0 or 1 depending on the evaluation of the conditional expression EXPRESSION. Expressions are composed of the same primaries used by the `test' builtin, and may be combined using ! EXPR, ( EXPR ), EXPR1 && EXPR2 and EXPR1 || EXPR2. When the `==' and `!=' operators are used, the string to the right of the operator is used as a pattern. Words inside [[ ]] are not split, so variables need no quotes." },
    "{": { usage: "{ COMMANDS ; }", summary: "Group commands as a unit.", description: "Run a set of commands in a group. This is one way to redirect an entire set of commands." },
  };

  return { PAGES: PAGES, HELP: HELP };
});
