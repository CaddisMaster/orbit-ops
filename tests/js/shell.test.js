// The station console's simulated shell (#17), run by `node --test tests/js/`
// in CI's Tests job (Node ships on the runner; no packages needed).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell, applyMode } = require("../../app/static/js/shell.js");

// The permissions exercise's starting filesystem, as app/terminal.py's
// client_spec() sends it.
function station(extra) {
  const fs = {
    "/": { type: "dir", mode: 0o755, owner: "root", group: "root", contents: "" },
    "/station": { type: "dir", mode: 0o755, owner: "cadet", group: "crew", contents: "" },
    "/station/scrubber.conf": { type: "file", mode: 0o644, owner: "cadet", group: "crew", contents: "override=7731\n" },
    "/station/notes.txt": { type: "file", mode: 0o664, owner: "cadet", group: "crew", contents: "b\na\nb\nc\n" },
    "/station/logs": { type: "dir", mode: 0o755, owner: "cadet", group: "crew", contents: "" },
    "/station/logs/a.log": { type: "file", mode: 0o644, owner: "cadet", group: "crew", contents: "ok\nERROR one\n" },
    "/station/logs/b.log": { type: "file", mode: 0o644, owner: "cadet", group: "crew", contents: "ERROR two\n" },
    "/station/.hidden": { type: "file", mode: 0o600, owner: "cadet", group: "crew", contents: "" },
    "/etc": { type: "dir", mode: 0o755, owner: "root", group: "root", contents: "" },
    "/etc/shadow": { type: "file", mode: 0o640, owner: "root", group: "shadow", contents: "secret\n" },
    ...extra,
  };
  return new Shell({ user: "cadet", group: "crew", cwd: "/station", fs });
}
const out = (sh, line) => sh.run(line).output;

// --- the scenarios ----------------------------------------------------------------
test("The console starts in the module's filesystem", () => {
  const sh = station();
  assert.equal(sh.prompt(), "cadet@meridian:/station$ ");
  assert.equal(out(sh, "pwd"), "/station\n");
  assert.equal(
    out(sh, "ls -l"),
    "total 12\n" +
      "drwxr-xr-x 2 cadet crew 4096 Oct  8 09:00 logs\n" +
      "-rw-rw-r-- 1 cadet crew    8 Oct  8 09:00 notes.txt\n" +
      "-rw-r--r-- 1 cadet crew   14 Oct  8 09:00 scrubber.conf\n"
  );
});

test("Commands behave like their real counterparts: chmod 600 then ls -l", () => {
  const sh = station();
  assert.equal(out(sh, "chmod 600 scrubber.conf"), "");
  assert.match(out(sh, "ls -l scrubber.conf"), /^-rw------- 1 cadet crew 14 Oct  8 09:00 scrubber.conf\n$/);
});

test("An unsupported command fails gracefully and the console keeps working", () => {
  const sh = station();
  assert.match(out(sh, "vim scrubber.conf"), /^vim: command not found\./);
  assert.equal(sh.lastStatus, 127);
  assert.equal(out(sh, "echo still here"), "still here\n");
});

test("Completing the task is recognised the moment the state satisfies the checks", () => {
  const sh = station();
  const checks = [{ mode: "/station/scrubber.conf", equals: "600" }];
  assert.equal(sh.solved(checks), false);
  sh.run("chmod u=rw,go= scrubber.conf");
  assert.equal(sh.solved(checks), true);
  assert.equal(sh.state()["/station/scrubber.conf"].mode, 0o600);
});

// --- ls --------------------------------------------------------------------------------
test("ls hides dotfiles unless -a, and joins names on a terminal", () => {
  const sh = station();
  assert.equal(out(sh, "ls"), "logs  notes.txt  scrubber.conf\n");
  assert.equal(out(sh, "ls | cat"), "logs\nnotes.txt\nscrubber.conf\n");
  assert.equal(out(sh, "ls -a"), ".  ..  .hidden  logs  notes.txt  scrubber.conf\n");
  assert.match(out(sh, "ls -la"), /\n-rw------- 1 cadet crew\s+0 Oct  8 09:00 \.hidden\n/);
});

test("ls -lh shows human sizes and ls -d lists the directory itself", () => {
  const sh = station({ "/station/big.dat": { type: "file", mode: 0o644, owner: "cadet", group: "crew", contents: "x".repeat(5000) } });
  assert.match(out(sh, "ls -lh big.dat"), / 4\.9K Oct/);
  assert.match(out(sh, "ls -ld logs"), /^drwxr-xr-x 2 cadet crew 4096 Oct  8 09:00 logs\n$/);
  assert.equal(out(sh, "ls nope"), "ls: cannot access 'nope': No such file or directory\n");
  sh.run("mkdir archive");
  assert.equal(out(sh, "ls logs archive scrubber.conf"), "scrubber.conf\n\narchive:\n\nlogs:\na.log  b.log\n"); // files, then dirs, sorted
});

// --- permissions --------------------------------------------------------------------------
test("Permissions are enforced for a non-root user", () => {
  const sh = station();
  assert.equal(out(sh, "cat /etc/shadow"), "cat: /etc/shadow: Permission denied\n");
  assert.equal(out(sh, "touch /etc/new"), "touch: cannot touch '/etc/new': Permission denied\n");
  assert.equal(out(sh, "chmod 777 /etc/shadow"), "chmod: changing permissions of '/etc/shadow': Operation not permitted\n");
  assert.equal(out(sh, "chown root scrubber.conf"), "chown: changing ownership of 'scrubber.conf': Operation not permitted\n");
  sh.run("chmod 000 scrubber.conf");
  assert.equal(out(sh, "cat scrubber.conf"), "cat: scrubber.conf: Permission denied\n");
  sh.run("chmod 644 logs");
  assert.equal(out(sh, "cat logs/a.log"), "cat: logs/a.log: Permission denied\n"); // no x on the directory
  assert.equal(out(sh, "cd logs"), "bash: cd: logs: Permission denied\n");
});

test("New files and directories follow the 002 umask", () => {
  const sh = station();
  sh.run("touch new.txt; mkdir -p deep/er; echo hi > made.txt");
  const st = sh.state();
  assert.equal(st["/station/new.txt"].mode, 0o664);
  assert.equal(st["/station/deep/er"].mode, 0o775);
  assert.equal(st["/station/made.txt"].contents, "hi\n");
});

test("chmod understands octal and symbolic modes", () => {
  assert.equal(applyMode("750", 0), 0o750);
  assert.equal(applyMode("u+x", 0o644), 0o744);
  assert.equal(applyMode("go-r", 0o644), 0o600);
  assert.equal(applyMode("a=r", 0o777), 0o444);
  assert.equal(applyMode("u=rw,go=", 0o755), 0o600);
  assert.equal(applyMode("+x", 0o644), 0o755);
  const sh = station();
  assert.equal(out(sh, "chmod -w scrubber.conf; ls -l scrubber.conf").slice(0, 10), "-r--r--r--");
});

// --- files and globs -------------------------------------------------------------------------
test("cp, mv and rm work on files and, with -r, directories", () => {
  const sh = station();
  sh.run("mkdir archive && cp logs/*.log archive/ && mv notes.txt archive/n.txt");
  assert.equal(out(sh, "ls archive"), "a.log  b.log  n.txt\n");
  assert.equal(out(sh, "rm logs"), "rm: cannot remove 'logs': Is a directory\n");
  assert.equal(out(sh, "cp logs copy"), "cp: -r not specified; omitting directory 'logs'\n");
  sh.run("cp -r logs copy && rm -r logs");
  assert.equal(out(sh, "ls"), "archive  copy  scrubber.conf\n");
  assert.equal(out(sh, "mkdir copy"), "mkdir: cannot create directory ‘copy’: File exists\n");
});

test("Globs expand against the filesystem, and an unmatched glob is left as typed", () => {
  const sh = station();
  assert.equal(out(sh, "echo logs/*.log"), "logs/a.log logs/b.log\n");
  assert.equal(out(sh, "echo /station/*.conf"), "/station/scrubber.conf\n");
  assert.equal(out(sh, "echo logs/[a].log logs/?.log"), "logs/a.log logs/a.log logs/b.log\n");
  assert.equal(out(sh, "echo '*.log' *.zip"), "*.log *.zip\n");
  assert.equal(out(sh, "echo *"), "logs notes.txt scrubber.conf\n"); // no dotfiles
});

// --- text and pipes ----------------------------------------------------------------------------
test("Pipes, redirection and text tools", () => {
  const sh = station();
  assert.equal(out(sh, "grep -c ERROR logs/a.log logs/b.log"), "logs/a.log:1\nlogs/b.log:1\n");
  assert.equal(out(sh, "cat logs/*.log | grep ERROR | wc -l"), "2\n");
  assert.equal(out(sh, "sort notes.txt | uniq -c"), "      1 a\n      2 b\n      1 c\n");
  assert.equal(out(sh, "sort -r notes.txt | head -n 2"), "c\nb\n");
  assert.equal(out(sh, "tail -1 notes.txt"), "c\n");
  assert.equal(out(sh, "echo a:b:c | cut -d : -f 2,3"), "b:c\n");
  sh.run("echo one > out.txt; echo two >> out.txt");
  assert.equal(out(sh, "cat out.txt"), "one\ntwo\n");
  assert.equal(out(sh, "wc out.txt"), "2 2 8 out.txt\n");
  assert.equal(out(sh, "cat nope 2> /dev/null; echo $?"), "1\n");
});

test("Quotes, variables, && and ||", () => {
  const sh = station();
  assert.equal(out(sh, 'echo "$USER lives in $HOME"'), "cadet lives in /station\n");
  assert.equal(out(sh, "echo '$USER'"), "$USER\n");
  assert.equal(out(sh, "cat nope && echo yes || echo no"), "cat: nope: No such file or directory\nno\n");
  assert.equal(out(sh, "echo \"unclosed"), 'bash: unexpected EOF while looking for matching `"\'\n');
  assert.equal(out(sh, "whoami; id"), "cadet\nuid=1000(cadet) gid=1000(crew) groups=1000(crew)\n");
});

test("cd and pwd, including .. and ~", () => {
  const sh = station();
  sh.run("cd logs");
  assert.equal(sh.prompt(), "cadet@meridian:/station/logs$ ");
  sh.run("cd ../..");
  assert.equal(out(sh, "pwd"), "/\n");
  sh.run("cd");
  assert.equal(out(sh, "pwd"), "/station\n");
  assert.equal(out(sh, "cd scrubber.conf"), "bash: cd: scrubber.conf: Not a directory\n");
});

test("Tab completes commands and paths", () => {
  const sh = station();
  assert.deepEqual(sh.complete("chm"), { line: "chmod ", options: [] });
  assert.deepEqual(sh.complete("cat scr"), { line: "cat scrubber.conf ", options: [] });
  assert.deepEqual(sh.complete("cd lo"), { line: "cd logs/", options: [] });
  assert.deepEqual(sh.complete("cat logs/"), { line: "cat logs/", options: ["a.log", "b.log"] });
  assert.deepEqual(sh.complete("cat zz"), { line: "cat zz", options: [] });
});

test("clear asks the terminal to clear", () => {
  assert.equal(station().run("clear").clear, true);
});

test("$? and syntax errors follow bash: expanded per command, and a bad line runs nothing", () => {
  const sh = station();
  assert.equal(out(sh, "cat nope 2> /dev/null; echo $?; echo $?"), "1\n0\n");
  assert.equal(out(sh, "touch made && ; echo x"), "bash: syntax error near unexpected token `;'\n");
  assert.equal(out(sh, "touch made &&"), "bash: syntax error near unexpected token `&&'\n");
  assert.equal(out(sh, "echo ok; # a comment"), "ok\n");
  assert.equal(out(sh, "echo 'a;b' \"c&&d\""), "a;b c&&d\n");
  assert.equal(out(sh, "ls | "), "bash: syntax error near unexpected token `newline'\n");
  assert.equal(sh.state()["/station/made"], undefined);
});

test("Brace expansion, as the files-and-globs lesson uses it", () => {
  const sh = station();
  assert.equal(out(sh, "echo day{1..3}.txt"), "day1.txt day2.txt day3.txt\n");
  assert.equal(out(sh, "echo scrubber.conf{,.bak}"), "scrubber.conf scrubber.conf.bak\n");
  sh.run("mkdir -p project/{src,tests,docs}");
  assert.equal(out(sh, "ls project"), "docs  src  tests\n");
  sh.run("touch day{1..12}.txt");
  assert.equal(out(sh, "echo day?.txt"), "day1.txt day2.txt day3.txt day4.txt day5.txt day6.txt day7.txt day8.txt day9.txt\n");
  assert.equal(out(sh, "echo day1*.txt"), "day1.txt day10.txt day11.txt day12.txt\n");
  assert.equal(out(sh, "echo '{a,b}' {x}"), "{a,b} {x}\n");
});

test("2>&1 follows bash's order rules, and &> sends both streams", () => {
  const sh = station();
  assert.equal(out(sh, "ls logs nope > both.txt 2>&1"), "");
  assert.equal(out(sh, "cat both.txt"), "ls: cannot access 'nope': No such file or directory\nlogs:\na.log\nb.log\n");
  // 2>&1 first copies the terminal, so the error still shows.
  assert.equal(out(sh, "ls logs nope 2>&1 > only-out.txt"), "ls: cannot access 'nope': No such file or directory\n");
  assert.equal(out(sh, "cat only-out.txt"), "logs:\na.log\nb.log\n");
  assert.equal(out(sh, "ls nope &> all.txt; cat all.txt"), "ls: cannot access 'nope': No such file or directory\n");
  assert.equal(out(sh, "ls nope 2>&1 | wc -l"), "1\n"); // errors go down the pipe too
  assert.equal(out(sh, "ls nope > /dev/null 2>&1; echo $?"), "2\n");
});

test("tee copies its input to files and on down the pipe", () => {
  const sh = station();
  assert.equal(out(sh, "grep ERROR logs/a.log | tee errs.txt | wc -l"), "1\n");
  assert.equal(out(sh, "echo more | tee -a errs.txt"), "more\n");
  assert.equal(out(sh, "cat errs.txt"), "ERROR one\nmore\n");
});

test("cd - goes back and says where", () => {
  const sh = station();
  assert.equal(out(sh, "cd -"), "bash: cd: OLDPWD not set\n");
  sh.run("cd logs");
  assert.equal(out(sh, "cd -"), "/station\n");
  assert.equal(out(sh, "cd -"), "/station/logs\n");
  assert.equal(out(sh, "echo $OLDPWD"), "/station\n");
});

test("The prompt shows ~ only for a real home directory", () => {
  const sh = new Shell({ user: "cadet", group: "crew", cwd: "/home/cadet", fs: {
    "/": { type: "dir", mode: 0o755, owner: "root", group: "root", contents: "" },
    "/home": { type: "dir", mode: 0o755, owner: "root", group: "root", contents: "" },
    "/home/cadet": { type: "dir", mode: 0o755, owner: "cadet", group: "crew", contents: "" },
  } });
  assert.equal(sh.prompt(), "cadet@meridian:~$ ");
  sh.run("cd /");
  assert.equal(sh.prompt(), "cadet@meridian:/$ ");
});
