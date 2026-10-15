"""Unit 1.4, Networking: each module is complete content, its console task can
be done, and the figures the crew quotes are true of the console's network.

That a reference solution passes *in the console* is tests/js/solutions.test.js's
job; here the server grades the end state the solution leaves."""

import ipaddress

import pytest

from app.content import load_catalog
from app.terminal import Node, grade
from tests.test_bash_scripting import _complete_content, _said, _start


def _module(slug):
    return load_catalog().modules[slug]


def _with_file(state, path, contents):
    return {**state, path: Node(type="file", mode=0o664, owner="cadet", group="crew", contents=contents)}


# --- 01: Addresses and ports (#167) ---------------------------------------------------------
REPORT = "/home/cadet/network.txt"
LINES = [
    "address 10.4.1.23/24",
    "gateway 10.4.1.1",
    "listen 8080 relayd 0.0.0.0",
    "listen 3000 telemetryd 127.0.0.1",
    "connected relayd 10.4.1.20:5432",
]


@pytest.mark.criterion(167, "Module 01 of Unit 1.4 is complete content")
def test_module_01_is_complete_content():
    module = load_catalog().unit_modules("networking")[0]
    assert module.slug == "addresses-and-ports"
    _complete_content(module)


@pytest.mark.criterion(167, "Module 01's console task can be done")
def test_module_01s_end_state_passes_on_the_server():
    exercise = _module("addresses-and-ports").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _with_file(start, REPORT, "\n".join(LINES) + "\n"), exercise.cwd)


@pytest.mark.parametrize(
    ("wrong", "right"),
    [
        ("address 10.4.1.23", "address 10.4.1.23/24"),  # no prefix
        ("listen 3000 telemetryd 0.0.0.0", "listen 3000 telemetryd 127.0.0.1"),  # missed the loopback
        ("listen 8080 http-alt 0.0.0.0", "listen 8080 relayd 0.0.0.0"),  # a port name, not the process
        ("connected relayd 10.4.1.23:47253", "connected relayd 10.4.1.20:5432"),  # its own end, not the peer
        ("gateway 10.4.1.23", "gateway 10.4.1.1"),  # the console's own address
    ],
    ids=["no-prefix", "telemetry-on-every-address", "service-name", "local-end", "own-address"],
)
def test_module_01_refuses_the_misreadings(wrong, right):
    exercise = _module("addresses-and-ports").terminal
    report = "\n".join(LINES).replace(right, wrong) + "\n"
    assert not grade(exercise, _with_file(_start(exercise), REPORT, report), exercise.cwd)


def test_module_01s_figures_match_the_console():
    module = _module("addresses-and-ports")
    exercise = module.terminal
    net = exercise.network
    eth0 = ipaddress.IPv4Interface(net.interfaces[0].address)
    telemetry = next(s for s in net.listening if s.process == "telemetryd")
    relay = next(s for s in net.listening if s.process == "relayd")
    out = next(c for c in net.connections if c.process == "relayd")
    # The checks are the network, read correctly.
    texts = {c.text for c in exercise.checks}
    assert texts == {
        f"address {eth0.with_prefixlen}",
        f"gateway {net.gateway}",
        f"listen {relay.port} relayd {relay.address}",
        f"listen {telemetry.port} telemetryd {telemetry.address}",
        f"connected relayd {out.remote}",
    }
    # The services run as other accounts, so the processes are only named with sudo.
    users = {p.command.split()[0].rsplit("/", 1)[-1]: p.user for p in exercise.processes}
    assert users["relayd"] != exercise.user and users["telemetryd"] != exercise.user
    assert "sudo ss" in " ".join(exercise.solution)
    # What the crew say is true: two routes, the console's address, telemetry on loopback.
    assert "ROUTES: 2" in _said(module, "open") and f"port {telemetry.port}" in _said(module, "open")
    done = _said(module, "console_done")
    assert f"CONSOLE {eth0.with_prefixlen}" in done and f"GATEWAY {net.gateway}" in done
    assert f"TELEMETRYD {telemetry.address}:{telemetry.port}" in done and telemetry.address == "127.0.0.1"
    assert relay.address == "0.0.0.0"
    # The lesson's examples use other numbers than the task's.
    body = module.body_html
    assert "10.4.1." not in body and ":3000 " not in body.split("<h2", 2)[1]
    # And the quiz and cards don't hand over the task's answers either.
    quoted = " ".join([q.q + (q.code or "") + " ".join(getattr(q, "options", [])) for q in module.quiz]
                      + [c.front_html + c.back_html for c in module.cards])
    for figure in (str(eth0.ip), net.gateway, out.remote_address()):
        assert figure not in quoted, figure
