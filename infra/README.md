# infra/: Orbit Ops's part of the droplet as code

The droplet is shared with Budget Buddy and was built by hand from `RUNBOOK.md` §2 and §6.
This describes Orbit Ops's layer so it can be rebuilt (the 26.04 upgrade is a rebuild, not an
in-place upgrade) and checked against production.

| Path | What | Issue |
|---|---|---|
| `ansible/roles/orbit_ops_app/` | `/opt/orbit-ops` and `backups/`, the `.env` check, Orbit Ops's deploy key, the `learn` Nginx site, the nightly backup units | #322 |
| `systemd/` | `orbit-ops-backup.{service,timer}`, the one copy the role installs | #324 |
| `stage.sh`, `lib.sh` | Staging: a release rehearsed in LXD the way `release.yml` deploys it | #323 |
| `host-role.pin` | Budget Buddy's host role (`droplet_host`, BB #530), pinned by commit SHA | #322 |

**Layers.** Budget Buddy owns the host: the `deploy` user, sshd, ufw, Docker, Nginx and Certbot
installed, UTC. This repo's playbook (`ansible/app.yml`) runs only `orbit_ops_app` on top, so it
can never change what Budget Buddy depends on. The host role is fetched at its pin for the LXD
test only (`fetch_host_role.sh`, into the gitignored `ansible/vendor/`), because
`ansible-galaxy` installs roles only from a repository's root. To bump the pin, read BB's diff
since the old SHA (the `droplet_host_*` variables are the interface), change `host-role.pin` in
its own PR, and run `infra/test.sh`.

What the role **never** does:

- **Write `.env` or `docker-compose.yml`.** `release.yml` owns both and rewrites `TAG=` on
  every deploy, so a role that templated them would see drift after every release. It checks
  that `.env` exists, mode `600 deploy:deploy`, and fails naming the file if it doesn't.
  `backup_db.sh` arrives with each release too.
- **Request a certificate.** The site file is production's byte for byte, as Certbot left it,
  so it names the `learn` lineage. The role fails, naming the file, if the certificate,
  `options-ssl-nginx.conf` or `ssl-dhparams.pem` is missing. On a rebuild, Certbot comes first.
- **Rewrite `deploy`'s `authorized_keys`.** It adds its own restricted line
  (`github-actions orbit-ops deploy`, public half only) with `exclusive: false`.
- **Touch another site.** It writes `learn.seandesmet.com` in `sites-available` and its link.

## Testing in LXD (on the `jupiter` VM)

```bash
infra/test.sh           # host role → refusals → run → run again → check mode → verify → delete
KEEP=1 infra/test.sh    # leave the container up to poke at
```

About two minutes. It builds the control node from the pins (`requirements-infra.txt`,
`ansible/requirements.yml`, `host-role.pin`, all checked by `tests/test_infra.py`) into
`infra/.venv`, and creates and deletes **only** containers named `orbit-*`. In order:

1. Budget Buddy's host role, then a `deploy` key line neither role declares.
2. With no `.env`, then with `.env` mode 644, the run fails naming the file and leaves it as
   it was. With no certificate, it fails naming `fullchain.pem`.
3. A self-signed certificate at the `learn` lineage's paths, plus Certbot's own TLS options and
   DH parameters from the installed package. Let's Encrypt is blocked in `/etc/hosts`.
4. A full run, then a second run and a `--check --diff` run, both `changed=0`.
5. Checks: modes and owners, no compose file, `nginx -t`, HTTPS through Nginx reaches a
   backend on `127.0.0.1:5002`, port 80 redirects, the deploy key once in production's shape,
   the planted line untouched, the timer enabled and active, the units identical to
   `systemd/`, no ACME account.

LXD itself is Budget Buddy's setup (its `infra/README.md` has the preseed). ⚠️ Docker's
iptables `FORWARD DROP` blocks `lxdbr0`, and the two `DOCKER-USER` rules that fix it **don't
survive a reboot of the VM**. `test.sh` stops with a pointer here when the container has no
network. Re-add them:

```bash
sudo iptables -I DOCKER-USER -i lxdbr0 -j ACCEPT
sudo iptables -I DOCKER-USER -o lxdbr0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
```

## Staging in LXD (#323)

```bash
infra/stage.sh <version>        # build orbit-stage if it's missing, then deploy
infra/stage.sh restore <dump>   # replace staging's database with a .sql.gz dump
infra/stage.sh status           # the running version and the row counts
infra/stage.sh down             # delete the container and everything in it
```

`orbit-stage` is built by the same playbooks as production, then each version is deployed the
way `release.yml` does it, with that tag's `docker-compose.yml`, `install_compose.sh` and
`backup_db.sh`: pin `TAG=`, back up, migrate from the new image, swap, check `/healthz` over
HTTPS through Nginx. `tests/test_infra.py` fails if the steps drift from `release.yml`. It adds
one step: setting `orbit_app`'s password, which production did by hand once (RUNBOOK §3).
Deploying fails if any table's row count changes.

Its `.env` has production's settings (`COOKIE_SECURE=1`, the `orbit_app` role,
`APP_TIMEZONE`), and every secret is generated in the container. It has no
`ANTHROPIC_API_KEY`, so nothing can spend. The script never contacts the droplet.

What staging can't show:

- **amd64.** The droplet runs amd64 and this VM arm64, so an amd64-only fault won't appear. The
  CI smoke test covers amd64. Images before 0.13.1 have no arm64 half (#321), so can't be staged.
- **Real TLS and DigitalOcean's network.** The certificate is self-signed, and only the container
  itself is a client: nothing outside it reaches staging.
- **Memory pressure.** The VM isn't sharing 2 GB with Budget Buddy, so `free -m` means nothing here.

The `DOCKER-USER` rules above are needed here too. The steps for a release are RUNBOOK §5.

## Checking production

**Check mode only, from the Mac**, in a throwaway clone pinned to the reviewed commit and
deleted afterwards (Sean, 2026-10-29, confirmed 2026-10-31 for this role). A real run is a
separate decision. The playbook doesn't run the host role, so this touches only Orbit Ops's
files.

```bash
SHA=<the reviewed commit on main>
tmp=$(mktemp -d) && git -C "$tmp" init -q \
  && git -C "$tmp" fetch -q --depth 1 https://github.com/CaddisMaster/orbit-ops.git "$SHA" \
  && git -C "$tmp" checkout -q FETCH_HEAD && cd "$tmp/infra/ansible"
python3 -m venv ../.venv && ../.venv/bin/pip install -q -r ../requirements-infra.txt
../.venv/bin/ansible-galaxy collection install -r requirements.yml -p ./collections
cp inventory.example.yml inventory.yml   # then put the droplet's address in ansible_host
../.venv/bin/ansible-playbook app.yml --check --diff
cd ~ && rm -rf "$tmp"
```

Every difference it reports gets one of two outcomes: **fix the role**, or **record it in
`RUNBOOK.md` as deliberate.** Production is never changed to match the role.
