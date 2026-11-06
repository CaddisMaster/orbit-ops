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
