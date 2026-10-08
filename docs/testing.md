# Testing

## Running

```bash
./test.sh                        # ruff, fresh orbit_test DB at head, pytest -n auto
./test.sh tests/test_auth.py -k rate
SKIP_LINT=1 ./test.sh
```

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
- **Repository rules are tests too** (`tests/test_repo_hardening.py`): exact pins, digest-pinned
  base image, prod as the final stage, localhost-only ports, required `TAG`, SHA-pinned actions,
  `.env.example` completeness.

## CI

`ci.yml` runs Lint, Tests (with an Alembic `downgrade base` / `upgrade head` / `check`
round-trip) and Image builds on every PR and on `main`. The release workflow additionally boots
the pushed image against a scratch database and checks `/healthz` reports the release version.
