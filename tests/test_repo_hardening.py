"""Tests of the repository's own configuration (ported from Budget Buddy's
test_pinned_dependencies / test_deploy_pinning / test_hardening). Each one
guards a rule that is easy to break in a one-line diff and silent when broken."""

import re
from pathlib import Path

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
