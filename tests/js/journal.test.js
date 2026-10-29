// The journal on the console (#304): journalctl over the exercise's entries
// and the lines systemd writes as units start, stop and fail, and the tail of
// `systemctl status`. Expected output is journald's from systemd 255.4 on
// Ubuntu 24.04, booted as PID 1 in a privileged ubuntu:24.04 container with
// units like these (its hostname set to meridian). The boot separator is
// systemd's `-- Boot ID --`: a container shares its host's boot, so that
// one line comes from systemd's source, not a run.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell } = require("../../app/static/js/shell.js");

const dir = () => ({ type: "dir", mode: 0o755, owner: "root", group: "root", contents: "" });
const file = (contents, mode = 0o644) => ({ type: "file", mode, owner: "root", group: "root", contents });

const SCRUBBERD = "[Unit]\nDescription=Scrubber controller\n\n[Service]\nExecStart=/usr/local/sbin/scrubberd\n\n[Install]\nWantedBy=multi-user.target\n";
const CRASHY = "[Unit]\nDescription=O2 monitor\n\n[Service]\nExecStart=/usr/local/sbin/o2-monitor\n";

// The outage night, as Unit 1.5's last module will have it (docs/story.md).
const NIGHT = [
  { time: "2026-10-08T02:11:04", identifier: "sshd", pid: 4412, unit: "ssh.service", priority: "info", message: "Failed password for md-3 from 10.4.2.17 port 50122 ssh2" },
  { time: "2026-10-08T02:35:01", identifier: "CRON", pid: 5120, unit: "cron.service", priority: "info", message: "(root) CMD (/usr/local/sbin/scrubber-flush >/dev/null 2>&1)" },
  { time: "2026-10-08T02:35:02", identifier: "scrubber-flush", pid: 5121, unit: "cron.service", priority: "notice", message: "sending controller state to 203.0.113.47" },
  { time: "2026-10-08T02:39:58", identifier: "scrubber-flush", pid: 5121, unit: "cron.service", priority: "warning", message: "reply: FLUSH" },
  { time: "2026-10-08T02:40:00", identifier: "systemd", pid: 1, unit: "scrubberd.service", priority: "info", message: "Stopping scrubberd.service - Scrubber controller..." },
  { time: "2026-10-08T02:40:01", identifier: "systemd", pid: 1, unit: "scrubberd.service", priority: "info", message: "Stopped scrubberd.service - Scrubber controller." },
  { time: "2026-10-08T02:52:30", identifier: "sshd", pid: 4420, unit: "ssh.service", priority: "info", message: "Accepted publickey for okafor from 10.4.0.5 port 50300 ssh2" },
];

function spec(extra = {}) {
  return {
    user: "root", group: "root", cwd: "/root", password: "meridian",
    services: [{ name: "scrubberd.service", state: "active", exits: null, runs_for: 0 }, ...(extra.services || [])],
    journal: extra.journal || NIGHT,
    fs: {
      "/": dir(), "/root": dir(), "/tmp": { ...dir(), mode: 0o1777 },
      "/etc": dir(), "/etc/systemd": dir(), "/etc/systemd/system": dir(),
      "/etc/group": file("root:x:0:\nadm:x:4:\nsudo:x:27:cadet\ncrew:x:1000:\n"),
      "/etc/passwd": file("root:x:0:0:root:/root:/bin/bash\ncadet:x:1000:1000:Cadet:/home/cadet:/bin/bash\n"),
      "/usr": dir(), "/usr/lib": dir(), "/usr/lib/systemd": dir(), "/usr/lib/systemd/system": dir(),
      "/usr/lib/systemd/system/scrubberd.service": file(SCRUBBERD),
      "/usr/local": dir(), "/usr/local/sbin": dir(),
      "/usr/local/sbin/scrubberd": file("#!/bin/bash\n", 0o755),
      "/usr/local/sbin/o2-monitor": file("#!/bin/bash\n", 0o755),
      ...(extra.fs || {}),
    },
    ...(extra.top || {}),
  };
}
const run = (sh, line) => sh.run(line).output;

test("journalctl reads one unit in a time window", () => {
  const sh = new Shell(spec());
  assert.equal(run(sh, 'journalctl -u scrubberd --since "2026-10-08 02:30" --until "2026-10-08 02:45"'),
    "Oct 08 02:40:00 meridian systemd[1]: Stopping scrubberd.service - Scrubber controller...\n" +
    "Oct 08 02:40:01 meridian systemd[1]: Stopped scrubberd.service - Scrubber controller.\n");
  assert.equal(run(sh, 'journalctl --since "2026-10-08 02:30" --until "2026-10-08 02:45" -o cat'),
    "(root) CMD (/usr/local/sbin/scrubber-flush >/dev/null 2>&1)\nsending controller state to 203.0.113.47\nreply: FLUSH\n" +
    "Stopping scrubberd.service - Scrubber controller...\nStopped scrubberd.service - Scrubber controller.\n");
  // The same window, written other ways.
  const window = run(sh, 'journalctl --since "2026-10-08 02:30" --until "2026-10-08 02:45"');
  assert.equal(run(sh, "journalctl --since=2026-10-08T02:30 --until=2026-10-08T02:45"), window);
  assert.equal(run(sh, "journalctl -S 02:30 -U 02:45"), window); // a bare time is today's
  assert.match(run(sh, "journalctl -u cron --since 02:35"), /^Oct 08 02:35:01 meridian CRON\[5120\]: \(root\) CMD/);
});

test("Priority filters work as a ceiling", () => {
  const sh = new Shell(spec());
  assert.equal(run(sh, "journalctl -p warning"), "Oct 08 02:39:58 meridian scrubber-flush[5121]: reply: FLUSH\n");
  assert.equal(run(sh, "journalctl -p 4"), run(sh, "journalctl -p warning"));
  assert.equal(run(sh, "journalctl -p notice -o cat"), "sending controller state to 203.0.113.47\nreply: FLUSH\n");
  assert.equal(run(sh, "journalctl -p notice..notice -o cat"), "sending controller state to 203.0.113.47\n");
  assert.equal(run(sh, "journalctl -p loud"), "Unknown log level loud\n");
  assert.equal(sh.lastStatus, 1);
});

test("The console's own actions are logged", () => {
  const sh = new Shell(spec());
  run(sh, "systemctl restart scrubberd");
  assert.equal(run(sh, "journalctl -u scrubberd -n 3"),
    "Oct 08 09:00:01 meridian systemd[1]: scrubberd.service: Deactivated successfully.\n" +
    "Oct 08 09:00:01 meridian systemd[1]: Stopped scrubberd.service - Scrubber controller.\n" +
    "Oct 08 09:00:01 meridian systemd[1]: Started scrubberd.service - Scrubber controller.\n");
  assert.equal(run(sh, "journalctl -u scrubberd -n 2 -r -o cat"),
    "Started scrubberd.service - Scrubber controller.\nStopped scrubberd.service - Scrubber controller.\n");
});

test("A crash, a restart and the start limit are logged as systemd logs them", () => {
  const sh = new Shell(spec({
    fs: { "/etc/systemd/system/o2-monitor.service": file(CRASHY.replace("[Service]\n", "[Service]\nRestart=on-failure\n")) },
    services: [{ name: "o2-monitor.service", state: "inactive", exits: 1, runs_for: 0 }],
  }));
  run(sh, "systemctl start o2-monitor");
  run(sh, "sleep 10"); // a restart a second (RestartSec's 100ms, on a clock of whole seconds)
  const cat = run(sh, "journalctl -u o2-monitor -o cat").split("\n");
  assert.deepEqual(cat.slice(0, 4), [
    "Started o2-monitor.service - O2 monitor.",
    "o2-monitor.service: Main process exited, code=exited, status=1/FAILURE",
    "o2-monitor.service: Failed with result 'exit-code'.",
    "o2-monitor.service: Scheduled restart job, restart counter is at 1.",
  ]);
  assert.deepEqual(cat.slice(-6), [
    "o2-monitor.service: Failed with result 'exit-code'.",
    "o2-monitor.service: Scheduled restart job, restart counter is at 5.",
    "o2-monitor.service: Start request repeated too quickly.",
    "o2-monitor.service: Failed with result 'exit-code'.",
    "Failed to start o2-monitor.service - O2 monitor.",
    "",
  ]);
  assert.equal(run(sh, "journalctl -u o2-monitor -p err -o cat"), "Failed to start o2-monitor.service - O2 monitor.\n");
});

test("A killed service and a bad user are logged with their status", () => {
  const sh = new Shell(spec());
  run(sh, "kill -9 $(pgrep scrubberd)");
  assert.equal(run(sh, "journalctl -u scrubberd -n 2 -o cat"),
    "scrubberd.service: Main process exited, code=killed, status=9/KILL\nscrubberd.service: Failed with result 'signal'.\n");
  run(sh, "systemctl start scrubberd");
  run(sh, "kill $(pgrep scrubberd)");
  assert.equal(run(sh, "journalctl -u scrubberd -n 1 -o cat"), "scrubberd.service: Deactivated successfully.\n");
  sh.run("cat > /etc/systemd/system/baduser.service <<EOF\n[Service]\nExecStart=/usr/local/sbin/scrubberd\nUser=ghost\nEOF");
  run(sh, "systemctl start baduser");
  assert.match(run(sh, "journalctl -u baduser"),
    /\nOct 08 09:00:\d\d meridian \(crubberd\)\[\d+\]: baduser\.service: Failed to determine user credentials: No such process\n.*status=217\/USER\n/);
});

test("Without sudo you see only your own entries", () => {
  const sh = new Shell(spec({ top: { user: "cadet", group: "crew", groups: ["sudo"], cwd: "/tmp" } }));
  const hint = "Hint: You are currently not seeing messages from other users and the system.\n" +
    "      Users in groups 'adm', 'systemd-journal' can see all messages.\n      Pass -q to turn off this notice.\n";
  assert.equal(run(sh, "journalctl -u scrubberd"), hint + "No journal files were opened due to insufficient permissions.\n");
  assert.equal(sh.lastStatus, 1);
  assert.equal(run(sh, "journalctl -q"), "No journal files were opened due to insufficient permissions.\n");
  // systemctl status leaves the log lines off, and says nothing about it.
  assert.doesNotMatch(run(sh, "systemctl status scrubberd"), /systemd\[1\]/);
  sh.run("sudo journalctl -u scrubberd -o cat");
  assert.match(sh.run("meridian").output, /^Stopping scrubberd\.service/);
});

test("A member of adm reads the whole journal", () => {
  const sh = new Shell(spec({ top: { user: "cadet", group: "crew", groups: ["adm"], cwd: "/tmp" } }));
  assert.match(run(sh, "journalctl -p warning"), /reply: FLUSH/);
});

test("systemctl status shows the latest log lines", () => {
  const sh = new Shell(spec());
  const status = run(sh, "systemctl status scrubberd");
  assert.match(status, /\n\nOct 08 08:00:00 meridian systemd\[1\]: Started scrubberd\.service - Scrubber controller\.\n$/);
  // The outage's lines are from before this run of the service, so they're not here.
  assert.doesNotMatch(status, /02:40/);
  run(sh, "systemctl restart scrubberd");
  assert.match(run(sh, "systemctl status scrubberd"), /\n\nOct 08 09:00:\d\d meridian systemd\[1\]: Started scrubberd\.service - Scrubber controller\.\n$/);
  run(sh, "systemctl stop scrubberd");
  assert.match(run(sh, "systemctl status scrubberd -n 2"),
    /\n\n[^\n]*Deactivated successfully\.\n[^\n]*Stopped scrubberd\.service - Scrubber controller\.\n$/);
  assert.doesNotMatch(run(sh, "systemctl status scrubberd -n 0"), /\n\n/);
});

// Which lines status shows, as systemd 255 picks them (#335): the unit's lines
// of this boot, from when it last left inactive or failed. Checked in sysref
// and in v255's show_journal_by_unit (this boot only, from InactiveExitTimestamp).
const MONITOR = { "/etc/systemd/system/o2-monitor.service": file(CRASHY) };
const monitorLine = (time, message) => ({ time, identifier: "o2-monitor", pid: 700, unit: "o2-monitor.service", priority: "info", message });

test("An inactive unit's status shows this boot's lines, with no since", () => {
  const journal = Array.from({ length: 11 }, (_, i) => monitorLine(`2026-10-08T08:${String(10 + i).padStart(2, "0")}:00`, `sample ${i + 1}`));
  const sh = new Shell(spec({ fs: MONITOR, services: [{ name: "o2-monitor.service", state: "inactive", exits: null, runs_for: 0 }], journal }));
  const status = run(sh, "systemctl status o2-monitor").split("\n");
  assert.equal(status[2], "     Active: inactive (dead)");
  assert.equal(status[3], "");
  assert.deepEqual(status.slice(4, -1), journal.slice(1).map((e) => `Oct 08 ${e.time.slice(11)} meridian o2-monitor[700]: ${e.message}`));
});

test("Lines from the previous boot are never in status", () => {
  const journal = [monitorLine("2026-10-08T02:30:00", "sample before the outage")];
  const sh = new Shell(spec({ fs: MONITOR, services: [{ name: "o2-monitor.service", state: "inactive", exits: null, runs_for: 0 }], journal }));
  assert.equal(run(sh, "systemctl status o2-monitor"),
    "○ o2-monitor.service - O2 monitor\n" +
    "     Loaded: loaded (/etc/systemd/system/o2-monitor.service; static)\n" +
    "     Active: inactive (dead)\n");
  assert.equal(run(sh, "journalctl -u o2-monitor -b -1 -o cat"), "sample before the outage\n");
});

test("Status shows a unit's lines from its last start on", () => {
  const sh = new Shell(spec({ fs: MONITOR, services: [{ name: "o2-monitor.service", state: "inactive", exits: null, runs_for: 0 }] }));
  run(sh, "systemctl start o2-monitor");
  run(sh, "systemctl stop o2-monitor");
  run(sh, "systemctl start o2-monitor");
  const lines = run(sh, "systemctl status o2-monitor").split("\n\n")[1];
  assert.equal(lines, "Oct 08 09:00:03 meridian systemd[1]: Started o2-monitor.service - O2 monitor.\n");
});

test("A service waiting to restart shows no lines, then lines from the restart", () => {
  const unit = CRASHY.replace("[Service]\n", "[Service]\nRestart=on-failure\nRestartSec=5\n");
  const sh = new Shell(spec({
    fs: { "/etc/systemd/system/o2-monitor.service": file(unit) },
    services: [{ name: "o2-monitor.service", state: "inactive", exits: 1, runs_for: 2 }],
  }));
  run(sh, "systemctl start o2-monitor"); // 09:00:01, crashes at 09:00:03, restarts at 09:00:08
  run(sh, "sleep 2");
  const waiting = run(sh, "systemctl status o2-monitor");
  assert.match(waiting, /Active: activating \(auto-restart\) \(Result: exit-code\)/);
  assert.doesNotMatch(waiting, /\n\n/);
  run(sh, "sleep 2"); // status at 09:00:09: running again, until 09:00:10
  assert.equal(run(sh, "systemctl status o2-monitor").split("\n\n")[1],
    "Oct 08 09:00:08 meridian systemd[1]: o2-monitor.service: Scheduled restart job, restart counter is at 1.\n" +
    "Oct 08 09:00:08 meridian systemd[1]: Started o2-monitor.service - O2 monitor.\n");
});

test("-b is this boot, -b -1 the one before, and a plain read marks where they meet", () => {
  const sh = new Shell(spec());
  assert.doesNotMatch(run(sh, "journalctl -b"), /02:40/);
  assert.match(run(sh, "journalctl -b -o cat"), /^Started scrubberd\.service/);
  assert.equal(run(sh, "journalctl -b -1 -u scrubberd -o cat"),
    "Stopping scrubberd.service - Scrubber controller...\nStopped scrubberd.service - Scrubber controller.\n");
  assert.equal(run(sh, "journalctl -u scrubberd"),
    "Oct 08 02:40:00 meridian systemd[1]: Stopping scrubberd.service - Scrubber controller...\n" +
    "Oct 08 02:40:01 meridian systemd[1]: Stopped scrubberd.service - Scrubber controller.\n" +
    "-- Boot 5f1c0e9a2b7d4c3e8a6f1d2b9c4e7a30 --\n" +
    "Oct 08 08:00:00 meridian systemd[1]: Started scrubberd.service - Scrubber controller.\n");
  assert.equal(run(sh, "journalctl -b -2"), "No journal boot entry found from the specified boot offset (-2).\n");
  assert.equal(sh.lastStatus, 1);
});

test("The options people type together work", () => {
  const sh = new Shell(spec());
  assert.equal(run(sh, "journalctl -xeu scrubberd -n 1"), "Oct 08 08:00:00 meridian systemd[1]: Started scrubberd.service - Scrubber controller.\n");
  assert.equal(run(sh, "journalctl --no-pager -n1 -o cat"), "Started scrubberd.service - Scrubber controller.\n");
  assert.equal(run(sh, "journalctl -u nope.service"), "-- No entries --\n");
  assert.equal(sh.lastStatus, 0);
  assert.equal(run(sh, "journalctl --since yesterdayy"), "Failed to parse timestamp: yesterdayy\n");
  assert.match(run(sh, "journalctl -f -n 1"), /^journalctl: -f can't follow on this console; these are the lines so far\n[^\n]*Started scrubberd/);
  assert.match(run(sh, "journalctl _PID=1"), /isn't supported on this console/);
  assert.equal(run(sh, "journalctl --since today -u ssh -o cat"),
    "Failed password for md-3 from 10.4.2.17 port 50122 ssh2\nAccepted publickey for okafor from 10.4.0.5 port 50300 ssh2\n");
  assert.equal(run(sh, "journalctl --since -2h -o cat"), "Started scrubberd.service - Scrubber controller.\n");
  // 02:00 to 03:00: the whole night.
  assert.equal(run(sh, "journalctl --since '7h ago' --until '6h ago' -o cat"), NIGHT.map((e) => e.message + "\n").join(""));
});

test("journalctl has a manual page and a line in help", () => {
  const sh = new Shell(spec());
  assert.match(run(sh, "journalctl --help"), /journalctl \[-u UNIT\]/);
  assert.match(run(sh, "help"), /services: +systemctl journalctl\n/);
});
