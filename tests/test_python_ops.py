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
