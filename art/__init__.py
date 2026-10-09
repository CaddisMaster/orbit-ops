"""The station's pixel art, as code (#38).

Each scene is a small stdlib-only Python module with a render() that returns a
Canvas; build.py writes every one to app/static/img/ as a PNG at its native
size, and the browser scales it up with `image-rendering: pixelated`.
tests/test_art.py re-renders every scene and compares the PIXELS with the
committed PNGs, so the images can never drift from their source.

    python -m art.build        # after changing anything in art/
"""
