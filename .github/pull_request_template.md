Closes #

## Why
<!-- A sentence or two. The diff shows what; explain why. -->

## How it was verified
<!-- What did you actually run and look at? "CI is green" alone is not enough —
     CI does not click through the app. -->
- [ ] `docker compose up --build` and exercised the change in the browser
- [ ] `./test.sh` passes in full
- [ ] New behaviour has a test that fails without this change
- [ ] Every `Scenario:` in the issue's acceptance criteria is claimed — a
      `@pytest.mark.criterion(<n>, "<title>")` test, or a line below
      (the `Acceptance criteria` check enforces this)
<!-- For a criterion no test can hold (docs, process), one line each:
Verified by hand: #<n> "<Scenario title>" — what you checked
-->

## Checklist
- [ ] `CHANGELOG.md` updated under `## [Unreleased]`
- [ ] Any new query is scoped to the current user
- [ ] A schema change is an Alembic revision **in its own PR**, expand-only (no drop/rename of
      anything the running image uses)
- [ ] New lesson content passes `tests/test_content.py` and was fact-checked, not just generated
- [ ] No secrets or credentials in the diff
