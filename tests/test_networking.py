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


# --- 06: TLS and certificates (#172) ----------------------------------------------------------------
CERT = """subject=CN = learn.seandesmet.com
issuer=C = US, O = Let's Encrypt, CN = YE2
notBefore=Oct  8 17:40:05 2026 GMT
notAfter=Jan  6 17:40:04 2027 GMT
"""
DEFAULT = "subject=CN = budget.seandesmet.com\n"
VALID = "Certificate will not expire\n"


@pytest.mark.criterion(172, "Module 06 of Unit 1.4 is complete content")
def test_module_06_is_complete_content():
    module = load_catalog().unit_modules("networking")[5]
    assert module.slug == "tls-and-certificates"
    _lab_content(module)


@pytest.mark.criterion(172, "Module 06's lab can be done for real")
def test_module_06s_examples_are_a_real_run_and_pass():
    module = _module("tls-and-certificates")
    assert _passes(module, *[box.example for box in module.lab.boxes])


@pytest.mark.parametrize(
    "pastes",
    [
        (CERT, DEFAULT, VALID),
        # After a renewal: new dates, another Let's Encrypt intermediate, a single-digit day.
        (CERT.replace("CN = YE2", "CN = E7").replace("Oct  8 17:40:05 2026", "Dec  7 03:11:42 2026").replace("Jan  6 17:40:04 2027", "Mar  7 03:11:41 2027"), DEFAULT, VALID),
        # LibreSSL on a Mac writes the names without spaces.
        ("subject=CN=learn.seandesmet.com\nissuer=C=US, O=Let's Encrypt, CN=YE2\nnotBefore=Oct  8 17:40:05 2026 GMT\nnotAfter=Jan  6 17:40:04 2027 GMT\n", "subject=CN=budget.seandesmet.com\n", VALID),
        (CERT.replace("\n", "\r\n"), "subject=CN = seandesmet.com\r\n", "\n" + VALID + "\n"),  # Windows; another default
    ],
    ids=["terminal", "after-a-renewal", "libressl", "windows-other-default"],
)
def test_module_06s_lab_passes_any_machines_output(pastes):
    assert _passes(_module("tls-and-certificates"), *pastes)


@pytest.mark.parametrize(
    "box, paste",
    [
        (0, DEFAULT + "issuer=C = US, O = Let's Encrypt, CN = YE1\nnotBefore=Oct  8 17:40:05 2026 GMT\nnotAfter=Jan  6 17:40:04 2027 GMT\n"),  # no -servername
        (0, "subject=CN = learn.seandesmet.com\nissuer=C = US, O = Let's Encrypt, CN = YE2\n"),  # no -dates
        (1, "subject=CN = learn.seandesmet.com\n"),  # still named the site
        (1, "budget.seandesmet.com\n"),  # not the subject line
        (2, "Certificate will expire\n"),  # -checkend with too long a time, or an expired certificate
        (2, "notAfter=Jan  6 17:40:04 2027 GMT\n"),  # the date, not -checkend's answer
    ],
    ids=["no-sni", "no-dates", "named-anyway", "not-a-subject", "will-expire", "date-not-checkend"],
)
def test_module_06s_lab_refuses_the_likely_mistakes(box, paste):
    pastes = [CERT, DEFAULT, VALID]
    pastes[box] = paste
    assert not _passes(_module("tls-and-certificates"), *pastes)


# --- 07: SSH keys (#173) ----------------------------------------------------------------------------
KEY_FP = "256 SHA256:0W3lTNI26hvTR6CpeNpd0sglyZgsLuPn2VusYl5Ta64 meridian-relay-lab (ED25519)\n"
SSH_G = "user okafor\nhostname relay.meridian.example\nport 22\nidentityfile ~/.ssh/meridian_relay\n"
GITHUB = "256 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU github.com (ED25519)\n"


@pytest.mark.criterion(173, "Module 07 of Unit 1.4 is complete content")
def test_module_07_is_complete_content():
    module = load_catalog().unit_modules("networking")[6]
    assert module.slug == "ssh-keys"
    _lab_content(module)


@pytest.mark.criterion(173, "Module 07's lab can be done for real")
def test_module_07s_examples_are_a_real_run_and_pass():
    module = _module("ssh-keys")
    assert _passes(module, *[box.example for box in module.lab.boxes])


@pytest.mark.parametrize(
    "pastes",
    [
        (KEY_FP, SSH_G, GITHUB),
        # Another learner's key: any fingerprint, as long as it's this type and comment.
        ("256 SHA256:Zq9+x/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789a meridian-relay-lab (ED25519)\n", SSH_G, GITHUB),
        # Windows' OpenSSH writes the key's full path; a loose paste with CRLF.
        (KEY_FP.replace("\n", "\r\n"), SSH_G.replace("~/.ssh/meridian_relay", "C:/Users/sean/.ssh/meridian_relay"), "\n" + GITHUB),
    ],
    ids=["terminal", "another-key", "windows"],
)
def test_module_07s_lab_passes_any_machines_output(pastes):
    assert _passes(_module("ssh-keys"), *pastes)


@pytest.mark.parametrize(
    "box, paste",
    [
        (0, "3072 SHA256:0W3lTNI26hvTR6CpeNpd0sglyZgsLuPn2VusYl5Ta64 meridian-relay-lab (RSA)\n"),  # no -t ed25519
        (0, "256 SHA256:0W3lTNI26hvTR6CpeNpd0sglyZgsLuPn2VusYl5Ta64 cadet@laptop (ED25519)\n"),  # no -C
        (0, "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM7bq2x meridian-relay-lab\n"),  # the key, not its fingerprint
        (0, "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmU\n-----END OPENSSH PRIVATE KEY-----\n"),  # the private key
        (1, "user cadet\nhostname relay\nport 22\nidentityfile ~/.ssh/id_rsa\n"),  # the entry isn't used: Host misspelt
        (1, "user okafor\nhostname relay.meridian.example\nport 22\nidentityfile ~/.ssh/id_rsa\nidentityfile ~/.ssh/id_ed25519\n"),  # no IdentityFile
        (1, "user okafor\nhostname relay.meridian.example\nport 22\nidentityfile ~/.ssh/meridian_relay.pub\n"),  # the public half
        (2, "3072 SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s github.com (RSA)\n"),  # every type, the wrong one pasted
        (2, "256 SHA256:0W3lTNI26hvTR6CpeNpd0sglyZgsLuPn2VusYl5Ta64 meridian-relay-lab (ED25519)\n"),  # their own key again
    ],
    ids=["rsa", "no-comment", "public-key-line", "private-key", "host-misspelt", "no-identityfile", "pub-as-identity", "github-rsa", "own-key"],
)
def test_module_07s_lab_refuses_the_likely_mistakes(box, paste):
    pastes = [KEY_FP, SSH_G, GITHUB]
    pastes[box] = paste
    assert not _passes(_module("ssh-keys"), *pastes)


def test_module_07s_github_fingerprint_is_the_one_github_publishes():
    # docs.github.com, "GitHub's SSH key fingerprints": SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU (ED25519)
    assert "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU" in GITHUB


# --- 08: Copying files and tunnels (#174) -----------------------------------------------------------
DRY = """sending incremental file list
logs/
logs/relay-1006.log
logs/relay-1007.log
logs/relay-1008.log

sent 144 bytes  received 29 bytes  346.00 bytes/sec
total size is 66  speedup is 0.38 (DRY RUN)
"""
REAL = """sending incremental file list
relay-1006.log
relay-1007.log
relay-1008.log

sent 317 bytes  received 73 bytes  780.00 bytes/sec
total size is 66  speedup is 0.17
"""
DELETE = """sending incremental file list
deleting notes.txt

sent 118 bytes  received 32 bytes  300.00 bytes/sec
total size is 66  speedup is 0.44 (DRY RUN)
"""
FORWARD = "user okafor\nhostname relay.meridian.example\nlocalforward 8080 [localhost]:8000\n"


@pytest.mark.criterion(174, "Module 08 of Unit 1.4 is complete content")
def test_module_08_is_complete_content():
    module = load_catalog().unit_modules("networking")[7]
    assert module.slug == "copying-and-tunnels"
    _lab_content(module)


@pytest.mark.criterion(174, "Module 08's lab can be done for real")
def test_module_08s_examples_are_a_real_run_and_pass():
    module = _module("copying-and-tunnels")
    assert _passes(module, *[box.example for box in module.lab.boxes])


@pytest.mark.parametrize(
    "pastes",
    [
        (DRY, REAL, DELETE, FORWARD),
        # Homebrew's rsync on a Mac (3.3), with another order; Windows line ends; 127.0.0.1 for the far end.
        (DRY.replace("logs/relay-1006.log\nlogs/relay-1007.log\n", "logs/relay-1007.log\nlogs/relay-1006.log\n").replace("\n", "\r\n"), REAL, DELETE,
         FORWARD.replace("[localhost]", "[127.0.0.1]")),
        # Only the file lines and the summary, without the header.
        (DRY.replace("sending incremental file list\n", ""), REAL.replace("sending incremental file list\n", ""), DELETE, FORWARD),
    ],
    ids=["terminal", "mac-and-windows", "trimmed"],
)
def test_module_08s_lab_passes_any_machines_output(pastes):
    assert _passes(_module("copying-and-tunnels"), *pastes)


@pytest.mark.parametrize(
    "box, paste",
    [
        (0, DRY.replace("logs/", "").replace("\n\n", "\n")),  # with the slash: the files, not the directory
        (0, DRY.replace(" (DRY RUN)", "")),  # not a dry run
        (1, DRY.replace(" (DRY RUN)", "")),  # without the slash: logs/ made in home/
        (1, REAL.replace("speedup is 0.17", "speedup is 0.17 (DRY RUN)")),  # still -n
        (2, DELETE.replace(" (DRY RUN)", "")),  # ran --delete for real
        (2, "sending incremental file list\n\nsent 114 bytes  received 12 bytes  252.00 bytes/sec\ntotal size is 66  speedup is 0.52 (DRY RUN)\n"),  # no --delete
        (3, "user okafor\nhostname relay.meridian.example\nlocalforward 8000 [localhost]:8080\n"),  # the ports the wrong way round
        (3, "user okafor\nhostname relay-admin\nlocalforward 8080 [localhost]:8000\n"),  # no HostName
        (3, "user okafor\nhostname relay.meridian.example\n"),  # no LocalForward
    ],
    ids=["slash-in-step-2", "real-in-step-2", "no-slash-in-step-3", "dry-in-step-3", "deleted-for-real", "no-delete", "ports-swapped", "no-hostname", "no-forward"],
)
def test_module_08s_lab_refuses_the_likely_mistakes(box, paste):
    pastes = [DRY, REAL, DELETE, FORWARD]
    pastes[box] = paste
    assert not _passes(_module("copying-and-tunnels"), *pastes)


# --- 09: Firewalls (#175) ------------------------------------------------------------------------------
RULES = "/etc/ufw/user.rules"
CONF = "/etc/ufw/ufw.conf"
FEED = "/home/cadet/feed.txt"
NARROW = "### tuple ### allow tcp 9100 0.0.0.0/0 any 10.4.1.40 in"


def _firewall(start, tuples, enabled=True):
    from app.content.schema import ufw_conf, ufw_rules

    rules, conf = start[RULES], start[CONF]
    return {
        **start,
        RULES: Node(**{**rules.model_dump(), "contents": ufw_rules(tuples)}),
        CONF: Node(**{**conf.model_dump(), "contents": ufw_conf(enabled)}),
    }


def _fixed(start, tuples=None, enabled=True, feed='{"relay":"relay.meridian","uplink":"ok","queued":0}\n'):
    tuples = ["allow tcp 22 0.0.0.0/0 any 0.0.0.0/0 in", NARROW.removeprefix("### tuple ### ")] if tuples is None else tuples
    state = _firewall(start, tuples, enabled)
    return _with_file(state, FEED, feed) if feed is not None else state


@pytest.mark.criterion(175, "Module 09 of Unit 1.4 is complete content")
def test_module_09_is_complete_content():
    module = load_catalog().unit_modules("networking")[8]
    assert module.slug == "firewalls"
    _complete_content(module)


@pytest.mark.criterion(175, "Module 09's console task can be done")
def test_module_09s_end_state_passes_on_the_server():
    exercise = _module("firewalls").terminal
    start = _start(exercise)
    assert not grade(exercise, start, exercise.cwd)
    assert grade(exercise, _fixed(start), exercise.cwd)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"tuples": ["allow tcp 22 0.0.0.0/0 any 0.0.0.0/0 in", "allow any 9100 0.0.0.0/0 any 0.0.0.0/0 in"]},  # ufw allow 9100: everyone
        {"tuples": ["allow tcp 22 0.0.0.0/0 any 0.0.0.0/0 in", "allow any 9100 0.0.0.0/0 any 10.4.1.40 in"]},  # no proto: udp too
        {"tuples": ["allow tcp 22 0.0.0.0/0 any 0.0.0.0/0 in", "allow tcp 9100 0.0.0.0/0 any 10.4.1.5 in"]},  # the ops desk instead
        {"enabled": False},  # ufw disable
        {"feed": None},  # no proof
    ],
    ids=["open-to-all", "tcp-and-udp", "wrong-host", "firewall-off", "no-feed"],
)
def test_module_09_refuses_the_misreadings(kwargs):
    exercise = _module("firewalls").terminal
    assert not grade(exercise, _fixed(_start(exercise), **kwargs), exercise.cwd)


def test_module_09s_figures_match_the_console():
    module = _module("firewalls")
    exercise = module.terminal
    net = exercise.network
    hosts = {h.name: h for h in net.hosts}
    feed = next(s for s in net.listening if s.process == "relay-feed")
    # The trap: an earlier deny on the feed's port, so an allow added after it changes nothing.
    rules = net.firewall.rules
    assert net.firewall.enabled and [(r.action, r.port) for r in rules] == [("allow", 22), ("deny", feed.port)]
    assert feed.address == "0.0.0.0"  # listening on every address: it's the firewall, not the bind
    # The checks want exactly Mission's host on exactly that port, over TCP.
    mission = hosts["mission"]
    assert exercise.checks[0].text == f"### tuple ### allow tcp {feed.port} 0.0.0.0/0 any {mission.address} in\n"
    assert mission.login and hosts["ops-desk"].login and hosts["ops-desk"].address != mission.address
    assert feed.http[0].body.rstrip("\n").startswith("{" + exercise.checks[2].text)
    eth0 = ipaddress.IPv4Interface(net.interfaces[0].address)
    assert f"http://{eth0.ip}:{feed.port}/feed" in exercise.task
    # What the crew say is true.
    assert f"0.0.0.0:{feed.port} · LISTENING" in _said(module, "open") and f"port {feed.port}" in _said(module, "open")
    assert f"{feed.port}/tcp ALLOW {mission.address}" in _said(module, "console_done")
    # The lesson, quiz and cards use none of the task's numbers.
    body = module.body_html
    quoted = " ".join([q.q + (q.code or "") + " ".join(getattr(q, "options", [])) for q in module.quiz]
                      + [c.front_html + c.back_html for c in module.cards])
    for text in (body, quoted):
        assert "10.4.1." not in text and "mission.meridian" not in text and "relay-feed" not in text
