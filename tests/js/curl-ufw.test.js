// HTTP and the firewall on the console (#166): curl against the station's
// services, ufw, and `ssh HOST 'COMMAND'` to test the console from outside.
// Expected output is Ubuntu 24.04's: curl 8.5.0 in an ubuntu:24.04 container
// against a small Python HTTP server on a scratch 10.4.0.0/24 network, and ufw
// 0.36.2 in a privileged ubuntu:24.04 container (its rule files are in
// fixtures/, copied from that run). curl's progress meter is left out: the
// console's output always counts as a terminal.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Shell } = require("../../app/static/js/shell.js");

const dir = (owner = "root", mode = 0o755) => ({ type: "dir", mode, owner, group: owner === "root" ? "root" : "crew", contents: "" });
const STATUS_ROUTES = [
  { path: "/", method: "GET", status: 200, headers: { "Content-Type": "application/json" }, body: '{"status":"ok"}\n' },
  { path: "/", method: "POST", status: 201, headers: { "Content-Type": "application/json" }, body: '{"received":7}\n' },
  { path: "/old", method: "GET", status: 301, headers: { Location: "http://10.4.0.20/" }, body: "" },
];
const NETWORK = {
  interfaces: [{ name: "eth0", address: "10.4.0.12/24" }],
  gateway: "10.4.0.254",
  listening: [{ port: 8080, proto: "tcp", process: "python3", address: "0.0.0.0", http: [{ path: "/", method: "GET", status: 200, headers: { "Content-Type": "text/html" }, body: "<h1>relay</h1>\n" }] }],
  connections: [],
  hosts: [
    { name: "status", address: "10.4.0.20", up: true, ping: true, filtered: [], services: [{ port: 80, proto: "tcp", http: STATUS_ROUTES }] },
    { name: "relay", address: "203.0.113.47", up: true, ping: true, filtered: [], services: [{ port: 443, proto: "tcp", tls: "trusted", http: [{ path: "/", method: "GET", status: 200, headers: { "Content-Type": "text/plain" }, body: "FLUSH\n" }] }] },
    { name: "stale", address: "203.0.113.60", up: true, ping: true, filtered: [], services: [{ port: 443, proto: "tcp", tls: "expired", http: [{ path: "/", method: "GET", status: 200, headers: {}, body: "old\n" }] }] },
    { name: "mission", address: "10.4.0.5", up: true, ping: true, filtered: [], login: true, services: [{ port: 22, proto: "tcp" }] },
    { name: "ops", address: "10.4.0.6", up: true, ping: true, filtered: [], services: [{ port: 22, proto: "tcp" }] },
  ],
  dns: { server: "10.4.0.254", records: [
    { name: "status.meridian", type: "A", value: "10.4.0.20", ttl: 300 },
    { name: "relay.depot-sync.net", type: "A", value: "203.0.113.47", ttl: 300 },
    { name: "stale.depot-sync.net", type: "A", value: "203.0.113.60", ttl: 300 },
    { name: "gone.meridian", type: "A", value: "10.4.9.9", ttl: 300 },
    { name: "away.meridian", type: "A", value: "10.4.0.77", ttl: 300 },
    { name: "mission.meridian", type: "A", value: "10.4.0.5", ttl: 300 },
    { name: "ops.meridian", type: "A", value: "10.4.0.6", ttl: 300 },
  ] },
  firewall: { enabled: false, rules: [] },
};
const GROUP = { type: "file", mode: 0o644, owner: "root", group: "root", contents: "root:x:0:\nsudo:x:27:cadet\ncrew:x:1000:\n" };

function station(user = "cadet") {
  return new Shell({
    user, group: user === "root" ? "root" : "crew", groups: ["sudo"], password: "meridian", cwd: user === "root" ? "/root" : "/home/cadet",
    processes: [{ command: "python3 -m http.server 8080", user: "cadet" }],
    network: NETWORK,
    fs: { "/": dir(), "/root": dir("root", 0o700), "/home": dir(), "/home/cadet": dir("cadet"), "/etc": dir(), "/etc/group": GROUP, "/tmp": dir("root", 0o1777) },
  });
}
const out = (sh, line) => sh.run(line).output;
const status = (sh, line) => { const output = out(sh, line); return { output, code: sh.lastStatus }; };
const VERBOSE_GET = "* Host status.meridian:80 was resolved.\n* IPv6: (none)\n* IPv4: 10.4.0.20\n*   Trying 10.4.0.20:80...\n" +
  "* Connected to status.meridian (10.4.0.20) port 80\n> GET / HTTP/1.1\n> Host: status.meridian\n> User-Agent: curl/8.5.0\n> Accept: */*\n> \n" +
  "< HTTP/1.1 200 OK\n< Content-Type: application/json\n< Content-Length: 16\n< \n* Connection #0 to host status.meridian left intact\n{\"status\":\"ok\"}\n";

// --- the scenarios ---------------------------------------------------------------------
test("curl fetches from a station service", () => {
  const sh = station();
  assert.deepEqual(status(sh, "curl -s http://status.meridian/"), { output: '{"status":"ok"}\n', code: 0 });
  assert.equal(out(sh, "curl -sI http://status.meridian/"), "HTTP/1.1 200 OK\nContent-Type: application/json\nContent-Length: 16\n\n");
  assert.equal(out(sh, "curl -s http://status.meridian/ | grep -c ok"), "1\n"); // the body goes down a pipe
});

test("curl -v shows where the request went", () => {
  const sh = station();
  assert.equal(out(sh, "curl -v http://status.meridian/"), VERBOSE_GET);
  const r = out(sh, "curl -v https://relay.depot-sync.net/");
  assert.match(r, /^\* Host relay\.depot-sync\.net:443 was resolved\.\n\* IPv6: \(none\)\n\* IPv4: 203\.0\.113\.47\n\*   Trying 203\.0\.113\.47:443\.\.\.\n\* Connected to relay\.depot-sync\.net \(203\.0\.113\.47\) port 443\n/);
  assert.match(r, /\n\* TLSv1\.3 \(OUT\), TLS handshake, Client hello \(1\):\n/);
  assert.match(r, /\n\*  subject: CN=relay\.depot-sync\.net\n[\s\S]*\n\*  SSL certificate verify ok\.\n\* using HTTP\/1\.x\n> GET \/ HTTP\/1\.1\n> Host: relay\.depot-sync\.net\n/);
  assert.match(r, /\n< HTTP\/1\.1 200 OK\n< Content-Type: text\/plain\n< Content-Length: 6\n< \n\* Connection #0 to host relay\.depot-sync\.net left intact\nFLUSH\n$/);
});

test("curl's failures are curl's real errors", () => {
  const sh = station();
  assert.deepEqual(status(sh, "curl -sS http://nowhere.invalid/"), { output: "curl: (6) Could not resolve host: nowhere.invalid\n", code: 6 });
  assert.deepEqual(status(sh, "curl -sS http://status.meridian:8080/"), { output: "curl: (7) Failed to connect to status.meridian port 8080 after 0 ms: Couldn't connect to server\n", code: 7 });
  assert.deepEqual(status(sh, "curl -sS --connect-timeout 3 http://gone.meridian/"), { output: "curl: (28) Failed to connect to gone.meridian port 80 after 3002 ms: Timeout was reached\n", code: 28 });
  // -s alone keeps quiet, and the code still says what happened.
  assert.deepEqual(status(sh, "curl -s http://nowhere.invalid/"), { output: "", code: 6 });
  assert.deepEqual(status(sh, "curl -s http://status.meridian:8080/"), { output: "", code: 7 });
});

test("The firewall blocks what's listening", () => {
  const sh = station();
  const fromMission = "ssh mission.meridian 'nc -zv -w 3 10.4.0.12 8080'";
  assert.equal(out(sh, fromMission), "Connection to 10.4.0.12 8080 port [tcp/http-alt] succeeded!\n"); // ufw is off, as on a fresh server
  sh.run("sudo ufw enable"); sh.run("meridian"); sh.run("y");
  assert.match(out(sh, "ss -tln"), /0\.0\.0\.0:8080 /); // still listening
  assert.deepEqual(status(sh, fromMission), { output: "nc: connect to 10.4.0.12 port 8080 (tcp) timed out: Operation now in progress\n", code: 1 });
  assert.equal(out(sh, "sudo ufw allow 8080/tcp"), "Rule added\nRule added (v6)\n");
  assert.deepEqual(status(sh, fromMission), { output: "Connection to 10.4.0.12 8080 port [tcp/http-alt] succeeded!\n", code: 0 });
});

// --- the rest of curl ---------------------------------------------------------------------
test("curl follows redirects, sends data, writes files and reports with -w", () => {
  const sh = station();
  assert.equal(out(sh, "curl -sI http://status.meridian/old"), "HTTP/1.1 301 Moved Permanently\nLocation: http://10.4.0.20/\nContent-Length: 0\n\n");
  assert.equal(out(sh, "curl -sL http://status.meridian/old"), '{"status":"ok"}\n');
  assert.equal(out(sh, "curl -sIL http://status.meridian/old"),
    "HTTP/1.1 301 Moved Permanently\nLocation: http://10.4.0.20/\nContent-Length: 0\n\nHTTP/1.1 200 OK\nContent-Type: application/json\nContent-Length: 16\n\n");
  assert.equal(out(sh, "curl -s -w '%{http_code} %{url_effective}\\n' -o /dev/null -L http://status.meridian/old"), "200 http://10.4.0.20/\n");
  assert.equal(out(sh, "curl -s http://status.meridian/nope"), "Not Found\n");
  assert.equal(out(sh, "curl -s -o /dev/null -w '%{http_code}\\n' http://status.meridian/nope"), "404\n");
  assert.deepEqual(status(sh, "curl -sf http://status.meridian/nope"), { output: "", code: 22 });
  assert.equal(out(sh, "curl -v -X POST -H 'Content-Type: application/json' -d '{\"a\":1}' http://status.meridian/"),
    "Note: Unnecessary use of -X or --request, POST is already inferred.\n" + VERBOSE_GET
      .replace("> GET / HTTP/1.1", "> POST / HTTP/1.1").replace("> Accept: */*\n", "> Accept: */*\n> Content-Type: application/json\n> Content-Length: 7\n")
      .replace("200 OK", "201 Created").replace("Content-Length: 16", "Content-Length: 15").replace('{"status":"ok"}', '{"received":7}'));
  assert.equal(out(sh, "curl -s -o /tmp/page.json http://status.meridian/; cat /tmp/page.json"), '{"status":"ok"}\n');
  assert.equal(out(sh, "curl -s localhost:8080"), "<h1>relay</h1>\n"); // the console's own server
});

test("curl's other ways to fail: timeouts, no route, certificates", () => {
  const sh = station();
  assert.equal(out(sh, "curl -sS -m 3 http://gone.meridian/"), "curl: (28) Connection timed out after 3004 milliseconds\n");
  assert.equal(out(sh, "curl -sv --connect-timeout 3 http://gone.meridian/"),
    "* Host gone.meridian:80 was resolved.\n* IPv6: (none)\n* IPv4: 10.4.9.9\n*   Trying 10.4.9.9:80...\n* ipv4 connect timeout after 2999ms, move on!\n" +
    "* Failed to connect to gone.meridian port 80 after 3002 ms: Timeout was reached\n* Closing connection\n");
  assert.match(out(sh, "curl -sv http://status.meridian:8080/"), /\n\* connect to 10\.4\.0\.20 port 8080 from 10\.4\.0\.12 port \d+ failed: Connection refused\n\* Failed to connect to status\.meridian port 8080 after 0 ms: Couldn't connect to server\n\* Closing connection\n$/);
  assert.match(out(sh, "curl -sS http://away.meridian/"), /^curl: \(7\) Failed to connect to away\.meridian port 80 after \d+ ms: Couldn't connect to server\n$/);
  const before = sh.clock;
  assert.match(out(sh, "curl -sS http://gone.meridian/"), /^curl: \(28\) Failed to connect to gone\.meridian port 80 after 134\d{3} ms: Couldn't connect to server\n$/);
  assert.equal(sh.clock - before, 134 + 1); // the kernel's SYN retries, as nc's
  assert.equal(status(sh, "curl -sS https://stale.depot-sync.net/").code, 60);
  assert.match(out(sh, "curl -sS https://stale.depot-sync.net/"), /^curl: \(60\) SSL certificate problem: certificate has expired\nMore details here: https:\/\/curl\.se\/docs\/sslcerts\.html\n/);
  assert.equal(out(sh, "curl -sk https://stale.depot-sync.net/"), "old\n");
  assert.equal(status(sh, "curl -sS https://203.0.113.47/").code, 60); // by address: the certificate names a host
  assert.equal(status(sh, "curl -sS https://status.meridian/").code, 7); // nothing on 443 there
  assert.equal(out(sh, "curl --compressed http://status.meridian/"), "curl: option --compressed isn't supported on this console; try curl --help\n");
});

// --- ufw ------------------------------------------------------------------------------------
test("ufw needs root, starts off, and keeps its state in its files", () => {
  const sh = station();
  assert.deepEqual(status(sh, "ufw status"), { output: "ERROR: You need to be root to run this script\n", code: 1 });
  sh.run("sudo -k");
  assert.equal(sh.run("sudo ufw status").output, "");
  assert.equal(out(sh, "meridian"), "Status: inactive\n");
  assert.equal(out(sh, "sudo ufw allow 22/tcp"), "Rules updated\nRules updated (v6)\n"); // off: only the files change
  assert.equal(out(sh, "sudo ufw allow 22/tcp"), "Skipping adding existing rule\nSkipping adding existing rule (v6)\n");
  assert.equal(out(sh, "sudo grep ENABLED /etc/ufw/ufw.conf"), "ENABLED=no\n");
  assert.equal(out(sh, "cat /etc/ufw/user.rules"), "cat: /etc/ufw/user.rules: Permission denied\n"); // root's, as on Ubuntu
  sh.run("sudo ufw enable");
  assert.equal(out(sh, "n"), "Aborted\n");
  sh.run("sudo ufw enable");
  assert.equal(out(sh, "y"), "Firewall is active and enabled on system startup\n");
  assert.equal(out(sh, "sudo grep ENABLED /etc/ufw/ufw.conf"), "ENABLED=yes\n");
  assert.equal(out(sh, "sudo ufw disable"), "Firewall stopped and disabled on system startup\n");
});

test("ufw writes its rule files as ufw does", () => {
  const sh = station("root");
  ["allow 22/tcp", "allow 8080", "allow 53/udp", "allow from 10.4.0.5", "allow from 10.4.0.5 to any port 9000 proto tcp",
    "deny 3000/tcp", "allow from 10.4.0.0/24 to any port 3000"].forEach((r) => sh.run("ufw " + r));
  const fixture = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
  assert.equal(sh.fs["/etc/ufw/user.rules"].contents, fixture("ufw-user.rules"));
  assert.equal(sh.fs["/etc/ufw/user6.rules"].contents, fixture("ufw-user6.rules"));
});

test("ufw status lays out the rules as ufw does", () => {
  const sh = station("root");
  sh.run("ufw enable"); sh.run("y");
  ["allow 22/tcp", "allow 8080", "allow from 10.4.0.5 to any port 9000 proto tcp", "deny 3000"].forEach((r) => sh.run("ufw " + r));
  const pad = (to, action, from) => to.padEnd(27) + action.padEnd(12) + from.padEnd(26) + "\n";
  assert.equal(out(sh, "ufw status"), "Status: active\n\n" + "To".padEnd(27) + "Action".padEnd(12) + "From\n" + "--".padEnd(27) + "------".padEnd(12) + "----\n" +
    pad("22/tcp", "ALLOW", "Anywhere") + pad("8080", "ALLOW", "Anywhere") + pad("9000/tcp", "ALLOW", "10.4.0.5") + pad("3000", "DENY", "Anywhere") +
    pad("22/tcp (v6)", "ALLOW", "Anywhere (v6)") + pad("8080 (v6)", "ALLOW", "Anywhere (v6)") + pad("3000 (v6)", "DENY", "Anywhere (v6)") + "\n");
  assert.match(out(sh, "ufw status verbose"), /^Status: active\nLogging: on \(low\)\nDefault: deny \(incoming\), allow \(outgoing\), deny \(routed\)\nNew profiles: skip\n\nTo {25}Action {6}From\n/);
  assert.match(out(sh, "ufw status numbered"), /\n {5}To {25}Action {6}From\n {5}-- {25}------ {6}----\n\[ 1\] 22\/tcp {21}ALLOW IN {4}Anywhere {18}\n/);
  sh.run("ufw delete 3");
  assert.equal(out(sh, "y"), "Rule deleted\n");
  assert.equal(out(sh, "ufw delete allow 8080"), "Rule deleted\nRule deleted (v6)\n");
  assert.equal(out(sh, "ufw delete allow 9999/tcp"), "Could not delete non-existent rule\nCould not delete non-existent rule (v6)\n");
  assert.deepEqual(status(sh, "ufw delete 9"), { output: "ERROR: Could not find rule '9'\n", code: 1 });
  assert.deepEqual(status(sh, "ufw allow 70000"), { output: "ERROR: Bad port\n", code: 1 });
  assert.deepEqual(status(sh, "ufw allow bogus"), { output: "ERROR: Could not find a profile matching 'bogus'\n", code: 1 });
  assert.match(out(sh, "ufw frob"), /^ERROR: Invalid syntax\n\nUsage: ufw COMMAND\n/);
});

test("ufw rules: first match wins, a source narrows a rule, and ping gets in", () => {
  const sh = station();
  sh.run("sudo ufw enable"); sh.run("meridian"); sh.run("y");
  sh.run("sudo ufw allow from 10.4.0.5 to any port 8080 proto tcp");
  assert.match(out(sh, "ssh mission.meridian 'nc -zv -w 3 10.4.0.12 8080'"), /succeeded!/);
  assert.equal(out(sh, "ssh mission.meridian 'curl -s http://10.4.0.12:8080/'"), "<h1>relay</h1>\n");
  assert.match(out(sh, "ssh mission.meridian 'nc -zv -w 3 10.4.0.12 22'"), /timed out/); // no rule for ssh: the classic lockout
  assert.match(out(sh, "ssh mission.meridian 'ping -c 1 10.4.0.12'"), /1 received, 0% packet loss/);
  assert.match(out(sh, "nc -zv 10.4.0.12 8080"), /succeeded!/); // the firewall is for connections in from elsewhere
});

// --- ssh HOST 'COMMAND' -------------------------------------------------------------------------
test("ssh runs one command on a host that has your key", () => {
  const sh = station();
  assert.equal(out(sh, "ssh mission.meridian 'hostname; hostname -I'"), "mission\n10.4.0.5 \n");
  assert.deepEqual(status(sh, "ssh ops.meridian 'true'"), { output: "cadet@ops.meridian: Permission denied (publickey).\n", code: 255 });
  assert.deepEqual(status(sh, "ssh mission 'true'"), { output: "ssh: Could not resolve hostname mission: Name or service not known\n", code: 255 });
  assert.deepEqual(status(sh, "ssh 10.4.0.99 'true'"), { output: "ssh: connect to host 10.4.0.99 port 22: No route to host\n", code: 255 });
  assert.deepEqual(status(sh, "ssh status.meridian 'true'"), { output: "ssh: connect to host status.meridian port 22: Connection refused\n", code: 255 });
  assert.deepEqual(status(sh, "ssh mission.meridian 'ls'"), { output: "bash: line 1: ls: command not found\n", code: 127 });
  assert.equal(out(sh, "ssh mission.meridian"), "ssh: this console runs one command on another machine: ssh mission.meridian 'COMMAND'\n");
  // From there, names come from DNS: the console's /etc/hosts is the console's.
  assert.match(out(sh, "ssh mission.meridian 'curl -sS http://status.meridian/'"), /"status":"ok"/);
});
