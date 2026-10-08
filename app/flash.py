"""One-shot messages carried across a redirect in the signed session cookie."""

from fastapi import Request


def flash(request: Request, message: str) -> None:
    request.session["flash"] = message


def pop_flash(request: Request) -> str | None:
    return request.session.pop("flash", None)
