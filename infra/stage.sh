#!/usr/bin/env bash
# Rehearse a release in an LXD container on the VM (#323), the way release.yml
# deploys it, before approving the production deployment:
#
#   infra/stage.sh <version>        # build orbit-stage if it's missing, then deploy
#   infra/stage.sh restore <dump>   # replace staging's database with a .sql.gz dump
#   infra/stage.sh status           # the running version and the row counts
#   infra/stage.sh down             # delete the container and everything in it
#
# Deploying fails if any table holds a different number of rows afterwards.
#
# It never contacts the droplet. Every secret in staging's .env is generated in the
# container and stays there. The steps below mirror release.yml's deploy job and
# use its scripts, at the release's tag; tests/test_infra.py fails if the two drift.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
# shellcheck source=infra/lib.sh
. "$here/lib.sh"

name=orbit-stage
APP_DIR=/opt/orbit-ops
URL=https://learn.seandesmet.com

ct() { lxc exec "$name" -- "$@"; }
# A login shell as `deploy`, in the deploy directory, as release.yml's ssh is.
as_deploy() { lxc exec "$name" -- su - deploy -c "cd $APP_DIR && $1"; }
is_built() { [[ $(lxc config get "$name" user.orbit.built 2>/dev/null) == 1 ]]; }

# --- the container, built by the same playbooks as production ------------------
write_env() {
  # Secrets are generated here, in the container, and never leave it. The settings
  # are production's (RUNBOOK §3). No ANTHROPIC_API_KEY, so nothing can spend.
  ct python3 - <<'PY'
import os, secrets, shutil
s = secrets.token_urlsafe
lines = {
    "DB_HOST": "db", "DB_PORT": "5432", "DB_NAME": "orbit", "DB_USER": "orbit",
    "DB_PASSWORD": s(32), "DB_APP_USER": "orbit_app", "DB_APP_PASSWORD": s(32),
    "SECRET_KEY": s(48), "COOKIE_SECURE": "1", "APP_TIMEZONE": "America/New_York",
    "ANTHROPIC_API_KEY": "", "AI_MONTHLY_BUDGET_CENTS": "500",
}
path = "/opt/orbit-ops/.env"
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    f.writelines(f"{k}={v}\n" for k, v in lines.items())
shutil.chown(path, "deploy", "deploy")
PY
}

build() {
  # A build that died partway has no marker, so it's started again from nothing.
  delete_container "$name"
  step "control node"
  control_node

  step "launch $name"
  launch_container "$name"

  local tmp
  tmp=$(mktemp -d)
  cat > "$tmp/inventory.yml" <<EOF
droplet:
  hosts:
    $name:
      ansible_connection: community.general.lxd
EOF
  step "Budget Buddy's host role"
  ansible-playbook -i "$tmp/inventory.yml" vendor/budget-buddy/infra/ansible/host.yml >"$tmp/host.log" \
    || { cat "$tmp/host.log"; die "the host role failed"; }
  tail -3 "$tmp/host.log"

  step "staging's .env and certificate"
  ct install -d -o deploy -g deploy -m 750 "$APP_DIR"
  write_env
  stand_in_certificate "$name"

  step "the app role"
  ansible-playbook -i "$tmp/inventory.yml" app.yml >"$tmp/app.log" \
    || { cat "$tmp/app.log"; die "the app role failed"; }
  tail -3 "$tmp/app.log"
  rm -rf "$tmp"
  cd "$root"
  lxc config set "$name" user.orbit.built 1
}

# --- row counts ----------------------------------------------------------------
# One `table|rows` line per table, sorted. Nothing before the first deploy.
counts() {
  as_deploy 'bash -s' <<'SH'
set -euo pipefail
[ -f docker-compose.yml ] && [ -n "$(docker compose ps -q db 2>/dev/null </dev/null)" ] || exit 0
set -a; . ./.env; set +a
psql() { docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At "$@" </dev/null; }
for t in $(psql -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version' ORDER BY 1"); do
  printf '%s|%s\n' "$t" "$(psql -c "SELECT count(*) FROM \"$t\"" | tr -d '\r')"
done | LC_ALL=C sort
SH
}

# --- a deploy: release.yml's deploy job, step for step -------------------------
deploy() {
  local VERSION=$1 tag=v$1 EXPECTED before after changed
  [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "'$VERSION' is not a version like 0.13.2"
  git -C "$root" rev-parse -q --verify "refs/tags/$tag^{commit}" >/dev/null \
    || git -C "$root" fetch -q origin "refs/tags/$tag:refs/tags/$tag" \
    || die "no tag $tag: publish the release first, so its image exists"
  show() { git -C "$root" show "$tag:$1"; }

  is_built || build

  before=$(counts)

  step "ship $tag's docker-compose.yml"
  EXPECTED="$(show docker-compose.yml | sha256sum | cut -d' ' -f1)"
  show docker-compose.yml | as_deploy "umask 022 && cat > .docker-compose.yml.new"
  show scripts/install_compose.sh | as_deploy "sh -s -- '${EXPECTED}' '${VERSION}' release"

  step "ship $tag's backup script"
  EXPECTED="$(show scripts/backup_db.sh | sha256sum | cut -d' ' -f1)"
  show scripts/backup_db.sh | as_deploy "set -e
    umask 022
    cat > .backup_db.sh.new
    echo '${EXPECTED}  .backup_db.sh.new' | sha256sum -c --quiet
    chmod 755 .backup_db.sh.new
    mv .backup_db.sh.new backup_db.sh"

  step "pin TAG and start the database"
  as_deploy "set -e
    touch .env.tmp && chmod 600 .env.tmp
    grep -v '^TAG=' .env > .env.tmp
    printf 'TAG=%s\n' '${VERSION}' >> .env.tmp
    mv .env.tmp .env
    docker compose up -d --wait db"

  step "back up the database"
  show scripts/backup_db.sh | as_deploy "bash -s -- pre-deploy"

  step "migrate and swap the image"
  as_deploy "set -e
    docker compose pull web
    docker compose run --rm --no-deps -T web alembic upgrade head
    # Staging only: production's password was set by hand once (RUNBOOK §3), and
    # 0002 creates the role without one, so a fresh database needs it here.
    set -a; . ./.env; set +a
    docker compose exec -T db psql -q -U \"\$DB_USER\" -d \"\$DB_NAME\" \
      -c \"ALTER ROLE \$DB_APP_USER PASSWORD '\$DB_APP_PASSWORD'\" </dev/null
    docker compose up -d --remove-orphans
    RUNNING=\"\$(docker compose exec -T web printenv APP_VERSION | tr -d '\r')\"
    if [ \"\$RUNNING\" != '${VERSION}' ]; then
      echo \"Deployed ${VERSION} but the running container reports '\$RUNNING'\"
      exit 1
    fi
    echo \"running version \$RUNNING\"
    ls -1t backups/pre-deploy-*.sql.gz | tail -n +15 | xargs -r rm --
    docker compose ps"

  step "verify over HTTPS, through Nginx"
  local body="" i
  for i in $(seq 1 20); do
    body=$(ct curl -skf --max-time 10 --resolve learn.seandesmet.com:443:127.0.0.1 "$URL/healthz" || true)
    if grep -q "\"version\":\"${VERSION}\"" <<<"$body"; then
      echo "Staged and healthy: $body"
      break
    fi
    echo "attempt $i: ${body:-<no response>}"
    sleep 5
  done
  grep -q "\"version\":\"${VERSION}\"" <<<"$body" || die "$URL/healthz is not serving ${VERSION}"

  step "the rows"
  after=$(counts)
  echo "$after"
  if [[ -n $before ]]; then
    # New tables from a migration are fine. A table that lost or gained rows isn't.
    changed=$(LC_ALL=C comm -23 <(echo "$before") <(echo "$after"))
    [[ -z $changed ]] || die "rows changed across the deploy, from: $changed"
    echo "ok: every table has the rows it had before"
  fi
  echo
  echo "PASS: $VERSION staged in $name. Delete it when done: infra/stage.sh down"
}

# --- a dump, usually production's, copied down from the Mac ----------------------
restore() {
  local dump=$1 owner
  is_built || die "$name isn't built; stage a version first, so there is a database to replace"
  [[ -r $dump ]] || die "can't read $dump"
  gzip -t "$dump" || die "$dump is not valid gzip"
  gzip -dc "$dump" | tail -n 20 | grep -q 'PostgreSQL database dump complete' \
    || die "$dump lacks pg_dump's completion line, so it stopped early"

  owner=$(ct id -u deploy)
  lxc file push -q --uid "$owner" --gid "$owner" --mode 600 "$dump" "$name$APP_DIR/backups/restore.sql.gz"

  step "replace staging's database"
  as_deploy 'bash -s' <<'SH'
set -euo pipefail
f=backups/restore.sql.gz
trap 'rm -f "$f"' EXIT
set -a; . ./.env; set +a
sql() { docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U "$DB_USER" "$@"; }

docker compose stop web </dev/null
sql -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)" </dev/null
sql -d postgres -c "CREATE DATABASE \"$DB_NAME\"" </dev/null
# The dump names its roles, and production's owner needn't be called what staging's
# is. pg_dump doesn't dump roles, so make any that are missing.
for role in $(gzip -dc "$f" | sed -nE 's/^ALTER .* OWNER TO "?([A-Za-z0-9_]+)"?;$/\1/p' | sort -u); do
  sql -d postgres -c "DO \$\$ BEGIN CREATE ROLE \"$role\"; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$" </dev/null
done
gzip -dc "$f" | sql -d "$DB_NAME" >/dev/null
docker compose up -d web </dev/null
SH
  step "the rows"
  counts
  echo
  echo "Restored. Stage the next release to rehearse the upgrade: infra/stage.sh <version>"
}

status() {
  is_built || die "$name isn't built"
  ct curl -skf --max-time 10 --resolve learn.seandesmet.com:443:127.0.0.1 "$URL/healthz" || echo "no response"
  echo
  counts
}

check_lxd
case "${1:-}" in
  "" | -h | --help) sed -n '2,8p' "$0" | cut -c3-; exit 2 ;;
  down) delete_container "$name"; echo "deleted $name" ;;
  status) status ;;
  restore) [[ $# == 2 ]] || die "usage: infra/stage.sh restore <dump.sql.gz>"; restore "$2" ;;
  *) [[ $# == 1 ]] || die "usage: infra/stage.sh <version>"; deploy "$1" ;;
esac
