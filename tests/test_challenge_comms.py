"""The challenge_done beat (#422): the crew's reply to a challenge's first pass.

Route tests use a throwaway curriculum: unit `shell` has `one`, with a challenge and crew
lines at `open`, `challenge_done` (with a window event) and `complete`, then `two`, quiz only.
"""

import json
import textwrap

import pytest

from app.content import ContentError, get_catalog, load_catalog
from app.main import app
from tests.conftest import csrf
from tests.test_progress import complete
from tests.test_xp import MODULE, SYLLABUS

CAST = """
cast:
  - {slug: okafor, name: Okafor, role: Chief Engineer, avatar: okafor}
"""

CHALLENGE = """challenge:
  from: okafor
  task: Set `x` to 1.
  starter: x = 0
  checks:
    - {check: "assert x == 1", says: x is 1}
  solution: x = 1
"""

COMMS = """comms:
  open:
    - {from: okafor, text: "One, open."}
  challenge_done:
    - {from: okafor, text: "Scripted, *cadet*."}
  complete:
    - {from: okafor, text: "One, done."}
  window: {challenge_done: relay-pass}
"""


def _write(root, challenge=CHALLENGE, comms=COMMS):
    (root / "syllabus.yml").write_text(textwrap.dedent(SYLLABUS) + textwrap.dedent(CAST))
    (root / "core" / "shell").mkdir(parents=True)
    one = MODULE.format(title="One", xp=50).replace("---\nLesson.", challenge + comms + "---\nLesson.", 1)
    (root / "core/shell/01-one.md").write_text(one)
    (root / "core/shell/02-two.md").write_text(MODULE.format(title="Two", xp=50))


@pytest.fixture
def scripted(tmp_path):
    _write(tmp_path)
    catalog = load_catalog(tmp_path)
    app.dependency_overrides[get_catalog] = lambda: catalog
    yield catalog
    app.dependency_overrides.pop(get_catalog, None)


def _report(client, passed, slug="one"):
    return client.post(
        f"/modules/{slug}/challenge",
        content=json.dumps({"code": "x = 1" if passed else "x = 0", "results": [passed]}),
        headers={"Content-Type": "application/json", "X-CSRF-Token": csrf(client)},
    ).json()


@pytest.mark.criterion(422, "A challenge's first pass plays its beat")
def test_a_challenges_first_pass_plays_its_beat(logged_in, scripted):
    logged_in.get("/modules/one")
    failed = _report(logged_in, passed=False)
    assert not failed["correct"] and "comms" not in failed and "window" not in failed

    first = _report(logged_in, passed=True)
    assert first["correct"] and first["xp_gained"] == 30
    assert "Scripted, <em>cadet</em>." in first["comms"] and "is-new" in first["comms"]
    assert "relay-pass" in first["window"]

    again = _report(logged_in, passed=True)
    assert again["correct"] and "comms" not in again and "window" not in again


@pytest.mark.criterion(422, "The beat is derived from progress, like the others")
def test_the_beat_is_derived_from_progress(logged_in, scripted):
    logged_in.get("/modules/one")
    assert "Scripted" not in logged_in.get("/modules/one").text  # not before a pass
    _report(logged_in, passed=True)
    assert logged_in.get("/modules/one").text.count("Scripted, <em>cadet</em>.") == 1  # the module being worked on

    complete(logged_in, "one")
    page = logged_in.get("/modules/two").text
    assert page.count("Scripted, <em>cadet</em>.") == 1  # in the history of a completed module
    assert page.index("One, open.") < page.index("Scripted") < page.index("One, done.")


def test_a_completed_module_without_a_challenge_pass_has_no_beat(logged_in, scripted):
    complete(logged_in, "one")
    page = logged_in.get("/modules/two").text
    assert "One, done." in page and "Scripted" not in page


@pytest.mark.criterion(422, "A challenge_done beat needs a challenge")
def test_a_challenge_done_beat_needs_a_challenge(tmp_path):
    _write(tmp_path, challenge="")
    with pytest.raises(ContentError, match="comms.challenge_done: the module has no challenge"):
        load_catalog(tmp_path)


def test_a_challenge_done_window_event_needs_a_challenge(tmp_path):
    _write(tmp_path, challenge="", comms="comms:\n  window: {challenge_done: relay-pass}\n")
    with pytest.raises(ContentError, match="comms.challenge_done: the module has no challenge"):
        load_catalog(tmp_path)
