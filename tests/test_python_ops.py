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
