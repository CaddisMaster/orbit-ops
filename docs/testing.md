# Testing

## Running

```bash
./test.sh                        # ruff, fresh orbit_test DB at head, pytest -n auto
./test.sh tests/test_auth.py -k rate
SKIP_LINT=1 ./test.sh
```

The station console's shell is JavaScript and has its own tests: `node --test tests/js/*.test.js`.
`./test.sh` runs them on the host first (the app image has no Node) and skips them, saying so,
if Node isn't installed. CI's Tests job always runs them. They use only `node:test`, so there's
nothing to install or pin. A criterion only a JS test or a browser can show goes in the PR body
as a `Verified by hand:` line naming the test.

Two fixtures connect the halves. `tests/js/fixtures/exercises.json` is every real exercise with
its reference solution, written by `scripts/export_exercises.py` (a Python test fails if it's
stale). `tests/js/fixtures/check_cases.json` is a hand-written set of checks and expected
verdicts that **both** graders must agree on, so a solution the browser accepts is one the server
accepts.

`test.sh` reuses the running dev `web` container when it has the dev dependencies, otherwise it
builds a throwaway one. It drops and recreates `orbit_test` and runs `alembic upgrade head` each
time, so tests always see the current schema.

## Conventions

- **Real Postgres, no SQL mocks.** Fixtures create rows with unique names (`make_user`) and delete
  them afterwards, which is what makes `-n auto` safe.
- **Password hashing is cheap in tests** (`tests/conftest.py` swaps the argon2 parameters).
  Production parameters cost 64 MiB per hash; eight workers would exceed the container limit.
- **CSRF is never disabled in tests.** `tests.conftest.csrf(client)` reads the token from a
  rendered form, the way a browser does; `login(client, username)` uses it.
- **Claim acceptance criteria** with `@pytest.mark.criterion(<issue>, "<Scenario title>")`.
  Both arguments must be literals; `scripts/check_criteria.py` parses the source.
- **Only the PR that finishes an issue closes it.** The check reads the PR's
  `closingIssuesReferences`, so a `Closes #N` *anywhere* in the body (or a manual link in the
  sidebar) makes it demand every one of #N's scenarios. A PR doing part of the work, like the
  migration PR that goes first under CONTRIBUTING §2, says `Part of #N` instead. Getting this
  wrong costs one failed run, plus a GitHub email, per body edit (#13 got two).
- **Repository rules are tests too** (`tests/test_repo_hardening.py`): exact pins, digest-pinned
  base image, prod as the final stage, localhost-only ports, required `TAG`, SHA-pinned actions,
  `.env.example` completeness.

## CI

`ci.yml` runs Lint, Tests (with an Alembic `downgrade base` / `upgrade head` / `check`
round-trip) and Image builds on every PR and on `main`. The release workflow additionally boots
the pushed image against a scratch database and checks `/healthz` reports the release version.
