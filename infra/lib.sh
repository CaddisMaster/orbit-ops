# Shared by infra/test.sh and infra/stage.sh. Source it after setting $here, the
# absolute path of infra/.
#
# Everything here acts ONLY on containers named orbit-*. Containers, never --vm:
# the VM has no /dev/kvm. LXD must be initialised first (infra/README.md).

die() { echo "$(basename "$0"): $*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

delete_container() {
  [[ $1 == orbit-* ]] || die "refusing to delete '$1': not an orbit- container"
  lxc delete --force "$1" >/dev/null 2>&1 || true
}

check_lxd() {
  command -v lxc >/dev/null || die "lxc not found; LXD is not installed"
  lxc storage show default >/dev/null 2>&1 || die "LXD is not initialised; see infra/README.md"
}

# The control node: pinned ansible-core, collections and host role. Leaves the
# shell in infra/ansible with the venv on PATH.
control_node() {
  local venv=$here/.venv
  if [[ ! -x $venv/bin/ansible-playbook ]] || ! cmp -s "$here/requirements-infra.txt" "$venv/.requirements"; then
    python3 -m venv "$venv"
    "$venv/bin/pip" install -q --no-deps -r "$here/requirements-infra.txt"
    "$venv/bin/pip" check || die "requirements-infra.txt is missing a dependency; pin it there"
    cp "$here/requirements-infra.txt" "$venv/.requirements"
  fi
  export PATH="$venv/bin:$PATH"
  "$here/fetch_host_role.sh"
  cd "$here/ansible"
  ansible-galaxy collection install -r requirements.yml -p ./collections >/dev/null
  ansible --version | head -1
}

launch_container() {
  local name=$1
  timeout 300 lxc launch -q ubuntu:24.04 "$name" -c security.nesting=true \
    || die "lxc launch failed or took over 5 minutes (try: lxc image list; lxc launch by hand)"
  lxc exec "$name" -- cloud-init status --wait >/dev/null || true

  # Docker on the VM sets the FORWARD policy to DROP, which silently blackholes
  # LXD's bridge (shared changes log, 2026-10-30). Fail here, naming the fix.
  if ! lxc exec "$name" -- timeout 15 curl -fsS -o /dev/null https://download.docker.com/; then
    die "the container has no internet. Docker's FORWARD DROP is blocking lxdbr0; see infra/README.md"
  fi

  # Nothing here may reach Let's Encrypt; the certificate is self-signed.
  lxc exec "$name" -- sh -c 'echo "127.0.0.1 acme-v02.api.letsencrypt.org" >> /etc/hosts'
}

# Stand-ins for what Certbot leaves on production: a self-signed lineage, and
# Certbot's own TLS options and DH parameters, copied from the installed package.
stand_in_certificate() {
  lxc exec "$1" -- sh -c '
    set -e
    d=/etc/letsencrypt/live/learn.seandesmet.com && mkdir -p "$d"
    openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=learn.seandesmet.com \
      -keyout "$d/privkey.pem" -out "$d/fullchain.pem" 2>/dev/null
    cp "$(find /usr/lib/python3/dist-packages -name options-ssl-nginx.conf | head -1)" /etc/letsencrypt/
    cp "$(find /usr/lib/python3/dist-packages -name ssl-dhparams.pem | head -1)" /etc/letsencrypt/'
}
