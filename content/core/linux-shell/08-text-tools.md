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
cards:
  - front: Count matching lines with grep
    back: "`grep -c pattern file` (or `grep pattern file | wc -l`)."
  - front: "The 'top N' pipeline"
    back: "`… | sort | uniq -c | sort -rn | head -n N`"
  - front: "`cut -d: -f1 /etc/passwd`"
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

## Counting and ranking

```bash
wc -l access.log                         # how many lines
sort names.txt                           # alphabetical
sort -n sizes.txt                        # numeric (so 10 sorts after 9)
sort -rn                                 # numeric, largest first
uniq -c                                  # collapse ADJACENT duplicates, with counts
head -n 10 / tail -n 10                  # first / last lines
tail -f /var/log/nginx/access.log        # follow a growing file (Ctrl-C to stop)
```

## Cutting columns: cut and awk

```bash
cut -d: -f1 /etc/passwd                  # field 1, fields separated by ':'
awk '{print $1}' access.log              # field 1, separated by whitespace
awk '$9 >= 500 {print $7}' access.log    # path of every 5xx response
```

`cut` is for one fixed delimiter. `awk` handles runs of spaces and lets you add conditions.

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
