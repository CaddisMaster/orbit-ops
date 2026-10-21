---
title: "Text tools: grep, sort, uniq, cut, sed, awk"
minutes: 20
story: |
  **Mission log, day 8.** Someone has been hammering the docking port's login screen all
  night. The access log knows who. "I want the three noisiest addresses in five minutes," says
  Okafor. "Without counting by hand."
quiz:
  - type: choice
    q: Why does `sort` usually come before `uniq -c`?
    options:
      - "`uniq` only works on numbers"
      - "`uniq` only collapses duplicate lines that are next to each other"
      - "`sort` removes duplicates itself"
      - "It doesn't matter"
    answer: 1
    explain: >-
      `uniq` compares each line with the one before it. Sorting first puts identical lines side
      by side so they're counted together.
  - type: fill
    q: Which `grep` flag makes the match case-insensitive?
    answer: ["-i"]
    explain: >-
      `grep -i error` matches `error`, `Error` and `ERROR`. Also worth knowing: `-v` inverts the
      match, `-n` shows line numbers, `-r` searches directories, and `-E` enables extended regex.
  - type: choice
    q: What happens to `app.conf` when you run `sed 's/debug/info/g' app.conf`?
    options: ["Every `debug` in the file is replaced", "Nothing: the changed text is printed to stdout", "Only the first match is replaced", "sed asks for confirmation"]
    answer: 1
    explain: >-
      `sed` writes the result to stdout and leaves the file alone. Use `sed -i` to edit in place,
      ideally after checking the output first.
  - type: choice
    q: "What does `awk '{print $1}' access.log` print?"
    options: ["The first line of the file", "The first whitespace-separated field of every line", "Every line containing `$1`", "The number of lines"]
    answer: 1
    explain: >-
      `awk` splits each line into fields on whitespace (`$1`, `$2`, … and `$0` for the whole
      line). In an Nginx access log, `$1` is the client IP.
terminal:
  task: |
    Someone hammered the docking port's login all night. Write the **three busiest
    addresses** in `/var/log/docking/access.log` to `noisy.txt` in your home directory, each
    with its request count **in front**, as `uniq -c` writes it, busiest first. The address
    is the first field of every line (`awk` or `cut` will get it). It's the docking port's
    log, not the bridge's `/var/log/nginx/access.log` from the lesson.

    Look at a few lines with `head` first, then build a pipeline: don't count by hand. The
    console checks after every command, so you're done the moment `noisy.txt` is right.
  cwd: /home/cadet
  files:
    - {path: /home/cadet, type: dir}
    - path: /var/log/docking/access.log
      owner: root
      group: root
      contents: |
        192.168.8.40 - - [08/Oct/2026:02:10:00 +0000] "POST /login HTTP/1.1" 401 512
        10.4.2.17 - - [08/Oct/2026:02:11:07 +0000] "GET /status HTTP/1.1" 200 512
        10.4.2.17 - - [08/Oct/2026:02:12:14 +0000] "POST /login HTTP/1.1" 200 512
        172.16.0.5 - - [08/Oct/2026:02:13:21 +0000] "POST /login HTTP/1.1" 200 512
        10.4.2.17 - - [08/Oct/2026:02:14:28 +0000] "POST /login HTTP/1.1" 200 512
        10.4.2.90 - - [08/Oct/2026:02:15:35 +0000] "POST /login HTTP/1.1" 401 512
        192.168.8.40 - - [08/Oct/2026:02:16:42 +0000] "GET /status HTTP/1.1" 200 512
        10.4.7.3 - - [08/Oct/2026:02:17:49 +0000] "POST /login HTTP/1.1" 401 512
        10.4.7.3 - - [08/Oct/2026:02:18:56 +0000] "POST /login HTTP/1.1" 401 512
        10.4.7.3 - - [08/Oct/2026:02:19:03 +0000] "POST /login HTTP/1.1" 200 512
        10.4.9.12 - - [08/Oct/2026:02:20:10 +0000] "POST /login HTTP/1.1" 200 512
        192.168.8.40 - - [08/Oct/2026:02:21:17 +0000] "POST /login HTTP/1.1" 401 512
        10.4.2.17 - - [08/Oct/2026:02:22:24 +0000] "POST /login HTTP/1.1" 401 512
        10.4.7.3 - - [08/Oct/2026:02:23:31 +0000] "GET /status HTTP/1.1" 200 512
        192.168.8.40 - - [08/Oct/2026:02:24:38 +0000] "POST /login HTTP/1.1" 401 512
        10.4.2.90 - - [08/Oct/2026:02:25:45 +0000] "POST /login HTTP/1.1" 401 512
        192.168.8.41 - - [08/Oct/2026:02:26:52 +0000] "POST /login HTTP/1.1" 200 512
        172.16.0.5 - - [08/Oct/2026:02:27:59 +0000] "POST /login HTTP/1.1" 401 512
        10.4.2.17 - - [08/Oct/2026:02:28:06 +0000] "POST /login HTTP/1.1" 401 512
        10.4.2.17 - - [08/Oct/2026:02:29:13 +0000] "POST /login HTTP/1.1" 401 512
        10.4.2.17 - - [08/Oct/2026:02:30:20 +0000] "POST /login HTTP/1.1" 401 512
        10.4.2.17 - - [08/Oct/2026:02:31:27 +0000] "POST /login HTTP/1.1" 200 512
        10.4.7.3 - - [08/Oct/2026:02:32:34 +0000] "POST /login HTTP/1.1" 401 512
        10.4.7.3 - - [08/Oct/2026:02:33:41 +0000] "POST /login HTTP/1.1" 401 512
        10.4.2.17 - - [08/Oct/2026:02:34:48 +0000] "POST /login HTTP/1.1" 200 512
    # The lesson's examples run on this log, so they never hand over the task's.
    - path: /var/log/nginx/access.log
      owner: root
      group: root
      contents: |
        10.4.0.5 - - [08/Oct/2026:06:00:01 +0000] "GET /status HTTP/1.1" 200 312
        10.4.0.5 - - [08/Oct/2026:06:00:31 +0000] "GET /reactor HTTP/1.1" 502 0
        10.4.0.8 - - [08/Oct/2026:06:01:02 +0000] "GET /status HTTP/1.1" 200 312
        10.4.0.5 - - [08/Oct/2026:06:01:33 +0000] "GET /favicon.ico HTTP/1.1" 404 0
        10.4.0.12 - - [08/Oct/2026:06:02:04 +0000] "GET /status HTTP/1.1" 200 312
        10.4.0.8 - - [08/Oct/2026:06:02:35 +0000] "GET /reactor HTTP/1.1" 502 0
        10.4.0.5 - - [08/Oct/2026:06:03:06 +0000] "GET /docs HTTP/1.1" 200 2048
        10.4.0.12 - - [08/Oct/2026:06:03:37 +0000] "GET /status HTTP/1.1" 200 312
        10.4.0.8 - - [08/Oct/2026:06:04:08 +0000] "GET /favicon.ico HTTP/1.1" 404 0
        10.4.0.5 - - [08/Oct/2026:06:04:39 +0000] "GET /reactor HTTP/1.1" 200 1024
        10.4.0.12 - - [08/Oct/2026:06:05:10 +0000] "GET /status HTTP/1.1" 200 312
  checks:
    - {contains: /home/cadet/noisy.txt, text: 9 10.4.2.17}
    - {contains: /home/cadet/noisy.txt, text: 6 10.4.7.3}
    - {contains: /home/cadet/noisy.txt, text: 4 192.168.8.40}
    - {lacks: /home/cadet/noisy.txt, text: 10.4.2.90}
    - {lacks: /home/cadet/noisy.txt, text: 172.16.0.5}
  success: |-
    "10.4.2.17, nine attempts," Okafor reads. "That's the maintenance drone. Someone gave it the wrong password list."
  solution:
    - head -n 3 /var/log/docking/access.log
    - 'awk ''{print $1}'' /var/log/docking/access.log | sort | uniq -c | sort -rn | head -n 3 > noisy.txt'
    - cat noisy.txt
challenge:
  from: okafor
  task: |-
    A bonus for anyone who already knows some Python, which *Python for operations* (Unit 2.1)
    teaches. Skip it freely: the quiz is what completes the module.

    MERIDIAN reported **22 login attempts overnight, 14 failed**. Check its arithmetic in Python.
    A `POST /login` is a login attempt (POST sends something to the server, here a password),
    and the status `401` means the server refused it.

    `log` holds `/var/log/docking/access.log`, the same file as the console's, as one string.
    Finish `failed_logins(log)` so it returns how many lines are a `POST /login` that got a
    `401`. In each line the request is between the double quotes, and the status code is the
    first field after the closing quote:

    ```text
    10.4.7.3 - - [08/Oct/2026:02:17:49 +0000] "POST /login HTTP/1.1" 401 512
    ```

    `str.splitlines()` and `str.split()` are all you need: `line.split('"')` splits a line at
    each double quote, and `split()` with nothing in the brackets splits at whitespace. Run it to see what it prints, then
    Submit to run the checks.
  inputs: {log: /var/log/docking/access.log}
  starter: |-
    def failed_logins(log):
        count = 0
        for line in log.splitlines():
            ...  # is this a POST /login whose status is 401?
        return count


    print(failed_logins(log))
  checks:
    - check: assert failed_logins(log) == 14
      says: It finds MERIDIAN's 14 failed logins in the real log.
    - check: assert failed_logins("") == 0
      says: An empty log has no failed logins.
    - check: 'assert failed_logins(''10.0.0.1 - - [08/Oct/2026:03:00:00 +0000] "GET /login HTTP/1.1" 401 0'') == 0'
      says: Only a POST counts, not a GET of the login page.
    - check: 'assert failed_logins(''10.0.0.1 - - [08/Oct/2026:03:00:00 +0000] "POST /login HTTP/1.1" 200 4012'') == 0'
      says: The 401 has to be the status code, not digits in some other number on the line.
    - check: 'assert failed_logins(''10.0.0.1 - - [08/Oct/2026:03:00:00 +0000] "POST /login/reset HTTP/1.1" 401 0'') == 0'
      says: It's the /login path exactly, not one that only starts with it.
  solution: |-
    def failed_logins(log):
        count = 0
        for line in log.splitlines():
            parts = line.split('"')
            if len(parts) < 3:
                continue
            request = parts[1].split()
            status = parts[2].split()[0]
            if request[:2] == ["POST", "/login"] and status == "401":
                count += 1
        return count


    print(failed_logins(log))
comms:
  open:
    - {from: meridian, text: "DOCKING PORT · 22 LOGIN ATTEMPTS OVERNIGHT · 14 FAILED"}
    - {from: okafor, text: "Someone's been hammering the docking port all night. The access log knows who."}
    - {from: okafor, text: "I want the noisiest addresses in five minutes. Without counting by hand."}
  console_done:
    - {from: okafor, text: "10.4.2.17, nine attempts. That's the maintenance drone. Someone gave it the wrong password list."}
    - {from: meridian, text: "DRONE MD-3 · CREDENTIALS RESET · LOGIN ATTEMPTS STOPPED"}
  complete:
    - {from: okafor, text: "No intruder, just a confused drone. Most mysteries on this station are."}
cards:
  - id: grep-count
    section: "grep: find lines"
    front: Count matching lines with grep
    back: "`grep -c TEXT FILE` (or `grep TEXT FILE | wc -l`)."
  - id: top-n
    section: "Putting it together"
    front: "The 'top N' pipeline"
    back: "`… | sort | uniq -c | sort -rn | head -n N`"
  - id: cut-fields
    section: "Cutting columns: cut and awk"
    front: "`cut -d: -f1 /etc/passwd`"
    back: "Splits each line on `:` and prints the first field: every username."
---

## grep: find lines

`grep TEXT FILE` (module 05) prints the lines of FILE that contain TEXT. Flags change what it
prints. Every line below works on any Linux machine and in the station console:

| You type | Prints |
|---|---|
| `grep -i ROOT /etc/passwd` | matching lines, **i**gnoring case: `root`, `Root` and `ROOT` all match |
| `grep -v root /etc/passwd` | the lines that do **not** contain `root` (in**v**erts the match) |
| `grep -n bash /etc/passwd` | matching lines, each with its line **n**umber in front: `1:root:x:0:0:…` |
| `grep -c bash /etc/passwd` | how many lines match (a **c**ount), not the lines themselves |
| `grep -q root /etc/passwd` | nothing at all (**q**uiet): only `$?` (module 06) says whether anything matched, `0` if it did |

On a real server you'll also use `grep -r TEXT DIR`, which searches every file under DIR
(**r**ecursive), and `grep -C 2 TEXT FILE`, which adds 2 lines of context above and below each
match. The station console's `grep` has neither.

TEXT is really a **regular expression** (a regex): a pattern language for text. Plain letters
match themselves, which is why the lines above work, but a few characters are special, and they
don't mean what they mean in module 03's globs. In a glob, `*` means any characters. In a regex,
`.` means any one character, so `grep r..t /etc/passwd` matches `root`, and `*` means "the thing
before me, repeated". **`-E`** (**E**xtended) adds more special characters. In
`grep -E '" 5[0-9][0-9] ' FILE`, the pattern is a quote, a space, a 5, two more digits (`[0-9]`
is any one digit), then a space: a 5xx status in an access log (below). Quote a pattern so the
shell leaves it alone. Regexes get more room in later units.

## What's in an access log

A web server writes one line to its **access log** for every request it answers: every page or
file a browser, a script or a drone asks it for. On most servers that's Nginx, writing to
`/var/log/nginx/access.log`. The station console has one too, from the bridge's status server:

```text
10.4.0.5 - - [08/Oct/2026:06:00:31 +0000] "GET /reactor HTTP/1.1" 502 0
```

Split on spaces, these are its fields, numbered the way `awk` (below) numbers them. These `$`s
are awk's field numbers, not shell variables:

| Field (`$N` in awk) | In that line | Means |
|---|---|---|
| `$1` | `10.4.0.5` | the **client's address**: the IP address of the machine that sent the request (*Networking* explains addresses) |
| `$4` and `$5` | `[08/Oct/2026:06:00:31` and `+0000]` | when it arrived |
| `$6` | `"GET` | the method: `GET` asks for a page, `POST` sends something, such as a login |
| `$7` | `/reactor` | the **path**: what was asked for |
| `$9` | `502` | the **status code**: `200` is OK, `401` a refused login, `404` not found, and 500 to 599 (a "5xx") the server failing |
| `$10` | `0` | the size of the reply, in bytes |

Fields 2, 3 and 8 you can ignore.

## Cutting columns: cut and awk

`cut -d: -f1 /etc/passwd` (module 05) splits each line at every `:` and keeps field 1, every
user name. To split at spaces, the space has to be quoted, **`-d' '`**, or the shell drops it, as
it drops every space between words (`cut: the delimiter must be a single character` is what
you'd see). `cut -d' ' -f1 /var/log/nginx/access.log` prints the client addresses.

`awk` splits each line into fields on **whitespace**: spaces and tabs, however many in a row.
`$1` is the first field, `$2` the second, `$NF` the last (`NF` is the **n**umber of **f**ields), and
`$0` the whole line.

| You type | Prints |
|---|---|
| `awk '{print $1}' /var/log/nginx/access.log` | field 1 of every line: the client addresses |
| `awk '{print $1, $9}' /var/log/nginx/access.log` | fields 1 and 9: a comma puts a space between them |
| `awk '$9 >= 500 {print $7}' /var/log/nginx/access.log` | the path of every request whose status is 500 or more |

Everything between the single quotes is awk's own small program, and it goes to awk untouched.
**The quotes stop the shell treating `$1` as one of its own variables** (module 06), and they
do the same for everything else inside: `>=` here is awk's "greater than or equal", not module
07's redirect, and the braces are awk's, not module 03's brace expansion. `{print $1}` runs on
every line, and a condition in front of the braces, `$9 >= 500`, picks which lines it runs on.

`cut` is for one fixed separator. Use `awk` when fields are separated by runs of spaces, or when
you want a condition.

## Counting and ranking

Like `grep` and `wc` (module 07), all of these read a file if you name one, and stdin, what a
`|` hands them, if you don't. So do `cut`, `awk` and `sed`.

| Command | Does |
|---|---|
| `sort FILE` | sorts the lines alphabetically, comparing character by character, so `10` comes before `9` (`1` comes before `9`) |
| `sort -n` | sorts as numbers, reading the number at the start of each line, so `9` comes before `10` |
| `sort -rn` | numbers, largest first (`-r` reverses) |
| `uniq -c` | collapses **adjacent** duplicate lines into one, with a count in front |
| `head -n 10` / `tail -n 10` | the first / last 10 lines |
| `tail -f /var/log/nginx/access.log` | follows a growing file (Ctrl-C stops; not on the station console, whose files don't grow) |

`uniq` only compares each line with the one before it, which is why it almost always comes
after `sort`. This counts each status code in the console's access log:

```bash
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c
```

```text
      7 200
      2 404
      2 502
```

`uniq -c` writes **the count first**, padded with spaces, then the line. Because the number
starts each line, `sort -rn` can rank what `uniq -c` writes: the biggest count first.

## sed: edit a stream

`sed` (**s**tream **ed**itor) changes text as it passes through. `s/OLD/NEW/` **s**ubstitutes
NEW for OLD; the slashes separate the parts. On its own it replaces the first OLD on each line.
Add `g` (**g**lobal) after the last slash to replace every one.

| You type | Prints |
|---|---|
| `sed 's/bash/BASH/' /etc/passwd` | the file, with the first `bash` on each line replaced |
| `sed 's/o/0/g' /etc/passwd` | the file, with every `o` on every line replaced |
| `sed -n '2,3p' /etc/passwd` | only lines 2 to 3: `-n` prints nothing unless told, and `2,3p` says **p**rint lines 2 to 3 |
| `sed -i.bak 's/bash/BASH/' ~/users.txt` | nothing: it edits `users.txt` itself, keeping the original as `users.txt.bak` |

**Without `-i`, `sed` never touches the file**: it prints the result, and the file stays as it
was. `-i` edits the file **i**n place. The `.bak` straight after it, with no space, is the
suffix for a copy of the original. Look at the output first, then add `-i`. `sed`'s programs are
in single quotes for the same reason as awk's: so the shell passes them on untouched.

## Putting it together

The five most-requested paths in the console's access log:

```bash
awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -n 5
```

Read it left to right: pull out the path, sort so identical paths sit together, count each
group, rank by count, keep the top five. Each stage is simple, and the pipe does the rest.

## Try it

Run these one at a time, on a Linux machine or in the station console:

```bash
grep -i ROOT /etc/passwd
grep -c bash /etc/passwd
cut -d: -f7 /etc/passwd | sort | uniq -c | sort -rn
sed 's/bash/BASH/' /etc/passwd | head -n 3
cat /etc/passwd | head -n 3
cp /etc/passwd ~/users.txt
sed -i.bak 's/bash/BASH/' ~/users.txt
ls ~
head -n 3 ~/users.txt ~/users.txt.bak
ls -l /etc | awk '{print $5, $9}' | sort -rn | head -n 5
```

- `grep -i` finds `root`'s line though you typed capitals, and `grep -c` prints a number.
- The `cut` line counts the login shells in use, most used first, each with its count in front.
- `sed` prints `BASH`, but `cat` shows `/etc/passwd` unchanged.
- `sed -i.bak` on your own copy prints nothing. `ls ~` shows `users.txt` and `users.txt.bak`,
  and `head` of both (it heads each with its name) shows one changed and one not.
- In `ls -l`'s long format (module 02), field 5 is the size in bytes and field 9 the name, so
  the last line lists the five biggest entries in `/etc`.

In the station console only, try the access log (a real machine has one only if it runs a web
server):

```bash
head -n 3 /var/log/nginx/access.log
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c
awk '$9 >= 500 {print $7}' /var/log/nginx/access.log
grep -E '" 5[0-9][0-9] ' /var/log/nginx/access.log
```
