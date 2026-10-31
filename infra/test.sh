#!/usr/bin/env bash
# Test the app role (#322) in a throwaway LXD system container on the VM:
#   launch -> Budget Buddy's host role -> refusals without a proper .env and
#   certificate -> run -> run again (changed=0) -> verify -> check mode -> delete
#
#   infra/test.sh            # keeps nothing
#   KEEP=1 infra/test.sh     # leaves the container up to poke at
#
# It creates and deletes ONLY containers named orbit-*. Containers, never --vm:
# the VM has no /dev/kvm. LXD must be initialised first (infra/README.md).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
ansible_dir=$here/ansible
venv=$here/.venv
name="orbit-app-$(date +%s)"

die() { echo "infra/test.sh: $*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

delete_container() {
  [[ $1 == orbit-* ]] || die "refusing to delete '$1': not an orbit- container"
  lxc delete --force "$1" >/dev/null 2>&1 || true
}

command -v lxc >/dev/null || die "lxc not found; LXD is not installed"
lxc storage show default >/dev/null 2>&1 || die "LXD is not initialised; see infra/README.md"

# --- the control node: pinned ansible-core, collections and host role --------
step "control node"
if [[ ! -x $venv/bin/ansible-playbook ]] || ! cmp -s "$here/requirements-infra.txt" "$venv/.requirements"; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install -q --no-deps -r "$here/requirements-infra.txt"
  "$venv/bin/pip" check || die "requirements-infra.txt is missing a dependency; pin it there"
  cp "$here/requirements-infra.txt" "$venv/.requirements"
fi
export PATH="$venv/bin:$PATH"
"$here/fetch_host_role.sh"
cd "$ansible_dir"
ansible-galaxy collection install -r requirements.yml -p ./collections >/dev/null
ansible --version | head -1

# --- nothing private is committable ------------------------------------------
step "the real inventory is gitignored"
git -C "$here/.." check-ignore -q infra/ansible/inventory.yml \
  || die "infra/ansible/inventory.yml is NOT gitignored; the droplet's address would be committable"
echo "ok: infra/ansible/inventory.yml is ignored"

# --- launch ------------------------------------------------------------------
step "launch $name"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"; [[ ${KEEP:-} == 1 ]] || delete_container "$name"' EXIT
timeout 300 lxc launch -q ubuntu:24.04 "$name" -c security.nesting=true \
  || die "lxc launch failed or took over 5 minutes (try: lxc image list; lxc launch by hand)"
lxc exec "$name" -- cloud-init status --wait >/dev/null || true

# Docker on the VM sets the FORWARD policy to DROP, which silently blackholes
# LXD's bridge (shared changes log, 2026-10-30). Fail here, naming the fix.
if ! lxc exec "$name" -- timeout 15 curl -fsS -o /dev/null https://download.docker.com/; then
  die "the container has no internet. Docker's FORWARD DROP is blocking lxdbr0; see infra/README.md"
fi

# Nothing here may reach Let's Encrypt; the certificate below is self-signed.
lxc exec "$name" -- sh -c 'echo "127.0.0.1 acme-v02.api.letsencrypt.org" >> /etc/hosts'

ct() { lxc exec "$name" -- "$@"; }

cat > "$tmp/inventory.yml" <<EOF
droplet:
  hosts:
    $name:
      ansible_connection: community.general.lxd
EOF
play() { ansible-playbook -i "$tmp/inventory.yml" "$@"; }
recap_ok() { grep -qE "^$name +: ok=[0-9]+ +changed=0 +unreachable=0 +failed=0" "$1"; }

# --- the host layer: Budget Buddy's role, at the pin --------------------------
step "Budget Buddy's host role"
play vendor/budget-buddy/infra/ansible/host.yml >"$tmp/host.log" || { cat "$tmp/host.log"; die "the host role failed"; }
tail -3 "$tmp/host.log"

# A line neither role declares, as BB's backup-export key is on production.
unmanaged='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOrbitTestUnmanagedKeyxxxxxxxxxxxxxxxxxxxxxxxx backup-export'
ct sh -c "echo '$unmanaged' >> /home/deploy/.ssh/authorized_keys"

# --- refusals: .env, then the certificate ------------------------------------
step "no .env: the run must fail and name the file"
if play app.yml >"$tmp/no-env.log" 2>&1; then die "the run passed with no .env"; fi
grep -q '/opt/orbit-ops/.env must exist' "$tmp/no-env.log" || { cat "$tmp/no-env.log"; die "the failure doesn't name .env"; }
ct test ! -e /opt/orbit-ops/.env || die "the role created .env"
echo "ok: refused, named /opt/orbit-ops/.env, wrote nothing"

step ".env mode 644: the run must fail and leave it alone"
ct sh -c 'printf "SECRET_KEY=test-only-not-a-secret\n" > /opt/orbit-ops/.env && chown deploy:deploy /opt/orbit-ops/.env && chmod 644 /opt/orbit-ops/.env'
before=$(ct sha256sum /opt/orbit-ops/.env)
if play app.yml >"$tmp/bad-mode.log" 2>&1; then die "the run passed with .env mode 644"; fi
grep -q '/opt/orbit-ops/.env must exist' "$tmp/bad-mode.log" || { cat "$tmp/bad-mode.log"; die "the failure doesn't name .env"; }
[[ $(ct stat -c %a /opt/orbit-ops/.env) == 644 ]] || die "the role changed .env's mode"
[[ $(ct sha256sum /opt/orbit-ops/.env) == "$before" ]] || die "the role changed .env's contents"
! grep -q 'test-only-not-a-secret' "$tmp/bad-mode.log" || die "the run printed .env's contents"
echo "ok: refused, named the file, left it unchanged"
ct chmod 600 /opt/orbit-ops/.env

step "no certificate: the run must fail and name it"
if play app.yml >"$tmp/no-cert.log" 2>&1; then die "the run passed with no certificate"; fi
grep -q 'live/learn.seandesmet.com/fullchain.pem is missing' "$tmp/no-cert.log" \
  || { cat "$tmp/no-cert.log"; die "the failure doesn't name the certificate"; }
echo "ok: refused, named the certificate"

# Stand-ins for what Certbot leaves on production: a self-signed lineage, and
# Certbot's own TLS options and DH parameters, copied from the installed package.
ct sh -c '
  set -e
  d=/etc/letsencrypt/live/learn.seandesmet.com && mkdir -p "$d"
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=learn.seandesmet.com \
    -keyout "$d/privkey.pem" -out "$d/fullchain.pem" 2>/dev/null
  cp "$(find /usr/lib/python3/dist-packages -name options-ssl-nginx.conf | head -1)" /etc/letsencrypt/
  cp "$(find /usr/lib/python3/dist-packages -name ssl-dhparams.pem | head -1)" /etc/letsencrypt/'

# --- first full run, then nothing to do ---------------------------------------
step "first run"
play app.yml

step "second run (must report changed=0)"
play app.yml | tee "$tmp/second.log"
recap_ok "$tmp/second.log" || die "the second run changed something or failed; see the recap above"

step "check mode (as on production; must report changed=0)"
play app.yml --check --diff | tee "$tmp/check.log"
recap_ok "$tmp/check.log" || die "check mode reports a change on a host the role just built"

# --- verify --------------------------------------------------------------------
step "verify"
[[ $(ct stat -c '%a %U:%G' /opt/orbit-ops) == '750 deploy:deploy' ]] || die "/opt/orbit-ops is not 750 deploy:deploy"
[[ $(ct stat -c '%a %U:%G' /opt/orbit-ops/backups) == '700 deploy:deploy' ]] || die "backups/ is not 700 deploy:deploy"
[[ $(ct stat -c '%a %U:%G' /opt/orbit-ops/.env) == '600 deploy:deploy' ]] || die ".env changed"
ct test ! -e /opt/orbit-ops/docker-compose.yml || die "the role wrote docker-compose.yml; release.yml owns it"

[[ $(ct readlink /etc/nginx/sites-enabled/learn.seandesmet.com) == /etc/nginx/sites-available/learn.seandesmet.com ]] \
  || die "the learn site is not enabled"
ct nginx -t

# The site proxies to 5002: stand a backend up there and go through Nginx.
ct sh -c 'mkdir -p /tmp/be && echo learn-backend > /tmp/be/index.html && cd /tmp/be &&
  nohup python3 -m http.server 5002 --bind 127.0.0.1 >/dev/null 2>&1 &'
sleep 1
body=$(ct curl -sk --resolve learn.seandesmet.com:443:127.0.0.1 https://learn.seandesmet.com/)
[[ $body == learn-backend ]] || die "https://learn.seandesmet.com/ did not reach 127.0.0.1:5002 (got: $body)"
redirect=$(ct curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --resolve learn.seandesmet.com:80:127.0.0.1 http://learn.seandesmet.com/x)
[[ $redirect == '301 https://learn.seandesmet.com/x' ]] || die "port 80 does not redirect to HTTPS (got: $redirect)"

keys=$(ct cat /home/deploy/.ssh/authorized_keys)
[[ $(grep -c 'github-actions orbit-ops deploy$' <<<"$keys") == 1 ]] || die "Orbit Ops's deploy key is not there exactly once"
grep -qx 'no-agent-forwarding,no-port-forwarding,no-X11-forwarding ssh-ed25519 \S* github-actions orbit-ops deploy' <<<"$keys" \
  || die "the deploy key's line differs from production's shape"
grep -qxF "$unmanaged" <<<"$keys" || die "the unmanaged key line changed or vanished"

[[ $(ct systemctl is-enabled orbit-ops-backup.timer) == enabled ]] || die "the backup timer is not enabled"
[[ $(ct systemctl is-active orbit-ops-backup.timer) == active ]] || die "the backup timer is not active"
for u in orbit-ops-backup.service orbit-ops-backup.timer; do
  cmp -s <(ct cat "/etc/systemd/system/$u") "$here/systemd/$u" || die "$u differs from infra/systemd/$u"
done

ct test ! -e /etc/letsencrypt/accounts || die "an ACME account exists; something asked Let's Encrypt"

echo
echo "PASS: $name: refused without .env and a certificate, built, second run and check mode changed=0"
if [[ ${KEEP:-} == 1 ]]; then
  echo "KEEP=1: left $name running; delete it with: lxc delete --force $name"
fi
