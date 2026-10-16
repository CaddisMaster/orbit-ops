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


# --- 02: Names and DNS (#168) -----------------------------------------------------------------
NAMES = "/home/cadet/names.txt"
HOSTS = "/etc/hosts"
PROOF = "10.4.1.40       mission.meridian\n10.4.1.40\n"


def _fixed_hosts(start, drop="10.4.1.14 mission.meridian\n"):
    node = start[HOSTS]
    return {**start, HOSTS: Node(**{**node.model_dump(), "contents": node.contents.replace(drop, "")})}


@pytest.mark.criterion(168, "Module 02 of Unit 1.4 is complete content")
def test_module_02_is_complete_content():
    module = load_catalog().unit_modules("networking")[1]
    assert module.slug == "names-and-dns"
    _complete_content(module)


@pytest.mark.criterion(168, "Module 02's console task can be done")
def test_module_02s_end_state_passes_on_the_server():
    exercise = _module("names-and-dns").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _with_file(_fixed_hosts(start), NAMES, PROOF), exercise.cwd)


@pytest.mark.parametrize(
    "proof",
    [
        "10.4.1.14       mission.meridian\n10.4.1.40\n",  # saved before fixing /etc/hosts
        "10.4.1.40\n10.4.1.40       mission.meridian\n",  # the two the other way round
        "10.4.1.40       mission.meridian\n",  # getent only
    ],
    ids=["before-the-fix", "wrong-order", "no-dig"],
)
def test_module_02_refuses_the_misreadings(proof):
    exercise = _module("names-and-dns").terminal
    assert not grade(exercise, _with_file(_fixed_hosts(_start(exercise)), NAMES, proof), exercise.cwd)


def test_module_02_refuses_a_hosts_file_cleared_out():
    exercise = _module("names-and-dns").terminal
    start = _start(exercise)
    emptied = {**start, HOSTS: Node(**{**start[HOSTS].model_dump(), "contents": ""})}
    assert not grade(exercise, _with_file(emptied, NAMES, PROOF), exercise.cwd)


def test_module_02s_figures_match_the_console():
    module = _module("names-and-dns")
    exercise = module.terminal
    net = exercise.network
    records = {(r.name, r.type): r.value for r in net.dns.records}
    stale = "10.4.1.14"
    right = records[("mission.meridian", "A")]
    # /etc/hosts pins the uplink to an address no host has and DNS has no name for.
    pinned = [line for line in next(f for f in exercise.files if f.path == HOSTS).contents.splitlines() if "mission.meridian" in line]
    assert pinned == [f"{stale} mission.meridian"]
    assert stale not in {h.address for h in net.hosts} and stale not in records.values()
    assert not any(r.type == "PTR" and r.name.startswith("14.1.4.10") for r in net.dns.records)
    # DNS's answer is a live host, and the proof the checks want is that answer twice.
    assert right in {h.address for h in net.hosts if h.up}
    assert exercise.checks[0].text == f"{right}       mission.meridian\n{right}\n"
    # The resolver is the one the console asks.
    assert net.resolver() == net.dns.server and net.dns.server in {h.address for h in net.hosts}
    # What the crew say is true.
    eth0 = ipaddress.IPv4Interface(net.interfaces[0].address)
    assert f"RELAY CONSOLE {eth0.ip}" in _said(module, "open") and "<code>mission.meridian</code>" in _said(module, "open")
    assert f"DNS {right} · /ETC/HOSTS {right}" in _said(module, "console_done")
    # The lesson's examples use other names and numbers than the task's, and so do the quiz and cards.
    body = module.body_html
    assert "10.4.1." not in body and "mission.meridian" not in body
    quoted = " ".join([q.q + (q.code or "") + " ".join(getattr(q, "options", [])) for q in module.quiz]
                      + [c.front_html + c.back_html for c in module.cards])
    assert "10.4.1." not in quoted and "mission.meridian" not in quoted


# --- 03: Is it reachable? (#169) ---------------------------------------------------------------
RELAYS = "/home/cadet/relays.txt"
VERDICTS = {"relay-a.meridian": "name", "relay-b.meridian": "refused", "relay-c.meridian": "timeout", "relay-d.meridian": "ok"}


def _relays(verdicts):
    return "".join(f"{name} {result}\n" for name, result in verdicts.items())


@pytest.mark.criterion(169, "Module 03 of Unit 1.4 is complete content")
def test_module_03_is_complete_content():
    module = load_catalog().unit_modules("networking")[2]
    assert module.slug == "is-it-reachable"
    _complete_content(module)


@pytest.mark.criterion(169, "Module 03's console task can be done")
def test_module_03s_end_state_passes_on_the_server():
    exercise = _module("is-it-reachable").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _with_file(start, RELAYS, _relays(VERDICTS)), exercise.cwd)


@pytest.mark.parametrize(
    ("relay", "wrong"),
    [
        ("relay-b.meridian", "ok"),  # it answers ping, as the monitor said
        ("relay-d.meridian", "timeout"),  # it drops ping, as the monitor said
        ("relay-c.meridian", "refused"),  # the two people mix up
        ("relay-b.meridian", "timeout"),
        ("relay-a.meridian", "timeout"),
    ],
    ids=["trusted-the-ping-b", "trusted-the-ping-d", "timeout-as-refused", "refused-as-timeout", "no-name-as-timeout"],
)
def test_module_03_refuses_the_misreadings(relay, wrong):
    exercise = _module("is-it-reachable").terminal
    report = _relays({**VERDICTS, relay: wrong})
    assert not grade(exercise, _with_file(_start(exercise), RELAYS, report), exercise.cwd)


def test_module_03s_figures_match_the_console():
    module = _module("is-it-reachable")
    exercise = module.terminal
    net = exercise.network
    port = 8443
    peers = next(f for f in exercise.files if f.path == "/etc/relay/peers.conf").contents
    assert [line.split()[1:] for line in peers.splitlines() if line.startswith("peer ")] == [[name, str(port)] for name in VERDICTS]
    a_records = {r.name: r.value for r in net.dns.records if r.type == "A"}
    hosts = {h.address: h for h in net.hosts}
    gateway = ipaddress.IPv4Address(net.gateway)
    subnet = ipaddress.IPv4Interface(net.interfaces[0].address).network

    def truth(name):
        if name not in a_records:
            return "name"
        host = hosts[a_records[name]]
        assert ipaddress.IPv4Address(host.address) not in subnet  # beyond the gateway: a dead host is silence
        if not host.up:
            return "timeout"
        return "ok" if any(s.port == port and s.proto == "tcp" for s in host.services) else "refused"

    assert {name: truth(name) for name in VERDICTS} == VERDICTS
    assert gateway in subnet
    # The checks are those verdicts.
    assert {c.text for c in exercise.checks} == {f"{n} {r}\n" for n, r in VERDICTS.items()}
    # The ping monitor is right where ping is: relay-b replies and relay-d drops ping.
    monitor = _said(module, "open")
    expected = {"relay-b.meridian": "UP", "relay-c.meridian": "DOWN", "relay-d.meridian": "DOWN"}
    for name, said in expected.items():
        host = hosts[a_records[name]]
        assert (host.up and host.ping) == (said == "UP")
        assert f"{name.split('.')[0]} {said}" in monitor
    assert "relay-a ?" in monitor and "three of your four" in monitor
    done = _said(module, "console_done")
    assert f"relay-b {port} REFUSED" in done and f"relay-d {port} OPEN" in done
    # The lesson, quiz and cards use none of the task's names or addresses.
    body = module.body_html
    quoted = " ".join([q.q + (q.code or "") + " ".join(getattr(q, "options", [])) for q in module.quiz]
                      + [c.front_html + c.back_html for c in module.cards])
    for text in (body, quoted):
        assert "relay-" not in text and "10.4.3." not in text and "8443" not in text


# --- 04: HTTP by hand (#170) ---------------------------------------------------------------------
from tests.test_git import _complete_content as _lab_content  # noqa: E402
from tests.test_git import _passes  # noqa: E402

HEAD = """HTTP/1.1 301 Moved Permanently
Server: nginx/1.24.0 (Ubuntu)
Date: Fri, 16 Oct 2026 12:52:57 GMT
Content-Type: text/html
Content-Length: 178
Connection: keep-alive
Location: https://learn.seandesmet.com/healthz
"""
VERBOSE = """> GET /healthz HTTP/1.1
> Host: learn.seandesmet.com
> User-Agent: curl/8.5.0
> Accept: */*
>
< HTTP/1.1 200 OK
< Server: nginx/1.24.0 (Ubuntu)
< Content-Type: application/json
< x-frame-options: DENY
<
* Connection #0 to host learn.seandesmet.com left intact
{"status":"ok","version":"0.8.0","commit":"542844a"}
"""
TWO = "< HTTP/1.1 200 OK\n< Content-Type: application/json\n"
FOLLOWED = "200 https://learn.seandesmet.com/healthz\n"


@pytest.mark.criterion(170, "Module 04 of Unit 1.4 is complete content")
def test_module_04_is_complete_content():
    module = load_catalog().unit_modules("networking")[3]
    assert module.slug == "http-by-hand"
    _lab_content(module)


@pytest.mark.criterion(170, "Module 04's lab can be done for real")
def test_module_04s_examples_are_a_real_run_and_pass():
    module = _module("http-by-hand")
    assert _passes(module, *[box.example for box in module.lab.boxes])


@pytest.mark.parametrize(
    "pastes",
    [
        (HEAD, VERBOSE, TWO, FOLLOWED),
        # A piped run: curl's progress meter and data notes are in the paste.
        (HEAD, "  % Total    % Received\n} [5 bytes data]\n" + VERBOSE.replace("< HTTP", "{ [5 bytes data]\n< HTTP"), TWO, FOLLOWED),
        # Windows line ends, and a curl that spoke HTTP/2 (lowercase headers, as HTTP/2 sends them).
        (HEAD.replace("\n", "\r\n"), VERBOSE.replace("HTTP/1.1 200 OK", "HTTP/2 200 ").replace("> GET /healthz HTTP/1.1", "> GET /healthz HTTP/2").replace("> Host:", "> host:"),
         "< HTTP/2 200 \r\n< content-type: application/json\r\n", FOLLOWED.replace("\n", "\r\n")),
        # The two lines copied without curl's markers.
        (HEAD, VERBOSE, "HTTP/1.1 200 OK\nContent-Type: application/json\n", FOLLOWED),
    ],
    ids=["terminal", "piped", "windows-and-http2", "markers-dropped"],
)
def test_module_04s_lab_passes_any_machines_output(pastes):
    assert _passes(_module("http-by-hand"), *pastes)


@pytest.mark.parametrize(
    "box, paste",
    [
        (0, HEAD.replace("HTTP/1.1 301 Moved Permanently", "HTTP/1.1 200 OK").replace("Location: https://learn.seandesmet.com/healthz\n", "")),  # https:// instead
        (0, HEAD + "\nHTTP/1.1 200 OK\nContent-Type: application/json\n"),  # with -L: past the redirect
        (1, VERBOSE.replace("HTTP/1.1 200 OK", "HTTP/1.1 301 Moved Permanently").replace('{"status":"ok","version":"0.8.0","commit":"542844a"}', "<html>")),  # http://
        (1, '{"status":"ok","version":"0.8.0","commit":"542844a"}\n'),  # without -v: only the body
        (2, "> GET /healthz HTTP/1.1\n< Content-Type: application/json\n"),  # the request line, not the status line
        (2, "< HTTP/1.1 200 OK\n< Content-Length: 52\n"),  # the wrong header
        (3, "301 http://learn.seandesmet.com/healthz\n"),  # without -L
    ],
    ids=["https-in-step-2", "followed-in-step-2", "http-in-step-3", "no-verbose", "request-line", "wrong-header", "no-follow"],
)
def test_module_04s_lab_refuses_the_likely_mistakes(box, paste):
    pastes = [HEAD, VERBOSE, TWO, FOLLOWED]
    pastes[box] = paste
    assert not _passes(_module("http-by-hand"), *pastes)


# --- 05: APIs and JSON (#171) ---------------------------------------------------------------------
NAME_BRANCH = "CaddisMaster/orbit-ops\nmain\n"
TAGS = "v0.8.0\nv0.7.0\nv0.6.1\n"
FIRST = "2026-10-08T18:46:54Z\n"


@pytest.mark.criterion(171, "Module 05 of Unit 1.4 is complete content")
def test_module_05_is_complete_content():
    module = load_catalog().unit_modules("networking")[4]
    assert module.slug == "apis-and-json"
    _lab_content(module)


@pytest.mark.criterion(171, "Module 05's lab can be done for real")
def test_module_05s_examples_are_a_real_run_and_pass():
    module = _module("apis-and-json")
    assert _passes(module, *[box.example for box in module.lab.boxes])


@pytest.mark.parametrize(
    "pastes",
    [
        (NAME_BRANCH, TAGS, FIRST),
        (NAME_BRANCH.replace("\n", "\r\n"), TAGS.replace("\n", "\r\n"), FIRST.replace("\n", "\r\n")),  # Windows
        ("\n" + NAME_BRANCH + "\n", "\n" + TAGS + "\n", "\n  " + FIRST + "\n"),  # a loose paste
        (NAME_BRANCH, "v1.2.0\nv1.1.10\nv1.1.9\n", FIRST),  # a year of releases later
    ],
    ids=["terminal", "windows", "loose", "later-releases"],
)
def test_module_05s_lab_passes_any_machines_output(pastes):
    assert _passes(_module("apis-and-json"), *pastes)


@pytest.mark.parametrize(
    "box, paste",
    [
        (0, '"CaddisMaster/orbit-ops"\n"main"\n'),  # no -r
        (0, '{\n  "full_name": "CaddisMaster/orbit-ops",\n  "default_branch": "main"\n}\n'),  # the JSON, not the values
        (0, "CaddisMaster/orbit-ops\nmaster\n"),  # a guess at the branch
        (1, "v0.8.0\nv0.7.0\nv0.6.1\nv0.6.0\nv0.5.0\nv0.4.0\nv0.3.0\nv0.2.0\nv0.1.0\n"),  # no per_page
        (1, '"v0.8.0"\n"v0.7.0"\n"v0.6.1"\n'),  # no -r
        (1, "v0.8.0\nv0.8.0\nhttps://github.com/CaddisMaster/orbit-ops/releases/tag/v0.8.0\n"),  # the wrong fields
        (2, '"2026-10-08T18:46:54Z"\n'),  # no -r
        (2, "2026-10-14T13:49:54Z\n"),  # the newest release's date, not v0.1.0's
        (2, "2026-10-14T13:49:54Z\n2026-10-08T18:46:54Z\n"),  # every release's date: no select
    ],
    ids=["quoted-name", "json", "master", "no-per-page", "quoted-tags", "wrong-fields", "quoted-date", "newest-date", "no-select"],
)
def test_module_05s_lab_refuses_the_likely_mistakes(box, paste):
    pastes = [NAME_BRANCH, TAGS, FIRST]
    pastes[box] = paste
    assert not _passes(_module("apis-and-json"), *pastes)
