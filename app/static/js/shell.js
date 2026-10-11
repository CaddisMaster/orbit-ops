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
    this.pending = null; // a prompt waiting for an answer (sudo's password, read)
    this.more = null; // the lines so far of a command that isn't finished (the "> " prompt)
    this.screen = ""; // what this run has printed on the terminal
    var sh = this;
    this.tty = { write: function (s) { sh.screen += s; } };
    this.loopDepth = 0;
    this.logins = []; // shells stacked by `sudo -i`, popped by `exit`
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

  // --- reading a command line --------------------------------------------------------
  // Input is read into a tree before any of it runs (#64): words, pipelines,
  // lists and the compound commands (if, for, while, until, case, { }, [[ ]]).
  // A word keeps its quoting as a list of atoms and is expanded only when its
  // command runs, so `false; echo $?` sees the new status and a loop body's
  // "$i" is different each time round.
  //   {c: "ab", q: bool}   literal text (q: it was quoted, so no globbing or splitting)
  //   {x: {...}, q: bool}  an expansion: $name, ${…}, $(…) or `…`, $((…))
  // A quoted empty string is {c: "", q: true}, so "" still makes a word.
  function SyntaxErr(message, line) { this.message = message; this.line = line; }
  function Incomplete(message, line) { this.message = message; this.line = line; } // ran out of input: the prompt asks for more
  function ExpansionError(message) { this.message = message; }
  function Runaway() {}

  var OPS = ["&>>", "&&", "&>", "&", ";;", ";", "||", "|", ">>", ">&2", ">&1", ">", "<<<", "<<", "<", "(", ")"];
  var FD_OPS = ["2>&1", "1>&2", "2>>", "1>>", "2>", "1>"];
  var REDIRECTS = {
    "<": { fd: 0 }, ">": { fd: 1 }, "1>": { fd: 1 }, ">>": { fd: 1, append: true }, "1>>": { fd: 1, append: true },
    "2>": { fd: 2 }, "2>>": { fd: 2, append: true }, "&>": { fd: 3 }, "&>>": { fd: 3, append: true }, "<<<": {},
    "2>&1": { fd: 2, dup: 1 }, ">&2": { fd: 1, dup: 2 }, "1>&2": { fd: 1, dup: 2 }, ">&1": { fd: 1, dup: 1 }, "<<": {},
  };

  // `oneWord`: read all of src as a single word (the inside of $(( )) and ${x:-…}).
  function lex(src, oneWord) {
    var tokens = [];
    var i = 0, line = 1;
    var atoms = null, from = 0;
    function lit(text, q) {
      var last = atoms[atoms.length - 1];
      if (last && "c" in last && last.q === q && text) last.c += text;
      else atoms.push({ c: text, q: q });
    }
    function start() { if (!atoms) { atoms = []; from = i; } }
    function end() {
      if (!atoms) return;
      tokens.push({ t: "word", atoms: atoms, text: src.slice(from, i), line: line, p: from, e: i });
      atoms = null;
    }
    function advance(to) {
      for (var k = i; k < to; k++) if (src[k] === "\n") line++;
      i = to;
    }
    // The index of the ) closing the ( at `open`, skipping quotes.
    function closing(open, what) {
      var depth = 0;
      for (var k = open; k < src.length; k++) {
        var ch = src[k];
        if (ch === "\\") k++;
        else if (ch === "'") { k = src.indexOf("'", k + 1); if (k === -1) break; }
        else if (ch === '"') { k++; while (k < src.length && src[k] !== '"') { if (src[k] === "\\") k++; k++; } }
        else if (ch === "(") depth++;
        else if (ch === ")" && --depth === 0) return k;
      }
      throw new Incomplete("unexpected EOF while looking for matching `" + what + "'", line);
    }
    function dollar(q) {
      if (src[i] === "`") {
        var tick = src.indexOf("`", i + 1);
        if (tick === -1) throw new Incomplete("unexpected EOF while looking for matching ``'", line);
        atoms.push({ x: { t: "cmd", src: src.slice(i + 1, tick) }, q: q });
        return advance(tick + 1);
      }
      var next = src[i + 1];
      if (next === "(" && src[i + 2] === "(") {
        var inner = closing(i + 2, ")");
        if (src[inner + 1] === ")") {
          atoms.push({ x: { t: "arith", src: src.slice(i + 3, inner) }, q: q });
          return advance(inner + 2);
        }
      }
      if (next === "(") {
        var close = closing(i + 1, ")");
        atoms.push({ x: { t: "cmd", src: src.slice(i + 2, close) }, q: q });
        return advance(close + 1);
      }
      if (next === "{") {
        var brace = src.indexOf("}", i);
        if (brace === -1) throw new Incomplete("unexpected EOF while looking for matching `}'", line);
        atoms.push({ x: braceParam(src.slice(i + 2, brace)), q: q });
        return advance(brace + 1);
      }
      var m = /^\$([?#@*!$0-9]|[A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(i));
      if (!m) { lit("$", q); i++; return; }
      atoms.push({ x: { t: "var", name: m[1] }, q: q });
      i += m[0].length;
    }
    try {
      while (i < src.length) {
        var c = src[i];
        if (c === "\\" && src[i + 1] === "\n") { advance(i + 2); continue; }
        if (c === "\\") {
          if (i + 1 >= src.length) throw new Incomplete("unexpected end of file", line);
          start(); lit(src[i + 1], true); i += 2;
        } else if (c === "'") {
          var q1 = src.indexOf("'", i + 1);
          if (q1 === -1) throw new Incomplete("unexpected EOF while looking for matching `''", line);
          start(); atoms.push({ c: "", q: true }); lit(src.slice(i + 1, q1), true);
          advance(q1 + 1);
        } else if (c === '"') {
          start(); atoms.push({ c: "", q: true });
          i++;
          while (i < src.length && src[i] !== '"') {
            if (src[i] === "\\" && src[i + 1] === "\n") advance(i + 2);
            else if (src[i] === "\\" && i + 1 < src.length && '"\\$`'.indexOf(src[i + 1]) !== -1) { lit(src[i + 1], true); i += 2; }
            else if (src[i] === "$" || src[i] === "`") dollar(true);
            else { lit(src[i], true); advance(i + 1); }
          }
          if (i >= src.length) throw new Incomplete('unexpected EOF while looking for matching `"\'', line);
          i++;
        } else if (c === "$" || c === "`") {
          start(); dollar(false);
        } else if (oneWord) {
          start(); lit(c, false); advance(i + 1);
        } else if (c === " " || c === "\t") {
          end(); i++;
        } else if (c === "\n") {
          end(); tokens.push({ t: "nl", line: line }); advance(i + 1);
        } else if (c === "#" && !atoms) {
          while (i < src.length && src[i] !== "\n") i++;
        } else if (!atoms && (c === "1" || c === "2") && src[i + 1] === ">") {
          var fdOp = FD_OPS.filter(function (o) { return src.slice(i, i + o.length) === o; })[0];
          tokens.push({ t: "op", v: fdOp, line: line, p: i, e: i + fdOp.length }); i += fdOp.length;
        } else if ("|&;<>()".indexOf(c) !== -1) {
          end();
          var op = OPS.filter(function (o) { return src.slice(i, i + o.length) === o; })[0];
          tokens.push({ t: "op", v: op, line: line, p: i, e: i + op.length }); i += op.length;
        } else {
          start(); lit(c, false); i++;
        }
      }
    } catch (e) {
      // A script runs up to the line it can't read, so the error waits for
      // the parser to reach it instead of stopping everything now.
      if (!(e instanceof Incomplete)) throw e;
      atoms = null;
      tokens.push({ t: "eof", line: line, error: e });
      return tokens;
    }
    end();
    tokens.push({ t: "eof", line: line });
    return tokens;
  }

  function braceParam(inner) {
    var m = /^#([A-Za-z_][A-Za-z0-9_]*|[0-9@*#?])$/.exec(inner);
    if (m) return { t: "len", name: m[1] };
    m = /^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?#@*!$])(?:(:?[-=+?]|##?|%%?)([\s\S]*))?$/.exec(inner);
    if (m) return m[2] ? { t: "param", name: m[1], op: m[2], arg: m[3] } : { t: "var", name: m[1] };
    return { t: "bad", text: inner };
  }

  // The plain text of a word token, or null if any of it is quoted or expanded.
  // Only plain words can be keywords (`"if"` is a command named if).
  function plain(tok) {
    if (!tok || tok.t !== "word") return null;
    var s = "";
    for (var k = 0; k < tok.atoms.length; k++) {
      if (!("c" in tok.atoms[k]) || tok.atoms[k].q) return null;
      s += tok.atoms[k].c;
    }
    return s;
  }

  function Parser(src) { this.src = src; this.toks = lex(src); this.at = 0; }
  Parser.prototype.peek = function () { return this.toks[this.at]; };
  Parser.prototype.next = function () { return this.toks[this.at++]; };
  Parser.prototype.is = function (kw) { return plain(this.peek()) === kw; };
  Parser.prototype.isOp = function (v) { var t = this.peek(); return t.t === "op" && t.v === v; };
  Parser.prototype.linebreak = function () { while (this.peek().t === "nl") this.at++; };
  Parser.prototype.fail = function (tok) {
    if (tok.t === "eof") {
      if (tok.error) throw tok.error;
      throw new Incomplete("syntax error: unexpected end of file", tok.line);
    }
    var name = tok.t === "nl" ? "newline" : tok.t === "op" ? tok.v : tok.text;
    throw new SyntaxErr("syntax error near unexpected token `" + name + "'", tok.line);
  };
  Parser.prototype.expect = function (kw, items) {
    if (items && !items.length) this.fail(this.peek());
    if (!this.is(kw)) this.fail(this.peek());
    this.next();
  };

  // The whole input. With `partial`, a syntax error comes back with the
  // commands before it, as a script runs up to its first bad line.
  Parser.prototype.program = function (partial) {
    var items = [];
    try {
      for (;;) {
        this.linebreak();
        if (this.peek().t === "eof") {
          if (this.peek().error) throw this.peek().error;
          break;
        }
        // A line runs only once all of it has been read: `if …; fi fi` runs nothing.
        var line = this.list([], true);
        var t = this.peek();
        if (t.t !== "nl" && t.t !== "eof") this.fail(t);
        if (t.t === "eof" && t.error) throw t.error;
        if (line.length) line[0].op = items.length ? ";" : null;
        items = items.concat(line);
      }
    } catch (e) {
      if (!partial || !(e instanceof SyntaxErr || e instanceof Incomplete || e instanceof Unsupported)) throw e;
      return { items: items, error: e };
    }
    return { items: items, error: null };
  };

  // and-or lists joined by ; & or newlines, flat: each item says how it joins
  // the one before (null, ";", "&&" or "||"), as bash runs them left to right.
  // Stops before a word or operator in `stop`, or (`oneLine`) a newline.
  Parser.prototype.list = function (stop, oneLine) {
    var items = [];
    var op = null;
    if (!oneLine) this.linebreak();
    for (;;) {
      var t = this.peek();
      if (t.t === "eof" || stop.indexOf(t.t === "op" ? t.v : plain(t)) !== -1) break;
      var node = this.pipeline();
      items.push({ op: op, node: node, bg: false, text: this.src.slice(t.p, this.toks[this.at - 1].e) });
      t = this.peek();
      if (t.t === "op" && (t.v === "&&" || t.v === "||")) {
        this.next();
        op = t.v;
        this.linebreak();
        var n = this.peek();
        if (n.t === "eof" || stop.indexOf(n.t === "op" ? n.v : plain(n)) !== -1) this.fail(n);
      } else if (t.t === "op" && (t.v === ";" || t.v === "&")) {
        this.next();
        if (t.v === "&") items[items.length - 1].bg = true;
        op = ";";
        if (oneLine && this.peek().t === "nl") break;
        if (!oneLine) this.linebreak();
      } else if (t.t === "nl" && !oneLine) {
        this.linebreak();
        op = ";";
      } else break;
    }
    return items;
  };

  Parser.prototype.pipeline = function () {
    var negate = false;
    if (this.is("!")) { this.next(); negate = true; }
    var cmds = [this.command()];
    while (this.isOp("|")) {
      this.next();
      this.linebreak();
      if (this.peek().t === "eof") this.fail(this.peek());
      cmds.push(this.command());
    }
    return { t: "pipeline", cmds: cmds, negate: negate };
  };

  var CLOSERS = ["then", "elif", "else", "fi", "do", "done", "esac", "}", "in", "]]"];

  Parser.prototype.command = function () {
    var t = this.peek();
    var w = plain(t);
    var node = null;
    if (w === "if") node = this.ifCmd();
    else if (w === "for") node = this.forCmd();
    else if (w === "while" || w === "until") node = this.whileCmd(w);
    else if (w === "case") node = this.caseCmd();
    else if (w === "{") { this.next(); var body = this.list(["}"]); this.expect("}", body); node = { t: "group", body: body }; }
    else if (w === "[[") node = this.condCmd();
    else if (CLOSERS.indexOf(w) !== -1) this.fail(t);
    else if (t.t === "op" && t.v === "(") {
      this.next();
      if (this.isOp("(")) throw new Unsupported("(( )) arithmetic commands; use [ \"$i\" -lt 5 ] to compare, and i=$((i + 1)) to count");
      var inner = this.list([")"]);
      if (!inner.length || !this.isOp(")")) this.fail(this.peek());
      this.next();
      node = { t: "subshell", body: inner };
    }
    if (!node) return this.simple();
    node.redirects = this.redirects();
    return node;
  };

  Parser.prototype.redirects = function () {
    var out = [];
    while (this.peek().t === "op" && REDIRECTS[this.peek().v]) out.push(this.redirect());
    return out;
  };

  Parser.prototype.redirect = function () {
    var op = this.next().v;
    if (op === "<<") throw new Unsupported("here-documents (<<)");
    if (op === "<<<") throw new Unsupported("here-strings (<<<); use echo \"…\" | command");
    var spec = REDIRECTS[op];
    if (spec.dup) return { fd: spec.fd, dup: spec.dup };
    var target = this.peek();
    if (target.t !== "word") {
      if (target.t === "eof" && target.error) throw target.error;
      throw new SyntaxErr("syntax error near unexpected token `" + (target.t === "op" ? target.v : "newline") + "'", target.line);
    }
    this.next();
    return { fd: spec.fd, append: !!spec.append, word: target.atoms };
  };

  Parser.prototype.simple = function () {
    var cmd = { t: "simple", assigns: [], words: [], redirects: [] };
    for (;;) {
      var t = this.peek();
      if (t.t === "word") {
        var m = !cmd.words.length && t.atoms[0] && "c" in t.atoms[0] && !t.atoms[0].q && /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(t.atoms[0].c);
        if (m) {
          var value = [{ c: t.atoms[0].c.slice(m[0].length), q: false }].concat(t.atoms.slice(1));
          cmd.assigns.push({ name: m[1], value: value });
        } else {
          if (!cmd.words.length && this.toks[this.at + 1].t === "op" && this.toks[this.at + 1].v === "(") {
            throw new Unsupported("functions (name() { … })");
          }
          cmd.words.push(t.atoms);
        }
        this.next();
      } else if (t.t === "op" && REDIRECTS[t.v]) {
        cmd.redirects.push(this.redirect());
      } else break;
    }
    if (!cmd.words.length && !cmd.assigns.length && !cmd.redirects.length) this.fail(this.peek());
    return cmd;
  };

  Parser.prototype.ifCmd = function () {
    this.next();
    var clauses = [];
    var otherwise = null;
    do {
      var cond = this.list(["then"]);
      this.expect("then", cond);
      var body = this.list(["elif", "else", "fi"]);
      if (!body.length) this.fail(this.peek());
      clauses.push({ cond: cond, body: body });
    } while (this.is("elif") && this.next());
    if (this.is("else")) {
      this.next();
      otherwise = this.list(["fi"]);
      if (!otherwise.length) this.fail(this.peek());
    }
    this.expect("fi");
    return { t: "if", clauses: clauses, otherwise: otherwise };
  };

  Parser.prototype.forCmd = function () {
    this.next();
    if (this.isOp("(")) throw new Unsupported("for (( … )) loops; use for i in {1..5}");
    var nameTok = this.next();
    var name = plain(nameTok);
    if (nameTok.t !== "word") this.fail(nameTok);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name || "")) throw new SyntaxErr("`" + nameTok.text + "': not a valid identifier", nameTok.line);
    var words = null;
    this.linebreak();
    if (this.is("in")) {
      this.next();
      words = [];
      while (this.peek().t === "word") words.push(this.next().atoms);
      if (this.isOp(";") || this.peek().t === "nl") this.next();
      else this.fail(this.peek());
    } else if (this.isOp(";")) this.next();
    this.linebreak();
    this.expect("do");
    var body = this.list(["done"]);
    this.expect("done", body);
    return { t: "for", name: name, words: words, body: body };
  };

  Parser.prototype.whileCmd = function (kind) {
    this.next();
    var cond = this.list(["do"]);
    this.expect("do", cond);
    var body = this.list(["done"]);
    this.expect("done", body);
    return { t: "while", until: kind === "until", cond: cond, body: body };
  };

  Parser.prototype.caseCmd = function () {
    this.next();
    var subject = this.next();
    if (subject.t !== "word") this.fail(subject);
    this.linebreak();
    this.expect("in");
    var clauses = [];
    for (;;) {
      this.linebreak();
      if (this.is("esac")) { this.next(); break; }
      if (this.isOp("(")) this.next();
      var patterns = [];
      for (;;) {
        var p = this.next();
        if (p.t !== "word") this.fail(p);
        patterns.push(p.atoms);
        if (this.isOp("|")) { this.next(); continue; }
        if (this.isOp(")")) { this.next(); break; }
        this.fail(this.peek());
      }
      var body = this.list([";;", "esac"]);
      clauses.push({ patterns: patterns, body: body });
      if (this.isOp(";;")) { this.next(); continue; }
      this.expect("esac");
      break;
    }
    return { t: "case", subject: subject.atoms, clauses: clauses };
  };

  // [[ … ]]: && || ! ( ) here are part of the test, not the command line.
  var UNARY = ["-e", "-f", "-d", "-r", "-w", "-x", "-s", "-z", "-n", "-L", "-h"];
  var BINARY = ["=", "==", "!=", "<", ">", "-eq", "-ne", "-lt", "-le", "-gt", "-ge", "-nt", "-ot", "=~"];

  Parser.prototype.condCmd = function () {
    this.next();
    var expr = this.condOr();
    if (!this.is("]]")) this.fail(this.peek());
    this.next();
    return { t: "cond", expr: expr };
  };
  Parser.prototype.condOr = function () {
    var l = this.condAnd();
    while (this.isOp("||")) { this.next(); l = { t: "or", l: l, r: this.condAnd() }; }
    return l;
  };
  Parser.prototype.condAnd = function () {
    var l = this.condNot();
    while (this.isOp("&&")) { this.next(); l = { t: "and", l: l, r: this.condNot() }; }
    return l;
  };
  Parser.prototype.condNot = function () {
    if (this.is("!")) { this.next(); return { t: "not", e: this.condNot() }; }
    if (this.isOp("(")) {
      this.next();
      var e = this.condOr();
      if (!this.isOp(")")) this.fail(this.peek());
      this.next();
      return e;
    }
    var t = this.peek();
    if (t.t !== "word" || plain(t) === "]]") this.fail(t);
    var after = this.toks[this.at + 1];
    if (UNARY.indexOf(plain(t)) !== -1 && after.t === "word" && plain(after) !== "]]") {
      this.next();
      return { t: "unary", op: plain(t), arg: this.next().atoms };
    }
    this.next();
    var o = this.peek();
    var op = o.t === "op" && (o.v === "<" || o.v === ">") ? o.v : plain(o);
    if (BINARY.indexOf(op) === -1) return { t: "str", w: t.atoms };
    this.next();
    if (op === "=~") throw new Unsupported("[[ =~ ]] regular expressions; use == with a glob pattern");
    var r = this.next();
    if (r.t !== "word") this.fail(r);
    return { t: "binary", op: op, l: t.atoms, r: r.atoms };
  };

  function parse(src) { return new Parser(src).program(false).items; }
  function parseScript(src) { return new Parser(src).program(true); }

  // --- expanding words -------------------------------------------------------------
  function globRegex(part, quoted, offset, anyChar) {
    var re = "";
    for (var i = 0; i < part.length; i++) {
      var c = part[i];
      var q = quoted[offset + i];
      if (!q && c === "*") re += anyChar ? "[\\s\\S]*" : "[^/]*";
      else if (!q && c === "?") re += anyChar ? "[\\s\\S]" : "[^/]";
      else if (!q && c === "[") {
        var close = part.indexOf("]", i + 2);
        if (close === -1) { re += "\\["; continue; }
        var body = part.slice(i + 1, close).replace(/^!/, "^").replace(/\\/g, "\\\\");
        re += "[" + body + "]";
        i = close;
      } else re += c.replace(/[.+^${}()|[\]\\*?]/g, "\\$&");
    }
    return new RegExp("^" + re + "$");
  }

  function hasGlob(word) {
    for (var i = 0; i < word.text.length; i++) {
      if (!word.quoted[i] && "*?[".indexOf(word.text[i]) !== -1) return true;
    }
    return false;
  }

  // Brace expansion, first of all, as in bash: a{b,c}d → abd acd, and {1..3}
  // → 1 2 3. Only unquoted braces with a comma or a range count. Works on
  // atoms, one literal character at a time, so {$a,$b} expands too.
  function braces(atoms) {
    var flat = [];
    atoms.forEach(function (a) {
      if ("c" in a && a.c.length > 1) a.c.split("").forEach(function (ch) { flat.push({ c: ch, q: a.q }); });
      else flat.push(a);
    });
    var ch = function (a) { return "c" in a && !a.q ? a.c : null; };
    var depth = 0, open = -1;
    for (var i = 0; i < flat.length; i++) {
      var c = ch(flat[i]);
      if (c === "{") { if (depth++ === 0) open = i; }
      else if (c === "}" && depth > 0 && --depth === 0) {
        var inner = flat.slice(open + 1, i);
        var options = null;
        var text = inner.map(function (a) { return ch(a) === null ? "\0" : ch(a); }).join("");
        var range = /^(-?\d+)\.\.(-?\d+)$/.exec(text);
        if (range) {
          var a = parseInt(range[1], 10), b = parseInt(range[2], 10), step = a <= b ? 1 : -1;
          options = [];
          for (var n = a; step > 0 ? n <= b : n >= b; n += step) options.push([{ c: String(n), q: true }]);
        } else {
          var parts = [];
          var d = 0, from = 0;
          for (var k = 0; k <= inner.length; k++) {
            var ck = k < inner.length ? ch(inner[k]) : null;
            if (ck === "{") d++;
            else if (ck === "}") d--;
            else if (k === inner.length || (d === 0 && ck === ",")) { parts.push(inner.slice(from, k)); from = k + 1; }
          }
          if (parts.length > 1) options = parts;
        }
        if (!options) continue;
        var pre = flat.slice(0, open), post = flat.slice(i + 1);
        var out = [];
        options.forEach(function (o) { braces(pre.concat(o, post)).forEach(function (w) { out.push(w); }); });
        return out;
      }
    }
    return [flat];
  }

  // A parameter's value: a string, undefined when unset, or for $@ and $* the
  // list of arguments.
  Shell.prototype.param = function (name) {
    var args = this.args || [];
    if (name === "@" || name === "*") return args.slice();
    if (name === "0") return this.scriptName || "-bash";
    if (/^\d+$/.test(name)) return args[+name - 1];
    if (name === "?") return String(this.lastStatus);
    if (name === "#") return String(args.length);
    if (name === "!") return this.lastBg;
    if (name === "$") return String(SHELL_PID);
    return this.vars[name];
  };

  // One expansion's value: a string, or a list for $@ / $*.
  Shell.prototype.expansion = function* (x, io) {
    var value;
    if (x.t === "var") {
      value = this.param(x.name);
      return value === undefined ? "" : value;
    }
    if (x.t === "len") {
      value = this.param(x.name);
      return String(Array.isArray(value) ? value.length : (value || "").length);
    }
    if (x.t === "cmd") return yield* this.substitute(x.src, io);
    if (x.t === "arith") return String(arith(yield* this.expandText(x.src, io), this));
    if (x.t === "bad") throw new ExpansionError("${" + x.text + "}: bad substitution");
    value = this.param(x.name);
    if (Array.isArray(value)) value = value.join(" ");
    var unset = value === undefined, empty = unset || value === "";
    var colon = x.op.charAt(0) === ":";
    var missing = colon ? empty : unset;
    switch (x.op.replace(":", "")) {
      case "-": return missing ? yield* this.expandText(x.arg, io) : value;
      case "=":
        if (!missing) return value;
        if (!/^[A-Za-z_]/.test(x.name)) throw new ExpansionError("$" + x.name + ": cannot assign in this way");
        value = yield* this.expandText(x.arg, io);
        this.setVar(x.name, value);
        return value;
      case "+": return missing ? "" : yield* this.expandText(x.arg, io);
      case "?":
        if (!missing) return value;
        throw new ExpansionError(x.name + ": " + ((yield* this.expandText(x.arg, io)) || "parameter null or not set"));
    }
    // ${x#pattern} ${x##pattern} ${x%pattern} ${x%%pattern}: trim a match.
    var tok = lex(x.arg, true)[0];
    var pat = yield* this.expandPattern(tok.t === "word" ? tok.atoms : [], io);
    var re = globRegex(pat.text, pat.quoted, 0, true);
    var s = value || "";
    var longest = x.op.length === 2;
    if (x.op[0] === "#") {
      for (var a = longest ? s.length : 0; longest ? a >= 0 : a <= s.length; a += longest ? -1 : 1) {
        if (re.test(s.slice(0, a))) return s.slice(a);
      }
    } else {
      for (var b = longest ? 0 : s.length; longest ? b <= s.length : b >= 0; b += longest ? 1 : -1) {
        if (re.test(s.slice(b))) return s.slice(0, b);
      }
    }
    return s;
  };

  // A word → fields: braces, then ~, $… expansions, splitting of unquoted
  // results on $IFS, then globs. "$@" makes one field per argument.
  Shell.prototype.expandFields = function* (atoms, io) {
    var out = [];
    var groups = braces(atoms);
    for (var g = 0; g < groups.length; g++) {
      var fields = yield* this.fieldsOf(this.tilde(groups[g]), io);
      for (var f = 0; f < fields.length; f++) Array.prototype.push.apply(out, this.glob(fields[f]));
    }
    return out;
  };

  Shell.prototype.tilde = function (atoms) {
    var first = atoms[0];
    if (first && "c" in first && !first.q && (first.c === "~" || first.c.indexOf("~/") === 0)) {
      return [{ c: this.home, q: true }, { c: first.c.slice(1), q: false }].concat(atoms.slice(1));
    }
    return atoms;
  };

  Shell.prototype.fieldsOf = function* (atoms, io) {
    var fields = [];
    var cur = null;
    var ifs = this.vars.IFS === undefined ? " \t\n" : this.vars.IFS;
    function add(text, q) {
      if (!cur) cur = { text: "", quoted: [], real: false };
      if (q) cur.real = true;
      cur.text += text;
      for (var k = 0; k < text.length; k++) cur.quoted.push(q);
    }
    function cut(force) {
      if (cur && (cur.real || cur.text)) fields.push(cur);
      else if (force) fields.push({ text: "", quoted: [], real: true });
      cur = null;
    }
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i];
      if ("c" in a) { add(a.c, a.q); continue; }
      var value = yield* this.expansion(a.x, io);
      if (Array.isArray(value)) {
        if (a.q && a.x.name === "@") {
          for (var k = 0; k < value.length; k++) { if (k) cut(); add(value[k], true); }
          continue;
        }
        value = value.join(a.q ? (ifs.charAt(0) || "") : " ");
      }
      if (a.q) { add(value, true); continue; }
      // Unquoted: split on $IFS. Its whitespace separates; anything else in
      // it is a delimiter of its own (so a,,b has an empty field).
      for (var j = 0; j < value.length; j++) {
        var c = value[j];
        if (ifs.indexOf(c) === -1) add(c, false);
        else if (" \t\n".indexOf(c) !== -1) cut();
        else cut(true);
      }
    }
    cut();
    return fields;
  };

  // A word as one string: no splitting, no globs (assignments, case words,
  // redirect targets, [[ ]] operands).
  Shell.prototype.expandString = function* (atoms, io) {
    return (yield* this.expandPattern(this.tilde(atoms), io)).text;
  };

  // A word as a pattern: {text, quoted}, where quoted characters match only
  // themselves. Used for case, [[ == ]] and ${x#…}.
  Shell.prototype.expandPattern = function* (atoms, io) {
    var text = "", quoted = [];
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i];
      var value = "c" in a ? a.c : yield* this.expansion(a.x, io);
      if (Array.isArray(value)) value = value.join(" ");
      text += value;
      for (var k = 0; k < value.length; k++) quoted.push(a.q);
    }
    return { text: text, quoted: quoted };
  };

  // The inside of $(( )) or ${x:-…}: expansions done, quotes removed.
  Shell.prototype.expandText = function* (src, io) {
    var tok = lex(src, true)[0];
    if (tok.t === "eof" && tok.error) throw new ExpansionError(tok.error.message);
    return tok.t === "word" ? yield* this.expandString(tok.atoms, io) : "";
  };

  Shell.prototype.glob = function (word) {
    var text = word.text;
    if (!hasGlob(word)) return [text];
    var absolute = text.charAt(0) === "/";
    var parts = text.split("/");
    var offsets = [];
    var at = 0;
    parts.forEach(function (p) { offsets.push(at); at += p.length + 1; });
    var self = this;
    var results = [{ shown: absolute ? "" : null, abs: absolute ? "/" : this.cwd }];
    parts.forEach(function (part, idx) {
      if (part === "") return;
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

  // $(…): a subshell's output, less trailing newlines.
  Shell.prototype.substitute = function* (src, io) {
    var prog = parseScript(src);
    if (prog.error) throw new ExpansionError("command substitution: " + prog.error.message);
    var buf = new Sink();
    yield* this.subshell(prog.items, { stdin: io.stdin, out: buf, err: io.err });
    this.substituted = true;
    return buf.text.replace(/\n+$/, "");
  };

  // ( … ) and $(…) run in a subshell: a copy of everything (not only what's
  // exported), and nothing it changes (variables, cd, exit) comes back.
  Shell.prototype.subshell = function* (items, io) {
    var saved = this.saveState();
    this.vars = Object.assign({}, this.vars);
    this.exported = Object.assign({}, this.exported);
    this.depth = (this.depth || 0) + 1;
    this.loopDepth = 0;
    var code;
    try {
      yield* this.runList(items, io);
      code = this.exiting ? this.exitCode : this.lastStatus;
    } finally {
      this.restoreState(saved);
      this.depth -= 1;
    }
    this.lastStatus = code;
    return code;
  };

  // Integer arithmetic for $(( )) and [[ -lt ]]: + - * / % ** and C's
  // comparisons, logic, bit operators and ?:. Names are variables (unset is 0).
  function arith(src, sh) {
    var toks = [], pos = [];
    var expr = src.replace(/^\s+/, "");
    var re = /\s*(0[xX][0-9a-fA-F]+|\d+|[A-Za-z_][A-Za-z0-9_]*|\*\*|<<|>>|<=|>=|==|!=|&&|\|\||\+\+|--|[-+*\/%()<>!~&|^?:=,])/y;
    var at = 0;
    while (at < src.length) {
      if (/^\s*$/.test(src.slice(at))) break;
      re.lastIndex = at;
      var m = re.exec(src);
      if (!m) throw new ExpansionError(expr + ": syntax error: invalid arithmetic operator (error token is \"" + src.slice(at).replace(/^\s+/, "") + "\")");
      toks.push(m[1]);
      pos.push(re.lastIndex - m[1].length);
      at = re.lastIndex;
    }
    var i = 0;
    function fail(what) {
      throw new ExpansionError(expr + ": syntax error: " + what + " (error token is \"" + (i < toks.length ? src.slice(pos[i]) : expr) + "\")");
    }
    function value(name, depth) {
      var v = sh.param(name);
      if (v === undefined || v === "") return 0;
      v = String(v).trim();
      if (/^-?\d+$/.test(v)) return parseInt(v, 10);
      if (depth < 10 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) return value(v, depth + 1);
      return arith(v, sh);
    }
    function primary() {
      var t = toks[i++];
      if (t === undefined) { i = toks.length - 1; fail("operand expected"); }
      if (t === "(") { var v = ternary(); if (toks[i++] !== ")") fail("missing `)'"); return v; }
      if (t === "-") return -primary();
      if (t === "+") return +primary();
      if (t === "!") return primary() ? 0 : 1;
      if (t === "~") return ~primary();
      if (t === "++" || t === "--") throw new Unsupported("++ and -- inside $(( )); write i=$((i + 1))");
      if (/^0[xX]/.test(t)) return parseInt(t, 16);
      if (/^0\d/.test(t)) { // a leading 0 means octal, as in C
        if (/[89]/.test(t)) throw new ExpansionError(t + ": value too great for base (error token is \"" + t + "\")");
        return parseInt(t, 8);
      }
      if (/^\d/.test(t)) return parseInt(t, 10);
      if (/^[A-Za-z_]/.test(t)) {
        if (toks[i] === "++" || toks[i] === "--") throw new Unsupported("++ and -- inside $(( )); write i=$((i + 1))");
        if (toks[i] === "=" || (toks[i] && /^[-+*\/%]$/.test(toks[i]) && toks[i + 1] === "=")) {
          throw new Unsupported("assignment inside $(( )); write i=$((i + 1))");
        }
        return value(t, 0);
      }
      i--;
      fail("operand expected");
    }
    function power() {
      var b = primary();
      if (toks[i] === "**") { i++; var e = power(); if (e < 0) fail("exponent less than 0"); return Math.trunc(Math.pow(b, e)); }
      return b;
    }
    var LEVELS = [["||"], ["&&"], ["|"], ["^"], ["&"], ["==", "!="], ["<", "<=", ">", ">="], ["<<", ">>"], ["+", "-"], ["*", "/", "%"]];
    function level(n) {
      if (n === LEVELS.length) return power();
      var l = level(n + 1);
      while (LEVELS[n].indexOf(toks[i]) !== -1) {
        var op = toks[i++];
        var r = level(n + 1);
        switch (op) {
          case "||": l = l || r ? 1 : 0; break;
          case "&&": l = l && r ? 1 : 0; break;
          case "|": l = l | r; break;
          case "^": l = l ^ r; break;
          case "&": l = l & r; break;
          case "==": l = l === r ? 1 : 0; break;
          case "!=": l = l !== r ? 1 : 0; break;
          case "<": l = l < r ? 1 : 0; break;
          case "<=": l = l <= r ? 1 : 0; break;
          case ">": l = l > r ? 1 : 0; break;
          case ">=": l = l >= r ? 1 : 0; break;
          case "<<": l = l << r; break;
          case ">>": l = l >> r; break;
          case "+": l = l + r; break;
          case "-": l = l - r; break;
          case "*": l = l * r; break;
          case "/": case "%":
            if (r === 0) throw new ExpansionError(expr + ": division by 0 (error token is \"" + src.slice(pos[i - 1]) + "\")");
            l = op === "/" ? Math.trunc(l / r) : l % r;
            break;
        }
      }
      return l;
    }
    function ternary() {
      var c = level(0);
      if (toks[i] !== "?") return c;
      i++;
      var a = ternary();
      if (toks[i++] !== ":") fail("`:' expected for conditional expression");
      var b = ternary();
      return c ? a : b;
    }
    if (!toks.length) return 0;
    var result = ternary();
    if (i < toks.length) {
      if (toks[i] === "=") throw new Unsupported("assignment inside $(( )); write i=$((i + 1))");
      fail("syntax error in expression");
    }
    return result;
  }

  // --- tests: test, [ ], [[ ]] --------------------------------------------------------
  function TestError(message) { this.message = message; }

  Shell.prototype.unaryTest = function (op, arg) {
    if (op === "-z") return arg === "";
    if (op === "-n") return arg !== "";
    if (op === "-L" || op === "-h") return false; // no symbolic links on the console yet
    var found = arg === "" ? { error: true } : this.lookup(arg);
    if (found.error) return false;
    var n = found.node;
    switch (op) {
      case "-e": return true;
      case "-f": return n.type === "file";
      case "-d": return n.type === "dir";
      case "-r": return this.can(n, 4);
      case "-w": return this.can(n, 2);
      case "-x": return this.can(n, 1);
      case "-s": return size(n) > 0;
    }
    return false;
  };

  // `num` turns an operand into an integer for -eq and the rest.
  Shell.prototype.binaryTest = function (op, l, r, num) {
    switch (op) {
      case "=": case "==": return l === r;
      case "!=": return l !== r;
      case "<": return l < r;
      case ">": return l > r;
      case "-nt": case "-ot": {
        var a = this.lookup(l), b = this.lookup(r);
        if (op === "-ot") { var t = a; a = b; b = t; }
        return !!a.node && (!b.node || a.node.mtime > b.node.mtime);
      }
    }
    var x = num(l), y = num(r);
    switch (op) {
      case "-eq": return x === y;
      case "-ne": return x !== y;
      case "-lt": return x < y;
      case "-le": return x <= y;
      case "-gt": return x > y;
      case "-ge": return x >= y;
    }
    return false;
  };

  // test / [: the arguments are already expanded. Throws TestError.
  Shell.prototype.testArgs = function (args) {
    var sh = this;
    var i = 0;
    function integer(s) {
      if (!/^\s*[-+]?\d+\s*$/.test(s)) throw new TestError(s + ": integer expression expected");
      return parseInt(s, 10);
    }
    function or() {
      var v = and();
      while (args[i] === "-o") { i++; var r = and(); v = v || r; }
      return v;
    }
    function and() {
      var v = not();
      while (args[i] === "-a") { i++; var r = not(); v = v && r; }
      return v;
    }
    function not() {
      if (args[i] === "!" && i + 1 < args.length && BINARY.indexOf(args[i + 1]) === -1) { i++; return !not(); }
      return primary();
    }
    function primary() {
      if (i >= args.length) throw new TestError("argument expected");
      var a = args[i];
      if (i + 2 < args.length && BINARY.indexOf(args[i + 1]) !== -1 && args[i + 1] !== "=~") {
        var op = args[i + 1], r = args[i + 2];
        i += 3;
        return sh.binaryTest(op, a, r, integer);
      }
      if (a === "(" && i + 1 < args.length) {
        i++;
        var v = or();
        if (args[i] !== ")") throw new TestError("`)' expected");
        i++;
        return v;
      }
      if (UNARY.indexOf(a) !== -1 && i + 1 < args.length) { i += 2; return sh.unaryTest(a, args[i - 1]); }
      i++;
      return a !== "";
    }
    // Up to four arguments are read by count, as POSIX says and bash does:
    // that's what makes [ $empty = x ] say "unary operator expected".
    var n = args.length;
    var one = function (a) { return a !== ""; };
    var two = function (a, b) {
      if (a === "!") return !one(b);
      if (UNARY.indexOf(a) !== -1) return sh.unaryTest(a, b);
      throw new TestError(a + ": unary operator expected");
    };
    var three = function (a, op, b) {
      if (BINARY.indexOf(op) !== -1 && op !== "=~") return sh.binaryTest(op, a, b, integer);
      if (op === "-a") return one(a) && one(b);
      if (op === "-o") return one(a) || one(b);
      if (a === "!") return !two(op, b);
      if (a === "(" && b === ")") return one(op);
      throw new TestError(op + ": binary operator expected");
    };
    if (n === 0) return false;
    if (n === 1) return one(args[0]);
    if (n === 2) return two(args[0], args[1]);
    if (n === 3) return three(args[0], args[1], args[2]);
    if (n === 4 && args[0] === "!") return !three(args[1], args[2], args[3]);
    if (n === 4 && args[0] === "(" && args[3] === ")") return two(args[1], args[2]);
    var result = or();
    if (i < args.length) throw new TestError("too many arguments");
    return result;
  };

  Shell.prototype.cond = function* (e, io) {
    var sh = this;
    switch (e.t) {
      case "and": return (yield* this.cond(e.l, io)) && (yield* this.cond(e.r, io));
      case "or": return (yield* this.cond(e.l, io)) || (yield* this.cond(e.r, io));
      case "not": return !(yield* this.cond(e.e, io));
      case "str": return (yield* this.expandString(e.w, io)) !== "";
      case "unary": return this.unaryTest(e.op, yield* this.expandString(e.arg, io));
    }
    var l = yield* this.expandString(e.l, io);
    if (e.op === "==" || e.op === "=" || e.op === "!=") {
      // The right of == is a pattern unless quoted: [[ $f == *.log ]].
      var p = yield* this.expandPattern(this.tilde(e.r), io);
      return globRegex(p.text, p.quoted, 0, true).test(l) !== (e.op === "!=");
    }
    var r = yield* this.expandString(e.r, io);
    return this.binaryTest(e.op, l, r, function (s) { return arith(s, sh); });
  };

  // --- running -------------------------------------------------------------------
  // Output goes to sinks: the terminal, a pipe, a file, or $(…)'s capture.
  // Commands still return {out, err, code}; scripts and compound commands
  // write as they go, so a prompt in the middle of a script follows what it
  // has already printed.
  function Sink() { this.text = ""; }
  Sink.prototype.write = function (s) { this.text += s; };

  var STEP_LIMIT = 10000;

  // run(line) → {output, clear, pending?}: everything the terminal should
  // print. An unfinished command (an open if, a trailing |) waits for more
  // lines at the "> " prompt, as in bash. While a prompt is pending (sudo's
  // password, read), the line is its answer instead.
  Shell.prototype.run = function (line) {
    if (this.pending) return this.answer(line);
    var src = this.more === null ? line : this.more + "\n" + line;
    var items;
    try {
      // Bash reads the whole command before running any of it, so a syntax
      // error anywhere in it means nothing runs.
      items = parse(src);
    } catch (e) {
      if (e instanceof Incomplete) {
        this.more = src;
        return { output: "", clear: false };
      }
      this.more = null;
      this.clock += 1;
      this.reap();
      this.lastStatus = 2;
      if (e instanceof SyntaxErr) return { output: "bash: " + e.message + "\n", clear: false };
      if (e instanceof Unsupported) return { output: "bash: unsupported on the station console: " + e.message + "\n", clear: false };
      throw e;
    }
    this.more = null;
    this.clock += 1;
    this.reap();
    this.screen = "";
    this.cleared = false;
    this.steps = 0;
    this.exiting = false;
    this.breaking = this.continuing = 0;
    var keyboard = { text: "", pos: 0, tty: true };
    return this.drive(this.runList(items, { stdin: keyboard, out: this.tty, err: this.tty }));
  };

  // Run until the command finishes or asks for a line of input.
  Shell.prototype.drive = function (gen, answer) {
    var step;
    try {
      step = gen.next(answer);
    } catch (e) {
      if (!(e instanceof Runaway)) throw e;
      this.screen += "bash: stopped after " + STEP_LIMIT.toLocaleString("en-US") + " commands: is a loop running forever?\n";
      this.lastStatus = 130;
      step = { done: true };
    }
    if (!step.done) {
      this.pending = { prompt: step.value.prompt, secret: !!step.value.secret, gen: gen };
      return { output: this.screen, clear: this.cleared, pending: true };
    }
    this.reap();
    this.screen += this.flushNotices();
    return { output: this.screen, clear: this.cleared };
  };

  // The answer to a pending prompt. The console masks a secret one and never
  // echoes or stores it.
  Shell.prototype.answer = function (line) {
    var p = this.pending;
    this.pending = null;
    this.screen = "";
    this.cleared = false;
    return this.drive(p.gen, line);
  };

  // Ctrl-C abandons a prompt, or the lines of an unfinished command.
  Shell.prototype.cancel = function () {
    if (this.more !== null) { this.more = null; this.lastStatus = 130; return true; }
    if (!this.pending) return false;
    var gen = this.pending.gen;
    this.pending = null;
    gen.return(); // unwinds: a script's variables, sudo's user, all restored
    this.lastStatus = 1;
    return true;
  };

  Shell.prototype.runList = function* (items, io) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.op === "&&" && this.lastStatus !== 0) continue;
      if (item.op === "||" && this.lastStatus === 0) continue;
      if (item.bg) yield* this.background(item, io);
      else yield* this.runPipeline(item.node, io);
      if (this.exiting || this.breaking || this.continuing) break;
    }
    return this.lastStatus;
  };

  Shell.prototype.runPipeline = function* (node, io) {
    var stdin = io.stdin;
    var status = 0;
    for (var k = 0; k < node.cmds.length; k++) {
      var last = k === node.cmds.length - 1;
      var out = last ? io.out : new Sink();
      status = yield* this.runCommand(node.cmds[k], { stdin: stdin, out: out, err: io.err });
      if (!last) stdin = { text: out.text, pos: 0 };
      if (this.exiting) break;
    }
    if (node.negate) status = status === 0 ? 1 : 0;
    this.lastStatus = status;
    return status;
  };

  // Redirections are applied left to right, as in bash, so `> f 2>&1` sends
  // both streams to f while `2>&1 > f` leaves errors on the terminal: 2>&1
  // copies wherever stdout points *at that moment*. Files are written when the
  // command finishes.
  Shell.prototype.runCommand = function* (node, io) {
    var cur = { stdin: io.stdin, out: io.out, err: io.err };
    var files = [];
    var opened = {};
    for (var i = 0; i < node.redirects.length; i++) {
      var r = node.redirects[i];
      if (r.dup) {
        if (r.fd === 2) cur.err = r.dup === 1 ? cur.out : cur.err;
        else cur.out = r.dup === 2 ? cur.err : cur.out;
        continue;
      }
      var path;
      try {
        path = yield* this.expandString(r.word, io);
      } catch (e) {
        if (!(e instanceof ExpansionError)) throw e;
        io.err.write("bash: " + e.message + "\n");
        return (this.lastStatus = 1);
      }
      if (r.fd === 0) {
        var read = path === "/dev/null" ? { text: "" } : this.readFile("bash", path);
        if (read.error) { io.err.write(read.error + "\n"); return (this.lastStatus = 1); }
        cur.stdin = { text: read.text, pos: 0 };
        continue;
      }
      if (!opened[path]) { opened[path] = { path: path, append: r.append, sink: new Sink() }; files.push(opened[path]); }
      if (r.fd === 1 || r.fd === 3) cur.out = opened[path].sink;
      if (r.fd === 2 || r.fd === 3) cur.err = opened[path].sink;
    }
    var code;
    switch (node.t) {
      case "simple": code = yield* this.runSimple(node, cur); break;
      case "group": code = yield* this.runList(node.body, cur); break;
      case "subshell": code = yield* this.subshell(node.body, cur); break;
      case "if": code = yield* this.runIf(node, cur); break;
      case "while": code = yield* this.runWhile(node, cur); break;
      case "for": code = yield* this.runFor(node, cur); break;
      case "case": code = yield* this.runCase(node, cur); break;
      case "cond":
        try {
          code = (yield* this.cond(node.expr, cur)) ? 0 : 1;
        } catch (e) {
          if (e instanceof ExpansionError) { cur.err.write("bash: " + e.message + "\n"); code = 1; }
          else if (e instanceof Unsupported) { cur.err.write("bash: unsupported on the station console: " + e.message + "\n"); code = 2; }
          else throw e;
        }
        break;
    }
    var self = this;
    files.forEach(function (f) {
      var why = self.writeFile(f.path, f.sink.text, f.append);
      if (why) { io.err.write("bash: " + why + "\n"); code = 1; }
    });
    this.lastStatus = code;
    return code;
  };

  Shell.prototype.runSimple = function* (node, io) {
    if (++this.steps > STEP_LIMIT) throw new Runaway();
    var argv = [];
    var assigns = [];
    this.substituted = false;
    try {
      for (var w = 0; w < node.words.length; w++) Array.prototype.push.apply(argv, yield* this.expandFields(node.words[w], io));
      for (var a = 0; a < node.assigns.length; a++) assigns.push([node.assigns[a].name, yield* this.expandString(node.assigns[a].value, io)]);
    } catch (e) {
      if (e instanceof ExpansionError) { io.err.write("bash: " + e.message + "\n"); return 1; }
      if (e instanceof Unsupported) { io.err.write("bash: unsupported on the station console: " + e.message + "\n"); return 2; }
      throw e;
    }
    var self = this;
    if (!argv.length) {
      // Assignments alone set shell variables (and update exported ones). The
      // status is the last $(…)'s, or 0.
      assigns.forEach(function (v) { self.setVar(v[0], v[1]); });
      return this.substituted ? this.lastStatus : 0;
    }
    // NAME=value cmd: set (and export) for this one command only.
    var saved = assigns.map(function (v) { return [v[0], self.vars[v[0]], self.exported[v[0]]]; });
    assigns.forEach(function (v) { self.vars[v[0]] = v[1]; self.exported[v[0]] = true; });
    var stream = io.stdin;
    var mark = { used: false };
    var outer = this.reading;
    this.reading = mark;
    var res;
    try {
      res = yield* this.exec(argv, stream.text.slice(stream.pos), { tty: io.out === this.tty, stdin: stream, out: io.out, err: io.err });
    } finally {
      this.reading = outer;
      saved.forEach(function (v) {
        if (v[1] === undefined) delete self.vars[v[0]]; else self.vars[v[0]] = v[1];
        if (v[2]) self.exported[v[0]] = true; else delete self.exported[v[0]];
      });
    }
    // A command that read its input (cat, grep…) used all of it, so a loop
    // reading the same input sees the end.
    if (mark.used) stream.pos = stream.text.length;
    if (res.clear) { this.screen = ""; this.cleared = true; }
    // A command's errors usually come out before its last output, so err first.
    io.err.write(res.err || "");
    io.out.write(res.out || "");
    return res.code;
  };

  Shell.prototype.runIf = function* (node, io) {
    for (var i = 0; i < node.clauses.length; i++) {
      yield* this.runList(node.clauses[i].cond, io);
      if (this.exiting || this.breaking || this.continuing) return this.lastStatus;
      if (this.lastStatus === 0) return yield* this.runList(node.clauses[i].body, io);
    }
    if (node.otherwise) return yield* this.runList(node.otherwise, io);
    return 0;
  };

  // After a loop body: should the loop stop? break and continue take a count
  // of loops to leave; each loop on the way out takes one off.
  Shell.prototype.loopDone = function () {
    if (this.exiting) return true;
    if (this.breaking) { this.breaking -= 1; return true; }
    if (this.continuing) { this.continuing -= 1; return this.continuing > 0; }
    return false;
  };

  Shell.prototype.runWhile = function* (node, io) {
    var status = 0;
    this.loopDepth = (this.loopDepth || 0) + 1;
    try {
      for (;;) {
        yield* this.runList(node.cond, io);
        if (this.exiting || this.breaking || this.continuing) { if (this.loopDone()) break; continue; }
        if ((this.lastStatus === 0) === node.until) break;
        status = yield* this.runList(node.body, io);
        if (this.loopDone()) break;
      }
    } finally {
      this.loopDepth -= 1;
    }
    return status;
  };

  Shell.prototype.runFor = function* (node, io) {
    var words;
    if (node.words === null) words = (this.args || []).slice();
    else {
      words = [];
      try {
        for (var w = 0; w < node.words.length; w++) Array.prototype.push.apply(words, yield* this.expandFields(node.words[w], io));
      } catch (e) {
        if (!(e instanceof ExpansionError)) throw e;
        io.err.write("bash: " + e.message + "\n");
        return 1;
      }
    }
    var status = 0;
    this.loopDepth = (this.loopDepth || 0) + 1;
    try {
      for (var i = 0; i < words.length; i++) {
        this.setVar(node.name, words[i]);
        status = yield* this.runList(node.body, io);
        if (this.loopDone()) break;
      }
    } finally {
      this.loopDepth -= 1;
    }
    return status;
  };

  // case: the first clause with a matching pattern runs. Patterns are globs
  // over the whole word, where * matches / too.
  Shell.prototype.runCase = function* (node, io) {
    var subject = yield* this.expandString(node.subject, io);
    for (var i = 0; i < node.clauses.length; i++) {
      var clause = node.clauses[i];
      for (var k = 0; k < clause.patterns.length; k++) {
        var p = yield* this.expandPattern(this.tilde(clause.patterns[k]), io);
        if (globRegex(p.text, p.quoted, 0, true).test(subject)) {
          return clause.body.length ? yield* this.runList(clause.body, io) : 0;
        }
      }
    }
    return 0;
  };

  Shell.prototype.saveState = function () {
    return { vars: this.vars, exported: this.exported, cwd: this.cwd, oldpwd: this.oldpwd, args: this.args,
      scriptName: this.scriptName, loopDepth: this.loopDepth, breaking: this.breaking, continuing: this.continuing,
      exiting: this.exiting, exitCode: this.exitCode, home: this.home };
  };
  Shell.prototype.restoreState = function (saved) {
    var self = this;
    Object.keys(saved).forEach(function (k) { self[k] = saved[k]; });
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
  Shell.prototype.background = function* (item, io) {
    var node = item.node;
    var n = (this.jobs.length ? Math.max.apply(null, this.jobs.map(function (j) { return j.n; })) : 0) + 1;
    var pid = this.nextPid;
    this.nextPid += 1 + (pid % 3);
    var job = { n: n, pid: pid, text: item.text, state: "Running" };
    var cmd = node.cmds.length === 1 && node.cmds[0].t === "simple" ? node.cmds[0] : null;
    var argv = cmd ? cmd.words.map(function (w) { return plain({ t: "word", atoms: w }); }) : [];
    io.err.write("[" + n + "] " + pid + "\n");
    if (argv.length === 2 && argv[0] === "sleep" && /^\d+$/.test(argv[1] || "")) {
      this.procs.push({ pid: pid, ppid: SHELL_PID, user: this.user, command: argv.join(" "), tty: "pts/0", cpu: 0, mem: 0.0,
        start: this.clock, end: this.clock + parseInt(argv[1], 10), alive: true, signals: [], ignores: [], job: job });
    } else {
      yield* this.runPipeline(node, io);
      job.state = "Done";
      this.notices.push(job);
    }
    this.jobs.push(job);
    this.lastBg = String(pid);
    this.lastStatus = 0;
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
    "help", "clear", "command", "true", "false", "test", "[", "read", "break", "continue", ":"];
  var KEYWORDS = ["if", "then", "elif", "else", "fi", "for", "in", "do", "done", "while", "until", "case", "esac", "{", "}", "!", "[[", "]]"];
  var SBIN = ["usermod"];

  var NO_BINARY = ["cd", "export", "unset", "type", "source", ".", "jobs", "fg", "bg", "exit", "help", "clear", "command",
    "read", "break", "continue", ":"];

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
  Shell.prototype.runFile = function* (path, display, args, io) {
    var found = this.lookup(path);
    if (found.error) return { out: "", err: "bash: " + display + ": " + found.error + "\n", code: 127 };
    if (found.node.type === "dir") return { out: "", err: "bash: " + display + ": Is a directory\n", code: 126 };
    if (!this.can(found.node, 1) || !this.can(found.node, 4)) return { out: "", err: "bash: " + display + ": Permission denied\n", code: 126 };
    return yield* this.child(found.node.contents, display, args, io);
  };

  // A child shell: it inherits only the EXPORTED variables, and nothing it
  // does to its variables or directory comes back to this shell. Like bash, it
  // runs a script up to a line it can't read, then stops with status 2.
  Shell.prototype.child = function* (script, name, args, io) {
    var self = this;
    var saved = this.saveState();
    var env = {};
    Object.keys(this.exported).forEach(function (k) { if (k in self.vars) env[k] = self.vars[k]; });
    var exported = {};
    Object.keys(env).forEach(function (k) { exported[k] = true; });
    this.vars = env;
    this.exported = exported;
    this.args = args;
    this.scriptName = name;
    this.loopDepth = 0;
    this.breaking = this.continuing = 0;
    this.exiting = false;
    var code;
    this.depth = (this.depth || 0) + 1;
    try {
      if (this.depth > 20) return { out: "", err: "bash: maximum nesting depth exceeded\n", code: 1 };
      code = yield* this.runScript(script, name, io);
      if (this.exiting) code = this.exitCode;
    } finally {
      this.depth -= 1;
      this.restoreState(saved);
    }
    return { out: "", err: "", code: code };
  };

  // Run a script's text in this shell (child() and source call it).
  Shell.prototype.runScript = function* (script, name, io) {
    var prog = parseScript(script);
    yield* this.runList(prog.items, io);
    if (prog.error && !this.exiting) {
      var e = prog.error;
      if (e instanceof Unsupported) {
        io.err.write(name + ": line " + this.lineOf(script, prog) + ": unsupported on the station console: " + e.message + "\n");
      } else {
        io.err.write(name + ": line " + e.line + ": " + e.message + "\n");
        var text = script.split("\n")[e.line - 1];
        if (e instanceof SyntaxErr && text !== undefined) io.err.write(name + ": line " + e.line + ": `" + text.trim() + "'\n");
      }
      this.lastStatus = 2;
    }
    return this.lastStatus;
  };
  Shell.prototype.lineOf = function (script, prog) {
    return prog.error.line || script.split("\n").length;
  };

  Shell.prototype.exec = function* (argv, stdin, io) {
    var name = argv[0];
    if (name.indexOf("/") !== -1) return yield* this.runFile(name, name, argv.slice(1), io);
    if (BUILTINS.indexOf(name) !== -1) return yield* this.call(name, argv, stdin, io);
    var path = this.which(name)[0];
    if (!path) {
      return {
        out: "",
        err: name + ": command not found. The Meridian's console only knows the basics; type `help` to see them.\n",
        code: 127,
      };
    }
    if (this.fs[path]) return yield* this.runFile(path, name, argv.slice(1), io);
    return yield* this.call(name, argv, stdin, io);
  };

  // A command is a function, or a generator function when it runs shell code
  // or asks for input (sudo, read, bash, source).
  Shell.prototype.call = function* (name, argv, stdin, io) {
    try {
      var r = COMMANDS[name].call(this, argv.slice(1), stdin, io);
      if (r && typeof r.next === "function") r = yield* r;
      return r;
    } catch (e) {
      if (e instanceof Runaway) throw e;
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
    if (!args.length || (args.length === 1 && args[0] === "-")) {
      if (sh.reading) sh.reading.used = true;
      return { texts: [{ name: "", text: stdin }], err: "" };
    }
    var texts = [];
    var err = "";
    args.forEach(function (a) {
      var r = sh.readFile(cmd, a);
      if (r.error) err += r.error + "\n";
      else texts.push({ name: a, text: r.text });
    });
    return { texts: texts, err: err };
  }

  function runTest(sh, name, args) {
    try {
      return { out: "", err: "", code: sh.testArgs(args) ? 0 : 1 };
    } catch (e) {
      if (!(e instanceof TestError)) throw e;
      return { out: "", err: "bash: " + name + ": " + e.message + "\n", code: 2 };
    }
  }

  function loopControl(sh, name, args) {
    if (!sh.loopDepth) return { out: "", err: "bash: " + name + ": only meaningful in a `for', `while', or `until' loop\n", code: 0 };
    var n = args.length ? args[0] : "1";
    if (!/^\d+$/.test(n) || +n < 1) return { out: "", err: "bash: " + name + ": " + n + ": loop count out of range\n", code: 1 };
    sh[name === "break" ? "breaking" : "continuing"] = Math.min(+n, sh.loopDepth);
    return ok();
  }

  // read's splitting: $IFS whitespace at either end is dropped, and the last
  // of `count` fields keeps the rest of the line, separators and all.
  function splitForRead(text, ifs, count) {
    var white = ifs.split("").filter(function (c) { return " \t\n".indexOf(c) !== -1; }).join("");
    var isWhite = function (c) { return white.indexOf(c) !== -1; };
    var isSep = function (c) { return ifs.indexOf(c) !== -1; };
    var i = 0;
    while (i < text.length && isWhite(text[i])) i++;
    var end = text.length;
    while (end > i && isWhite(text[end - 1])) end--;
    text = text.slice(i, end);
    var fields = [];
    var at = 0;
    while (fields.length < count - 1 && at < text.length) {
      var k = at;
      while (k < text.length && !isSep(text[k])) k++;
      fields.push(text.slice(at, k));
      // One separator: blanks, at most one other $IFS character, blanks.
      while (k < text.length && isWhite(text[k])) k++;
      if (k < text.length && isSep(text[k]) && !isWhite(text[k])) k++;
      while (k < text.length && isWhite(text[k])) k++;
      at = k;
    }
    if (at < text.length || fields.length < count) fields.push(text.slice(at));
    return fields;
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
        "  scripts:   if/elif/else, for, while/until, case, break continue, test [ ] [[ ]], read\n" +
        "Pipes (|), redirection (> >> < 2> 2>&1 >&2 &>), globs (* ? [...]), {a,b}, ; && ||, $VARS, $(command) and $((1 + 2)) work.\n" +
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
    ":": function () { return ok(); },
    test: function (args) { return runTest(this, "test", args); },
    "[": function (args) {
      if (args[args.length - 1] !== "]") return { out: "", err: "bash: [: missing `]'\n", code: 2 };
      return runTest(this, "[", args.slice(0, -1));
    },
    break: function (args) { return loopControl(this, "break", args); },
    continue: function (args) { return loopControl(this, "continue", args); },
    // read [-r] [-s] [-p prompt] [name…]: one line from standard input into
    // variables, split on $IFS (the last name takes the rest of the line). At
    // the console's own prompt the line comes from the keyboard.
    read: function* (args, stdin, io) {
      var raw = false, secret = false, prompt = "";
      var names = [];
      for (var i = 0; i < args.length; i++) {
        var a = args[i];
        if (names.length || a[0] !== "-" || a === "-") { names.push(a); continue; }
        for (var j = 1; j < a.length; j++) {
          if (a[j] === "r") raw = true;
          else if (a[j] === "s") secret = true;
          else if (a[j] === "p") { prompt = a.slice(j + 1) || args[++i] || ""; break; }
          else return { out: "", err: "bash: read: -" + a[j] + ": unsupported on the station console (read takes -r, -s and -p)\n", code: 2 };
        }
      }
      for (var k = 0; k < names.length; k++) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(names[k])) return { out: "", err: "bash: read: `" + names[k] + "': not a valid identifier\n", code: 1 };
      }
      var stream = io.stdin;
      var text, eof = false;
      if (stream.tty) {
        text = yield { prompt: prompt, secret: secret };
      } else {
        if (stream.pos >= stream.text.length) {
          (names.length ? names : ["REPLY"]).forEach(function (n) { this.setVar(n, ""); }, this);
          return { out: "", err: "", code: 1 };
        }
        var nl = stream.text.indexOf("\n", stream.pos);
        if (nl === -1) { text = stream.text.slice(stream.pos); stream.pos = stream.text.length; eof = true; }
        else { text = stream.text.slice(stream.pos, nl); stream.pos = nl + 1; }
      }
      if (!raw) text = text.replace(/\\(.)/g, "$1");
      if (!names.length) { this.setVar("REPLY", text); return { out: "", err: "", code: eof ? 1 : 0 }; }
      var ifs = this.vars.IFS === undefined ? " \t\n" : this.vars.IFS;
      var fields = splitForRead(text, ifs, names.length);
      names.forEach(function (n, idx) { this.setVar(n, fields[idx] || ""); }, this);
      return { out: "", err: "", code: eof ? 1 : 0 };
    },
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
    env: function* (args, stdin, io) {
      var sh = this;
      var i = 0;
      var extra = [];
      while (i < args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[i])) extra.push(args[i++]);
      if (i < args.length) {
        var saved = {};
        extra.forEach(function (a) { var k = a.split("=")[0]; saved[k] = [sh.vars[k], sh.exported[k]]; sh.vars[k] = a.slice(k.length + 1); sh.exported[k] = true; });
        try { return yield* this.exec(args.slice(i), stdin, io); } finally {
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
        if (KEYWORDS.indexOf(n) !== -1) lines_.push(p.opts.t ? "keyword" : n + " is a shell keyword");
        else if (BUILTINS.indexOf(n) !== -1) lines_.push(p.opts.t ? "builtin" : n + " is a shell builtin");
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
    command: function* (args, stdin, io) {
      if (args[0] === "-v") {
        var n = args[1];
        if (BUILTINS.indexOf(n) !== -1) return ok(n + "\n");
        var found = this.which(n)[0];
        return found ? ok(found + "\n") : { out: "", err: "", code: 1 };
      }
      return yield* this.exec(args, stdin, io);
    },
    source: function* (args, stdin, io) {
      if (!args.length) throw new Error("filename argument required");
      var r = this.readFile("bash", args[0]);
      if (r.error) return { out: "", err: r.error + "\n", code: 1 };
      return { out: "", err: "", code: yield* this.runScript(r.text, args[0], io) };
    },
    ".": function (args, stdin, io) { return COMMANDS.source.call(this, args, stdin, io); },
    bash: function* (args, stdin, io) {
      if (args[0] === "-c") {
        if (args.length < 2) return { out: "", err: "bash: -c: option requires an argument\n", code: 2 };
        return yield* this.child(args[1], args[2] || "bash", args.slice(3), io);
      }
      if (args.length) {
        var r = this.readFile("bash", args[0]);
        if (r.error) return { out: "", err: r.error + "\n", code: 127 };
        return yield* this.child(r.text, args[0], args.slice(1), io);
      }
      return { out: "", err: "bash: interactive shells inside the console aren't available; use bash -c '…' or bash script.sh\n", code: 1 };
    },
    sh: function (args, stdin, io) { return COMMANDS.bash.call(this, args, stdin, io); },
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
      var p = flags("grep", rawArgs, "ivncEq");
      if (!p.args.length) throw new Error("usage: grep [-ivncq] PATTERN [FILE]...");
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
      // -q: say nothing, only succeed or fail (for `if grep -q …`). A match
      // wins over an unreadable file, as in GNU grep.
      if (p.opts.q) return { out: "", err: r.err, code: matched ? 0 : r.err ? 2 : 1 };
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
      if (this.reading) this.reading.used = true;
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

  return { Shell: Shell, parse: parse, applyMode: applyMode, passes: passes };
});
