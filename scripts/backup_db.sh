#!/bin/bash
# #116 — take a verified pg_dump before a deploy changes anything.
#
# Runs ON the Droplet, from the deploy directory, two ways:
#
#   ssh ... "cd /opt/orbit-ops && bash -s -- pre-deploy" < scripts/backup_db.sh
#       release.yml, before migrations. It prunes pre-deploy dumps itself.
#   bash /opt/orbit-ops/backup_db.sh nightly 14
#       orbit-ops-backup.service (#324), from the copy each release installs.
#       The second argument keeps only the newest 14 `nightly-` dumps.
#
# Prints `backup ok: <file> (<bytes> bytes)` and exits 0 only when the dump is
# whole. Any other exit stops the deploy before migrations and the image swap,
# or fails the nightly unit (`systemctl --failed`).
#
# ⚠️ bash, not sh. The check this replaced was `pg_dump | gzip > f; gzip -t f`
# under `set -e` alone: a pipeline's status is its LAST command's, so a failed
# pg_dump still left a valid (tiny) gzip that passed `gzip -t`. `pipefail` fixes
# that, and Ubuntu 24.04's dash (0.5.12-6ubuntu5) refuses `set -o pipefail`
# ("Illegal option"), so this must not run under `sh -s`.
#
# Two checks, because either alone has a hole:
#   - pipefail catches pg_dump exiting non-zero;
#   - the completion line catches a dump that stopped early without saying so.
#     pg_dump writes `-- PostgreSQL database dump complete` near its end.
set -euo pipefail

PREFIX="${1:-pre-deploy}"
KEEP="${2:-}"
case "$KEEP" in
  "" | [1-9] | [1-9][0-9] | [1-9][0-9][0-9]) ;;
  *) echo "::error::KEEP must be a whole number from 1 to 999, not '$KEEP'."; exit 2 ;;
esac

set -a
. ./.env
set +a

mkdir -p backups
DUMP="backups/${PREFIX}-$(date +%Y%m%d-%H%M%S).sql.gz"
# Written under another name and renamed only once it checks out, so a failed
# dump never looks like a backup (or counts towards the 14 kept).
PARTIAL="${DUMP}.partial"

fail() {
  rm -f "$PARTIAL"
  echo "::error::$1 No backup was kept (a deploy stops here)."
  exit 1
}

# ⚠️ `< /dev/null`: under `bash -s` this script IS stdin, and `exec -T` forwards
# stdin to the container, so without it pg_dump swallows the rest of the script
# and bash exits 0 having checked nothing (found running it against real Postgres).
if ! docker compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" < /dev/null | gzip > "$PARTIAL"; then
  fail "pg_dump failed (see its message above)."
fi
gzip -t "$PARTIAL" || fail "The dump is not valid gzip."
# Read the tail into a variable instead of piping into `grep -q`: grep -q exits
# at its first match, and under pipefail the writer's SIGPIPE would fail a good dump.
# 20 lines, not 3: a current pg_dump ends with a `\unrestrict <key>` line AFTER the
# completion comment, which puts it 5th from the end (16.15, 2026-10-12).
TAIL="$(gzip -dc "$PARTIAL" | tail -n 20)"
case "$TAIL" in
  *"PostgreSQL database dump complete"*) ;;
  *) fail "The dump lacks pg_dump's completion line, so it stopped early." ;;
esac

mv "$PARTIAL" "$DUMP"
echo "backup ok: $DUMP ($(stat -c%s "$DUMP") bytes)"

# Only after a good dump, so a run of failures never eats the dumps that are left.
# The names sort by time, and the glob can't match a `.partial`.
if [ -n "$KEEP" ]; then
  printf '%s\n' backups/"${PREFIX}"-*.sql.gz | sort -r | tail -n +"$((KEEP + 1))" | xargs -r rm --
fi
