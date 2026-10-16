// Names on the console (#165): /etc/hosts, the station's resolver, and dig,
// host and getent hosts. Expected output is what Ubuntu 24.04 printed for the
// same zone: dnsutils (BIND 9.18.39) in an ubuntu:24.04 container asking a
// bind9 resolver that forwards to a bind9 server holding these records, on a
// scratch 10.4.0.0/24 network. dig's query id, query time and date are its
// own, so the tests mask those three; everything else is byte for byte.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell } = require("../../app/static/js/shell.js");

const dir = (owner = "root", mode = 0o755) => ({ type: "dir", mode, owner, group: owner === "root" ? "root" : "crew", contents: "" });
const file = (contents, owner = "root", mode = 0o644) => ({ type: "file", mode, owner, group: owner === "root" ? "root" : "crew", contents });

const HOSTS = "127.0.0.1 localhost\n127.0.1.1 meridian\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback\nfe00::0 ip6-localnet\nff00::0 ip6-mcastprefix\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n";

const NETWORK = {
  interfaces: [{ name: "eth0", address: "10.4.0.12/24" }],
  gateway: "10.4.0.254",
  listening: [],
  connections: [],
  hosts: [
    { name: "mission", address: "10.4.0.2", up: true, ping: true, services: [], filtered: [] },
    { name: "ns1", address: "10.4.0.53", up: true, ping: true, services: [{ port: 53, proto: "udp" }], filtered: [] },
  ],
  dns: {
    server: "10.4.0.1",
    records: [
      { name: "ns1.meridian", type: "A", value: "10.4.0.53", ttl: 300 },
      { name: "mission.meridian", type: "A", value: "10.4.0.2", ttl: 300 },
      { name: "ops.meridian", type: "CNAME", value: "mission.meridian", ttl: 300 },
      { name: "relay.depot-sync.net", type: "A", value: "203.0.113.47", ttl: 300 },
      { name: "www.depot-sync.net", type: "CNAME", value: "relay.depot-sync.net", ttl: 300 },
      { name: "depot-sync.net", type: "MX", value: "10 mail.depot-sync.net", ttl: 300 },
      { name: "mail.depot-sync.net", type: "A", value: "203.0.113.48", ttl: 300 },
      { name: "depot-sync.net", type: "TXT", value: "v=spf1 mx -all", ttl: 300 },
      { name: "47.113.0.203.in-addr.arpa", type: "PTR", value: "relay.depot-sync.net", ttl: 300 },
      { name: "2.0.4.10.in-addr.arpa", type: "PTR", value: "mission.meridian", ttl: 300 },
    ],
  },
};

function station({ user = "cadet", hosts = HOSTS, resolv = "nameserver 10.4.0.1\n", network = NETWORK } = {}) {
  const fs = { "/": dir(), "/root": dir("root", 0o700), "/home": dir(), "/home/cadet": dir("cadet"), "/etc": dir() };
  if (hosts !== null) fs["/etc/hosts"] = file(hosts);
  if (resolv !== null) fs["/etc/resolv.conf"] = file(resolv);
  return new Shell({ user, group: user === "root" ? "root" : "crew", cwd: user === "root" ? "/root" : "/home/cadet", network, fs });
}
const out = (sh, line) => sh.run(line).output;
const status = (sh, line) => { const output = out(sh, line); return { output, code: sh.lastStatus }; };
const masked = (text) => text.replace(/id: \d+/, "id: N").replace(/Query time: \d+ msec/, "Query time: N msec").replace(/^;; WHEN: .*$/m, ";; WHEN: T");

const digged = (args, sections, size, status = "NOERROR", counts = "ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1") =>
  "\n; <<>> DiG 9.18.39-0ubuntu0.24.04.8-Ubuntu <<>> " + args + "\n;; global options: +cmd\n;; Got answer:\n" +
  ";; ->>HEADER<<- opcode: QUERY, status: " + status + ", id: N\n;; flags: qr rd ra; QUERY: 1, " + counts + "\n\n" +
  ";; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 1232\n;; QUESTION SECTION:\n" + sections +
  ";; Query time: N msec\n;; SERVER: 10.4.0.1#53(10.4.0.1) (UDP)\n;; WHEN: T\n;; MSG SIZE  rcvd: " + size + "\n\n";

// --- the scenarios ---------------------------------------------------------------------
test("dig answers from the station's DNS", () => {
  const sh = station();
  assert.equal(masked(out(sh, "dig relay.depot-sync.net")), digged("relay.depot-sync.net",
    ";relay.depot-sync.net.\t\tIN\tA\n\n;; ANSWER SECTION:\nrelay.depot-sync.net.\t300\tIN\tA\t203.0.113.47\n\n", 65));
  assert.equal(sh.lastStatus, 0);
  assert.deepEqual(status(sh, "dig +short relay.depot-sync.net"), { output: "203.0.113.47\n", code: 0 });
  assert.equal(out(sh, "dig relay.depot-sync.net +short"), "203.0.113.47\n"); // options go anywhere
});

test("A missing name is NXDOMAIN", () => {
  const sh = station();
  const r = status(sh, "dig nowhere.meridian");
  assert.equal(masked(r.output), digged("nowhere.meridian",
    ";nowhere.meridian.\t\tIN\tA\n\n;; AUTHORITY SECTION:\nmeridian.\t\t300\tIN\tSOA\tns1.meridian. hostmaster.meridian. 2026100801 3600 900 604800 300\n\n",
    96, "NXDOMAIN", "ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1"));
  assert.doesNotMatch(r.output, /ANSWER SECTION/);
  assert.equal(r.code, 0); // dig got an answer; the answer is "no such name"
  assert.deepEqual(status(sh, "dig +short nowhere.meridian"), { output: "", code: 0 });
  assert.deepEqual(status(sh, "host nowhere.meridian"), { output: "Host nowhere.meridian not found: 3(NXDOMAIN)\n", code: 1 });
  assert.deepEqual(status(sh, "getent hosts nowhere.meridian"), { output: "", code: 2 });
  assert.deepEqual(status(sh, "ping -c 1 nowhere.meridian"), { output: "ping: nowhere.meridian: Name or service not known\n", code: 2 });
  assert.equal(out(sh, "nc -zv nowhere.meridian 22"), 'nc: getaddrinfo for host "nowhere.meridian" port 22: Name or service not known\n');
});

test("/etc/hosts wins over DNS for getent but not for dig", () => {
  const sh = station({ hosts: HOSTS + "10.4.0.99 mission.meridian\n" });
  assert.equal(out(sh, "getent hosts mission.meridian"), "10.4.0.99       mission.meridian\n");
  assert.equal(out(sh, "dig +short mission.meridian"), "10.4.0.2\n");
  assert.equal(out(sh, "host mission.meridian"), "mission.meridian has address 10.4.0.2\n");
  // ping uses what getent does, so it goes to the wrong machine, and nothing answers.
  assert.equal(out(sh, "ping -c 1 mission.meridian"),
    "PING mission.meridian (10.4.0.99) 56(84) bytes of data.\nFrom 10.4.0.12 icmp_seq=1 Destination Host Unreachable\n\n" +
    "--- mission.meridian ping statistics ---\n1 packets transmitted, 0 received, +1 errors, 100% packet loss, time 0ms\n\n");
  assert.equal(out(sh, "getent hosts 10.4.0.99"), "10.4.0.99       mission.meridian\n");
});

test("Reverse lookups work", () => {
  const sh = station();
  assert.equal(out(sh, "dig -x 203.0.113.47 +short"), "relay.depot-sync.net.\n");
  assert.equal(masked(out(sh, "dig -x 203.0.113.47")), digged("-x 203.0.113.47",
    ";47.113.0.203.in-addr.arpa.\tIN\tPTR\n\n;; ANSWER SECTION:\n47.113.0.203.in-addr.arpa. 300\tIN\tPTR\trelay.depot-sync.net.\n\n", 88));
  assert.equal(out(sh, "host 203.0.113.47"), "47.113.0.203.in-addr.arpa domain name pointer relay.depot-sync.net.\n");
  assert.equal(out(sh, "getent hosts 203.0.113.47"), "203.0.113.47    relay.depot-sync.net\n");
  assert.deepEqual(status(sh, "host 10.4.0.53"), { output: "Host 53.0.4.10.in-addr.arpa. not found: 3(NXDOMAIN)\n", code: 1 });
});

// --- the rest of dig and host --------------------------------------------------------------
test("dig follows a CNAME, and an MX brings its exchange's address", () => {
  const sh = station();
  assert.equal(masked(out(sh, "dig www.depot-sync.net")), digged("www.depot-sync.net",
    ";www.depot-sync.net.\t\tIN\tA\n\n;; ANSWER SECTION:\nwww.depot-sync.net.\t300\tIN\tCNAME\trelay.depot-sync.net.\nrelay.depot-sync.net.\t300\tIN\tA\t203.0.113.47\n\n",
    83, "NOERROR", "ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1"));
  assert.equal(out(sh, "dig +short www.depot-sync.net"), "relay.depot-sync.net.\n203.0.113.47\n");
  assert.equal(masked(out(sh, "dig depot-sync.net MX")), digged("depot-sync.net MX",
    ";depot-sync.net.\t\t\tIN\tMX\n\n;; ANSWER SECTION:\ndepot-sync.net.\t\t300\tIN\tMX\t10 mail.depot-sync.net.\n\n" +
    ";; ADDITIONAL SECTION:\nmail.depot-sync.net.\t300\tIN\tA\t203.0.113.48\n\n", 80, "NOERROR", "ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 2"));
  assert.equal(out(sh, "dig MX depot-sync.net +short"), "10 mail.depot-sync.net.\n");
  assert.equal(out(sh, "dig -t txt depot-sync.net +short"), '"v=spf1 mx -all"\n');
  // A name that exists without the type asked for: NOERROR, no answer, the zone's SOA.
  assert.match(out(sh, "dig mission.meridian MX"), /status: NOERROR,.*\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n[\s\S]*MSG SIZE  rcvd: 96\n/);
  assert.match(out(sh, "dig meridian SOA"), /\nmeridian\.\t\t300\tIN\tSOA\tns1\.meridian\. hostmaster\.meridian\. 2026100801 3600 900 604800 300\n[\s\S]*rcvd: 88\n/);
});

test("host says it in sentences", () => {
  const sh = station();
  assert.equal(out(sh, "host relay.depot-sync.net"), "relay.depot-sync.net has address 203.0.113.47\n");
  assert.equal(out(sh, "host www.depot-sync.net"), "www.depot-sync.net is an alias for relay.depot-sync.net.\nrelay.depot-sync.net has address 203.0.113.47\n");
  assert.equal(out(sh, "host depot-sync.net"), "depot-sync.net mail is handled by 10 mail.depot-sync.net.\n");
  assert.equal(out(sh, "host -t TXT depot-sync.net"), 'depot-sync.net descriptive text "v=spf1 mx -all"\n');
  assert.deepEqual(status(sh, "host -t MX mission.meridian"), { output: "mission.meridian has no MX record\n", code: 0 });
  assert.equal(out(sh, "host -t SOA meridian"), "meridian has SOA record ns1.meridian. hostmaster.meridian. 2026100801 3600 900 604800 300\n");
  assert.equal(out(sh, "host mission.meridian 10.4.0.1"), "Using domain server:\nName: 10.4.0.1\nAddress: 10.4.0.1#53\nAliases: \n\nmission.meridian has address 10.4.0.2\n");
});

test("A server that doesn't answer: timed out, refused, or no route", () => {
  const sh = station();
  const before = sh.clock;
  assert.deepEqual(status(sh, "dig +short @10.4.0.77 x"), {
    output: ";; communications error to 10.4.0.77#53: timed out\n".repeat(3) + ";; no servers could be reached\n", code: 9,
  });
  assert.equal(sh.clock - before, 15 + 1); // three 5-second tries, and the command's own second
  // Up, but nothing on port 53: the host says no at once.
  assert.deepEqual(status(sh, "dig @10.4.0.2 x"), {
    output: ";; communications error to 10.4.0.2#53: connection refused\n".repeat(3) +
      "\n; <<>> DiG 9.18.39-0ubuntu0.24.04.8-Ubuntu <<>> @10.4.0.2 x\n; (1 server found)\n;; global options: +cmd\n;; no servers could be reached\n",
    code: 9,
  });
  assert.match(out(sh, "dig @10.4.0.53 mission.meridian"), /;; SERVER: 10\.4\.0\.53#53\(10\.4\.0\.53\) \(UDP\)/); // a host serving udp/53
  assert.deepEqual(status(sh, "host x 10.4.0.77"), { output: ";; communications error to 10.4.0.77#53: timed out\n".repeat(2) + ";; no servers could be reached\n", code: 1 });
  const lost = station({ network: { ...NETWORK, gateway: null } });
  assert.deepEqual(status(lost, "dig @203.0.113.9 x"), {
    output: ";; UDP setup with 203.0.113.9#53(203.0.113.9) for x failed: network unreachable.\n;; no servers could be reached\n".repeat(3), code: 9,
  });
});

test("The resolver is whatever /etc/resolv.conf says, read live", () => {
  const sh = station({ user: "root" });
  sh.run("echo nameserver 10.4.0.77 > /etc/resolv.conf");
  assert.equal(out(sh, "ping -c 1 relay.depot-sync.net"), "ping: relay.depot-sync.net: Temporary failure in name resolution\n");
  assert.deepEqual(status(sh, "getent hosts relay.depot-sync.net"), { output: "", code: 2 });
  assert.equal(out(sh, "getent hosts localhost"), "::1             localhost\n"); // /etc/hosts still works
  sh.run("echo nameserver 10.4.0.53 > /etc/resolv.conf");
  assert.equal(out(sh, "getent hosts relay.depot-sync.net"), "203.0.113.47    relay.depot-sync.net\n");
  // No nameserver at all: resolvers fall back to this machine, which runs no DNS.
  sh.run(": > /etc/resolv.conf");
  assert.equal(out(sh, "dig +short x"), ";; communications error to ::1#53: connection refused\n".repeat(3) +
    ";; communications error to 127.0.0.1#53: connection refused\n;; no servers could be reached\n");
});

test("getent hosts reads /etc/hosts as glibc does", () => {
  const sh = station();
  assert.equal(out(sh, "getent hosts"), "127.0.0.1       localhost\n127.0.1.1       meridian\n127.0.0.1       ip6-localhost ip6-loopback\n");
  assert.deepEqual(status(sh, "getent hosts localhost meridian ip6-localhost ops.meridian 127.0.1.1 nope"), {
    output: "::1             localhost\n127.0.1.1       meridian\n::1             ip6-localhost ip6-loopback\n10.4.0.2        mission.meridian ops.meridian\n127.0.1.1       meridian\n",
    code: 2,
  });
  assert.equal(out(sh, "getent group sudo"), ""); // the other databases are as they were
});

test("ping prints the canonical name and names its replies", () => {
  const sh = station();
  const r = out(sh, "ping -c 2 ops.meridian");
  assert.match(r, /^PING mission\.meridian \(10\.4\.0\.2\) 56\(84\) bytes of data\.\n64 bytes from mission\.meridian \(10\.4\.0\.2\): icmp_seq=1 ttl=64/);
  assert.match(r, /\n--- mission\.meridian ping statistics ---\n/);
  // No PTR for the address: the reply is just the address.
  assert.match(out(sh, "ping -c 1 ns1.meridian"), /^PING ns1\.meridian \(10\.4\.0\.53\) 56\(84\) bytes of data\.\n64 bytes from 10\.4\.0\.53: icmp_seq=1/);
  assert.match(out(sh, "ping -c 1 10.4.0.2"), /\n64 bytes from 10\.4\.0\.2: icmp_seq=1/); // an address isn't looked up
  assert.equal(out(sh, "nc -zv ops.meridian 22"), "nc: connect to ops.meridian (10.4.0.2) port 22 (tcp) failed: Connection refused\n");
  assert.equal(out(sh, "nc -zvn ops.meridian 22"), 'nc: getaddrinfo for host "ops.meridian" port 22: Name or service not known\n');
});

test("A console without the files reads as if it had the usual ones", () => {
  const sh = station({ hosts: null, resolv: null });
  assert.equal(out(sh, "getent hosts meridian"), "127.0.1.1       meridian\n");
  assert.equal(out(sh, "dig +short mission.meridian"), "10.4.0.2\n"); // the network's resolver
});

test("dig and host refuse what they don't do, in so many words", () => {
  const sh = station();
  assert.deepEqual(status(sh, "dig bogus..name"), { output: "dig: 'bogus..name' is not a legal name (empty label)\n", code: 10 });
  assert.equal(out(sh, "dig +trace relay.depot-sync.net"), "dig: +trace isn't supported on this console; dig and dig +short are\n");
  assert.equal(out(sh, "dig depot-sync.net ANY"), "dig: dig ANY isn't supported on this console; try A, CNAME, MX, TXT, PTR or SOA\n");
  assert.equal(out(sh, "dig"), "dig: give dig a name to look up: dig relay.depot-sync.net\n");
  assert.equal(out(sh, "host -a relay.depot-sync.net"), "host: -a isn't supported on this console\n");
  assert.match(out(sh, "host"), /^Usage: host \[-aCdilrTvVw\]/);
});
