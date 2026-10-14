"""Markdown → HTML for lessons, done once at load time.

Raw HTML in Markdown is DISABLED: lesson text is escaped, never trusted, so a
stray `<script>` in a lesson renders as text instead of running (and the CSP
would block it anyway). Fenced code blocks are highlighted by Pygments into
CSS classes (app/static/css/pygments.css), never inline styles, which the CSP
(`style-src 'self'`) would also block.
"""

import re
from html import escape

from markdown_it import MarkdownIt
from markupsafe import Markup
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

_FORMATTER = HtmlFormatter(nowrap=True)


def _highlight(code: str, lang: str, _attrs) -> str:
    try:
        lexer = get_lexer_by_name(lang) if lang else None
    except ClassNotFound:
        lexer = None
    body = highlight(code, lexer, _FORMATTER) if lexer else escape(code)
    # Returning a string that starts with <pre makes markdown-it use it as-is.
    label = f' data-lang="{escape(lang)}"' if lang else ""
    return f'<pre class="highlight"{label}><code>{body}</code></pre>\n'


_md = MarkdownIt("commonmark", {"html": False, "highlight": _highlight}).enable("table")


def _section_slug(source: str) -> str:
    """"Moving: `cd`" → "moving-cd": letters and digits only, hyphen-joined."""
    return "-".join(re.findall(r"[a-z0-9]+", source.casefold())) or "section"


def _headings(tokens):
    """(heading_open token, heading source, element id) for each ## and ###.
    Ids are "sec-<slug>", so no lesson heading can take an id the page uses
    (#completion, #q0 …); a repeated slug gets -2, -3."""
    used: set[str] = set()
    for opening, inline in zip(tokens, tokens[1:], strict=False):
        if opening.type == "heading_open" and opening.tag in ("h2", "h3"):
            base = "sec-" + _section_slug(inline.content)
            anchor, n = base, 1
            while anchor in used:
                n += 1
                anchor = f"{base}-{n}"
            used.add(anchor)
            yield opening, inline.content, anchor


def lesson_sections(text: str) -> dict[str, str]:
    """{heading source: element id} for a lesson's ## and ### headings (#104).
    The source is the heading as written, `code` and all: what a card's
    `section:` names."""
    sections: dict[str, str] = {}
    for _, source, anchor in _headings(_md.parse(text)):
        sections.setdefault(source, anchor)
    return sections


def render_markdown(text: str, *, anchors: bool = False) -> str:
    """With `anchors`, ## and ### headings get the ids lesson_sections() names,
    so a flashcard can link to the part of the lesson it's about (#104)."""
    if not anchors:
        return _md.render(text)
    tokens = _md.parse(text)
    for opening, _, anchor in _headings(tokens):
        opening.attrSet("id", anchor)
    return _md.renderer.render(tokens, _md.options, {})


def render_inline(text: str) -> Markup:
    """Inline Markdown only (`code`, *emphasis*, links), no wrapping <p>. For
    quiz questions, options and explanations. Raw HTML is still escaped, which
    is what makes returning Markup safe."""
    return Markup(_md.renderInline(text))


def render_code(code: str, lang: str = "text") -> Markup:
    """A highlighted block, as a fenced one in a lesson renders: for the
    script or output a quiz question shows. Escaped by Pygments or `escape`."""
    return Markup(_highlight(code, lang, None))


def pygments_css() -> str:
    """The stylesheet for highlighted code. Regenerate app/static/css/pygments.css with
    `docker compose exec -T web python -c "from app.content.render import pygments_css; print(pygments_css())"`."""
    return HtmlFormatter(style="github-dark").get_style_defs(".highlight")
