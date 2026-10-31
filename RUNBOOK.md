# Operations Runbook

How Orbit Ops runs on the DigitalOcean droplet it **shares with Budget Buddy**. Budget Buddy's
`RUNBOOK.md` is the authority on the host itself (firewall, Nginx layout, TLS lineages, the
`deploy` user). This file covers only what Orbit Ops adds, and how not to disturb its neighbour.

> ⚠️ Host names, the droplet IP and the deploy user's details are not in this public repo. They
> live in the gitignored `CLAUDE.local.md` / the vault.

## 1. What runs where

| App | URL | Directory | Host port → container | Database |
|---|---|---|---|---|
| Budget Buddy | budget.seandesmet.com | `/opt/budget-buddy` | `127.0.0.1:5001` → 5000 | own `db`, `127.0.0.1:5432` |
| **Orbit Ops** | **learn.seandesmet.com** | **`/opt/orbit-ops`** | **`127.0.0.1:5002` → 8000** | **own `db`, not published** |
| Landing page | seandesmet.com | `/var/www/seandesmet.com` | static (Nginx) | — |

Every published port is bound to `127.0.0.1`: Docker's port publishing bypasses ufw, so a bare
`"5002:8000"` would expose plain HTTP on the public IP. `tests/test_repo_hardening.py` enforces it.

**Memory.** The droplet has 2 GB. Orbit Ops caps `web` and `db` at 256 MB each (`mem_limit` in
`docker-compose.yml`), and Postgres runs with `shared_buffers=64MB`. Check headroom before the
first deploy and after any change that adds a service:

```bash
free -m
docker stats --no-stream
swapon --show     # if empty, add a 2 GB swapfile — see §7
```

## 2. First-time setup (once)

Run as the `deploy` user unless noted. Steps 2 and 4, the deploy key and the nightly backup
are described as code in `infra/` (#322), checked against production in check mode; see
`infra/README.md`. The certificate and `.env` stay by hand: the role refuses to run without them.

```bash
# 1. DNS: an A record for `learn` → the droplet's IP (DigitalOcean → Networking → Domains).
dig +short learn.seandesmet.com            # must print the droplet IP before step 4

# 2. Deploy directory
sudo install -d -o deploy -g deploy -m 750 /opt/orbit-ops
cd /opt/orbit-ops
install -d -m 700 backups

# 3. .env — copy .env.example from the repo, then fill in (§3). Mode 600. On a rebuild,
#    restore it from Bitwarden instead (§3, "The recovery copy").
umask 077 && $EDITOR .env

# 4. Nginx site (as root) — see the block below, then:
sudo ln -s /etc/nginx/sites-available/learn.seandesmet.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d learn.seandesmet.com      # adds the 443 block + HTTP redirect
sudo certbot certificates                         # confirm ONE lineage covers learn.*

# 5. If the GitHub repo / ghcr package is private, the droplet must log in to pull:
#    echo <PAT with read:packages> | docker login ghcr.io -u CaddisMaster --password-stdin

# 6. Cut the first GitHub Release — the pipeline ships docker-compose.yml, creates the
#    db, migrates and starts the app (§5). Then create the learner account:
docker compose exec web python -m scripts.create_user <username>
```

`/etc/nginx/sites-available/learn.seandesmet.com` (before Certbot edits it):

```nginx
server {
  server_name learn.seandesmet.com;
  location / {
    proxy_pass http://127.0.0.1:5002;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  listen 80;
}
```

Security headers (CSP, HSTS, X-Frame-Options…) are set by the app, not Nginx, so they are
tested in `tests/test_security_headers.py`. Do not add duplicates here.

## 3. Environment and the database role

`.env` keys are documented in `.env.example`. Production values that differ from it:

| Key | Production |
|---|---|
| `TAG` | written by the deploy — never edit by hand except in break-glass |
| `COOKIE_SECURE` | `1` |
| `DB_APP_USER` / `DB_APP_PASSWORD` | `orbit_app` / a generated password (below) |
| `SECRET_KEY` | `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ANTHROPIC_API_KEY` | an Anthropic API key for this app alone (Console → API keys), so it can be revoked on its own. Empty turns every AI feature off: the readout shows **Uplink offline** |
| `AI_MONTHLY_BUDGET_CENTS` | `500` unless Sean says otherwise. A calendar month in `APP_TIMEZONE`; spend is in the `ai_requests` table |

**The least-privilege role.** Migration `0002` creates `orbit_app` with DML on every table (and,
through default privileges, every future table) but no DDL, no TRUNCATE, and **no password** —
this repo is public. After the first deploy has run the migrations:

```bash
cd /opt/orbit-ops && set -a && . ./.env && set +a
PW="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c "ALTER ROLE orbit_app PASSWORD '$PW'"
# put DB_APP_USER=orbit_app and DB_APP_PASSWORD=$PW in .env, then:
docker compose up -d web
curl -s http://127.0.0.1:5002/healthz      # {"status":"ok",...}
```

Until those two keys are set the app connects as the owner, which works but is not least-privilege.

### The recovery copy in Bitwarden (#320)

Each `.env` has a copy in Bitwarden: one secure note per environment, `orbit-ops-env-local` and
`orbit-ops-env-prod`, with **every** key as a custom field, the non-secret ones too. Compose
reads `.env` twice (`${VAR}` in `db`, `env_file:` for `web`), so a rebuilt file has to be
complete. `TAG` in the prod item is only a placeholder, because the deploy rewrites that line.

- The helpers are `bw-seed.sh` (once, refuses to overwrite) and `bw-env.sh` (rebuilds a file,
  checks the fetch before touching it, keeps one `.env.bak`, mode 600). Budget Buddy uses the
  same two. They live in the private `personal-vault` repo under `infra/bitwarden/`, and each
  clone symlinks them into its root, where `.gitignore` lists them.
- **No `bw` on the droplet.** Its `.env` stays a plain file, and the prod item is the recovery
  copy. Nothing reads it at deploy time.
- **Order of edits:** change the droplet's `.env` first, then the prod item (Bitwarden → the
  item → edit the field). If the item lags behind, a restore brings back an old value.
- `bw` is `@bitwarden/cli` from npm, pinned exactly (2026.10.0 on the VM, which is arm64; the
  native build is x64-only). It runs on the VM or the Mac, for local and prod alike. Unlock it once
  per terminal with `export BW_SESSION=$(bw unlock --raw)`.

Local, on the VM, from the repo root:

```bash
./bw-env.sh                                   # orbit-ops-env-local → .env (old one → .env.bak)
```

Prod, seeding it (once) from the VM or the Mac. The file is piped, so it never lands on local disk:

```bash
ssh <droplet> 'cat /opt/orbit-ops/.env' | ~/Developer/personal-vault/infra/bitwarden/bw-seed.sh - orbit-ops-env-prod
```

Prod, restoring after losing the droplet, from the VM or the Mac. Fetch the item into a private scratch
directory, copy the file up, then delete the local copy:

```bash
D=$(mktemp -d) && ~/Developer/personal-vault/infra/bitwarden/bw-env.sh orbit-ops-env-prod "$D/.env"
scp "$D/.env" <droplet>:/opt/orbit-ops/.env && ssh <droplet> 'chmod 600 /opt/orbit-ops/.env'
rm -rf "$D"
# then set TAG= to the release you're restoring, and redo the orbit_app password above if
# the database is new
```

Check a round-trip without touching anything (`-Ev '^#|^$'`: `bw-env.sh` writes a header
comment and a blank line):

```bash
D=$(mktemp -d) && ./bw-env.sh orbit-ops-env-local "$D/env" && \
diff <(grep -Ev '^#|^$' .env | sort) <(grep -Ev '^#|^$' "$D/env" | sort) && echo MATCH; rm -rf "$D"
```

## 4. GitHub configuration (once)

- **Environment `production`** with required reviewer = you.
  - Secrets: `DROPLET_SSH_KEY` (the deploy user's private key), `DROPLET_KNOWN_HOSTS`
    (`ssh-keyscan <host>`), `DROPLET_HOST`. Var: `DROPLET_USER`.
  - These can be the same values as Budget Buddy's — same box, same user.
- **Branch protection on `main`**: require PRs, require checks `Lint`, `Tests`, `Image builds`,
  `App changes update the changelog`, `Issue criteria are claimed by tests`; squash-merge only.
- **Settings → Code security**: secret scanning + push protection on.
- Labels: `skip-changelog`, `content`, `dependencies`, `ci`, `triage`.

## 5. Deploying, rolling back, and changing the `db` service

**Deploy** = publish a GitHub Release `vX.Y.Z` (see `VERSIONING.md`). `release.yml` builds and
pushes the image with an SBOM and provenance attached, boots it against a scratch Postgres
(migrations + `/healthz`), scans it with Grype (a fixable CRITICAL fails the release), waits for your
approval, then over SSH: installs the release's `docker-compose.yml` and the backup script the
nightly timer runs (§6), pins `TAG` in `.env`, takes a verified `pg_dump` (`scripts/backup_db.sh`), pulls `web`, runs
`alembic upgrade head` from the **new** image, `up -d`, and checks the running `APP_VERSION`
and the public `/healthz` both report the new version.

**Rollback** = Actions → Rollback → run with a version. It swaps the image back and does
**not** touch the schema; that is safe only because migrations are expand-only (see
`docs/gotchas.md`). To undo a schema change, restore the pre-deploy dump (§6).

**Never** run a bare `docker compose up -d` on the box mindlessly: after any edit to the `db`
service it recreates the database container. `postgres` is pinned by tag and digest (#266), so
a pull no longer changes it behind your back, but the edit itself still does.
`scripts/install_compose.sh` refuses a release whose compose file would recreate `db`, so a `db`
change is applied by hand, **before** the release that carries it, at a quiet time. As root on the
droplet, from the VM (while Gateway is connected) or a Mac terminal:

```bash
cd /opt/orbit-ops && set -a && . ./.env && set +a
# 1. What's running now. A change of MAJOR version (16 → 17) is not this procedure: it needs
#    a dump and restore. A minor change (16.x → 16.y) is safe to restart into.
docker compose exec -T db postgres --version
#    And the learner's rows, to compare at the end.
COUNTS="select (select count(*) from module_progress), (select count(*) from xp_events), (select count(*) from card_state)"
docker compose exec -T db psql -U "$DB_USER" "$DB_NAME" -tAc "$COUNTS"
# 2. A verified dump, private (root's umask would leave it world-readable) and owned by
#    deploy like the release backups.
( umask 077; set -o pipefail
  docker compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > backups/pre-db-change.sql.gz ) \
  && gzip -dc backups/pre-db-change.sql.gz | tail -n 20 | grep 'dump complete' \
  && chown deploy:deploy backups/pre-db-change.sql.gz && ls -l backups/pre-db-change.sql.gz
# Go on only if that printed "-- PostgreSQL database dump complete" (#116). A valid gzip
# alone proves nothing: a failed pg_dump still leaves one. (20 lines: a `\unrestrict` line
# follows the marker.)
# 3. main's docker-compose.yml, fetched at a commit and checked. The repo is public and the
#    deploy dir has no git. SHA and SUM are main's commit and `sha256sum docker-compose.yml` there.
curl -fsSL "https://raw.githubusercontent.com/CaddisMaster/orbit-ops/$SHA/docker-compose.yml" -o docker-compose.yml.new
echo "$SUM  docker-compose.yml.new" | sha256sum -c
cp -p docker-compose.yml docker-compose.yml.prev
chown deploy:deploy docker-compose.yml.new && chmod 644 docker-compose.yml.new && mv docker-compose.yml.new docker-compose.yml
docker compose config --quiet && echo config ok
# 4. Only db. Never name another service here, and never a bare `up -d`.
docker compose pull db && docker compose up -d db && sleep 15 && docker compose ps
docker compose exec -T db postgres --version
docker inspect -f '{{.HostConfig.SecurityOpt}}' $(docker compose ps -q db)
# 5. Both apps, since they share the droplet, and the same rows as in step 1.
curl -s http://127.0.0.1:5002/healthz; echo; curl -s http://127.0.0.1:5001/healthz; echo
docker compose exec -T db psql -U "$DB_USER" "$DB_NAME" -tAc "$COUNTS"
```

If `db` won't come up in step 4: `mv docker-compose.yml.prev docker-compose.yml && docker
compose up -d db` brings back the old definition and its still-cached image. The data volume
is never touched, and the step 2 dump is there if it's needed (§6). First run: #266,
2026-10-24 (16.14 → 16.15, rows unchanged).

`up -d db` touches only `db`, but `web` loses its connections while Postgres restarts; a page
load in that window gets the error page, and the next one works. The release that follows
installs the same file, and its guard then sees no `db` change.

## 6. Backups and restore

What exists, all in `/opt/orbit-ops/backups`:

| Dump | When | Kept | Made by |
|---|---|---|---|
| `pre-deploy-<timestamp>.sql.gz` | every deploy, before migrating | newest 14 | `release.yml` |
| `nightly-<timestamp>.sql.gz` | 03:30 New York time, and at boot after a missed night | newest 14 | `orbit-ops-backup.timer` (#324) |

- ⚠️ **No dump leaves the droplet yet.** Budget Buddy's off-box export doesn't include this
  directory until BB #535 lands. Until then, losing the droplet loses every dump. `.env` and
  the compose file aren't in any backup either: `.env` is recovered from Bitwarden (#320), and
  the compose file is in git at the release's tag.
- Both kinds go through `scripts/backup_db.sh` (#116): a dump counts only if `pg_dump` exited 0
  **and** the dump ends with `PostgreSQL database dump complete`. Otherwise no file is kept: the
  deploy stops before migrating, or the nightly unit fails. It writes `<file>.partial` first, so
  a dump that died midway leaves at most a `.partial`, which is safe to delete. Old nightly
  dumps are pruned only after a good one, so a run of failures never eats the ones left.
- The nightly unit runs `/opt/orbit-ops/backup_db.sh`, the copy **each release installs**, so
  it is always the script the deploy itself uses. Its files are `infra/systemd/` in the repo.
- A failed night shows in `systemctl --failed` and in
  `journalctl -u orbit-ops-backup.service`. Nothing alerts on it.

### Installing the nightly backup (once)

The Ansible role (`infra/`, #322) describes these units now; this is the by-hand way, kept for
reference until a real run of the role is decided. As root on the droplet, from the VM (while
Gateway is connected) or a Mac terminal. `SHA` is a `main` commit that has
#324, and each `*_SUM` is that file's `sha256sum` there. The release after #324 ships the script
itself, so step 1 only matters before then (it's harmless after).

1. The backup script, fetched at the commit and checked:

```bash
cd /opt/orbit-ops
curl -fsSL "https://raw.githubusercontent.com/CaddisMaster/orbit-ops/$SHA/scripts/backup_db.sh" -o .backup_db.sh.new
echo "$SCRIPT_SUM  .backup_db.sh.new" | sha256sum -c
chown deploy:deploy .backup_db.sh.new && chmod 755 .backup_db.sh.new && mv .backup_db.sh.new backup_db.sh
```

2. The two unit files:

```bash
cd /etc/systemd/system
curl -fsSL "https://raw.githubusercontent.com/CaddisMaster/orbit-ops/$SHA/infra/systemd/orbit-ops-backup.service" -o orbit-ops-backup.service
curl -fsSL "https://raw.githubusercontent.com/CaddisMaster/orbit-ops/$SHA/infra/systemd/orbit-ops-backup.timer" -o orbit-ops-backup.timer
echo "$SERVICE_SUM  orbit-ops-backup.service" | sha256sum -c
echo "$TIMER_SUM  orbit-ops-backup.timer" | sha256sum -c
chmod 644 orbit-ops-backup.service orbit-ops-backup.timer
systemd-analyze verify orbit-ops-backup.service orbit-ops-backup.timer && echo verify ok
```

3. Turn the timer on and see its next run (07:30 or 08:30 UTC, depending on daylight saving):

```bash
systemctl daemon-reload
systemctl enable --now orbit-ops-backup.timer
systemctl list-timers orbit-ops-backup.timer --no-pager
```

4. One run now, rather than waiting for tonight:

```bash
systemctl start orbit-ops-backup.service
journalctl -u orbit-ops-backup.service -n 5 --no-pager -o cat
ls -l /opt/orbit-ops/backups/nightly-*
```

Go on only if the journal says `backup ok: backups/nightly-…` and the file is
`-rw------- deploy deploy`.

Restore into the live database (stops the app first):

```bash
cd /opt/orbit-ops && set -a && . ./.env && set +a
docker compose stop web
docker compose exec -T db psql -U "$DB_USER" -d postgres -c "DROP DATABASE \"$DB_NAME\" WITH (FORCE)" -c "CREATE DATABASE \"$DB_NAME\""
gunzip -c backups/<file>.sql.gz | docker compose exec -T db psql -q -U "$DB_USER" -d "$DB_NAME"
docker compose up -d web
```

## 7. Health and troubleshooting

```bash
curl -s https://learn.seandesmet.com/healthz      # {"status":"ok","version":"X.Y.Z",...}
docker compose ps && docker compose logs --tail 100 web
grep ^TAG= .env                                   # what compose will run
```

| Symptom | Likely cause |
|---|---|
| 502 from Nginx | `web` not running or unhealthy: `docker compose ps`, then logs |
| `/healthz` → 503 `db_unavailable` | `db` down or out of memory: `docker stats`, `dmesg \| grep -i oom` |
| Every compose command errors about `TAG` | the `TAG=` line is missing from `.env` — by design; add it back |
| Containers OOM-killed | raise `mem_limit` only after checking `free -m`; add swap first |

Adding swap (as root), if `swapon --show` is empty:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
```
