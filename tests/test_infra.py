"""#322 — the droplet as code: what can be checked without a container.

The role itself is tested in LXD by `infra/test.sh` (a fresh build, the
refusals, changed=0 on a second run and in check mode). These hold the rules a
one-line diff could break: exact pins, a host role pinned by SHA, an inventory
that can't be committed, and a role that never writes what release.yml owns.
"""

import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent
INFRA = ROOT / "infra"
ROLE = INFRA / "ansible/roles/orbit_ops_app"

# The pins, in the form Budget Buddy's tests/test_infra_pins.py accepts.
_EXACT = re.compile(r"^[A-Za-z0-9_.-]+==[0-9][0-9A-Za-z.]*$")
_ANY_ANSIBLE_PIN = re.compile(r"^\s*ansible(?:-core)?\s*(?:==|~=|>=|<=|!=|<|>)", re.M)


def _lines(path):
    return [s for line in path.read_text().splitlines() if (s := line.strip()) and not s.startswith("#")]


def _role_tasks():
    tasks = []
    for path in sorted((ROLE / "tasks").glob("*.yml")) + [ROLE / "handlers/main.yml"]:
        tasks += yaml.safe_load(path.read_text()) or []
    return tasks


def test_ansible_core_is_pinned_exactly():
    lines = _lines(INFRA / "requirements-infra.txt")
    assert any(line.startswith("ansible-core==") for line in lines)
    assert [line for line in lines if not _EXACT.match(line)] == []


def test_ansible_core_is_pinned_in_one_file_only():
    hits = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix not in {".txt", ".toml", ".cfg", ".yml", ".yaml", ".in"}:
            continue
        # vendor/ is Budget Buddy's checkout, with its own (identical) pin.
        if {".git", ".venv", "venv", "collections", "vendor", "node_modules"} & set(path.parts):
            continue
        if _ANY_ANSIBLE_PIN.search(path.read_text(errors="ignore")):
            hits.append(path.relative_to(ROOT).as_posix())
    assert hits == ["infra/requirements-infra.txt"]


def test_every_collection_is_pinned_exactly():
    collections = yaml.safe_load((INFRA / "ansible/requirements.yml").read_text())["collections"]
    assert collections
    loose = {c["name"]: c.get("version") for c in collections if not re.fullmatch(r"\d+\.\d+\.\d+", str(c.get("version")))}
    assert loose == {}


def test_the_host_role_is_pinned_by_full_sha():
    pin = dict(line.split("=", 1) for line in _lines(INFRA / "host-role.pin"))
    assert pin["repo"] == "https://github.com/CaddisMaster/budget-buddy.git"
    assert re.fullmatch(r"[0-9a-f]{40}", pin["sha"])


@pytest.mark.criterion(322, "Nothing private is committable")
def test_the_real_inventory_and_fetched_code_are_gitignored():
    # The container has no git; infra/test.sh asks `git check-ignore` the same
    # question on the VM before every run.
    ignore = _lines(ROOT / ".gitignore")
    for path in ("infra/ansible/inventory.yml", "infra/ansible/collections/", "infra/ansible/vendor/"):
        assert path in ignore
    assert not [line for line in ignore if line.startswith("!infra")]
    # And the example that is committed holds no real address.
    example = (INFRA / "ansible/inventory.example.yml").read_text()
    assert re.findall(r"\b\d+\.\d+\.\d+\.\d+\b", example) == ["203.0.113.10"]  # RFC 5737


def test_infra_stays_out_of_the_image():
    assert "infra/" in _lines(ROOT / ".dockerignore")


def test_the_role_never_writes_env_or_compose():
    """release.yml owns both (agreed with BB #530); the role only checks .env."""
    writers = {"ansible.builtin.copy", "ansible.builtin.template", "ansible.builtin.lineinfile",
               "ansible.builtin.blockinfile", "ansible.builtin.file", "ansible.builtin.get_url"}
    for task in _role_tasks():
        for module in writers & task.keys():
            dest = str(task[module].get("dest") or task[module].get("path"))
            assert ".env" not in dest and "docker-compose" not in dest, task["name"]


def test_the_role_installs_the_backup_units_from_infra_systemd():
    """One copy of each unit: the role reads infra/systemd/, never a copy of its own."""
    assert not (ROLE / "files/orbit-ops-backup.service").exists()
    copies = [t for t in _role_tasks() if t["name"] == "The backup units"]
    assert copies[0]["ansible.builtin.copy"]["src"] == "{{ playbook_dir }}/../systemd/{{ item }}"


def test_the_site_proxies_learn_to_5002_with_a_certificate():
    site = (ROLE / "files/learn.seandesmet.com").read_text()
    assert site.count("proxy_pass http://127.0.0.1:5002;") == 1
    assert "ssl_certificate /etc/letsencrypt/live/learn.seandesmet.com/fullchain.pem;" in site
    assert "return 301 https://$host$request_uri;" in site
    # No security headers here: the app sets them (RUNBOOK §2).
    assert "add_header" not in site


# --- #323: staging ------------------------------------------------------------
def _stage_code():
    """stage.sh without its comments, so a mention in prose can't satisfy a rule."""
    return "\n".join(line for line in (INFRA / "stage.sh").read_text().splitlines() if not line.lstrip().startswith("#"))


@pytest.mark.parametrize(
    "command",
    [
        "umask 022 && cat > ",
        "sh -s -- '${EXPECTED}' '${VERSION}' ",
        "sha256sum -c --quiet",
        "grep -v '^TAG=' .env > .env.tmp",
        "docker compose up -d --wait db",
        "bash -s -- pre-deploy",
        "docker compose pull web",
        "docker compose run --rm --no-deps -T web alembic upgrade head",
        "docker compose up -d --remove-orphans",
        "printenv APP_VERSION",
    ],
)
def test_staging_deploys_the_way_release_yml_does(command):
    """A step changed in one and not the other means staging no longer rehearses a deploy."""
    release = (ROOT / ".github/workflows/release.yml").read_text()
    assert command in release, f"release.yml no longer does {command!r}"
    assert command in _stage_code(), f"stage.sh doesn't do {command!r}"


def test_staging_runs_the_releases_own_scripts_in_the_same_order():
    code = _stage_code()
    order = ["show docker-compose.yml", "show scripts/install_compose.sh", "show scripts/backup_db.sh",
             "--wait db", "bash -s -- pre-deploy", "alembic upgrade head", "--remove-orphans"]
    positions = [code.index(step) for step in order]
    assert positions == sorted(positions)


def test_staging_env_has_every_setting_and_no_ai_key():
    code = _stage_code()
    keys = [line.split("=")[0] for line in _lines(ROOT / ".env.example")]
    for key in keys:
        if key != "TAG":  # the deploy writes it, as on production
            assert f'"{key}"' in code, f"stage.sh's .env lacks {key}"
    assert '"ANTHROPIC_API_KEY": ""' in code


@pytest.mark.criterion(323, "Staging never holds production secrets")
def test_staging_generates_its_secrets_and_never_reaches_the_droplet():
    code = _stage_code()
    for key in ("DB_PASSWORD", "DB_APP_PASSWORD"):
        assert f'"{key}": s(32)' in code
    assert '"SECRET_KEY": s(48)' in code
    for reach in (r"\bssh\b", r"\bscp\b", r"\brsync\b", r"\bbw\b", r"bw-env", r"DROPLET", r"\b\d+\.\d+\.\d+\.\d+\b"):
        found = [m for m in re.findall(reach, code) if m != "127.0.0.1"]
        assert not found, f"stage.sh matches {reach}: {found}"


def test_staging_only_ever_acts_on_an_orbit_container():
    assert re.search(r"^name=orbit-stage$", _stage_code(), re.M)
    assert "not an orbit- container" in (INFRA / "lib.sh").read_text()

