---
# No console task: a challenge (#404). The station console has no python3 (module 01).
title: JSON and CSV
minutes: 20
story: |
  **Mission log, day 50.** The depot sends a manifest with every supply run: what it loaded, crate
  by crate. The bay keeps its own record of what actually came off the shuttle. Nobody has ever laid
  one over the other. "Then do it," says Okafor. "Every run, both ways round."
quiz:
  - type: choice
    q: "What does this print?"
    code: |-
      import json

      text = '{"crate": "C-7", "sealed": true, "notes": null}'
      data = json.loads(text)
      print(data["sealed"], data["notes"])
    lang: python
    options:
      - "`true null`: JSON's own words are kept just as they were written"
      - "`True None`: `true` and `null` become Python's own values"
      - "`'true' 'null'`: everything read from JSON comes back as a string"
      - "Nothing: it stops with a `KeyError`, since JSON keys take no quotes"
    answer: 1
    explain: >-
      `json.loads` turns JSON text into Python values: an object into a dict, `true` into `True`,
      `null` into `None`. Numbers become numbers too. Only JSON strings come back as strings.
  - type: choice
    q: "This stops with an error. Why?"
    code: |-
      import json
      print(json.dumps({"crates": {"C-1", "C-2"}}))

      # it stops with:
      TypeError: Object of type set is not JSON serializable
    lang: text
    options:
      - "`json.dumps` only takes strings, so a dict has to be turned into one first"
      - "JSON can't hold a dict inside another dict, so `crates` has to move up"
      - "Crate names with a `-` in them have to be escaped before they're written"
      - "JSON has no sets, so it needs a list: `sorted()` makes one"
    answer: 3
    explain: >-
      JSON has objects, arrays, strings, numbers, `true`, `false` and `null`, and nothing like a set.
      `sorted({"C-1", "C-2"})` gives the list `["C-1", "C-2"]`, which JSON can hold, in an order that
      stays the same from run to run.
  - type: choice
    q: "`row` came from `csv.DictReader`. Why does this stop with a `TypeError`?"
    code: |-
      print(row)
      print(row["mass"] + 1)

      # it prints, then stops with:
      {'crate': 'C-7', 'mass': '12.5'}
      TypeError: can only concatenate str (not "int") to str
    lang: text
    options:
      - "Every value `DictReader` gives is a string, so `float(row[\"mass\"])` comes first"
      - "`DictReader` rows can't be read with square brackets, only with `.get()`"
      - "The header line was read as a row, so `mass` is the word `mass`"
      - "A CSV file can only hold text, so its numbers can't be used at all"
    answer: 0
    explain: >-
      A CSV file is text, and `csv` doesn't guess which columns are numbers, so `'12.5'` arrives in
      quotes. The header became the dict's keys, not a row. Convert what you need, as you did with
      `split` fields in module 04.
  - type: fill
    q: "`listed` is `{\"C-1\", \"C-2\"}` and `arrived` is `{\"C-2\"}`. Which operator, between them, gives the crates in `listed` that aren't in `arrived`?"
    answer: ["-", "listed - arrived"]
    explain: >-
      `listed - arrived` is `{"C-1"}`: what's in the first set and not the second. Swap them for the
      other direction: `arrived - listed` is the empty set here.
  - type: choice
    q: "Two lists hold the same crates in a different order: `[\"C-1\", \"C-2\"]` and `[\"C-2\", \"C-1\"]`. Which is true?"
    options:
      - "`==` says they're equal, because both hold the same two strings"
      - "Turned into sets, they still aren't equal, because their order differs"
      - "`==` says the lists differ, as lists compare in order. Sets are equal"
      - "Neither lists nor sets of strings can be compared with `==` at all"
    answer: 2
    explain: >-
      A list is a sequence, so its order is part of it. A set is only a collection of members, so
      `{"C-1", "C-2"} == {"C-2", "C-1"}` is `True`. To ask "the same crates?", compare sets.
cards:
  - id: json-to-python
    section: "JSON: data written as text"
    front: What do JSON's `true`, `null`, objects and arrays become after `json.loads`?
    back: "`True`, `None`, dicts and lists."
  - id: json-no-sets
    section: "JSON: data written as text"
    front: "`json.dump` stops with `Object of type set is not JSON serializable`. What's the fix?"
    back: "JSON has no sets. Write `sorted(the_set)`, a list, instead."
  - id: dictreader-strings
    section: "CSV: rows under a header"
    front: What type is every value in a row from `csv.DictReader`?
    back: "A string, even `12.5`. Use `float()` or `int()` on the ones you need as numbers."
  - id: set-difference
    section: "Comparing by key: sets"
    accept: ["listed - arrived"]
    front: The crates that are in the set `listed` but not in the set `arrived`
    back: "`listed - arrived`"
challenge:
  from: okafor
  task: |-
    Two records of the same four supply runs are below the editor. `manifest.json` is the depot's:
    a dict whose `"shipments"` key holds a list, one dict per run, each with its `"date"` and a
    `"crates"` list of dicts with an `"id"`. `received.csv` is the bay's: one row per crate that came
    off the shuttle, under the header `date,crate,deck,mass`. Open both to see them.

    Finish three functions, then use them:

    1. **`load_manifest(path)`** returns a dict of each run's crate ids as a **set**, keyed by its date,
       like `{"2026-09-16": {"C-301", "C-302", "C-303"}, …}`.
    2. **`load_received(path)`** returns the same shape from the CSV.
    3. **`reconcile(manifest, received)`** takes two dicts of that shape, and returns a list with a
       dict for each date whose two sets differ, in date order:
       `{"date": …, "missing": […], "extra": […]}`. **`missing`** is the crates the manifest lists that
       never arrived, and **`extra`** is the crates that arrived but aren't on the manifest, each as a
       sorted list. A date in only one of the two dicts counts as a set that differs. Dates that agree
       aren't in the list.

    Then set **`mismatches`** to what `reconcile` gives back for the two dicts your loaders make from
    `manifest.json` and `received.csv`, and write it to **`mismatches.json`**.
    The checks also call `reconcile` with sets of their own. Run it to see what it prints, then Submit
    to run the checks.
  files:
    manifest.json: |
      {
        "manifest": "depot shipments to Meridian",
        "shipments": [
          {"date": "2026-09-16", "run": 31, "crates": [{"id": "C-301", "mass": 40.5}, {"id": "C-302", "mass": 12.0}, {"id": "C-303", "mass": 7.25}]},
          {"date": "2026-09-23", "run": 32, "crates": [{"id": "C-311", "mass": 15.0}, {"id": "C-312", "mass": 26.5}, {"id": "C-313", "mass": 4.0}, {"id": "C-314", "mass": 11.75}]},
          {"date": "2026-09-30", "run": 33, "crates": [{"id": "C-321", "mass": 30.0}, {"id": "C-322", "mass": 18.5}, {"id": "C-324", "mass": 9.0}]},
          {"date": "2026-10-07", "run": 34, "crates": [{"id": "C-331", "mass": 22.0}, {"id": "C-332", "mass": 8.5}, {"id": "C-333", "mass": 40.0}]}
        ]
      }
    received.csv: |
      date,crate,deck,mass
      2026-09-16,C-301,A,40.5
      2026-09-16,C-302,B,12.0
      2026-09-16,C-303,A,7.25
      2026-09-23,C-313,B,4.0
      2026-09-23,C-311,C,15.0
      2026-09-23,C-314,C,11.75
      2026-09-23,C-312,A,26.5
      2026-09-30,C-321,B,30.0
      2026-09-30,C-322,A,18.5
      2026-09-30,C-323,C,61.0
      2026-09-30,C-324,B,9.0
      2026-10-07,C-331,A,22.0
      2026-10-07,C-332,C,8.5
      2026-10-07,C-333,B,40.0
  starter: |-
    import csv
    import json


    def load_manifest(path):
        ...


    def load_received(path):
        ...


    def reconcile(manifest, received):
        ...


    # Set mismatches, write it to mismatches.json, and print it.
  checks:
    - check: 'm = load_manifest("manifest.json"); assert len(m) == 4 and m["2026-09-30"] == {"C-321", "C-322", "C-324"}'
      says: load_manifest gives each run's crate ids as a set, keyed by its date.
    - check: 'r = load_received("received.csv"); assert len(r) == 4 and r["2026-09-23"] == {"C-311", "C-312", "C-313", "C-314"}'
      says: load_received gives each date's crates from the CSV as a set, whatever order the rows are in.
    - check: 'assert mismatches == [{"date": "2026-09-30", "missing": [], "extra": ["C-323"]}]'
      says: mismatches has every run where the two records disagree, and nothing for the runs that agree.
    - check: 'assert reconcile({"d1": {"A", "B"}}, {"d1": {"B", "C"}}) == [{"date": "d1", "missing": ["A"], "extra": ["C"]}]'
      says: reconcile tells missing crates from extra ones, each as a sorted list.
    - check: 'assert reconcile({"d1": {"A"}}, {"d1": {"A"}}) == []'
      says: A run where both records agree isn't reported.
    - check: 'assert reconcile({"d1": {"A"}}, {"d2": {"B"}}) == [{"date": "d1", "missing": ["A"], "extra": []}, {"date": "d2", "missing": [], "extra": ["B"]}]'
      says: A date in only one of the two records is still reported, from either side.
    - check: 'runs = {f"2026-10-{day:02}": {"A"} for day in (18, 11, 25, 14, 9, 30, 21, 16)}; assert [m["date"] for m in reconcile(runs, {})] == sorted(runs)'
      says: The runs come out in date order.
    - check: 'assert json.load(open("mismatches.json")) == mismatches'
      says: mismatches.json holds the same list, written as JSON.
  solution: |-
    import csv
    import json


    def load_manifest(path):
        with open(path) as f:
            manifest = json.load(f)
        by_date = {}
        for shipment in manifest["shipments"]:
            crates = set()
            for crate in shipment["crates"]:
                crates.add(crate["id"])
            by_date[shipment["date"]] = crates
        return by_date


    def load_received(path):
        by_date = {}
        with open(path, newline="") as f:
            for row in csv.DictReader(f):
                date = row["date"]
                if date not in by_date:
                    by_date[date] = set()
                by_date[date].add(row["crate"])
        return by_date


    def reconcile(manifest, received):
        mismatches = []
        for date in sorted(set(manifest) | set(received)):
            listed = manifest.get(date, set())
            arrived = received.get(date, set())
            if listed != arrived:
                mismatches.append({"date": date, "missing": sorted(listed - arrived), "extra": sorted(arrived - listed)})
        return mismatches


    mismatches = reconcile(load_manifest("manifest.json"), load_received("received.csv"))

    with open("mismatches.json", "w") as f:
        json.dump(mismatches, f, indent=2)

    print(mismatches)
comms:
  open:
    - {from: meridian, text: "DEPOT MANIFESTS · RUNS: 4 · BAY RECORDS · RUNS: 4 · RECONCILED: NEVER"}
    - {from: okafor, text: "The depot says what it loaded. The bay says what came off the shuttle. They should be the same list."}
    - {from: okafor, text: "Check every run, both ways round: what never arrived, and what arrived that nobody sent."}
  challenge_done:
    - {from: meridian, text: "RECONCILIATION · MISMATCHES: 1 · RUN 33 · 2026-09-30 · EXTRA: C-323"}
    - {from: okafor, text: "Every other run matches to the crate. Only the thirtieth has one too many."}
    - {from: okafor, text: "C-323 came off that shuttle, and the depot's own manifest says it was never loaded."}
  complete:
    - {from: okafor, text: "Two formats, one comparison. The script doesn't care which file is lying, and that's the point."}
---

## JSON: data written as text

**JSON** is a way of writing data as text, which is how most APIs and many config files send it. You
read it with `jq` in Networking's *APIs and JSON*; here Python reads it. It looks like Python's own
dicts and lists. **`json.loads()` turns JSON text into Python values**, and
**`json.dumps()` turns them back into text**:

```python
import json

text = '{"pump": "P-7", "levels": [4.5, 3.0], "online": true, "note": null}'
data = json.loads(text)
print(data["levels"][1], data["online"], data["note"])
print(json.dumps({"pump": "P-9", "online": False}))
```

```text
3.0 True None
{"pump": "P-9", "online": false}
```

| JSON | Python |
|---|---|
| an object `{"a": 1}` | **a dict** |
| an array `[1, 2]` | **a list** |
| a string `"P-7"` | a string |
| `4.5`, `3` | a number, `float` or `int` |
| `true`, `false`, `null` | **`True`, `False`, `None`** |

**For a file, drop the `s`: `json.load(f)` reads from a file you've opened, and `json.dump(value, f)`
writes to one** opened with `"w"`. `indent=2` lays the output out over several lines, which is easier
for a person to read. **`indent=2` hands the call an extra setting by name**: the name, `=` and the
value, after the usual values. It isn't a variable, and it lasts only for that call. Like `.write()`,
`json.dump` prints nothing: open the file to see what it wrote, and note that it ends the file without
a newline:

```python
with open("pumps.json", "w") as f:
    json.dump({"pumps": ["P-7", "P-9"]}, f, indent=2)
```

**JSON has nothing like a set.** `json.dump` of one stops with `TypeError: Object of type set is not
JSON serializable`, which means it can't be written as JSON, so **turn a set into a list with `sorted()` before writing it**.

## Nested data

JSON is often a dict holding lists of dicts. **Read it one step at a time, left to right**: each
`[…]` reads from whatever the step before it gave back.

```python
station = json.loads('{"decks": [{"name": "A", "pumps": [{"id": "P-7"}, {"id": "P-8"}]}]}')
print(station["decks"][0]["pumps"][1]["id"])

for deck in station["decks"]:
    for pump in deck["pumps"]:
        print(deck["name"], pump["id"])
```

```text
P-8
A P-7
A P-8
```

`station["decks"]` is a list, `[0]` its first deck, `["pumps"]` that deck's list, and so on. **A loop
inside a loop walks a list inside a list**: the inner loop runs completely for each pass of the outer
one.

## CSV: rows under a header

A **CSV** file is a table as text: a header line naming the columns, then one line per row, the
values separated by commas. **`csv.DictReader` reads it one row at a time, each row a dict keyed by
the header's names**. Given this `pumps.csv`:

```text
pump,level
P-7,4.5
P-9,3.0
```

```python
import csv

with open("pumps.csv", newline="") as f:
    for row in csv.DictReader(f):
        print(row["pump"], float(row["level"]) + 1)
```

```text
P-7 5.5
P-9 4.0
```

Open the file with **`newline=""`**, a setting by name like `indent=2`, which the `csv` module asks for so that it can handle the line
endings itself. **Every value is a string**, `'4.5'` as much as `'P-7'`, so `float()` or `int()` the
ones you need as numbers. The header line isn't a row: it's where the keys come from.

## Comparing by key: sets

A **set** holds values with **no order and no duplicates**. Write one in curly braces with no colons,
`{"C-1", "C-2"}`. **`set()` is an empty set**, because `{}` is an empty dict. **`.add()` puts a value
in**, and adding one that's already there changes nothing. **`set(d)` makes a set of a dict's keys.**

Two sets compare by their members alone, so **`==` asks "the same values?", whatever order they came
in**. Lists compare in order, so `["C-1", "C-2"] == ["C-2", "C-1"]` is `False`. Sets also answer the
questions a reconciliation asks:

| Write | Gives |
|---|---|
| `ordered - counted` | **what's in `ordered` and not in `counted`** |
| `counted - ordered` | the other direction: what's in `counted` and not in `ordered` |
| `ordered & counted` | what's in both |
| `ordered \| counted` | **what's in either**, each once |
| `sorted(ordered)` | a list, in order, which JSON can hold |

**Dates written `YYYY-MM-DD` sort as text into date order**, so `sorted()` on a dict's date keys
gives the dates in date order.

To group rows by a key into sets, start each key's set the first time you meet it:

```python
rows = [{"pump": "P-7", "deck": "A"}, {"pump": "P-9", "deck": "B"}, {"pump": "P-8", "deck": "A"}]
by_deck = {}
for row in rows:
    deck = row["deck"]
    if deck not in by_deck:
        by_deck[deck] = set()
    by_deck[deck].add(row["pump"])
print(sorted(by_deck["A"]))
```

```text
['P-7', 'P-8']
```

Those rows are records, as in module 02, and the same shape `csv.DictReader` hands over. **When a
key might be missing from one of two dicts, `.get(key, set())` gives an empty set instead**, and an
empty set compares as different from one with anything in it.

**On the real station:** `run()` in `app/static/py/challenge_runner.py` is what runs your challenge,
here in the browser. It starts with `spec = json.loads(request)` and ends with `json.dumps(…)`,
because the page's JavaScript can't hold Python's dicts and lists, but both sides can read JSON text.
Every Submit you make crosses that line twice.

## Try it

On your own machine, if you have one to hand. Python is the only thing it needs (module 01).

```bash
cd "$(mktemp -d)"
printf '{"pumps": [{"id": "P-7"}, {"id": "P-8"}, {"id": "P-9"}]}\n' > expected.json
printf 'pump,level\nP-9,3.0\nP-7,4.5\nP-6,2.0\n' > seen.csv
cat > pumps.py <<'EOF'
import csv
import json

with open("expected.json") as f:
    expected = set()
    for pump in json.load(f)["pumps"]:
        expected.add(pump["id"])

seen = set()
with open("seen.csv", newline="") as f:
    for row in csv.DictReader(f):
        print(repr(row["level"]))            # '3.0', '4.5', '2.0': strings
        seen.add(row["pump"])

print(sorted(expected - seen))               # ['P-8']: expected, never seen
print(sorted(seen - expected))               # ['P-6']: seen, never expected
print(sorted(expected & seen))               # ['P-7', 'P-9']
print(["P-7", "P-9"] == ["P-9", "P-7"])      # False: lists keep order
print({"P-7", "P-9"} == {"P-9", "P-7"})      # True: sets don't

with open("report.json", "w") as f:
    json.dump({"missing": sorted(expected - seen)}, f, indent=2)
EOF
python3 pumps.py
cat report.json
python3 -c 'import json; print(json.loads("{\"ok\": true, \"note\": null}"))'   # {'ok': True, 'note': None}
python3 -c 'import json; json.dumps({"P-7"})'
```

`report.json` holds `"missing"` with its list laid out over several lines. The last command fails on
purpose: read the bottom line of its traceback.
