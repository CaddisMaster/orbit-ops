// find, disk usage, archives and symbolic links on the station console (#67).
// Files carry a size (a big log is sampled) and a modification time, on the
// station's clock: 2026-10-08 09:00 when the console starts.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell, passes } = require("../../app/static/js/shell.js");

const M = 1048576;
const file = (contents, extra = {}) => ({ type: "file", mode: 0o644, owner: "cadet", group: "crew", contents, ...extra });
const dir = (owner = "cadet", mode = 0o755) => ({ type: "dir", mode, owner, group: owner === "root" ? "root" : "crew", contents: "" });

function station(extra) {
  return new Shell({
    user: "cadet",
    group: "crew",
    cwd: "/station",
    disk: { size: 2048 * M, base: 1536 * M },
    fs: {
      "/": dir("root"),
      "/root": dir("root", 0o700),
      "/station": dir(),
      "/station/old": dir(),
      "/station/old/a.log": file("alpha\n"),
      "/station/old/sub": dir(),
      "/station/old/sub/b.log": file("beta\n"),
      "/var": dir("root"),
      "/var/log": dir(),
      "/var/log/o2": dir(),
      "/var/log/o2/2026-10-10.log": file("O2 nominal\n", { mtime: "2026-10-08T06:00:00" }),
      "/var/log/o2/scrubber.log": file("sample\n", { size: 48 * M, mtime: "2026-09-20T03:00:00" }),
      "/var/log/o2/recent.log": file("sample\n", { size: 30 * M, mtime: "2026-10-06T03:00:00" }),
      "/var/log/o2/tiny-old.log": file("x\n", { mtime: "2026-08-01T03:00:00" }),
      "/var/log/net": dir(),
      "/var/log/net/relay.1.gz": file("x", { size: 64 * M, mtime: "2026-08-20T03:00:00" }),
      "/var/log/net/relay.2.gz": file("x", { size: 20 * M, mtime: "2026-09-25T03:00:00" }),
      ...extra,
    },
  });
}
const out = (sh, line) => sh.run(line).output;
const used = (sh) => +out(sh, "df /").split("\n")[1].split(/\s+/)[2]; // 1K blocks

// --- the scenarios ---------------------------------------------------------------------
test("find filters by name, type, size and age", () => {
  const sh = station();
  // Over 10M and older than 7 days: not recent.log (2 days), not tiny-old.log (small), not the .gz files.
  assert.equal(out(sh, "find /var/log -name '*.log' -size +10M -mtime +7"), "/var/log/o2/scrubber.log\n");
  assert.equal(out(sh, "find /var/log -type d"), "/var/log\n/var/log/net\n/var/log/o2\n");
  assert.equal(out(sh, "find /var/log -type f -mtime +30"), "/var/log/net/relay.1.gz\n/var/log/o2/tiny-old.log\n");
  assert.equal(out(sh, "find /var/log/o2 -size -1M"), ""); // rounds up: only empty files are under 1M
  assert.equal(out(sh, "find /var/log \\( -name '*.gz' -o -name 'scrub*' \\) -size +30M"), "/var/log/net/relay.1.gz\n/var/log/o2/scrubber.log\n");
  assert.equal(out(sh, "find /var/log -type f ! -name '*.log'"), "/var/log/net/relay.1.gz\n/var/log/net/relay.2.gz\n");
  assert.equal(out(sh, "find /var/log -maxdepth 1"), "/var/log\n/var/log/net\n/var/log/o2\n");
  assert.equal(out(sh, "find . -iname 'A.LOG'"), "./old/a.log\n");
  assert.equal(out(sh, "find / -maxdepth 1 -name root"), "/root\n");
  assert.equal(out(sh, "find /root"), "/root\nfind: ‘/root’: Permission denied\n");
  assert.equal(sh.lastStatus, 1);
});

test("Disk usage adds up", () => {
  const sh = station();
  // 48M + 30M + 64M + 20M, two small logs (a 4K block each) and three directories (4K each).
  assert.equal(out(sh, "du -sh /var/log"), "163M\t/var/log\n");
  assert.equal(out(sh, "du -s /var/log"), String((162 * M + 5 * 4096) / 1024) + "\t/var/log\n");
  assert.equal(out(sh, "du -h --max-depth=1 /var/log"), "85M\t/var/log/net\n79M\t/var/log/o2\n163M\t/var/log\n");
  const df = out(sh, "df -h /");
  assert.equal(df.split("\n")[0], "Filesystem      Size  Used Avail Use% Mounted on");
  assert.match(df.split("\n")[1], /^\/dev\/vda1 +2\.0G +1\.7G +350M +83% \/$/);
  // df's used space is the system's base plus every file, du's total included.
  assert.ok(used(sh) * 1024 >= 1536 * M + 162 * M);
});

test("Archives round-trip", () => {
  const sh = station();
  assert.equal(out(sh, "tar -czf logs.tar.gz old/"), "");
  assert.equal(out(sh, "tar -tzf logs.tar.gz"), "old/\nold/a.log\nold/sub/\nold/sub/b.log\n");
  assert.equal(out(sh, "tar -tvf logs.tar.gz"),
    "drwxr-xr-x cadet/crew         0 2026-10-08 09:00 old/\n" +
    "-rw-r--r-- cadet/crew         6 2026-10-08 09:00 old/a.log\n" +
    "drwxr-xr-x cadet/crew         0 2026-10-08 09:00 old/sub/\n" +
    "-rw-r--r-- cadet/crew         5 2026-10-08 09:00 old/sub/b.log\n");
  sh.run("rm -r old; mkdir restore");
  assert.equal(out(sh, "tar -xzf logs.tar.gz -C restore; cat restore/old/sub/b.log"), "beta\n");
  assert.equal(out(sh, "tar -xzf logs.tar.gz old/a.log; ls old"), "a.log\n");
  // Big files keep their size through an archive; gzip shrinks the archive.
  assert.equal(out(sh, "tar -cf o2.tar /var/log/o2"), "tar: Removing leading `/' from member names\n");
  assert.match(out(sh, "tar -tf o2.tar"), /^var\/log\/o2\/\nvar\/log\/o2\/2026-10-10\.log\n/);
  assert.equal(out(sh, "mkdir x; cd x; tar -xf ../o2.tar; ls -l var/log/o2/scrubber.log; cd .."),
    "-rw-r--r-- 1 cadet crew 50331648 Sep 20 03:00 var/log/o2/scrubber.log\n"); // tar puts the time back
  const sizes = out(sh, "ls -l o2.tar logs.tar.gz").split("\n").map((l) => +l.split(/\s+/)[4]);
  assert.ok(sizes[0] < 1000 && sizes[1] > 78 * M, `${sizes}`);
});

test("Symlinks resolve and are graded", () => {
  const sh = station();
  assert.equal(out(sh, "ln -s /var/log/o2/2026-10-10.log current.log"), "");
  assert.equal(out(sh, "cat current.log"), "O2 nominal\n");
  assert.equal(out(sh, "ls -l current.log"), "lrwxrwxrwx 1 cadet crew 26 Oct  8 09:00 current.log -> /var/log/o2/2026-10-10.log\n");
  assert.equal(out(sh, "readlink current.log"), "/var/log/o2/2026-10-10.log\n");
  const state = sh.state();
  assert.deepEqual(state["/station/current.log"], {
    type: "link", mode: 0o777, owner: "cadet", group: "crew", contents: "", mtime: "2026-10-08T09:00:01", target: "/var/log/o2/2026-10-10.log",
  });
  assert.equal(passes({ symlink: "/station/current.log", target: "/var/log/o2/2026-10-10.log" }, state, sh.cwd, []), true);
  assert.equal(passes({ symlink: "/station/current.log", target: "2026-10-10.log" }, state, sh.cwd, []), false);
});

test("find -delete frees space", () => {
  const sh = station();
  const before = used(sh);
  assert.equal(out(sh, "find /var/log -name '*.gz' -mtime +30 -delete"), "");
  assert.equal(out(sh, "find /var/log -name '*.gz'"), "/var/log/net/relay.2.gz\n");
  assert.equal(before - used(sh), (64 * M) / 1024);
  assert.match(out(sh, "df -h /").split("\n")[1], /^\/dev\/vda1 +2\.0G +1\.6G +414M +80% \/$/);
  assert.equal(passes({ files_under: "/var/log", name: "*.gz", max_age: 30 }, sh.state(), sh.cwd, []), true);
});

// --- find ----------------------------------------------------------------------------------
test("find -exec runs a command per file, or once with +", () => {
  const sh = station();
  assert.equal(out(sh, "find old -name '*.log' -exec cat {} \\;"), "alpha\nbeta\n");
  assert.equal(out(sh, "find old -name '*.log' -exec echo got {} +"), "got old/a.log old/sub/b.log\n");
  assert.equal(out(sh, "find old -type f -exec grep -l zzz {} \\; -print"), "grep: invalid option -- 'l'\ngrep: invalid option -- 'l'\n");
  assert.equal(out(sh, "find old -newer old/a.log"), "");
  sh.run("touch old/a.log");
  assert.equal(out(sh, "find old -newer old/sub/b.log -type f"), "old/a.log\n");
});

test("find explains its mistakes as GNU find does", () => {
  const sh = station();
  assert.equal(out(sh, "find nope"), "find: ‘nope’: No such file or directory\n");
  assert.equal(out(sh, "find old -frob"), "find: unknown predicate `-frob'\n");
  assert.equal(out(sh, "find old -name"), "find: missing argument to `-name'\n");
  assert.equal(out(sh, "find old -exec ls {}"), "find: missing argument to `-exec'\n");
  assert.equal(out(sh, "find old -name x y"), "find: paths must precede expression: `y'\n");
  assert.equal(out(sh, "find old -type z"), "find: Unknown argument to -type: z\n");
  assert.equal(out(sh, "find /var/log -delete 2>&1 | head -1"), "find: cannot delete ‘/var/log’: Permission denied\n");
});

// --- disk, memory ----------------------------------------------------------------------------
test("du counts whole blocks, and free shows the exercise's memory", () => {
  const sh = station({ "/station/one-byte": file("x") });
  assert.equal(out(sh, "du -h one-byte"), "4.0K\tone-byte\n");
  assert.equal(out(sh, "du -ah old"), "4.0K\told/a.log\n4.0K\told/sub/b.log\n8.0K\told/sub\n16K\told\n");
  assert.equal(out(sh, "du -shc old one-byte"), "16K\told\n4.0K\tone-byte\n20K\ttotal\n");
  assert.equal(out(sh, "du /root"), "du: cannot read directory '/root': Permission denied\n4\t/root\n");
  assert.equal(out(sh, "free -h"),
    "               total        used        free      shared  buff/cache   available\n" +
    "Mem:           2.0Gi       820Mi       588Mi        12Mi       640Mi       1.2Gi\n" +
    "Swap:             0B          0B          0B\n");
});

test("Emptying a big log frees its space; appending grows it", () => {
  const sh = station();
  const before = used(sh);
  sh.run("echo more >> /var/log/o2/recent.log");
  assert.equal(+out(sh, "ls -l /var/log/o2/recent.log").split(/\s+/)[4], 30 * M + 5);
  sh.run("> /var/log/o2/scrubber.log");
  assert.equal(out(sh, "ls -l /var/log/o2/scrubber.log"), "-rw-r--r-- 1 cadet crew 0 Oct  8 09:00 /var/log/o2/scrubber.log\n");
  assert.equal(before - used(sh), (48 * M - 4096) / 1024);
});

// --- gzip -------------------------------------------------------------------------------------
test("gzip, zcat and gunzip round-trip a file", () => {
  const sh = station();
  assert.equal(out(sh, "gzip old/a.log; ls old"), "a.log.gz  sub\n");
  assert.equal(out(sh, "zcat old/a.log.gz"), "alpha\n");
  assert.equal(out(sh, "gunzip old/a.log.gz; cat old/a.log"), "alpha\n");
  assert.equal(out(sh, "gzip -k /var/log/o2/scrubber.log 2>&1"), "");
  assert.equal(+out(sh, "ls -l /var/log/o2/scrubber.log.gz").split(/\s+/)[4], 30 + 12 * M);
  assert.equal(out(sh, "gzip old; gzip old/a.log; gzip old/a.log.gz"),
    "gzip: old is a directory -- ignored\ngzip: old/a.log.gz already has .gz suffix -- unchanged\n");
  assert.equal(out(sh, "gunzip old/sub/b.log"), "gzip: old/sub/b.log: unknown suffix -- ignored\n");
  assert.equal(out(sh, "tar -xzf old/a.log.gz"), "tar: This does not look like a tar archive\ntar: Exiting with failure status due to previous errors\n");
});

// --- links -------------------------------------------------------------------------------------
test("Links: relative, dangling, to directories, removed and moved", () => {
  const sh = station();
  assert.equal(out(sh, "ln -s nowhere dangling; cat dangling"), "cat: dangling: No such file or directory\n");
  assert.equal(out(sh, "[ -e dangling ]; echo $?; [ -L dangling ]; echo $?"), "1\n0\n");
  assert.equal(out(sh, "ln -s /var/log/o2 o2; ls o2"), "2026-10-10.log  recent.log  scrubber.log  tiny-old.log\n");
  assert.equal(out(sh, "cat o2/2026-10-10.log; ls o2/*.log | head -1"), "O2 nominal\no2/2026-10-10.log\n");
  assert.equal(out(sh, "cd o2; pwd; cd /station"), "/var/log/o2\n"); // the real path (pwd -P)
  assert.equal(out(sh, "mkdir d; ln -s ../old/a.log d/; cat d/a.log"), "alpha\n"); // relative to the link
  assert.equal(out(sh, "readlink -f d/a.log"), "/station/old/a.log\n");
  // o2 is a link to a directory, so without -n ln puts the new link inside it.
  assert.equal(out(sh, "ln -s old o2; readlink /var/log/o2/old"), "old\n");
  assert.equal(out(sh, "ln -sfn old o2; readlink o2"), "old\n");
  assert.equal(out(sh, "rm o2; ls -d old"), "old\n"); // rm takes the link, not what it points at
  assert.equal(out(sh, "mv d/a.log moved; readlink moved; cat moved"), "../old/a.log\ncat: moved: No such file or directory\n");
  assert.equal(out(sh, "ln -s a b; ln -s b a; cat a"), "cat: a: Too many levels of symbolic links\n"); // a loop
  assert.equal(out(sh, "ln -s a b"), "ln: failed to create symbolic link 'b': File exists\n");
  assert.equal(out(sh, "ln old/a.log hard"), "ln: hard links aren't on the station console; make a symbolic one with ln -s TARGET NAME\n");
  assert.equal(out(sh, "cp current.log x 2>&1; ln -s old/a.log l; cp l copy; ls -l copy | cut -c1"), "cp: cannot stat 'current.log': No such file or directory\n-\n");
});

test("ls shows the year for files older than six months", () => {
  const sh = station({ "/station/ancient.log": file("x\n", { mtime: "2025-12-01T10:00:00" }) });
  assert.equal(out(sh, "ls -l ancient.log"), "-rw-r--r-- 1 cadet crew 2 Dec  1  2025 ancient.log\n");
});

test("tar that can't write its archive says so as GNU tar does, and reports nothing else (#76)", () => {
  const sh = station({ "/srv": dir("root"), "/srv/backups": dir("root") });
  assert.equal(
    out(sh, "tar -czf /srv/backups/old.tar.gz old 2>&1; echo $?"),
    "tar (child): /srv/backups/old.tar.gz: Cannot open: Permission denied\n" +
      "tar (child): Error is not recoverable: exiting now\n" +
      "tar: Child returned status 2\n" +
      "tar: Error is not recoverable: exiting now\n2\n",
  );
  assert.equal(
    out(sh, "tar -cf /nowhere/old.tar old missing 2>&1; echo $?"),
    "tar: /nowhere/old.tar: Cannot open: No such file or directory\ntar: Error is not recoverable: exiting now\n2\n",
  );
  assert.equal(out(sh, "ls /srv/backups"), "");
});

// stat -c (#206), against GNU coreutils 9.4 in ubuntu:24.04: the same files made the same way
// (f.txt chmod 640, a link to it, an empty file, a sticky directory) printed exactly this.
test("stat -c prints a mode as a number and as letters, as GNU stat does", () => {
  const sh = station({
    "/station/f.txt": file("hi\n", { mode: 0o640 }),
    "/station/l": { type: "link", target: "f.txt", mode: 0o777, owner: "cadet", group: "crew", contents: "" },
    "/station/e": file("", { mode: 0o664 }),
    "/station/d": dir("cadet", 0o1777),
  });
  const run = (line) => { const { output } = sh.run(line); return [output, sh.lastStatus]; };
  assert.deepEqual(run("stat -c '%a %A %n' f.txt d l e"), ["640 -rw-r----- f.txt\n1777 drwxrwxrwt d\n777 lrwxrwxrwx l\n664 -rw-rw-r-- e\n", 0]);
  assert.deepEqual(run("stat -L -c '%a %A %n' l"), ["640 -rw-r----- l\n", 0]);
  assert.deepEqual(run("stat -c '%a %%' f.txt"), ["640 %\n", 0]);
  assert.deepEqual(run("stat -c '%n is %a' f.txt"), ["f.txt is 640\n", 0]);
  assert.deepEqual(run("stat --format=%a f.txt"), ["640\n", 0]);
  assert.deepEqual(run("stat -c %a -L l"), ["640\n", 0]);
  assert.deepEqual(run("stat -c %s f.txt"), ["3\n", 0]);
  assert.deepEqual(run("stat -c %F f.txt d l e"), ["regular file\ndirectory\nsymbolic link\nregular empty file\n", 0]);
  assert.deepEqual(run("stat -c %q f.txt"), ["?\n", 0]);
  assert.deepEqual(run("stat -c %a nope f.txt"), ["stat: cannot statx 'nope': No such file or directory\n640\n", 1]);
  assert.deepEqual(run("stat"), ["stat: missing operand\nTry 'stat --help' for more information.\n", 1]);
  assert.deepEqual(run("stat -c"), ["stat: option requires an argument -- 'c'\nTry 'stat --help' for more information.\n", 1]);
  assert.deepEqual(run("stat -x f.txt"), ["stat: invalid option -- 'x'\nTry 'stat --help' for more information.\n", 1]);
  assert.match(run("stat f.txt")[0], /^stat: unsupported on the station console: /); // plain stat isn't simulated
});
