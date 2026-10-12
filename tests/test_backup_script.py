"""The deploy's database backup (#116): scripts/backup_db.sh run the way release.yml runs it,
with `docker` replaced by a stub that plays pg_dump succeeding, failing, or stopping early."""

import gzip
import os
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "backup_db.sh"

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


def _run(tmp_path: Path, stub: str) -> subprocess.CompletedProcess:
    """Pipe the script into `bash -s -- pre-deploy` from a deploy directory, as release.yml does."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    docker = bin_dir / "docker"
    docker.write_text(STUB)
    docker.chmod(0o755)
    deploy = tmp_path / "deploy"
    deploy.mkdir()
    (deploy / ".env").write_text("DB_USER=orbit\nDB_NAME=orbit\n")
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "STUB": stub, "HEADER": HEADER, "FOOTER": FOOTER}
    return subprocess.run(
        ["bash", "-s", "--", "pre-deploy"],
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
    backup = _step_index(steps, "scripts/backup_db.sh")
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
