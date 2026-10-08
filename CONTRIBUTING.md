# Contributing to Orbit Ops

The workflow is Budget Buddy's, deliberately: it has been tested on a real deployment and its
rules each exist because something went wrong without them. This file gives the rules and the
reasons; `CLAUDE.md` is the short form.

## 1. Get it running

See `README.md` § Run it locally. Everything runs in containers; a host `.venv` is only for the
editor's language server. Templates and Python reload live (the override bind-mounts the source
and runs `uvicorn --reload`). Changing `requirements*.txt` or the `Dockerfile` needs
`docker compose up -d --build web`.

Pre-commit hooks (secret detection, whitespace, YAML/TOML checks):

```bash
pip install pre-commit && pre-commit install
```

## 2. The workflow

1. **Issue first.** Features use the Feature template with acceptance criteria in
   Given/When/Then form; lessons use the Lesson template. "Done" is agreed before code exists.
2. **Branch** `<issue#>-short-slug` from `main`.
3. **Test first where you can.** Each scenario in the issue becomes a test claimed with
   `@pytest.mark.criterion(<issue>, "<Scenario title>")`. CI's *Acceptance criteria* check fails a
   PR whose issue promises a scenario no test claims (or that the PR body does not mark
   `Verified by hand:`).
4. **PR** with `Closes #N`, the template filled in honestly, `CHANGELOG.md` updated if `app/`
   changed. **Squash-merge.** No direct pushes to `main`.
5. **After merging, check the CI run on `main`**, not just the PR's.

### Milestones

One open at a time; each is a MINOR release (`docs/roadmap.md` §8). An issue that does not
belong to the open milestone waits.

### How much goes in one PR

Batch by **coherence** — a shared file surface, test surface or one user-facing story — never by
calendar. An Alembic revision **always stands alone**: bundling it obscures the deploy ordering
it depends on.

### Commit messages

Imperative, capitalised subject ("Award XP on module completion"); the body explains *why*.

## 3. Gotchas

The live list is `docs/gotchas.md`. The ones most likely to bite a first PR:

- **Jinja typos render as empty strings, not errors.** Tests must assert on rendered content.
- **Forgetting the CSRF token** on a plain `<form method="post">` gives a 403 "session expired"
  page. htmx requests get it automatically.
- **Inline scripts without the nonce** are silently blocked by the CSP — check the browser console.
- **`get_settings()` is cached.** Tests that need different settings must build a `Settings`
  directly rather than mutating the environment after import.

## 4. Database changes

```bash
docker compose exec web alembic revision --autogenerate -m "add module_progress"
# review the generated file — autogenerate misses server defaults and renames
docker compose exec web alembic upgrade head
docker compose exec web alembic check       # models and migrations agree
```

Rules: expand-only within a release (add columns nullable or with a default; drop/rename in a
later release); the app role's grants are automatic (default privileges, migration `0002`); CI
round-trips every migration (`downgrade base` → `upgrade head`), so write real `downgrade()`s.

## 5. Lesson content (from v0.2.0)

Lessons are Markdown with YAML front matter under `content/`, validated by Pydantic at startup
and in CI. AI-drafted modules are reviewed and fact-checked like code — a draft is a starting
point, not a source. Format and process: `docs/content-authoring.md`.

## 6. Security expectations

- No secrets in the repo (it is public). `.env` is gitignored and `.dockerignore`d.
- New env vars go in `app/config.py` **and** `.env.example` (a test enforces this).
- Report vulnerabilities privately via GitHub Security Advisories.
