"""The comms log (#38): messages, the cast, and what a module sends at its beats."""

from typing import Annotated, Literal

from pydantic import ConfigDict, Field

from .base import Slug, Text, _Strict


class Message(_Strict):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    from_: Slug = Field(alias="from")  # a cast slug
    text: Text  # inline Markdown


# ---------------------------------------------------------------------------
# The comms log (#38): the cast, and the messages a module sends at its beats.
# ---------------------------------------------------------------------------
Avatar = Literal["okafor", "meridian", "mission"]  # the sprites in art/sprites.py
WindowEvent = Literal["shuttle-dock", "relay-pass", "debris-drift", "aurora"]  # app/comms.py WINDOW_SPRITES


class CastSpec(_Strict):
    slug: Slug
    name: Text
    role: Text
    avatar: Avatar
    delay: Annotated[str, Field(pattern=r"^\d+(\.\d+)? s$")] | None = None  # light-delay, e.g. "1.3 s"


Beat = Literal["open", "console_done", "lab_done", "complete"]


class Comms(_Strict):
    """What a module's messages are and when they arrive: `open` when the
    module is first opened (the briefing), `console_done` when its console task
    passes, `lab_done` when its lab passes (#121), `complete` when it's
    completed (the debrief)."""

    open: list[Message] = []
    console_done: list[Message] = []
    lab_done: list[Message] = []
    complete: list[Message] = []
    window: dict[Beat, WindowEvent] = {}  # a window event that plays at a beat


class Drill(_Strict):
    """Flashcard review as MERIDIAN's watch drill (#82): the lines the crew may
    say when the day's drill is cleared. One is picked by the date, so they
    rotate rather than repeat."""

    cleared: Annotated[list[Message], Field(min_length=1)]
