"""The curriculum loader and validator (#4).

Two halves: the REAL content/ directory must always load (this is what makes a
broken lesson fail CI rather than production), and the validator is exercised
against small throwaway trees built in tmp_path.
"""

import textwrap
from pathlib import Path

import pytest

from app.content import ContentError, load_catalog

SYLLABUS = """
tracks:
  - slug: core
    title: Core
    deck: Life Support
    units:
      - slug: shell
        title: Shell
      - slug: git
        title: Git
        prerequisites: [shell]
"""

MODULE = """---
title: A module
minutes: 15
story: Day 1.
quiz:
  - type: choice
    q: Pick one
    options: [a, b]
    answer: 0
    explain: Because.
---
## Lesson

Body text.
"""


def write_tree(root: Path, syllabus: str = SYLLABUS, files: dict[str, str] | None = None) -> Path:
    (root / "syllabus.yml").write_text(textwrap.dedent(syllabus))
    for rel, text in (files if files is not None else {"core/shell/01-first.md": MODULE}).items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return root


def problems(root: Path) -> list[str]:
    with pytest.raises(ContentError) as exc:
        load_catalog(root)
    return exc.value.problems


# --- the real curriculum -------------------------------------------------------
@pytest.mark.criterion(4, "A valid curriculum loads at startup")
def test_the_real_curriculum_loads():
    catalog = load_catalog()
    assert catalog.tracks
    assert catalog.modules, "content/ has no modules at all"
    for module in catalog.ordered_modules():
        assert module.slug in catalog.units[module.unit].modules


@pytest.mark.criterion(4, "A valid curriculum loads at startup")
def test_app_startup_exposes_the_catalog(client):
    catalog = client.app.state.catalog
    assert "the-filesystem" in catalog.modules


def test_a_valid_tree_builds_the_catalog(tmp_path):
    catalog = load_catalog(
        write_tree(tmp_path, files={"core/shell/01-first.md": MODULE, "core/shell/02-second.md": MODULE})
    )
    assert [t.slug for t in catalog.tracks] == ["core"]
    assert catalog.units["shell"].modules == ("first", "second")
    assert catalog.units["git"].modules == ()  # listed, no files yet: "coming soon"
    assert catalog.modules["second"].position == 2
    assert catalog.modules["first"].xp == 50  # default
    assert "<h2>Lesson</h2>" in catalog.modules["first"].body_html


# --- invalid modules name the file and the field -------------------------------
@pytest.mark.criterion(4, "An invalid module fails CI, not production")
def test_choice_answer_out_of_range_names_file_and_field(tmp_path):
    bad = MODULE.replace("answer: 0", "answer: 5")
    found = problems(write_tree(tmp_path, files={"core/shell/01-first.md": bad}))
    assert len(found) == 1
    assert found[0].startswith("core/shell/01-first.md: quiz.0.choice")
    assert "answer 5 is not an index" in found[0]


@pytest.mark.criterion(4, "An invalid module fails CI, not production")
def test_question_without_an_answer_is_rejected(tmp_path):
    bad = MODULE.replace("    answer: 0\n", "")
    found = problems(write_tree(tmp_path, files={"core/shell/01-first.md": bad}))
    assert any("core/shell/01-first.md: quiz.0.choice.answer" in p and "required" in p.lower() for p in found)


@pytest.mark.parametrize(
    ("replace", "with_", "expect"),
    [
        ("minutes: 15", "minutes: 90", "minutes"),
        ("title: A module\n", "title: A module\ntitel: typo\n", "titel"),  # unknown keys are errors
        ("type: choice", "type: essay", "quiz.0"),
        ("options: [a, b]", "options: [a, a]", "options must be distinct"),
    ],
)
def test_bad_front_matter_is_reported(tmp_path, replace, with_, expect):
    found = problems(write_tree(tmp_path, files={"core/shell/01-first.md": MODULE.replace(replace, with_)}))
    assert any(p.startswith("core/shell/01-first.md:") and expect in p for p in found), found


def test_multi_and_fill_questions_validate(tmp_path):
    good = MODULE.replace(
        "quiz:\n",
        "quiz:\n  - type: multi\n    q: Pick two\n    options: [a, b, c]\n    answer: [0, 2]\n    explain: x\n"
        "  - type: fill\n    q: Type it\n    answer: [ls, LS]\n    explain: x\n",
    )
    module = load_catalog(write_tree(tmp_path, files={"core/shell/01-first.md": good})).modules["first"]
    assert [q.type for q in module.quiz] == ["multi", "fill", "choice"]

    bad = good.replace("answer: [0, 2]", "answer: [0, 9]")
    assert any("answer [9]" in p for p in problems(write_tree(tmp_path, files={"core/shell/01-first.md": bad})))


@pytest.mark.parametrize(
    ("rel", "text", "expect"),
    [
        ("core/shell/first.md", MODULE, "filename must be NN-slug.md"),
        ("core/nope/01-first.md", MODULE, "is not a unit in syllabus.yml"),
        ("core/shell/01-first.md", "no front matter", "must start with a '---'"),
        ("core/shell/01-first.md", MODULE.split("---\n## Lesson")[0] + "---\n", "lesson body"),
        ("stray.md", MODULE, "<track>/<unit>/NN-slug.md"),
    ],
)
def test_misplaced_or_malformed_files_are_reported(tmp_path, rel, text, expect):
    found = problems(write_tree(tmp_path, files={rel: text}))
    assert any(p.startswith(rel) and expect in p for p in found), found


def test_duplicate_module_slugs_across_units_are_rejected(tmp_path):
    found = problems(write_tree(tmp_path, files={"core/shell/01-first.md": MODULE, "core/git/01-first.md": MODULE}))
    assert any("already used by core/" in p for p in found)


def test_every_problem_is_reported_at_once(tmp_path):
    files = {
        "core/shell/01-first.md": MODULE.replace("minutes: 15", "minutes: 1"),
        "core/shell/02-second.md": MODULE.replace("answer: 0", "answer: 7"),
    }
    found = problems(write_tree(tmp_path, files=files))
    assert {p.split(":")[0] for p in found} == {"core/shell/01-first.md", "core/shell/02-second.md"}


# --- the syllabus: prerequisites form a DAG ---------------------------------------
@pytest.mark.criterion(4, "Prerequisites form a DAG")
def test_unknown_prerequisite_is_named(tmp_path):
    found = problems(write_tree(tmp_path, SYLLABUS.replace("prerequisites: [shell]", "prerequisites: [docker]")))
    assert found == ["syllabus.yml: unit 'git' requires 'docker', which is not a unit"]


@pytest.mark.criterion(4, "Prerequisites form a DAG")
def test_prerequisite_cycle_names_the_units_involved(tmp_path):
    cyclic = SYLLABUS.replace("        title: Shell\n", "        title: Shell\n        prerequisites: [git]\n")
    found = problems(write_tree(tmp_path, cyclic))
    assert len(found) == 1
    assert found[0].startswith("syllabus.yml: prerequisite cycle:")
    assert "shell" in found[0] and "git" in found[0]


def test_self_prerequisite_and_duplicate_units_are_rejected(tmp_path):
    bad = SYLLABUS.replace("prerequisites: [shell]", "prerequisites: [git]").replace("slug: shell", "slug: git")
    found = problems(write_tree(tmp_path, bad, files={}))
    assert "syllabus.yml: unit 'git' is defined twice" in found
    assert "syllabus.yml: unit 'git' requires itself" in found


def test_missing_syllabus_is_an_error(tmp_path):
    assert problems(tmp_path)[0].startswith("syllabus.yml: not found")


# --- rendering ---------------------------------------------------------------------
def test_raw_html_in_a_lesson_is_escaped_not_rendered(tmp_path):
    hostile = MODULE.replace("Body text.", '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">')
    body = load_catalog(write_tree(tmp_path, files={"core/shell/01-first.md": hostile})).modules["first"].body_html
    assert "<script>" not in body and "<img" not in body
    assert "&lt;script&gt;" in body


def test_code_blocks_are_highlighted_with_classes_not_inline_styles(tmp_path):
    code = MODULE.replace("Body text.", "```bash\nls -l /etc\n```\n\n```nosuchlang\n<x>\n```")
    body = load_catalog(write_tree(tmp_path, files={"core/shell/01-first.md": code})).modules["first"].body_html
    assert '<pre class="highlight" data-lang="bash">' in body
    assert "<span class=" in body
    assert "style=" not in body
    assert "&lt;x&gt;" in body  # unknown language: escaped, not dropped


def test_inline_markdown_renders_code_and_escapes_html():
    from app.content.render import render_inline

    assert str(render_inline("Use `ls -l` *now*")) == "Use <code>ls -l</code> <em>now</em>"
    assert "<script>" not in str(render_inline("<script>x</script>"))
