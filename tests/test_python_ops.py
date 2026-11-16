"""Unit 2.1, Python for operations: what each module has to hold, beyond the rules every module
meets. Whether a solution passes is test_challenge.py's; here, wrong attempts must fail."""

import pytest

from app import challenge
from tests.conftest import real_catalog


def _module(slug):
    return real_catalog().modules[slug]


def _is_complete_content(module, *, beats):
    assert module.body_html
    assert module.challenge or module.lab
    assert any(q.type == "choice" and q.code for q in module.quiz), "a scenario question"
    assert len(module.cards) >= 3  # the loader refuses a card whose section isn't a heading
    for beat in beats:
        assert getattr(module.comms, beat), beat


@pytest.mark.criterion(398, "Module 01 of Unit 2.1 is complete content")
def test_module_01_is_complete():
    _is_complete_content(_module("from-bash-to-python"), beats=("open", "complete"))


FIGURES = 'crate = "hull  plate"\ncount_text = "3"\nmass_text = "42.5"\n'


@pytest.mark.criterion(398, "Module 01's challenge can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("attempt", "failing"),
    [
        pytest.param(
            'count = count_text\nmass = mass_text\ntotal = 127.5\nline = f"{crate}: {count} x {mass} kg = {total} kg"',
            [0, 1],
            id="the figures left as text",
        ),
        pytest.param(
            'count = int(count_text)\nmass = float(mass_text)\ntotal = f"{count * mass}"\nline = f"{crate}: {count} x {mass} kg = {total} kg"',
            [2],
            id="the total kept as text",
        ),
        pytest.param(
            'count = int(count_text)\nmass = float(mass_text)\ntotal = count * mass\nline = f"{" ".join(crate.split())}: {count} x {mass} kg = {total} kg"',
            [3],
            id="the name's spaces squeezed, as an unquoted Bash variable does",
        ),
        pytest.param(
            'count = int(count_text)\nmass = float(mass_text)\ntotal = count * mass\nline = "{crate}: {count} x {mass} kg = {total} kg"',
            [3],
            id="no f before the quote",
        ),
    ],
)
def test_module_01s_wrong_attempts_fail(attempt, failing):
    module = _module("from-bash-to-python")
    results = challenge.run_in_cpython(module, FIGURES + attempt)
    assert [i for i, passed in enumerate(results) if not passed] == failing


@pytest.mark.criterion(399, "Module 02 of Unit 2.1 is complete content")
def test_module_02_is_complete():
    _is_complete_content(_module("lists-dicts-and-loops"), beats=("open", "complete"))


CLIPBOARD = _module("lists-dicts-and-loops").challenge.starter
REST = """
total_crates = len(crates)
decks = sorted(totals)
grand = sum(totals.values())
report = [f"{deck}: {totals[deck]} kg" for deck in decks]
"""
ADDED_UP = """
totals = {}
for crate in crates:
    deck = crate["deck"]
    totals[deck] = totals.get(deck, 0) + crate.get("mass", 0)
"""


@pytest.mark.criterion(399, "Module 02's challenge can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("attempt", "failing"),
    [
        pytest.param(ADDED_UP + REST, [], id="the right answer, as a check on this test"),
        pytest.param(ADDED_UP.replace('totals.get(deck, 0) + crate.get("mass", 0)', 'crate.get("mass", 0)') + REST, [1, 3, 4], id="each crate overwrites the deck's total"),
        pytest.param(ADDED_UP + REST.replace("sorted(totals)", "list(totals)"), [2, 4], id="the decks in the order they were met"),
        pytest.param(ADDED_UP.replace('crate.get("mass", 0)', 'crate["mass"]') + REST, [0, 1, 2, 3, 4, 5], id="the crate with no mass stops the program"),
        pytest.param(ADDED_UP + REST.replace(" kg", ""), [4], id="the report without its units"),
    ],
)
def test_module_02s_wrong_attempts_fail(attempt, failing):
    module = _module("lists-dicts-and-loops")
    results = challenge.run_in_cpython(module, CLIPBOARD + attempt)
    assert [i for i, passed in enumerate(results) if not passed] == failing


@pytest.mark.criterion(400, "Module 03 of Unit 2.1 is complete content")
def test_module_03_is_complete():
    _is_complete_content(_module("conditions-functions-and-imports"), beats=("open", "complete"))


CLASSIFY = """
def classify(crate):
    if crate.get("hazard"):
        return "hazmat"
    mass = crate.get("mass")
    if mass is None:
        return "rescan"
    if mass > 100:
        return "heavy"
    return "standard"
"""
LIFTS = """
import math
def lifts(mass):
    return math.ceil(mass / 40)
"""
COUNT = """
def count_classes(crates):
    counts = {}
    for crate in crates:
        kind = classify(crate)
        counts[kind] = counts.get(kind, 0) + 1
    return counts
"""


@pytest.mark.criterion(400, "Module 03's challenge can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("attempt", "failing"),
    [
        pytest.param(CLASSIFY + LIFTS + COUNT, [], id="the right answer, as a check on this test"),
        pytest.param(CLASSIFY.replace("if mass is None:", "if not mass:") + LIFTS + COUNT, [5], id="0 treated as missing"),
        pytest.param(CLASSIFY.replace("mass > 100", "mass >= 100") + LIFTS + COUNT, [1], id="exactly 100 counted as heavy"),
        pytest.param(
            CLASSIFY.replace('    if crate.get("hazard"):\n        return "hazmat"\n', "").replace('return "rescan"\n', 'return "rescan"\n    if crate.get("hazard"):\n        return "hazmat"\n') + LIFTS + COUNT,
            [3],
            id="the mass tested before the hazard",
        ),
        pytest.param(CLASSIFY.replace('crate.get("hazard")', '"hazard" in crate') + LIFTS + COUNT, [2], id="a false hazard counted because the key is there"),
        pytest.param(CLASSIFY.replace('crate.get("mass")', 'crate["mass"]') + LIFTS + COUNT, [4, 7], id="a missing mass stopping with a KeyError"),
        pytest.param(CLASSIFY.replace('return "heavy"', 'print("heavy")') + LIFTS + COUNT, [0, 7], id="printed rather than returned"),
        pytest.param(CLASSIFY + LIFTS.replace("math.ceil(mass / 40)", "int(mass / 40) + 1") + COUNT, [6], id="always a trip extra, wrong on an exact fit"),
        pytest.param(CLASSIFY + LIFTS.replace("math.ceil(mass / 40)", "round(mass / 40)") + COUNT, [6], id="rounded to nearest, not up"),
        pytest.param(CLASSIFY + LIFTS + COUNT.replace("kind = classify(crate)", 'kind = "heavy" if crate.get("mass", 0) > 100 else "standard" if crate else "rescan"'), [8], id="the rules repeated instead of calling classify"),
    ],
)
def test_module_03s_wrong_attempts_fail(attempt, failing):
    module = _module("conditions-functions-and-imports")
    results = challenge.run_in_cpython(module, attempt)
    assert [i for i, passed in enumerate(results) if not passed] == failing


def test_module_03s_starter_fails_every_check_about_the_functions():
    module = _module("conditions-functions-and-imports")
    assert not any(challenge.run_in_cpython(module, module.challenge.starter))


@pytest.mark.criterion(401, "Module 04 of Unit 2.1 is complete content")
def test_module_04_is_complete():
    _is_complete_content(_module("parsing-text"), beats=("open", "complete"))


LOG = _module("parsing-text").challenge.starter.split("\n\n\ndef parse")[0] + "\n"
HAND = """
def parse(line):
    if line.startswith("HS-2"):
        fields = line.split("|")
        return {"id": fields[1].strip(), "deck": fields[3].strip(), "mass": float(fields[2])}
"""
BELT = """
    if line.startswith("BELT"):
        fields = line.split()
        return {"id": fields[1], "deck": fields[3], "mass": float(fields[2])}
"""
GATE = """
    if line.startswith("GATE"):
        crate = re.search(r"(C-\\d+)", line)
        deck = re.search(r"deck ([A-Z])", line)
        mass = re.search(r"([\\d.]+) kg", line)
        if crate is None or deck is None or mass is None:
            return None
        return {"id": crate.group(1), "deck": deck.group(1), "mass": float(mass.group(1))}
    return None
"""
RECORDS = """
records = []
for line in lines:
    record = parse(line)
    if record is not None:
        records.append(record)
"""
BY_POSITION = """
    if line.startswith("GATE"):
        fields = line.split()
        return {"id": fields[2], "deck": fields[5], "mass": float(fields[7])}
    return None
"""


@pytest.mark.criterion(401, "Module 04's challenge can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("attempt", "failing"),
    [
        pytest.param(HAND + BELT + GATE + RECORDS, [], id="the right answer, as a check on this test"),
        pytest.param(HAND + BELT.replace("line.split()", 'line.split(" ")') + GATE, [3, 8], id="split at single spaces"),
        pytest.param(HAND.replace("fields[1].strip()", "fields[1]").replace("fields[3].strip()", "fields[3]") + BELT + GATE + RECORDS, [0, 1], id="hand-scanner fields not stripped"),
        pytest.param(
            (HAND + BELT + GATE).replace('line.startswith("BELT")', '"BELT" in line'),
            [4, 8],
            id="in rather than startswith, catching the comment",
        ),
        pytest.param(HAND + BELT + BY_POSITION, [6, 7, 8], id="the gate's sentence read by position"),
        pytest.param(HAND + BELT + GATE.replace("        if crate is None or deck is None or mass is None:\n            return None\n", ""), [7, 8], id="no None check before .group"),
        pytest.param(HAND + BELT + GATE.replace("([\\d.]+) kg", "(\\d+) kg") + RECORDS, [5, 6], id="a mass pattern with no dot"),
        pytest.param(HAND.replace("float(fields[2])", "fields[2]") + BELT + GATE + RECORDS, [0, 1], id="the mass kept as text"),
        pytest.param(HAND + BELT + GATE + "records = []\n", [8], id="records never filled"),
    ],
)
def test_module_04s_wrong_attempts_fail(attempt, failing):
    module = _module("parsing-text")
    results = challenge.run_in_cpython(module, LOG + attempt)
    assert [i for i, passed in enumerate(results) if not passed] == failing


def test_module_04s_starter_fails():
    module = _module("parsing-text")
    assert not all(challenge.run_in_cpython(module, module.challenge.starter))


def test_module_04s_comms_figures_are_the_logs():
    """MERIDIAN says 10 lines, 6 records, 4 skipped: true of the challenge's `lines`."""
    module = _module("parsing-text")
    namespace = {}
    exec(module.challenge.solution.replace("print(records)", ""), namespace)
    said = " ".join(message.text for beat in (module.comms.open, module.comms.complete) for message in beat)
    lines, records = namespace["lines"], namespace["records"]
    assert f"LINES: {len(lines)}" in said
    assert f"RECORDS: {len(records)}" in said
    assert f"LINES SKIPPED: {len(lines) - len(records)}" in said
@pytest.mark.criterion(402, "Module 05 of Unit 2.1 is complete content")
def test_module_05_is_complete():
    module = _module("files-and-paths")
    _is_complete_content(module, beats=("open", "challenge_done", "complete"))
    assert module.challenge.files, "the challenge reads files of its own"


SHELVES = _module("files-and-paths").challenge.solution
NOT_CLOSED = """summary = open("summary.txt", "w")
for date in sorted(counts):
    summary.write(f"{date}: {counts[date]} crates\\n")
"""
OPENED_EACH_PASS = """for date in sorted(counts):
    with open("summary.txt", "w") as summary:
        summary.write(f"{date}: {counts[date]} crates\\n")
"""
WRITE = """with open("summary.txt", "w") as summary:
    for date in sorted(counts):
        summary.write(f"{date}: {counts[date]} crates\\n")
"""


@pytest.mark.criterion(402, "Module 05's challenge can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("attempt", "failing"),
    [
        pytest.param(SHELVES, [], id="the right answer, as a check on this test"),
        pytest.param(SHELVES.replace('folder.glob("*.txt")', 'folder.glob("*")'), [0, 1, 2, 4], id="every file in the folder, the README too"),
        pytest.param(SHELVES.replace("counts[path.stem]", "counts[path.name]"), [0, 4], id="keyed by the name, .txt and all"),
        pytest.param(SHELVES.replace("            line = line.strip()\n", ""), [0, 1, 2, 3, 4, 5], id="lines not stripped, so a blank one is a newline"),
        pytest.param(SHELVES.replace(' or line.startswith("#")', ""), [0, 4], id="header lines counted as crates"),
        pytest.param(SHELVES.replace(WRITE, OPENED_EACH_PASS), [4], id='opened with "w" on every pass'),
        pytest.param(SHELVES.replace('crates\\n")', 'crates")'), [4, 5], id="no newline after each line"),
        pytest.param(SHELVES.replace(WRITE, 'with open("summary.txt", "w") as summary:\n    summary.write("\\n".join(f"{d}: {counts[d]} crates" for d in sorted(counts)))\n'), [5], id="no newline after the last line"),
        pytest.param(SHELVES.replace(WRITE, NOT_CLOSED), [4, 5], id="opened without with and never closed, so nothing is saved"),
    ],
)
def test_module_05s_wrong_attempts_fail(attempt, failing):
    assert attempt != SHELVES or not failing, "the replace didn't change the solution"
    results = challenge.run_in_cpython(_module("files-and-paths"), attempt)
    assert [i for i, passed in enumerate(results) if not passed] == failing


def test_module_05s_starter_fails():
    module = _module("files-and-paths")
    assert not all(challenge.run_in_cpython(module, module.challenge.starter))


def test_module_05s_comms_are_true_of_its_files():
    """MERIDIAN's readouts are the challenge's files, and the clue is in them for the learner to find:
    C-323 is in the 2026-09-30 shipment and in no other record. The crew name it only in
    challenge_done (#422): complete plays whether or not the challenge was done."""
    module = _module("files-and-paths")
    files = module.challenge.files
    said = " ".join(message.text for beat in (module.comms.open, module.comms.complete) for message in beat)
    shipments = sorted(path.split("/")[1].removesuffix(".txt") for path in files if path.endswith(".txt") and path.startswith("receiving/"))
    assert f"SHIPMENTS: {len(shipments)} · {shipments[0]} TO {shipments[-1]}" in said
    assert "C-323 C 61.0\n" in files["receiving/2026-09-30.txt"]
    assert "C-323" not in said
    found = " ".join(message.text for message in module.comms.challenge_done)
    assert "CRATE C-323 · SHIPMENT 2026-09-30 · DECK C · 61.0 KG" in found and "Sixty-one kilos" in found
    assert "C-323" not in files["stores.txt"]
    assert sum("C-323" in contents for contents in files.values()) == 1, "no other record mentions it"
@pytest.mark.criterion(403, "Module 06 of Unit 2.1 is complete content")
def test_module_06_is_complete():
    _is_complete_content(_module("errors-and-exit-codes"), beats=("open", "challenge_done", "complete"))


REPORT = _module("errors-and-exit-codes").challenge.solution
WHOLE_LOOP_TRIED = """    try:
        for record in records:
            mass = parse_mass(record)
            total = total + mass
    except ValueError:
        bad = bad + 1"""
EACH_RECORD_TRIED = """    for record in records:
        try:
            mass = parse_mass(record)
        except ValueError:
            bad = bad + 1
            continue
        total = total + mass"""


@pytest.mark.criterion(403, "Module 06's challenge can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("old", "new", "failing"),
    [
        pytest.param("", "", [], id="the right answer, as a check on this test"),
        pytest.param("except ValueError:", "except:", [4], id="a bare except, hiding a real error"),
        pytest.param("except ValueError:", "except Exception:", [4], id="except Exception, hiding a real error"),
        pytest.param('raise ValueError(f"expected 3 fields: {record}")', "return 0", [1, 3], id="a made-up 0 for a short record"),
        pytest.param(EACH_RECORD_TRIED, WHOLE_LOOP_TRIED, [3], id="the try around the whole loop, so the first bad record ends it"),
        pytest.param("        return 1\n", "        return 0\n", [5, 6], id="main always gives back 0"),
        pytest.param('if __name__ == "__main__":\n    sys.exit(main(records))', "main(records)", [6], id="main run, but its status never used"),
        pytest.param("        return 1\n    return 0", "        sys.exit(1)\n    sys.exit(0)", [5], id="main exits itself instead of giving back its status"),
    ],
)
def test_module_06s_wrong_attempts_fail(old, new, failing):
    assert REPORT.count(old) == 1 or not old, "the replace has to change the solution"
    attempt = REPORT.replace(old, new) if old else REPORT
    results = challenge.run_in_cpython(_module("errors-and-exit-codes"), attempt)
    assert [i for i, passed in enumerate(results) if not passed] == failing


def test_module_06s_starter_fails():
    module = _module("errors-and-exit-codes")
    assert not any(challenge.run_in_cpython(module, module.challenge.starter))


def test_module_06s_comms_are_true_of_its_records():
    """MERIDIAN's readouts are the challenge's records: the old script died at the first bad one."""
    module = _module("errors-and-exit-codes")
    namespace = {"__name__": "module_06"}  # not "__main__", so the guard doesn't exit
    exec(module.challenge.solution, namespace)
    records, result = namespace["records"], namespace["summarise"](namespace["records"])

    def bad(record):
        try:
            namespace["parse_mass"](record)
        except ValueError:
            return True
        return False

    first_bad = next(i for i, record in enumerate(records) if bad(record)) + 1
    said = lambda beat: " ".join(m.text for m in getattr(module.comms, beat))  # noqa: E731
    assert f"FAILED AT RECORD {first_bad} OF {len(records)}" in said("open")
    assert f"TOTAL: {result['total']} KG · BAD RECORDS: {result['bad']} · EXIT STATUS: 1" in said("challenge_done")
    assert "Three bad records" in said("challenge_done") and result["bad"] == 3
@pytest.mark.criterion(404, "Module 07 of Unit 2.1 is complete content")
def test_module_07_is_complete():
    module = _module("json-and-csv")
    _is_complete_content(module, beats=("open", "challenge_done", "complete"))
    assert set(module.challenge.files) == {"manifest.json", "received.csv"}


LEDGERS = _module("json-and-csv").challenge.solution
AS_LISTS = [
    ("crates = set()", "crates = []"),
    ("crates.add(", "crates.append("),
    ("by_date[date] = set()", "by_date[date] = []"),
    ("by_date[date].add(", "by_date[date].append("),
    ("manifest.get(date, set())", "manifest.get(date, [])"),
    ("received.get(date, set())", "received.get(date, [])"),
    ("sorted(listed - arrived)", "[c for c in listed if c not in arrived]"),
    ("sorted(arrived - listed)", "[c for c in arrived if c not in listed]"),
]


@pytest.mark.criterion(404, "Module 07's challenge can be solved with what the lesson teaches")
@pytest.mark.parametrize(
    ("swaps", "failing"),
    [
        pytest.param([], [], id="the right answer, as a check on this test"),
        pytest.param(AS_LISTS, [0, 1, 2], id="lists compared, so a run in another order looks different"),
        pytest.param([("sorted(set(manifest) | set(received))", "sorted(manifest)")], [5], id="only the manifest's dates, missing a run only the bay has"),
        pytest.param(
            [('"missing": sorted(listed - arrived), "extra": sorted(arrived - listed)', '"missing": sorted(listed ^ arrived), "extra": []')],
            [2, 3, 5],
            id="one difference both ways, losing which side each crate is on",
        ),
        pytest.param([("sorted(listed - arrived)", "listed - arrived"), ("sorted(arrived - listed)", "arrived - listed")], list(range(8)), id="sets written to JSON"),
        # Check 5 holds two dates, so a set's order fails it too about half the time (the hash seed).
        pytest.param([("sorted(set(manifest) | set(received))", "set(manifest) | set(received)")], [6], id="dates in a set's order, not date order"),
        pytest.param([('with open("mismatches.json", "w") as f:\n    json.dump(mismatches, f, indent=2)\n', "")], [7], id="mismatches.json never written"),
    ],
)
def test_module_07s_wrong_attempts_fail(swaps, failing):
    attempt = LEDGERS
    for old, new in swaps:
        assert attempt.count(old) == 1, old
        attempt = attempt.replace(old, new)
    results = challenge.run_in_cpython(_module("json-and-csv"), attempt)
    failed = [i for i, passed in enumerate(results) if not passed]
    if "for date in set(manifest) | set(received):" in attempt:
        failed = [i for i in failed if i != 5]  # two dates: by luck either way
    assert failed == failing


def test_module_07s_starter_fails():
    module = _module("json-and-csv")
    assert not any(challenge.run_in_cpython(module, module.challenge.starter))


def test_module_07s_clue_agrees_with_module_05():
    """Clue 2 is clue 1's crate seen from the depot's side: the same four runs, the same crates and
    masses as module 05's receiving files, and only run 33 disagreeing, by C-323."""
    import csv
    import io
    import json

    files = _module("json-and-csv").challenge.files
    manifest = json.loads(files["manifest.json"])
    received = list(csv.DictReader(io.StringIO(files["received.csv"])))
    shipped = {(s["date"], c["id"], c["mass"]) for s in manifest["shipments"] for c in s["crates"]}
    arrived = {(r["date"], r["crate"], float(r["mass"])) for r in received}
    assert arrived - shipped == {("2026-09-30", "C-323", 61.0)} and shipped <= arrived
    decks = {(r["date"], r["crate"], r["deck"], float(r["mass"])) for r in received}

    receiving = {p: t for p, t in _module("files-and-paths").challenge.files.items() if p.startswith("receiving/2026")} if "files-and-paths" in real_catalog().modules else {}
    for path, text in receiving.items():  # module 05, once it's merged
        date = path.removeprefix("receiving/").removesuffix(".txt")
        lines = [line.split() for line in text.splitlines() if line.strip() and not line.startswith("#")]
        assert {(date, crate, deck, float(mass)) for crate, deck, mass in lines} == {d for d in decks if d[0] == date}, path

    said = " ".join(m.text for m in _module("json-and-csv").comms.challenge_done)
    run = next(s["run"] for s in manifest["shipments"] if s["date"] == "2026-09-30")
    assert f"MISMATCHES: 1 · RUN {run} · 2026-09-30 · EXTRA: C-323" in said
    assert f"RUNS: {len(manifest['shipments'])}" in " ".join(m.text for m in _module("json-and-csv").comms.open)


@pytest.mark.criterion(405, "Module 08 of Unit 2.1 is complete content")
def test_module_08_is_complete():
    module = _module("running-commands")
    _is_complete_content(module, beats=("open", "lab_done", "complete"))
    assert module.lab and not module.challenge


@pytest.mark.criterion(405, "Module 08's lab checks hold on any machine")
def test_module_08s_lab_catches_the_shortcuts():
    """The pasted output and script are checked for the ways this goes wrong: a shell running the crate
    name, output never captured, and a git log run outside the empty repository. git's message itself
    isn't matched word for word, since a git in another language translates it."""
    from app import lab

    module = _module("running-commands")
    output, script = (box.example for box in module.lab.boxes)
    assert lab.grade(module.lab, [output, script]).passed

    shelled = output.replace("echo: C-323; echo INJECTED", "echo: C-323\nINJECTED")
    assert not lab.grade(module.lab, [shelled, script.replace("capture_output=True, text=True)\n    print(\"echo:", "shell=True)\n    print(\"echo:")]).passed
    outside = output.replace("log: fatal: your current branch 'main' does not have any commits yet", "log: fatal: not a git repository (or any of the parent directories): .git")
    assert not lab.grade(module.lab, [outside, script.replace('cwd="empty-repo", ', "")]).passed  # box 2 wants cwd
    assert lab.grade(module.lab, [output.replace("fatal: your current branch", "fatal: Ihr aktueller Branch"), script]).passed  # git in German
    uncaptured = output.replace("version: git version 2.43.0", "git version 2.43.0\nversion:")
    assert not lab.grade(module.lab, [uncaptured, script]).passed


def test_module_08s_comms_count_what_the_lab_does():
    module = _module("running-commands")
    script = module.lab.boxes[1].example
    runs = script.count("subprocess.run(")
    handled = script.count("except ") + script.count("log.returncode")
    said = " ".join(m.text for m in module.comms.lab_done)
    assert f"COMMANDS RUN: {runs} · FAILURES HANDLED: {handled}" in said and runs == 5 and handled == 3


@pytest.mark.criterion(406, "Module 09 of Unit 2.1 is complete content")
def test_module_09_is_complete():
    module = _module("a-proper-cli")
    _is_complete_content(module, beats=("open", "lab_done", "complete"))
    assert module.lab and not module.challenge


@pytest.mark.criterion(406, "Module 09's lab checks hold on any machine")
def test_module_09s_lab_checks_hold_on_any_machine():
    """The example is a real run on Python 3.12. Python 3.9, a Mac's own, heads the options
    "optional arguments:", a Mac's wc pads its count, and the summary can come before the data when
    stdout isn't a terminal: all of those still pass. The shortcuts don't."""
    from app import lab

    module = _module("a-proper-cli")
    examples = [box.example for box in module.lab.boxes]
    assert lab.grade(module.lab, examples).passed

    older = [examples[0].replace("options:", "optional arguments:"), examples[1], examples[2].replace("\n3\n", "\n       3\n"), examples[3]]
    assert lab.grade(module.lab, older).passed
    buffered = examples[1].replace("3 crates, 87.75 kg\n", "")
    assert lab.grade(module.lab, [examples[0], "3 crates, 87.75 kg\n" + buffered, *examples[2:]]).passed

    def fails(box, text):
        pasted = list(examples)
        pasted[box] = text
        return not lab.grade(module.lab, pasted).passed

    assert fails(2, "4\n")  # the summary printed to stdout, so it went down the pipe
    assert fails(1, examples[1] + "2026-10-07 C-332 8.5\n")  # --min-mass not applied
    assert fails(3, examples[3].replace("bay_report: can't read missing.csv\nexit 1", "Traceback (most recent call last):\nFileNotFoundError: missing.csv\nexit 1"))
    assert fails(3, examples[3].replace("invalid float value: 'heavy'", "could not convert string to float: 'heavy'"))  # no type=float


def test_module_09s_comms_are_the_labs_figures():
    module = _module("a-proper-cli")
    said = " ".join(m.text for m in module.comms.lab_done)
    assert "CRATES: 3 · 87.75 KG" in said and "3 crates, 87.75 kg" in module.lab.boxes[1].example


@pytest.mark.criterion(407, "Module 10 of Unit 2.1 is complete content")
def test_module_10_is_complete():
    module = _module("venv-and-pip")
    _is_complete_content(module, beats=("open", "lab_done", "complete"))
    assert module.lab and not module.challenge


@pytest.mark.criterion(407, "Module 10's lab checks hold on any machine")
def test_module_10s_lab_checks_hold_on_any_machine():
    """The examples are a real run in ubuntu:24.04 on arm64. The versions pip chose for what requests
    brought, the wheels' names, a fresh download in place of a cached one, a Mac's path and a system
    Python that has a requests of its own (apt's python3-requests printed exactly those three lines in
    the same container) all still pass. The shortcuts don't."""
    from app import lab

    module = _module("venv-and-pip")
    examples = [box.example for box in module.lab.boxes]
    assert lab.grade(module.lab, examples).passed

    def passes(box, text):
        pasted = list(examples)
        pasted[box] = text
        return lab.grade(module.lab, pasted).passed

    later = examples[1].replace("urllib3==2.8.0", "urllib3==2.9.1").replace("certifi==2026.10.23", "certifi==2027.1.4")
    assert passes(1, later.replace("charset-normalizer", "charset_normalizer"))
    downloaded = examples[2].replace("Using cached", "Downloading").replace("manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64", "macosx_10_13_universal2")
    assert passes(2, downloaded)
    system_has_requests = "in a venv: False\nrequests: 2.31.0\nfrom the venv: False\n" + examples[3].split("'requests'\n")[1]
    assert passes(3, system_has_requests)
    assert passes(3, examples[3].replace("/home/cadet/", "/Users/cadet/"))

    assert not passes(0, examples[0].replace("2.34.2", "2.35.0"))  # a bare name: the newest
    assert not passes(0, "in a venv: False\nrequests: 2.34.2\nfrom the venv: False\n")  # not activated
    assert not passes(1, "requests==2.34.2\n")  # typed by hand: nothing it brought is pinned
    assert not passes(1, examples[1].replace("requests==2.34.2", "requests>=2.34.2"))
    satisfied = "Requirement already satisfied: requests==2.34.2 in ./.venv/lib/python3.12/site-packages (from -r requirements.txt (line 4)) (2.34.2)\n"
    assert not passes(2, satisfied)  # the venv was never deleted
    assert not passes(2, examples[2].replace(" (from -r requirements.txt (line 4))", ""))  # installed by name
    assert not passes(3, examples[0])  # only the activated run: nothing ran outside the venv
    assert not passes(3, examples[3].split("in a venv: True")[0])  # the venv's Python never ran by its path


def test_module_10s_comms_count_the_labs_packages():
    module = _module("venv-and-pip")
    pinned = [line for line in module.lab.boxes[1].example.splitlines() if "==" in line]
    said = " ".join(m.text for m in module.comms.lab_done)
    assert f"ASKED FOR: 1 · INSTALLED: {len(pinned)} · PINNED: {len(pinned)}" in said and len(pinned) == 5
    assert module.lab.boxes[2].example.rstrip().splitlines()[-1].count("-") >= len(pinned)  # five installed again


def test_module_10s_real_station_claim_is_the_repos_own_file():
    from pathlib import Path

    lines = (Path(__file__).resolve().parent.parent / "requirements.txt").read_text().splitlines()
    transitive = next(i for i, line in enumerate(lines) if line.startswith("# --- transitive"))
    body = _module("venv-and-pip").body_html
    for pin, block in (("Jinja2==3.1.6", lines[:transitive]), ("MarkupSafe==3.0.4", lines[transitive:])):
        assert pin in block and pin in body


@pytest.mark.criterion(408, "Module 11 of Unit 2.1 is complete content")
def test_module_11_is_complete():
    module = _module("talking-to-an-api")
    _is_complete_content(module, beats=("open", "lab_done", "complete"))
    assert module.lab and not module.challenge


@pytest.mark.criterion(408, "Module 11's lab checks hold on any machine")
def test_module_11s_lab_checks_hold_on_any_machine():
    """The examples are a real run in ubuntu:24.04 against the setup's depot. The only machine-dependent
    text is the script's own spelling, so the checks accept requests' short names (`requests.Timeout`)
    and a stopped depot that's slow to refuse (a connect that times out reads as Timeout). The
    shortcuts don't pass: no timeout, Python's own ConnectionError, and no raise_for_status."""
    from app import lab

    module = _module("talking-to-an-api")
    examples = [box.example for box in module.lab.boxes]
    assert lab.grade(module.lab, examples).passed

    def passes(box, text):
        pasted = list(examples)
        pasted[box] = text
        return lab.grade(module.lab, pasted).passed

    short = examples[2].replace("requests.exceptions.", "requests.")
    assert passes(2, short)
    assert passes(1, examples[1].replace("34: ConnectionError", "34: Timeout"))

    waited = examples[0].replace("latest: Timeout", "latest: status 200\nlatest: crates ['C-331', 'C-332', 'C-333']")
    assert not passes(0, waited)  # no timeout: it waited out the depot's 10 seconds
    assert not passes(2, examples[2].replace(", timeout=2", ""))
    builtin = "Traceback (most recent call last):\nrequests.exceptions.ConnectionError: HTTPConnectionPool(host='127.0.0.1', port=8765)\n"
    assert not passes(1, builtin)  # caught Python's own ConnectionError, which misses requests'
    assert not passes(2, examples[2].replace("except requests.exceptions.ConnectionError", "except ConnectionError"))
    unchecked = examples[0].replace("99: HTTPError 404 Client Error: Not Found for url: http://127.0.0.1:8765/manifests/99", "Traceback (most recent call last):\nKeyError: 'crates'")
    assert not passes(0, unchecked)  # went straight to .json() on the 404's body
    assert not passes(1, examples[0])  # the depot was never stopped
    assert not passes(0, examples[0].replace("latest: Timeout\n", ""))  # a return in main's loop skipped latest
    assert not passes(2, examples[2].replace("exceptions.Timeout", "exceptions.ReadTimeout"))  # the traceback's name, not the family


def test_module_11s_depot_serves_module_07s_run_34():
    """The setup's depot answers with run 34 exactly as module 07's manifest lists it, and the lab's
    crates are its crates."""
    import json
    import re

    setup = _module("talking-to-an-api").lab.setup
    served = json.loads(re.search(r"^RUN_34 = (\{.*\})$", setup, re.M).group(1))
    manifest = json.loads(_module("json-and-csv").challenge.files["manifest.json"])
    assert served == next(s for s in manifest["shipments"] if s["run"] == 34)
    ids = [crate["id"] for crate in served["crates"]]
    assert f"34: crates {ids!r}" in _module("talking-to-an-api").lab.boxes[0].example
    assert "time.sleep(10)" in setup and "timeout=2" in _module("talking-to-an-api").lab.boxes[2].example  # it waits past the timeout


def test_module_11s_comms_are_the_labs_figures():
    module = _module("talking-to-an-api")
    said = " ".join(m.text for m in module.comms.lab_done)
    served = module.lab.boxes[0].example
    assert "MANIFEST 34 · CRATES: 3" in said and served.count("C-3") == 3
    assert "RUN 99: 404" in said and "99: status 404" in served
    assert "GAVE UP AFTER 2 S" in said and "latest: Timeout" in served


def test_module_11s_real_station_claim_is_the_apps_own_client():
    from pathlib import Path

    source = (Path(__file__).resolve().parent.parent / "app" / "ai.py").read_text()
    body = _module("talking-to-an-api").body_html
    assert "timeout=30.0" in source and "timeout=30.0" in body
    assert "fail in seconds, not the SDK's 10 minutes" in source
