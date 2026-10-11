// nano, man and the pager, and crontab on the station console (#66). The
// console draws the editor and the pager; shell.js's Nano and Pager decide
// what each key does, so these tests press the keys the browser would.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell, checkCrontab } = require("../../app/static/js/shell.js");

const file = (contents, mode = 0o644, owner = "cadet") => ({ type: "file", mode, owner, group: owner === "root" ? "root" : "crew", contents });
const dir = (owner = "cadet", mode = 0o755) => ({ type: "dir", mode, owner, group: owner === "root" ? "root" : "crew", contents: "" });

function station(extra) {
  return new Shell({
    user: "cadet",
    group: "crew",
    cwd: "/station",
    fs: {
      "/": dir("root"),
      "/etc": dir("root"),
      "/etc/hostname": file("meridian\n", 0o644, "root"),
      "/station": dir(),
      "/station/notes.txt": file("b\na\nb\nc\n"),
      "/station/bin": dir(),
      "/station/bin/o2-check.sh": file("#!/bin/bash\necho ok\n", 0o755),
      ...extra,
    },
  });
}
const out = (sh, line) => sh.run(line).output;

// Open nano (or crontab -e), set the text, and press keys, as console.js does.
function edit(sh, line, text, keys) {
  const opened = sh.run(line);
  assert.equal(opened.pending, true, `${line} should open the editor`);
  const ed = sh.pending.editor;
  for (const k of keys) ed.key(k, text);
  return ed;
}

// --- the scenarios ---------------------------------------------------------------------
test("nano edits and saves a file", () => {
  const sh = station();
  const ed = edit(sh, "nano log.txt", "O2 nominal\nCO2 scrubbed", ["^O"]);
  assert.equal(ed.message, "");
  assert.equal(ed.prompt(), "File Name to Write: log.txt");
  ed.key("Enter", "O2 nominal\nCO2 scrubbed");
  assert.equal(ed.message, "[ Wrote 2 lines ]");
  ed.key("^X", "O2 nominal\nCO2 scrubbed");
  assert.equal(ed.done, true); // saved, so ^X leaves without asking
  assert.equal(sh.answer().output, "");
  assert.equal(sh.pending, null);
  assert.equal(sh.prompt(), "cadet@meridian:/station$ ");
  assert.equal(out(sh, "cat log.txt"), "O2 nominal\nCO2 scrubbed\n"); // nano ends the file with a newline
  assert.equal(sh.state()["/station/log.txt"].mode, 0o664);
});

test("nano refuses to save where I can't write", () => {
  const sh = station();
  const opened = sh.run("nano /etc/hostname");
  const ed = sh.pending.editor;
  assert.equal(opened.pending, true);
  assert.equal(ed.message, "[ Read 1 line ]");
  ed.key("^O", "tampered\n");
  ed.key("Enter", "tampered\n");
  assert.equal(ed.message, "[ Error writing /etc/hostname: Permission denied ]");
  assert.equal(ed.done, false); // still editing
  ed.key("^X", "tampered\n");
  assert.equal(ed.prompt(), "Save modified buffer?   Y Yes   N No   ^C Cancel");
  ed.key("n", "tampered\n");
  assert.equal(ed.done, true);
  sh.answer();
  assert.equal(out(sh, "cat /etc/hostname"), "meridian\n");
});

test("The manual opens in a pager", () => {
  const sh = station();
  const opened = sh.run("man ls");
  assert.equal(opened.pending, true);
  const pager = sh.pending.pager;
  pager.height = 16;
  assert.equal(pager.view().lines[0].trim(), "LS(1)                           User Commands                            LS(1)".trim());
  assert.equal(pager.status(), "Manual page ls(1) line 1 (press h for help or q to quit)");
  pager.search("-a");
  assert.equal(pager.view().lines[0], "       -a, --all");
  assert.equal(pager.view().pattern, "-a");
  pager.key("q");
  assert.equal(pager.done, true);
  assert.equal(sh.answer().output, "");
  assert.equal(sh.prompt(), "cadet@meridian:/station$ ");
});

test("crontab -e installs a schedule", () => {
  const sh = station();
  assert.equal(out(sh, "crontab -l"), "no crontab for cadet\n");
  sh.run("crontab -e");
  let ed = sh.pending.editor;
  assert.match(ed.text, /^# Edit this file to introduce tasks to be run by cron\./);
  assert.match(ed.text, /# m h {2}dom mon dow {3}command\n$/);
  let text = ed.text + "*/15 * * * * /station/bin/o2-check.sh\n";
  for (const k of ["^X", "y", "Enter"]) ed.key(k, text); // Exit, Save? Yes, confirm the name
  assert.equal(ed.done, true);
  assert.equal(sh.answer().output, "crontab: installing new crontab\n");
  assert.match(out(sh, "crontab -l"), /\n\*\/15 \* \* \* \* \/station\/bin\/o2-check\.sh\n$/);
  assert.equal(sh.state()["/var/spool/cron/crontabs/cadet"].contents, text);
  assert.equal(out(sh, "cat /var/spool/cron/crontabs/cadet"), "cat: /var/spool/cron/crontabs/cadet: Permission denied\n");

  // A line with four fields: refused, with cron's message, and nothing changes.
  sh.run("crontab -e");
  ed = sh.pending.editor;
  const bad = ed.text + "*/15 * * * /station/bin/o2-check.sh\n";
  for (const k of ["^O", "Enter", "^X"]) ed.key(k, bad);
  const refused = sh.answer();
  assert.equal(refused.output, '"/tmp/crontab.Mr7KqZ/crontab":25: bad day-of-week\nerrors in crontab file, can\'t install.\n');
  assert.equal(sh.prompt(), "Do you want to retry the same edit? (y/n) ");
  assert.equal(out(sh, "n"), "crontab: edits left in /tmp/crontab.Mr7KqZ/crontab\n");
  assert.equal(sh.lastStatus, 1);
  assert.equal(out(sh, "crontab -l"), text);
});

// --- nano ---------------------------------------------------------------------------------
test("nano asks before leaving unsaved changes, and Yes saves them", () => {
  const sh = station();
  const ed = edit(sh, "nano notes.txt", "b\na\n", ["^X"]);
  assert.equal(ed.mode, "ask");
  ed.key("^C", "b\na\n");
  assert.equal(ed.message, "[ Cancelled ]");
  for (const k of ["^X", "Y", "Enter"]) ed.key(k, "b\na\n");
  assert.equal(ed.done, true);
  sh.answer();
  assert.equal(out(sh, "cat notes.txt"), "b\na\n");
});

test("nano opens new files, and says so for directories and unreadable ones", () => {
  const sh = station({ "/station/secret": file("x\n", 0o600, "root") });
  sh.run("nano fresh.sh");
  assert.equal(sh.pending.editor.message, "[ New File ]");
  sh.pending.editor.key("^X", "");
  sh.answer();
  assert.equal(sh.state()["/station/fresh.sh"], undefined); // never saved, never made
  sh.run("nano secret");
  assert.equal(sh.pending.editor.message, "[ Error reading secret: Permission denied ]");
  assert.equal(sh.pending.editor.text, "");
  sh.pending.editor.key("^X", "");
  sh.answer();
  assert.equal(out(sh, "nano"), "nano: give it a file to edit: nano FILE (its options aren't on this console)\n");
  assert.equal(out(sh, "echo hi | nano x"), "nano: the editor needs the console's screen; it can't run in a pipe or a $( )\n");
  assert.equal(out(sh, "vim x"), "vim: not on this console. Use nano FILE instead: ^O saves, ^X exits.\n");
});

test("A script written in nano runs", () => {
  const sh = station();
  const ed = edit(sh, "nano check.sh", '#!/bin/bash\nfor f in bin/*.sh; do\n  echo "found $f"\ndone', ["^O", "Enter", "^X"]);
  assert.equal(ed.done, true);
  sh.answer();
  assert.equal(out(sh, "./check.sh"), "bash: ./check.sh: Permission denied\n");
  sh.run("chmod +x check.sh");
  assert.equal(out(sh, "./check.sh"), "found bin/o2-check.sh\n");
});

// --- man, --help, help, less ------------------------------------------------------------
test("man pages, --help and help come from the same manual", () => {
  const sh = station();
  assert.match(out(sh, "man ls | head -4"), /^LS\(1\) +User Commands +LS\(1\)\n\nNAME\n {7}ls - list directory contents\n$/);
  assert.match(out(sh, "ls --help"), /^Usage: ls \[OPTION\]\.\.\. \[FILE\]\.\.\.\n/);
  assert.match(out(sh, "grep --help"), /\n {2}-q, --quiet +do not write anything;/);
  assert.match(out(sh, "help cd"), /^cd: cd \[dir\]\n {4}Change the shell working directory\.\n/);
  assert.equal(out(sh, "cd --help"), out(sh, "help cd"));
  assert.equal(out(sh, "echo --help"), "--help\n"); // echo prints it, as bash's does
  assert.equal(out(sh, "man cd"), "No manual entry for cd\n"); // a builtin: help cd, as on Ubuntu
  assert.equal(sh.lastStatus, 16);
  assert.equal(out(sh, "man"), "What manual page do you want?\nFor example, try 'man man'.\n");
  assert.match(out(sh, "man 5 crontab | head -1"), /^CRONTAB\(5\) +File Formats +CRONTAB\(5\)\n$/);
  assert.match(out(sh, "man crontab | head -1"), /^CRONTAB\(1\) +User Commands/);
  assert.match(out(sh, "help if"), /^if: if COMMANDS; then COMMANDS;/);
  assert.match(out(sh, "help ls"), /^bash: help: no help topics match `ls'/);
  assert.match(out(sh, "help"), /editing: +nano less man crontab/);
});

test("man finds an exercise's own pages in /usr/share/man, section by section (#68)", () => {
  const page = (title) => file(`${title}\n\nNAME\n       scrubberd - air scrubber daemon\n`, 0o644, "root");
  const sh = station({
    ...Object.fromEntries(["/usr", "/usr/share", "/usr/share/man", "/usr/share/man/man1", "/usr/share/man/man5", "/usr/share/man/man8"].map((d) => [d, dir("root")])),
    "/usr/share/man/man8/scrubberd.8": page("SCRUBBERD(8)"),
    "/usr/share/man/man5/scrubber.conf.5": page("SCRUBBER.CONF(5)"),
    "/usr/share/man/man5/scrubberd.5": page("SCRUBBERD(5)"),
    "/usr/share/man/man1/ls.1": page("NOT THE CONSOLE'S LS(1)"),
  });
  assert.equal(out(sh, "man scrubberd | head -1"), "SCRUBBERD(8)\n"); // 8 is searched before 5
  assert.equal(out(sh, "man 5 scrubberd | head -1"), "SCRUBBERD(5)\n");
  assert.equal(out(sh, "man scrubber.conf | head -1"), "SCRUBBER.CONF(5)\n");
  assert.equal(out(sh, "man 1 scrubber.conf"), "No manual entry for scrubber.conf in section 1\n");
  assert.match(out(sh, "man ls | head -1"), /^LS\(1\) +User Commands/); // the console's own page wins in its section

  const opened = sh.run("man scrubberd");
  assert.equal(opened.pending, true);
  assert.equal(sh.pending.pager.status(), "Manual page scrubberd(8) line 1 (END) (press h for help or q to quit)");
  sh.pending.pager.key("q");
  sh.answer();
});

test("Every command the console has is in the manual, or has help", () => {
  const { PAGES, HELP } = require("../../app/static/js/manual.js");
  const sh = station();
  const commands = out(sh, "help").match(/^ {2}\w+: +(.+)$/gm).flatMap((l) => l.split(/: +/)[1].split(" "))
    .filter((w) => /^[a-z]+$/.test(w)); // the "scripts:" line names keywords, which help covers
  for (const name of commands) assert.ok(PAGES[name] || HELP[name], `${name} has no man page or help`);
  for (const key of Object.keys(PAGES)) assert.doesNotThrow(() => sh.run(`man ${key.replace(".5", "")} > /dev/null`), key);
});

test("less pages a file or a pipe, and searches", () => {
  const sh = station({ "/station/long.log": file(Array.from({ length: 40 }, (_, i) => `line ${i + 1}${i === 29 ? " ERROR" : ""}`).join("\n") + "\n") });
  sh.run("less long.log");
  const pg = sh.pending.pager;
  pg.height = 10;
  assert.equal(pg.status(), "long.log");
  pg.key(" ");
  assert.equal(pg.view().lines[0], "line 11");
  assert.equal(pg.status(), ":");
  pg.key("b");
  assert.equal(pg.top, 0);
  pg.search("ERROR");
  assert.equal(pg.view().lines[0], "line 30 ERROR");
  pg.key("n");
  assert.equal(pg.status(), "Pattern not found  (press RETURN)");
  pg.key("Enter");
  pg.key("G");
  assert.equal(pg.status(), "(END)");
  pg.key("q");
  sh.answer();
  sh.run("grep line long.log | less");
  assert.equal(sh.pending.pager.lines.length, 40);
  sh.pending.pager.key("q");
  sh.answer();
  assert.equal(out(sh, "less notes.txt | wc -l"), "4\n"); // into a pipe, less is cat
  assert.equal(out(sh, "less"), 'Missing filename ("less --help" for help)\n');
  assert.equal(out(sh, "less nope"), "nope: No such file or directory\n");
});

// --- crontab ---------------------------------------------------------------------------------
test("crontab checks each line as cron would", () => {
  const ok = (line) => checkCrontab(line + "\n", "f");
  assert.equal(ok("*/15 * * * * /station/bin/o2-check.sh"), null);
  assert.equal(ok("0 5 * * 1-5 /station/bin/backup.sh >> /var/log/backup.log 2>&1"), null);
  assert.equal(ok("30 2 1,15 jan-jun sun /x"), null);
  assert.equal(ok("@daily /x"), null);
  assert.equal(ok("MAILTO=okafor"), null);
  assert.equal(ok("  # a comment"), null);
  assert.equal(ok("60 * * * * /x"), '"f":1: bad minute\n');
  assert.equal(ok("* 24 * * * /x"), '"f":1: bad hour\n');
  assert.equal(ok("* * 0 * * /x"), '"f":1: bad day-of-month\n');
  assert.equal(ok("* * * 13 * /x"), '"f":1: bad month\n');
  assert.equal(ok("* * * * 8 /x"), '"f":1: bad day-of-week\n');
  assert.equal(ok("*/0 * * * * /x"), '"f":1: bad minute\n');
  assert.equal(ok("5-1 * * * * /x"), '"f":1: bad minute\n');
  assert.equal(ok("* * * * *"), '"f":1: bad command\n');
  assert.equal(ok("@sometimes /x"), '"f":1: bad time specifier\n');
});

test("crontab FILE installs, crontab -r removes", () => {
  const sh = station({
    "/station/good.cron": file("*/15 * * * * /station/bin/o2-check.sh\n"),
    "/station/bad.cron": file("# fine\n*/15 * * * /station/bin/o2-check.sh\n"),
    "/station/noeol.cron": file("* * * * * /x"),
  });
  assert.equal(out(sh, "crontab bad.cron"), '"bad.cron":2: bad day-of-week\nerrors in crontab file, can\'t install.\n');
  assert.equal(out(sh, "crontab noeol.cron"), "new crontab file is missing newline before EOF, can't install.\n");
  assert.equal(out(sh, "crontab good.cron; crontab -l"), "*/15 * * * * /station/bin/o2-check.sh\n");
  assert.equal(out(sh, "echo '@hourly /x' | crontab -; crontab -l"), "@hourly /x\n");
  assert.equal(out(sh, "crontab -r; crontab -l"), "no crontab for cadet\n");
  assert.match(out(sh, "crontab"), /^crontab: usage error: file name or - \(for stdin\) must be specified\n/);
});

test("crontab -e with no changes installs nothing", () => {
  const sh = station();
  sh.run("crontab -e");
  sh.pending.editor.key("^X", sh.pending.editor.text);
  assert.equal(sh.answer().output, "crontab: no changes made to crontab\n");
  assert.equal(out(sh, "crontab -l"), "no crontab for cadet\n");
});
