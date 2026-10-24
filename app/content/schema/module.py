"""A module file: its front matter, lesson, quiz, cards and exercises."""

from typing import Annotated

from pydantic import Field, model_validator

from .base import Text, _Strict
from .challenge import Challenge
from .comms import Comms
from .lab import Lab
from .questions import Card, Question
from .terminal.exercise import TerminalExercise


class ModuleFile(_Strict):
    """A module's YAML front matter. The slug and the position in its unit come
    from the filename (`NN-slug.md`), not from here, so they cannot disagree."""

    title: Text
    minutes: Annotated[int, Field(ge=5, le=30)]
    xp: Annotated[int, Field(ge=0, le=500)] = 50
    story: Text  # the mission-log briefing that opens the module (Markdown)
    quiz: Annotated[list[Question], Field(min_length=1, max_length=8)]
    cards: list[Card] = []
    terminal: TerminalExercise | None = None  # a station-console task (#17)
    comms: Comms | None = None  # messages in the comms log (#38)
    challenge: Challenge | None = None  # a bonus Python challenge (#54)
    lab: Lab | None = None  # work on your own machine, checked by what you paste (#121)

    @model_validator(mode="after")
    def _challenge_inputs_are_console_files(self) -> ModuleFile:
        if self.challenge and self.challenge.inputs:
            files = {f.path for f in self.terminal.files if f.type == "file"} if self.terminal else set()
            for name, path in self.challenge.inputs.items():
                if path not in files:
                    raise ValueError(f"challenge.inputs.{name}: {path} is not a file in this module's console")
        return self

    @model_validator(mode="after")
    def _card_ids_unique(self) -> ModuleFile:
        seen: set[str] = set()
        for i, card in enumerate(self.cards):
            if card.id in seen:
                raise ValueError(f"cards.{i}.id: '{card.id}' is used by another card in this module")
            seen.add(card.id)
        return self
