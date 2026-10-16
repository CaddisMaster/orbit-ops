---
# No console task: a lab (#121). The console has curl since #166, but only for the station's
# own simulated hosts; a real API needs the real internet.
title: APIs and JSON
minutes: 20
story: |
  **Mission log, day 33.** The telemetry feed is back, and it isn't a page: it's a wall of
  braces and quotes. "Somewhere in there is one number I need," says Okafor. "Get me that
  number, not the wall."
quiz:
  - type: choice
    q: "A script checks the station's status and always says it's down, though the page says `ok`. Why?"
    code: |-
      status=$(curl -s https://status.example.org/health | jq .status)
      if [ "$status" = "ok" ]; then echo up; else echo down; fi
    options:
      - "`jq` prints strings as JSON, with quotes, so `$status` is `\"ok\"`, not `ok`. `jq -r .status` prints the plain text"
      - "`curl -s` hides the body, so `$status` is empty"
      - "`.status` should be `status`, without the dot"
      - "`[ ]` can't compare strings"
    answer: 0
    explain: >-
      Without `-r`, jq prints its answer as JSON, so a string comes out wrapped in double
      quotes. `"ok"` with the quotes isn't `ok`. `-r` (raw) prints strings as plain text, which
      is what you want whenever the result goes into a shell variable or another command.
  - type: choice
    q: "What went wrong?"
    code: |-
      $ jq '.decks.name' telemetry.json
      jq: error (at telemetry.json:9): Cannot index array with string "name"
    options:
      - "`decks` is an array, so you can't ask it for one `name`: `.decks[].name` takes each element's"
      - "The file isn't valid JSON"
      - "There's no field called `name` anywhere"
      - "jq needs `-r` for names"
    answer: 0
    explain: >-
      `.decks` is a list of objects. `.name` asks for a field of one object, and a list doesn't
      have fields. `.[]` (here `.decks[]`) goes into the list and gives each element in turn, so
      `.decks[].name` is every deck's name, one per line.
  - type: choice
    q: "What does `?per_page=5&page=2` at the end of an API's URL do?"
    options:
      - "It's a query string: two parameters for the server, here five results per page, and the second page of them"
      - "It's part of the path, a directory called `per_page=5&page=2`"
      - "It tells curl to make two requests"
      - "It's ignored unless you send it with `-X POST`"
    answer: 0
    explain: >-
      Everything after `?` is the query string: `name=value` pairs joined with `&`, which the
      server reads to decide what to send. Quote the whole URL in the shell, because `&` on its
      own would run the command in the background.
  - type: multi
    q: "Which of these are valid JSON?"
    options:
      - "`{\"deck\": \"cargo\", \"online\": false}`"
      - "`{'deck': 'cargo'}`"
      - "`[20.9, 21.4, 19.1]`"
      - "`{\"deck\": \"cargo\",}`"
    answer: [0, 2]
    explain: >-
      JSON strings and keys use double quotes only, so single quotes aren't JSON. A trailing
      comma isn't allowed either, and jq says so: `parse error: Expected another key-value
      pair`. Numbers, `true`, `false`, `null`, arrays and objects are all fine.
  - type: fill
    q: "Which jq option prints strings without their quotes?"
    answer: ["-r", "--raw-output"]
    explain: >-
      `-r`, raw output. Use it whenever jq's result is going to be read by a person or another
      program rather than by more JSON tools.
cards:
  - id: jq-field
    section: "`jq`: picking things out"
    front: "In jq, how do you take the field `station` from an object, and the first element of the array `decks`?"
    back: "`.station`, and `.decks[0]`"
  - id: jq-each
    section: "`jq`: picking things out"
    accept: [".decks[].name", "jq '.decks[].name'", "jq -r '.decks[].name'"]
    front: "`decks` is an array of objects. Get every one's `name`"
    back: "`.decks[].name`: `.[]` gives each element in turn"
  - id: jq-select
    section: "`select`: only the ones you want"
    accept: [".decks[] | select(.online == false) | .name", "jq -r '.decks[] | select(.online == false) | .name'"]
    front: "The names of the decks whose `online` is `false`"
    back: "`.decks[] | select(.online == false) | .name`"
  - id: jq-raw
    section: "`jq`: picking things out"
    front: "Why use `jq -r`?"
    back: "Without it, strings come out as JSON, in double quotes. `-r` prints plain text, for the shell or a person."
lab:
  from: okafor
  task: |-
    The station's software, this app, lives on GitHub as **`CaddisMaster/orbit-ops`**, and
    GitHub answers questions about it in JSON at **`https://api.github.com/repos/CaddisMaster/orbit-ops`**.
    Its releases are at the same address with **`/releases`** on the end. You don't need an
    account: these addresses are public.

    1. Install the tools if you need to. On Ubuntu: `sudo apt update`, then
       `sudo apt install curl jq`. On a Mac, curl is there; get jq with `brew install jq`.
    2. Look at the repository's JSON with `curl -s` and `jq` to get a feel for it. It's long.
    3. Paste the repository's **full name** and its **default branch**, as plain text, one per
       line, in the first box.
    4. Ask the releases address for **only the three newest releases**, using the query string
       parameter `per_page`, and paste their **tag names**, one per line, in the second box.
    5. Ask for up to 100 releases (`per_page=100`), and pick out the one whose tag name is
       `v0.1.0`. Paste **when it was published**, from its `published_at` field, in the last box.

    Every answer is plain text: no quotes, no braces.
  boxes:
    - prompt: The repository's full name and default branch, one per line.
      checks:
        - {lines: {min: 2, max: 2}, says: "Two lines", hint: "Just the two values, not the JSON around them."}
        - {regex: '^CaddisMaster/orbit-ops\s*$', says: "The full name", hint: "Which field holds the repository's name? Look for it in the JSON from step 2."}
        - {regex: '^main\s*$', says: "The default branch"}
        - {not_contains: '"', says: "Plain text, not JSON strings", hint: "Quotes in the answer? jq prints strings as JSON unless you ask for raw output."}
      example: |
        CaddisMaster/orbit-ops
        main
    - prompt: The three newest releases' tag names, one per line.
      checks:
        - {lines: {min: 3, max: 3}, says: "Three releases", hint: "More than three? The server sends 30 unless the query string asks for fewer: ?per_page=3"}
        - {regex: '\A\s*v\d+\.\d+\.\d+[ \t]*\n[ \t]*v\d+\.\d+\.\d+[ \t]*\n[ \t]*v\d+\.\d+\.\d+\s*\Z', says: "Each line is a tag, like v0.1.0, and nothing else", hint: "/releases is an array, not an object. Which filter goes into each element of one?"}
      example: |
        v0.8.0
        v0.7.0
        v0.6.1
    - prompt: When `v0.1.0` was published.
      checks:
        - {regex: '\A\s*2026-10-08T18:46:54Z\s*\Z', says: "v0.1.0's published_at, and only that", hint: "Keep only the release you want, then pick its field. Quotes in the answer mean -r is missing."}
      example: |
        2026-10-08T18:46:54Z
comms:
  open:
    - {from: meridian, text: "TELEMETRY FEED · ONLINE · FORMAT: JSON · 3 DECKS"}
    - {from: okafor, text: "A program reads that feed in a millisecond, and so should you. Learn to pull one value out of JSON without reading the rest."}
    - {from: okafor, text: "Practise on something real: the station's own software has a public record on GitHub. Get me its name, branch and releases."}
  lab_done:
    - {from: meridian, text: "CaddisMaster/orbit-ops · BRANCH main · v0.1.0 PUBLISHED 2026-10-08T18:46:54Z"}
    - {from: okafor, text: "Three questions, three plain answers, and you never read the wall. That's how a program reads it, and how you'll read the feed."}
  complete:
    - {from: mission, text: "*Meridian*, Mission Control. Your telemetry parses cleanly at our end too. Good to read numbers instead of guesses."}
    - {from: okafor, text: "Everything we've fetched so far went over HTTPS, and we've trusted it without asking why. That's next."}
---

## What an API is

A web page is for people. An **API**, an application programming interface, is the same idea
for programs: a server that answers HTTP requests with **data instead of a page**, in a shape a
program can read. Most APIs answer in **JSON**, and say so in a `Content-Type:
application/json` header. You met one in module 04: this app's `/healthz` is a tiny API.

You ask an API exactly as you'd fetch a page, usually with `GET`, and it answers with a status
code and a JSON body. `curl -s URL` is enough to read one.

## Reading JSON

JSON is text with a handful of rules:

```json
{
  "station": "meridian",
  "updated": "2026-10-08T09:00:00Z",
  "decks": [
    {"name": "life-support", "o2_pct": 20.9, "co2_ppm": 640, "online": true},
    {"name": "hydroponics", "o2_pct": 21.4, "co2_ppm": 410, "online": true},
    {"name": "cargo", "o2_pct": 19.1, "co2_ppm": 1250, "online": false}
  ]
}
```

| Written | Is | Here |
|---|---|---|
| `{ "key": value, … }` | an **object**: named fields | the whole thing; each deck |
| `[ value, … ]` | an **array**: a list, in order | `decks` |
| `"text"` | a string, **in double quotes** | `"meridian"` |
| `20.9`, `640` | a number | `o2_pct` |
| `true`, `false`, `null` | yes, no, nothing | `online` |

Objects and arrays nest as deep as they like. **Keys and strings need double quotes**, and
there's no comma after the last item: `{'deck': 'cargo'}` and `{"deck": "cargo",}` aren't JSON.

## `jq`: picking things out

**`jq`** reads JSON and prints the part you ask for. On Ubuntu, install it with `sudo apt
install jq` (with `sudo apt update` first); on a Mac, `brew install jq`. Give it a filter and
the JSON, from a file or a pipe: `jq FILTER file.json`, or `curl -s URL | jq FILTER`.

| Filter | Gives | Here |
|---|---|---|
| `.` | everything, laid out (and coloured, in a terminal) | the whole feed |
| **`.field`** | **an object's field** | `.station` → `"meridian"` |
| `.a[N].b` | a path: each step goes one level in | `.decks[0].name` → `"life-support"` |
| `.[N]` | an array's element N, counting from 0 | `.decks[0]` → the first deck |
| **`.[]`** | **each element of an array, in turn** | `.decks[]` → three objects |
| `A \| B` | B applied to each thing A gives | `.decks[] \| .name` → three names |
| `length` | how many | `.decks \| length` → `3` |

**`jq -r` prints strings as plain text.** Without it, a string comes out as JSON, quotes and all:

```text
$ jq .station telemetry.json
"meridian"
$ jq -r .station telemetry.json
meridian
$ jq -r '.decks[].name' telemetry.json
life-support
hydroponics
cargo
```

Use `-r` whenever the answer goes into a shell variable or another command, or is for a
person. Quote the filter in single quotes, so the shell leaves `[`, `]`, `|` and spaces alone.

Two mistakes to know by sight. **A field that isn't there gives `null`**, with no error, so a
typo like `.deck` for `.decks` just prints `null`. And `.decks.name` fails with `Cannot index
array with string "name"`: `decks` is an array, and only its elements have names, so it's
`.decks[].name`.

## `select`: only the ones you want

**`select(CONDITION)` keeps only the things for which the condition is true**, and drops the
rest. It goes after `.[]`, so it sees each element in turn, and what's left can go through
another `|`:

```text
$ jq -r '.decks[] | select(.co2_ppm > 1000) | .name' telemetry.json
cargo
$ jq '.decks[] | select(.online == false) | .o2_pct' telemetry.json
19.1
```

Conditions compare with **`==`** (equal: two `=`), `!=`, `<`, `>`, `<=` and `>=`, and combine
with `and` and `or`. A string is compared in double quotes: `select(.name == "cargo")`.

## Query strings

Many APIs take parameters in the URL, after a **`?`**: `name=value` pairs joined by **`&`**.
That's the **query string**. It's how you ask for less, more, or something specific:

```text
https://api.github.com/search/repositories?q=jq&per_page=1
```

Here `q=jq` is what to search for and `per_page=1` asks for one result. Lists in an API come a
page at a time: GitHub sends 30 items unless **`per_page`** says otherwise (up to 100), and
`page=2` asks for the next lot. **Put a URL with a query string in quotes** in the shell:
an unquoted `&` would run the first half of the command in the background, and `?` is a glob.

**On the real station:** `/healthz` answers JSON, and the deploy reads it after every release
to check the new version is the one running. It does that with `grep` for the text
`"version":"X.Y.Z"`, which works because the app always writes that JSON the same way; `jq -r
.version` would still work if the spacing or the order of the fields changed. And the `gh`
command, which opens this project's pull requests, is a client for the same GitHub API you'll
use in the lab: `gh api repos/CaddisMaster/orbit-ops --jq .full_name` asks it through your login.

## Try it

On your own machine. A container needs the tools first: `sudo apt-get update && sudo apt-get
install -y curl jq`.

```bash
cat > telemetry.json <<'EOF'
{"station": "meridian", "decks": [
  {"name": "life-support", "co2_ppm": 640, "online": true},
  {"name": "cargo", "co2_ppm": 1250, "online": false}]}
EOF
jq . telemetry.json                          # laid out, one field per line
jq .station telemetry.json                   # "meridian", in quotes
jq -r .station telemetry.json                # meridian
jq -r '.decks[].name' telemetry.json         # life-support, then cargo
jq '.decks | length' telemetry.json          # 2
jq -r '.decks[] | select(.online == false) | .name' telemetry.json   # cargo
jq .deck telemetry.json                      # null: a typo, and no error
curl -s https://learn.seandesmet.com/healthz | jq -r .status        # ok
curl -s "https://api.github.com/search/repositories?q=jq&per_page=1" | jq -r '.items[0].full_name'   # jqlang/jq
```
