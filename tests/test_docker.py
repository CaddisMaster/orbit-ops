"""Unit 2.2, Docker fundamentals: what each module has to hold, beyond the rules every module
meets. Every module is a lab (#446): Docker can't run in the browser, so the learner pastes what
their own Docker printed, and these tests hold the checks to what any engine prints."""

import pytest

from app import lab
from tests.conftest import real_catalog


def _module(slug):
    return real_catalog().modules[slug]


def _is_complete_lab(module):
    assert module.body_html
    assert module.lab and not module.challenge and not module.terminal
    assert any(q.type == "choice" and q.code for q in module.quiz), "a scenario question"
    assert len(module.cards) >= 3  # the loader refuses a card whose section isn't a heading
    for beat in ("open", "lab_done", "complete"):
        assert getattr(module.comms, beat), beat


def _passes(module, pasted):
    return lab.grade(module.lab, pasted).passed


# --- 01 What a container is (#447) ----------------------------------------------------------
@pytest.mark.criterion(447, "Module 01 of Unit 2.2 is complete content")
def test_module_01_is_complete():
    module = _module("what-a-container-is")
    _is_complete_lab(module)
    assert module.unit == "docker" and real_catalog().unit_modules("docker")[0] is module


@pytest.mark.criterion(447, "Module 01's lab checks hold on any machine")
def test_module_01s_lab_checks_hold_on_any_machine():
    """The example is a real run on Docker Engine 29 on Linux (arm64). Docker Desktop's banner,
    another architecture, other PIDs and a slower status line still pass; an engine that isn't
    running, a missing docker group, ps run on the host and a container run with --rm don't."""
    module = _module("what-a-container-is")
    version, hello, session, leftover = (box.example for box in module.lab.boxes)
    assert _passes(module, [version, hello, session, leftover])

    desktop = version.replace("Server: Docker Engine - Community", "Server: Docker Desktop 4.52.0 (210994)").replace("linux/arm64", "linux/amd64")
    slower = leftover.replace("Less than a second ago", "3 seconds ago")
    other_pids = session.replace("    9 root      0:00 ps", "   12 root      0:00 ps")
    assert _passes(module, [desktop, hello, other_pids, slower])

    def fails(box, text):
        pasted = [version, hello, session, leftover]
        pasted[box] = text
        return not _passes(module, pasted)

    client_only = version.split("\nServer:")[0] + "\nfailed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running"
    assert fails(0, client_only)
    assert fails(0, version.split("\nServer:")[0] + "\nCannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?")
    assert fails(0, version.split("\nServer:")[0] + "\npermission denied while trying to connect to the docker API at unix:///var/run/docker.sock")
    host_ps = session.replace("    1 root      0:00 sh\n", "    1 root      0:02 /sbin/init\n 2214 sean      0:00 -bash\n")
    assert fails(2, host_ps)
    assert fails(2, session.replace("v3.24", "v3.21"))  # an older alpine than the task's
    assert fails(3, "still here\ncargo-check\n")  # run with --rm: nothing left to list or remove


def test_module_01s_comms_count_what_the_lab_runs():
    module = _module("what-a-container-is")
    said = " ".join(m.text for m in module.comms.lab_done)
    runs = module.lab.task.count("docker run ")
    assert runs == 3 and f"TEST CONTAINERS: {runs} · LEFT BEHIND: 0" in said
