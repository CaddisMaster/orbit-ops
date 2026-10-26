// The station console's shell, part 10 of 13 (#255): users, processes and
// cron. id, sudo, usermod, ps, kill, jobs, free and crontab.
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var COMMANDS = S.COMMANDS, flags = S.flags, KiB = S.KiB, lines = S.lines, MiB = S.MiB, ok = S.ok,
    padLeft = S.padLeft, padRight = S.padRight, stamp = S.stamp, START_TIME = S.START_TIME,
    unlines = S.unlines, Shell = S.Shell, SHELL_PID = S.SHELL_PID, countLines = S.countLines,
    Nano = S.Nano, jobLine = S.jobLine, procName = S.procName, signalName = S.signalName,
    memHuman = S.memHuman;

  // --- crontab -------------------------------------------------------------------------
  var CRON_SPOOL = "/var/spool/cron/crontabs";
  var CRON_TEMP = "/tmp/crontab.Mr7KqZ/crontab";
  var CRONTAB_USAGE =
    "usage:\tcrontab [-u user] file\n\tcrontab [ -u user ] [ -i ] { -e | -l | -r }\n" +
    "\t\t(default operation is replace, per 1003.2)\n\t-e\t(edit user's crontab)\n\t-l\t(list user's crontab)\n\t-r\t(delete user's crontab)\n";
  // What `crontab -e` starts from on Ubuntu.
  var CRONTAB_TEMPLATE = [
    "# Edit this file to introduce tasks to be run by cron.",
    "# ",
    "# Each task to run has to be defined through a single line",
    "# indicating with different fields when the task will be run",
    "# and what command to run for the task",
    "# ",
    "# To define the time you can provide concrete values for",
    "# minute (m), hour (h), day of month (dom), month (mon),",
    "# and day of week (dow) or use '*' in these fields (for 'any').",
    "# ",
    "# Notice that tasks will be started based on the cron's system",
    "# daemon's notion of time and timezones.",
    "# ",
    "# Output of the crontab jobs (including errors) is sent through",
    "# email to the user the crontab file belongs to (unless redirected).",
    "# ",
    "# For example, you can run a backup of all your user accounts",
    "# at 5 a.m every week with:",
    "# 0 5 * * 1 tar -zcf /var/backups/home.tgz /home/",
    "# ",
    "# For more information see the manual pages of crontab(5) and cron(8)",
    "# ",
    "# m h  dom mon dow   command",
    "",
  ].join("\n");
  var CRON_FIELDS = [
    { name: "minute", lo: 0, hi: 59 },
    { name: "hour", lo: 0, hi: 23 },
    { name: "day-of-month", lo: 1, hi: 31 },
    { name: "month", lo: 1, hi: 12, names: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], first: 1 },
    { name: "day-of-week", lo: 0, hi: 7, names: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"], first: 0 },
  ];
  var CRON_SPECIALS = ["reboot", "yearly", "annually", "monthly", "weekly", "daily", "midnight", "hourly"];

  // One time field: *, N, N-M, lists of those, each with an optional /STEP.
  function cronField(text, f) {
    function value(t) {
      if (/^\d+$/.test(t)) return +t >= f.lo && +t <= f.hi ? +t : null;
      var i = f.names ? f.names.indexOf(t.toLowerCase()) : -1;
      return i === -1 ? null : i + f.first;
    }
    return text.split(",").every(function (item) {
      var m = /^(?:(\*)|([0-9A-Za-z]+)(?:-([0-9A-Za-z]+))?)(?:\/(\d+))?$/.exec(item);
      if (!m || (m[4] !== undefined && +m[4] === 0)) return false;
      if (m[1]) return true;
      var a = value(m[2]);
      var b = m[3] === undefined ? a : value(m[3]);
      return a !== null && b !== null && a <= b;
    });
  }

  // Check a crontab as cron loads it: "FILE":LINE: bad FIELD, per bad line.
  function checkCrontab(text, file) {
    var errors = "";
    lines(text).forEach(function (line, i) {
      var t = line.trim();
      if (!t || t[0] === "#" || /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(t)) return;
      var where = '"' + file + '":' + (i + 1) + ": ";
      if (t[0] === "@") {
        var at = /^@(\S+)\s*(.*)$/.exec(t);
        if (CRON_SPECIALS.indexOf(at[1]) === -1) errors += where + "bad time specifier\n";
        else if (!at[2]) errors += where + "bad command\n";
        return;
      }
      var parts = t.split(/\s+/);
      for (var k = 0; k < CRON_FIELDS.length; k++) {
        if (parts[k] === undefined || !cronField(parts[k], CRON_FIELDS[k])) { errors += where + "bad " + CRON_FIELDS[k].name + "\n"; return; }
      }
      if (parts.length < 6) errors += where + "bad command\n";
    });
    return errors || null;
  }

  // The spool is root's, mode 1730, so users can't read it directly: crontab
  // (setgid crontab on a real system) is the way in and out.
  Shell.prototype.installCrontab = function (text) {
    var fs = this.fs;
    var now = this.now();
    var dirs = [["/var", 0o755, "root"], ["/var/spool", 0o755, "root"], ["/var/spool/cron", 0o755, "root"], [CRON_SPOOL, 0o1730, "crontab"]];
    dirs.forEach(function (d) {
      if (!fs[d[0]]) fs[d[0]] = { type: "dir", mode: d[1], owner: "root", group: d[2], contents: "", mtime: now };
    });
    fs[CRON_SPOOL + "/" + this.user] = { type: "file", mode: 0o600, owner: this.user, group: "crontab", contents: text, mtime: this.now() };
  };

  Object.assign(COMMANDS, {

    // free [-h|-m]: the exercise's memory.
    free: function (rawArgs) {
      var p = flags("free", rawArgs, "hmk");
      var m = this.memory;
      var free = Math.max(0, m.total - m.used - m.cache);
      var available = Math.min(m.total, free + m.cache);
      var show = function (n) {
        if (p.opts.h) return memHuman(n);
        return String(Math.round(n / (p.opts.m ? MiB : KiB)));
      };
      var row = function (label, values) {
        return label + values.map(function (v, k) { return padLeft(show(v), k ? 12 : 20 - label.length); }).join("") + "\n";
      };
      return ok("               total        used        free      shared  buff/cache   available\n" +
        row("Mem:", [m.total, m.used, free, m.shared || 0, m.cache, available]) + row("Swap:", [0, 0, 0]));
    },

    // crontab: install, list, edit or remove this user's table for cron. It's
    // checked as cron would read it, and refused with cron's messages if it's
    // wrong. Nothing runs on a schedule: a task's checks read the file.
    crontab: function* (args, stdin, io) {
      var user = this.user;
      var spool = CRON_SPOOL + "/" + user;
      var current = this.fs[spool] ? this.fs[spool].contents : null;
      var op = args[0];
      if (op === "-l") return current === null ? { out: "", err: "no crontab for " + user + "\n", code: 1 } : ok(current);
      if (op === "-r") {
        if (current === null) return { out: "", err: "no crontab for " + user + "\n", code: 1 };
        delete this.fs[spool];
        return ok();
      }
      if (op === "-e") {
        if (!io.tty || !io.stdin.tty) return { out: "", err: "crontab: the editor needs the console's screen\n", code: 1 };
        var original = current === null ? CRONTAB_TEMPLATE : current;
        var text = original;
        for (;;) {
          var edited = null;
          var editor = new Nano({
            name: CRON_TEMP,
            text: text,
            message: "[ Read " + countLines(text) + " lines ]",
            save: function (body) { edited = body; return { ok: true }; },
          });
          yield { editor: editor };
          if (edited === null || edited === original) return { out: "", err: "crontab: no changes made to crontab\n", code: 0 };
          var errors = checkCrontab(edited, CRON_TEMP);
          if (!errors) {
            this.installCrontab(edited);
            return { out: "", err: "crontab: installing new crontab\n", code: 0 };
          }
          io.err.write(errors + "errors in crontab file, can't install.\n");
          var again = yield { prompt: "Do you want to retry the same edit? (y/n) " };
          if (!/^\s*y/i.test(again || "")) return { out: "", err: "crontab: edits left in " + CRON_TEMP + "\n", code: 1 };
          text = edited;
        }
      }
      if (op === undefined) return { out: "", err: "crontab: usage error: file name or - (for stdin) must be specified\n" + CRONTAB_USAGE, code: 1 };
      if (op[0] === "-" && op !== "-") return { out: "", err: "crontab: invalid option -- '" + op.slice(1) + "'\n" + CRONTAB_USAGE, code: 1 };
      var source;
      if (op === "-") { if (this.reading) this.reading.used = true; source = { text: stdin }; }
      else source = this.readFile("crontab", op);
      if (source.error) return { out: "", err: source.error + "\n", code: 1 };
      if (source.text !== "" && source.text.slice(-1) !== "\n") {
        return { out: "", err: "new crontab file is missing newline before EOF, can't install.\n", code: 1 };
      }
      var problems = checkCrontab(source.text, op === "-" ? "-" : op);
      if (problems) return { out: "", err: problems + "errors in crontab file, can't install.\n", code: 1 };
      this.installCrontab(source.text);
      return ok();
    },
    whoami: function () { return ok(this.user + "\n"); },
    id: function (args) {
      // With no name: this login's credentials, fixed when it started. With a
      // name: what the account database says now (so a usermod shows here
      // before it reaches your session).
      var name = args[0] || this.user;
      var acct = this.account(name);
      if (!acct) return { out: "", err: "id: '" + name + "': no such user\n", code: 1 };
      var groups = args[0] ? this.groupsOf(name) : this.groups;
      var sh = this;
      var primary = args[0] ? groups[0] : this.group;
      var gid = function (g) { return name === "root" && g === "root" ? 0 : sh.gid(g); };
      return ok("uid=" + acct.uid + "(" + name + ") gid=" + gid(primary) + "(" + primary + ") groups=" +
        groups.map(function (g) { return gid(g) + "(" + g + ")"; }).join(",") + "\n");
    },
    groups: function (args) {
      if (!args.length) return ok(this.groups.join(" ") + "\n");
      var sh = this;
      var out = "", err = "";
      args.forEach(function (n) {
        if (!sh.account(n)) err += "groups: '" + n + "': no such user\n";
        else out += n + " : " + sh.groupsOf(n).join(" ") + "\n";
      });
      return { out: out, err: err, code: err ? 1 : 0 };
    },
    getent: function (args) {
      if (args[0] === "hosts") return this.getentHosts(args.slice(1));
      var dbs = { passwd: "/etc/passwd", group: "/etc/group" };
      if (!dbs[args[0]]) return { out: "", err: "Unknown database: " + (args[0] || "") + "\nTry `getent --help' or `getent --usage' for more information.\n", code: 1 };
      var rows = this.db(dbs[args[0]]);
      var keys = args.slice(1);
      if (!keys.length) return ok(unlines(rows.map(function (r) { return r.join(":"); })));
      var out = [];
      var missing = false;
      keys.forEach(function (k) {
        var row = rows.filter(function (r) { return r[0] === k; })[0];
        if (row) out.push(row.join(":")); else missing = true;
      });
      return { out: unlines(out), err: "", code: missing ? 2 : 0 };
    },
    usermod: function (rawArgs) {
      if (this.user !== "root") {
        return { out: "", err: "usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.\n", code: 1 };
      }
      var p = flags("usermod", rawArgs, "a", "G");
      var name = p.args[0];
      if (!name || p.opts.G === undefined) throw new Error("usage: usermod [-a] -G GROUP[,GROUP...] USER");
      if (!this.account(name)) return { out: "", err: "usermod: user '" + name + "' does not exist\n", code: 6 };
      var wanted = p.opts.G.split(",").filter(Boolean);
      var node = this.fs["/etc/group"];
      var rows = this.db("/etc/group");
      var bad = wanted.filter(function (g) { return !rows.some(function (r) { return r[0] === g; }); });
      if (bad.length) return { out: "", err: "usermod: group '" + bad[0] + "' does not exist\n", code: 6 };
      var acct = this.account(name);
      rows.forEach(function (r) {
        var members = (r[3] || "").split(",").filter(Boolean);
        var has = members.indexOf(name) !== -1;
        var want = wanted.indexOf(r[0]) !== -1;
        if (+r[2] === acct.gid) return; // the primary group is never touched
        if (want && !has) members.push(name);
        // Without -a, -G REPLACES the supplementary groups: every other one is dropped.
        if (!want && has && !p.opts.a) members = members.filter(function (m) { return m !== name; });
        r[3] = members.join(",");
        while (r.length < 4) r.push("");
      });
      node.contents = unlines(rows.map(function (r) { return r.join(":"); }));
      node.mtime = this.now();
      return ok();
    },
    sudo: function* (rawArgs, stdin, io) {
      var args = rawArgs.slice();
      var who = "root";
      var mode = "run";
      while (args.length && args[0][0] === "-") {
        var a = args.shift();
        if (a === "-u") who = args.shift();
        else if (a === "-l") mode = "list";
        else if (a === "-i") mode = "login";
        else if (a === "-k") { this.sudoUntil = -1; return ok(); }
        else if (a === "--") break;
        else return { out: "", err: "sudo: invalid option -- '" + a.replace(/^-+/, "") + "'\n", code: 1 };
      }
      if (mode === "run" && !args.length) return { out: "", err: "usage: sudo -h | -K | -k | -V\nusage: sudo [-u user] command [arg ...]\n", code: 1 };
      if (!this.account(who)) return { out: "", err: "sudo: unknown user " + who + "\n", code: 1 };
      var sh = this;
      if (this.user !== "root" && this.clock >= this.sudoUntil) {
        if (!this.password) return { out: "", err: "sudo: there's no password for " + this.user + " on this console, so sudo can't be used here\n", code: 1 };
        for (var tries = 1; ; tries++) {
          var answer = yield { prompt: "[sudo] password for " + this.user + ": ", secret: true };
          if (answer === this.password) break;
          if (tries === 3) return { out: "", err: "sudo: 3 incorrect password attempts\n", code: 1 };
          this.tty.write("Sorry, try again.\n"); // sudo talks to the terminal, whatever 2> says
        }
        this.sudoUntil = this.clock + 15 * 60;
      }
      if (!this.isSudoer()) return { out: "", err: this.user + " is not in the sudoers file.\n", code: 1 };
      if (mode === "list") {
        return ok("User " + this.user + " may run the following commands on meridian:\n    (ALL : ALL) ALL\n");
      }
      if (mode === "login") {
        this.logins.push({ user: this.user, group: this.group, groups: this.groups, cwd: this.cwd, oldpwd: this.oldpwd,
          home: this.home, vars: this.vars, exported: this.exported });
        var vars = {};
        Object.keys(this.vars).forEach(function (k) { if (sh.exported[k]) vars[k] = sh.vars[k]; });
        var acct = this.account(who);
        this.user = who;
        this.groups = this.groupsOf(who).length ? this.groupsOf(who) : [who];
        this.group = this.groups[0];
        this.home = acct.home;
        this.cwd = this.fs[acct.home] ? acct.home : "/";
        vars.HOME = this.home; vars.USER = who; vars.LOGNAME = who; vars.PWD = this.cwd;
        this.vars = vars;
        return ok();
      }
      return yield* this.runAs(who, args, stdin, io);
    },
    // --- processes ---
    sleep: function (args) {
      var m = /^(\d+)(s?)$/.exec(args[0] || "");
      if (!m) throw new Error(args.length ? "invalid time interval '" + args[0] + "'" : "missing operand");
      this.clock += parseInt(m[1], 10); // it would block that long; simulated time jumps instead
      this.reap();
      return ok();
    },
    jobs: function (rawArgs) {
      var p = flags("jobs", rawArgs, "l");
      var sh = this;
      this.reap();
      var out = unlines(this.jobs.map(function (j) {
        var line = jobLine(j, sh.jobs, true);
        return p.opts.l ? line.replace(/^(\[\d+\][+\- ])  /, "$1  " + j.pid + " ") : line;
      }));
      // Listing a finished job is how bash tells you, so it's forgotten after.
      this.jobs = this.jobs.filter(function (j) { return j.state === "Running"; });
      this.notices = [];
      return ok(out);
    },
    fg: function (args) {
      var job = this.findJob(args[0]);
      if (!job) return { out: "", err: "bash: fg: " + (args[0] || "current") + ": no such job\n", code: 1 };
      var proc = this.procs.filter(function (pr) { return pr.job === job; })[0];
      if (proc && proc.alive) { this.clock = Math.max(this.clock, proc.end); proc.alive = false; }
      this.jobs = this.jobs.filter(function (j) { return j !== job; });
      return ok(job.text + "\n");
    },
    bg: function (args) {
      var job = this.findJob(args[0]);
      if (!job) return { out: "", err: "bash: bg: " + (args[0] || "current") + ": no such job\n", code: 1 };
      return { out: "", err: "bash: bg: job " + job.n + " already in background\n", code: 0 };
    },
    kill: function (rawArgs) {
      var args = rawArgs.slice();
      var sig = "TERM";
      if (args[0] === "-l") return ok(" 1) SIGHUP\t 2) SIGINT\t 9) SIGKILL\t15) SIGTERM\n");
      if (args[0] === "-s") { args.shift(); sig = signalName(args.shift() || ""); }
      else if (args[0] && args[0][0] === "-" && args[0] !== "-") sig = signalName(args.shift().slice(1));
      if (!sig) return { out: "", err: "bash: kill: invalid signal specification\n", code: 1 };
      if (!args.length) return { out: "", err: "kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]\n", code: 2 };
      var sh = this;
      var err = "";
      args.forEach(function (t) {
        var target;
        if (t[0] === "%") {
          var job = sh.findJob(t);
          target = job && job.state === "Running" ? sh.procs.filter(function (pr) { return pr.job === job && pr.alive; })[0] : null;
          if (!target) { err += "bash: kill: " + t + ": no such job\n"; return; }
        } else {
          target = sh.alive().filter(function (pr) { return String(pr.pid) === t; })[0];
          if (!/^\d+$/.test(t)) { err += "bash: kill: " + t + ": arguments must be process or job IDs\n"; return; }
          if (!target) { err += "bash: kill: (" + t + ") - No such process\n"; return; }
        }
        var why = sh.signal(target, sig);
        if (why) err += "bash: kill: (" + target.pid + ") - " + why + "\n";
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    pkill: function (rawArgs) {
      var args = rawArgs.slice();
      var sig = "TERM";
      if (args[0] && /^-[A-Z0-9]+$/i.test(args[0]) && signalName(args[0].slice(1))) sig = signalName(args.shift().slice(1));
      var p = flags("pkill", args, "f", "u");
      var matched = this.matching(p);
      var sh = this;
      var err = "";
      matched.forEach(function (pr) {
        var why = sh.signal(pr, sig);
        if (why) err += "pkill: killing pid " + pr.pid + " failed: " + why + "\n";
      });
      return { out: "", err: err, code: matched.length ? (err ? 1 : 0) : 1 };
    },
    pgrep: function (rawArgs) {
      var p = flags("pgrep", rawArgs, "afl", "u");
      var matched = this.matching(p);
      return {
        out: unlines(matched.map(function (pr) {
          return pr.pid + (p.opts.a ? " " + pr.command.replace(/^-/, "") : p.opts.l ? " " + procName(pr.command) : "");
        })),
        err: "",
        code: matched.length ? 0 : 1,
      };
    },
    ps: function (rawArgs) {
      var opts = rawArgs.join(" ");
      var sort = /--sort=(-?)%?(cpu|mem|pid)/.exec(opts);
      var all = /(^|\s)-?a?u?x|(^|\s)-e|(^|\s)-A|aux/.test(opts);
      var sh = this;
      var self_ = { pid: this.nextPid++, ppid: SHELL_PID, user: this.user, command: "ps " + opts, tty: "pts/0", cpu: 0, mem: 0.0, start: this.clock, alive: true };
      var list = this.alive().concat([self_]);
      if (!all) list = list.filter(function (pr) { return pr.tty === "pts/0" && pr.user === sh.user; });
      list.sort(function (a, b) { return a.pid - b.pid; });
      if (sort) {
        var key = sort[2];
        list.sort(function (a, b) { return (a[key] - b[key]) * (sort[1] ? -1 : 1); });
      }
      function started(pr) { return pr.start < 0 ? "Oct08" : stamp(new Date(START_TIME.getTime() + pr.start * 1000)).slice(-5); }
      // CPU time used so far: %CPU of the time the process has been running.
      function two(n) { return (n < 10 ? "0" : "") + n; }
      function seconds(pr) { return Math.round((pr.cpu / 100) * Math.max(0, sh.clock - pr.start)); }
      function cputime(pr) { var t = seconds(pr); return Math.floor(t / 60) + ":" + two(t % 60); } // aux: M:SS
      function hms(pr) { var t = seconds(pr); return two(Math.floor(t / 3600)) + ":" + two(Math.floor(t / 60) % 60) + ":" + two(t % 60); }
      if (/-e|-A/.test(opts) && /f/.test(opts)) {
        return ok(unlines(["UID          PID    PPID  C STIME TTY          TIME CMD"].concat(list.map(function (pr) {
          return padRight(pr.user, 8) + " " + padLeft(pr.pid, 7) + " " + padLeft(pr.ppid, 7) + " " + padLeft(Math.round(pr.cpu), 2) + " " +
            padRight(started(pr), 5) + " " + padRight(pr.tty, 8) + " " + hms(pr) + " " + pr.command;
        }))));
      }
      if (all) {
        return ok(unlines(["USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND"].concat(list.map(function (pr) {
          var stat = pr.cpu > 50 ? "R" : pr.tty === "pts/0" && pr.pid === SHELL_PID ? "Ss" : "S";
          return padRight(pr.user, 8) + " " + padLeft(pr.pid, 7) + " " + padLeft(pr.cpu.toFixed(1), 4) + " " + padLeft(pr.mem.toFixed(1), 4) + " " +
            padLeft(8000 + (pr.pid * 37) % 90000, 6) + " " + padLeft(900 + (pr.pid * 13) % 9000, 5) + " " + padRight(pr.tty, 8) + " " +
            padRight(stat, 4) + " " + padRight(started(pr), 5) + " " + padLeft(cputime(pr), 6) + " " + pr.command;
        }))));
      }
      return ok(unlines(["    PID TTY          TIME CMD"].concat(list.map(function (pr) {
        return padLeft(pr.pid, 7) + " " + padRight(pr.tty, 8) + " 00:00:00 " + procName(pr.command);
      }))));
    },
    top: function () { return { out: "", err: "top: full-screen programs don't run on the station console. Try: ps aux --sort=-%cpu | head\n", code: 1 }; },
    htop: function () { return COMMANDS.top.call(this); },
  });

  Object.assign(S, { checkCrontab: checkCrontab });
});
