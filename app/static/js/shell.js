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
  function Shell(spec) {
    this.user = spec.user;
    this.group = spec.group;
    this.cwd = spec.cwd;
    this.home = spec.cwd;
    this.lastStatus = 0;
    this.fs = {};
    var self = this;
    Object.keys(spec.fs).forEach(function (path) {
      var n = spec.fs[path];
      self.fs[path] = { type: n.type, mode: n.mode, owner: n.owner, group: n.group, contents: n.contents || "", mtime: START_TIME };
    });
  }

  // bash's \w: ~ for a real home directory, otherwise the path. An exercise's
  // starting directory doubles as $HOME (so `cd` comes back to it), but it
  // isn't anyone's home, so the prompt shows where you are.
  Shell.prototype.prompt = function () {
    var realHome = this.home === "/home/" + this.user;
    var where = realHome && this.cwd === this.home ? "~" : this.cwd;
    return this.user + "@meridian:" + where + "$ ";
  };

  Shell.prototype.resolve = function (path) {
    if (path === "~" || path.indexOf("~/") === 0) path = this.home + path.slice(1);
    return normalize(path.charAt(0) === "/" ? path : this.cwd + "/" + path);
  };

  // The permission bits that apply to this user for `node` (rwx as 4/2/1).
  Shell.prototype.bits = function (node) {
    if (this.user === "root") return 7;
    if (node.owner === this.user) return (node.mode >> 6) & 7;
    if (node.group === this.group) return (node.mode >> 3) & 7;
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
    function end() { if (word) { tokens.push({ type: "word", text: word.text, quoted: word.quoted }); word = null; } }
    function variable(quoted) {
      // at line[i] === "$"
      var m = /^\$(\?|[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})/.exec(line.slice(i));
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
    var vars = { USER: this.user, LOGNAME: this.user, HOME: this.home, PWD: this.cwd, OLDPWD: this.oldpwd || "", SHELL: "/bin/bash", "?": this.lastStatus };
    var tokens = tokenize(text, vars);
    var pipeline = [];
    var cmd = { argv: [], redirects: [] };
    var self = this;
    function endCmd(next) {
      if (!cmd.argv.length && !cmd.redirects.length) throw new SyntaxError("syntax error near unexpected token `" + next + "'");
      pipeline.push(cmd);
      cmd = { argv: [], redirects: [] };
    }
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === "word") {
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
      if (c === ";" || two === "&&" || two === "||") {
        parts.push({ op: op, text: line.slice(start, i) });
        op = c === ";" ? ";" : two;
        i += op.length - 1;
        start = i + 1;
      }
    }
    parts.push({ op: op, text: line.slice(start, quote ? line.length : i) });
    return parts;
  }

  // run(line) → {output, clear}: everything the terminal should print.
  Shell.prototype.run = function (line) {
    var printed = [];
    var clear = false;
    var self = this;
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
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part.text.trim()) continue;
      if (part.op === "&&" && this.lastStatus !== 0) continue;
      if (part.op === "||" && this.lastStatus === 0) continue;
      var pipeline;
      try {
        pipeline = this.parse(part.text);
      } catch (e) {
        this.lastStatus = 2;
        printed.push("bash: " + e.message + "\n");
        continue;
      }
      var r = self.runPipeline(pipeline);
      printed.push(r.output);
      if (r.clear) { clear = true; printed = []; }
    }
    return { output: printed.join(""), clear: clear };
  };

  // Run a pipeline. Redirections are applied left to right, as in bash, so
  // `> f 2>&1` sends both streams to f while `2>&1 > f` leaves errors on the
  // terminal: 2>&1 copies wherever stdout points *at that moment*.
  Shell.prototype.runPipeline = function (pipeline) {
    var stdin = "";
    var shown = "";
    var status = 0;
    var clear = false;
    for (var i = 0; i < pipeline.length; i++) {
      var cmd = pipeline[i];
      var last = i === pipeline.length - 1;
      var fd1 = { to: last ? "tty" : "pipe" };
      var fd2 = { to: "tty" };
      var files = []; // [{path, append}] in the order they were opened
      var opened = {};
      var failed = null;
      var self = this;
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
      if (failed) { shown += failed + "\n"; status = 1; stdin = ""; continue; }
      var res = cmd.argv.length ? this.exec(cmd.argv, stdin, { tty: fd1.to === "tty" }) : { out: "", err: "", code: 0 };
      if (res.clear) clear = true;
      var piped = "";
      // A command's errors usually come out before its last output, so err first.
      [[fd2, res.err], [fd1, res.out]].forEach(function (pair) {
        var where = pair[0];
        if (where.to === "tty") shown += pair[1];
        else if (where.to === "pipe") piped += pair[1];
        else where.file.text += pair[1];
      });
      files.forEach(function (f) {
        var why = self.writeFile(f.path, f.text, f.append);
        if (why) { shown += "bash: " + why + "\n"; res.code = 1; }
      });
      stdin = piped;
      status = res.code;
    }
    this.lastStatus = status;
    return { output: shown, clear: clear };
  };

  Shell.prototype.exec = function (argv, stdin, io) {
    var name = argv[0];
    var fn = COMMANDS[name];
    if (!fn) {
      return {
        out: "",
        err: name + ": command not found. The Meridian's console only knows the basics; type `help` to see them.\n",
        code: 127,
      };
    }
    try {
      return fn.call(this, argv.slice(1), stdin, io);
    } catch (e) {
      return { out: "", err: name + ": " + e.message + "\n", code: 1 };
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
        "  pwd cd ls cat echo touch mkdir rmdir cp mv rm chmod chown whoami id\n" +
        "  grep wc sort uniq head tail cut tee clear help\n" +
        "Pipes (|), redirection (> >> < 2> 2>&1 &>), globs (* ? [...]), {a,b}, ; && || and $VARS work.\n" +
        "Tab completes paths; ↑ and ↓ walk your history; Ctrl-C abandons a line.\n"
      );
    },
    clear: function () { return { out: "", err: "", code: 0, clear: true }; },
    pwd: function () { return ok(this.cwd + "\n"); },
    whoami: function () { return ok(this.user + "\n"); },
    id: function () {
      var uid = this.user === "root" ? 0 : 1000;
      return ok("uid=" + uid + "(" + this.user + ") gid=" + uid + "(" + this.group + ") groups=" + uid + "(" + this.group + ")\n");
    },
    echo: function (args) {
      var newline = true;
      if (args[0] === "-n") { newline = false; args = args.slice(1); }
      return ok(args.join(" ") + (newline ? "\n" : ""));
    },
    cd: function (args) {
      if (args.length > 1) return { out: "", err: "bash: cd: too many arguments\n", code: 1 };
      var target = args.length ? args[0] : this.home;
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
  function passes(check, state, cwd) {
    if ("cwd" in check) return cwd === check.cwd;
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
  Shell.prototype.solved = function (checks) {
    var state = this.state();
    var cwd = this.cwd;
    return checks.every(function (c) { return passes(c, state, cwd); });
  };

  return { Shell: Shell, tokenize: tokenize, applyMode: applyMode, passes: passes };
});
