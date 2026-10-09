// The console's small awk and sed (#41).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell } = require("../../app/static/js/shell.js");
const exercises = require("./fixtures/exercises.json");

const access = [
  '10.0.0.1 - - [08/Oct/2026:02:00:01 +0000] "GET /status HTTP/1.1" 200 512',
  '10.0.0.2 - - [08/Oct/2026:02:00:02 +0000] "POST /login HTTP/1.1" 500 128',
  '10.0.0.1 - - [08/Oct/2026:02:00:03 +0000] "GET /reactor HTTP/1.1" 503 64',
  '10.0.0.3 - - [08/Oct/2026:02:00:04 +0000] "GET /status HTTP/1.1" 404 0',
].join("\n") + "\n";

function station() {
  const d = (owner = "cadet") => ({ type: "dir", mode: 0o755, owner, group: owner === "root" ? "root" : "crew", contents: "" });
  const f = (contents, owner = "cadet", mode = 0o644) => ({ type: "file", mode, owner, group: owner === "root" ? "root" : "crew", contents });
  return new Shell({ user: "cadet", group: "crew", cwd: "/home/cadet", fs: {
    "/": d("root"), "/home": d("root"), "/home/cadet": d(),
    "/home/cadet/access.log": f(access),
    "/home/cadet/app.conf": f("level = debug\n# debug output goes to /var/log\nport = 8080\n"),
    "/etc": d("root"), "/etc/passwd": f("root:x:0:0:root:/root:/bin/bash\ncadet:x:1000:1000:Cadet:/home/cadet:/bin/bash\n", "root"),
    "/etc/locked.conf": f("debug\n", "root"),
  } });
}
const out = (sh, line) => sh.run(line).output;

// --- the scenarios ---------------------------------------------------------------------
test("awk prints fields: the same three lines as the cut pipeline", () => {
  const ex = exercises["text-tools"];
  const sh = new Shell(ex.spec);
  const viaCut = out(sh, "cut -d' ' -f1 /var/log/docking/access.log | sort | uniq -c | sort -rn | head -n 3");
  const viaAwk = out(sh, "awk '{print $1}' /var/log/docking/access.log | sort | uniq -c | sort -rn | head -n 3");
  assert.equal(viaAwk, viaCut);
  assert.equal(viaAwk, "      9 10.4.2.17\n      6 10.4.7.3\n      4 192.168.8.40\n");
});

test("awk filters on a field", () => {
  assert.equal(out(station(), "awk '$9 >= 500 {print $7}' access.log"), "/login\n/reactor\n");
});

test("sed substitutes and edits in place", () => {
  const sh = station();
  assert.equal(out(sh, "sed -i.bak 's/debug/info/g' app.conf"), "");
  assert.equal(out(sh, "cat app.conf"), "level = info\n# info output goes to /var/log\nport = 8080\n");
  assert.equal(out(sh, "cat app.conf.bak"), "level = debug\n# debug output goes to /var/log\nport = 8080\n");
});

test("Unsupported programs say so", () => {
  const sh = station();
  assert.equal(out(sh, "awk '{ total += $10 } END { print total }' access.log"),
    "awk: unsupported on the station console: '+' in '{ total += $10 } END { print total }'\n");
  assert.equal(sh.lastStatus, 2);
  assert.equal(out(sh, "awk '{printf \"%s\\n\", $1}' access.log"),
    "awk: unsupported on the station console: 'printf' (actions can only print) in '{printf \"%s\\n\", $1}'\n");
  assert.equal(out(sh, "sed 'y/abc/xyz/' app.conf"), "sed: unsupported on the station console: the `y' command\n");
  assert.equal(sh.lastStatus, 1);
});

// --- awk --------------------------------------------------------------------------------------
test("awk: -F, NF, NR, $NF, concatenation, string literals", () => {
  const sh = station();
  assert.equal(out(sh, "awk -F: '{print $1, $7}' /etc/passwd"), "root /bin/bash\ncadet /bin/bash\n");
  assert.equal(out(sh, "awk -F : '$3 >= 1000 {print $1}' /etc/passwd"), "cadet\n");
  assert.equal(out(sh, "awk '{print NR \": \" $1, $NF}' access.log | head -n 2"), "1: 10.0.0.1 512\n2: 10.0.0.2 128\n");
  assert.equal(out(sh, "awk '{print NF}' access.log | head -n 1"), "10\n");
  assert.equal(out(sh, "awk '/reactor/' access.log"), access.split("\n")[2] + "\n");
  assert.equal(out(sh, "awk '!/status/ {print $7}' access.log"), "/login\n/reactor\n");
  assert.equal(out(sh, "awk '$9 ~ /^5/ && $1 == \"10.0.0.1\" {print $7}' access.log"), "/reactor\n");
  assert.equal(out(sh, "awk 'BEGIN {print \"start\"} END {print NR \" lines\"}' access.log"), "start\n4 lines\n");
  assert.equal(out(sh, "echo '  padded   words  ' | awk '{print $2}'"), "words\n");
});

test("awk compares numerically only when both sides are numbers", () => {
  const sh = station();
  assert.equal(out(sh, "echo 'b 10' | awk '$2 > 9 {print \"num\"}'"), "num\n"); // 10 > 9 as numbers
  assert.equal(out(sh, "echo 'b 10' | awk '$1 > \"a\" {print \"str\"}'"), "str\n");
});

// --- sed --------------------------------------------------------------------------------------
test("sed: first match vs every match, &, groups, other delimiters", () => {
  const sh = station();
  assert.equal(out(sh, "echo 'a a a' | sed 's/a/b/'"), "b a a\n");
  assert.equal(out(sh, "echo 'a a a' | sed 's/a/b/g'"), "b b b\n");
  assert.equal(out(sh, "echo 'port 8080' | sed 's/[0-9]*$/[&]/'"), "port [8080]\n");
  assert.equal(out(sh, "echo 'key=value' | sed 's/\\(.*\\)=\\(.*\\)/\\2=\\1/'"), "value=key\n");
  assert.equal(out(sh, "echo 'key=value' | sed -E 's/(.*)=(.*)/\\2=\\1/'"), "value=key\n");
  assert.equal(out(sh, "echo /var/log | sed 's|/var|/srv|'"), "/srv/log\n");
  assert.equal(out(sh, "echo 'a+b' | sed 's/a+b/sum/'"), "sum\n"); // + is literal in BRE
});

test("sed: -n with p, line ranges, $, regex addresses, d and q", () => {
  const sh = station();
  sh.run("echo one > n.txt; echo two >> n.txt; echo three >> n.txt; echo four >> n.txt");
  assert.equal(out(sh, "sed -n '2,3p' n.txt"), "two\nthree\n");
  assert.equal(out(sh, "sed -n '$p' n.txt"), "four\n");
  assert.equal(out(sh, "sed '/t/d' n.txt"), "one\nfour\n");
  assert.equal(out(sh, "sed 2q n.txt"), "one\ntwo\n");
  assert.equal(out(sh, "sed -n '/two/,/three/p' n.txt"), "two\nthree\n");
  assert.equal(out(sh, "sed -e 's/one/1/' -e 's/two/2/' n.txt | head -n 2"), "1\n2\n");
  assert.equal(out(sh, "sed -n 's/o/0/gp' n.txt"), "0ne\ntw0\nf0ur\n");
});

test("sed -i needs permission to write, and without a suffix keeps no backup", () => {
  const sh = station();
  assert.match(out(sh, "sed -i 's/debug/info/' /etc/locked.conf"), /^sed: couldn't open temporary file \/etc\/sedXXXXXX: Permission denied\n$/);
  assert.equal(out(sh, "cat /etc/locked.conf"), "debug\n");
  sh.run("sed -i 's/port = 8080/port = 9090/' app.conf");
  assert.equal(out(sh, "ls"), "access.log  app.conf\n");
  assert.equal(out(sh, "grep port app.conf"), "port = 9090\n");
});
