"""Quiz questions and flashcards."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from .base import Slug, Text, _Strict


# ---------------------------------------------------------------------------
# Quiz questions — one class per type, selected by `type:`.
# ---------------------------------------------------------------------------
class _Question(_Strict):
    q: Text
    code: Text | None = None  # a script or output to read, shown as a block under `q` (#68)
    lang: Annotated[str, Field(pattern=r"^[a-z0-9+-]+$")] = "text"  # how `code` is highlighted
    explain: Text  # shown after answering, right or wrong


class _OptionsQuestion(_Question):
    options: Annotated[list[Text], Field(min_length=2, max_length=6)]

    @model_validator(mode="after")
    def _distinct_options(self):
        if len(set(self.options)) != len(self.options):
            raise ValueError("options must be distinct")
        return self


class ChoiceQuestion(_OptionsQuestion):
    """Exactly one correct option; `answer` is its 0-based index."""

    type: Literal["choice"]
    answer: int

    @model_validator(mode="after")
    def _answer_in_range(self):
        if not 0 <= self.answer < len(self.options):
            raise ValueError(f"answer {self.answer} is not an index into the {len(self.options)} options")
        return self


class MultiQuestion(_OptionsQuestion):
    """Several correct options; `answer` lists their 0-based indexes."""

    type: Literal["multi"]
    answer: Annotated[list[int], Field(min_length=1)]

    @model_validator(mode="after")
    def _answers_in_range(self):
        if len(set(self.answer)) != len(self.answer):
            raise ValueError("answer lists an option twice")
        bad = [i for i in self.answer if not 0 <= i < len(self.options)]
        if bad:
            raise ValueError(f"answer {bad} is not an index into the {len(self.options)} options")
        return self


class FillQuestion(_Question):
    """Free text; `answer` lists every accepted spelling (compared trimmed and
    case-insensitively)."""

    type: Literal["fill"]
    answer: Annotated[list[Text], Field(min_length=1)]


Question = Annotated[ChoiceQuestion | MultiQuestion | FillQuestion, Field(discriminator="type")]


class Card(_Strict):
    """A flashcard (#51). Its id is permanent: review schedules are stored
    against "<module-slug>/<id>", so rewording a card keeps its schedule and
    renaming the id starts it over."""

    id: Slug
    front: Text
    back: Text
    # The lesson heading it's about, as written after the ## (#104): the card
    # links to it. The loader checks the module has that heading.
    section: Text | None = None
    # Exact answers (`cp -r src dest`): typing one marks the card matched and
    # preselects Good. Compared with spaces collapsed; grading stays the learner's.
    accept: list[Text] = []
