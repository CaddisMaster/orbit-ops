// The station console's shell, part 13 of 13 (#303): systemd. systemctl over
// unit files that are ordinary files, read live: vendor units in
// /usr/lib/systemd/system, the admin's in /etc/systemd/system (which wins).
// Enabling is a link in a target's .wants/ directory, as `systemctl enable`
// makes, so the filesystem says what starts at boot. What's running is
// runtime state: each unit's state, and a process `ps` can see for a running
// service. Output follows systemd 255 on Ubuntu 24.04, checked against the
// real one booted in a container.
//
// The console can't run a unit's program, so the exercise says what it does
// (schema/terminal/services.py SystemdUnit): run until stopped, or exit with
// a status after some seconds. A Type=oneshot service is `activating` while
// its program runs and `start` waits for it, as systemd's does (#329). Time
// is the station clock's (sh.now()).
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var COMMANDS = S.COMMANDS, DAYS = S.DAYS, join = S.join, lines = S.lines, MONTHS = S.MONTHS, ok = S.ok,
    padLeft = S.padLeft, padRight = S.padRight, parseStamp = S.parseStamp, procName = S.procName, Shell = S.Shell,
    START_TIME = S.START_TIME, unlines = S.unlines;

  var VENDOR_DIR = "/usr/lib/systemd/system";
  var ADMIN_DIR = "/etc/systemd/system";
  var BOOT = -3600; // units at boot started an hour before login, like the exercise's processes
  var START_LIMIT = 5; // starts within START_WINDOW seconds before systemd gives up (StartLimitBurst)
  var START_WINDOW = 10;
  // Exit statuses systemd names (the LSB ones, and its own for a failed exec).
  var STATUS_NAMES = { 0: "SUCCESS", 1: "FAILURE", 2: "INVALIDARGUMENT", 3: "NOTIMPLEMENTED", 4: "NOPERMISSION", 5: "NOTINSTALLED",
    6: "NOTCONFIGURED", 7: "NOTRUNNING", 203: "EXEC", 217: "USER" };
  var DENIED = "Interactive authentication required.";

  // --- unit files -------------------------------------------------------------------------
  // A unit file as {Section: {Key: [values]}}, as schema/terminal/services.py parse_unit reads it.
  function parseUnit(text) {
    var sections = {};
    var current = null;
    lines(text || "").forEach(function (raw) {
      var line = raw.trim();
      if (!line || line[0] === "#" || line[0] === ";") return;
      var head = /^\[([A-Za-z]+)\]$/.exec(line);
      if (head) { current = sections[head[1]] = sections[head[1]] || {}; return; }
      var eq = line.indexOf("=");
      if (!current || eq === -1) return;
      var key = line.slice(0, eq).trim();
      (current[key] = current[key] || []).push(line.slice(eq + 1).trim());
    });
    return sections;
  }
  function last(sections, section, key) {
    var v = (sections[section] || {})[key];
    return v && v.length ? v[v.length - 1] : null;
  }
  function unitName(arg) { return /\.(service|timer|target|socket)$/.test(arg) ? arg : arg + ".service"; }
  function kindOf(name) { return name.slice(name.lastIndexOf(".") + 1); }

  // --- time, as systemd prints it -------------------------------------------------------------
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function clockDate(t) { return new Date(START_TIME.getTime() + t * 1000); }
  function timestamp(d) {
    return DAYS[d.getDay()] + " " + d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " +
      pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) + " UTC";
  }
  // "11h", "4min 3s", "1 day 2h": systemd's format_timestamp_relative, in seconds.
  function relative(s) {
    var m = 60, h = 3600, d = 86400;
    if (s >= 7 * d) return Math.floor(s / (7 * d)) + " weeks " + Math.floor((s % (7 * d)) / d) + " days";
    if (s >= 2 * d) return Math.floor(s / d) + " days";
    if (s >= 25 * h) return "1 day " + Math.floor((s - d) / h) + "h";
    if (s >= 6 * h) return Math.floor(s / h) + "h";
    if (s >= h) return Math.floor(s / h) + "h " + Math.floor((s % h) / m) + "min";
    if (s >= 5 * m) return Math.floor(s / m) + "min";
    if (s >= m) return Math.floor(s / m) + "min " + (s % m) + "s";
    if (s >= 1) return s + "s";
    return "now";
  }
  // "4min 35s", "2d 3h": systemd's format_timespan, whole seconds. A program
  // that ends at once ran for a couple of milliseconds, as the real one shows.
  function timespan(s) {
    if (s <= 0) return "2ms";
    var parts = [];
    [["d", 86400], ["h", 3600], ["min", 60], ["s", 1]].forEach(function (u) {
      if (s >= u[1]) { parts.push(Math.floor(s / u[1]) + u[0]); s %= u[1]; }
    });
    return parts.join(" ");
  }

  // OnCalendar's next time after `after` (a Date), for the forms services.py
  // valid_calendar accepts: a shorthand, or [DAY ]*-*-* HH:MM[:SS] where the
  // hour and minute may be *, a number, or START/STEP (`*:00/15`: 00, 15, 30
  // and 45). systemd has no */N form (#329).
  function calendarNext(spec, after) {
    var shorthands = { minutely: "*-*-* *:*:00", hourly: "*-*-* *:00:00", daily: "*-*-* 00:00:00", weekly: "Mon *-*-* 00:00:00" };
    if (spec === "monthly") {
      return new Date(after.getFullYear(), after.getMonth() + 1, 1);
    }
    var full = shorthands[spec] || spec;
    var p = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?\*-\*-\* (\d{1,2}|\*|\d{1,2}\/\d{1,2}):(\d{1,2}|\*|\d{1,2}\/\d{1,2})(?::(\d{1,2}))?$/.exec(full);
    if (!p) return null;
    // A START/STEP must repeat within its field, or systemd refuses the whole spec (`*:45/15`).
    var repeats = function (field, top) {
      var step = field.split("/");
      return step.length !== 2 || (+step[1] > 0 && +step[0] + +step[1] <= top);
    };
    if (!repeats(p[2], 23) || !repeats(p[3], 59)) return null;
    var fits = function (field, n) {
      if (field === "*") return true;
      var step = field.split("/");
      if (step.length === 2) return n >= +step[0] && (n - +step[0]) % +step[1] === 0;
      return n === +field;
    };
    var second = p[4] === undefined ? 0 : +p[4];
    var t = new Date(after.getTime());
    t.setSeconds(second, 0);
    if (t <= after) t = new Date(t.getTime() + 60000);
    for (var i = 0; i < 8 * 24 * 60; i++, t = new Date(t.getTime() + 60000)) {
      if (p[1] && DAYS[t.getDay()] !== p[1]) continue;
      if (fits(p[2], t.getHours()) && fits(p[3], t.getMinutes())) return t;
    }
    return null;
  }

  // --- the manager's state -----------------------------------------------------------------
  // Boot: every unit the exercise lists starts as it says. Called by the Shell
  // constructor (machine.js) once the filesystem is in place.
  Shell.prototype.bootUnits = function (specs, journal) {
    var sh = this;
    this.sd = { programs: {}, units: {}, bootPid: 600, journal: [], invocations: 0 };
    // #304: the journal so far. Entries from before this boot are the last boot's.
    (journal || []).forEach(function (e) {
      var t = Math.round((parseStamp(e.time) - START_TIME) / 1000);
      sh.sd.journal.push({ t: t, ident: e.identifier, pid: e.pid === undefined ? null : e.pid, unit: e.unit || null,
        prio: PRIORITIES.indexOf(e.priority || "info"), msg: e.message });
    });
    (specs || []).forEach(function (s) {
      sh.sd.programs[s.name] = { exits: s.exits === undefined ? null : s.exits, runsFor: s.runs_for || 0 };
      var u = sh.unit(s.name);
      if (!u.path) return;
      if (s.state === "active") sh.activate(u, BOOT);
      else if (s.state === "failed") {
        u.pid = sh.sd.bootPid;
        sh.sd.bootPid += 23;
        Object.assign(u, { state: "failed", result: "exit-code", since: BOOT, started: BOOT, ended: { code: s.exits || 1, at: BOOT } });
        u.inv = ++sh.sd.invocations;
        sh.logUnit(u, BOOT, 6, "Started " + titled(u) + ".");
        sh.logUnit(u, BOOT, 5, u.name + ": Main process exited, " + exitStatus(u.ended));
        sh.logUnit(u, BOOT, 4, u.name + ": Failed with result 'exit-code'.");
      }
    });
  };

  // Where a unit's file is: /etc/systemd/system's copy first, then the vendor's.
  Shell.prototype.unitPath = function (name) {
    var sh = this;
    var found = null;
    [ADMIN_DIR, VENDOR_DIR].some(function (dir) {
      var f = sh.lookup(join(dir, name));
      if (f.node && f.node.type === "file") found = join(dir, name);
      return !!found;
    });
    return found;
  };

  // The manager's record of a unit, made (and its file loaded) on first use.
  // `text` is the definition systemd loaded, which a daemon-reload refreshes.
  Shell.prototype.unit = function (name) {
    if (!this.sd) this.bootUnits([]);
    var u = this.sd.units[name];
    if (!u) {
      var path = this.unitPath(name);
      u = { name: name, kind: kindOf(name), path: path, text: path ? this.fs[path].contents : null, state: "inactive",
        result: null, since: null, started: null, pid: null, proc: null, ended: null, restarted: false, starts: [], restarts: 0 };
      if (path) this.sd.units[name] = u;
    }
    return u;
  };
  Shell.prototype.loadedUnits = function () {
    this.syncUnits();
    var units = this.sd.units;
    return Object.keys(units).sort().map(function (n) { return units[n]; });
  };
  // Every unit file on disk, admin copies hiding vendor ones.
  Shell.prototype.unitFiles = function () {
    var sh = this;
    var seen = {};
    [ADMIN_DIR, VENDOR_DIR].forEach(function (dir) {
      if (!sh.fs[dir]) return;
      sh.children(dir).forEach(function (n) {
        var node = sh.fs[join(dir, n)];
        if (/\.(service|timer)$/.test(n) && node.type === "file" && !(n in seen)) seen[n] = join(dir, n);
      });
    });
    return Object.keys(seen).sort().map(function (n) { return { name: n, path: seen[n] }; });
  };
  // enabled, disabled or static, from the links in .wants/ and the file's [Install].
  Shell.prototype.enabledState = function (name) {
    var sh = this;
    var path = this.unitPath(name);
    if (!path) return null;
    var linked = this.fs[ADMIN_DIR] && this.children(ADMIN_DIR).some(function (d) {
      var node = sh.fs[join(join(ADMIN_DIR, d), name)];
      return /\.wants$/.test(d) && node && node.type === "link";
    });
    if (linked) return "enabled";
    return wantedBy(parseUnit(this.fs[path].contents)).length ? "disabled" : "static";
  };
  function wantedBy(sections) {
    return ((sections.Install || {}).WantedBy || []).join(" ").split(/\s+/).filter(Boolean);
  }

  // Start a unit's program at time `t`: a process for a service, waiting for a timer.
  Shell.prototype.activate = function (u, t) {
    var sec = parseUnit(u.text);
    u.started = t;
    u.since = t;
    u.ended = null;
    u.result = null;
    u.inv = ++this.sd.invocations; // each start is an invocation: status shows the latest one's lines
    u.starting = u.kind === "service" && oneshot(u);
    this.logUnit(u, t, 6, (u.starting ? "Starting " : "Started ") + titled(u) + (u.starting ? "..." : "."));
    if (u.kind === "timer") { u.state = "active"; return; }
    var start = (last(sec, "Service", "ExecStart") || "").replace(/^[-@+!]+/, "");
    var program = start.split(/\s+/)[0];
    var user = last(sec, "Service", "User") || "root";
    var behaviour = this.sd.programs[u.name] || { exits: null, runsFor: 0 };
    // Boot's services have low PIDs, as on a real machine; later ones come after the shell's.
    var pid = t === BOOT ? this.sd.bootPid : this.nextPid++;
    if (t === BOOT) this.sd.bootPid += 23;
    u.pid = pid;
    u.starts.push(t);
    var file = program ? this.lookup(program) : { error: true };
    var why = file.error || file.node.type !== "file" || !(file.node.mode & 0o111) ? 203 : !this.account(user) ? 217 : null;
    if (why) {
      u.proc = null;
      u.starting = false;
      u.state = "failed";
      u.result = "exit-code";
      u.ended = { code: why, at: t };
      if (why === 217) {
        // Logged by the forked child before it runs anything: systemd names it
        // "(" + the program, first letter dropped, + ")", as the real one showed.
        var base = program.slice(program.lastIndexOf("/") + 1);
        this.sd.journal.push({ t: t, ident: "(" + base.slice(1) + ")", pid: pid, unit: u.name, prio: 3, inv: u.inv,
          msg: u.name + ": Failed to determine user credentials: No such process" });
      }
      this.logUnit(u, t, 5, u.name + ": Main process exited, " + exitStatus(u.ended));
      this.logUnit(u, t, 4, u.name + ": Failed with result 'exit-code'.");
      if (oneshot(u)) this.logUnit(u, t, 3, "Failed to start " + titled(u) + ".");
      return;
    }
    var proc = { pid: pid, ppid: 1, user: user, command: start, tty: "?", cpu: 0, mem: 0.1, start: t, alive: true,
      signals: [], ignores: [], unit: u.name };
    // A oneshot's program does its work and exits, cleanly unless the exercise says otherwise.
    var exits = behaviour.exits !== null ? behaviour.exits : u.starting ? 0 : null;
    if (exits !== null) { proc.end = t + behaviour.runsFor; proc.exits = exits; }
    this.procs.push(proc);
    u.proc = proc;
    u.state = u.starting ? "activating" : "active";
  };
  function oneshot(u) { return last(parseUnit(u.text), "Service", "Type") === "oneshot"; }

  // Catch the units up with the clock: a program that exited, or was killed,
  // leaves its unit inactive or failed, and Restart= may bring it back.
  Shell.prototype.syncUnits = function () {
    if (!this.sd) this.bootUnits([]);
    var sh = this;
    Object.keys(this.sd.units).forEach(function (n) {
      var u = sh.sd.units[n];
      for (var guard = 0; guard < 50 && u.kind === "service"; guard++) {
        if (u.state === "activating" && !u.starting) {
          if (u.restartAt > sh.clock) return;
          u.restarts += 1;
          sh.logUnit(u, u.restartAt, 6, u.name + ": Scheduled restart job, restart counter is at " + u.restarts + ".");
          var recent = u.starts.filter(function (s) { return s > u.restartAt - START_WINDOW; });
          if (recent.length >= START_LIMIT) {
            u.state = "failed";
            sh.logUnit(u, u.restartAt, 4, u.name + ": Start request repeated too quickly.");
            sh.logUnit(u, u.restartAt, 4, u.name + ": Failed with result '" + u.result + "'.");
            sh.logUnit(u, u.restartAt, 3, "Failed to start " + titled(u) + ".");
            return;
          }
          sh.activate(u, u.restartAt);
          u.restarted = true;
          continue;
        }
        var p = u.proc;
        if ((u.state !== "active" && !u.starting) || !p) return;
        // It exited if its time came before anything killed it (reap() may
        // have marked it dead at that time, without a signal).
        var byExit = p.end !== undefined && p.end <= sh.clock && (p.diedAt === undefined || p.end <= p.diedAt);
        if (!byExit && (p.alive || p.diedAt === undefined)) return;
        var at = byExit ? p.end : p.diedAt;
        var sig = byExit ? null : p.signals[p.signals.length - 1];
        p.alive = false;
        u.ended = sig ? { signal: sig, at: at } : { code: p.exits, at: at };
        u.proc = null;
        var clean = sig ? sig !== "KILL" : p.exits === 0;
        u.result = clean ? "success" : sig ? "signal" : "exit-code";
        u.since = at;
        var started = u.starting;
        u.starting = false;
        if (clean) sh.logUnit(u, at, 6, u.name + ": Deactivated successfully.");
        else {
          sh.logUnit(u, at, sig ? 4 : 5, u.name + ": Main process exited, " + exitStatus(u.ended));
          sh.logUnit(u, at, 4, u.name + ": Failed with result '" + u.result + "'.");
        }
        // A oneshot that was still starting says how its start went.
        if (started) sh.logUnit(u, at, clean ? 6 : 3, (clean ? "Finished " : "Failed to start ") + titled(u) + ".");
        var restart = last(parseUnit(u.text), "Service", "Restart") || "no";
        if (restart === "always" || (restart === "on-failure" && !clean)) {
          var delay = parseFloat(last(parseUnit(u.text), "Service", "RestartSec") || "0.1");
          u.state = "activating";
          u.restartAt = at + Math.max(0, Math.ceil(isNaN(delay) ? 0 : delay));
          continue;
        }
        u.state = clean ? "inactive" : "failed";
        if (clean) u.result = null;
        return;
      }
    });
  };

  // A process the manager started was signalled: note when, so its unit's end is dated.
  var signal = Shell.prototype.signal;
  Shell.prototype.signal = function (p, sig) {
    var why = signal.call(this, p, sig);
    if (!why && !p.alive && p.diedAt === undefined) p.diedAt = this.clock;
    return why;
  };

  Shell.prototype.stopUnit = function (u) {
    this.syncUnits();
    if (u.state === "active" || u.state === "activating") {
      // A timer just stops; a service is asked to (TERM) first.
      if (u.kind === "service") this.logUnit(u, this.clock, 6, "Stopping " + titled(u) + "...");
      this.logUnit(u, this.clock, 6, u.name + ": Deactivated successfully.");
      this.logUnit(u, this.clock, 6, "Stopped " + titled(u) + ".");
      if (u.proc && u.proc.alive) {
        u.proc.signals.push("TERM");
        u.proc.alive = false;
        u.ended = { signal: "TERM", at: this.clock };
      }
      u.state = "inactive";
      u.result = null;
      u.since = this.clock;
      u.proc = null;
      u.starting = false;
    } else if (u.state === "failed") {
      u.state = "inactive";
      u.result = null;
    }
  };
  // Start a unit. A oneshot's start waits for its program to finish (unless
  // --no-block): the station clock jumps ahead, as `sleep` makes it. True if
  // the start it waited for failed.
  Shell.prototype.startUnit = function (u, noBlock) {
    this.syncUnits();
    if (u.state === "active" || u.starting) return false;
    u.starts = [];
    u.restarted = false;
    u.restarts = 0;
    this.activate(u, this.clock);
    if (!u.starting || noBlock) return !noBlock && oneshot(u) && u.state === "failed";
    this.clock = Math.max(this.clock, u.proc.end);
    this.syncUnits();
    return u.state === "failed" || (u.state === "activating" && u.result !== "success");
  };

  // The units as plain data, the shape the server grades (app/terminal.py UnitState).
  Shell.prototype.units = function () {
    return this.loadedUnits().map(function (u) { return { name: u.name, state: u.state }; });
  };

  // --- the journal (#304) --------------------------------------------------------------------
  // journald's lines, as systemd 255 writes them: `systemd[1]: ...` about a
  // unit, and the exercise's own entries from programs. Each is dated on the
  // station clock (seconds from the console's start), with its priority.
  var PRIORITIES = ["emerg", "alert", "crit", "err", "warning", "notice", "info", "debug"];
  var BOOT_IDS = { "0": "5f1c0e9a2b7d4c3e8a6f1d2b9c4e7a30", "-1": "c2a94e7b1f3d4a8e9b5c6d0e7f2a1b48" };
  Shell.prototype.logUnit = function (u, t, prio, msg) {
    this.sd.journal.push({ t: t, ident: "systemd", pid: 1, unit: u.name, prio: prio, msg: msg, inv: u.inv });
  };
  // "scrubberd.service - Scrubber controller", or the name alone without a Description.
  function titled(u) {
    var d = last(parseUnit(u.text), "Unit", "Description");
    return u.name + (d ? " - " + d : "");
  }
  function exitStatus(e) {
    if (e.signal) return "code=killed, status=" + { HUP: 1, INT: 2, KILL: 9, TERM: 15 }[e.signal] + "/" + e.signal;
    return "code=exited, status=" + e.code + (STATUS_NAMES[e.code] ? "/" + STATUS_NAMES[e.code] : "");
  }
  // The journal so far, oldest first (a stable sort: same-second lines keep their order).
  Shell.prototype.journal = function () {
    this.syncUnits();
    return this.sd.journal.map(function (e, i) { return [e, i]; })
      .sort(function (a, b) { return a[0].t - b[0].t || a[1] - b[1]; })
      .map(function (p) { return Object.assign({ boot: p[0].t < BOOT ? -1 : 0 }, p[0]); });
  };
  function journalLine(sh, e, format) {
    if (format === "cat") return e.msg;
    var d = clockDate(e.t);
    var when = format === "short-iso"
      ? d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) + "+00:00"
      : MONTHS[d.getMonth()] + " " + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
    return when + " meridian " + e.ident + (e.pid === null ? "" : "[" + e.pid + "]") + ": " + e.msg;
  }
  // May this user read the whole journal? root, and the adm and systemd-journal groups.
  Shell.prototype.readsJournal = function () {
    return this.user === "root" || this.groups.indexOf("adm") !== -1 || this.groups.indexOf("systemd-journal") !== -1;
  };

  // A --since/--until time as journalctl reads it, in seconds on the station
  // clock: "2026-10-08 02:30[:00]", "2026-10-08", "02:30", today, yesterday,
  // tomorrow, now, and "-1h" or "1h ago" (s, min, h, d, w).
  Shell.prototype.journalTime = function (text) {
    var now = this.now();
    var day = function (offset) { return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset); };
    var at;
    var m;
    if (text === "now") at = now;
    else if (text === "today") at = day(0);
    else if (text === "yesterday") at = day(-1);
    else if (text === "tomorrow") at = day(1);
    else if ((m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d)(?::(\d\d))?)?$/.exec(text))) {
      at = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      if (at.getMonth() !== +m[2] - 1 || +(m[4] || 0) > 23 || +(m[5] || 0) > 59) return null;
    } else if ((m = /^(\d\d?):(\d\d)(?::(\d\d))?$/.exec(text))) {
      if (+m[1] > 23 || +m[2] > 59) return null;
      at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2], +(m[3] || 0));
    } else if ((m = /^(?:-(\d+)\s*(s|sec|min|m|h|d|w)|(\d+)\s*(s|sec|min|m|h|d|w) ago)$/.exec(text))) {
      var n = +(m[1] || m[3]);
      var unit = { s: 1, sec: 1, min: 60, m: 60, h: 3600, d: 86400, w: 604800 }[m[2] || m[4]];
      at = new Date(now.getTime() - n * unit * 1000);
    } else return null;
    return Math.round((at - START_TIME) / 1000);
  };

  function priorityRange(text) {
    var level = function (p) { return /^[0-7]$/.test(p) ? +p : PRIORITIES.indexOf(p); };
    var parts = text.split("..");
    var lo = parts.length === 2 ? level(parts[0]) : 0;
    var hi = level(parts[parts.length - 1]);
    if (parts.length > 2 || lo === -1 || hi === -1) return null;
    return [Math.min(lo, hi), Math.max(lo, hi)];
  }

  var JOURNAL_HINT = "Hint: You are currently not seeing messages from other users and the system.\n" +
    "      Users in groups 'adm', 'systemd-journal' can see all messages.\n      Pass -q to turn off this notice.\n";

  // journalctl's own complaints have no "journalctl: " in front, unlike a bad option.
  function bare(message) { var e = new Error(message); e.bare = true; throw e; }

  COMMANDS.journalctl = function (rawArgs) {
    try { return this.journalctl(rawArgs); } catch (e) {
      if (e.bare) return { out: "", err: e.message + "\n", code: 1 };
      throw e;
    }
  };
  Shell.prototype.journalctl = function (rawArgs) {
    var o = { units: [], since: null, until: null, prio: null, n: null, reverse: false, boot: null, format: "short", quiet: false, follow: false };
    var VALUED = "upnoSU";
    var args = rawArgs.slice();
    var take = function (name) {
      if (!args.length) throw new Error("option requires an argument -- '" + name + "'");
      return args.shift();
    };
    var set = function (name, value) {
      if (name === "u" || name === "unit") o.units.push(unitName(value));
      else if (name === "p" || name === "priority") { o.prio = priorityRange(value); if (!o.prio) bare("Unknown log level " + value); }
      else if (name === "n" || name === "lines") {
        if (!/^\d+$/.test(value)) bare("Failed to parse lines '" + value + "'");
        o.n = +value;
      } else if (name === "o" || name === "output") {
        if (["short", "cat", "short-iso"].indexOf(value) === -1) throw new Error("-o " + value + " isn't supported on this console; try short, short-iso or cat");
        o.format = value;
      } else if (name === "S" || name === "since" || name === "U" || name === "until") {
        var t = this.journalTime(value);
        if (t === null) bare("Failed to parse timestamp: " + value);
        if (name === "S" || name === "since") o.since = t; else o.until = t;
      }
    }.bind(this);
    var bootArg = function () {
      if (args.length && /^-?\d+$/.test(args[0])) return +args.shift();
      return 0;
    };
    while (args.length) {
      var a = args.shift();
      var long = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
      if (long) {
        var name = long[1];
        if (["unit", "priority", "lines", "output", "since", "until"].indexOf(name) !== -1) {
          if (name === "lines" && long[2] === undefined && !(args.length && /^\d+$/.test(args[0]))) { o.n = 10; continue; }
          set(name, long[2] !== undefined ? long[2] : take(name));
        } else if (name === "reverse") o.reverse = true;
        else if (name === "quiet") o.quiet = true;
        else if (name === "boot") o.boot = long[2] !== undefined ? +long[2] : bootArg();
        else if (name === "follow") o.follow = true;
        else if (["no-pager", "pager-end", "catalog", "no-hostname"].indexOf(name) === -1 || name === "no-hostname") {
          throw new Error(a + " isn't supported on this console; try journalctl --help");
        }
        continue;
      }
      if (a.length > 1 && a[0] === "-") {
        for (var j = 1; j < a.length; j++) {
          var f = a[j];
          var rest = a.slice(j + 1);
          if (VALUED.indexOf(f) !== -1) {
            if (f === "n" && !rest && !(args.length && /^\d+$/.test(args[0]))) { o.n = 10; break; }
            set(f, rest || take(f));
            break;
          }
          if (f === "b") { o.boot = rest ? +rest : bootArg(); break; }
          if (f === "r") o.reverse = true;
          else if (f === "q") o.quiet = true;
          else if (f === "f") o.follow = true;
          else if (f !== "x" && f !== "e") throw new Error(("-" + f) + " isn't supported on this console; try journalctl --help");
        }
        continue;
      }
      throw new Error("matching on fields (" + a + ") isn't supported on this console; try -u UNIT");
    }
    if (o.boot !== null && isNaN(o.boot)) bare("Failed to parse boot descriptor");
    var err = "";
    if (!this.readsJournal()) {
      // Everything on the console's journal is the system's, so a user outside
      // adm and systemd-journal reads nothing at all, as on a fresh server.
      return { out: "", err: (o.quiet ? "" : JOURNAL_HINT) + "No journal files were opened due to insufficient permissions.\n", code: 1 };
    }
    if (o.boot !== null && o.boot !== 0 && o.boot !== -1) {
      return { out: "", err: "No journal boot entry found from the specified boot offset (" + (o.boot > 0 ? "+" : "") + o.boot + ").\n", code: 1 };
    }
    var entries = this.journal().filter(function (e) {
      if (o.boot !== null && e.boot !== o.boot) return false;
      if (o.units.length && o.units.indexOf(e.unit) === -1) return false;
      if (o.prio && (e.prio < o.prio[0] || e.prio > o.prio[1])) return false;
      if (o.since !== null && e.t < o.since) return false;
      if (o.until !== null && e.t > o.until) return false;
      return true;
    });
    if (o.n !== null) entries = o.n ? entries.slice(-o.n) : [];
    if (o.reverse) entries.reverse();
    if (!entries.length) return { out: "-- No entries --\n", err: err, code: 0 };
    var sh = this;
    var out = [];
    entries.forEach(function (e, i) {
      if (i > 0 && e.boot !== entries[i - 1].boot && o.format !== "cat") out.push("-- Boot " + BOOT_IDS[String(e.boot)] + " --");
      out.push(journalLine(sh, e, o.format));
    });
    if (o.follow) err += "journalctl: -f can't follow on this console; these are the lines so far\n";
    return { out: unlines(out), err: err, code: 0 };
  };

  // --- systemctl -----------------------------------------------------------------------------
  function bad(text) { return !last(parseUnit(text), "Service", "ExecStart"); }
  function description(u) { return last(parseUnit(u.text), "Unit", "Description"); }
  function exitText(e) {
    if (e.signal) return "code=killed, signal=" + e.signal;
    return "code=exited, status=" + e.code + (STATUS_NAMES[e.code] ? "/" + STATUS_NAMES[e.code] : "");
  }
  function sub(u) {
    if (u.starting) return "start";
    if (u.state === "activating") return "auto-restart";
    if (u.state === "failed") return "failed";
    if (u.state === "inactive") return "dead";
    return u.kind === "timer" ? "waiting" : "running";
  }
  Shell.prototype.changedOnDisk = function (u) {
    var path = this.unitPath(u.name);
    return !!path && this.fs[path].contents !== u.text;
  };

  // The last `n` journal lines of the unit's latest invocation, under its
  // status (#304). Only for those who may read the journal, as on Ubuntu.
  Shell.prototype.statusLog = function (u, n) {
    if (!this.readsJournal() || !u.inv || n === 0) return "";
    var sh = this;
    var mine = this.journal().filter(function (e) { return e.unit === u.name && e.inv === u.inv; }).slice(-n);
    return mine.length ? "\n" + unlines(mine.map(function (e) { return journalLine(sh, e, "short"); })) : "";
  };

  Shell.prototype.unitStatus = function (u, n) {
    var sh = this;
    var desc = description(u);
    var dot = u.state === "failed" ? "×" : u.state === "inactive" ? "○" : "●";
    var out = [dot + " " + u.name + (desc ? " - " + desc : "")];
    var enabled = this.enabledState(u.name);
    var loaded = u.kind === "service" && bad(u.text)
      ? "bad-setting (Reason: Unit " + u.name + " has a bad unit file setting.)"
      : "loaded (" + u.path + "; " + enabled + (enabled === "static" ? "" : "; preset: enabled") + ")";
    out.push("     Loaded: " + loaded);
    var since = u.since === null ? "" : " since " + timestamp(clockDate(u.since)) + "; " + relative(Math.max(0, this.clock - u.since)) + " ago";
    var active = u.starting ? "activating (start)" :
      u.state === "activating" ? "activating (auto-restart) (Result: " + u.result + ")" :
      u.state === "failed" ? "failed (Result: " + u.result + ")" :
      u.state === "inactive" ? "inactive (dead)" : "active (" + sub(u) + ")";
    out.push("     Active: " + active + since);
    if (u.kind === "timer") {
      // A timer's Duration shows once it has stopped.
      if (u.state !== "active" && u.started !== null) out.push("   Duration: " + timespan(u.since - u.started));
      var next = u.state === "active" ? this.timerNext(u) : null;
      out.push("    Trigger: " + (next ? timestamp(next) + "; " + relative(Math.round((next - this.now()) / 1000)) + " left" : "n/a"));
      // The dot is coloured by the service's state on a terminal, but it's always ●.
      out.push("   Triggers: ● " + activates(u));
      return unlines(out) + this.statusLog(u, n);
    }
    // The timers that start this service, while they're loaded: on the
    // console, while they're active (systemd unloads a stopped one).
    this.loadedUnits().forEach(function (t) {
      if (t.kind === "timer" && t.state === "active" && activates(t) === u.name) out.push("TriggeredBy: ● " + t.name);
    });
    var docs = last(parseUnit(u.text), "Unit", "Documentation");
    if (docs) out.push("       Docs: " + docs);
    if ((u.state === "active" || u.starting) && u.proc) {
      out.push("   Main PID: " + u.proc.pid + " (" + procName(u.proc.command) + ")");
      out.push("      Tasks: 1 (limit: 2275)");
      out.push("     Memory: 1.2M (peak: 1.6M)");
      out.push("        CPU: 12ms");
      out.push("     CGroup: /system.slice/" + u.name);
      out.push("             └─" + u.proc.pid + " " + u.proc.command);
    } else if (u.ended) {
      // A program that couldn't be run at all (203/EXEC, 217/USER) lasted a millisecond.
      // A oneshot never became active, so it has no Duration, and always names its process.
      var once = oneshot(u);
      if (u.state !== "activating" && !once) out.push("   Duration: " + (u.ended.code > 200 ? "1ms" : timespan(Math.max(0, u.ended.at - u.started))));
      var start = (last(parseUnit(u.text), "Service", "ExecStart") || "").replace(/^[-@+!]+/, "");
      // A plain crash shows only its Main PID; anything else names the process too.
      if (u.ended.signal || u.restarted || u.state === "activating" || u.ended.code > 200 || once) {
        out.push("    Process: " + u.pid + " ExecStart=" + start + " (" + exitText(u.ended) + ")");
      }
      out.push("   Main PID: " + u.pid + " (" + exitText(u.ended) + ")");
      out.push("        CPU: " + (u.ended.code > 200 ? "0" : "2ms"));
    }
    return unlines(out) + this.statusLog(u, n);
  };
  function activates(u) {
    return last(parseUnit(u.text), "Timer", "Unit") || u.name.replace(/\.timer$/, ".service");
  }
  Shell.prototype.timerNext = function (u) {
    var sh = this;
    var times = ((parseUnit(u.text).Timer || {}).OnCalendar || []).map(function (c) { return calendarNext(c, sh.now()); }).filter(Boolean);
    times.sort(function (a, b) { return a - b; });
    return times[0] || null;
  };

  // The rows for list-units: name, LOAD, ACTIVE, SUB, DESCRIPTION, with the
  // column widths systemctl picks (the widest value, or the heading).
  function table(headings, rows, right) {
    var widths = headings.map(function (h, i) {
      return rows.reduce(function (w, r) { return Math.max(w, r[i].length); }, h.length);
    });
    var line = function (cells) {
      return cells.map(function (c, i) {
        if (i === cells.length - 1) return c;
        return (right || []).indexOf(i) !== -1 ? padLeft(c, widths[i]) : padRight(c, widths[i]);
      }).join(" ");
    };
    return [line(headings)].concat(rows.map(line));
  }

  // A unit named on the command line (`scrubberd` is scrubberd.service), or a glob like 'o2-*'.
  function matchesPattern(name, patterns) {
    if (!patterns.length) return true;
    return patterns.some(function (p) {
      if (!/[*?]/.test(p)) return unitName(p) === name;
      return new RegExp("^" + p.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$").test(name);
    });
  }

  var VERBS = ["status", "start", "stop", "restart", "reload", "enable", "disable", "is-active", "is-enabled", "is-failed",
    "list-units", "list-unit-files", "list-timers", "cat", "daemon-reload"];
  var CHANGES = ["start", "stop", "restart", "reload", "enable", "disable", "daemon-reload"];

  COMMANDS.systemctl = function (rawArgs) {
    var o = { type: null, state: [], all: false, now: false, quiet: false, failed: false, lines: 10 };
    var words = [];
    for (var i = 0; i < rawArgs.length; i++) {
      var a = rawArgs[i];
      var eq = /^--(type|state)=(.*)$/.exec(a);
      if (eq) { if (eq[1] === "type") o.type = eq[2]; else o.state = o.state.concat(eq[2].split(",")); }
      else if (a === "-t" || a === "--type") o.type = rawArgs[++i];
      else if (/^(-n|--lines)$/.test(a) || /^(-n|--lines=)\d+$/.test(a)) {
        var count = /\d+$/.test(a) ? a.match(/\d+$/)[0] : rawArgs[++i];
        if (!/^\d+$/.test(count || "")) return { out: "", err: "Failed to parse lines '" + (count || "") + "'\n", code: 1 };
        o.lines = +count;
      }
      else if (a === "--state") o.state = o.state.concat((rawArgs[++i] || "").split(","));
      else if (a === "-a" || a === "--all") o.all = true;
      else if (a === "--now") o.now = true;
      else if (a === "--no-block") o.noBlock = true;
      else if (a === "-q" || a === "--quiet") o.quiet = true;
      else if (a === "--failed") o.failed = true;
      else if (a === "--no-pager" || a === "-l" || a === "--full" || a === "--no-legend") { if (a === "--no-legend") o.noLegend = true; }
      else if (a[0] === "-") throw new Error(a + " isn't supported on this console; try systemctl --help");
      else words.push(a);
    }
    if (o.failed) o.state.push("failed");
    var verb = words.shift() || "list-units";
    if (VERBS.indexOf(verb) === -1) {
      if (/^(edit|mask|unmask|kill|show|reboot|poweroff|isolate|set-default|get-default|list-dependencies|preset|revert|link|reenable)$/.test(verb)) {
        throw new Error(verb + " isn't supported on this console; try systemctl --help");
      }
      return { out: "", err: "Unknown command verb '" + verb + "'.\n", code: 1 };
    }
    var root = this.user === "root";
    var sh = this;
    this.syncUnits();
    var names = words.map(unitName);
    var NEEDS_UNIT = ["start", "stop", "restart", "reload", "enable", "disable", "is-active", "is-enabled", "is-failed", "cat"];
    if (NEEDS_UNIT.indexOf(verb) !== -1 && !names.length) {
      return { out: "", err: "Too few arguments.\n", code: 1 };
    }
    if (verb === "status" && !names.length) {
      throw new Error("status with no unit isn't supported on this console; name one, like systemctl status ssh");
    }
    if (CHANGES.indexOf(verb) !== -1 && !root) {
      if (verb === "daemon-reload") return { out: "", err: "Reload daemon failed: " + DENIED + "\n", code: 1 };
      if (verb === "enable" || verb === "disable") return { out: "", err: "Failed to " + verb + " unit: " + DENIED + "\n", code: 1 };
      return { out: "", err: "Failed to " + verb + " " + names[0] + ": " + DENIED + "\nSee system logs and 'systemctl status " + names[0] + "' for details.\n", code: 1 };
    }
    var out = "", err = "", code = 0;

    if (verb === "daemon-reload") { this.daemonReload(); return { out: "", err: "", code: 0 }; }

    if (verb === "status") {
      var texts = [];
      names.forEach(function (n) {
        var u = sh.unit(n);
        if (!u.path) { err += "Unit " + n + " could not be found.\n"; code = Math.max(code, 4); return; }
        if (sh.changedOnDisk(u)) err += "Warning: The unit file, source configuration file or drop-ins of " + n + " changed on disk. Run 'systemctl daemon-reload' to reload units.\n";
        texts.push(sh.unitStatus(u, o.lines));
        if (u.state !== "active" && code === 0) code = 3;
      });
      return { out: texts.join("\n"), err: err, code: code };
    }

    if (verb === "start" || verb === "stop" || verb === "restart" || verb === "reload") {
      names.forEach(function (n) {
        var u = sh.unit(n);
        if (code) return;
        if (!u.path) {
          err += "Failed to " + verb + " " + n + ": Unit " + n + (verb === "stop" ? " not loaded" : " not found") + ".\n";
          code = 5;
          return;
        }
        if (verb !== "stop" && u.kind === "service" && bad(u.text)) {
          err += "Failed to " + verb + " " + n + ": Unit " + n + " has a bad unit file setting.\nSee system logs and 'systemctl status " + n + "' for details.\n";
          code = 1;
          return;
        }
        if (verb === "reload") {
          if (!last(parseUnit(u.text), "Service", "ExecReload")) {
            err += "Failed to reload " + n + ": Job type reload is not applicable for unit " + n + ".\n";
            code = 3;
          } else if (u.state !== "active") {
            err += "Failed to reload " + n + ": Unit " + n + " is not active.\n";
            code = 1;
          }
          return;
        }
        if (verb === "stop" || verb === "restart") sh.stopUnit(u);
        if (verb !== "stop" && sh.startUnit(u, o.noBlock)) {
          err += "Job for " + n + " failed because the control process exited with error code.\n" +
            'See "systemctl status ' + n + '" and "journalctl -xeu ' + n + '" for details.\n';
          code = 1;
        }
      });
      return { out: "", err: err, code: code };
    }

    if (verb === "enable" || verb === "disable") {
      var notes = "";
      for (var k = 0; k < names.length; k++) {
        var n = names[k];
        var path = this.unitPath(n);
        if (!path) return { out: "", err: "Failed to " + verb + " unit: Unit file " + n + " does not exist.\n", code: 1 };
        var targets = wantedBy(parseUnit(this.fs[path].contents));
        if (verb === "enable") {
          if (!targets.length) { notes += STATIC_NOTE; continue; }
          targets.forEach(function (t) {
            var dir = join(ADMIN_DIR, t + ".wants");
            var link = join(dir, n);
            if (sh.fs[link]) return;
            sh.ensureDir(ADMIN_DIR);
            sh.ensureDir(dir);
            sh.fs[link] = { type: "link", mode: 0o777, owner: "root", group: "root", contents: "", target: path, mtime: sh.now() };
            notes += "Created symlink " + link + " → " + path + ".\n";
          });
        } else {
          (this.fs[ADMIN_DIR] ? this.children(ADMIN_DIR) : []).forEach(function (d) {
            var link = join(join(ADMIN_DIR, d), n);
            if (/\.wants$/.test(d) && sh.fs[link] && sh.fs[link].type === "link") {
              delete sh.fs[link];
              notes += 'Removed "' + link + '".\n';
            }
          });
        }
        if (o.now) {
          var u = this.unit(n);
          if (verb === "enable") this.startUnit(u, o.noBlock); else this.stopUnit(u);
        }
      }
      this.daemonReload(); // enabling reloads the manager, as the real one does
      return { out: "", err: notes, code: 0 };
    }

    if (verb === "is-active" || verb === "is-enabled" || verb === "is-failed") {
      var any = false, missing = false;
      names.forEach(function (n) {
        var u = sh.unit(n);
        var word;
        if (verb === "is-enabled") {
          word = sh.enabledState(n) || "not-found";
          if (word === "not-found") missing = true;
          else if (word !== "disabled") any = true;
        } else {
          word = !u.path ? "inactive" : u.state;
          if (!u.path) missing = true;
          if (verb === "is-active" ? word === "active" : word === "failed") any = true;
        }
        if (!o.quiet) out += word + "\n";
      });
      return { out: out, err: "", code: any ? 0 : missing ? 4 : verb === "is-enabled" || verb === "is-failed" ? 1 : 3 };
    }

    if (verb === "cat") {
      var parts = [];
      names.forEach(function (n) {
        var path = sh.unitPath(n);
        if (!path) { err += "No files found for " + n + ".\n"; code = 1; return; }
        var u = sh.unit(n);
        var warn = sh.changedOnDisk(u) ? "# Warning: " + n + " changed on disk, the version systemd has loaded is outdated.\n" +
          "# This output shows the current version of the unit's original fragment and drop-in files.\n" +
          "# If fragments or drop-ins were added or removed, they are not properly reflected in this output.\n" +
          "# Run 'systemctl daemon-reload' to reload units.\n" : "";
        var text = sh.fs[path].contents;
        parts.push(warn + "# " + path + "\n" + text + (text.slice(-1) === "\n" || !text ? "" : "\n"));
      });
      return { out: parts.join("\n"), err: err, code: code };
    }

    if (verb === "list-unit-files") {
      var files = this.unitFiles().filter(function (f) {
        return (!o.type || kindOf(f.name) === o.type) && matchesPattern(f.name, words);
      });
      var rows = files.map(function (f) {
        var st = sh.enabledState(f.name);
        return [f.name, st, st === "static" ? "-" : "enabled"];
      });
      var body = table(["UNIT FILE", "STATE", "PRESET"], rows);
      return { out: unlines(body) + "\n" + rows.length + " unit files listed.\n", err: "", code: 0 };
    }

    if (verb === "list-timers") {
      var timers = this.loadedUnits().filter(function (u) {
        return u.kind === "timer" && (o.all || u.state === "active") && matchesPattern(u.name, words);
      });
      var nexts = timers.map(function (u) { return { u: u, next: u.state === "active" ? sh.timerNext(u) : null }; });
      nexts.sort(function (a, b) { return !a.next ? 1 : !b.next ? -1 : a.next - b.next; }); // soonest first, idle ones last
      var trows = nexts.map(function (t) {
        return [t.next ? timestamp(t.next) : "-", t.next ? relative(Math.round((t.next - sh.now()) / 1000)) : "-", "-", "-", t.u.name, activates(t.u)];
      });
      var tbody = table(["NEXT", "LEFT", "LAST", "PASSED", "UNIT", "ACTIVATES"], trows, [1, 3]);
      return ok(unlines(tbody) + "\n" + trows.length + " timers listed.\n" + (o.all ? "" : "Pass --all to see loaded but inactive timers, too.\n"));
    }

    // list-units
    var listed = this.loadedUnits().filter(function (u) {
      if (o.type && u.kind !== o.type) return false;
      if (!matchesPattern(u.name, words)) return false;
      if (o.state.length) return o.state.some(function (s) { return s === u.state || s === sub(u) || s === "loaded"; });
      return o.all || u.state !== "inactive";
    });
    var lrows = listed.map(function (u) { return [u.name, "loaded", u.state, sub(u), description(u) || u.name]; });
    var lbody = table(["UNIT", "LOAD", "ACTIVE", "SUB", "DESCRIPTION"], lrows).map(function (l, idx) {
      return (idx > 0 && listed[idx - 1].state === "failed" ? "● " : "  ") + l;
    });
    var text = unlines(lbody) + "\n";
    if (lrows.length && !o.noLegend) {
      text += "Legend: LOAD   → Reflects whether the unit definition was properly loaded.\n" +
        "        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.\n" +
        "        SUB    → The low-level unit activation state, values depend on unit type.\n\n";
    }
    text += lrows.length + " loaded units listed.";
    if (!o.state.length && !o.all) text += " Pass --all to see loaded but inactive units, too.\nTo show all installed unit files use 'systemctl list-unit-files'.";
    return ok(text + "\n");
  };
  var STATIC_NOTE = "The unit files have no installation config (WantedBy=, RequiredBy=, UpheldBy=,\n" +
    "Also=, or Alias= settings in the [Install] section, and DefaultInstance= for\n" +
    "template units). This means they are not meant to be enabled or disabled using systemctl.\n \n" +
    "Possible reasons for having these kinds of units are:\n" +
    "• A unit may be statically enabled by being symlinked from another unit's\n  .wants/, .requires/, or .upholds/ directory.\n" +
    "• A unit's purpose may be to act as a helper for some other unit which has\n  a requirement dependency on it.\n" +
    "• A unit may be started when needed via activation (socket, path, timer,\n  D-Bus, udev, scripted systemctl call, ...).\n" +
    "• In case of template units, the unit is meant to be enabled with some\n  instance name specified.\n";

  // Load every unit file again, as `systemctl daemon-reload` does: new files
  // become units, and changed ones take effect from their next start.
  Shell.prototype.daemonReload = function () {
    var sh = this;
    Object.keys(this.sd.units).forEach(function (n) {
      var u = sh.sd.units[n];
      u.path = sh.unitPath(n);
      if (u.path) u.text = sh.fs[u.path].contents;
    });
  };
  Shell.prototype.ensureDir = function (path) {
    if (!this.fs[path]) this.fs[path] = { type: "dir", mode: 0o755, owner: "root", group: "root", contents: "", mtime: this.now() };
  };

  Object.assign(S, { calendarNext: calendarNext, parseUnit: parseUnit });
});
