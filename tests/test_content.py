"""The curriculum loader and validator (#4).

Two halves: the REAL content/ directory must always load (this is what makes a
broken lesson fail CI rather than production), and the validator is exercised
against small throwaway trees built in tmp_path.
"""

import re
import textwrap
from pathlib import Path

import pytest

from app.content import ContentError, load_catalog
from app.content.loader import CONTENT_DIR

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
    assert '<h2 id="sec-lesson">Lesson</h2>' in catalog.modules["first"].body_html


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
        ("    q: Pick one\n", "    q: Pick one\n    code: ls\n    lang: Bash Shell\n", "quiz.0.choice.lang"),
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


def test_a_questions_code_renders_as_a_highlighted_block():
    from app.content.render import render_code

    assert str(render_code("$ ls <dir>")) == '<pre class="highlight" data-lang="text"><code>$ ls &lt;dir&gt;\n</code></pre>\n'
    assert '<span class="nb">echo</span>' in str(render_code("echo hi", "bash"))


def test_inline_markdown_renders_code_and_escapes_html():
    from app.content.render import render_inline

    assert str(render_inline("Use `ls -l` *now*")) == "Use <code>ls -l</code> <em>now</em>"
    assert "<script>" not in str(render_inline("<script>x</script>"))


# --- the real curriculum follows the authoring guidelines (docs/content-authoring.md) ---
@pytest.mark.parametrize("module", load_catalog().ordered_modules(), ids=lambda m: m.slug)
def test_real_modules_follow_the_authoring_guidelines(module):
    assert 10 <= module.minutes <= 20, "a daily module is 15–20 minutes (10 at the least)"
    assert 3 <= len(module.quiz) <= 5, "quiz: 3–5 questions"
    assert len(module.cards) >= 2, "at least two flashcards"
    assert '<h2 id="sec-try-it">Try it</h2>' in module.body_html, "every module ends with something to run"


# --- #80: nothing the console asks for goes untaught ------------------------------------
def _taught_text(module) -> str:
    import html
    import re

    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", module.body_html)).split())


def _prose_text(module) -> str:
    """What the lesson says in prose and tables, before Try it: a command only in a
    code block or in Try it isn't taught yet (#101)."""
    from tests.test_lesson_needs import _says

    return _says(module)


def _commands(line: str) -> set[str]:
    """The command names on a solution line: the first word of each stage of
    every pipeline, past any `VAR=x` assignments, `sudo` and shell keywords."""
    import re

    keywords = {"if", "then", "elif", "else", "fi", "while", "until", "do", "done", "esac", "!", "{", "}"}
    names = set()
    for stage in re.split(r"\|\||&&|\||;", line):
        words = stage.split()
        if words and words[0] in ("for", "case"):  # `for f in *.log`, `case $x in`: no command
            continue
        while words and (words[0] in keywords or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0])):
            words = words[1:]
        if words and words[0] == "sudo":
            words = words[1:]
        if words and not re.match(r"^\d*[<>]", words[0]):  # `done < in.txt` runs nothing new
            names.add(words[0])
    return names


@pytest.mark.criterion(80, "No console task needs an untaught command")
def test_no_console_task_needs_an_untaught_command():
    import re

    taught = ""
    catalog = load_catalog()
    for module in [m for unit in ("linux-shell", "bash-scripting", "git", "networking") for m in catalog.unit_modules(unit)]:
        taught += " " + _prose_text(module)  # this module's lesson, and every earlier one
        if not module.terminal:
            continue
        password = module.terminal.password
        used = set().union(*(_commands(line) for line in module.terminal.solution if line != password))
        # A script the learner writes is run by its name, which no lesson teaches (#70).
        written = " ".join(module.terminal.solution)
        used = {c for c in used if not re.search(rf"(?:>|>>)\s*\S*/{re.escape(c)}(?![\w.-])", written)}
        # So is one of the exercise's own files run by its full path, as cron needs (#77).
        used -= {f.path for f in module.terminal.files}
        untaught = sorted(c for c in used if not re.search(rf"(?<![\w-]){re.escape(c)}(?![\w-])", taught))
        assert not untaught, f"{module.slug}'s console task uses {untaught}, which no lesson up to it teaches"


def test_shell_keywords_are_not_commands():
    assert _commands("for f in *.log; do gzip $f; done") == {"gzip"}
    assert _commands("if [ -f x ]; then sudo rm x; fi") == {"[", "rm"}
    assert _commands("while read -r line; do echo $line; done < in.txt") == {"read", "echo"}


@pytest.mark.criterion(80, "Reading a file is taught before it's needed")
def test_reading_a_file_is_taught_in_module_01():
    first = load_catalog().unit_modules("linux-shell")[0]
    text = _taught_text(first)
    reading = text.index("Looking, moving and reading")
    assert reading < text.index("Try it")
    for command in ("cat ", "less ", "head -n", "tail -n", "nano"):
        assert command in text[reading:], command
    assert first.cards[0].id == "the-filesystem/reading-files"


@pytest.mark.criterion(80, "The tasks say to read")
def test_the_tasks_say_to_read():
    first, second = load_catalog().unit_modules("linux-shell")[:2]
    assert "when did scrubber B go offline?" in " ".join(first.terminal.task.split())
    assert "read it (`cat` prints a file)" in " ".join(second.terminal.task.split())


# --- #85: "comms" names one place on the station ------------------------------------------
@pytest.mark.criterion(85, '"Comms" names one place on the station')
def test_comms_names_one_place_on_the_station():
    catalog = load_catalog()
    for track in catalog.tracks:
        if track.deck == "Comms, Sensors & Shields":
            continue
        for slug in track.units:
            unit = catalog.units[slug]
            assert "comms array" not in (unit.title + " " + unit.briefing_html).lower(), slug
    badge = next(b for b in catalog.badges if b.slug == "unit-networking")  # a badge slug is permanent
    assert badge.name == "Relays Restored" and "comms array" not in badge.name.lower()
    assert "relay network" in catalog.units["networking"].briefing_html


# --- #104: where a card comes from ------------------------------------------------
CARDS = """cards:
  - id: one
    section: "{section}"
    accept: ["cp -r src dest"]
    front: Copy a directory
    back: "`cp -r src dest`"
---"""


def _with_card(section: str) -> dict[str, str]:
    lesson = "## Lesson\n\nBody.\n\n### Moving: `cd`\n\nMore.\n"
    return {"core/shell/01-first.md": MODULE.replace("---\n## Lesson\n\nBody text.\n", CARDS.format(section=section) + "\n" + lesson)}


@pytest.mark.criterion(104, "A bad section is caught")
def test_a_card_whose_section_is_no_heading_fails_naming_the_file_and_card(tmp_path):
    found = problems(write_tree(tmp_path, files=_with_card("Copying")))
    assert found == ["core/shell/01-first.md: card 'one': section 'Copying' is not a ## or ### heading in the lesson"]


def test_a_cards_section_is_its_heading_as_written(tmp_path):
    card = load_catalog(write_tree(tmp_path, files=_with_card("Moving: `cd`"))).modules["first"].cards[0]
    assert (card.section_html, card.section_anchor) == ("Moving: <code>cd</code>", "sec-moving-cd")
    assert card.accept == ("cp -r src dest",)


def test_lesson_headings_get_ids_that_cant_clash_with_the_page():
    from app.content.render import lesson_sections, render_markdown

    text = "## Try it\n\n```bash\n## not a heading\n```\n\n## Try it\n\n### `[ ]` tests\n"
    assert lesson_sections(text) == {"Try it": "sec-try-it", "`[ ]` tests": "sec-tests"}
    html = render_markdown(text, anchors=True)
    assert '<h2 id="sec-try-it">' in html and '<h2 id="sec-try-it-2">' in html and '<h3 id="sec-tests">' in html


def test_every_real_card_points_at_its_lesson_section():
    # backfilled with #104; the loader has already checked each one is a heading
    for module in load_catalog().ordered_modules():
        for card in module.cards:
            assert card.section_anchor and f'id="{card.section_anchor}"' in module.body_html, card.id


# --- #196: what the shell is ------------------------------------------------------
SHELL_SECTION = "The shell: what reads your commands"


@pytest.mark.criterion(196, "Module 01 says what the shell is")
def test_module_01_says_what_the_shell_is():
    first = load_catalog().unit_modules("linux-shell")[0]
    body = " ".join(first.body_html.split())
    assert body.index(f">{SHELL_SECTION}</h2>") < body.index(">One tree, one root</h2>")
    section = body[body.index(SHELL_SECTION) : body.index(">One tree, one root</h2>")]
    for says in ("the <strong>shell</strong>", "<strong>bash</strong>", "<strong>prompt</strong>",
                 "<strong>The shell reads the whole line before the command runs</strong>"):
        assert says in section, says
    assert any(c.id == "the-filesystem/shell-vs-terminal" and c.section_html == SHELL_SECTION for c in first.cards)
    # The prompt question is last, so the earlier questions keep the index their attempts are stored by.
    assert first.quiz[-1].code and first.quiz[-1].code.endswith("$")


@pytest.mark.criterion(196, "Module 03's globs point back to it")
def test_module_03s_globs_point_back_to_module_01():
    third = load_catalog().unit_modules("linux-shell")[2]
    body = " ".join(third.body_html.split())
    globs = body[body.index(">Globs: patterns the shell expands</h2>") :]
    assert "In module 01, the shell reads the whole line before the command runs" in globs.split("</h2>", 2)[1]


# --- #206: module 04 says how to work the numbers out -----------------------------
def _permissions():
    module = load_catalog().modules["permissions"]
    return module, " ".join(module.body_html.split())


@pytest.mark.criterion(206, "The lesson says a number replaces all three classes")
def test_module_04_says_a_number_replaces_all_three_classes():
    _, body = _permissions()
    assert "An octal mode sets all three classes" in body and "A symbolic one changes only what it names" in body
    assert "664 -rw-rw-r-- build.sh" in body and "700 -rwx------ build.sh" in body  # a number taking the group's rw away
    assert "a private directory or script" not in body  # 700 isn't offered as the mode for a script


@pytest.mark.criterion(206, "The task says what it wants")
def test_module_04s_task_says_what_it_wants():
    module, _ = _permissions()
    task = " ".join(module.terminal.task.split())
    assert "look at both files' modes" in task and "change **nothing else**" in task
    assert "Okafor" not in task  # the script is the learner's to run


@pytest.mark.criterion(206, "The quiz asks about the mistake")
def test_module_04s_last_question_is_the_mistake():
    module, _ = _permissions()
    last = module.quiz[-1]
    assert last.code and "stat -c '%a %A %n' report.sh" in last.code and "-rw-rw----" in last.code
    assert "`chmod u+x report.sh`" in last.options and "`chmod 700 report.sh`" in last.options
    assert module.quiz[0].q.startswith("After `chmod 640 secrets.txt`")  # the old questions keep their places


@pytest.mark.criterion(206, "The lesson decodes a number")
def test_module_04_decodes_a_number_it_doesnt_otherwise_list():
    module, body = _permissions()
    assert "So <code>751</code> is <code>rwxr-x--x</code>" in body
    asked = " ".join(q.q + str(getattr(q, "answer", "")) for q in module.quiz)
    assert "751" not in asked and "rwxr-x---" not in asked  # the worked number isn't a question's, and Q2's isn't in the table


@pytest.mark.criterion(206, "The lesson decodes a number")
def test_module_04_doesnt_hand_over_its_quiz_answers():
    module, body = _permissions()
    for answer in ("640", "rw-r----- secrets", "754", "rwxr-xr--", "760"):  # Q1, Q2, the last question
        assert answer not in body, answer


# --- #210: module 05's second task is findable ------------------------------------------
def _users_and_sudo():
    module = load_catalog().modules["users-and-sudo"]
    return module, " ".join(module.body_html.split())


@pytest.mark.criterion(210, "The lesson explains what part 2 finds")
def test_module_05_explains_login_shells_and_nologin():
    _, body = _users_and_sudo()
    assert "the <strong>login shell</strong>: the program that runs when this account logs in" in body
    assert "its login shell is usually <strong><code>/usr/sbin/nologin</code></strong>" in body
    assert "<strong>a group of the same name</strong>" in body and "two separate things" in body
    assert "airlock" not in body  # the lesson shows other accounts' lines, never the task's


@pytest.mark.criterion(210, "The lesson explains why groups doesn't show the new group")
def test_module_05_explains_why_groups_lags():
    _, body = _users_and_sudo()
    assert "plain <code>groups</code> and <code>id</code> show the groups you logged in with" in body
    assert "<code>groups NAME</code> and <code>id NAME</code> read <code>/etc/group</code> as it is now" in body


@pytest.mark.criterion(210, "The task says which airlock it means")
def test_module_05s_task_says_which_airlock():
    module, _ = _users_and_sudo()
    task = " ".join(module.terminal.task.split())
    assert task.startswith("1. ") and " 2. " in task
    assert "service **account**" in task and "not the group you just joined" in task
    assert "line in `/etc/passwd`" in task


@pytest.mark.criterion(210, "The su card has a lesson behind it")
def test_module_05_teaches_su_before_its_card():
    module, body = _users_and_sudo()
    card = next(c for c in module.cards if c.id == "users-and-sudo/sudo-vs-su")
    section = body.split(f'id="{card.section_anchor}"')[1].split("<h2")[0]
    assert "<code>su - NAME</code>" in section and "<strong>NAME's</strong> password" in section
    assert "plain <code>su</code> means root" in section


# --- #214: module 06 says what $? is ---------------------------------------------------
def _processes():
    module = load_catalog().modules["processes-and-signals"]
    return module, " ".join(module.body_html.split())


@pytest.mark.criterion(214, "The lesson says what $? is")
def test_module_06_says_what_dollar_question_is():
    _, body = _processes()
    assert "The shell keeps the last command's exit status in a variable named <code>?</code>" in body
    assert "you type it. It's a different <code>$</code> from the one at the end of the prompt" in body
    exit_codes = body.split('id="sec-exit-codes"')[1].split("<h2")[0]
    assert "/dev/null" not in exit_codes  # redirection is the next module's


@pytest.mark.criterion(214, "Silence means success")
def test_module_06_says_silence_means_success():
    _, body = _processes()
    assert "print <strong>nothing</strong> when they work" in body
    assert "A <code>kill</code> that delivers its signal says nothing at all, and <code>echo $?</code> afterwards shows <code>0</code>" in body


# --- #207: Okafor is he --------------------------------------------------------------
SHE = re.compile(r"\b(she|her|hers|herself)\b", re.IGNORECASE)
# The only women on the crew so far, and where they appear. Anywhere else, she/her is Okafor.
SHE_IS = {"variables-and-quoting": "the auditor", "remotes": "Nakamura"}


@pytest.mark.criterion(207, "Okafor is he")
def test_okafor_is_he():
    for path in sorted(CONTENT_DIR.rglob("*.md")):
        slug = path.stem.split("-", 1)[1]
        text = " ".join(path.read_text().split())
        if slug not in SHE_IS:
            assert not SHE.search(text), f"{slug}: {SHE.search(text).group(0)!r}, and its only she is Okafor, who is he"
            continue
        for sentence in re.split(r"(?<=[.!?\"])\s+", text):  # the auditor's or Nakamura's, never Okafor's
            assert not ("Okafor" in sentence and SHE.search(sentence)), f"{slug}: {sentence}"
