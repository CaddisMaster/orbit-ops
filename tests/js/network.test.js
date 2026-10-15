// The console's station network (#164): ip, ss, ping, nc and hostname over a
// simulated network. Expected output is what Ubuntu 24.04 printed for the same
// situation (iproute2 6.1 on a VM, and iputils and OpenBSD netcat in two
// ubuntu:24.04 containers on a 10.4.0.0/24 network), with only the addresses,
// ports and round-trip times changed.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell } = require("../../app/static/js/shell.js");

const dir = (owner = "root", mode = 0o755) => ({ type: "dir", mode, owner, group: owner === "root" ? "root" : "crew", contents: "" });

const NETWORK = {
  interfaces: [{ name: "eth0", address: "10.4.0.12/24" }],
  gateway: "10.4.0.1",
  listening: [
    { port: 8080, proto: "tcp", process: "python3", address: "0.0.0.0" },
    { port: 5000, proto: "tcp", process: "telemetry", address: "127.0.0.1" },
    { port: 123, proto: "udp", process: "chronyd", address: "0.0.0.0" },
  ],
  connections: [
    { process: "psql", remote: "10.4.0.20:5432", local_port: null },
    { process: "scrubber-flush", remote: "203.0.113.47:443", local_port: null },
  ],
  hosts: [
    { name: "db", address: "10.4.0.20", up: true, ping: true, services: [{ port: 5432, proto: "tcp" }], filtered: [2222] },
    { name: "beacon", address: "10.4.0.30", up: true, ping: false, services: [{ port: 22, proto: "tcp" }], filtered: [] },
    { name: "md-3", address: "10.4.2.17", up: false, ping: true, services: [], filtered: [] },
    { name: "relay", address: "203.0.113.47", up: true, ping: true, services: [{ port: 443, proto: "tcp" }], filtered: [] },
  ],
};

function station(network = NETWORK) {
  return new Shell({
    user: "cadet",
    group: "crew",
    groups: ["sudo"],
    password: "meridian",
    cwd: "/home/cadet",
    network,
    processes: [
      { command: "python3 -m http.server 8080", user: "cadet" },
      { command: "/usr/local/bin/telemetry --bind 127.0.0.1", user: "cadet" },
      { command: "/usr/sbin/chronyd -F 1", user: "root" },
      { command: "psql -h 10.4.0.20 telemetry", user: "cadet" },
      { command: "/usr/local/sbin/scrubber-flush", user: "root" },
    ],
    fs: {
      "/": dir(), "/root": dir("root", 0o700), "/home": dir(), "/home/cadet": dir("cadet"), "/etc": dir(),
      "/etc/passwd": { type: "file", mode: 0o644, owner: "root", group: "root", contents: "root:x:0:0:root:/root:/bin/bash\ncadet:x:1000:1000:Cadet:/home/cadet:/bin/bash\n" },
      "/etc/group": { type: "file", mode: 0o644, owner: "root", group: "root", contents: "root:x:0:\nsudo:x:27:cadet\ncrew:x:1000:\n" },
    },
  });
}
const out = (sh, line) => sh.run(line).output;
const status = (sh, line) => { const output = out(sh, line); return { output, code: sh.lastStatus }; };

// --- the scenarios ---------------------------------------------------------------------
test("The console shows its addresses and routes", () => {
  const sh = station();
  assert.equal(out(sh, "ip addr"), [
    "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000",
    "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00",
    "    inet 127.0.0.1/8 scope host lo",
    "       valid_lft forever preferred_lft forever",
    "    inet6 ::1/128 scope host noprefixroute ",
    "       valid_lft forever preferred_lft forever",
    "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000",
    "    link/ether 52:54:00:04:00:0c brd ff:ff:ff:ff:ff:ff",
    "    inet 10.4.0.12/24 brd 10.4.0.255 scope global eth0",
    "       valid_lft forever preferred_lft forever",
    "    inet6 fe80::5054:ff:fe04:c/64 scope link ",
    "       valid_lft forever preferred_lft forever",
    "",
  ].join("\n"));
  assert.equal(out(sh, "ip a"), out(sh, "ip address show"));
  assert.equal(out(sh, "ip route"), "default via 10.4.0.1 dev eth0 proto static \n10.4.0.0/24 dev eth0 proto kernel scope link src 10.4.0.12 \n");
  assert.equal(out(sh, "ip r"), out(sh, "ip route show"));
});

test("ss shows what's listening and what's connected", () => {
  const sh = station();
  // As cadet: only cadet's own processes are named, as on a real server.
  assert.equal(out(sh, "ss -tlnp"), [
    "State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess                            ",
    "LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*                                      ",
    "LISTEN 0      4096         0.0.0.0:8080      0.0.0.0:*    users:((\"python3\",pid=400,fd=3))  ",
    "LISTEN 0      4096       127.0.0.1:5000      0.0.0.0:*    users:((\"telemetry\",pid=417,fd=3))",
    "LISTEN 0      4096            [::]:22           [::]:*                                      ",
    "",
  ].join("\n"));
  assert.equal(out(sh, "ss -tnp"), [
    "State Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess                       ",
    "ESTAB 0      0          10.4.0.12:47253    10.4.0.20:5432 users:((\"psql\",pid=451,fd=3))",
    "ESTAB 0      0          10.4.0.12:49239 203.0.113.47:443                               ",
    "",
  ].join("\n"));
  // Root sees every process; the established connection is scrubber-flush's.
  assert.equal(sh.run("sudo ss -tnp").pending, true);
  assert.match(out(sh, "meridian"), /203\.0\.113\.47:443\s+users:\(\("scrubber-flush",pid=468,fd=3\)\)/);
  assert.match(out(sh, "sudo ss -tlnp"), /0\.0\.0\.0:22\s+0\.0\.0\.0:\*\s+users:\(\("sshd",pid=812,fd=3\)\)/);
  // A killed process's socket is gone.
  sh.run("kill 400");
  assert.doesNotMatch(out(sh, "ss -tln"), /8080/);
});

test("ping and nc tell reachable, refused and unreachable apart", () => {
  const sh = station();
  // Reachable: replies, exit 0.
  let r = status(sh, "ping -c 2 10.4.0.20");
  assert.match(r.output, new RegExp([
    "^PING 10\\.4\\.0\\.20 \\(10\\.4\\.0\\.20\\) 56\\(84\\) bytes of data\\.",
    "64 bytes from 10\\.4\\.0\\.20: icmp_seq=1 ttl=64 time=0\\.\\d{3} ms",
    "64 bytes from 10\\.4\\.0\\.20: icmp_seq=2 ttl=64 time=0\\.\\d{3} ms",
    "",
    "--- 10\\.4\\.0\\.20 ping statistics ---",
    "2 packets transmitted, 2 received, 0% packet loss, time 1004ms",
    "rtt min/avg/max/mdev = 0\\.\\d{3}/0\\.\\d{3}/0\\.\\d{3}/0\\.\\d{3} ms\n$",
  ].join("\n")));
  assert.equal(r.code, 0);
  // Unreachable on this subnet: nothing answers ARP, so the kernel reports it.
  r = status(sh, "ping -c 2 10.4.0.99");
  assert.equal(r.output, [
    "PING 10.4.0.99 (10.4.0.99) 56(84) bytes of data.",
    "From 10.4.0.12 icmp_seq=1 Destination Host Unreachable",
    "From 10.4.0.12 icmp_seq=2 Destination Host Unreachable",
    "",
    "--- 10.4.0.99 ping statistics ---",
    "2 packets transmitted, 0 received, +2 errors, 100% packet loss, time 1044ms",
    "pipe 2",
    "",
  ].join("\n"));
  assert.equal(r.code, 1);
  // Unreachable beyond the gateway: silence, then the summary and a blank line.
  r = status(sh, "ping -c 2 10.4.2.17");
  assert.equal(r.output, [
    "PING 10.4.2.17 (10.4.2.17) 56(84) bytes of data.",
    "",
    "--- 10.4.2.17 ping statistics ---",
    "2 packets transmitted, 0 received, 100% packet loss, time 1044ms",
    "",
    "",
  ].join("\n"));
  assert.equal(r.code, 1);

  // nc: open, refused, and the two ways of nothing answering.
  r = status(sh, "nc -zv 10.4.0.20 5432");
  assert.equal(r.output, "Connection to 10.4.0.20 5432 port [tcp/postgresql] succeeded!\n");
  assert.equal(r.code, 0);
  r = status(sh, "nc -zv 10.4.0.20 5433");
  assert.equal(r.output, "nc: connect to 10.4.0.20 port 5433 (tcp) failed: Connection refused\n");
  assert.equal(r.code, 1);
  r = status(sh, "nc -zv 10.4.0.99 22");
  assert.equal(r.output, "nc: connect to 10.4.0.99 port 22 (tcp) failed: No route to host\n");
  assert.equal(r.code, 1);
  r = status(sh, "nc -zv -w 2 10.4.0.20 2222");
  assert.equal(r.output, "nc: connect to 10.4.0.20 port 2222 (tcp) timed out: Operation now in progress\n");
  assert.equal(r.code, 1);
  r = status(sh, "nc -zv 10.4.2.17 22");
  assert.equal(r.output, "nc: connect to 10.4.2.17 port 22 (tcp) failed: Connection timed out\n");
  assert.equal(r.code, 1);
});

// --- the details -----------------------------------------------------------------------
test("Waiting for an answer that never comes takes station time", () => {
  const sh = station();
  const before = sh.clock;
  sh.run("nc -zv 10.4.0.20 2222");
  assert.ok(sh.clock - before >= 134, "nc without -w waits out the kernel's retries");
  const mid = sh.clock;
  sh.run("nc -zv -w 3 10.4.0.20 2222");
  assert.equal(sh.clock - mid, 3 + 1);
});

test("A host can be up and still ignore ping", () => {
  const sh = station();
  const r = status(sh, "ping -c 1 10.4.0.30");
  assert.equal(r.output, "PING 10.4.0.30 (10.4.0.30) 56(84) bytes of data.\n\n--- 10.4.0.30 ping statistics ---\n1 packets transmitted, 0 received, 100% packet loss, time 0ms\n\n");
  assert.equal(r.code, 1);
  assert.equal(out(sh, "nc -zv 10.4.0.30 22"), "Connection to 10.4.0.30 22 port [tcp/ssh] succeeded!\n");
});

test("The gateway answers ping, and hosts beyond it take longer", () => {
  const sh = station();
  assert.match(out(sh, "ping -c 1 10.4.0.1"), /ttl=64 time=0\.\d{3} ms/);
  assert.match(out(sh, "ping -c 1 203.0.113.47"), /64 bytes from 203\.0\.113\.47: icmp_seq=1 ttl=63 time=\d\d\.\d ms/);
});

test("ping's summary-only, its counts, and the lines it won't run", () => {
  const sh = station();
  const q = out(sh, "ping -q -c 3 10.4.0.20");
  assert.doesNotMatch(q, /icmp_seq/);
  assert.match(q, /3 packets transmitted, 3 received, 0% packet loss/);
  assert.equal(status(sh, "ping 10.4.0.20 -c 1").code, 0); // options after the host, as getopt allows
  assert.deepEqual(status(sh, "ping"), { output: "ping: usage error: Destination address required\n", code: 1 });
  assert.deepEqual(status(sh, "ping -c abc 10.4.0.20"), { output: "ping: invalid argument: 'abc'\n", code: 1 });
  assert.deepEqual(status(sh, "ping -c 0 10.4.0.20"), { output: "ping: invalid argument: '0': out of range: 1 <= value <= 9223372036854775807\n", code: 1 });
  assert.match(status(sh, "ping 10.4.0.20").output, /^ping: give it a count on this console: ping -c 4 10\.4\.0\.20/);
  assert.equal(out(sh, "ping -i 0.2 -c 1 10.4.0.20"), "ping: -i isn't supported on this console\n");
  assert.deepEqual(status(sh, "ping -c 1 relay"), { output: "ping: relay: Temporary failure in name resolution\n", code: 2 });
  assert.deepEqual(status(sh, "ping -c 1 300.1.1.1"), { output: "ping: 300.1.1.1: Name or service not known\n", code: 2 });
  assert.equal(status(sh, "ping -c 1 10.4.0.255").output, "ping: Do you want to ping broadcast? Then -b. If not, check your local firewall rules\n");
});

test("localhost and the console's own name resolve, and loopback is quick", () => {
  const sh = station();
  const r = out(sh, "ping -c 1 localhost");
  assert.match(r, /^PING localhost \(127\.0\.0\.1\) 56\(84\) bytes of data\.\n64 bytes from localhost \(127\.0\.0\.1\): icmp_seq=1 ttl=64 time=0\.0\d\d ms\n/);
  assert.match(r, /--- localhost ping statistics ---/);
  assert.equal(out(sh, "nc -zv meridian 22"), "Connection to meridian (127.0.1.1) 22 port [tcp/ssh] succeeded!\n");
});

test("127.0.0.1 is this machine only; 0.0.0.0 is every address", () => {
  const sh = station();
  assert.equal(out(sh, "nc -zv localhost 5000"), "Connection to localhost (127.0.0.1) 5000 port [tcp/*] succeeded!\n");
  assert.equal(out(sh, "nc -zv 10.4.0.12 5000"), "nc: connect to 10.4.0.12 port 5000 (tcp) failed: Connection refused\n");
  assert.equal(out(sh, "nc -zv 10.4.0.12 8080"), "Connection to 10.4.0.12 8080 port [tcp/http-alt] succeeded!\n");
  assert.equal(out(sh, "nc -zv 127.0.0.1 8080"), "Connection to 127.0.0.1 8080 port [tcp/http-alt] succeeded!\n");
});

test("nc speaks on stderr, reports success without -v, and checks ranges", () => {
  const sh = station();
  assert.deepEqual(status(sh, "nc -zv 10.4.0.20 5432 2>/dev/null"), { output: "", code: 0 });
  assert.deepEqual(status(sh, "nc -z 10.4.0.20 5432"), { output: "Connection to 10.4.0.20 5432 port [tcp/postgresql] succeeded!\n", code: 0 });
  assert.deepEqual(status(sh, "nc -z 10.4.0.20 5433"), { output: "", code: 1 });
  assert.deepEqual(status(sh, "nc -zv 10.4.0.20 5431-5433"), {
    output: "nc: connect to 10.4.0.20 port 5431 (tcp) failed: Connection refused\n" +
      "Connection to 10.4.0.20 5432 port [tcp/postgresql] succeeded!\n" +
      "nc: connect to 10.4.0.20 port 5433 (tcp) failed: Connection refused\n",
    code: 0,
  });
  assert.deepEqual(status(sh, "nc -zv 10.4.0.20"), { output: "nc: missing port number\n", code: 1 });
  assert.equal(out(sh, "nc -zv 10.4.0.20 abc"), "nc: port number invalid: abc\n");
  assert.equal(out(sh, "nc -zv 10.4.0.20 70000"), "nc: port number too large: 70000\n");
  assert.equal(out(sh, "nc -zv db 5432"), 'nc: getaddrinfo for host "db" port 5432: Temporary failure in name resolution\n');
  assert.equal(out(sh, "nc -zuv 10.4.0.20 53"), "nc: -u isn't supported on this console\n");
  assert.equal(out(sh, "nc 10.4.0.20 5432"), "nc: this console's nc only checks ports: nc -zv HOST PORT\n");
});

test("No default route: anything off the subnet is unreachable", () => {
  const sh = station({ ...NETWORK, gateway: null });
  assert.equal(out(sh, "ip route"), "10.4.0.0/24 dev eth0 proto kernel scope link src 10.4.0.12 \n");
  assert.deepEqual(status(sh, "ping -c 1 203.0.113.47"), { output: "ping: connect: Network is unreachable\n", code: 2 });
  assert.equal(out(sh, "nc -zv 203.0.113.47 443"), "nc: connect to 203.0.113.47 port 443 (tcp) failed: Network is unreachable\n");
  assert.deepEqual(status(sh, "ip route get 203.0.113.47"), { output: "RTNETLINK answers: Network is unreachable\n", code: 2 });
});

test("ip's other views: brief, one family, links, devices and routes to one address", () => {
  const sh = station();
  assert.equal(out(sh, "ip -br a"), "lo               UNKNOWN        127.0.0.1/8 ::1/128 \neth0             UP             10.4.0.12/24 fe80::5054:ff:fe04:c/64 \n");
  assert.equal(out(sh, "ip -br link"), "lo               UNKNOWN        00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP> \neth0             UP             52:54:00:04:00:0c <BROADCAST,MULTICAST,UP,LOWER_UP> \n");
  assert.equal(out(sh, "ip -4 addr show eth0"), "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n    inet 10.4.0.12/24 brd 10.4.0.255 scope global eth0\n       valid_lft forever preferred_lft forever\n");
  assert.equal(out(sh, "ip link show dev lo"), "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n");
  assert.deepEqual(status(sh, "ip addr show eth9"), { output: 'Device "eth9" does not exist.\n', code: 1 });
  assert.deepEqual(status(sh, "ip foo"), { output: 'Object "foo" is unknown, try "ip help".\n', code: 1 });
  assert.equal(out(sh, "ip route get 10.4.0.20"), "10.4.0.20 dev eth0 src 10.4.0.12 uid 1000 \n    cache \n");
  assert.equal(out(sh, "ip route get 203.0.113.47"), "203.0.113.47 via 10.4.0.1 dev eth0 src 10.4.0.12 uid 1000 \n    cache \n");
  assert.equal(out(sh, "ip route get 127.0.0.1"), "local 127.0.0.1 dev lo src 127.0.0.1 uid 1000 \n    cache <local> \n");
  assert.equal(out(sh, "ip route show default"), "default via 10.4.0.1 dev eth0 proto static \n");
  assert.deepEqual(status(sh, "ip addr add 10.4.0.50/24 dev eth0"), { output: "RTNETLINK answers: Operation not permitted\n", code: 2 });
  assert.equal(out(sh, "ip neigh"), "ip: ip neighbour isn't supported on this console; try ip addr, ip link or ip route\n");
});

test("ss: service names without -n, UDP, -a and the options it doesn't have", () => {
  const sh = station();
  assert.equal(out(sh, "ss -tl"), [
    "State  Recv-Q Send-Q Local Address:Port     Peer Address:PortProcess",
    "LISTEN 0      4096         0.0.0.0:ssh           0.0.0.0:*          ",
    "LISTEN 0      4096         0.0.0.0:http-alt      0.0.0.0:*          ",
    "LISTEN 0      4096       127.0.0.1:5000          0.0.0.0:*          ",
    "LISTEN 0      4096            [::]:ssh              [::]:*          ",
    "",
  ].join("\n"));
  const both = out(sh, "ss -tulpn").split("\n");
  assert.match(both[0], /^Netid State  Recv-Q Send-Q Local Address:Port/);
  assert.match(both[1], /^udp   UNCONN 0      0            0\.0\.0\.0:123 /); // UDP first, as ss lists them
  assert.match(both[2], /^tcp   LISTEN /);
  assert.equal(out(sh, "ss -tan").split("\n").length, 1 + 4 + 2 + 1);
  assert.equal(out(sh, "ss -tlnH4").split("\n").length, 3 + 1); // no header, no IPv6
  assert.equal(out(sh, "ss -tln state listening"), "ss: filters (state listening) aren't supported on this console; pipe ss to grep instead\n");
  assert.equal(out(sh, "ss -tle"), "ss: -e isn't supported on this console\n");
});

test("hostname", () => {
  const sh = station({ ...NETWORK, interfaces: [{ name: "eth0", address: "10.4.0.12/24" }, { name: "eth1", address: "172.16.4.2/16" }] });
  assert.equal(out(sh, "hostname"), "meridian\n");
  assert.equal(out(sh, "hostname -I"), "10.4.0.12 172.16.4.2 \n");
  assert.deepEqual(status(sh, "hostname relay"), { output: "hostname: you must be root to change the host name\n", code: 1 });
});

test("Without a network in the exercise, the console has the default one", () => {
  const sh = new Shell({ user: "cadet", group: "crew", cwd: "/", fs: { "/": dir() } });
  assert.equal(out(sh, "hostname -I"), "10.4.0.12 \n");
  assert.match(out(sh, "ip route"), /^default via 10\.4\.0\.1 dev eth0 proto static \n/);
  assert.equal(out(sh, "type ss ping nc ip"), "ss is /usr/bin/ss\nping is /usr/bin/ping\nnc is /usr/bin/nc\nip is /usr/bin/ip\n");
});
