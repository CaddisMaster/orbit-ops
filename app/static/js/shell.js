// The station console's shell: a small POSIX-ish shell simulated over a
// virtual filesystem, for terminal exercises (#17). No server-side shell: the
// droplet is shared, and this never touches a real one.
//
// Pure: no DOM. console.js drives it in the browser; tests/js/ drive it under
// `node --test` in CI. Behaviour follows GNU coreutils and bash closely enough
// to teach with, including permissions (as a non-root user with umask 002,
// Ubuntu's default) and the exact `ls -l` layout. What it doesn't implement
// says "command not found", in the station's voice.
//
// It's in parts, by area (#255): shell/*.js, listed in PARTS below. This file
// loads last. It has completion, the state the server grades and the checks,
// and it is the shell's public face (OrbitShell, or require() under Node).
(function (root, factory) {
  // The parts, in the order they load. module.html loads them in this order
  // too, before this file (a test holds the two equal).
  var PARTS = ["base", "machine", "parse", "editor", "expand", "run", "builtins", "files", "text", "system", "network", "dns", "systemd"];
  if (typeof module === "object" && module.exports) {
    PARTS.forEach(function (p) { require("./shell/" + p + ".js"); });
    module.exports = factory(require("./shell/base.js"));
  } else root.OrbitShell = factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var applyMode = S.applyMode, baseName = S.baseName, COMMANDS = S.COMMANDS,
    compareNames = S.compareNames, GiB = S.GiB, isoStamp = S.isoStamp, join = S.join, KiB = S.KiB,
    MiB = S.MiB, parseStamp = S.parseStamp, START_TIME = S.START_TIME, Shell = S.Shell,
    parse = S.parse, Nano = S.Nano, Pager = S.Pager, globRegex = S.globRegex, procName = S.procName,
    checkCrontab = S.checkCrontab;

  // --- completion, state, checks ------------------------------------------------------
  // Complete the last word of `line`: a command name first, then a path.
  // Returns {line, options}: the line to show, and the matches when ambiguous.
  Shell.prototype.complete = function (line) {
    var m = /(^|[\s|;&<>])([^\s|;&<>]*)$/.exec(line);
    var word = m ? m[2] : "";
    var head = line.slice(0, line.length - word.length);
    var isCommand = /^\s*$/.test(head) || /[|;&]\s*$/.test(head);
    var candidates;
    var dirPart = "";
    var stem = word;
    var sh = this;
    if (isCommand && word.indexOf("/") === -1) {
      candidates = Object.keys(COMMANDS).sort().map(function (c) { return { name: c, dir: false }; });
    } else {
      var slash = word.lastIndexOf("/");
      dirPart = slash === -1 ? "" : word.slice(0, slash + 1);
      stem = word.slice(slash + 1);
      var dir = this.lookup(dirPart || ".");
      if (!dir.node || dir.node.type !== "dir" || !this.can(dir.node, 4)) return { line: line, options: [] };
      candidates = this.children(dir.path).sort(compareNames).map(function (n) {
        return { name: n, dir: sh.fs[join(dir.path, n)].type === "dir" };
      });
      if (stem.charAt(0) !== ".") candidates = candidates.filter(function (c) { return c.name.charAt(0) !== "."; });
    }
    var hits = candidates.filter(function (c) { return c.name.indexOf(stem) === 0; });
    if (!hits.length) return { line: line, options: [] };
    if (hits.length === 1) {
      var h = hits[0];
      return { line: head + dirPart + h.name + (h.dir ? "/" : " "), options: [] };
    }
    var common = hits[0].name;
    hits.forEach(function (c) { while (c.name.indexOf(common) !== 0) common = common.slice(0, -1); });
    return {
      line: head + dirPart + common,
      options: common === stem ? hits.map(function (c) { return c.name + (c.dir ? "/" : ""); }) : [],
    };
  };

  // The filesystem as plain data, the shape the server grades (app/terminal.py).
  Shell.prototype.state = function () {
    var out = {};
    var fs = this.fs;
    Object.keys(fs).sort().forEach(function (p) {
      var n = fs[p];
      var node = { type: n.type, mode: n.mode, owner: n.owner, group: n.group, contents: n.type === "file" ? n.contents : "", mtime: isoStamp(n.mtime) };
      if (n.type === "file" && n.size !== undefined) node.size = n.size;
      if (n.type === "link") node.target = n.target;
      out[p] = node;
    });
    return out;
  };

  // The same checks as app/terminal.py's passes(), so the console can say
  // "done" the moment it is. The server re-checks; this is only a preview.
  function passes(check, state, cwd, processes, units) {
    var named = function (name) { return (processes || []).filter(function (p) { return procName(p.command) === name; }); };
    var active = function (name) { return (units || []).some(function (u) { return u.name === name && u.state === "active"; }); };
    if ("active" in check) return active(check.active);
    if ("inactive" in check) return !active(check.inactive);
    if ("enabled" in check) return enabled(check.enabled, state);
    if ("disabled" in check) return !enabled(check.disabled, state);
    if ("cwd" in check) return cwd === check.cwd;
    if ("running" in check) return named(check.running).some(function (p) { return p.alive; });
    if ("stopped" in check) return !named(check.stopped).some(function (p) { return p.alive; });
    if ("signalled" in check) return named(check.signalled).some(function (p) { return p.signals.indexOf(check.with) !== -1; });
    if ("mode" in check) return !!state[check.mode] && (state[check.mode].mode & 0o777) === parseInt(check.equals, 8);
    if ("owner" in check) {
      var n = state[check.owner];
      return !!n && n.owner === check.user && (!check.group || n.group === check.group);
    }
    if ("exists" in check) return !!state[check.exists] && (!check.type || state[check.exists].type === check.type);
    if ("missing" in check) return !state[check.missing];
    if ("executable" in check) {
      var x = state[check.executable];
      return !!x && x.type === "file" && (x.mode & 0o100) !== 0;
    }
    if ("contains" in check) {
      var f = state[check.contains];
      return !!f && f.type === "file" && f.contents.indexOf(check.text) !== -1;
    }
    if ("lacks" in check) {
      var g = state[check.lacks];
      return !!g && g.type === "file" && g.contents.indexOf(check.text) === -1;
    }
    if ("symlink" in check) {
      var l = state[check.symlink];
      return !!l && l.type === "link" && l.target === check.target;
    }
    if ("files_under" in check) {
      var top = state[check.files_under];
      if (!top || top.type !== "dir") return false;
      var re = check.name ? globRegex(check.name, [], 0, true) : null;
      var limit = check.max_size !== undefined && check.max_size !== null ? parseSize(check.max_size) : null;
      return Object.keys(state).every(function (path) {
        var node = state[path];
        if (path.indexOf(check.files_under === "/" ? "/" : check.files_under + "/") !== 0 || node.type !== "file") return true;
        if (re && !re.test(baseName(path))) return true;
        var bytes = node.size !== undefined && node.size !== null ? node.size : new TextEncoder().encode(node.contents).length;
        if (limit !== null && bytes > limit) return false;
        var age = Math.floor((START_TIME - parseStamp(node.mtime)) / 86400000);
        return check.max_age === undefined || check.max_age === null || age <= check.max_age;
      });
    }
    return false;
  }

  // Is there a link to `name` in some target's .wants/, as `systemctl enable`
  // makes? The same rule as app/terminal.py enabled() (#303).
  function enabled(name, state) {
    var prefix = "/etc/systemd/system/";
    return Object.keys(state).some(function (path) {
      var rest = path.slice(prefix.length).split("/");
      return path.indexOf(prefix) === 0 && rest.length === 2 && /\.wants$/.test(rest[0]) && rest[1] === name && state[path].type === "link";
    });
  }

  // "50M" → bytes (K, M, G are powers of 1024, as in the exercise files).
  function parseSize(text) {
    var m = /^(\d+(?:\.\d+)?)([KMG]?)$/.exec(String(text));
    if (!m) return null;
    return Math.round(parseFloat(m[1]) * { "": 1, K: KiB, M: MiB, G: GiB }[m[2]]);
  }
  // The process table as plain data, the shape the server grades.
  Shell.prototype.processes = function () {
    return this.procs.map(function (p) {
      return { pid: p.pid, user: p.user, command: p.command, alive: !!p.alive, signals: p.signals.slice() };
    });
  };

  // How many of the checks pass (#208).
  Shell.prototype.progress = function (checks) {
    var state = this.state();
    var cwd = this.cwd;
    var procs = this.processes();
    var units = this.units();
    return checks.filter(function (c) { return passes(c, state, cwd, procs, units); }).length;
  };

  Shell.prototype.solved = function (checks) {
    return this.progress(checks) === checks.length;
  };

  // The console's status line while a task isn't done (#208): how many checks
  // pass, never which, since a check is the task restated. Nothing before the
  // first change, and nothing for a one-check task, where it could only say 0.
  function progressNote(done, total, changed) {
    if (!changed || total < 2 || done === total) return "";
    return done + " of " + total + " done";
  }

  return { Shell: Shell, Nano: Nano, Pager: Pager, parse: parse, applyMode: applyMode, passes: passes, checkCrontab: checkCrontab, progressNote: progressNote };
});
