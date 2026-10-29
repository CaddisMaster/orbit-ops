// systemd on the console (#303): systemctl over unit files, enabling as links
// in .wants/, services as processes, Restart=, daemon-reload and timers.
// Expected output is systemd 255.4 on Ubuntu 24.04, booted as PID 1 in a
// privileged ubuntu:24.04 container, with units like these. The real one's
// hostname, cgroup paths, memory and CPU figures differ run to run; the
// console prints fixed ones.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell, passes } = require("../../app/static/js/shell.js");

const dir = () => ({ type: "dir", mode: 0o755, owner: "root", group: "root", contents: "" });
const file = (contents, mode = 0o644) => ({ type: "file", mode, owner: "root", group: "root", contents });
const link = (target) => ({ type: "link", mode: 0o777, owner: "root", group: "root", contents: "", target });

const SCRUBBERD = "[Unit]\nDescription=Scrubber controller\nAfter=network.target\n\n[Service]\nExecStart=/usr/local/sbin/scrubberd\nUser=scrubber\n\n[Install]\nWantedBy=multi-user.target\n";
const BACKUP = "[Unit]\nDescription=O2 backup feed\n\n[Service]\nExecStart=/usr/local/sbin/o2-backupd\n\n[Install]\nWantedBy=multi-user.target\n";
const RECYCLER = "[Unit]\nDescription=Water recycler\n\n[Service]\nExecStart=/usr/local/sbin/recyclerd --loop\n\n[Install]\nWantedBy=multi-user.target\n";
const SAMPLE = "[Unit]\nDescription=Air sample\n\n[Service]\nType=oneshot\nExecStart=/usr/local/sbin/air-sample\n";
const SAMPLE_TIMER = "[Unit]\nDescription=Air sample every night\n\n[Timer]\nOnCalendar=*-*-* 03:00:00\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n";

// The starting filesystem as schema/terminal/exercise.py starting_fs lays it out.
function spec(extra = {}) {
  const fs = {
    "/": dir(), "/etc": dir(), "/etc/systemd": dir(), "/etc/systemd/system": dir(),
    "/etc/systemd/system/multi-user.target.wants": dir(),
    "/etc/systemd/system/multi-user.target.wants/scrubberd.service": link("/usr/lib/systemd/system/scrubberd.service"),
    "/etc/systemd/system/air-sample.service": file(SAMPLE),
    "/etc/systemd/system/air-sample.timer": file(SAMPLE_TIMER),
    "/etc/passwd": file("root:x:0:0:root:/root:/bin/bash\nscrubber:x:990:990::/var/lib/scrubber:/usr/sbin/nologin\ncadet:x:1000:1000:Cadet:/home/cadet:/bin/bash\n"),
    "/etc/group": file("root:x:0:\nsudo:x:27:cadet\nscrubber:x:990:\ncrew:x:1000:\n"),
    "/usr": dir(), "/usr/lib": dir(), "/usr/lib/systemd": dir(), "/usr/lib/systemd/system": dir(),
    "/usr/lib/systemd/system/scrubberd.service": file(SCRUBBERD),
    "/usr/lib/systemd/system/o2-backup.service": file(BACKUP),
    "/usr/lib/systemd/system/recycler.service": file(RECYCLER),
    "/usr/local": dir(), "/usr/local/sbin": dir(),
    "/usr/local/sbin/scrubberd": file("#!/bin/bash\n", 0o755),
    "/usr/local/sbin/o2-backupd": file("#!/bin/bash\n", 0o755),
    "/usr/local/sbin/recyclerd": file("#!/bin/bash\n", 0o755),
    "/usr/local/sbin/air-sample": file("#!/bin/bash\n", 0o755),
    "/usr/local/sbin/o2-monitor": file("#!/bin/bash\n", 0o755),
    "/tmp": { type: "dir", mode: 0o1777, owner: "root", group: "root", contents: "" },
    "/home": dir(), "/home/cadet": { type: "dir", mode: 0o755, owner: "cadet", group: "crew", contents: "" },
    ...(extra.fs || {}),
  };
  return {
    user: "root", group: "root", cwd: "/home/cadet", password: "meridian",
    services: [
      { name: "scrubberd.service", state: "active", exits: null, runs_for: 0 },
      { name: "o2-backup.service", state: "inactive", exits: null, runs_for: 0 },
      { name: "recycler.service", state: "failed", exits: 1, runs_for: 0 },
      { name: "air-sample.service", state: "inactive", exits: null, runs_for: 0 },
      { name: "air-sample.timer", state: "active", exits: null, runs_for: 0 },
      ...(extra.services || []),
    ],
    fs,
    ...(extra.top || {}),
  };
}
function run(sh, line) {
  const r = sh.run(line);
  return r.output;
}

test("systemctl shows what is running and what failed", () => {
  const sh = new Shell(spec());
  assert.equal(run(sh, "systemctl status scrubberd"),
    "● scrubberd.service - Scrubber controller\n" +
    "     Loaded: loaded (/usr/lib/systemd/system/scrubberd.service; enabled; preset: enabled)\n" +
    "     Active: active (running) since Thu 2026-10-08 08:00:00 UTC; 1h 0min ago\n" +
    "   Main PID: 600 (scrubberd)\n" +
    "      Tasks: 1 (limit: 2275)\n" +
    "     Memory: 1.2M (peak: 1.6M)\n" +
    "        CPU: 12ms\n" +
    "     CGroup: /system.slice/scrubberd.service\n" +
    "             └─600 /usr/local/sbin/scrubberd\n\n" +
    "Oct 08 08:00:00 meridian systemd[1]: Started scrubberd.service - Scrubber controller.\n");
  assert.equal(sh.lastStatus, 0);
  assert.equal(run(sh, "systemctl status o2-backup.service"),
    "○ o2-backup.service - O2 backup feed\n" +
    "     Loaded: loaded (/usr/lib/systemd/system/o2-backup.service; disabled; preset: enabled)\n" +
    "     Active: inactive (dead)\n");
  assert.equal(sh.lastStatus, 3);
  assert.equal(run(sh, "systemctl status recycler"),
    "× recycler.service - Water recycler\n" +
    "     Loaded: loaded (/usr/lib/systemd/system/recycler.service; disabled; preset: enabled)\n" +
    "     Active: failed (Result: exit-code) since Thu 2026-10-08 08:00:00 UTC; 1h 0min ago\n" +
    "   Duration: 2ms\n" +
    "   Main PID: 623 (code=exited, status=1/FAILURE)\n" +
    "        CPU: 2ms\n\n" +
    "Oct 08 08:00:00 meridian systemd[1]: Started recycler.service - Water recycler.\n" +
    "Oct 08 08:00:00 meridian systemd[1]: recycler.service: Main process exited, code=exited, status=1/FAILURE\n" +
    "Oct 08 08:00:00 meridian systemd[1]: recycler.service: Failed with result 'exit-code'.\n");
  assert.equal(sh.lastStatus, 3);
  assert.equal(run(sh, "systemctl list-units --type=service --failed"),
    "  UNIT             LOAD   ACTIVE SUB    DESCRIPTION\n" +
    "● recycler.service loaded failed failed Water recycler\n\n" +
    "Legend: LOAD   → Reflects whether the unit definition was properly loaded.\n" +
    "        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.\n" +
    "        SUB    → The low-level unit activation state, values depend on unit type.\n\n" +
    "1 loaded units listed.\n");
  assert.equal(run(sh, "systemctl list-units --type=service"),
    "  UNIT              LOAD   ACTIVE SUB     DESCRIPTION\n" +
    "● recycler.service  loaded failed failed  Water recycler\n" +
    "  scrubberd.service loaded active running Scrubber controller\n\n" +
    "Legend: LOAD   → Reflects whether the unit definition was properly loaded.\n" +
    "        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.\n" +
    "        SUB    → The low-level unit activation state, values depend on unit type.\n\n" +
    "2 loaded units listed. Pass --all to see loaded but inactive units, too.\n" +
    "To show all installed unit files use 'systemctl list-unit-files'.\n");
  assert.match(run(sh, "systemctl list-units --state=inactive"), /air-sample\.service +loaded inactive dead Air sample\n  o2-backup\.service/);
  assert.equal(run(sh, "systemctl list-units --state=failed nothing.service"), "  UNIT LOAD ACTIVE SUB DESCRIPTION\n\n0 loaded units listed.\n");
});

test("A running service is a process ps can see, as its unit's user", () => {
  const sh = new Shell(spec());
  assert.match(run(sh, "ps aux"), /^scrubber +600 .* \/usr\/local\/sbin\/scrubberd$/m);
  assert.equal(run(sh, "pgrep -l scrubberd"), "600 scrubberd\n");
});

test("The is- queries print one word and exit as systemctl does", () => {
  const sh = new Shell(spec());
  const ask = (line) => [run(sh, line), sh.lastStatus];
  assert.deepEqual(ask("systemctl is-active scrubberd"), ["active\n", 0]);
  assert.deepEqual(ask("systemctl is-active o2-backup"), ["inactive\n", 3]);
  assert.deepEqual(ask("systemctl is-active recycler"), ["failed\n", 3]);
  assert.deepEqual(ask("systemctl is-active nope"), ["inactive\n", 4]);
  assert.deepEqual(ask("systemctl is-enabled scrubberd"), ["enabled\n", 0]);
  assert.deepEqual(ask("systemctl is-enabled o2-backup"), ["disabled\n", 1]);
  assert.deepEqual(ask("systemctl is-enabled air-sample.service"), ["static\n", 0]);
  assert.deepEqual(ask("systemctl is-enabled nope"), ["not-found\n", 4]);
  assert.deepEqual(ask("systemctl is-failed recycler"), ["failed\n", 0]);
  assert.deepEqual(ask("systemctl is-failed scrubberd"), ["active\n", 1]);
  assert.deepEqual(ask("systemctl is-active -q scrubberd"), ["", 0]);
});

test("Starting and enabling are different things", () => {
  const sh = new Shell(spec());
  assert.equal(run(sh, "systemctl start o2-backup"), "");
  assert.equal(run(sh, "systemctl is-active o2-backup"), "active\n");
  assert.equal(run(sh, "systemctl is-enabled o2-backup"), "disabled\n");
  assert.equal(run(sh, "systemctl enable o2-backup"),
    "Created symlink /etc/systemd/system/multi-user.target.wants/o2-backup.service → /usr/lib/systemd/system/o2-backup.service.\n");
  assert.equal(run(sh, "systemctl is-enabled o2-backup"), "enabled\n");
  assert.equal(sh.fs["/etc/systemd/system/multi-user.target.wants/o2-backup.service"].target, "/usr/lib/systemd/system/o2-backup.service");
  assert.equal(run(sh, "systemctl enable o2-backup"), ""); // already there: nothing to say
  assert.equal(run(sh, "systemctl disable scrubberd"), 'Removed "/etc/systemd/system/multi-user.target.wants/scrubberd.service".\n');
  assert.equal(run(sh, "systemctl is-active scrubberd"), "active\n"); // disabling doesn't stop it
});

test("enable --now and disable --now change both", () => {
  const sh = new Shell(spec());
  run(sh, "systemctl enable --now o2-backup");
  assert.equal(run(sh, "systemctl is-active o2-backup"), "active\n");
  run(sh, "systemctl disable --now scrubberd");
  assert.equal(run(sh, "systemctl is-active scrubberd"), "inactive\n");
  assert.equal(run(sh, "systemctl is-enabled scrubberd"), "disabled\n");
});

test("A unit with no [Install] can't be enabled, and says why", () => {
  const sh = new Shell(spec());
  const out = run(sh, "systemctl enable air-sample.service");
  assert.match(out, /^The unit files have no installation config \(WantedBy=, RequiredBy=, UpheldBy=,\n/);
  assert.match(out, /instance name specified\.\n$/);
  assert.equal(sh.lastStatus, 0);
});

test("Stopping leaves the unit inactive, with how long it ran", () => {
  const sh = new Shell(spec());
  run(sh, "sleep 30");
  run(sh, "systemctl stop scrubberd");
  assert.equal(run(sh, "systemctl status scrubberd"),
    "○ scrubberd.service - Scrubber controller\n" +
    "     Loaded: loaded (/usr/lib/systemd/system/scrubberd.service; enabled; preset: enabled)\n" +
    "     Active: inactive (dead) since Thu 2026-10-08 09:00:32 UTC; 1s ago\n" +
    "   Duration: 1h 32s\n" +
    "    Process: 600 ExecStart=/usr/local/sbin/scrubberd (code=killed, signal=TERM)\n" +
    "   Main PID: 600 (code=killed, signal=TERM)\n" +
    "        CPU: 2ms\n\n" +
    "Oct 08 08:00:00 meridian systemd[1]: Started scrubberd.service - Scrubber controller.\n" +
    "Oct 08 09:00:32 meridian systemd[1]: Stopping scrubberd.service - Scrubber controller...\n" +
    "Oct 08 09:00:32 meridian systemd[1]: scrubberd.service: Deactivated successfully.\n" +
    "Oct 08 09:00:32 meridian systemd[1]: Stopped scrubberd.service - Scrubber controller.\n");
  assert.doesNotMatch(run(sh, "ps aux"), /scrubberd/);
  run(sh, "systemctl restart scrubberd");
  assert.match(run(sh, "systemctl status scrubberd"), /Active: active \(running\) since Thu 2026-10-08 09:00:35 UTC; 1s ago\n {3}Main PID: \d+ \(scrubberd\)/);
});

test("Changing state needs sudo", () => {
  const sh = new Shell(spec({ top: { user: "cadet", group: "crew", groups: ["sudo"] } }));
  assert.equal(run(sh, "systemctl stop scrubberd"),
    "Failed to stop scrubberd.service: Interactive authentication required.\nSee system logs and 'systemctl status scrubberd.service' for details.\n");
  assert.equal(sh.lastStatus, 1);
  assert.equal(run(sh, "systemctl is-active scrubberd"), "active\n");
  assert.equal(run(sh, "systemctl enable o2-backup"), "Failed to enable unit: Interactive authentication required.\n");
  assert.equal(run(sh, "systemctl daemon-reload"), "Reload daemon failed: Interactive authentication required.\n");
  assert.match(run(sh, "systemctl status scrubberd"), /^● scrubberd\.service/); // reading needs nothing
  sh.run("sudo systemctl stop scrubberd");
  sh.answer("meridian");
  assert.equal(run(sh, "systemctl is-active scrubberd"), "inactive\n");
});

test("Unknown units are refused as systemctl refuses them", () => {
  const sh = new Shell(spec());
  const ask = (line) => [run(sh, line), sh.lastStatus];
  assert.deepEqual(ask("systemctl start nope"), ["Failed to start nope.service: Unit nope.service not found.\n", 5]);
  assert.deepEqual(ask("systemctl stop nope"), ["Failed to stop nope.service: Unit nope.service not loaded.\n", 5]);
  assert.deepEqual(ask("systemctl status nope"), ["Unit nope.service could not be found.\n", 4]);
  assert.deepEqual(ask("systemctl enable nope"), ["Failed to enable unit: Unit file nope.service does not exist.\n", 1]);
  assert.deepEqual(ask("systemctl cat nope"), ["No files found for nope.service.\n", 1]);
  assert.deepEqual(ask("systemctl reload o2-backup"), ["Failed to reload o2-backup.service: Job type reload is not applicable for unit o2-backup.service.\n", 3]);
  assert.deepEqual(ask("systemctl frobnicate"), ["Unknown command verb 'frobnicate'.\n", 1]);
  assert.match(run(sh, "systemctl edit scrubberd"), /isn't supported on this console/);
});

test("An edited unit file needs a daemon-reload", () => {
  const sh = new Shell(spec());
  run(sh, "sed 's/Scrubber controller/Scrubber controller v2/' /usr/lib/systemd/system/scrubberd.service > /tmp/u && cp /tmp/u /usr/lib/systemd/system/scrubberd.service");
  const before = run(sh, "systemctl status scrubberd");
  assert.match(before, /^Warning: The unit file, source configuration file or drop-ins of scrubberd\.service changed on disk\. Run 'systemctl daemon-reload' to reload units\.\n● scrubberd\.service - Scrubber controller\n/);
  assert.match(run(sh, "systemctl cat scrubberd"), /^# Warning: scrubberd\.service changed on disk, the version systemd has loaded is outdated\.\n(# .*\n){3}# \/usr\/lib\/systemd\/system\/scrubberd\.service\n\[Unit\]\nDescription=Scrubber controller v2\n/);
  run(sh, "systemctl daemon-reload");
  const after = run(sh, "systemctl status scrubberd");
  assert.doesNotMatch(after, /Warning/);
  assert.match(after, /^● scrubberd\.service - Scrubber controller v2\n/);
});

test("A changed ExecStart takes effect at the next start, after a reload", () => {
  const sh = new Shell(spec());
  run(sh, "sed -i 's|/usr/local/sbin/o2-backupd|/usr/local/sbin/o2-monitor|' /usr/lib/systemd/system/o2-backup.service");
  run(sh, "systemctl start o2-backup");
  assert.match(run(sh, "ps aux"), /o2-backupd$/m); // the old definition: no reload yet
  run(sh, "systemctl daemon-reload");
  run(sh, "systemctl restart o2-backup");
  assert.match(run(sh, "ps aux"), /o2-monitor$/m);
});

test("cat prints the unit file and its path", () => {
  const sh = new Shell(spec());
  assert.equal(run(sh, "systemctl cat scrubberd"), "# /usr/lib/systemd/system/scrubberd.service\n" + SCRUBBERD);
});

test("The admin's copy in /etc/systemd/system wins over the vendor's", () => {
  const sh = new Shell(spec({ fs: { "/etc/systemd/system/o2-backup.service": file(BACKUP.replace("O2 backup feed", "O2 backup feed (local)")) } }));
  assert.match(run(sh, "systemctl status o2-backup"), /^○ o2-backup\.service - O2 backup feed \(local\)\n {5}Loaded: loaded \(\/etc\/systemd\/system\/o2-backup\.service; disabled/);
  assert.match(run(sh, "systemctl cat o2-backup"), /^# \/etc\/systemd\/system\/o2-backup\.service\n/);
});

test("list-unit-files says enabled, disabled or static", () => {
  const sh = new Shell(spec());
  assert.equal(run(sh, "systemctl list-unit-files --type=service"),
    "UNIT FILE          STATE    PRESET\n" +
    "air-sample.service static   -\n" +
    "o2-backup.service  disabled enabled\n" +
    "recycler.service   disabled enabled\n" +
    "scrubberd.service  enabled  enabled\n\n" +
    "4 unit files listed.\n");
  assert.equal(run(sh, "systemctl list-unit-files air-sample.timer"),
    "UNIT FILE        STATE    PRESET\nair-sample.timer disabled enabled\n\n1 unit files listed.\n");
});

const CRASHY = "[Unit]\nDescription=O2 monitor\n\n[Service]\nExecStart=/usr/local/sbin/o2-monitor\n";

test("Restart=on-failure brings a service back", () => {
  const sh = new Shell(spec({
    fs: {
      "/etc/systemd/system/o2-monitor.service": file(CRASHY.replace("[Service]\n", "[Service]\nRestart=on-failure\nRestartSec=5\n")),
      "/etc/systemd/system/o2-plain.service": file(CRASHY),
    },
    services: [
      { name: "o2-monitor.service", state: "active", exits: 1, runs_for: 600 },
      { name: "o2-plain.service", state: "active", exits: 1, runs_for: 600 },
    ],
  }));
  run(sh, "sleep 4000"); // it crashes at 600s, restarts at 605s, runs again
  assert.equal(run(sh, "systemctl is-active o2-monitor o2-plain"), "active\nfailed\n");
  assert.match(run(sh, "systemctl status o2-plain"),
    /× o2-plain\.service - O2 monitor\n.*\n {5}Active: failed \(Result: exit-code\) since Thu 2026-10-08 08:10:00 UTC; 1h 56min ago\n {3}Duration: 10min\n {3}Main PID: \d+ \(code=exited, status=1\/FAILURE\)\n/);
  // Restarted every 605s (600s running, RestartSec=5): the 13th start was at 10:01.
  assert.match(run(sh, "systemctl status o2-monitor"), /Active: active \(running\) since Thu 2026-10-08 10:01:00 UTC/);
});

test("A program that fails at once hits the start limit and stays failed", () => {
  const sh = new Shell(spec({
    fs: { "/etc/systemd/system/o2-monitor.service": file(CRASHY.replace("[Service]\n", "[Service]\nRestart=on-failure\n")) },
    services: [{ name: "o2-monitor.service", state: "inactive", exits: 1, runs_for: 0 }],
  }));
  run(sh, "systemctl start o2-monitor");
  run(sh, "sleep 3");
  assert.equal(run(sh, "systemctl is-active o2-monitor"), "failed\n");
  assert.match(run(sh, "systemctl status o2-monitor"), /\n {4}Process: \d+ ExecStart=\/usr\/local\/sbin\/o2-monitor \(code=exited, status=1\/FAILURE\)\n/);
});

test("Killing a service's process leaves it inactive (TERM) or failed (KILL)", () => {
  const sh = new Shell(spec());
  run(sh, "kill 600");
  assert.equal(run(sh, "systemctl is-active scrubberd"), "inactive\n");
  run(sh, "systemctl start scrubberd");
  run(sh, "kill -9 $(pgrep scrubberd)");
  assert.equal(run(sh, "systemctl is-active scrubberd"), "failed\n");
  assert.match(run(sh, "systemctl status scrubberd"), /Active: failed \(Result: signal\)[^\n]*\n {3}Duration: \d+s\n {4}Process: \d+ ExecStart=\/usr\/local\/sbin\/scrubberd \(code=killed, signal=KILL\)/);
});

test("A unit the learner writes starts without a reload, and a bad one is refused", () => {
  const sh = new Shell(spec({ services: [{ name: "o2-monitor.service", state: "inactive", exits: null, runs_for: 0 }] }));
  sh.run(`cat > /etc/systemd/system/o2-monitor.service <<EOF
[Unit]
Description=O2 monitor

[Service]
ExecStart=/usr/local/sbin/o2-monitor
User=scrubber

[Install]
WantedBy=multi-user.target
EOF`);
  assert.match(run(sh, "systemctl enable --now o2-monitor"), /^Created symlink \/etc\/systemd\/system\/multi-user\.target\.wants\/o2-monitor\.service → \/etc\/systemd\/system\/o2-monitor\.service\.\n$/);
  assert.match(run(sh, "ps aux"), /^scrubber .* \/usr\/local\/sbin\/o2-monitor$/m);
  sh.run(`cat > /etc/systemd/system/nostart.service <<EOF
[Unit]
Description=No ExecStart
[Service]
User=root
EOF`);
  assert.equal(run(sh, "systemctl start nostart"),
    "Failed to start nostart.service: Unit nostart.service has a bad unit file setting.\nSee system logs and 'systemctl status nostart.service' for details.\n");
  assert.equal(sh.lastStatus, 1);
  assert.equal(run(sh, "systemctl status nostart"),
    "○ nostart.service - No ExecStart\n     Loaded: bad-setting (Reason: Unit nostart.service has a bad unit file setting.)\n     Active: inactive (dead)\n");
});

test("A missing program or user fails the start as systemd does", () => {
  const sh = new Shell(spec());
  sh.run(`cat > /etc/systemd/system/noexec.service <<EOF
[Service]
ExecStart=/usr/local/sbin/missing-prog
EOF`);
  sh.run(`cat > /etc/systemd/system/baduser.service <<EOF
[Service]
ExecStart=/usr/local/sbin/scrubberd
User=ghost
EOF`);
  assert.equal(run(sh, "systemctl start noexec"), "");
  assert.equal(run(sh, "systemctl status noexec"),
    "× noexec.service\n     Loaded: loaded (/etc/systemd/system/noexec.service; static)\n" +
    "     Active: failed (Result: exit-code) since Thu 2026-10-08 09:00:03 UTC; 1s ago\n   Duration: 1ms\n" +
    "    Process: 2041 ExecStart=/usr/local/sbin/missing-prog (code=exited, status=203/EXEC)\n" +
    "   Main PID: 2041 (code=exited, status=203/EXEC)\n        CPU: 0\n\n" +
    "Oct 08 09:00:03 meridian systemd[1]: Started noexec.service.\n" +
    "Oct 08 09:00:03 meridian systemd[1]: noexec.service: Main process exited, code=exited, status=203/EXEC\n" +
    "Oct 08 09:00:03 meridian systemd[1]: noexec.service: Failed with result 'exit-code'.\n");
  run(sh, "systemctl start baduser");
  assert.match(run(sh, "systemctl status baduser"), /\(code=exited, status=217\/USER\)\n {3}Main PID/);
});

test("Timers run on the station clock", () => {
  const sh = new Shell(spec());
  assert.equal(run(sh, "systemctl list-timers"),
    "NEXT                        LEFT LAST PASSED UNIT             ACTIVATES\n" +
    "Fri 2026-10-09 03:00:00 UTC  17h -         - air-sample.timer air-sample.service\n\n" +
    "1 timers listed.\nPass --all to see loaded but inactive timers, too.\n");
  assert.equal(run(sh, "systemctl status air-sample.timer"),
    "● air-sample.timer - Air sample every night\n" +
    "     Loaded: loaded (/etc/systemd/system/air-sample.timer; disabled; preset: enabled)\n" +
    "     Active: active (waiting) since Thu 2026-10-08 08:00:00 UTC; 1h 0min ago\n" +
    "    Trigger: Fri 2026-10-09 03:00:00 UTC; 17h left\n" +
    "   Triggers: ● air-sample.service\n\n" +
    "Oct 08 08:00:00 meridian systemd[1]: Started air-sample.timer - Air sample every night.\n");
  run(sh, "systemctl stop air-sample.timer");
  assert.equal(run(sh, "systemctl list-timers --all"),
    "NEXT LEFT LAST PASSED UNIT             ACTIVATES\n-       - -         - air-sample.timer air-sample.service\n\n1 timers listed.\n");
  assert.match(run(sh, "systemctl status air-sample.timer"), /Active: inactive \(dead\) since [^\n]*\n {3}Duration: 1h 3s\n {4}Trigger: n\/a\n/);
});

test("A timer's schedule: hourly, a weekday, and every quarter hour", () => {
  const { calendarNext } = require("../../app/static/js/shell/base.js");
  const at = new Date(2026, 9, 8, 9, 0); // Thursday 09:00
  const next = (spec) => calendarNext(spec, at).toString();
  assert.equal(next("hourly"), new Date(2026, 9, 8, 10, 0).toString());
  assert.equal(next("daily"), new Date(2026, 9, 9, 0, 0).toString());
  assert.equal(next("weekly"), new Date(2026, 9, 12, 0, 0).toString());
  assert.equal(next("Sat *-*-* 06:30"), new Date(2026, 9, 10, 6, 30).toString());
  // systemd's steps are START/STEP, from START up to the field's top (#329)
  assert.equal(next("*-*-* *:00/15:00"), new Date(2026, 9, 8, 9, 15).toString());
  assert.equal(next("*-*-* *:44/15"), new Date(2026, 9, 8, 9, 44).toString());
  assert.equal(next("*-*-* 1/6:30"), new Date(2026, 9, 8, 13, 30).toString());
  // systemd refuses */N, and a step that can't repeat within its field, as services.py does
  ["*-*-* *:*/15:00", "*-*-* *:45/15", "*-*-* *:00/60", "*-*-* *:00/0", "*-*-* 20/4:00", "*-*-* 00/24:00"].forEach((spec) => {
    assert.equal(calendarNext(spec, at), null, spec);
  });
  assert.equal(next("*-*-* 09:00:00"), new Date(2026, 9, 9, 9, 0).toString()); // now isn't next
});

// systemd 255.4, Type=oneshot with `sh -c "echo probing; sleep 3"` and a
// failing one, started with and without --no-block (#329).
test("A oneshot service is activating while it runs, then inactive (dead)", () => {
  const STAMP = "[Unit]\nDescription=Stamp job\n\n[Service]\nType=oneshot\nExecStart=/usr/local/sbin/stamp\n";
  const sh = new Shell(spec({
    fs: { "/etc/systemd/system/stamp.service": file(STAMP), "/usr/local/sbin/stamp": file("#!/bin/bash\n", 0o755) },
    services: [{ name: "stamp.service", state: "inactive", exits: null, runs_for: 10 }],
  }));
  run(sh, "systemctl start --no-block stamp");
  assert.equal(sh.lastStatus, 0);
  assert.match(run(sh, "systemctl status stamp"), new RegExp(
    "^● stamp\\.service - Stamp job\n" +
    " {5}Loaded: loaded \\(/etc/systemd/system/stamp\\.service; static\\)\n" +
    " {5}Active: activating \\(start\\) since Thu 2026-10-08 09:00:01 UTC; 1s ago\n" +
    " {3}Main PID: (\\d+) \\(stamp\\)\n"));
  assert.equal(sh.lastStatus, 3);
  assert.equal(run(sh, "systemctl is-active stamp"), "activating\n");
  assert.match(run(sh, "systemctl list-units stamp.service"), /stamp\.service loaded activating start Stamp job/);
  run(sh, "sleep 10");
  const pid = sh.sd.units["stamp.service"].pid;
  assert.equal(run(sh, "systemctl status stamp"),
    "○ stamp.service - Stamp job\n" +
    "     Loaded: loaded (/etc/systemd/system/stamp.service; static)\n" +
    "     Active: inactive (dead) since Thu 2026-10-08 09:00:11 UTC; " + (sh.clock - 11) + "s ago\n" +
    "    Process: " + pid + " ExecStart=/usr/local/sbin/stamp (code=exited, status=0/SUCCESS)\n" +
    "   Main PID: " + pid + " (code=exited, status=0/SUCCESS)\n" +
    "        CPU: 2ms\n\n" +
    "Oct 08 09:00:01 meridian systemd[1]: Starting stamp.service - Stamp job...\n" +
    "Oct 08 09:00:11 meridian systemd[1]: stamp.service: Deactivated successfully.\n" +
    "Oct 08 09:00:11 meridian systemd[1]: Finished stamp.service - Stamp job.\n");
  // Without --no-block, start waits for the program: the station clock moves on 10 seconds.
  const before = sh.clock;
  run(sh, "systemctl start stamp");
  assert.equal(sh.lastStatus, 0);
  assert.equal(sh.clock - before, 1 + 10); // the command's own second, then the program's 10
  assert.match(run(sh, "systemctl status stamp"), /Active: inactive \(dead\)/);
});

test("A failed oneshot fails its start, as systemd says", () => {
  const sh = new Shell(spec({
    fs: { "/etc/systemd/system/probe.service": file("[Unit]\nDescription=Probe\n\n[Service]\nType=oneshot\nExecStart=/usr/local/sbin/air-sample\n") },
    services: [{ name: "probe.service", state: "inactive", exits: 1, runs_for: 1 }],
  }));
  const r = sh.run("systemctl start probe");
  assert.equal(r.output, "Job for probe.service failed because the control process exited with error code.\n" +
    'See "systemctl status probe.service" and "journalctl -xeu probe.service" for details.\n');
  assert.equal(sh.lastStatus, 1);
  assert.match(run(sh, "systemctl status probe"), new RegExp(
    "^× probe\\.service - Probe\n.*\n {5}Active: failed \\(Result: exit-code\\) since [^\n]*\n" +
    " {4}Process: \\d+ ExecStart=/usr/local/sbin/air-sample \\(code=exited, status=1/FAILURE\\)\n" +
    " {3}Main PID: \\d+ \\(code=exited, status=1/FAILURE\\)\n {8}CPU: 2ms\n\n" +
    ".* Starting probe\\.service - Probe\\.\\.\\.\n" +
    ".* probe\\.service: Main process exited, code=exited, status=1/FAILURE\n" +
    ".* probe\\.service: Failed with result 'exit-code'\\.\n" +
    ".* Failed to start probe\\.service - Probe\\.\n$"));
});

test("A timer and its service name each other with ●, whatever the state", () => {
  const sh = new Shell(spec());
  assert.equal(run(sh, "systemctl status air-sample.service"),
    "○ air-sample.service - Air sample\n" +
    "     Loaded: loaded (/etc/systemd/system/air-sample.service; static)\n" +
    "     Active: inactive (dead)\n" +
    "TriggeredBy: ● air-sample.timer\n");
  assert.match(run(sh, "systemctl status air-sample.timer"), /\n {3}Triggers: ● air-sample\.service\n/);
  // A stopped timer is unloaded on a real system, so the service no longer names it.
  run(sh, "systemctl stop air-sample.timer");
  assert.doesNotMatch(run(sh, "systemctl status air-sample.service"), /TriggeredBy/);
  assert.match(run(sh, "systemctl status air-sample.timer"), /\n {3}Triggers: ● air-sample\.service\n/);
});

test("A simple service whose program exits 0 is inactive, not failed", () => {
  const sh = new Shell(spec({ services: [{ name: "o2-backup.service", state: "inactive", exits: 0, runs_for: 0 }] }));
  sh.sd.programs["o2-backup.service"] = { exits: 0, runsFor: 0 };
  run(sh, "systemctl start o2-backup");
  assert.equal(sh.lastStatus, 0);
  assert.equal(run(sh, "systemctl is-active o2-backup"), "inactive\n");
  assert.match(run(sh, "journalctl -u o2-backup"), /Started o2-backup\.service - O2 backup feed\.\n.*o2-backup\.service: Deactivated successfully\.\n$/);
});

test("Service checks grade the end state", () => {
  const sh = new Shell(spec({ services: [{ name: "o2-monitor.service", state: "inactive", exits: null, runs_for: 0 }] }));
  const checks = [{ active: "o2-monitor.service" }, { enabled: "o2-monitor.service" }];
  const graded = () => checks.map((c) => passes(c, sh.state(), sh.cwd, sh.processes(), sh.units()));
  sh.run(`cat > /etc/systemd/system/o2-monitor.service <<EOF
[Service]
ExecStart=/usr/local/sbin/o2-monitor
[Install]
WantedBy=multi-user.target
EOF`);
  assert.deepEqual(graded(), [false, false]);
  run(sh, "systemctl start o2-monitor");
  assert.deepEqual(graded(), [true, false]);
  assert.equal(sh.solved(checks), false);
  run(sh, "systemctl enable o2-monitor");
  assert.deepEqual(graded(), [true, true]);
  assert.equal(sh.solved(checks), true);
  run(sh, "systemctl stop o2-monitor");
  assert.equal(passes({ inactive: "o2-monitor.service" }, sh.state(), sh.cwd, sh.processes(), sh.units()), true);
  run(sh, "systemctl disable o2-monitor");
  assert.equal(passes({ disabled: "o2-monitor.service" }, sh.state(), sh.cwd, sh.processes(), sh.units()), true);
});

test("systemctl has a manual page, --help and a line in help", () => {
  const sh = new Shell(spec());
  assert.match(run(sh, "systemctl --help"), /systemctl enable \| disable \[--now\] UNIT/);
  assert.match(run(sh, "help"), /services: +systemctl journalctl\n/);
});
