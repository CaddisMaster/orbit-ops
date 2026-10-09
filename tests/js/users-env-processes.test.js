// The console's users and sudo, environment and PATH, and processes (#37).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell } = require("../../app/static/js/shell.js");

const dir = (owner = "root", mode = 0o755) => ({ type: "dir", mode, owner, group: owner === "root" ? "root" : "crew", contents: "" });
const file = (contents, owner = "root", mode = 0o644, group) => ({ type: "file", mode, owner, group: group || (owner === "root" ? "root" : "crew"), contents });

function station() {
  return new Shell({
    user: "cadet",
    group: "crew",
    groups: ["sudo"],
    password: "meridian",
    cwd: "/home/cadet",
    processes: [
      { command: "/usr/sbin/o2-recyclerd", user: "root", cpu: 1.2 },
      { command: "o2-diagnostics --deep-scan", user: "cadet", cpu: 98.7, ignores: ["TERM"] },
    ],
    fs: {
      "/": dir(), "/root": dir("root", 0o700), "/home": dir(), "/home/cadet": dir("cadet"),
      "/etc": dir(),
      "/etc/passwd": file("root:x:0:0:root:/root:/bin/bash\ncadet:x:1000:1000:Cadet:/home/cadet:/bin/bash\nairlock:x:990:990:Airlock controller:/var/lib/airlock:/usr/sbin/nologin\n"),
      "/etc/group": file("root:x:0:\nsudo:x:27:cadet\nairlock:x:990:\ncrew:x:1000:\n"),
      "/etc/shadow": file("root:*:19000:0:99999:7:::\n", "root", 0o640, "shadow"),
      "/usr": dir(), "/usr/local": dir(), "/usr/local/bin": dir(),
      "/usr/local/bin/python3": file("#!/bin/bash\necho 'Python 3.8.10 (old test build)'\n", "root", 0o755),
      "/opt": dir(), "/opt/nav": dir(), "/opt/nav/bin": dir(),
      "/opt/nav/bin/python3": file("#!/bin/bash\necho 'Python 3.12.3 (navigation build)'\n", "root", 0o755),
      "/home/cadet/greet.sh": file('#!/bin/bash\necho "hello $1 from $0, $# args"\ncd /\npwd\n', "cadet", 0o644),
    },
  });
}
const out = (sh, line) => sh.run(line).output;

// --- the scenarios ---------------------------------------------------------------------
test("sudo runs one command as root", () => {
  const sh = station();
  assert.equal(out(sh, "cat /etc/shadow"), "cat: /etc/shadow: Permission denied\n");
  const asked = sh.run("sudo cat /etc/shadow");
  assert.equal(asked.pending, true);
  assert.equal(sh.prompt(), "[sudo] password for cadet: ");
  assert.equal(out(sh, "meridian"), "root:*:19000:0:99999:7:::\n");
  assert.equal(sh.prompt(), "cadet@meridian:~$ ");
  assert.equal(out(sh, "sudo whoami"), "root\n"); // remembered: no second prompt
  assert.equal(out(sh, "whoami"), "cadet\n");
});

test("Only exported variables reach a child", () => {
  const sh = station();
  assert.equal(out(sh, `A=1; export B=2; bash -c 'echo "$A $B"'`), " 2\n");
});

test("Background jobs can be listed and signalled", () => {
  const sh = station();
  assert.match(out(sh, "sleep 600 &"), /^\[1\] \d+\n$/);
  assert.equal(out(sh, "jobs"), "[1]+  Running                 sleep 600 &\n");
  assert.equal(out(sh, "kill %1"), "[1]+  Terminated              sleep 600\n");
  assert.equal(out(sh, "jobs"), "");
});

test("PATH decides what runs", () => {
  const sh = station();
  assert.equal(out(sh, "type -a ls"), "ls is /usr/bin/ls\nls is /bin/ls\n");
  assert.equal(out(sh, "type -a python3"), "python3 is /usr/local/bin/python3\n");
  assert.equal(out(sh, "python3"), "Python 3.8.10 (old test build)\n");
  sh.run('export PATH="/opt/nav/bin:$PATH"');
  assert.equal(out(sh, "which python3"), "/opt/nav/bin/python3\n");
  assert.equal(out(sh, "python3 --version"), "Python 3.12.3 (navigation build)\n");
});

// --- users and sudo --------------------------------------------------------------------------
test("A wrong password is retried, then refused after three", () => {
  const sh = station();
  sh.run("sudo whoami");
  assert.equal(out(sh, "hunter2"), "Sorry, try again.\n");
  assert.equal(out(sh, "hunter3"), "Sorry, try again.\n");
  assert.equal(out(sh, "hunter4"), "sudo: 3 incorrect password attempts\n");
  assert.equal(sh.pending, null);
  assert.equal(sh.lastStatus, 1);
});

test("The rest of the line runs after the password", () => {
  const sh = station();
  sh.run("echo before; sudo touch /etc/made; ls -l /etc/made; echo after");
  const r = out(sh, "meridian");
  assert.match(r, /^-rw-rw-r-- 1 root root 0 \w{3} [ \d]\d \d\d:\d\d \/etc\/made\nafter\n$/);
});

test("Redirection is done by your shell, not by sudo", () => {
  const sh = station();
  sh.run("sudo -v 2>/dev/null; sudo true");
  sh.run("meridian");
  assert.equal(out(sh, "sudo echo hi > /etc/motd"), "bash: /etc/motd: Permission denied\n");
});

test("id and groups: the login's groups, and the database's", () => {
  const sh = station();
  assert.equal(out(sh, "id"), "uid=1000(cadet) gid=1000(crew) groups=1000(crew),27(sudo)\n");
  assert.equal(out(sh, "groups"), "crew sudo\n");
  assert.equal(out(sh, "getent group sudo airlock"), "sudo:x:27:cadet\nairlock:x:990:\n");
  assert.equal(out(sh, "usermod -aG airlock cadet"), "usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.\n");
  sh.run("sudo usermod -aG airlock cadet");
  sh.run("meridian");
  assert.equal(out(sh, "getent group airlock sudo"), "airlock:x:990:cadet\nsudo:x:27:cadet\n");
  assert.equal(out(sh, "id cadet"), "uid=1000(cadet) gid=1000(crew) groups=1000(crew),27(sudo),990(airlock)\n");
  assert.equal(out(sh, "id"), "uid=1000(cadet) gid=1000(crew) groups=1000(crew),27(sudo)\n"); // until the next login
});

test("usermod -G without -a replaces your groups, and takes sudo with it", () => {
  const sh = station();
  sh.run("sudo usermod -G airlock cadet");
  sh.run("meridian");
  assert.equal(out(sh, "getent group sudo"), "sudo:x:27:\n");
  sh.run("sudo -k");
  sh.run("sudo whoami");
  assert.equal(out(sh, "meridian"), "cadet is not in the sudoers file.\n");
});

test("sudo -l, sudo -i and exit", () => {
  const sh = station();
  sh.run("sudo -l");
  assert.equal(out(sh, "meridian"), "User cadet may run the following commands on meridian:\n    (ALL : ALL) ALL\n");
  sh.run("sudo -i");
  assert.equal(sh.prompt(), "root@meridian:~# ");
  assert.equal(out(sh, "whoami; pwd"), "root\n/root\n");
  assert.equal(out(sh, "exit"), "logout\n");
  assert.equal(sh.prompt(), "cadet@meridian:~$ ");
  assert.equal(out(sh, "sudo cd /root"), "sudo: cd: command not found\n");
});

test("Ctrl-C at the password prompt abandons the line", () => {
  const sh = station();
  sh.run("sudo whoami; echo after");
  assert.equal(sh.cancel(), true);
  assert.equal(sh.pending, null);
  assert.equal(out(sh, "echo next"), "next\n");
});

// --- environment ------------------------------------------------------------------------------
test("One-off variables, env, printenv, unset", () => {
  const sh = station();
  assert.equal(out(sh, `ONEOFF=hi bash -c 'echo "one-off: $ONEOFF"'; echo "after: $ONEOFF"`), "one-off: hi\nafter: \n");
  assert.equal(out(sh, "GREETING=hello; printenv GREETING; echo $GREETING"), "hello\n");
  sh.run("export GREETING");
  assert.equal(out(sh, "printenv GREETING"), "hello\n");
  assert.match(out(sh, "env"), /^HOME=\/home\/cadet\n(.*\n)*GREETING=hello\n$/);
  sh.run("unset GREETING");
  assert.equal(out(sh, "echo [$GREETING]"), "[]\n");
  assert.equal(out(sh, "echo $HOSTNAME $SHELL"), "meridian /bin/bash\n");
});

test("Scripts run in a child: arguments, $0, and no way to change your directory", () => {
  const sh = station();
  assert.equal(out(sh, "./greet.sh"), "bash: ./greet.sh: Permission denied\n");
  sh.run("chmod u+x greet.sh");
  assert.equal(out(sh, "./greet.sh Okafor"), "hello Okafor from ./greet.sh, 1 args\n/\n");
  assert.equal(out(sh, "pwd"), "/home/cadet\n");
  assert.equal(out(sh, "greet.sh"), "greet.sh: command not found. The Meridian's console only knows the basics; type `help` to see them.\n");
  assert.equal(out(sh, "bash greet.sh a b"), "hello a from greet.sh, 2 args\n/\n");
});

test("source runs a file in this shell, which is how .bashrc changes stick", () => {
  const sh = station();
  sh.run(`echo 'export PATH="/opt/nav/bin:$PATH"' >> ~/.bashrc`);
  assert.equal(out(sh, "which python3"), "/usr/local/bin/python3\n");
  sh.run("source ~/.bashrc");
  assert.equal(out(sh, "which python3"), "/opt/nav/bin/python3\n");
});

test("type, which and command -v", () => {
  const sh = station();
  assert.equal(out(sh, "type cd"), "cd is a shell builtin\n");
  assert.equal(out(sh, "type -a echo"), "echo is a shell builtin\necho is /usr/bin/echo\necho is /bin/echo\n");
  assert.equal(out(sh, "type nope"), "bash: type: nope: not found\n");
  assert.equal(out(sh, "command -v cd; command -v grep"), "cd\n/usr/bin/grep\n");
  assert.equal(out(sh, "which usermod"), "/usr/sbin/usermod\n");
  sh.run("PATH=/opt/nav/bin");
  assert.match(out(sh, "ls"), /^ls: command not found/);
});

// --- processes -------------------------------------------------------------------------------
test("ps, pgrep and the runaway process", () => {
  const sh = station();
  const aux = out(sh, "ps aux --sort=-%cpu").split("\n");
  assert.equal(aux[0], "USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND");
  assert.match(aux[1], /^cadet\s+417 98\.7\s+0\.1 .* R    Oct08 +59:1\d o2-diagnostics --deep-scan$/);
  assert.equal(out(sh, "pgrep -a o2"), "400 /usr/sbin/o2-recyclerd\n417 o2-diagnostics --deep-scan\n");
  assert.equal(out(sh, "ps").split("\n")[0], "    PID TTY          TIME CMD");
  assert.match(out(sh, "ps"), /\n   2001 pts\/0    00:00:00 bash\n/);
});

test("A process that ignores SIGTERM needs SIGKILL, and you can't signal root's", () => {
  const sh = station();
  assert.equal(out(sh, "kill 417; echo $?"), "0\n");
  assert.equal(out(sh, "pgrep o2-diag"), "417\n"); // still running: it handles TERM
  assert.equal(out(sh, "kill -9 417; pgrep o2-diag; echo $?"), "1\n");
  assert.equal(out(sh, "kill 400"), "bash: kill: (400) - Operation not permitted\n");
  assert.equal(out(sh, "kill 9999"), "bash: kill: (9999) - No such process\n");
  const p = sh.procs.find((x) => x.pid === 417);
  assert.deepEqual(p.signals, ["TERM", "KILL"]);
  sh.run("sudo kill 400");
  sh.run("meridian");
  assert.equal(out(sh, "pgrep o2-recyclerd; echo $?"), "1\n");
});

test("Time passes: a short sleep finishes on its own", () => {
  const sh = station();
  sh.run("sleep 3 &");
  assert.equal(out(sh, "echo $!"), sh.lastBg + "\n");
  assert.equal(out(sh, "echo one"), "one\n");
  assert.equal(out(sh, "sleep 5"), "[1]+  Done                    sleep 3\n");
  assert.equal(out(sh, "jobs"), "");
});

test("fg brings a job back and waits for it", () => {
  const sh = station();
  sh.run("sleep 600 &");
  assert.equal(out(sh, "fg %1"), "sleep 600\n");
  assert.equal(out(sh, "fg"), "bash: fg: current: no such job\n");
  assert.equal(out(sh, "pgrep sleep; echo $?"), "1\n");
});

test("pkill matches names, -f matches whole command lines", () => {
  const sh = station();
  assert.equal(out(sh, "pkill deep-scan; echo $?"), "1\n");
  assert.equal(out(sh, "pkill -9 -f deep-scan; echo $?"), "0\n");
  assert.equal(out(sh, "pgrep o2-diag; echo $?"), "1\n");
});

test("top is a full-screen program, and the console says what to use instead", () => {
  assert.match(out(station(), "top"), /^top: full-screen programs don't run on the station console\. Try: ps aux --sort=-%cpu \| head\n$/);
});
