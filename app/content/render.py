"""Markdown → HTML for lessons, done once at load time.

Raw HTML in Markdown is DISABLED: lesson text is escaped, never trusted, so a
stray `<script>` in a lesson renders as text instead of running (and the CSP
would block it anyway). Fenced code blocks are highlighted by Pygments into
CSS classes (app/static/css/pygments.css), never inline styles, which the CSP
(`style-src 'self'`) would also block.
"""

from html import escape

from markdown_it import MarkdownIt
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


def render_markdown(text: str) -> str:
    return _md.render(text)


def pygments_css() -> str:
    """The stylesheet for highlighted code. Regenerate app/static/css/pygments.css with
    `docker compose exec -T web python -c "from app.content.render import pygments_css; print(pygments_css())"`."""
    return HtmlFormatter(style="github-dark").get_style_defs(".highlight")
