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
  assert.match(out(sh, "telnet relay"), /^telnet: command not found\./);
  assert.equal(sh.lastStatus, 127);
  assert.match(out(sh, "vim scrubber.conf"), /^vim: not on this console\. Use nano FILE instead/); // #66
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
  assert.equal(out(sh, "echo \"unclosed"), ""); // an open quote continues on the next line, as in bash (#64)
  assert.equal(sh.prompt(), "> ");
  assert.equal(out(sh, 'now"'), "unclosed\nnow\n");
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
  assert.equal(out(sh, "touch made &&"), ""); // unfinished: bash asks for more (#64)
  assert.equal(sh.prompt(), "> ");
  assert.equal(out(sh, "fi"), "bash: syntax error near unexpected token `fi'\n");
  assert.equal(out(sh, "echo ok; # a comment"), "ok\n");
  assert.equal(out(sh, "echo 'a;b' \"c&&d\""), "a;b c&&d\n");
  assert.equal(out(sh, "echo >"), "bash: syntax error near unexpected token `newline'\n");
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

test("Several files into a missing or non-directory target fail as GNU's do (#101)", () => {
  const sh = station();
  sh.run("touch a b");
  assert.equal(out(sh, "mv a b archive/"), "mv: target 'archive/': No such file or directory\n");
  assert.equal(out(sh, "cp a b archive/"), "cp: target 'archive/': No such file or directory\n");
  assert.equal(out(sh, "ln -s a b nowhere"), "ln: target 'nowhere': No such file or directory\n");
  assert.equal(out(sh, "mv a b scrubber.conf"), "mv: target 'scrubber.conf': Not a directory\n");
  assert.equal(out(sh, "ln -s a b scrubber.conf"), "ln: target 'scrubber.conf': Not a directory\n");
  sh.run("mkdir archive");
  assert.equal(out(sh, "mv a b archive/"), "");
  assert.equal(out(sh, "ls archive"), "a  b\n");
});

// A slash on the target means "into this directory": a file is never renamed to `nope`
// (#229). Messages as coreutils 9.4 gives them, checked in ubuntu:24.04.
test("A file into a missing or non-directory target with a slash is refused (#229)", () => {
  const sh = station();
  sh.run("touch f g");
  assert.equal(out(sh, "mv f nope/; echo $?"), "mv: cannot move 'f' to 'nope/': Not a directory\n1\n");
  assert.equal(out(sh, "cp f nope/; echo $?"), "cp: cannot create regular file 'nope/': Not a directory\n1\n");
  assert.equal(out(sh, "mv f g/; echo $?"), "mv: cannot stat 'g/': Not a directory\n1\n");
  assert.equal(out(sh, "cp f g/; echo $?"), "cp: cannot stat 'g/': Not a directory\n1\n");
  assert.equal(out(sh, "ls f g nope"), "ls: cannot access 'nope': No such file or directory\nf  g\n");
});

test("A directory can still be renamed or copied to a new name with a slash (#229)", () => {
  const sh = station();
  sh.run("mkdir d e");
  assert.equal(out(sh, "mv d newd/; cp -r e newe/; echo $?"), "0\n");
  assert.equal(out(sh, "ls -d newd newe"), "newd  newe\n");
});

// Prompts and answers as GNU coreutils 9.4 gives them (checked in ubuntu:24.04).
test("rm -i, mv -i and cp -i ask first, and only y means yes (#101)", () => {
  const sh = station({ "/station/empty": { type: "file", mode: 0o644, owner: "cadet", group: "crew", contents: "" } });
  const asks = (line, ...answers) => {
    const prompts = [];
    let r = sh.run(line);
    for (const a of answers) { prompts.push(sh.pending.prompt); r = sh.answer(a); }
    assert.equal(sh.pending, null, `${line} asked more than ${answers.length} times`);
    return prompts;
  };
  assert.deepEqual(asks("rm -i empty notes.txt", "y", "n"), ["rm: remove regular empty file 'empty'? ", "rm: remove regular file 'notes.txt'? "]);
  assert.equal(out(sh, "ls"), "logs  notes.txt  scrubber.conf\n");
  assert.deepEqual(asks("rm -ri logs", "y", "y", "n"), ["rm: descend into directory 'logs'? ", "rm: remove regular file 'logs/a.log'? ", "rm: remove regular file 'logs/b.log'? "]);
  assert.equal(out(sh, "ls logs"), "b.log\n"); // a file was kept, so the directory isn't offered
  assert.deepEqual(asks("mv -i notes.txt scrubber.conf", "n"), ["mv: overwrite 'scrubber.conf'? "]);
  assert.equal(sh.lastStatus, 1);
  assert.equal(out(sh, "cat scrubber.conf"), "override=7731\n");
  assert.deepEqual(asks("cp -i notes.txt scrubber.conf", "yes"), ["cp: overwrite 'scrubber.conf'? "]);
  assert.equal(out(sh, "cat scrubber.conf"), "b\na\nb\nc\n");
  assert.deepEqual(asks("cp -i notes.txt new.txt"), []); // nothing to overwrite: nothing to ask
  assert.deepEqual(asks("rm -if new.txt"), []); // whichever of -f and -i comes last wins
  sh.run("touch new.txt");
  assert.deepEqual(asks("rm -f -i new.txt", "n"), ["rm: remove regular empty file 'new.txt'? "]);
  assert.equal(out(sh, "echo n | rm -i notes.txt"), "rm: remove regular file 'notes.txt'? "); // the answer read from a pipe
  assert.equal(out(sh, "ls notes.txt"), "notes.txt\n");
});

test("A script on the PATH that isn't executable is refused, not \"not found\" (#70)", () => {
  const sh = station({ "/station/bin": { type: "dir", mode: 0o755, owner: "cadet", group: "crew", contents: "" } });
  sh.run("export PATH=/station/bin:$PATH");
  sh.run("echo 'echo checked' > /station/bin/shift-check");
  assert.equal(out(sh, "shift-check"), "bash: /station/bin/shift-check: Permission denied\n");
  assert.equal(sh.lastStatus, 126);
  assert.equal(out(sh, "bash /station/bin/shift-check"), "checked\n"); // bash reads it: no x needed
  sh.run("chmod +x /station/bin/shift-check");
  assert.equal(out(sh, "shift-check"), "checked\n");
  assert.equal(out(sh, "no-such-thing").split(":")[1], " command not found. The Meridian's console only knows the basics; type `help` to see them.\n");
});

// As bash 5.2 prints them (checked in ubuntu:24.04).
test("Unquoted spaces fail as they do in bash: ambiguous redirects, and a script's errors say where (#71)", () => {
  const sh = station({ "/station/Spare Parts.csv": { type: "file", mode: 0o644, owner: "cadet", group: "crew", contents: "valve\nseal\n" } });
  sh.run("f='Spare Parts.csv'");
  assert.equal(out(sh, "wc -l < $f"), "bash: $f: ambiguous redirect\n");
  assert.equal(sh.lastStatus, 1);
  assert.equal(out(sh, "wc -l < $nothing"), "bash: $nothing: ambiguous redirect\n"); // empty counts too
  assert.equal(out(sh, 'wc -l < "$f"'), "2\n");
  assert.equal(out(sh, "echo hi > *.nope; ls *.nope"), "*.nope\n"); // a glob matching nothing is one word
  sh.run("echo 'parts=/station/Spare Parts.csv' > r.sh; echo 'wc -l < $parts' >> r.sh");
  assert.equal(out(sh, "bash r.sh"), "r.sh: line 1: Parts.csv: command not found\nr.sh: line 2: $parts: ambiguous redirect\n");
  assert.match(out(sh, "Parts.csv"), /^Parts\.csv: command not found\. The Meridian's console/); // at the prompt, the station's voice
});

test("A script's errors inside $( ) keep its line numbers, and a PATH script is named by its path (#71)", () => {
  const sh = station({ "/station/bin": { type: "dir", mode: 0o755, owner: "cadet", group: "crew", contents: "" } });
  sh.run("export PATH=/station/bin:$PATH");
  sh.run("echo '#!/usr/bin/env bash' > /station/bin/r; echo 'x=' >> /station/bin/r; echo 'echo \"n=$(wc -l < $x)\"' >> /station/bin/r; echo 'echo $0' >> /station/bin/r; chmod +x /station/bin/r");
  assert.equal(out(sh, "r"), "/station/bin/r: line 3: $x: ambiguous redirect\nn=\n/station/bin/r\n");
  assert.equal(out(sh, "cd /station/bin; ./r").split("\n")[0], "./r: line 3: $x: ambiguous redirect");
});
