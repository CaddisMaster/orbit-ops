"""Where the learner is in the curriculum: lock rules, today's mission, and
recording quiz answers.

The rules are pure functions of (catalog, set of completed module slugs), so
they are unit-tested without a database. Nothing about locking is stored: a
change to the syllabus re-derives it on the next request.

Rules:
- A unit is UNLOCKED when every prerequisite unit is complete.
- A unit is COMPLETE when it has at least one module and all are complete. (A
  "coming soon" unit has none, so anything requiring it stays locked until its
  content exists.)
- A module is AVAILABLE when its unit is unlocked and it is either the unit's
  first module or the previous one is complete. Completed modules always stay
  available for review.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import Catalog, Module
from app.content.schema import ChoiceQuestion, FillQuestion, MultiQuestion, Question
from app.models import ExerciseAttempt, ModuleProgress

# ---------------------------------------------------------------------------
# Lock rules (pure)
# ---------------------------------------------------------------------------


def unit_complete(catalog: Catalog, unit_slug: str, completed: set[str]) -> bool:
    modules = catalog.units[unit_slug].modules
    return bool(modules) and all(m in completed for m in modules)


def unit_unlocked(catalog: Catalog, unit_slug: str, completed: set[str]) -> bool:
    return all(unit_complete(catalog, p, completed) for p in catalog.units[unit_slug].prerequisites)


def module_available(catalog: Catalog, slug: str, completed: set[str]) -> bool:
    if slug in completed:
        return True
    module = catalog.modules[slug]
    if not unit_unlocked(catalog, module.unit, completed):
        return False
    siblings = catalog.units[module.unit].modules
    return module.position == 1 or siblings[module.position - 2] in completed


def blocker(catalog: Catalog, slug: str, completed: set[str]) -> str:
    """What to finish first, phrased for the learner. Only call for a locked module."""
    module = catalog.modules[slug]
    for prereq in catalog.units[module.unit].prerequisites:
        if not unit_complete(catalog, prereq, completed):
            return f"Finish the unit “{catalog.units[prereq].title}” first."
    previous = catalog.modules[catalog.units[module.unit].modules[module.position - 2]]
    return f"Finish “{previous.title}” first."


def todays_mission(catalog: Catalog, completed: set[str]) -> Module | None:
    """The first available, unfinished module in syllabus order."""
    for module in catalog.ordered_modules():
        if module.slug not in completed and module_available(catalog, module.slug, completed):
            return module
    return None


def next_module(catalog: Catalog, slug: str, completed: set[str]) -> Module | None:
    """Where to go after finishing `slug`: the next module in its unit if there
    is one, otherwise today's mission."""
    module = catalog.modules[slug]
    siblings = catalog.units[module.unit].modules
    if module.position < len(siblings):
        return catalog.modules[siblings[module.position]]
    return todays_mission(catalog, completed)


# ---------------------------------------------------------------------------
# Answer checking (pure)
# ---------------------------------------------------------------------------


def _normalise(text: str) -> str:
    return " ".join(text.split()).casefold()


def check_answer(question: Question, submitted: list[str]) -> bool | None:
    """True/False for a well-formed answer, None if `submitted` doesn't answer
    the question at all (nothing picked, or values that aren't options)."""
    match question:
        case ChoiceQuestion():
            if len(submitted) != 1 or not submitted[0].isdigit() or int(submitted[0]) >= len(question.options):
                return None
            return int(submitted[0]) == question.answer
        case MultiQuestion():
            picked = {int(v) for v in submitted if v.isdigit() and int(v) < len(question.options)}
            if not picked or len(picked) != len(submitted):
                return None
            return picked == set(question.answer)
        case FillQuestion():
            if len(submitted) != 1 or not submitted[0].strip():
                return None
            return _normalise(submitted[0]) in {_normalise(a) for a in question.answer}
    return None


# ---------------------------------------------------------------------------
# Persistence — every query is scoped to the user passed in.
# ---------------------------------------------------------------------------


def completed_slugs(db: Session, user_id: int) -> set[str]:
    rows = db.scalars(
        select(ModuleProgress.module_slug).where(ModuleProgress.user_id == user_id, ModuleProgress.status == "complete")
    )
    return set(rows)


def get_progress(db: Session, user_id: int, slug: str) -> ModuleProgress | None:
    return db.scalar(select(ModuleProgress).where(ModuleProgress.user_id == user_id, ModuleProgress.module_slug == slug))


def start_module(db: Session, user_id: int, slug: str) -> ModuleProgress:
    progress = get_progress(db, user_id, slug)
    if progress is None:
        progress = ModuleProgress(user_id=user_id, module_slug=slug, status="in_progress")
        db.add(progress)
        db.flush()
    return progress


# "Show me" (#103) is stored as a quiz attempt with nothing submitted, which no
# real answer can be (check_answer returns None for it, and None isn't stored).
SHOW_ME: list[str] = []


@dataclass
class QuestionState:
    """One question's attempts (#103). `first` is the one that's scored. The
    question is `settled` once answered right or given up with Show me; until
    then a wrong answer can be changed, and the right option stays hidden."""

    first: ExerciseAttempt
    last: ExerciseAttempt  # the latest real answer (never a Show me)
    revealed: bool  # settled by Show me rather than by a right answer

    @property
    def settled(self) -> bool:
        return self.last.correct or self.revealed


def question_states(db: Session, user_id: int, slug: str) -> dict[int, QuestionState]:
    """Every attempted question's state, by index."""
    attempts = db.scalars(
        select(ExerciseAttempt)
        .where(ExerciseAttempt.user_id == user_id, ExerciseAttempt.module_slug == slug, ExerciseAttempt.kind == "quiz")
        .order_by(ExerciseAttempt.id)
    )
    states: dict[int, QuestionState] = {}
    for attempt in attempts:
        state = states.get(attempt.item)
        if state is None:
            states[attempt.item] = QuestionState(first=attempt, last=attempt, revealed=attempt.submitted == SHOW_ME)
        elif attempt.submitted == SHOW_ME:
            state.revealed = True
        else:
            state.last = attempt
    return states


@dataclass
class AnswerResult:
    state: QuestionState
    just_completed: bool  # this answer finished the module


def record_answer(
    db: Session, user_id: int, module: Module, index: int, submitted: list[str], correct: bool
) -> AnswerResult:
    """Store the answer; if every question now has a first attempt, complete the
    module with its score. Only the first attempt is scored: a retry (#103) is
    recorded but changes no score. An answer to a settled question is ignored.
    The caller commits."""
    progress = start_module(db, user_id, module.slug)
    states = question_states(db, user_id, module.slug)
    state = states.get(index)
    if state is not None and state.settled:
        return AnswerResult(state=state, just_completed=False)
    attempt = ExerciseAttempt(
        user_id=user_id, module_slug=module.slug, kind="quiz", item=index, submitted=submitted, correct=correct
    )
    db.add(attempt)
    db.flush()
    if state is not None:
        state.last = attempt
        return AnswerResult(state=state, just_completed=False)

    state = states[index] = QuestionState(first=attempt, last=attempt, revealed=False)
    just_completed = False
    if progress.status != "complete" and len(states) == len(module.quiz):
        right = sum(1 for s in states.values() if s.first.correct)
        progress.status = "complete"
        progress.score = round(100 * right / len(module.quiz))
        progress.completed_at = datetime.now(UTC)
        just_completed = True
    return AnswerResult(state=state, just_completed=just_completed)


def show_me(db: Session, user_id: int, module: Module, index: int) -> QuestionState | None:
    """Give up on a wrongly answered question: settle it so the right option and
    the explanation show. None if it hasn't been answered yet. The caller commits."""
    state = question_states(db, user_id, module.slug).get(index)
    if state is None or state.settled:
        return state
    db.add(ExerciseAttempt(user_id=user_id, module_slug=module.slug, kind="quiz", item=index, submitted=SHOW_ME, correct=False))
    db.flush()
    state.revealed = True
    return state
