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

Run as the `deploy` user unless noted.

```bash
# 1. DNS: an A record for `learn` → the droplet's IP (DigitalOcean → Networking → Domains).
dig +short learn.seandesmet.com            # must print the droplet IP before step 4

# 2. Deploy directory
sudo install -d -o deploy -g deploy -m 750 /opt/orbit-ops
cd /opt/orbit-ops
install -d -m 700 backups

# 3. .env — copy .env.example from the repo, then fill in (§3). Mode 600.
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
pushes the image, boots it against a scratch Postgres (migrations + `/healthz`), waits for your
approval, then over SSH: pins `TAG` in `.env`, takes a verified `pg_dump`, pulls `web`, runs
`alembic upgrade head` from the **new** image, `up -d`, and checks the running `APP_VERSION`
and the public `/healthz` both report the new version.

**Rollback** = Actions → Rollback → run with a version. It swaps the image back and does
**not** touch the schema; that is safe only because migrations are expand-only (see
`docs/gotchas.md`). To undo a schema change, restore the pre-deploy dump (§6).

**Never** run a bare `docker compose pull` or `docker compose up -d` without `TAG` on the box
mindlessly: a bare pull fetches a newer `postgres:16`, and the next `up -d` recreates the
database container. `scripts/install_compose.sh` refuses a release whose compose file would
recreate `db`. To change the `db` service deliberately:

```bash
cd /opt/orbit-ops && set -a && . ./.env && set +a
docker compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > backups/pre-db-change.sql.gz
gzip -t backups/pre-db-change.sql.gz
# copy the new docker-compose.yml up (scp), then:
docker compose up -d db && docker compose ps
curl -s http://127.0.0.1:5002/healthz
```

## 6. Backups and restore

- Every deploy writes `backups/pre-deploy-<timestamp>.sql.gz`; the newest 14 are kept.
- Off-box copies: add `/opt/orbit-ops/backups` to whatever already copies Budget Buddy's
  backups off the droplet (see that RUNBOOK §7).

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
