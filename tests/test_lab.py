"""Labs (#121): done on your own machine, checked by what you paste.

Route tests use a throwaway curriculum: unit `shell` has `one`, whose lab has two
paste boxes (a git log, a git status) and crew lines at `lab_done`, then `two`,
quiz only. Its syllabus holds the "First lab" badge.
"""

import re
import textwrap
from html import unescape

import pytest
from sqlalchemy import select

from app import lab
from app.content import ContentError, get_catalog, load_catalog
from app.content.schema import (
    ContainsLabCheck,
    LabBox,
    LineCount,
    LinesLabCheck,
    ModuleFile,
    NotContainsLabCheck,
    RegexLabCheck,
)
from app.db import SessionLocal
from app.main import app
from app.models import BadgeEarned, ExerciseAttempt, XpEvent
from tests.conftest import csrf
from tests.test_progress import complete
from tests.test_xp import MODULE, SYLLABUS

EXTRA = """
cast:
  - {slug: okafor, name: Okafor, role: Chief Engineer, avatar: okafor}
badges:
  - slug: first-lab
    name: Field Work
    description: Pass a lab on your own machine.
    emblem: star
    rule: {labs_completed: 1}
"""

LAB = """lab:
  from: okafor
  task: Put the air-mix config under version control, in two commits.
  setup: |
    mkdir -p ~/meridian && cd ~/meridian
  boxes:
    - prompt: The output of `git log --oneline`.
      checks:
        - {lines: {min: 2, max: 2}, says: Two commits, hint: Commit twice.}
        - {regex: '^[0-9a-f]{7,} ', says: Short hashes from git log --oneline}
      example: |
        3f1c2ab Set the O2 floor to 19.5%
        9e0d1f7 Track airmix.conf
    - prompt: The output of `git status`.
      checks:
        - {contains: nothing to commit, says: Nothing left to commit, hint: Commit everything first.}
        - {not_contains: Untracked files, says: No untracked files}
      example: |
        On branch main
        nothing to commit, working tree clean
"""

COMMS = """comms:
  open:
    - {from: okafor, text: "One, open."}
  lab_done:
    - {from: okafor, text: "Lab logged, *cadet*."}
"""

LOG = "3f1c2ab Set the O2 floor to 19.5%\n9e0d1f7 Track airmix.conf\n"
CLEAN = "On branch main\nnothing to commit, working tree clean\n"


def _write(root, lab=LAB, comms=COMMS):
    (root / "syllabus.yml").write_text(textwrap.dedent(SYLLABUS) + textwrap.dedent(EXTRA))
    (root / "core" / "shell").mkdir(parents=True)
    one = MODULE.format(title="One", xp=50).replace("---\nLesson.", lab + comms + "---\nLesson.", 1)
    (root / "core/shell/01-one.md").write_text(one)
    (root / "core/shell/02-two.md").write_text(MODULE.format(title="Two", xp=50))


@pytest.fixture
def labs(tmp_path):
    _write(tmp_path)
    catalog = load_catalog(tmp_path)
    app.dependency_overrides[get_catalog] = lambda: catalog
    yield catalog
    app.dependency_overrides.pop(get_catalog, None)


def submit(client, *pastes, slug="one"):
    return client.post(
        f"/modules/{slug}/lab",
        data={"box": list(pastes)},
        headers={"HX-Request": "true", "X-CSRF-Token": csrf(client)},
    )


def _attempts(user_id):
    with SessionLocal() as db:
        return list(db.scalars(select(ExerciseAttempt).where(ExerciseAttempt.user_id == user_id, ExerciseAttempt.kind == "lab")))


def _lab_xp(user_id):
    with SessionLocal() as db:
        return list(db.scalars(select(XpEvent.amount).where(XpEvent.user_id == user_id, XpEvent.reason == "lab")))


def _text(html):
    """What a reader sees: tags dropped, whitespace collapsed, entities unescaped."""
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", html))).strip()


def _checks(html):
    """(passed?, what it says) for each check listed in the response."""
    return [(cls == "is-right", _text(says)) for cls, says in re.findall(r'<li class="(is-right|is-wrong)"><span class="mark"[^>]*>.</span>\s*(.*?)</li>', html, re.S)]


# --- the checks -------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("rule", "text", "ok"),
    [
        (ContainsLabCheck(contains="clean", says="s"), "working tree clean", True),
        (ContainsLabCheck(contains="Clean", says="s"), "working tree clean", False),  # case-sensitive
        (NotContainsLabCheck(not_contains="Untracked", says="s"), "nothing to commit", True),
        (NotContainsLabCheck(not_contains="Untracked", says="s"), "Untracked files:", False),
        (RegexLabCheck(regex=r"^\*\s+Merge branch", says="s"), "* abc\n*   Merge branch 'pump'\n", True),  # MULTILINE
        (RegexLabCheck(regex=r"^Merge", says="s"), "*   Merge branch 'pump'", False),
        (LinesLabCheck(lines=LineCount(min=2, max=2), says="s"), "a\n\n  \nb\n", True),  # blank lines don't count
        (LinesLabCheck(lines=LineCount(min=2), says="s"), "a\n", False),
        (LinesLabCheck(lines=LineCount(max=1), says="s"), "a\nb", False),
    ],
)
def test_each_check(rule, text, ok):
    assert lab.check(rule, lab.normalise(text)) is ok


def test_a_windows_paste_counts_the_same():
    rule = RegexLabCheck(regex=r"^nothing to commit, working tree clean$", says="s")
    assert lab.check(rule, lab.normalise("On branch main\r\nnothing to commit, working tree clean\r\n"))


@pytest.mark.parametrize(
    ("bad", "message"),
    [
        ({"regex": "([unclosed", "says": "s"}, "does not compile"),
        ({"lines": {}, "says": "s"}, "lines needs min, max or both"),
        ({"lines": {"min": 3, "max": 2}, "says": "s"}, "min is more than max"),
        ({"contains": "x"}, "says"),
        ({"exact": "x", "says": "s"}, "exact"),  # no exact-match check: hashes and dates differ per machine
    ],
)
def test_a_bad_check_is_refused(bad, message):
    with pytest.raises(ValueError, match=message):
        LabBox.model_validate({"prompt": "p", "checks": [bad], "example": "x"})


def test_lab_done_needs_a_lab(tmp_path):
    _write(tmp_path, lab="")
    with pytest.raises(ContentError, match="comms.lab_done: the module has no lab"):
        load_catalog(tmp_path)


def test_a_lab_from_someone_off_the_cast_is_refused(tmp_path):
    _write(tmp_path, lab=LAB.replace("from: okafor", "from: nobody"))
    with pytest.raises(ContentError, match="lab.from: 'nobody' is not in the cast"):
        load_catalog(tmp_path)


@pytest.mark.criterion(121, "Every lab's example passes its own checks")
def test_every_labs_example_passes_its_own_checks(labs):
    for catalog in (load_catalog(), labs):  # the real curriculum, and this file's
        for module in catalog.modules.values():
            if module.lab:
                verdict = lab.grade(module.lab, [box.example for box in module.lab.boxes])
                assert verdict.passed, f"{module.source}: an example fails {verdict.results}"
    assert any(m.lab for m in labs.modules.values())  # the loop above checked something


def test_the_example_never_reaches_the_page(logged_in, labs):
    page = logged_in.get("/modules/one").text
    assert "Track airmix.conf" not in page
    assert "The output of <code>git log --oneline</code>." in page
    assert "mkdir -p ~/meridian" in _text(page)  # the setup snippet, to copy


def test_module_file_takes_a_lab():
    assert "lab" in ModuleFile.model_fields


# --- submitting -------------------------------------------------------------------------
@pytest.mark.criterion(121, "A correct paste passes the lab")
def test_a_correct_paste_passes_the_lab(logged_in, user, labs):
    response = submit(logged_in, LOG, CLEAN)
    assert response.status_code == 200
    assert "✓ Lab passed · +40 XP" in response.text
    assert all(ok for ok, _ in _checks(response.text))
    assert _lab_xp(user.id) == [40]
    [attempt] = _attempts(user.id)
    assert attempt.correct and attempt.submitted["boxes"] == [LOG, CLEAN]
    # The crew answers on the comms log, and the module page remembers the pass.
    assert 'hx-swap-oob="beforeend:#comms-log"' in response.text and "Lab logged, <em>cadet</em>." in response.text
    page = logged_in.get("/modules/one").text
    assert "✓ Passed</span>: the 40 XP is yours." in page
    assert page.count("Lab logged") == 1  # in the log, once, not new


@pytest.mark.criterion(121, "A wrong paste says what is missing")
def test_a_wrong_paste_says_what_is_missing(logged_in, user, labs):
    one_commit = "9e0d1f7 Track airmix.conf\n"
    response = submit(logged_in, one_commit, CLEAN)
    assert response.status_code == 200
    assert _checks(response.text) == [
        (False, "Two commits · Commit twice."),
        (True, "Short hashes from git log --oneline"),
        (True, "Nothing left to commit"),
        (True, "No untracked files"),
    ]
    assert "Lab passed" not in response.text
    assert _lab_xp(user.id) == []
    [attempt] = _attempts(user.id)
    assert not attempt.correct
    assert one_commit in response.text  # what was pasted stays in the box


@pytest.mark.criterion(121, "Passing again awards nothing")
def test_passing_again_awards_nothing(logged_in, user, labs):
    submit(logged_in, LOG, CLEAN)
    again = submit(logged_in, LOG, CLEAN)
    assert "✓ Passed</span>: the 40 XP is yours." in again.text
    assert "+40 XP" not in again.text and "comms-log" not in again.text
    assert _lab_xp(user.id) == [40]
    assert len(_attempts(user.id)) == 2  # every attempt is history


@pytest.mark.criterion(121, "The first lab earns its badge")
def test_the_first_lab_earns_its_badge(logged_in, user, labs):
    response = submit(logged_in, LOG, CLEAN)
    assert "Badge earned: Field Work" in response.text
    with SessionLocal() as db:
        assert db.scalars(select(BadgeEarned.badge_slug).where(BadgeEarned.user_id == user.id)).all() == ["first-lab"]
    assert "Badge earned" not in submit(logged_in, LOG, CLEAN).text


@pytest.mark.criterion(121, "An oversized paste is refused politely")
def test_an_oversized_paste_is_refused_politely(logged_in, user, labs):
    response = submit(logged_in, LOG + "x" * lab.MAX_PASTE, CLEAN)
    assert response.status_code == 200
    assert "That's more than 20,000 characters in one box." in _text(response.text)
    assert _attempts(user.id) == []
    assert _lab_xp(user.id) == []


def test_a_missing_box_is_an_empty_paste(logged_in, user, labs):
    response = submit(logged_in, LOG)
    assert "Lab passed" not in response.text
    assert [ok for ok, _ in _checks(response.text)] == [True, True, False, True]


def test_a_lab_does_not_complete_the_module(logged_in, user, labs):
    """Like a console task, a lab is its own exercise: the quiz completes the module."""
    submit(logged_in, LOG, CLEAN)
    assert "System restored" not in logged_in.get("/modules/one").text
    assert "System restored" in complete(logged_in, "one").text


def test_a_locked_modules_lab_is_refused(logged_in, user, labs, tmp_path):
    # `two` has no lab: 404. A lab on a locked module is a 403 with HX-Redirect, recording nothing.
    assert submit(logged_in, "x", slug="two").status_code == 404
    (tmp_path / "core/shell/02-two.md").write_text(MODULE.format(title="Two", xp=50).replace("---\nLesson.", LAB + "---\nLesson.", 1))
    app.dependency_overrides[get_catalog] = lambda: load_catalog(tmp_path)
    response = submit(logged_in, LOG, CLEAN, slug="two")
    assert response.status_code == 403 and response.headers["HX-Redirect"] == "/"
    assert _attempts(user.id) == []


def test_a_lab_without_a_csrf_token_is_refused(logged_in, labs):
    response = logged_in.post("/modules/one/lab", data={"box": [LOG, CLEAN]}, headers={"HX-Request": "true"})
    assert response.status_code == 403


def test_the_lab_is_scoped_to_the_learner(logged_in, labs, make_user, client):
    submit(logged_in, LOG, CLEAN)
    other = make_user()
    with SessionLocal() as db:
        assert lab.passed_slugs(db, other.id) == set()


def test_the_authoring_docs_example_is_a_valid_lab():
    """docs/content-authoring.md's lab example parses and its example passes: a doc that
    teaches YAML must not ship broken YAML (its first draft had an unquoted `?`)."""
    import pathlib

    import yaml

    from app.content.schema import Lab

    doc = (pathlib.Path(__file__).resolve().parents[1] / "docs" / "content-authoring.md").read_text()
    block = re.search(r"### A lab \(optional\).*?```yaml\n(.*?)```", doc, re.S).group(1)
    parsed = Lab.model_validate(yaml.safe_load(block)["lab"])
    assert lab.grade(parsed, [box.example for box in parsed.boxes]).passed
