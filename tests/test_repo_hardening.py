"""Tests of the repository's own configuration (ported from Budget Buddy's
test_pinned_dependencies / test_deploy_pinning / test_hardening). Each one
guards a rule that is easy to break in a one-line diff and silent when broken."""

import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent


def _requirement_lines(name: str) -> list[str]:
    lines = (ROOT / name).read_text().splitlines()
    return [line.strip() for line in lines if line.strip() and not line.lstrip().startswith("#")]


def test_every_dependency_is_pinned_exactly():
    for name in ("requirements.txt", "requirements-dev.txt"):
        for line in _requirement_lines(name):
            assert re.fullmatch(r"[A-Za-z0-9_.\-\[\]]+==[A-Za-z0-9_.\-+]+", line), f"{name}: not an exact pin: {line}"


def test_dockerfile_ships_the_prod_stage_and_pins_the_base_by_digest():
    dockerfile = (ROOT / "Dockerfile").read_text()
    stages = re.findall(r"^FROM .* AS (\w+)$", dockerfile, flags=re.MULTILINE)
    assert stages[-1] == "prod", "an untargeted build must produce the prod stage"
    assert re.search(r"^FROM python:[\d.]+-slim@sha256:[0-9a-f]{64} AS base$", dockerfile, flags=re.MULTILINE)
    assert "\nUSER appuser\n" in dockerfile


def test_compose_publishes_only_to_localhost_and_never_the_database():
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text())
    assert "ports" not in compose["services"]["db"]
    for name, service in compose["services"].items():
        for port in service.get("ports", []):
            assert str(port).startswith("127.0.0.1:"), f"{name} publishes {port} beyond localhost (ufw is bypassed)"


def test_compose_tag_has_no_default():
    image = yaml.safe_load((ROOT / "docker-compose.yml").read_text())["services"]["web"]["image"]
    assert "${TAG:?" in image, "TAG must be required, never defaulted (BB #190)"


def test_every_service_caps_its_logs():
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text())
    for name, service in compose["services"].items():
        assert service.get("logging", {}).get("options", {}).get("max-size"), f"{name} has unbounded logs"


def test_actions_are_pinned_by_commit_sha():
    for workflow in (ROOT / ".github" / "workflows").glob("*.yml"):
        for uses in re.findall(r"uses:\s*(\S+)", workflow.read_text()):
            if uses.startswith("./"):
                continue
            assert re.search(r"@[0-9a-f]{40}$", uses), f"{workflow.name}: {uses} is not pinned to a commit SHA"


def test_env_example_lists_every_setting():
    from app.config import Settings

    example = (ROOT / ".env.example").read_text()
    for field in Settings.model_fields:
        if field in {"app_version", "app_commit", "templates_auto_reload", "login_rate_limit"}:
            continue  # baked into the image or test-only knobs
        assert re.search(rf"^{field.upper()}=", example, flags=re.MULTILINE), f".env.example is missing {field.upper()}"


class _ComposeLoader(yaml.SafeLoader):
    """safe_load plus compose's merge tags (`!override`, `!reset`), read as their plain value."""


for _tag in ("!override", "!reset"):
    _ComposeLoader.add_constructor(
        _tag,
        lambda loader, node: (
            loader.construct_sequence(node) if isinstance(node, yaml.SequenceNode)
            else loader.construct_mapping(node) if isinstance(node, yaml.MappingNode)
            else loader.construct_scalar(node)
        ),
    )


def _dev_web():
    return yaml.load((ROOT / "docker-compose.override.yml").read_text(), Loader=_ComposeLoader)["services"]["web"]


def _dev_command():
    return _dev_web()["command"]


@pytest.mark.criterion(247, "Editing a lesson reloads the dev app")
def test_the_dev_server_reloads_on_lesson_files():
    command = _dev_command()
    pairs = set(zip(command, command[1:], strict=False))
    assert ("--reload-dir", "content") in pairs and ("--reload-include", "*.md") in pairs
    # uvicorn ignores --reload-include without watchfiles: it falls back to a *.py-only poller.
    assert any(line.startswith("watchfiles==") for line in _requirement_lines("requirements-dev.txt"))


@pytest.mark.criterion(247, "Editing the syllabus reloads the dev app")
def test_the_dev_server_reloads_on_the_syllabus():
    command = _dev_command()
    assert ("--reload-include", "*.yml") in set(zip(command, command[1:], strict=False))


@pytest.mark.criterion(247, "Production is unchanged")
def test_production_runs_no_reloader():
    web = yaml.safe_load((ROOT / "docker-compose.yml").read_text())["services"]["web"]
    assert "--reload" not in " ".join(web.get("command", []))
    cmd = re.search(r"^CMD \[(.*?)\]", (ROOT / "Dockerfile").read_text(), re.S | re.M).group(1)
    assert "--reload" not in cmd
    assert not any(line.startswith("watchfiles==") for line in _requirement_lines("requirements.txt"))



def _dockerfile_instructions():
    """The Dockerfile without its comments, which name the things it no longer does."""
    lines = (ROOT / "Dockerfile").read_text().splitlines()
    return "\n".join(line for line in lines if not line.lstrip().startswith("#"))


def _image_check_step():
    steps = yaml.safe_load((ROOT / ".github" / "workflows" / "ci.yml").read_text())["jobs"]["docker-build"]["steps"]
    return next(step["run"] for step in steps if step.get("name") == "Check the image's user and ownership")


@pytest.mark.criterion(263, "The app user cannot write the app's code")
def test_root_owns_the_code_and_ci_checks_the_built_image():
    dockerfile = _dockerfile_instructions()
    assert "--chown" not in dockerfile, "the app user must not own anything it runs"
    assert re.search(r"^RUN useradd --no-create-home --shell /usr/sbin/nologin --uid 10001 appuser$", dockerfile, re.M)
    # The Dockerfile can't show what the built image looks like; CI's image job does.
    check = _image_check_step()
    assert 'test "$(whoami)" = appuser' in check
    assert "find /app /opt/pyodide -writable" in check


@pytest.mark.criterion(263, "The runtime image has no psql")
def test_the_image_installs_no_postgresql_client():
    assert "postgresql-client" not in _dockerfile_instructions()
    assert "command -v psql" in _image_check_step()


_HARDENING = ("read_only", "tmpfs", "cap_drop", "security_opt", "pids_limit")


def _services():
    return yaml.safe_load((ROOT / "docker-compose.yml").read_text())["services"]


@pytest.mark.criterion(264, "The web service is locked down")
def test_the_web_service_is_locked_down():
    web = _services()["web"]
    assert web["read_only"] is True
    assert web["tmpfs"] == ["/tmp"]
    assert web["cap_drop"] == ["ALL"]
    assert "no-new-privileges:true" in web["security_opt"]
    assert web["pids_limit"] == 100
    # Dev loosens only pids and /tmp's noexec; a disk write still fails locally first.
    dev = _dev_web()
    assert "read_only" not in dev and "cap_drop" not in dev and "security_opt" not in dev


@pytest.mark.criterion(264, "The database service is untouched")
def test_the_database_service_has_no_hardening_keys():
    # Any edit to db recreates the database container; that's a scheduled operation (#266).
    db = _services()["db"]
    assert not [key for key in _HARDENING if key in db]


@pytest.mark.criterion(264, "The release smoke test runs the image locked down")
def test_the_release_smoke_test_runs_locked_down():
    smoke = yaml.safe_load((ROOT / ".github" / "workflows" / "release.yml").read_text())["jobs"]["smoke"]["steps"]
    runs = {step.get("name"): step.get("run", "") for step in smoke}
    lockdown = re.search(r'LOCKDOWN=([^"]+)"', runs["Write the smoke env"]).group(1).split()
    for flag in ("--read-only", "--cap-drop", "--security-opt", "--pids-limit", "--tmpfs"):
        assert flag in lockdown
    pairs = set(zip(lockdown, lockdown[1:], strict=False))
    web = _services()["web"]
    assert ("--pids-limit", str(web["pids_limit"])) in pairs
    assert ("--security-opt", web["security_opt"][0]) in pairs
    for name in ("Migrations apply from the pushed image", "Run the pushed image"):
        assert "$LOCKDOWN" in runs[name], f"{name!r} runs the image without the lockdown"


@pytest.mark.criterion(264, "The trust in forwarded headers is explained")
def test_trusting_every_forwarding_address_is_explained():
    dockerfile = (ROOT / "Dockerfile").read_text()
    assert '"--forwarded-allow-ips", "*"' in dockerfile
    comments = " ".join(line for line in dockerfile.splitlines() if line.startswith("#"))
    assert "127.0.0.1" in comments and "Nginx" in comments
