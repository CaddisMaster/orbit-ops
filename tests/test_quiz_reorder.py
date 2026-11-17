"""#418: 38 live modules had every right answer in one position. Their options moved, and
migration 0011 moved the stored answers with them. These tests hold the content and the
migration's table together, against the options as they were before (a frozen fixture)."""

import html
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.content.render import render_inline
from app.db import SessionLocal
from app.models import ExerciseAttempt, ModuleProgress
from tests.conftest import real_catalog
from tests.test_migrations import _revision

BEFORE = json.loads((Path(__file__).parent / "fixtures" / "quiz_options_before_418.json").read_text())


def _text(markup: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", markup)).split())


def test_the_table_and_the_content_agree():
    """Every option that moved is where 0011 says, and the table covers every move."""
    positions = _revision("0011_remap_quiz_answers").POSITIONS
    assert positions.keys() == BEFORE.keys()
    catalog = real_catalog()
    for slug, items in BEFORE.items():
        quiz = catalog.modules[slug].quiz
        assert {int(i) for i in items} == set(positions[slug]), slug
        for i, before in items.items():
            perm = positions[slug][int(i)]
            assert [quiz[int(i)].options[perm[k]] for k in range(len(perm))] == before["options"], (slug, i)


@pytest.mark.criterion(418, "A past answer still names the option that was picked")
def test_a_past_answer_still_names_the_option_that_was_picked(logged_in, user):
    """A learner answered every reordered question before the release, each time picking an
    option that moves: the right one, or the wrong one swapped into the right one's place
    (which leaves the question open, so the page shows only their answer). After 0011,
    each module page names that same option as their answer."""
    catalog = real_catalog()
    positions = _revision("0011_remap_quiz_answers").POSITIONS
    picked: dict[tuple[str, int], list[str]] = {}
    with SessionLocal() as db:
        db.add_all(
            ModuleProgress(user_id=user.id, module_slug=m.slug, status="complete", score=100, completed_at=datetime.now(UTC))
            for m in catalog.ordered_modules()
        )
        for slug, items in BEFORE.items():
            for i, before in items.items():
                q = catalog.modules[slug].quiz[int(i)]
                right = True
                if q.type == "multi":
                    old = [str(a) for a in before["answer"]]
                elif int(i) % 2:
                    perm = positions[slug][int(i)]
                    old, right = [str(perm.index(before["answer"]))], False
                else:
                    old = [str(before["answer"])]
                picked[(slug, int(i))] = [before["options"][int(v)] for v in old]
                db.add(ExerciseAttempt(user_id=user.id, module_slug=slug, kind="quiz", item=int(i), submitted=old, correct=right))
        db.commit()

    r = _revision("0011_remap_quiz_answers")
    with SessionLocal() as db:
        r.apply(db.connection(), r.POSITIONS, user_id=user.id)
        db.commit()

    for slug in BEFORE:
        page = logged_in.get(f"/modules/{slug}").text
        for (s, i), options in picked.items():
            if s != slug:
                continue
            block = re.search(rf'<div class="question answered[^"]*" id="q{i}">(.*?)<p class="verdict">', page, re.S)
            assert block, (slug, i)
            options_html = [re.sub(r'<span class="mark"[^>]*>.*?</span>', "", o) for o in re.findall(r'<p class="option[^"]*">(.*?)</p>', block.group(1), re.S)]
            mine = [_text(o) for o in options_html if "(your answer)" in o]
            assert sorted(mine) == sorted(f"{_text(render_inline(o))} (your answer)" for o in options), (slug, i)
