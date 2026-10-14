---
title: "Text tools: grep, sort, uniq, cut, sed, awk"
minutes: 20
story: |
  **Mission log, day 8.** Someone has been hammering the docking port's login screen all
  night. The access log knows who. "I want the ten noisiest addresses in five minutes," says
  Okafor. "Without opening the file."
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
    with its request count, busiest first. The address is the first field of every line
    (`awk` or `cut` will get it). Don't open the file and count by hand: plumb it.
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
  checks:
    - {contains: /home/cadet/noisy.txt, text: 9 10.4.2.17}
    - {contains: /home/cadet/noisy.txt, text: 6 10.4.7.3}
    - {contains: /home/cadet/noisy.txt, text: 4 192.168.8.40}
  success: |-
    "10.4.2.17, nine attempts," Okafor reads. "That's the maintenance drone. Someone gave it the wrong password list."
  solution:
    - head -n 3 /var/log/docking/access.log
    - 'awk ''{print $1}'' /var/log/docking/access.log | sort | uniq -c | sort -rn | head -n 3 > noisy.txt'
    - cat noisy.txt
challenge:
  from: okafor
  task: |-
    MERIDIAN reported **22 login attempts overnight, 14 failed**. Check its arithmetic in Python.

    `log` holds `/var/log/docking/access.log`, the same file as the console's, as one string.
    Finish `failed_logins(log)` so it returns how many lines are a `POST /login` that got a
    `401`. In each line the request is between the double quotes, and the status code is the
    first field after the closing quote:

    ```text
    10.4.7.3 - - [08/Oct/2026:02:17:49 +0000] "POST /login HTTP/1.1" 401 512
    ```

    `str.splitlines()` and `str.split()` are all you need. Run it to see what it prints, then
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
    - {from: okafor, text: "I want the noisiest addresses in five minutes. Without opening the file."}
  console_done:
    - {from: okafor, text: "10.4.2.17, nine attempts. That's the maintenance drone. Someone gave it the wrong password list."}
    - {from: meridian, text: "DRONE MD-3 · CREDENTIALS RESET · LOGIN ATTEMPTS STOPPED"}
  complete:
    - {from: okafor, text: "No intruder, just a confused drone. Most mysteries on this station are."}
cards:
  - id: grep-count
    section: "grep: find lines"
    front: Count matching lines with grep
    back: "`grep -c pattern file` (or `grep pattern file | wc -l`)."
  - id: top-n
    section: "Counting and ranking"
    front: "The 'top N' pipeline"
    back: "`… | sort | uniq -c | sort -rn | head -n N`"
  - id: cut-fields
    section: "Cutting columns: cut and awk"
    front: "`cut -d: -f1 /etc/passwd`"
    back: "Splits each line on `:` and prints the first field: every username."
---

## grep: find lines

```bash
grep error app.log               # lines containing "error"
grep -i error app.log            # …ignoring case
grep -n -C 2 Traceback app.log   # with line numbers and 2 lines of context
grep -v healthz access.log       # lines NOT matching (hide health checks)
grep -r "COOKIE_SECURE" .        # search every file under the current directory
grep -E '" 5[0-9]{2} ' access.log   # extended regex: any 5xx status (after the quoted request)
```

The station console's `grep` knows `-i -v -n -c -q` and `-E`, but not `-r` or context (`-C`):
on a real server you'll use those too.

## Counting and ranking

| Command | Does |
|---|---|
| `wc -l access.log` | counts the lines |
| `sort names.txt` | sorts alphabetically |
| `sort -n sizes.txt` | sorts as numbers, so 10 comes after 9 |
| `sort -rn` | numbers, largest first (`-r` reverses) |
| `uniq -c` | collapses **adjacent** duplicate lines into one, with a count in front |
| `head -n 10` / `tail -n 10` | the first / last lines |
| `tail -f /var/log/nginx/access.log` | follows a growing file (Ctrl-C stops; not on the station console, whose files don't grow) |

`uniq` only compares each line with the one before it, which is why it almost always comes
after `sort`.

## Cutting columns: cut and awk

```bash
cut -d: -f1 /etc/passwd                  # field 1, fields separated by ':'
awk '{print $1}' access.log              # field 1, separated by whitespace
awk '$9 >= 500 {print $7}' access.log    # path of every 5xx response
```

`awk` splits each line into fields on whitespace: `$1` is the first, `$2` the second, `$NF`
the last, and `$0` the whole line. `cut` is for one fixed delimiter. `awk` handles runs of spaces
and lets you add conditions.

## sed: edit a stream

```bash
sed 's/debug/info/' app.conf         # replace the FIRST match on each line, print result
sed 's/debug/info/g' app.conf        # replace EVERY match
sed -i.bak 's/debug/info/g' app.conf # edit the file in place, keeping app.conf.bak
sed -n '10,20p' big.log              # print only lines 10–20
```

Without `-i`, `sed` never touches the file. Look at the output first, then add `-i`.

## Putting it together

The ten busiest client IPs in an Nginx access log:

```bash
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
```

Read it left to right: pull out the IP, group identical IPs together, count each group, rank by
count, keep the top ten. Each stage is simple, and the pipe does the rest.

## Try it

```bash
cut -d: -f7 /etc/passwd | sort | uniq -c | sort -rn     # which login shells are in use?
grep -c bash /etc/passwd
ls -l /etc | awk '{print $5, $9}' | sort -rn | head -5  # five biggest files in /etc
```
