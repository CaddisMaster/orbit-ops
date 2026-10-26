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
// a status after some seconds. Time is the station clock's (sh.now()).
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var COMMANDS = S.COMMANDS, DAYS = S.DAYS, join = S.join, lines = S.lines, ok = S.ok, padLeft = S.padLeft,
    padRight = S.padRight, procName = S.procName, Shell = S.Shell, START_TIME = S.START_TIME, unlines = S.unlines;

  var VENDOR_DIR = "/usr/lib/systemd/system";
  var ADMIN_DIR = "/etc/systemd/system";
  var BOOT = -3600; // units at boot started an hour before login, like the exercise's processes
  var START_LIMIT = 5; // starts within START_WINDOW seconds before systemd gives up (StartLimitBurst)
  var START_WINDOW = 10;
  // Exit statuses systemd names (the LSB ones, and its own for a failed exec).
  var STATUS_NAMES = { 1: "FAILURE", 2: "INVALIDARGUMENT", 3: "NOTIMPLEMENTED", 4: "NOPERMISSION", 5: "NOTINSTALLED",
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
  // hour and minute may be *, */N or a number.
  function calendarNext(spec, after) {
    var shorthands = { minutely: "*-*-* *:*:00", hourly: "*-*-* *:00:00", daily: "*-*-* 00:00:00", weekly: "Mon *-*-* 00:00:00" };
    if (spec === "monthly") {
      return new Date(after.getFullYear(), after.getMonth() + 1, 1);
    }
    var full = shorthands[spec] || spec;
    var p = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?\*-\*-\* (\d{1,2}|\*|\*\/\d{1,2}):(\d{1,2}|\*|\*\/\d{1,2})(?::(\d{1,2}))?$/.exec(full);
    if (!p) return null;
    var fits = function (field, n) {
      if (field === "*") return true;
      if (field.indexOf("*/") === 0) return n % +field.slice(2) === 0;
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
  Shell.prototype.bootUnits = function (specs) {
    var sh = this;
    this.sd = { programs: {}, units: {}, bootPid: 600 };
    (specs || []).forEach(function (s) {
      sh.sd.programs[s.name] = { exits: s.exits === undefined ? null : s.exits, runsFor: s.runs_for || 0 };
      var u = sh.unit(s.name);
      if (!u.path) return;
      if (s.state === "active") sh.activate(u, BOOT);
      else if (s.state === "failed") {
        u.pid = sh.sd.bootPid;
        sh.sd.bootPid += 23;
        Object.assign(u, { state: "failed", result: "exit-code", since: BOOT, started: BOOT, ended: { code: s.exits || 1, at: BOOT } });
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
        result: null, since: null, started: null, pid: null, proc: null, ended: null, restarted: false, starts: [] };
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
      u.state = "failed";
      u.result = "exit-code";
      u.ended = { code: why, at: t };
      return;
    }
    var proc = { pid: pid, ppid: 1, user: user, command: start, tty: "?", cpu: 0, mem: 0.1, start: t, alive: true,
      signals: [], ignores: [], unit: u.name };
    if (behaviour.exits !== null) { proc.end = t + behaviour.runsFor; proc.exits = behaviour.exits; }
    this.procs.push(proc);
    u.proc = proc;
    u.state = "active";
  };

  // Catch the units up with the clock: a program that exited, or was killed,
  // leaves its unit inactive or failed, and Restart= may bring it back.
  Shell.prototype.syncUnits = function () {
    if (!this.sd) this.bootUnits([]);
    var sh = this;
    Object.keys(this.sd.units).forEach(function (n) {
      var u = sh.sd.units[n];
      for (var guard = 0; guard < 50 && u.kind === "service"; guard++) {
        if (u.state === "activating") {
          if (u.restartAt > sh.clock) return;
          var recent = u.starts.filter(function (s) { return s > u.restartAt - START_WINDOW; });
          if (recent.length >= START_LIMIT) { u.state = "failed"; return; }
          sh.activate(u, u.restartAt);
          u.restarted = true;
          continue;
        }
        var p = u.proc;
        if (u.state !== "active" || !p) return;
        // It exited if its time came before anything killed it (reap() may
        // have marked it dead at that time, without a signal).
        var byExit = p.end !== undefined && p.end <= sh.clock && (p.diedAt === undefined || p.end <= p.diedAt);
        if (!byExit && (p.alive || p.diedAt === undefined)) return;
        var at = byExit ? p.end : p.diedAt;
        var sig = byExit ? null : p.signals[p.signals.length - 1];
        p.alive = false;
        u.ended = sig ? { signal: sig, at: at } : { code: p.exits, at: at };
        u.proc = null;
        var clean = sig ? sig !== "KILL" : false;
        u.result = clean ? "success" : sig ? "signal" : "exit-code";
        u.since = at;
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
      if (u.proc && u.proc.alive) {
        u.proc.signals.push("TERM");
        u.proc.alive = false;
        u.ended = { signal: "TERM", at: this.clock };
      }
      u.state = "inactive";
      u.result = null;
      u.since = this.clock;
      u.proc = null;
    } else if (u.state === "failed") {
      u.state = "inactive";
      u.result = null;
    }
  };
  Shell.prototype.startUnit = function (u) {
    this.syncUnits();
    if (u.state === "active") return;
    u.starts = [];
    u.restarted = false;
    this.activate(u, this.clock);
  };

  // The units as plain data, the shape the server grades (app/terminal.py UnitState).
  Shell.prototype.units = function () {
    return this.loadedUnits().map(function (u) { return { name: u.name, state: u.state }; });
  };

  // --- systemctl -----------------------------------------------------------------------------
  function bad(text) { return !last(parseUnit(text), "Service", "ExecStart"); }
  function description(u) { return last(parseUnit(u.text), "Unit", "Description"); }
  function exitText(e) {
    if (e.signal) return "code=killed, signal=" + e.signal;
    return "code=exited, status=" + e.code + (STATUS_NAMES[e.code] ? "/" + STATUS_NAMES[e.code] : "");
  }
  function sub(u) {
    if (u.state === "activating") return "auto-restart";
    if (u.state === "failed") return "failed";
    if (u.state === "inactive") return "dead";
    return u.kind === "timer" ? "waiting" : "running";
  }
  Shell.prototype.changedOnDisk = function (u) {
    var path = this.unitPath(u.name);
    return !!path && this.fs[path].contents !== u.text;
  };

  Shell.prototype.unitStatus = function (u) {
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
    var active = u.state === "activating" ? "activating (auto-restart) (Result: " + u.result + ")" :
      u.state === "failed" ? "failed (Result: " + u.result + ")" :
      u.state === "inactive" ? "inactive (dead)" : "active (" + sub(u) + ")";
    out.push("     Active: " + active + since);
    if (u.kind === "timer") {
      // A timer's Duration shows once it has stopped.
      if (u.state !== "active" && u.started !== null) out.push("   Duration: " + timespan(u.since - u.started));
      var next = u.state === "active" ? this.timerNext(u) : null;
      out.push("    Trigger: " + (next ? timestamp(next) + "; " + relative(Math.round((next - this.now()) / 1000)) + " left" : "n/a"));
      var target = this.unit(activates(u));
      out.push("   Triggers: " + (target.state === "failed" ? "×" : target.state === "inactive" ? "○" : "●") + " " + target.name);
      return unlines(out);
    }
    var docs = last(parseUnit(u.text), "Unit", "Documentation");
    if (docs) out.push("       Docs: " + docs);
    if (u.state === "active" && u.proc) {
      out.push("   Main PID: " + u.proc.pid + " (" + procName(u.proc.command) + ")");
      out.push("      Tasks: 1 (limit: 2275)");
      out.push("     Memory: 1.2M (peak: 1.6M)");
      out.push("        CPU: 12ms");
      out.push("     CGroup: /system.slice/" + u.name);
      out.push("             └─" + u.proc.pid + " " + u.proc.command);
    } else if (u.ended) {
      // A program that couldn't be run at all (203/EXEC, 217/USER) lasted a millisecond.
      if (u.state !== "activating") out.push("   Duration: " + (u.ended.code > 200 ? "1ms" : timespan(Math.max(0, u.ended.at - u.started))));
      var start = (last(parseUnit(u.text), "Service", "ExecStart") || "").replace(/^[-@+!]+/, "");
      // A plain crash shows only its Main PID; anything else names the process too.
      if (u.ended.signal || u.restarted || u.state === "activating" || u.ended.code > 200) {
        out.push("    Process: " + u.pid + " ExecStart=" + start + " (" + exitText(u.ended) + ")");
      }
      out.push("   Main PID: " + u.pid + " (" + exitText(u.ended) + ")");
      out.push("        CPU: " + (u.ended.code > 200 ? "0" : "2ms"));
    }
    return unlines(out);
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
    var o = { type: null, state: [], all: false, now: false, quiet: false, failed: false };
    var words = [];
    for (var i = 0; i < rawArgs.length; i++) {
      var a = rawArgs[i];
      var eq = /^--(type|state)=(.*)$/.exec(a);
      if (eq) { if (eq[1] === "type") o.type = eq[2]; else o.state = o.state.concat(eq[2].split(",")); }
      else if (a === "-t" || a === "--type") o.type = rawArgs[++i];
      else if (a === "--state") o.state = o.state.concat((rawArgs[++i] || "").split(","));
      else if (a === "-a" || a === "--all") o.all = true;
      else if (a === "--now") o.now = true;
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
        texts.push(sh.unitStatus(u));
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
        if (verb !== "stop") sh.startUnit(u);
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
          if (verb === "enable") this.startUnit(u); else this.stopUnit(u);
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
