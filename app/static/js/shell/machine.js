// The station console's shell, part 2 of 13 (#255): the Shell itself and the
// machine under it. Its state, the filesystem with Linux permissions, and the
// users and groups in /etc/passwd and /etc/group.
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var baseName = S.baseName, buildNetwork = S.buildNetwork, DEFAULT_NETWORK = S.DEFAULT_NETWORK,
    GiB = S.GiB, join = S.join, lines = S.lines, MiB = S.MiB, normalize = S.normalize,
    parentOf = S.parentOf, parseStamp = S.parseStamp, START_TIME = S.START_TIME, UMASK = S.UMASK;

  // --- the shell -------------------------------------------------------------
  var DEFAULT_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
  var SHELL_PID = 2001;

  function Shell(spec) {
    this.user = spec.user;
    this.group = spec.group;
    // The groups this login holds. Like a real login, they're fixed when the
    // session starts: `usermod` edits /etc/group, and only a new login (or
    // Reset) picks the change up. sudo checks /etc/group itself.
    this.groups = [spec.group].concat(spec.groups || []);
    this.password = spec.password || null;
    this.cwd = spec.cwd;
    this.home = spec.cwd;
    this.lastStatus = 0;
    this.fs = {};
    var self = this;
    Object.keys(spec.fs).forEach(function (path) {
      var n = spec.fs[path];
      self.fs[path] = { type: n.type, mode: n.mode, owner: n.owner, group: n.group, contents: n.contents || "", mtime: parseStamp(n.mtime) };
      if (n.size !== undefined && n.size !== null) self.fs[path].size = n.size; // a big file, sampled (#67)
      if (n.type === "link") self.fs[path].target = n.target;
    });
    this.disk = spec.disk || { size: 20 * GiB, base: Math.round(4.2 * GiB) }; // for df: the drive, and what the OS uses
    this.memory = spec.memory || { total: 2 * GiB, used: 820 * MiB, cache: 640 * MiB, shared: 12 * MiB };
    this.net = buildNetwork(spec.network || DEFAULT_NETWORK); // #164: addresses, sockets, other hosts
    // #165: a filesystem made without /etc/hosts or /etc/resolv.conf (a test's)
    // reads as if it had the usual ones. One that had them and lost them doesn't.
    this.systemFiles = {};
    ["/etc/hosts", "/etc/resolv.conf", "/etc/ufw/ufw.conf", "/etc/ufw/user.rules"].forEach(function (f) { self.systemFiles[f] = !(f in spec.fs); });
    this.origin = null; // inside `ssh HOST '…'`, that host (#166)
    // The environment: shell variables, and which of them are exported.
    this.vars = {
      HOME: this.home, USER: this.user, LOGNAME: this.user, SHELL: "/bin/bash", HOSTNAME: "meridian",
      PATH: DEFAULT_PATH, PWD: this.cwd, TERM: "xterm-256color",
    };
    Object.keys(spec.env || {}).forEach(function (k) { self.vars[k] = spec.env[k]; });
    this.exported = {};
    Object.keys(this.vars).forEach(function (k) { if (k !== "HOSTNAME") self.exported[k] = true; });
    // Processes and jobs, on a simulated clock (seconds since login). Time
    // passes one second per command line, and `sleep N` in the foreground
    // jumps it N seconds, so `sleep 5 &` is finished a few commands later.
    this.clock = 0;
    this.nextPid = SHELL_PID + 40;
    this.procs = [
      { pid: 1, ppid: 0, user: "root", command: "/sbin/init", tty: "?", cpu: 0.0, mem: 0.3, start: -86400 },
      { pid: 812, ppid: 1, user: "root", command: "sshd: /usr/sbin/sshd -D", tty: "?", cpu: 0.0, mem: 0.2, start: -86400 },
      { pid: SHELL_PID, ppid: 812, user: this.user, command: "-bash", tty: "pts/0", cpu: 0.0, mem: 0.1, start: 0 },
    ];
    (spec.processes || []).forEach(function (p, i) {
      self.procs.push({
        pid: 400 + i * 17, ppid: 1, user: p.user, command: p.command, tty: "?", cpu: p.cpu || 0, mem: p.mem || 0.1,
        start: -3600, ignores: p.ignores || [],
      });
    });
    this.procs.forEach(function (p) { p.alive = true; p.signals = p.signals || []; p.ignores = p.ignores || []; });
    this.jobs = [];
    this.notices = [];
    this.lastBg = "";
    this.sudoUntil = -1; // sudo remembers a correct password for 15 minutes
    this.pending = null; // a prompt waiting for an answer (sudo's password, read)
    this.more = null; // the lines so far of a command that isn't finished (the "> " prompt)
    this.screen = ""; // what this run has printed on the terminal
    var sh = this;
    this.tty = { write: function (s) { sh.screen += s; } };
    this.loopDepth = 0;
    // #65: functions, `set` options, traps, and the frames `local` saves variables in.
    this.funcs = {};
    this.opts = { e: false, u: false, x: false, pipefail: false };
    this.traps = {};
    this.frames = [];
    this.funcDepth = 0;
    this.sourceDepth = 0;
    this.noErrexit = 0;
    this.logins = []; // shells stacked by `sudo -i`, popped by `exit`
    this.bootUnits(spec.services || []); // #303: systemd's units, from systemd.js
  }

  // bash's \w: ~ for a real home directory, otherwise the path. An exercise's
  // starting directory doubles as $HOME (so `cd` comes back to it), but it
  // isn't anyone's home, so the prompt shows where you are.
  Shell.prototype.prompt = function () {
    if (this.pending) return this.pending.prompt;
    if (this.more !== null) return "> ";
    var realHome = this.home === (this.user === "root" ? "/root" : "/home/" + this.user);
    var where = realHome && this.cwd === this.home ? "~" : this.cwd;
    return this.user + "@meridian:" + where + (this.user === "root" ? "# " : "$ ");
  };

  Shell.prototype.now = function () { return new Date(START_TIME.getTime() + this.clock * 1000); };

  Shell.prototype.resolve = function (path) {
    if (path === "~" || path.indexOf("~/") === 0) path = this.home + path.slice(1);
    return normalize(path.charAt(0) === "/" ? path : this.cwd + "/" + path);
  };

  // The permission bits that apply to this user for `node` (rwx as 4/2/1).
  Shell.prototype.bits = function (node) {
    if (this.user === "root") return 7;
    if (node.owner === this.user) return (node.mode >> 6) & 7;
    if (this.groups.indexOf(node.group) !== -1) return (node.mode >> 3) & 7;
    return node.mode & 7;
  };
  Shell.prototype.can = function (node, bit) {
    return (this.bits(node) & bit) === bit;
  };

  // Look a path up the way the kernel does: every directory on the way must be
  // searchable (x), and symbolic links are followed, the last one too unless
  // `nofollow` (for rm, mv, ls -l, readlink and find, which act on the link).
  // Returns {path, node}, where path is the real one, or {path, error}:
  // "No such file or directory", "Not a directory", "Permission denied" or
  // "Too many levels of symbolic links". For a missing file, path is where it
  // would be created.
  Shell.prototype.lookup = function (path, nofollow) {
    var parts = this.resolve(path).split("/").filter(Boolean);
    var at = "/";
    var hops = 0;
    for (var i = 0; i < parts.length; i++) {
      var rest = join(at, parts.slice(i).join("/"));
      var dir = this.fs[at];
      if (dir.type !== "dir") return { path: rest, error: "Not a directory" };
      if (!this.can(dir, 1)) return { path: rest, error: "Permission denied" };
      var next = join(at, parts[i]);
      var node = this.fs[next];
      if (!node) return { path: rest, error: "No such file or directory" };
      if (node.type === "link" && (i < parts.length - 1 || !nofollow)) {
        if (++hops > 40) return { path: rest, error: "Too many levels of symbolic links" };
        var target = node.target.charAt(0) === "/" ? node.target : at + "/" + node.target;
        parts = normalize(target).split("/").filter(Boolean).concat(parts.slice(i + 1));
        at = "/";
        i = -1;
        continue;
      }
      at = next;
    }
    return { path: at, node: this.fs[at] };
  };

  Shell.prototype.children = function (dir) {
    var prefix = dir === "/" ? "/" : dir + "/";
    var fs = this.fs;
    return Object.keys(fs)
      .filter(function (p) { return p !== dir && p.indexOf(prefix) === 0 && p.slice(prefix.length).indexOf("/") === -1; })
      .map(baseName);
  };

  // Can this user create or remove entries in the directory holding `abs`?
  Shell.prototype.writableParent = function (abs) {
    var parent = this.lookup(parentOf(abs));
    if (parent.error) return parent.error;
    if (parent.node.type !== "dir") return "Not a directory";
    if (!this.can(parent.node, 2) || !this.can(parent.node, 1)) return "Permission denied";
    return null;
  };

  Shell.prototype.create = function (abs, type, contents) {
    this.fs[abs] = {
      type: type,
      mode: (type === "dir" ? 0o777 : 0o666) & ~UMASK,
      owner: this.user,
      group: this.group,
      contents: contents || "",
      mtime: this.now(),
    };
    return this.fs[abs];
  };

  Shell.prototype.removeTree = function (abs) {
    var fs = this.fs;
    Object.keys(fs).forEach(function (p) {
      if (p === abs || p.indexOf(abs + "/") === 0) delete fs[p];
    });
  };

  // Write `text` to a file (for > and >>), creating it if need be.
  Shell.prototype.writeFile = function (path, text, append) {
    if (path === "/dev/null") return null;
    var found = this.lookup(path);
    if (found.node) {
      if (found.node.type === "dir") return path + ": Is a directory";
      if (!this.can(found.node, 2)) return path + ": Permission denied";
      found.node.contents = append ? found.node.contents + text : text;
      found.node.mtime = this.now();
      // A sampled big file grows by what's appended, and is only its contents
      // once overwritten (so `> big.log` frees its space, as on a real disk).
      if (found.node.size !== undefined) {
        if (append) found.node.size += new TextEncoder().encode(text).length;
        else delete found.node.size;
      }
      return null;
    }
    if (found.error !== "No such file or directory") return path + ": " + found.error;
    var why = this.writableParent(found.path);
    if (why) return path + ": " + why;
    this.create(found.path, "file", text);
    return null;
  };

  // Read a file for cat, grep, etc. Returns {text} or {error}.
  Shell.prototype.readFile = function (cmd, path) {
    var found = this.lookup(path);
    if (found.error) return { error: cmd + ": " + path + ": " + found.error };
    if (found.node.type === "dir") return { error: cmd + ": " + path + ": Is a directory" };
    if (!this.can(found.node, 4)) return { error: cmd + ": " + path + ": Permission denied" };
    return { text: found.node.contents };
  };

  // --- users and groups: /etc/passwd and /etc/group, read live --------------------------
  Shell.prototype.db = function (file) {
    var node = this.fs[file];
    if (!node || node.type !== "file") return [];
    return lines(node.contents).filter(function (l) { return l && l[0] !== "#"; }).map(function (l) { return l.split(":"); });
  };
  Shell.prototype.account = function (name) {
    var row = this.db("/etc/passwd").filter(function (r) { return r[0] === name; })[0];
    if (row) return { name: row[0], uid: +row[2], gid: +row[3], home: row[5], shell: row[6] };
    if (name === "root") return { name: "root", uid: 0, gid: 0, home: "/root", shell: "/bin/bash" };
    var loginUser = this.logins.length ? this.logins[0].user : this.user;
    if (name === loginUser) {
      return { name: name, uid: 1000, gid: 1000, home: "/home/" + name, shell: "/bin/bash" };
    }
    return null;
  };
  Shell.prototype.gid = function (group) {
    var row = this.db("/etc/group").filter(function (r) { return r[0] === group; })[0];
    return row ? +row[2] : group === "root" ? 0 : 1000;
  };
  // Every group `name` belongs to in /etc/group (the primary first).
  Shell.prototype.groupsOf = function (name) {
    var acct = this.account(name);
    var rows = this.db("/etc/group");
    var primary = rows.filter(function (r) { return acct && +r[2] === acct.gid; }).map(function (r) { return r[0]; });
    var others = rows.filter(function (r) { return (r[3] || "").split(",").indexOf(name) !== -1; }).map(function (r) { return r[0]; });
    var all = primary.concat(others.filter(function (g) { return primary.indexOf(g) === -1; }));
    return all.length ? all : name === this.user ? this.groups.slice() : [];
  };
  Shell.prototype.isSudoer = function () {
    return this.user === "root" || this.groupsOf(this.user).indexOf("sudo") !== -1;
  };

  // Run argv as another user, as sudo does: only programs on the PATH, no builtins.
  Shell.prototype.runAs = function* (who, argv, stdin, io) {
    var name = argv[0];
    var path = name.indexOf("/") !== -1 ? name : this.which(name)[0];
    if (!path) return { out: "", err: "sudo: " + name + ": command not found\n", code: 1 };
    var saved = { user: this.user, group: this.group, groups: this.groups };
    this.user = who;
    this.groups = this.groupsOf(who);
    if (!this.groups.length) this.groups = [who];
    this.group = this.groups[0];
    try {
      if (this.fs[path] || name.indexOf("/") !== -1) return yield* this.runFile(path, name, argv.slice(1), io);
      return yield* this.call(name, argv, stdin, io);
    } finally {
      this.user = saved.user;
      this.group = saved.group;
      this.groups = saved.groups;
    }
  };

  Object.assign(S, { Shell: Shell, SHELL_PID: SHELL_PID });
});
