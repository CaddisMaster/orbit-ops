#!/usr/bin/env bash
# Run the whole suite the way CI does: ruff, a fresh test database migrated to
# head, then pytest in parallel. Extra arguments go to pytest:
#   ./test.sh                     everything
#   ./test.sh tests/test_auth.py  one file
#   SKIP_LINT=1 ./test.sh         tests first, lint later
set -euo pipefail
cd "$(dirname "$0")"

LOCKFILE="${TEST_SH_LOCKFILE:-/tmp/orbit-ops-test-sh.lock}"
if command -v flock > /dev/null 2>&1; then
  exec 9> "$LOCKFILE"
  if ! flock -n 9; then
    echo "✗ A suite run is already in progress (lock: $LOCKFILE)." >&2
    exit 1
  fi
fi

PARALLEL="-n auto"
for arg in "$@"; do
  case "$arg" in -n*|--numprocesses*) PARALLEL="" ; break ;; esac
done

TEST_DB=orbit_test

web_is_running() { docker compose ps --status running --services 2>/dev/null | grep -qx web; }
web_has_dev_deps() { docker compose exec -T web python -c 'import pytest, ruff' >/dev/null 2>&1; }

if web_is_running && web_has_dev_deps; then
  echo "→ Using the running web container."
  RUNNER="docker compose exec -T -e DB_NAME=$TEST_DB -e DB_APP_USER= web"
else
  echo "→ No running dev stack; using a throwaway container."
  RUNNER="docker compose run --rm --build -e DB_NAME=$TEST_DB -e DB_APP_USER= web"
fi

if [ -z "${SKIP_LINT:-}" ]; then
  if ! $RUNNER python -m ruff check --no-cache; then
    echo "✗ ruff found problems — fix them, or SKIP_LINT=1 to get the test signal first." >&2
    exit 1
  fi
fi

docker compose up -d --wait db >/dev/null
docker compose exec -T -e TEST_DB="$TEST_DB" db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1 \
     -c "DROP DATABASE IF EXISTS \"$TEST_DB\" WITH (FORCE)" \
     -c "CREATE DATABASE \"$TEST_DB\""'
$RUNNER alembic upgrade head

exec $RUNNER python -m pytest -p no:cacheprovider $PARALLEL "$@"
