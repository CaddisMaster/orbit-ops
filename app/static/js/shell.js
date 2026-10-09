// The station console's shell: a small POSIX-ish shell simulated over a
// virtual filesystem, for terminal exercises (#17). No server-side shell: the
// droplet is shared, and this never touches a real one.
//
// Pure: no DOM. console.js drives it in the browser; tests/js/ drive it under
// `node --test` in CI. Behaviour follows GNU coreutils and bash closely enough
// to teach with, including permissions (as a non-root user with umask 002,
// Ubuntu's default) and the exact `ls -l` layout. What it doesn't implement
// says "command not found", in the station's voice.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OrbitShell = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var UMASK = 0o002;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var START_TIME = new Date(2026, 9, 8, 9, 0); // when the station's files were last touched

  // --- paths -----------------------------------------------------------------
  function normalize(path) {
    var out = [];
    path.split("/").forEach(function (part) {
      if (part === "" || part === ".") return;
      if (part === "..") out.pop();
      else out.push(part);
    });
    return "/" + out.join("/");
  }
  function parentOf(path) {
    var i = path.lastIndexOf("/");
    return i <= 0 ? "/" : path.slice(0, i);
  }
  function baseName(path) {
    return path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
  }
  function join(dir, name) {
    return dir === "/" ? "/" + name : dir + "/" + name;
  }

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
      self.fs[path] = { type: n.type, mode: n.mode, owner: n.owner, group: n.group, contents: n.contents || "", mtime: START_TIME };
    });
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
    this.pending = null; // a prompt waiting for an answer (sudo's password)
    this.logins = []; // shells stacked by `sudo -i`, popped by `exit`
  }

  // bash's \w: ~ for a real home directory, otherwise the path. An exercise's
  // starting directory doubles as $HOME (so `cd` comes back to it), but it
  // isn't anyone's home, so the prompt shows where you are.
  Shell.prototype.prompt = function () {
    if (this.pending) return this.pending.prompt;
    var realHome = this.home === (this.user === "root" ? "/root" : "/home/" + this.user);
    var where = realHome && this.cwd === this.home ? "~" : this.cwd;
    return this.user + "@meridian:" + where + (this.user === "root" ? "# " : "$ ");
  };

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
  // searchable (x). Returns {node} or {error} ("No such file or directory",
  // "Not a directory" or "Permission denied").
  Shell.prototype.lookup = function (path) {
    var abs = this.resolve(path);
    if (abs === "/") return { path: abs, node: this.fs["/"] };
    var parts = abs.split("/").slice(1);
    var at = "/";
    for (var i = 0; i < parts.length; i++) {
      var dir = this.fs[at];
      if (dir.type !== "dir") return { path: abs, error: "Not a directory" };
      if (!this.can(dir, 1)) return { path: abs, error: "Permission denied" };
      at = join(at, parts[i]);
      if (!this.fs[at]) return { path: abs, error: "No such file or directory" };
    }
    return { path: abs, node: this.fs[at] };
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
      mtime: new Date(),
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
      found.node.mtime = new Date();
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

  // --- parsing -----------------------------------------------------------------
  // Words keep a parallel "quoted" mask so globs and ~ only act on unquoted text.
  function tokenize(line, vars) {
    var tokens = [];
    var word = null;
    var i = 0;
    function startWord() { if (!word) word = { text: "", quoted: [] }; }
    function add(ch, quoted) { startWord(); word.text += ch; word.quoted.push(quoted); }
    function end() {
      if (!word) return;
      var m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(word.text);
      var assign = m && word.quoted.slice(0, m[0].length).every(function (q) { return !q; });
      tokens.push({ type: "word", text: word.text, quoted: word.quoted, assign: assign ? m[1] : null });
      word = null;
    }
    function variable(quoted) {
      // at line[i] === "$"
      var m = /^\$(\?|!|#|@|[0-9]|[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})/.exec(line.slice(i));
      if (!m) { add("$", quoted); i++; return; }
      var name = m[1].replace(/[{}]/g, "");
      startWord();
      String(vars[name] !== undefined ? vars[name] : "").split("").forEach(function (c) { add(c, true); });
      i += m[0].length;
    }
    while (i < line.length) {
      var c = line[i];
      if (c === "'") {
        var close = line.indexOf("'", i + 1);
        if (close === -1) throw new SyntaxError("unexpected EOF while looking for matching `''");
        startWord();
        line.slice(i + 1, close).split("").forEach(function (ch) { add(ch, true); });
        i = close + 1;
      } else if (c === '"') {
        i++;
        startWord();
        while (i < line.length && line[i] !== '"') {
          if (line[i] === "\\" && i + 1 < line.length && '"\\$`'.indexOf(line[i + 1]) !== -1) { add(line[i + 1], true); i += 2; }
          else if (line[i] === "$") variable(true);
          else { add(line[i], true); i++; }
        }
        if (i >= line.length) throw new SyntaxError('unexpected EOF while looking for matching `"\'');
        i++;
      } else if (c === "\\") {
        if (i + 1 < line.length) add(line[i + 1], true);
        i += 2;
      } else if (c === "$") {
        variable(false);
      } else if (c === " " || c === "\t") {
        end(); i++;
      } else if (c === "|" || c === ";" || c === "&" || c === ">" || c === "<") {
        end();
        var two = line.slice(i, i + 2);
        if (line.slice(i, i + 3) === "&>>") { tokens.push({ type: "op", text: "&>>" }); i += 3; }
        else if (two === "||" || two === "&&" || two === ">>" || two === "&>") { tokens.push({ type: "op", text: two }); i += 2; }
        else if (c === "&") throw new SyntaxError("background jobs (&) aren't available on this console");
        else { tokens.push({ type: "op", text: c }); i++; }
      } else if (c === "2" && !word && line[i + 1] === ">") {
        var op = line.slice(i, i + 4) === "2>&1" ? "2>&1" : line[i + 2] === ">" ? "2>>" : "2>";
        tokens.push({ type: "op", text: op }); i += op.length;
      } else if (c === "#" && !word) {
        break; // a comment
      } else {
        add(c, false); i++;
      }
    }
    end();
    return tokens;
  }

  function globRegex(part, quoted, offset) {
    var re = "";
    for (var i = 0; i < part.length; i++) {
      var c = part[i];
      var q = quoted[offset + i];
      if (!q && c === "*") re += "[^/]*";
      else if (!q && c === "?") re += "[^/]";
      else if (!q && c === "[") {
        var close = part.indexOf("]", i + 2);
        if (close === -1) { re += "\\["; continue; }
        var body = part.slice(i + 1, close).replace(/^!/, "^").replace(/\\/g, "\\\\");
        re += "[" + body + "]";
        i = close;
      } else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp("^" + re + "$");
  }

  function hasGlob(word) {
    for (var i = 0; i < word.text.length; i++) {
      if (!word.quoted[i] && "*?[".indexOf(word.text[i]) !== -1) return true;
    }
    return false;
  }

  // Brace expansion, before anything else, as in bash: a{b,c}d → abd acd, and
  // {1..3} → 1 2 3. Only unquoted braces with a comma or a range count.
  function braces(word) {
    var depth = 0;
    var open = -1;
    for (var i = 0; i < word.text.length; i++) {
      if (word.quoted[i]) continue;
      var c = word.text[i];
      if (c === "{") { if (depth++ === 0) open = i; }
      else if (c === "}" && depth > 0 && --depth === 0) {
        var inner = word.text.slice(open + 1, i);
        var innerQ = word.quoted.slice(open + 1, i);
        var options = null;
        var range = /^(-?\d+)\.\.(-?\d+)$/.exec(inner);
        if (range && innerQ.every(function (q) { return !q; })) {
          var a = parseInt(range[1], 10), b = parseInt(range[2], 10), step = a <= b ? 1 : -1;
          options = [];
          for (var n = a; step > 0 ? n <= b : n >= b; n += step) {
            var t = String(n);
            options.push({ text: t, quoted: t.split("").map(function () { return true; }) });
          }
        } else {
          var parts = [];
          var d = 0, from = 0;
          for (var k = 0; k <= inner.length; k++) {
            if (k < inner.length && !innerQ[k] && inner[k] === "{") d++;
            else if (k < inner.length && !innerQ[k] && inner[k] === "}") d--;
            else if (k === inner.length || (d === 0 && !innerQ[k] && inner[k] === ",")) {
              parts.push({ text: inner.slice(from, k), quoted: innerQ.slice(from, k) });
              from = k + 1;
            }
          }
          if (parts.length > 1) options = parts;
        }
        if (!options) continue;
        var pre = { text: word.text.slice(0, open), quoted: word.quoted.slice(0, open) };
        var post = { text: word.text.slice(i + 1), quoted: word.quoted.slice(i + 1) };
        var out = [];
        options.forEach(function (o) {
          braces({ text: pre.text + o.text + post.text, quoted: pre.quoted.concat(o.quoted, post.quoted) }).forEach(function (w) { out.push(w); });
        });
        return out;
      }
    }
    return [word];
  }

  Shell.prototype.expand = function (word) {
    var self = this;
    var out = [];
    braces(word).forEach(function (w) { Array.prototype.push.apply(out, self.expandOne(w)); });
    return out;
  };

  Shell.prototype.expandOne = function (word) {
    var text = word.text;
    if (!word.quoted[0] && (text === "~" || text.indexOf("~/") === 0)) {
      var pad = this.home.split("").map(function () { return true; });
      word = { text: this.home + text.slice(1), quoted: pad.concat(word.quoted.slice(1)) };
      text = word.text;
    }
    if (!hasGlob(word)) return [text];
    var absolute = text.charAt(0) === "/";
    var parts = text.split("/");
    var offsets = [];
    var at = 0;
    parts.forEach(function (p) { offsets.push(at); at += p.length + 1; });
    var self = this;
    var results = [{ shown: absolute ? "" : null, abs: absolute ? "/" : this.cwd }];
    parts.forEach(function (part, idx) {
      if (part === "" ) return;
      var next = [];
      results.forEach(function (r) {
        var shownPrefix = r.shown === null ? "" : r.shown + "/";
        var dirNode = self.fs[r.abs];
        if (!dirNode || dirNode.type !== "dir") return;
        var sub = { text: part, quoted: word.quoted.slice(offsets[idx], offsets[idx] + part.length) };
        if (!hasGlob(sub)) {
          var p = r.abs === "/" ? "/" + part : normalize(r.abs + "/" + part);
          if (part === "." || part === "..") p = normalize(r.abs + "/" + part);
          if (self.fs[p]) next.push({ shown: shownPrefix + part, abs: p });
          return;
        }
        if (!self.can(dirNode, 4)) return;
        var re = globRegex(part, word.quoted, offsets[idx]);
        self.children(r.abs).sort(compareNames).forEach(function (name) {
          if (name.charAt(0) === "." && part.charAt(0) !== ".") return;
          if (re.test(name)) next.push({ shown: shownPrefix + name, abs: join(r.abs, name) });
        });
      });
      results = next;
    });
    if (!results.length) return [text]; // bash leaves an unmatched glob as typed
    return results.map(function (r) { return absolute ? "/" + r.shown.replace(/^\//, "") : r.shown; });
  };

  // One part of a line (no ; && ||) → a pipeline: [{argv, redirects}].
  Shell.prototype.parse = function (text) {
    var vars = {};
    var self = this;
    Object.keys(this.vars).forEach(function (k) { vars[k] = self.vars[k]; });
    var args = this.args || [];
    vars["?"] = this.lastStatus;
    vars["!"] = this.lastBg;
    vars["#"] = args.length;
    vars["@"] = args.join(" ");
    vars["0"] = this.scriptName || "-bash";
    for (var n = 1; n <= 9; n++) vars[String(n)] = args[n - 1] !== undefined ? args[n - 1] : "";
    var tokens = tokenize(text, vars);
    var pipeline = [];
    var cmd = { argv: [], redirects: [], assigns: [] };
    var self = this;
    function endCmd(next) {
      if (!cmd.argv.length && !cmd.redirects.length && !cmd.assigns.length) throw new SyntaxError("syntax error near unexpected token `" + next + "'");
      pipeline.push(cmd);
      cmd = { argv: [], redirects: [], assigns: [] };
    }
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === "word" && t.assign && !cmd.argv.length) {
        // NAME=value before a command (or alone): no globbing, no splitting.
        cmd.assigns.push([t.assign, t.text.slice(t.assign.length + 1)]);
      } else if (t.type === "word") {
        Array.prototype.push.apply(cmd.argv, self.expand(t));
      } else if (t.text === "|") {
        endCmd("|");
      } else if (t.text === "2>&1") {
        cmd.redirects.push({ op: "2>&1" });
      } else {
        var target = tokens[i + 1];
        if (!target || target.type !== "word") throw new SyntaxError("syntax error near unexpected token `newline'");
        cmd.redirects.push({ op: t.text, path: self.expand(target)[0] });
        i++;
      }
    }
    endCmd("newline");
    return pipeline;
  };

  // --- running -------------------------------------------------------------------
  // Split a line at top-level ; && || (outside quotes), so each part can be
  // expanded just before it runs: `false; echo $?` must see the new status.
  function splitLists(line) {
    var parts = [];
    var op = null;
    var start = 0;
    var quote = null;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (quote) { if (c === quote) quote = null; else if (c === "\\" && quote === '"') i++; continue; }
      if (c === "'" || c === '"') { quote = c; continue; }
      if (c === "\\") { i++; continue; }
      if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) break;
      var two = line.slice(i, i + 2);
      // A lone & (not &&, &>, >& or 2>&1) ends a command and runs it in the background.
      var lone = c === "&" && two !== "&&" && line[i + 1] !== ">" && line[i - 1] !== ">" && line[i - 1] !== "&";
      if (c === ";" || two === "&&" || two === "||" || lone) {
        parts.push({ op: op, text: line.slice(start, i), bg: lone });
        op = lone || c === ";" ? ";" : two;
        i += op.length - 1;
        start = i + 1;
      }
    }
    parts.push({ op: op, text: line.slice(start, quote ? line.length : i) });
    return parts;
  }

  // run(line) → {output, clear}: everything the terminal should print. While
  // a prompt is pending (sudo's password), the line is its answer instead.
  Shell.prototype.run = function (line) {
    if (this.pending) return this.answer(line);
    this.clock += 1;
    this.reap();
    var parts = splitLists(line);
    try {
      // Bash reads the whole line before running any of it, so a quoting or
      // syntax error anywhere means nothing runs.
      parts.forEach(function (part, i) {
        var empty = !part.text.trim();
        if (empty && (part.op || i < parts.length - 1) && !(i === parts.length - 1 && part.op === ";")) {
          throw new SyntaxError("syntax error near unexpected token `" + (parts[i + 1] ? parts[i + 1].op : part.op) + "'");
        }
        tokenize(part.text, {});
      });
    } catch (e) {
      this.lastStatus = 2;
      return { output: "bash: " + e.message + "\n", clear: false };
    }
    return this.runParts(parts, 0, "");
  };

  // Run parts[from…] of a parsed line; `printed` is what's been shown so far.
  Shell.prototype.runParts = function (parts, from, printed) {
    var clear = false;
    var out = "", err = "";
    for (var i = from; i < parts.length; i++) {
      var part = parts[i];
      if (!part.text.trim()) continue;
      if (part.op === "&&" && this.lastStatus !== 0) continue;
      if (part.op === "||" && this.lastStatus === 0) continue;
      var pipeline;
      try {
        pipeline = this.parse(part.text);
      } catch (e) {
        this.lastStatus = 2;
        printed += "bash: " + e.message + "\n";
        continue;
      }
      var r = part.bg ? this.background(pipeline, part.text.trim()) : this.runPipeline(pipeline);
      if (r.pending) {
        // sudo wants a password: park this part and the rest of the line.
        this.pending.resume = { parts: parts, from: i };
        return { output: printed + r.output, clear: clear, pending: true };
      }
      printed += r.output;
      out += r.out || "";
      err += r.err || "";
      if (r.clear) { clear = true; printed = ""; }
      if (this.exiting) break;
    }
    this.reap();
    printed += this.flushNotices();
    return { output: printed, out: out, err: err, clear: clear };
  };

  // The answer to a pending prompt. Only sudo asks for one. The console
  // masks what's typed and never echoes or stores it.
  Shell.prototype.answer = function (line) {
    var p = this.pending;
    if (line === this.password) {
      this.pending = null;
      this.sudoUntil = this.clock + 15 * 60;
      if (p.ok()) return this.runParts(p.resume.parts, p.resume.from, "");
      // The right password, but no right to use sudo at all.
      this.lastStatus = 1;
      return this.runParts(p.resume.parts, p.resume.from + 1, this.user + " is not in the sudoers file.\n");
    }
    p.tries += 1;
    if (p.tries >= 3) {
      this.pending = null;
      this.lastStatus = 1;
      return this.runParts(p.resume.parts, p.resume.from + 1, "sudo: 3 incorrect password attempts\n");
    }
    return { output: "Sorry, try again.\n", clear: false, pending: true };
  };

  // Ctrl-C at a prompt abandons it, and the rest of the line.
  Shell.prototype.cancel = function () {
    if (!this.pending) return false;
    this.pending = null;
    this.lastStatus = 1;
    return true;
  };

  // Run a pipeline. Redirections are applied left to right, as in bash, so
  // `> f 2>&1` sends both streams to f while `2>&1 > f` leaves errors on the
  // terminal: 2>&1 copies wherever stdout points *at that moment*.
  // Returns {output, out, err}: `output` is what the terminal shows, in order;
  // `out` and `err` are the same split by stream, for a script's caller.
  Shell.prototype.runPipeline = function (pipeline) {
    var stdin = "";
    var shown = "", shownOut = "", shownErr = "";
    var status = 0;
    var clear = false;
    var self = this;
    for (var i = 0; i < pipeline.length; i++) {
      var cmd = pipeline[i];
      var last = i === pipeline.length - 1;
      var fd1 = { to: last ? "tty" : "pipe" };
      var fd2 = { to: "tty" };
      var files = []; // [{path, append}] in the order they were opened
      var opened = {};
      var failed = null;
      function open(path, append) {
        if (!opened[path]) { opened[path] = { path: path, append: append, text: "" }; files.push(opened[path]); }
        return { to: "file", file: opened[path] };
      }
      cmd.redirects.forEach(function (r) {
        if (r.op === "<") {
          var read = self.readFile("bash", r.path);
          if (read.error) failed = failed || read.error;
          else stdin = read.text;
        } else if (r.op === ">" || r.op === ">>") fd1 = open(r.path, r.op === ">>");
        else if (r.op === "2>" || r.op === "2>>") fd2 = open(r.path, r.op === "2>>");
        else if (r.op === "&>" || r.op === "&>>") { fd1 = open(r.path, r.op === "&>>"); fd2 = fd1; }
        else if (r.op === "2>&1") fd2 = fd1;
      });
      if (failed) { shown += failed + "\n"; shownErr += failed + "\n"; status = 1; stdin = ""; continue; }
      var res;
      if (!cmd.argv.length) {
        // Assignments alone set shell variables (and update exported ones).
        cmd.assigns.forEach(function (a) { self.setVar(a[0], a[1]); });
        res = { out: "", err: "", code: 0 };
      } else {
        // NAME=value cmd: set (and export) for this one command only.
        var saved = cmd.assigns.map(function (a) { return [a[0], self.vars[a[0]], self.exported[a[0]]]; });
        cmd.assigns.forEach(function (a) { self.vars[a[0]] = a[1]; self.exported[a[0]] = true; });
        res = this.exec(cmd.argv, stdin, { tty: fd1.to === "tty" });
        saved.forEach(function (v) {
          if (v[1] === undefined) delete self.vars[v[0]]; else self.vars[v[0]] = v[1];
          if (v[2]) self.exported[v[0]] = true; else delete self.exported[v[0]];
        });
      }
      if (res.pending) return { output: shown, pending: true };
      if (res.clear) clear = true;
      var piped = "";
      // A command's errors usually come out before its last output, so err first.
      [[fd2, res.err, "err"], [fd1, res.out, "out"]].forEach(function (pair) {
        var where = pair[0];
        if (where.to === "tty") {
          shown += pair[1];
          if (pair[2] === "err") shownErr += pair[1]; else shownOut += pair[1];
        } else if (where.to === "pipe") piped += pair[1];
        else where.file.text += pair[1];
      });
      files.forEach(function (f) {
        var why = self.writeFile(f.path, f.text, f.append);
        if (why) { shown += "bash: " + why + "\n"; shownErr += "bash: " + why + "\n"; res.code = 1; }
      });
      stdin = piped;
      status = res.code;
      if (this.exiting) break;
    }
    this.lastStatus = status;
    return { output: shown, out: shownOut, err: shownErr, clear: clear };
  };

  Shell.prototype.setVar = function (name, value) {
    this.vars[name] = value;
    if (name === "HOME") this.home = value;
  };

  // --- processes and jobs ---------------------------------------------------------------
  function procName(command) {
    var first = command.replace(/^-+/, "").split(" ")[0]; // the same rule as app/content/schema.py proc_name()
    return first.slice(first.lastIndexOf("/") + 1).replace(/:$/, "");
  }

  // Start a pipeline in the background (`cmd &`). `sleep N` becomes a process
  // that lives N simulated seconds; anything else runs now and is done.
  Shell.prototype.background = function (pipeline, text) {
    var n = (this.jobs.length ? Math.max.apply(null, this.jobs.map(function (j) { return j.n; })) : 0) + 1;
    var pid = this.nextPid;
    this.nextPid += 1 + (pid % 3);
    var job = { n: n, pid: pid, text: text, state: "Running" };
    var argv = pipeline.length === 1 ? pipeline[0].argv : [];
    var output = "[" + n + "] " + pid + "\n";
    if (argv[0] === "sleep" && pipeline.length === 1 && /^\d+$/.test(argv[1] || "")) {
      this.procs.push({ pid: pid, ppid: SHELL_PID, user: this.user, command: argv.join(" "), tty: "pts/0", cpu: 0, mem: 0.0,
        start: this.clock, end: this.clock + parseInt(argv[1], 10), alive: true, signals: [], ignores: [], job: job });
    } else {
      var r = this.runPipeline(pipeline);
      output += r.output;
      job.state = "Done";
      this.notices.push(job);
    }
    this.jobs.push(job);
    this.lastBg = String(pid);
    this.lastStatus = 0;
    return { output: output };
  };

  // Let simulated time catch up: sleeps that have run their course finish.
  Shell.prototype.reap = function () {
    var self = this;
    this.procs.forEach(function (p) {
      if (p.alive && p.end !== undefined && p.end <= self.clock) {
        p.alive = false;
        if (p.job && p.job.state === "Running") { p.job.state = "Done"; self.notices.push(p.job); }
      }
    });
  };

  function jobLine(job, jobs, withAmp) {
    var current = jobs.length && jobs[jobs.length - 1] === job ? "+" : jobs.length > 1 && jobs[jobs.length - 2] === job ? "-" : " ";
    var text = job.text + (withAmp && job.state === "Running" ? " &" : "");
    return "[" + job.n + "]" + current + "  " + padRight(job.state, 24) + text;
  }

  // What bash prints before the next prompt when a job finishes. Printing a
  // finished job forgets it.
  Shell.prototype.flushNotices = function () {
    var self = this;
    var out = "";
    this.notices.forEach(function (job) {
      if (self.jobs.indexOf(job) === -1) return;
      out += jobLine(job, self.jobs, false) + "\n";
    });
    this.jobs = this.jobs.filter(function (j) { return self.notices.indexOf(j) === -1; });
    this.notices = [];
    return out;
  };

  var SIGNALS = { HUP: 1, INT: 2, KILL: 9, TERM: 15 };
  var SIGNAL_NAMES = { 1: "HUP", 2: "INT", 9: "KILL", 15: "TERM" };
  var SIGNAL_DEATH = { HUP: "Hangup", INT: "Interrupt", KILL: "Killed", TERM: "Terminated" };
  function signalName(text) {
    var t = String(text).toUpperCase().replace(/^SIG/, "");
    if (/^\d+$/.test(t)) return SIGNAL_NAMES[t] || null;
    return SIGNALS[t] ? t : null;
  }

  // Deliver `sig` to process `p`: recorded, and fatal unless the program
  // handles it (only SIGKILL can't be handled).
  Shell.prototype.signal = function (p, sig) {
    if (this.user !== "root" && p.user !== this.user) return "Operation not permitted";
    p.signals.push(sig);
    if (sig !== "KILL" && p.ignores.indexOf(sig) !== -1) return null;
    p.alive = false;
    if (p.job && p.job.state === "Running") { p.job.state = SIGNAL_DEATH[sig]; this.notices.push(p.job); }
    return null;
  };

  Shell.prototype.findJob = function (spec) {
    var jobs = this.jobs;
    if (!spec || spec === "%" || spec === "%+" || spec === "%%") return jobs[jobs.length - 1] || null;
    if (spec === "%-") return jobs[jobs.length - 2] || null;
    var n = parseInt(spec.replace(/^%/, ""), 10);
    return jobs.filter(function (j) { return j.n === n; })[0] || null;
  };

  // Processes pgrep/pkill would pick: name (or, with -f, the whole command
  // line) matching a regex, optionally only one user's. Never the shell itself.
  Shell.prototype.matching = function (p) {
    if (!p.args.length) throw new Error("no matching criteria specified");
    var re = new RegExp(p.args[0]);
    return this.alive().filter(function (pr) {
      if (pr.pid === SHELL_PID) return false;
      if (p.opts.u && pr.user !== p.opts.u) return false;
      return re.test(p.opts.f ? pr.command : procName(pr.command));
    });
  };

  Shell.prototype.alive = function () {
    return this.procs.filter(function (p) { return p.alive; });
  };

  // --- running a command: builtins, the PATH, scripts ------------------------------------
  // Shell builtins run in this shell. Everything else is found on $PATH: an
  // executable file in the filesystem, or one of the console's own commands,
  // which live in /usr/bin and /bin (and the admin tools in /usr/sbin).
  var BUILTINS = ["cd", "echo", "pwd", "export", "unset", "type", "source", ".", "jobs", "kill", "fg", "bg", "exit",
    "help", "clear", "command", "true", "false"];
  var SBIN = ["usermod"];

  var NO_BINARY = ["cd", "export", "unset", "type", "source", ".", "jobs", "fg", "bg", "exit", "help", "clear", "command"];

  // Where `name` would be found on $PATH: every match, or the first.
  Shell.prototype.which = function (name, all) {
    var found = [];
    var self = this;
    var sbin = SBIN.indexOf(name) !== -1;
    (this.vars.PATH || "").split(":").forEach(function (dir) {
      if (!dir) return;
      var path = join(dir, name);
      var node = self.fs[path];
      if (node) {
        if (node.type === "file" && node.mode & 0o111) found.push(path);
      } else if (COMMANDS[name] && NO_BINARY.indexOf(name) === -1) {
        var home = sbin ? ["/usr/sbin", "/sbin"] : ["/usr/bin", "/bin"];
        if (home.indexOf(dir) !== -1) found.push(path);
      }
    });
    return all ? found : found.slice(0, 1);
  };

  // Run an executable file as a script, in a child shell.
  Shell.prototype.runFile = function (path, display, args, stdin) {
    var found = this.lookup(path);
    if (found.error) return { out: "", err: "bash: " + display + ": " + found.error + "\n", code: 127 };
    if (found.node.type === "dir") return { out: "", err: "bash: " + display + ": Is a directory\n", code: 126 };
    if (!this.can(found.node, 1) || !this.can(found.node, 4)) return { out: "", err: "bash: " + display + ": Permission denied\n", code: 126 };
    return this.child(found.node.contents, display, args, stdin);
  };

  // A child shell: it inherits only the EXPORTED variables, and nothing it
  // does to its variables or directory comes back to this shell.
  Shell.prototype.child = function (script, name, args, stdin) {
    var self = this;
    var saved = { vars: this.vars, exported: this.exported, cwd: this.cwd, oldpwd: this.oldpwd, args: this.args,
      scriptName: this.scriptName, lastStatus: this.lastStatus, stdin: this.stdin };
    var env = {};
    Object.keys(this.exported).forEach(function (k) { if (k in self.vars) env[k] = self.vars[k]; });
    var exported = {};
    Object.keys(env).forEach(function (k) { exported[k] = true; });
    this.vars = env;
    this.exported = exported;
    this.args = args;
    this.scriptName = name;
    var out = "", err = "", code = 0;
    this.depth = (this.depth || 0) + 1;
    try {
      if (this.depth > 20) return { out: "", err: "bash: maximum nesting depth exceeded\n", code: 1 };
      var lines = script.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.trim() || /^\s*#/.test(line)) continue;
        var r = this.runParts(splitLists(line), 0, "");
        out += r.out || "";
        err += r.err || "";
        code = this.lastStatus;
        if (this.exiting) { code = this.exitCode; this.exiting = false; break; }
      }
    } finally {
      this.depth -= 1;
      Object.keys(saved).forEach(function (k) { self[k] = saved[k]; });
    }
    return { out: out, err: err, code: code };
  };

  Shell.prototype.exec = function (argv, stdin, io) {
    var name = argv[0];
    if (name.indexOf("/") !== -1) return this.runFile(name, name, argv.slice(1), stdin);
    if (BUILTINS.indexOf(name) !== -1) return this.call(name, argv, stdin, io);
    var path = this.which(name)[0];
    if (!path) {
      return {
        out: "",
        err: name + ": command not found. The Meridian's console only knows the basics; type `help` to see them.\n",
        code: 127,
      };
    }
    if (this.fs[path]) return this.runFile(path, name, argv.slice(1), stdin);
    return this.call(name, argv, stdin, io);
  };

  Shell.prototype.call = function (name, argv, stdin, io) {
    try {
      return COMMANDS[name].call(this, argv.slice(1), stdin, io);
    } catch (e) {
      return { out: "", err: name + ": " + e.message + "\n", code: 1 };
    }
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
  Shell.prototype.runAs = function (who, argv, stdin, io) {
    var name = argv[0];
    var path = name.indexOf("/") !== -1 ? name : this.which(name)[0];
    if (!path) return { out: "", err: "sudo: " + name + ": command not found\n", code: 1 };
    var saved = { user: this.user, group: this.group, groups: this.groups };
    this.user = who;
    this.groups = this.groupsOf(who);
    if (!this.groups.length) this.groups = [who];
    this.group = this.groups[0];
    try {
      if (this.fs[path] || name.indexOf("/") !== -1) return this.runFile(path, name, argv.slice(1), stdin);
      return this.call(name, argv, stdin, io);
    } finally {
      this.user = saved.user;
      this.group = saved.group;
      this.groups = saved.groups;
    }
  };

  // --- helpers for commands ---------------------------------------------------------
  // Split "-la" style flags from operands. `allowed` lists the letters; a flag
  // taking a value (like -n 5) is listed in `valued`.
  function flags(cmd, args, allowed, valued) {
    var opts = {};
    var rest = [];
    valued = valued || "";
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === "--") { rest = rest.concat(args.slice(i + 1)); break; }
      if (a.length > 1 && a[0] === "-" && !/^-\d+$/.test(a)) {
        for (var j = 1; j < a.length; j++) {
          var f = a[j];
          if (valued.indexOf(f) !== -1) {
            var v = a.slice(j + 1) || args[++i];
            if (v === undefined) throw new Error("option requires an argument -- '" + f + "'");
            opts[f] = v;
            break;
          }
          if (allowed.indexOf(f) === -1) throw new Error("invalid option -- '" + f + "'");
          opts[f] = true;
        }
      } else rest.push(a);
    }
    return { opts: opts, args: rest };
  }

  function ok(out) { return { out: out || "", err: "", code: 0 }; }
  function lines(text) {
    if (text === "") return [];
    var ls = text.split("\n");
    if (ls[ls.length - 1] === "") ls.pop();
    return ls;
  }
  function unlines(ls) { return ls.length ? ls.join("\n") + "\n" : ""; }
  function compareNames(a, b) {
    var ka = a.replace(/^\.+/, "").toLowerCase();
    var kb = b.replace(/^\.+/, "").toLowerCase();
    return ka < kb ? -1 : ka > kb ? 1 : a < b ? -1 : a > b ? 1 : 0;
  }
  function modeString(node) {
    var s = node.type === "dir" ? "d" : "-";
    var chars = "rwxrwxrwx";
    for (var i = 0; i < 9; i++) s += node.mode & (1 << (8 - i)) ? chars[i] : "-";
    return s;
  }
  function size(node) { return node.type === "dir" ? 4096 : new TextEncoder().encode(node.contents).length; }
  function human(n) {
    if (n < 1024) return String(n);
    var units = ["K", "M", "G"];
    var v = n;
    for (var i = 0; i < units.length; i++) {
      v /= 1024;
      if (v < 1024 || i === units.length - 1) return v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) + units[i] : Math.ceil(v) + units[i];
    }
  }
  function stamp(d) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var day = d.getDate();
    return MONTHS[d.getMonth()] + " " + (day < 10 ? " " : "") + day + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function padLeft(s, n) { s = String(s); while (s.length < n) s = " " + s; return s; }
  function padRight(s, n) { s = String(s); while (s.length < n) s += " "; return s; }

  // Apply a chmod mode ("600", "u+x,go-w", "a=r") to a mode number.
  function applyMode(spec, mode) {
    if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
    var result = mode;
    spec.split(",").forEach(function (clause) {
      var m = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(clause);
      if (!m) throw new Error("invalid mode: '" + spec + "'");
      var who = m[1] || "a";
      if (who.indexOf("a") !== -1) who = "ugo";
      var bits = (m[3].indexOf("r") !== -1 ? 4 : 0) | (m[3].indexOf("w") !== -1 ? 2 : 0) | (m[3].indexOf("x") !== -1 ? 1 : 0);
      who.split("").forEach(function (w) {
        var shift = w === "u" ? 6 : w === "g" ? 3 : 0;
        if (m[2] === "+") result |= bits << shift;
        else if (m[2] === "-") result &= ~(bits << shift);
        else result = (result & ~(7 << shift)) | (bits << shift);
      });
    });
    return result;
  }

  // Read each operand (or stdin when there are none) for a text filter.
  function inputs(sh, cmd, args, stdin) {
    if (!args.length || (args.length === 1 && args[0] === "-")) return { texts: [{ name: "", text: stdin }], err: "" };
    var texts = [];
    var err = "";
    args.forEach(function (a) {
      var r = sh.readFile(cmd, a);
      if (r.error) err += r.error + "\n";
      else texts.push({ name: a, text: r.text });
    });
    return { texts: texts, err: err };
  }

  // --- the commands ---------------------------------------------------------------
  var COMMANDS = {
    help: function () {
      return ok(
        "Station console commands:\n" +
        "  files:     pwd cd ls cat echo touch mkdir rmdir cp mv rm chmod chown\n" +
        "  text:      grep wc sort uniq head tail cut tee awk sed (small subsets)\n" +
        "  users:     whoami id groups getent sudo usermod\n" +
        "  env:       export unset env printenv type which command source bash\n" +
        "  processes: ps pgrep pkill kill sleep jobs fg bg\n" +
        "  console:   clear help exit\n" +
        "Pipes (|), redirection (> >> < 2> 2>&1 &>), globs (* ? [...]), {a,b}, ; && || and $VARS work.\n" +
        "Tab completes paths; ↑ and ↓ walk your history; Ctrl-C abandons a line.\n"
      );
    },
    clear: function () { return { out: "", err: "", code: 0, clear: true }; },
    pwd: function () { return ok(this.cwd + "\n"); },
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
      node.mtime = new Date();
      return ok();
    },
    sudo: function (rawArgs, stdin, io) {
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
        this.pending = { prompt: "[sudo] password for " + this.user + ": ", secret: true, tries: 0, ok: function () { return sh.isSudoer(); } };
        return { pending: true };
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
      return this.runAs(who, args, stdin, io);
    },
    exit: function (args) {
      var code = args.length ? parseInt(args[0], 10) || 0 : this.lastStatus;
      if (this.depth) { this.exiting = true; this.exitCode = code; return { out: "", err: "", code: code }; }
      if (this.logins.length) {
        var back = this.logins.pop();
        var sh = this;
        Object.keys(back).forEach(function (k) { sh[k] = back[k]; });
        return ok("logout\n");
      }
      return ok("logout\nThere's nowhere to log out to: this console is your station.\n");
    },
    true: function () { return ok(); },
    false: function () { return { out: "", err: "", code: 1 }; },
    export: function (args) {
      var sh = this;
      if (!args.length || args[0] === "-p") {
        return ok(unlines(Object.keys(this.vars).filter(function (k) { return sh.exported[k]; }).sort().map(function (k) {
          return "declare -x " + k + '="' + sh.vars[k] + '"';
        })));
      }
      var err = "";
      args.forEach(function (a) {
        var m = /^([A-Za-z_][A-Za-z0-9_]*)(=(.*))?$/.exec(a);
        if (!m) { err += "bash: export: `" + a + "': not a valid identifier\n"; return; }
        if (m[2] !== undefined) sh.setVar(m[1], m[3]);
        sh.exported[m[1]] = true;
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    unset: function (args) {
      var sh = this;
      args.forEach(function (a) { delete sh.vars[a]; delete sh.exported[a]; });
      return ok();
    },
    env: function (args, stdin, io) {
      var sh = this;
      var i = 0;
      var extra = [];
      while (i < args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[i])) extra.push(args[i++]);
      if (i < args.length) {
        var saved = {};
        extra.forEach(function (a) { var k = a.split("=")[0]; saved[k] = [sh.vars[k], sh.exported[k]]; sh.vars[k] = a.slice(k.length + 1); sh.exported[k] = true; });
        try { return this.exec(args.slice(i), stdin, io); } finally {
          Object.keys(saved).forEach(function (k) {
            if (saved[k][0] === undefined) delete sh.vars[k]; else sh.vars[k] = saved[k][0];
            if (saved[k][1]) sh.exported[k] = true; else delete sh.exported[k];
          });
        }
      }
      var lines_ = Object.keys(this.vars).filter(function (k) { return sh.exported[k]; }).map(function (k) { return k + "=" + sh.vars[k]; });
      return ok(unlines(lines_.concat(extra)));
    },
    printenv: function (args) {
      var sh = this;
      if (!args.length) return COMMANDS.env.call(this, [], "", {});
      var out = args.filter(function (k) { return sh.exported[k] && k in sh.vars; }).map(function (k) { return sh.vars[k]; });
      return { out: unlines(out), err: "", code: out.length === args.length ? 0 : 1 };
    },
    type: function (rawArgs) {
      var p = flags("type", rawArgs, "at");
      var sh = this;
      var out = "", err = "";
      p.args.forEach(function (n) {
        var lines_ = [];
        if (BUILTINS.indexOf(n) !== -1) lines_.push(p.opts.t ? "builtin" : n + " is a shell builtin");
        if (!lines_.length || p.opts.a) {
          sh.which(n, true).slice(0, p.opts.a ? 99 : 1).forEach(function (path) { lines_.push(p.opts.t ? "file" : n + " is " + path); });
        }
        if (!lines_.length) err += "bash: type: " + n + ": not found\n";
        else out += unlines(p.opts.a ? lines_ : lines_.slice(0, 1));
      });
      return { out: out, err: err, code: err ? 1 : 0 };
    },
    which: function (rawArgs) {
      var p = flags("which", rawArgs, "a");
      var sh = this;
      var out = [];
      var missing = false;
      p.args.forEach(function (n) {
        var found = sh.which(n, p.opts.a);
        if (!found.length) missing = true;
        out = out.concat(found);
      });
      return { out: unlines(out), err: "", code: missing ? 1 : 0 };
    },
    command: function (args, stdin, io) {
      if (args[0] === "-v") {
        var n = args[1];
        if (BUILTINS.indexOf(n) !== -1) return ok(n + "\n");
        var found = this.which(n)[0];
        return found ? ok(found + "\n") : { out: "", err: "", code: 1 };
      }
      return this.exec(args, stdin, io);
    },
    source: function (args) {
      if (!args.length) throw new Error("filename argument required");
      var r = this.readFile("bash", args[0]);
      if (r.error) return { out: "", err: r.error.replace(/^bash: /, "bash: ") + "\n", code: 1 };
      var out = "", err = "";
      var sh = this;
      lines(r.text).forEach(function (line) {
        if (!line.trim() || /^\s*#/.test(line)) return;
        var res = sh.runParts(splitLists(line), 0, "");
        out += res.out || "";
        err += res.err || "";
      });
      return { out: out, err: err, code: this.lastStatus };
    },
    ".": function (args, stdin, io) { return COMMANDS.source.call(this, args, stdin, io); },
    bash: function (args, stdin) {
      if (args[0] === "-c") {
        if (args.length < 2) return { out: "", err: "bash: -c: option requires an argument\n", code: 2 };
        return this.child(args[1], args[2] || "bash", args.slice(3), stdin);
      }
      if (args.length) {
        var r = this.readFile("bash", args[0]);
        if (r.error) return { out: "", err: r.error + "\n", code: 127 };
        return this.child(r.text, args[0], args.slice(1), stdin);
      }
      return { out: "", err: "bash: interactive shells inside the console aren't available; use bash -c '…' or bash script.sh\n", code: 1 };
    },
    sh: function (args, stdin) { return COMMANDS.bash.call(this, args, stdin); },
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

    echo: function (args) {
      var newline = true;
      if (args[0] === "-n") { newline = false; args = args.slice(1); }
      return ok(args.join(" ") + (newline ? "\n" : ""));
    },
    cd: function (args) {
      if (args.length > 1) return { out: "", err: "bash: cd: too many arguments\n", code: 1 };
      var target = args.length ? args[0] : this.vars.HOME;
      var dash = target === "-";
      if (dash) {
        if (!this.oldpwd) return { out: "", err: "bash: cd: OLDPWD not set\n", code: 1 };
        target = this.oldpwd;
      }
      var found = this.lookup(target);
      if (found.error) return { out: "", err: "bash: cd: " + target + ": " + found.error + "\n", code: 1 };
      if (found.node.type !== "dir") return { out: "", err: "bash: cd: " + target + ": Not a directory\n", code: 1 };
      if (!this.can(found.node, 1)) return { out: "", err: "bash: cd: " + target + ": Permission denied\n", code: 1 };
      this.oldpwd = this.cwd;
      this.cwd = found.path;
      this.vars.OLDPWD = this.oldpwd;
      this.vars.PWD = this.cwd;
      return ok(dash ? this.cwd + "\n" : ""); // `cd -` prints where it went
    },
    ls: function (rawArgs, stdin, io) {
      var p = flags("ls", rawArgs, "lahd1A");
      var o = p.opts;
      var sh = this;
      var operands = p.args.length ? p.args : ["."];
      var err = "";
      var files = [];
      var dirs = [];
      operands.forEach(function (a) {
        var f = sh.lookup(a);
        if (f.error) { err += "ls: cannot access '" + a + "': " + f.error + "\n"; return; }
        if (f.node.type === "dir" && !o.d) dirs.push({ name: a, path: f.path, node: f.node });
        else files.push({ name: a, path: f.path, node: f.node });
      });
      function entriesOf(dir) {
        var names = sh.children(dir.path);
        if (!o.a) names = names.filter(function (n) { return n.charAt(0) !== "."; });
        names.sort(compareNames);
        var list = names.map(function (n) { return { name: n, node: sh.fs[join(dir.path, n)] }; });
        if (o.a && !o.A) {
          list.unshift({ name: "..", node: sh.fs[parentOf(dir.path)] }, { name: ".", node: dir.node });
          list.sort(function (x, y) { return x.name === "." ? -1 : y.name === "." ? 1 : x.name === ".." ? -1 : y.name === ".." ? 1 : 0; });
        }
        return list;
      }
      function links(node, path) {
        if (node.type !== "dir") return 1;
        return 2 + sh.children(path).filter(function (n) { return sh.fs[join(path, n)].type === "dir"; }).length;
      }
      function render(list, dirPath) {
        if (!o.l) {
          var names = list.map(function (e) { return e.name; });
          if (!names.length) return "";
          return io.tty && !o["1"] ? names.join("  ") + "\n" : unlines(names);
        }
        var rows = list.map(function (e) {
          var path = e.path || (dirPath ? (e.name === "." ? dirPath : e.name === ".." ? parentOf(dirPath) : join(dirPath, e.name)) : e.name);
          var bytes = size(e.node);
          return [modeString(e.node), links(e.node, path), e.node.owner, e.node.group, o.h ? human(bytes) : bytes, stamp(e.node.mtime), e.name];
        });
        var w = [0, 0, 0, 0, 0];
        rows.forEach(function (r) { for (var k = 0; k < 5; k++) w[k] = Math.max(w[k], String(r[k]).length); });
        return unlines(rows.map(function (r) {
          return [r[0], padLeft(r[1], w[1]), padRight(r[2], w[2]), padRight(r[3], w[3]), padLeft(r[4], w[4]), r[5], r[6]].join(" ");
        }));
      }
      function total(list) {
        var blocks = 0;
        list.forEach(function (e) { var b = size(e.node); blocks += e.node.type === "dir" ? 4 : b ? Math.ceil(b / 4096) * 4 : 0; });
        return "total " + (o.h && blocks >= 1024 ? human(blocks * 1024) : blocks) + "\n";
      }
      var out = "";
      files.sort(function (x, y) { return compareNames(x.name, y.name); });
      dirs.sort(function (x, y) { return compareNames(x.name, y.name); });
      if (files.length) out += render(files, null);
      var many = operands.length > 1; // GNU counts the operands given, found or not
      dirs.forEach(function (d, k) {
        if (!sh.can(d.node, 4)) { err += "ls: cannot open directory '" + d.name + "': Permission denied\n"; return; }
        if (out || k > 0) out += "\n";
        if (many) out += d.name + ":\n";
        var list = entriesOf(d);
        if (o.l) out += total(list);
        out += render(list, d.path);
      });
      return { out: out, err: err, code: err ? 2 : 0 };
    },
    cat: function (args, stdin) {
      var r = inputs(this, "cat", args, stdin);
      return { out: r.texts.map(function (t) { return t.text; }).join(""), err: r.err, code: r.err ? 1 : 0 };
    },
    touch: function (args) {
      if (!args.length) throw new Error("missing file operand");
      var err = "";
      var sh = this;
      args.forEach(function (a) {
        var f = sh.lookup(a);
        if (f.node) {
          if (!sh.can(f.node, 2) && f.node.owner !== sh.user) err += "touch: cannot touch '" + a + "': Permission denied\n";
          else f.node.mtime = new Date();
          return;
        }
        var why = f.error === "No such file or directory" ? sh.writableParent(f.path) : f.error;
        if (why) err += "touch: cannot touch '" + a + "': " + why + "\n";
        else sh.create(f.path, "file");
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    mkdir: function (rawArgs) {
      var p = flags("mkdir", rawArgs, "p");
      if (!p.args.length) throw new Error("missing operand");
      var err = "";
      var sh = this;
      p.args.forEach(function (a) {
        var abs = sh.resolve(a);
        var chain = p.opts.p ? [] : [abs];
        if (p.opts.p) { for (var at = abs; at !== "/"; at = parentOf(at)) chain.unshift(at); }
        for (var i = 0; i < chain.length; i++) {
          var existing = sh.fs[chain[i]];
          if (existing) {
            if (p.opts.p && existing.type === "dir") continue;
            err += "mkdir: cannot create directory ‘" + a + "’: File exists\n";
            return;
          }
          var why = sh.writableParent(chain[i]);
          if (why) { err += "mkdir: cannot create directory ‘" + a + "’: " + why + "\n"; return; }
          sh.create(chain[i], "dir");
        }
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    rmdir: function (args) {
      var err = "";
      var sh = this;
      args.forEach(function (a) {
        var f = sh.lookup(a);
        if (f.error) { err += "rmdir: failed to remove '" + a + "': " + f.error + "\n"; return; }
        if (f.node.type !== "dir") { err += "rmdir: failed to remove '" + a + "': Not a directory\n"; return; }
        if (sh.children(f.path).length) { err += "rmdir: failed to remove '" + a + "': Directory not empty\n"; return; }
        var why = sh.writableParent(f.path);
        if (why) { err += "rmdir: failed to remove '" + a + "': " + why + "\n"; return; }
        delete sh.fs[f.path];
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    rm: function (rawArgs) {
      var p = flags("rm", rawArgs, "rfRi");
      var recursive = p.opts.r || p.opts.R;
      if (!p.args.length && !p.opts.f) throw new Error("missing operand");
      var err = "";
      var sh = this;
      p.args.forEach(function (a) {
        var f = sh.lookup(a);
        if (f.error) { if (!p.opts.f || f.error !== "No such file or directory") err += "rm: cannot remove '" + a + "': " + f.error + "\n"; return; }
        if (f.path === "/") { err += "rm: it is dangerous to operate recursively on '/'\n"; return; }
        if (f.node.type === "dir" && !recursive) { err += "rm: cannot remove '" + a + "': Is a directory\n"; return; }
        var why = sh.writableParent(f.path);
        if (why) { err += "rm: cannot remove '" + a + "': " + why + "\n"; return; }
        sh.removeTree(f.path);
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    cp: function (rawArgs) {
      var p = flags("cp", rawArgs, "rRa");
      var recursive = p.opts.r || p.opts.R || p.opts.a;
      return this.transfer("cp", p.args, recursive, false);
    },
    mv: function (rawArgs) {
      var p = flags("mv", rawArgs, "fi");
      return this.transfer("mv", p.args, true, true);
    },
    chmod: function (rawArgs) {
      // Not flags(): a mode like "-w" starts with a dash too.
      var args = rawArgs.slice();
      var recursive = false;
      while (args[0] === "-R") { recursive = true; args.shift(); }
      if (args.length < 2) throw new Error("missing operand");
      var spec = args[0];
      var sh = this;
      var err = "";
      args.slice(1).forEach(function (a) {
        var f = sh.lookup(a);
        if (f.error) { err += "chmod: cannot access '" + a + "': " + f.error + "\n"; return; }
        var targets = recursive ? Object.keys(sh.fs).filter(function (q) { return q === f.path || q.indexOf(f.path + "/") === 0; }) : [f.path];
        targets.forEach(function (t) {
          var node = sh.fs[t];
          if (sh.user !== "root" && node.owner !== sh.user) { err += "chmod: changing permissions of '" + (t === f.path ? a : t) + "': Operation not permitted\n"; return; }
          node.mode = applyMode(spec, node.mode);
        });
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    chown: function (rawArgs) {
      var p = flags("chown", rawArgs, "R");
      if (p.args.length < 2) throw new Error("missing operand");
      var parts = p.args[0].split(":");
      var newOwner = parts[0] || null;
      var newGroup = parts.length > 1 ? parts[1] || null : null;
      var sh = this;
      var err = "";
      p.args.slice(1).forEach(function (a) {
        var f = sh.lookup(a);
        if (f.error) { err += "chown: cannot access '" + a + "': " + f.error + "\n"; return; }
        var targets = p.opts.R ? Object.keys(sh.fs).filter(function (q) { return q === f.path || q.indexOf(f.path + "/") === 0; }) : [f.path];
        targets.forEach(function (t) {
          var node = sh.fs[t];
          var givingAway = newOwner && newOwner !== node.owner;
          var regrouping = newGroup && newGroup !== node.group && !(node.owner === sh.user && newGroup === sh.group);
          if (sh.user !== "root" && (givingAway || regrouping)) {
            err += "chown: changing ownership of '" + (t === f.path ? a : t) + "': Operation not permitted\n";
            return;
          }
          if (newOwner) node.owner = newOwner;
          if (newGroup) node.group = newGroup;
        });
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    grep: function (rawArgs, stdin) {
      var p = flags("grep", rawArgs, "ivncE");
      if (!p.args.length) throw new Error("usage: grep [-ivnc] PATTERN [FILE]...");
      var re;
      try { re = new RegExp(p.args[0], p.opts.i ? "i" : ""); } catch (e) { throw new Error("invalid pattern: " + p.args[0]); }
      var r = inputs(this, "grep", p.args.slice(1), stdin);
      var many = r.texts.length > 1;
      var out = [];
      var matched = 0;
      r.texts.forEach(function (t) {
        var count = 0;
        lines(t.text).forEach(function (line, n) {
          if (re.test(line) === !p.opts.v) {
            count++;
            if (!p.opts.c) out.push((many ? t.name + ":" : "") + (p.opts.n ? n + 1 + ":" : "") + line);
          }
        });
        if (p.opts.c) out.push((many ? t.name + ":" : "") + count);
        matched += count;
      });
      return { out: unlines(out), err: r.err, code: r.err ? 2 : matched ? 0 : 1 };
    },
    wc: function (rawArgs, stdin) {
      var p = flags("wc", rawArgs, "lwc");
      var which = p.opts.l || p.opts.w || p.opts.c ? ["l", "w", "c"].filter(function (k) { return p.opts[k]; }) : ["l", "w", "c"];
      var r = inputs(this, "wc", p.args, stdin);
      var rows = r.texts.map(function (t) {
        var counts = {
          l: (t.text.match(/\n/g) || []).length,
          w: t.text.split(/\s+/).filter(Boolean).length,
          c: new TextEncoder().encode(t.text).length,
        };
        return { name: t.name, values: which.map(function (k) { return counts[k]; }) };
      });
      if (rows.length > 1) {
        rows.push({ name: "total", values: which.map(function (_, i) { return rows.reduce(function (s, row) { return s + row.values[i]; }, 0); }) });
      }
      var fromStdin = !p.args.length;
      var width = which.length === 1 && rows.length === 1 ? 0 : fromStdin ? 7 : Math.max.apply(null, rows.map(function (row) { return Math.max.apply(null, row.values.map(function (v) { return String(v).length; })); }));
      return {
        out: unlines(rows.map(function (row) {
          return row.values.map(function (v) { return padLeft(v, width); }).join(" ") + (row.name ? " " + row.name : "");
        })),
        err: r.err,
        code: r.err ? 1 : 0,
      };
    },
    sort: function (rawArgs, stdin) {
      var p = flags("sort", rawArgs, "rnu");
      var r = inputs(this, "sort", p.args, stdin);
      var all = [];
      r.texts.forEach(function (t) { all = all.concat(lines(t.text)); });
      all.sort(p.opts.n ? function (a, b) { return (parseFloat(a) || 0) - (parseFloat(b) || 0) || (a < b ? -1 : a > b ? 1 : 0); } : function (a, b) {
        var ka = a.toLowerCase().replace(/[^a-z0-9]/g, "");
        var kb = b.toLowerCase().replace(/[^a-z0-9]/g, "");
        return ka < kb ? -1 : ka > kb ? 1 : a < b ? -1 : a > b ? 1 : 0;
      });
      if (p.opts.r) all.reverse();
      if (p.opts.u) all = all.filter(function (l, i) { return i === 0 || l !== all[i - 1]; });
      return { out: unlines(all), err: r.err, code: r.err ? 2 : 0 };
    },
    uniq: function (rawArgs, stdin) {
      var p = flags("uniq", rawArgs, "c");
      var r = inputs(this, "uniq", p.args.slice(0, 1), stdin);
      var out = [];
      var prev = null;
      var count = 0;
      function flush() { if (prev !== null) out.push(p.opts.c ? padLeft(count, 7) + " " + prev : prev); }
      lines(r.texts.length ? r.texts[0].text : "").forEach(function (l) {
        if (l === prev) count++;
        else { flush(); prev = l; count = 1; }
      });
      flush();
      return { out: unlines(out), err: r.err, code: r.err ? 1 : 0 };
    },
    tee: function (rawArgs, stdin) {
      // A T-junction: stdin goes on to stdout and into every file named.
      var p = flags("tee", rawArgs, "a");
      var sh = this;
      var err = "";
      p.args.forEach(function (a) {
        var why = sh.writeFile(a, stdin, !!p.opts.a);
        if (why) err += "tee: " + why + "\n";
      });
      return { out: stdin, err: err, code: err ? 1 : 0 };
    },
    head: function (rawArgs, stdin) { return headTail.call(this, "head", rawArgs, stdin); },
    tail: function (rawArgs, stdin) { return headTail.call(this, "tail", rawArgs, stdin); },
    cut: function (rawArgs, stdin) {
      var p = flags("cut", rawArgs, "", "dfc");
      if (!p.opts.f && !p.opts.c) throw new Error("you must specify a list of bytes, characters, or fields");
      var picks = parseList(p.opts.f || p.opts.c);
      var delim = p.opts.d === undefined ? "\t" : p.opts.d;
      if (delim.length !== 1) throw new Error("the delimiter must be a single character");
      var r = inputs(this, "cut", p.args, stdin);
      var out = [];
      r.texts.forEach(function (t) {
        lines(t.text).forEach(function (l) {
          if (p.opts.c) { out.push(l.split("").filter(function (_, i) { return picks(i + 1); }).join("")); return; }
          if (l.indexOf(delim) === -1) { out.push(l); return; }
          out.push(l.split(delim).filter(function (_, i) { return picks(i + 1); }).join(delim));
        });
      });
      return { out: unlines(out), err: r.err, code: r.err ? 1 : 0 };
    },
  };

  // --- awk and sed: small, honest subsets (#41) ------------------------------------------
  // Enough for what Unit 1.1 teaches, with GNU-accurate output. Anything outside
  // the subset is refused with a clear message, never silently answered wrong.
  function Unsupported(what) { this.message = what; }

  // awk: `-F SEP`, rules of `pattern { action }` with BEGIN/END, patterns of
  // /regex/, comparisons, ~ !~, ! && || and parentheses; actions of `print`
  // with fields, NF, NR, strings and concatenation, separated by ; or newlines.
  function awkTokens(src) {
    var toks = [];
    var i = 0;
    function prevAllowsRegex() {
      var t = toks[toks.length - 1];
      return !t || (t.t === "op" && ["(", "!", "&&", "||", "~", "!~", "{", ";", ",", "\n"].indexOf(t.v) !== -1) || t.t === "nl";
    }
    while (i < src.length) {
      var c = src[i];
      if (c === " " || c === "\t") { i++; continue; }
      if (c === "\n") { toks.push({ t: "op", v: ";" }); i++; continue; }
      if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === '"') {
        var j = i + 1, str = "";
        while (j < src.length && src[j] !== '"') {
          if (src[j] === "\\" && j + 1 < src.length) { str += { n: "\n", t: "\t", '"': '"', "\\": "\\" }[src[j + 1]] || "\\" + src[j + 1]; j += 2; }
          else str += src[j++];
        }
        if (j >= src.length) throw new Unsupported("unterminated string");
        toks.push({ t: "str", v: str }); i = j + 1; continue;
      }
      if (c === "/" && prevAllowsRegex()) {
        var k = i + 1, re = "";
        while (k < src.length && src[k] !== "/") { if (src[k] === "\\" && src[k + 1] === "/") { re += "/"; k += 2; } else re += src[k++]; }
        if (k >= src.length) throw new Unsupported("unterminated regex");
        toks.push({ t: "re", v: re }); i = k + 1; continue;
      }
      var m = /^(\d+(\.\d+)?)/.exec(src.slice(i));
      if (m) { toks.push({ t: "num", v: parseFloat(m[1]) }); i += m[1].length; continue; }
      m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      if (m) { toks.push({ t: "word", v: m[0] }); i += m[0].length; continue; }
      m = /^(==|!=|<=|>=|!~|&&|\|\||[<>~!{}();,$])/.exec(src.slice(i));
      if (m) { toks.push({ t: "op", v: m[0] }); i += m[0].length; continue; }
      throw new Unsupported("'" + c + "'");
    }
    return toks;
  }

  function parseAwk(src) {
    var toks = awkTokens(src);
    var at = 0;
    function peek(v) { var t = toks[at]; return t && (v === undefined || t.v === v) ? t : null; }
    function take(v) { var t = peek(v); if (!t) throw new Unsupported(v ? "expected '" + v + "'" : "unexpected end"); at++; return t; }
    function skipSemis() { while (peek(";")) at++; }
    // factor: $factor | number | "string" | NF | NR | ( expr )
    function factor() {
      var t = toks[at];
      if (!t) throw new Unsupported("unexpected end");
      if (t.v === "$") { at++; return { k: "field", of: factor() }; }
      if (t.t === "num") { at++; return { k: "lit", v: t.v }; }
      if (t.t === "str") { at++; return { k: "lit", v: t.v }; }
      if (t.t === "word" && (t.v === "NF" || t.v === "NR")) { at++; return { k: "var", v: t.v }; }
      if (t.v === "(") { at++; var e = orExpr(); take(")"); return e; }
      if (t.t === "re") { at++; return { k: "match", re: t.v, neg: false, of: { k: "field", of: { k: "lit", v: 0 } } }; }
      throw new Unsupported(t.t === "word" ? "'" + t.v + "'" : "'" + t.v + "'");
    }
    function startsFactor() { var t = toks[at]; return t && (t.v === "$" || t.t === "num" || t.t === "str" || (t.t === "word" && (t.v === "NF" || t.v === "NR")) || t.v === "("); }
    // concatenation: factors side by side
    function concat() {
      var parts = [factor()];
      while (startsFactor()) parts.push(factor());
      return parts.length === 1 ? parts[0] : { k: "cat", parts: parts };
    }
    function comparison() {
      var left = concat();
      var t = toks[at];
      if (t && ["==", "!=", "<", "<=", ">", ">="].indexOf(t.v) !== -1) { at++; return { k: "cmp", op: t.v, l: left, r: concat() }; }
      if (t && (t.v === "~" || t.v === "!~")) {
        at++;
        var r = take();
        if (r.t !== "re") throw new Unsupported("~ needs a /regex/");
        return { k: "match", re: r.v, neg: t.v === "!~", of: left };
      }
      return left;
    }
    function unary() { if (peek("!")) { at++; return { k: "not", e: unary() }; } return comparison(); }
    function andExpr() { var e = unary(); while (peek("&&")) { at++; e = { k: "and", l: e, r: unary() }; } return e; }
    function orExpr() { var e = andExpr(); while (peek("||")) { at++; e = { k: "or", l: e, r: andExpr() }; } return e; }
    function action() {
      take("{");
      var stmts = [];
      skipSemis();
      while (!peek("}")) {
        var t = take();
        if (t.v !== "print") throw new Unsupported("'" + t.v + "' (actions can only print)");
        var exprs = [];
        if (!peek(";") && !peek("}")) {
          exprs.push(concat());
          while (peek(",")) { at++; exprs.push(concat()); }
        }
        stmts.push(exprs);
        if (!peek("}")) take(";");
        skipSemis();
      }
      take("}");
      return stmts;
    }
    var rules = [];
    skipSemis();
    while (at < toks.length) {
      var rule = { when: "line", pattern: null, action: null };
      if (peek("BEGIN") || peek("END")) rule.when = take().v;
      else if (!peek("{")) rule.pattern = orExpr();
      if (peek("{")) rule.action = action();
      else if (rule.when !== "line") throw new Unsupported(rule.when + " needs an action");
      rules.push(rule);
      skipSemis();
    }
    return rules;
  }

  function looksNumeric(v) { return typeof v === "number" || /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(v); }

  function runAwk(sh, rawArgs, stdin) {
    var args = rawArgs.slice();
    var fs = null;
    while (args.length && /^-F/.test(args[0])) {
      var a = args.shift();
      fs = a.length > 2 ? a.slice(2) : args.shift();
      if (fs === "\\t") fs = "\t";
    }
    if (args[0] && args[0][0] === "-" && args[0] !== "-") {
      return { out: "", err: "awk: unsupported on the station console: option " + args[0] + "\n", code: 2 };
    }
    if (!args.length) return { out: "", err: "usage: awk [-F fs] 'program' [file ...]\n", code: 2 };
    var src = args.shift();
    var rules;
    try { rules = parseAwk(src); } catch (e) {
      if (e instanceof Unsupported) return { out: "", err: "awk: unsupported on the station console: " + e.message + " in '" + src + "'\n", code: 2 };
      throw e;
    }
    var r = inputs(sh, "awk", args, stdin);
    var out = [];
    var rec = { fields: [], line: "", nr: 0 };
    function split(line) {
      if (fs === null || fs === " ") return line.trim() ? line.trim().split(/[ \t]+/) : [];
      if (fs.length === 1) return line.split(fs);
      return line.split(new RegExp(fs));
    }
    function val(e) {
      switch (e.k) {
        case "lit": return e.v;
        case "var": return e.v === "NF" ? rec.fields.length : rec.nr;
        case "field":
          var n = Math.floor(Number(val(e.of)));
          if (isNaN(n) || n < 0) throw new Unsupported("a field number must be 0 or more");
          return n === 0 ? rec.line : rec.fields[n - 1] !== undefined ? rec.fields[n - 1] : "";
        case "cat": return e.parts.map(function (p) { return str(val(p)); }).join("");
        case "cmp":
          var l = val(e.l), rv = val(e.r);
          var numeric = looksNumeric(l) && looksNumeric(rv);
          var x = numeric ? Number(l) : str(l), y = numeric ? Number(rv) : str(rv);
          return { "==": x === y, "!=": x !== y, "<": x < y, "<=": x <= y, ">": x > y, ">=": x >= y }[e.op] ? 1 : 0;
        case "match": return new RegExp(e.re).test(str(val(e.of))) !== e.neg ? 1 : 0;
        case "not": return truthy(val(e.e)) ? 0 : 1;
        case "and": return truthy(val(e.l)) && truthy(val(e.r)) ? 1 : 0;
        case "or": return truthy(val(e.l)) || truthy(val(e.r)) ? 1 : 0;
      }
    }
    function str(v) { return typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6)) : v; }
    function truthy(v) { return typeof v === "number" ? v !== 0 : looksNumeric(v) ? Number(v) !== 0 : v !== ""; }
    function act(rule) {
      if (!rule.action) { out.push(rec.line); return; }
      rule.action.forEach(function (exprs) {
        out.push(exprs.length ? exprs.map(function (e) { return str(val(e)); }).join(" ") : rec.line);
      });
    }
    try {
      rules.filter(function (x) { return x.when === "BEGIN"; }).forEach(act);
      r.texts.forEach(function (t) {
        lines(t.text).forEach(function (line) {
          rec = { line: line, fields: split(line), nr: rec.nr + 1 };
          rules.filter(function (x) { return x.when === "line"; }).forEach(function (rule) {
            if (!rule.pattern || truthy(val(rule.pattern))) act(rule);
          });
        });
      });
      rec.line = ""; rec.fields = [];
      rules.filter(function (x) { return x.when === "END"; }).forEach(act);
    } catch (e) {
      if (e instanceof Unsupported) return { out: "", err: "awk: unsupported on the station console: " + e.message + "\n", code: 2 };
      throw e;
    }
    return { out: unlines(out), err: r.err, code: r.err ? 2 : 0 };
  }

  // sed: -n, -e (repeatable), -i[SUFFIX], -E; commands s/// (flags g p I),
  // p, d, q, with addresses N, $, /regex/ and ranges A,B; ; or newlines between.
  // Basic regular expressions (BRE) by default, as GNU sed: \( \) \{ \} \+ \?
  // \| are the special ones, and -E makes the bare forms special instead.
  function breToJs(re) {
    var out = "";
    for (var i = 0; i < re.length; i++) {
      var c = re[i];
      if (c === "\\" && i + 1 < re.length) {
        var n = re[++i];
        out += "(){}+?|".indexOf(n) !== -1 ? n : "\\" + n;
      } else if ("(){}+?|".indexOf(c) !== -1) {
        out += "\\" + c;
      } else out += c;
    }
    return out;
  }

  function parseSed(script, ere) {
    var cmds = [];
    var i = 0;
    function regexUntil(delim) {
      var re = "";
      while (i < script.length && script[i] !== delim) {
        if (script[i] === "\\" && script[i + 1] === delim) { re += delim; i += 2; }
        else if (script[i] === "\\" && i + 1 < script.length) { re += script[i] + script[i + 1]; i += 2; }
        else re += script[i++];
      }
      if (i >= script.length) throw new Unsupported("unterminated `s' command");
      i++;
      return re;
    }
    function toRegex(re, flags) {
      try { return new RegExp(ere ? re : breToJs(re), flags); } catch (e) { throw new Unsupported("invalid regex /" + re + "/"); }
    }
    function address() {
      if (/\d/.test(script[i] || "")) { var m = /^\d+/.exec(script.slice(i)); i += m[0].length; return { line: parseInt(m[0], 10) }; }
      if (script[i] === "$") { i++; return { last: true }; }
      if (script[i] === "/") { i++; return { re: toRegex(regexUntil("/"), "") }; }
      return null;
    }
    while (i < script.length) {
      while (i < script.length && /[\s;]/.test(script[i])) i++;
      if (i >= script.length) break;
      var cmd = { from: address(), to: null };
      if (cmd.from && script[i] === ",") { i++; cmd.to = address(); if (!cmd.to) throw new Unsupported("unexpected `,'"); }
      while (script[i] === " ") i++;
      var c = script[i++];
      if (c === "s") {
        var delim = script[i++];
        if (!delim || /[\s\\\n]/.test(delim)) throw new Unsupported("unterminated `s' command");
        var re = regexUntil(delim);
        var repl = regexUntil(delim);
        var fl = /^[gpI]*/.exec(script.slice(i))[0];
        i += fl.length;
        cmd.op = "s";
        cmd.re = toRegex(re, (fl.indexOf("g") !== -1 ? "g" : "") + (fl.indexOf("I") !== -1 ? "i" : ""));
        cmd.repl = repl;
        cmd.print = fl.indexOf("p") !== -1;
      } else if (c === "p" || c === "d" || c === "q") {
        cmd.op = c;
      } else {
        throw new Unsupported(c === undefined ? "missing command" : "the `" + c + "' command");
      }
      cmds.push(cmd);
    }
    return cmds;
  }

  function sedReplace(text, cmd) {
    return text.replace(cmd.re, function () {
      var groups = Array.prototype.slice.call(arguments, 0, -2);
      var out = "";
      for (var i = 0; i < cmd.repl.length; i++) {
        var c = cmd.repl[i];
        if (c === "\\" && i + 1 < cmd.repl.length) {
          var n = cmd.repl[++i];
          out += /\d/.test(n) ? groups[+n] || "" : n === "n" ? "\n" : n === "t" ? "\t" : n;
        } else out += c === "&" ? groups[0] : c;
      }
      return out;
    });
  }

  function runSed(sh, rawArgs, stdin) {
    var scripts = [];
    var quiet = false, ere = false, inPlace = null;
    var files = [];
    for (var a = 0; a < rawArgs.length; a++) {
      var arg = rawArgs[a];
      if (arg === "-n") quiet = true;
      else if (arg === "-E" || arg === "-r") ere = true;
      else if (arg === "-e") scripts.push(rawArgs[++a] || "");
      else if (/^-i/.test(arg)) inPlace = arg.slice(2);
      else if (/^-[nEr]+$/.test(arg)) { quiet = quiet || /n/.test(arg); ere = ere || /[Er]/.test(arg); }
      else if (arg[0] === "-" && arg !== "-") return { out: "", err: "sed: unsupported on the station console: option " + arg + "\n", code: 1 };
      else files.push(arg);
    }
    if (!scripts.length) {
      if (!files.length) return { out: "", err: "Usage: sed [-n] [-E] [-i[SUFFIX]] [-e script] script [file...]\n", code: 1 };
      scripts.push(files.shift());
    }
    var cmds;
    try { cmds = parseSed(scripts.join("\n"), ere); } catch (e) {
      if (e instanceof Unsupported) return { out: "", err: "sed: unsupported on the station console: " + e.message + "\n", code: 1 };
      throw e;
    }
    if (inPlace !== null && !files.length) return { out: "", err: "sed: no input files\n", code: 1 };
    function edit(text, isLastFile) {
      var ls = lines(text);
      var out = [];
      var ranges = cmds.map(function () { return false; });
      var quit = false;
      ls.forEach(function (line, idx) {
        if (quit) return;
        var n = idx + 1;
        var last = isLastFile && idx === ls.length - 1;
        var space = line;
        var deleted = false;
        function hits(addr) { return addr.last ? last : addr.re ? addr.re.test(space) : addr.line === n; }
        for (var k = 0; k < cmds.length && !deleted; k++) {
          var c = cmds[k];
          var on;
          if (!c.from) on = true;
          else if (!c.to) on = hits(c.from);
          else if (ranges[k]) { on = true; if (hits(c.to) || (c.to.line && n >= c.to.line)) ranges[k] = false; }
          else if (hits(c.from)) { on = true; ranges[k] = !(c.to.line && n >= c.to.line); }
          else on = false;
          if (!on) continue;
          if (c.re) c.re.lastIndex = 0;
          if (c.op === "s") {
            var before = space;
            space = sedReplace(space, c);
            if (c.print && space !== before) out.push(space);
          } else if (c.op === "p") out.push(space);
          else if (c.op === "d") deleted = true;
          else if (c.op === "q") { quit = true; break; }
        }
        if (!deleted && !quiet) out.push(space);
      });
      return unlines(out);
    }
    if (inPlace === null) {
      var r = inputs(sh, "sed", files, stdin);
      var all = r.texts.map(function (t) { return t.text; }).join("");
      return { out: edit(all, true), err: r.err, code: r.err ? 2 : 0 };
    }
    // -i: rewrite each file; with a suffix, keep the original beside it.
    var err = "";
    files.forEach(function (f) {
      var read = sh.readFile("sed", f);
      if (read.error) { err += read.error.replace(/^sed: (.*): /, "sed: can't read $1: ") + "\n"; return; }
      var found = sh.lookup(f);
      var why = sh.writableParent(found.path);
      if (why) { err += "sed: couldn't open temporary file " + parentOf(found.path) + "/sed" + "XXXXXX: " + why + "\n"; return; }
      if (inPlace) {
        var backup = sh.writeFile(f + inPlace, read.text, false);
        if (backup) { err += "sed: " + backup + "\n"; return; }
      }
      found.node.contents = edit(read.text, true);
      found.node.mtime = new Date();
    });
    return { out: "", err: err, code: err ? 4 : 0 };
  }

  function parseList(spec) {
    var ranges = spec.split(",").map(function (part) {
      var m = /^(\d*)-?(\d*)$/.exec(part);
      if (!m || (!m[1] && !m[2])) throw new Error("invalid field list: '" + spec + "'");
      var lo = m[1] ? parseInt(m[1], 10) : 1;
      var hi = part.indexOf("-") === -1 ? lo : m[2] ? parseInt(m[2], 10) : Infinity;
      return [lo, hi];
    });
    return function (n) { return ranges.some(function (r) { return n >= r[0] && n <= r[1]; }); };
  }

  COMMANDS.awk = function (args, stdin) { return runAwk(this, args, stdin); };
  COMMANDS.sed = function (args, stdin) { return runSed(this, args, stdin); };

  function headTail(cmd, rawArgs, stdin) {
    var args = rawArgs.map(function (a) { return /^-\d+$/.test(a) ? "-n" + a.slice(1) : a; });
    var p = flags(cmd, args, "", "n");
    var n = p.opts.n === undefined ? 10 : parseInt(p.opts.n, 10);
    if (isNaN(n)) throw new Error("invalid number of lines: '" + p.opts.n + "'");
    var r = inputs(this, cmd, p.args, stdin);
    var many = r.texts.length > 1;
    var out = "";
    r.texts.forEach(function (t, i) {
      var ls = lines(t.text);
      var picked = cmd === "head" ? ls.slice(0, n) : ls.slice(Math.max(0, ls.length - n));
      if (many) out += (i ? "\n" : "") + "==> " + t.name + " <==\n";
      out += unlines(picked);
    });
    return { out: out, err: r.err, code: r.err ? 1 : 0 };
  }

  // cp and mv: one source to a name, or several into a directory.
  Shell.prototype.transfer = function (cmd, args, recursive, move) {
    if (args.length < 2) throw new Error(args.length ? "missing destination file operand after '" + args[0] + "'" : "missing file operand");
    var sh = this;
    var dest = args[args.length - 1];
    var sources = args.slice(0, -1);
    var destFound = this.lookup(dest);
    var intoDir = destFound.node && destFound.node.type === "dir";
    if (sources.length > 1 && !intoDir) return { out: "", err: cmd + ": target '" + dest + "': Not a directory\n", code: 1 };
    var err = "";
    sources.forEach(function (src) {
      var s = sh.lookup(src);
      if (s.error) { err += cmd + ": cannot stat '" + src + "': " + s.error + "\n"; return; }
      if (s.node.type === "dir" && !recursive) { err += "cp: -r not specified; omitting directory '" + src + "'\n"; return; }
      if (!move && !sh.can(s.node, 4)) { err += "cp: cannot open '" + src + "' for reading: Permission denied\n"; return; }
      var target = intoDir ? join(destFound.path, baseName(s.path)) : destFound.path;
      if (target === s.path) { err += cmd + ": '" + src + "' and '" + dest + "' are the same file\n"; return; }
      if (target.indexOf(s.path + "/") === 0) { err += cmd + ": cannot " + (move ? "move" : "copy") + " '" + src + "' to a subdirectory of itself\n"; return; }
      var why = sh.writableParent(target) || (move ? sh.writableParent(s.path) : null);
      if (why) { err += cmd + ": cannot " + (move ? "move" : "create regular file") + " '" + dest + "': " + why + "\n"; return; }
      var existing = sh.fs[target];
      if (existing && existing.type === "dir" && s.node.type !== "dir") { err += cmd + ": cannot overwrite directory '" + target + "' with non-directory\n"; return; }
      var paths = Object.keys(sh.fs).filter(function (q) { return q === s.path || q.indexOf(s.path + "/") === 0; });
      if (existing) sh.removeTree(target);
      paths.forEach(function (q) {
        var from = sh.fs[q];
        var copy = move
          ? from
          : { type: from.type, mode: from.mode & ~UMASK, owner: sh.user, group: sh.group, contents: from.contents, mtime: new Date() };
        sh.fs[target + q.slice(s.path.length)] = copy;
      });
      if (move) paths.forEach(function (q) { delete sh.fs[q]; });
    });
    return { out: "", err: err, code: err ? 1 : 0 };
  };

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
      out[p] = { type: n.type, mode: n.mode, owner: n.owner, group: n.group, contents: n.type === "file" ? n.contents : "" };
    });
    return out;
  };

  // The same checks as app/terminal.py's passes(), so the console can say
  // "done" the moment it is. The server re-checks; this is only a preview.
  function passes(check, state, cwd, processes) {
    var named = function (name) { return (processes || []).filter(function (p) { return procName(p.command) === name; }); };
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
    if ("contains" in check) {
      var f = state[check.contains];
      return !!f && f.type === "file" && f.contents.indexOf(check.text) !== -1;
    }
    return false;
  }
  // The process table as plain data, the shape the server grades.
  Shell.prototype.processes = function () {
    return this.procs.map(function (p) {
      return { pid: p.pid, user: p.user, command: p.command, alive: !!p.alive, signals: p.signals.slice() };
    });
  };

  Shell.prototype.solved = function (checks) {
    var state = this.state();
    var cwd = this.cwd;
    var procs = this.processes();
    return checks.every(function (c) { return passes(c, state, cwd, procs); });
  };

  return { Shell: Shell, tokenize: tokenize, applyMode: applyMode, passes: passes };
});
