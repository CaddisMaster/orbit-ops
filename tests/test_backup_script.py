"""The database backup: scripts/backup_db.sh run the way release.yml (#116) and the nightly
unit (#324) run it, with `docker` replaced by a stub that plays pg_dump succeeding, failing,
or stopping early."""

import configparser
import gzip
import os
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "backup_db.sh"
SYSTEMD = ROOT / "infra" / "systemd"

HEADER = "--\n-- PostgreSQL database dump\n--\n\nCREATE TABLE public.users (id integer);\n"
# How a real pg_dump 16.15 ends: the `\unrestrict` line comes after the completion comment.
FOOTER = "\n--\n-- PostgreSQL database dump complete\n--\n\n\\unrestrict k3yk3yk3y\n\n"

# `docker compose exec -T db pg_dump …`, played by $STUB: what a real one prints in each case,
# and it reads stdin as the real one does (the first real run lost the script's tail to it).
STUB = r"""#!/bin/bash
[ "$*" = "compose exec -T db pg_dump -U orbit orbit" ] || { echo "unexpected: docker $*" >&2; exit 99; }
cat > /dev/null  # `exec -T` forwards stdin, which is the script itself under `bash -s`
case "$STUB" in
  good)      printf '%s' "$HEADER"; head -c 2000000 /dev/zero | tr '\0' 'x'; printf '%s' "$FOOTER" ;;
  fails)     echo 'pg_dump: error: connection to server failed' >&2; exit 1 ;;
  midway)    printf '%s' "$HEADER"; echo 'pg_dump: error: query failed' >&2; exit 1 ;;
  truncated) printf '%s' "$HEADER" ;;
esac
"""


def _run(tmp_path: Path, stub: str, *args: str) -> subprocess.CompletedProcess:
    """Pipe the script into `bash -s -- pre-deploy` from a deploy directory, as release.yml does.
    Other arguments replace `pre-deploy`: the nightly unit's are `nightly 14`."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    docker = bin_dir / "docker"
    docker.write_text(STUB)
    docker.chmod(0o755)
    deploy = tmp_path / "deploy"
    deploy.mkdir(exist_ok=True)
    (deploy / ".env").write_text("DB_USER=orbit\nDB_NAME=orbit\n")
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "STUB": stub, "HEADER": HEADER, "FOOTER": FOOTER}
    return subprocess.run(
        ["bash", "-s", "--", *(args or ("pre-deploy",))],
        input=SCRIPT.read_text(),
        cwd=deploy,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def _backups(tmp_path: Path) -> list[Path]:
    return sorted((tmp_path / "deploy" / "backups").iterdir())


def _deploy_steps() -> list[dict]:
    workflow = yaml.safe_load((ROOT / ".github" / "workflows" / "release.yml").read_text())
    return workflow["jobs"]["deploy"]["steps"]


def _step_index(steps: list[dict], needle: str) -> int:
    return next(i for i, step in enumerate(steps) if needle in step.get("run", ""))


def _unit(name: str) -> configparser.ConfigParser:
    unit = configparser.ConfigParser(interpolation=None, strict=False)
    unit.optionxform = str  # systemd keys are case-sensitive
    unit.read_string((SYSTEMD / name).read_text())
    return unit


def _seed(tmp_path: Path, names: list[str]) -> None:
    backups = tmp_path / "deploy" / "backups"
    backups.mkdir(parents=True, exist_ok=True)
    for name in names:
        (backups / name).write_bytes(b"old")


@pytest.mark.criterion(116, "A failed dump stops the deploy")
@pytest.mark.parametrize("stub", ["fails", "midway"])
def test_a_failed_dump_fails_the_backup_and_keeps_nothing(tmp_path, stub):
    result = _run(tmp_path, stub)
    assert result.returncode != 0
    assert "backup ok" not in result.stdout
    assert "pg_dump failed" in result.stdout
    assert _backups(tmp_path) == []  # not even a .partial


@pytest.mark.criterion(116, "A failed dump stops the deploy")
def test_the_backup_runs_under_bash_before_migrations_and_the_swap():
    steps = _deploy_steps()
    backup = _step_index(steps, "bash -s -- pre-deploy")
    # A run: step is `bash -e`, so a failed backup ends the job here.
    assert '"cd ${APP_DIR} && bash -s -- pre-deploy" < scripts/backup_db.sh' in steps[backup]["run"]
    assert backup < _step_index(steps, "alembic upgrade head")
    assert backup < _step_index(steps, "docker compose up -d --remove-orphans")
    assert "pg_dump" not in "".join(step.get("run", "") for step in steps[backup + 1 :])


@pytest.mark.criterion(116, "An incomplete dump is refused")
def test_a_dump_without_the_completion_line_is_refused(tmp_path):
    result = _run(tmp_path, "truncated")
    assert result.returncode != 0
    assert "backup ok" not in result.stdout
    assert "completion line" in result.stdout
    assert _backups(tmp_path) == []


@pytest.mark.criterion(116, "A good dump still deploys")
def test_a_good_dump_is_kept_and_reported(tmp_path):
    result = _run(tmp_path, "good")
    assert result.returncode == 0, result.stdout + result.stderr
    [dump] = _backups(tmp_path)
    assert dump.name.startswith("pre-deploy-") and dump.name.endswith(".sql.gz")  # what the pruning globs
    assert f"backup ok: backups/{dump.name} ({dump.stat().st_size} bytes)" in result.stdout
    # 2 MB of body: the tail check reads past a pipe buffer without tripping pipefail.
    assert gzip.decompress(dump.read_bytes()).decode().endswith(FOOTER)


def test_the_script_is_bash_because_dash_refuses_pipefail():
    script = SCRIPT.read_text()
    assert script.startswith("#!/bin/bash\n")
    assert "\nset -euo pipefail\n" in script


@pytest.mark.criterion(324, "Old nightly dumps are pruned")
def test_a_good_nightly_dump_keeps_only_the_newest(tmp_path):
    old = [f"nightly-202610{day:02d}-033000.sql.gz" for day in range(1, 16)]  # 15 older nights
    _seed(tmp_path, [*old, "pre-deploy-20261001-120000.sql.gz", "nightly-20261027-033000.sql.gz.partial"])
    result = _run(tmp_path, "good", "nightly", "14")
    assert result.returncode == 0, result.stdout + result.stderr
    names = [p.name for p in _backups(tmp_path)]
    nightly = [n for n in names if n.startswith("nightly-") and n.endswith(".sql.gz")]
    assert len(nightly) == 14
    assert old[:2] == [n for n in old if n not in nightly]  # the two oldest went
    assert "pre-deploy-20261001-120000.sql.gz" in names  # another prefix is never touched
    assert "nightly-20261027-033000.sql.gz.partial" in names  # nor is anything that isn't a dump


@pytest.mark.criterion(324, "Old nightly dumps are pruned")
@pytest.mark.parametrize("stub", ["fails", "truncated"])
def test_a_failed_nightly_dump_deletes_nothing(tmp_path, stub):
    old = [f"nightly-202610{day:02d}-033000.sql.gz" for day in range(1, 21)]
    _seed(tmp_path, old)
    result = _run(tmp_path, stub, "nightly", "14")
    assert result.returncode != 0
    assert [p.name for p in _backups(tmp_path)] == old


@pytest.mark.parametrize("keep", ["0", "-1", "two", "1000"])
def test_a_bad_keep_is_refused_before_dumping(tmp_path, keep):
    result = _run(tmp_path, "good", "nightly", keep)
    assert result.returncode == 2
    assert "KEEP must be" in result.stdout
    assert not (tmp_path / "deploy" / "backups").exists()


@pytest.mark.criterion(324, "Each release keeps the droplet's backup script current")
def test_each_release_installs_the_backup_script_before_the_pre_deploy_dump():
    steps = _deploy_steps()
    ship = _step_index(steps, "mv .backup_db.sh.new backup_db.sh")
    run = steps[ship]["run"]
    assert run.rstrip().endswith("< scripts/backup_db.sh")
    assert 'sha256sum scripts/backup_db.sh' in run and "sha256sum -c" in run  # a cut-off stream is refused
    assert run.index("sha256sum -c") < run.index("mv .backup_db.sh.new")
    assert ship < _step_index(steps, "bash -s -- pre-deploy")


@pytest.mark.criterion(324, "The database is dumped nightly")
def test_the_nightly_unit_runs_the_installed_script_as_deploy():
    service = _unit("orbit-ops-backup.service")["Service"]
    assert service["Type"] == "oneshot"
    assert service["User"] == "deploy" and service["Group"] == "deploy"
    assert service["WorkingDirectory"] == "/opt/orbit-ops"  # where .env and backups/ are
    # The path the release installs it at, and the arguments that keep 14.
    assert service["ExecStart"] == "/bin/bash /opt/orbit-ops/backup_db.sh nightly 14"
    assert service["UMask"] == "0077"
    ship = _deploy_steps()[_step_index(_deploy_steps(), "mv .backup_db.sh.new backup_db.sh")]["run"]
    assert "cd ${APP_DIR}" in ship
    assert yaml.safe_load((ROOT / ".github" / "workflows" / "release.yml").read_text())["env"]["APP_DIR"] == "/opt/orbit-ops"


@pytest.mark.criterion(324, "The database is dumped nightly")
def test_the_timer_runs_nightly_and_catches_up_after_downtime():
    timer = _unit("orbit-ops-backup.timer")
    assert timer["Timer"]["OnCalendar"] == "*-*-* 03:30:00 America/New_York"
    assert timer["Timer"]["Persistent"] == "true"
    assert timer["Install"]["WantedBy"] == "timers.target"
    assert "Unit" not in timer["Timer"]  # so it starts the service of the same name
