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
  if (typeof module === "object" && module.exports) module.exports = factory(require("./manual.js"));
  else root.OrbitShell = factory(root.OrbitManual);
})(typeof self !== "undefined" ? self : this, function (MANUAL) {
  "use strict";

  var UMASK = 0o002;
  var KiB = 1024, MiB = 1024 * 1024, GiB = 1024 * 1024 * 1024;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // The station's "now" when the console starts (#67): files are dated from it
  // and it moves on with the console's clock, so find -mtime and the server's
  // age checks (app/terminal.py STATION_NOW) agree whatever today's date is.
  var START_TIME = new Date(2026, 9, 8, 9, 0);
  // "2026-09-20T14:30:00", local time, as the exercise and the server write them.
  function parseStamp(text) {
    var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?$/.exec(text || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : START_TIME;
  }
  function isoStamp(d) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

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
  function Interrupt() {} // Ctrl-C, thrown into a command waiting for input

  var OPS = ["&>>", "&&", "&>", "&", ";;", ";", "||", "|", ">>", ">&2", ">&1", ">", "<<<", "<<-", "<<", "<", "(", ")"];
  var FD_OPS = ["2>&1", "1>&2", "2>>", "1>>", "2>", "1>"];
  var REDIRECTS = {
    "<": { fd: 0 }, ">": { fd: 1 }, "1>": { fd: 1 }, ">>": { fd: 1, append: true }, "1>>": { fd: 1, append: true },
    "2>": { fd: 2 }, "2>>": { fd: 2, append: true }, "&>": { fd: 3 }, "&>>": { fd: 3, append: true }, "<<<": { fd: 0 }, "<<-": { fd: 0 },
    "2>&1": { fd: 2, dup: 1 }, ">&2": { fd: 1, dup: 2 }, "1>&2": { fd: 1, dup: 2 }, ">&1": { fd: 1, dup: 1 }, "<<": { fd: 0 },
  };

  // `mode`: "word" reads all of src as a single word (the inside of $(( ))
  // and ${x:-…}); "heredoc" reads a here-document's body, where quotes are
  // just characters and only $, ` and \ are special (#65).
  function lex(src, mode) {
    var oneWord = mode === "word" || mode === true;
    var heredoc = mode === "heredoc";
    var tokens = [];
    var i = 0, line = 1;
    var atoms = null, from = 0;
    var heredocs = []; // << operators whose bodies start on the next line
    var wantsDelimiter = null;
    function lit(text, q) {
      var last = atoms[atoms.length - 1];
      if (last && "c" in last && last.q === q && text) last.c += text;
      else atoms.push({ c: text, q: q });
    }
    function start() { if (!atoms) { atoms = []; from = i; } }
    function end() {
      if (!atoms) return;
      tokens.push({ t: "word", atoms: atoms, text: src.slice(from, i), line: line, p: from, e: i });
      if (wantsDelimiter) {
        // The word after << ends the here-document; quoting any of it (<<'EOF')
        // makes the body literal.
        wantsDelimiter.heredoc.delimiter = atoms.map(function (a) { return "c" in a ? a.c : ""; }).join("");
        wantsDelimiter.heredoc.quoted = /['"\\]/.test(src.slice(from, i));
        heredocs.push(wantsDelimiter);
        wantsDelimiter = null;
      }
      atoms = null;
    }
    // At a newline: read the bodies of the here-documents opened on that line.
    function readHeredocs() {
      heredocs.forEach(function (tok) {
        var h = tok.heredoc;
        var body = [];
        for (;;) {
          if (i >= src.length) throw new Incomplete("here-document at line " + tok.line + " delimited by end-of-file (wanted `" + h.delimiter + "')", line);
          var nl = src.indexOf("\n", i);
          var text = nl === -1 ? src.slice(i) : src.slice(i, nl);
          if (h.strip) text = text.replace(/^\t+/, "");
          i = nl === -1 ? src.length : nl + 1;
          line++;
          if (text === h.delimiter) break;
          body.push(text);
        }
        h.body = body.length ? body.join("\n") + "\n" : "";
      });
      heredocs = [];
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
      if (heredoc) start();
      while (i < src.length) {
        var c = src[i];
        if (heredoc) {
          if (c === "\\" && src[i + 1] === "\n") advance(i + 2);
          else if (c === "\\" && "$`\\".indexOf(src[i + 1]) !== -1) { lit(src[i + 1], true); i += 2; }
          else if (c === "$" || c === "`") dollar(true);
          else { lit(c, true); advance(i + 1); }
          continue;
        }
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
          if (heredocs.length) readHeredocs();
        } else if (c === "#" && !atoms) {
          while (i < src.length && src[i] !== "\n") i++;
        } else if (!atoms && (c === "1" || c === "2") && src[i + 1] === ">") {
          var fdOp = FD_OPS.filter(function (o) { return src.slice(i, i + o.length) === o; })[0];
          tokens.push({ t: "op", v: fdOp, line: line, p: i, e: i + fdOp.length }); i += fdOp.length;
        } else if ("|&;<>()".indexOf(c) !== -1) {
          end();
          var op = OPS.filter(function (o) { return src.slice(i, i + o.length) === o; })[0];
          var opTok = { t: "op", v: op, line: line, p: i, e: i + op.length };
          tokens.push(opTok); i += op.length;
          if (op === "<<" || op === "<<-") { opTok.heredoc = { strip: op === "<<-" }; wantsDelimiter = opTok; }
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
    if (heredocs.length && !heredoc) {
      // The line with << was the last: the body hasn't been typed yet.
      tokens.push({ t: "eof", line: line, error: new Incomplete("here-document at line " + heredocs[0].line + " delimited by end-of-file (wanted `" + heredocs[0].heredoc.delimiter + "')", line) });
      return tokens;
    }
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

  // name() compound, or function name [()] compound (#65). The body is
  // usually { …; }; any redirects on it apply at each call.
  Parser.prototype.funcDef = function (keyword) {
    if (keyword) this.next();
    var nameTok = this.next();
    var name = plain(nameTok);
    if (!name || !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name)) this.fail(nameTok);
    if (this.isOp("(")) {
      this.next();
      if (!this.isOp(")")) this.fail(this.peek());
      this.next();
    }
    this.linebreak();
    var start = this.peek();
    var body = this.command();
    if (body.t === "simple") this.fail(start);
    return { t: "funcdef", name: name, body: body, redirects: [] };
  };

  Parser.prototype.command = function () {
    var t = this.peek();
    var w = plain(t);
    var node = null;
    var after = this.toks[this.at + 1], after2 = this.toks[this.at + 2];
    if (w === "function") return this.funcDef(true);
    if (w && CLOSERS.indexOf(w) === -1 && after && after.t === "op" && after.v === "(" && after2 && after2.t === "op" && after2.v === ")") return this.funcDef(false);
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
    var opTok = this.next();
    var op = opTok.v;
    var spec = REDIRECTS[op];
    if (opTok.heredoc) {
      var delim = this.next();
      if (delim.t !== "word") this.fail(delim);
      var h = opTok.heredoc;
      if (h.body === undefined) throw new Incomplete("here-document delimited by end-of-file", opTok.line);
      var tok = h.quoted ? null : lex(h.body, "heredoc")[0];
      return { fd: 0, heredoc: h.quoted || tok.t !== "word" ? [{ c: h.body, q: true }] : tok.atoms };
    }
    if (spec.dup) return { fd: spec.fd, dup: spec.dup };
    if (op === "<<<") {
      var word = this.next();
      if (word.t !== "word") this.fail(word);
      return { fd: 0, herestring: word.atoms };
    }
    var target = this.peek();
    if (target.t !== "word") {
      if (target.t === "eof" && target.error) throw target.error;
      throw new SyntaxErr("syntax error near unexpected token `" + (target.t === "op" ? target.v : "newline") + "'", target.line);
    }
    this.next();
    return { fd: spec.fd, append: !!spec.append, word: target.atoms, text: target.text };
  };

  Parser.prototype.simple = function () {
    var cmd = { t: "simple", assigns: [], words: [], redirects: [], line: this.peek().line };
    for (;;) {
      var t = this.peek();
      if (t.t === "word") {
        var m = !cmd.words.length && t.atoms[0] && "c" in t.atoms[0] && !t.atoms[0].q && /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(t.atoms[0].c);
        if (m) {
          var value = [{ c: t.atoms[0].c.slice(m[0].length), q: false }].concat(t.atoms.slice(1));
          cmd.assigns.push({ name: m[1], value: value });
        } else {
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

  // set -u: an unset variable is an error (not $@, and not ${x:-…}, which
  // are how you ask for a default). A script stops; the prompt carries on.
  Shell.prototype.unbound = function (name) {
    if (!this.opts.u || name === "@" || name === "*") return;
    var e = new ExpansionError((/^\d+$/.test(name) ? "$" : "") + name + ": unbound variable");
    e.fatal = true;
    throw e;
  };

  // One expansion's value: a string, or a list for $@ / $*.
  Shell.prototype.expansion = function* (x, io) {
    var value;
    if (x.t === "var") {
      value = this.param(x.name);
      if (value === undefined) this.unbound(x.name);
      return value === undefined ? "" : value;
    }
    if (x.t === "len") {
      value = this.param(x.name);
      if (value === undefined) this.unbound(x.name);
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
        var real = self.lookup(r.abs);
        var dirNode = real.node;
        if (!dirNode || dirNode.type !== "dir") return;
        var sub = { text: part, quoted: word.quoted.slice(offsets[idx], offsets[idx] + part.length) };
        if (!hasGlob(sub)) {
          var p = r.abs === "/" ? "/" + part : normalize(r.abs + "/" + part);
          if (part === "." || part === "..") p = normalize(r.abs + "/" + part);
          if (!self.lookup(p, true).error) next.push({ shown: shownPrefix + part, abs: p });
          return;
        }
        if (!self.can(dirNode, 4)) return;
        var re = globRegex(part, word.quoted, offsets[idx]);
        self.children(real.path).sort(compareNames).forEach(function (name) {
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
    // Its lines are the script's: an error on line 11 inside $( ) says line 11.
    var offset = this.lineOffset;
    this.lineOffset = (this.lineNo || 1) - 1;
    try {
      yield* this.subshell(prog.items, { stdin: io.stdin, out: buf, err: io.err }, true);
    } finally {
      this.lineOffset = offset;
    }
    this.substituted = true;
    return buf.text.replace(/\n+$/, "");
  };

  // ( … ) and $(…) run in a subshell: a copy of everything (not only what's
  // exported), and nothing it changes (variables, cd, exit) comes back.
  Shell.prototype.subshell = function* (items, io, substitution) {
    var saved = this.saveState();
    this.vars = Object.assign({}, this.vars);
    this.exported = Object.assign({}, this.exported);
    this.funcs = Object.assign({}, this.funcs);
    this.opts = Object.assign({}, this.opts, substitution ? { e: false } : {});
    this.traps = {}; // a subshell starts without the parent's traps
    this.frames = [];
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
      if (v === undefined) sh.unbound(name);
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
    if (op === "-L" || op === "-h") { var l = arg === "" ? {} : this.lookup(arg, true); return !!l.node && l.node.type === "link"; }
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
  Shell.prototype.drive = function (gen, answer, thrown) {
    var step;
    try {
      step = thrown ? gen.throw(thrown) : gen.next(answer);
    } catch (e) {
      if (e instanceof Runaway) this.screen += "bash: stopped after " + STEP_LIMIT.toLocaleString("en-US") + " commands: is a loop running forever?\n";
      else if (!(e instanceof Interrupt)) throw e;
      this.lastStatus = 130;
      step = { done: true };
    }
    if (!step.done) {
      var v = step.value;
      this.pending = { prompt: v.prompt || "", secret: !!v.secret, editor: v.editor || null, pager: v.pager || null, gen: gen };
      return { output: this.screen, clear: this.cleared, pending: true };
    }
    this.reap();
    this.screen += this.flushNotices();
    return { output: this.screen, clear: this.cleared };
  };

  // The answer to a pending prompt. The console masks a secret one and never
  // echoes or stores it. When an editor or a pager closes, the console calls
  // this with no line to carry on with the command that opened it.
  Shell.prototype.answer = function (line) {
    var p = this.pending;
    this.pending = null;
    this.screen = "";
    this.cleared = false;
    return this.drive(p.gen, line);
  };

  // Ctrl-C abandons a prompt, or the lines of an unfinished command. It's
  // thrown into the waiting command, so a script's INT and EXIT traps run
  // (their output is in the result) and everything unwinds as it goes.
  // Returns a result like run()'s, or null when there's nothing to cancel.
  Shell.prototype.cancel = function () {
    if (this.more !== null) { this.more = null; this.lastStatus = 130; return { output: "", clear: false }; }
    if (!this.pending) return null;
    var gen = this.pending.gen;
    this.pending = null;
    this.screen = "";
    this.cleared = false;
    return this.drive(gen, undefined, new Interrupt());
  };

  // Is a function, a loop or the script being left (return, break, continue, exit)?
  Shell.prototype.unwinding = function () {
    return this.exiting || this.returning || this.breaking || this.continuing;
  };

  Shell.prototype.runList = function* (items, io) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.op === "&&" && this.lastStatus !== 0) continue;
      if (item.op === "||" && this.lastStatus === 0) continue;
      if (item.bg) yield* this.background(item, io);
      else yield* this.runPipeline(item.node, io);
      // set -e doesn't stop for a command left of && or || (#65).
      var tested = i + 1 < items.length && (items[i + 1].op === "&&" || items[i + 1].op === "||");
      if (tested && this.lastStatus !== 0) this.ignoredFail = true;
      this.errexit(io);
      if (this.unwinding()) break;
    }
    return this.lastStatus;
  };

  // set -e: a failure exits, except where bash ignores it: in an if, while or
  // until test (noErrexit), left of && or ||, in a ! pipeline, or when a
  // function or compound command failed only because of one of those
  // (ignoredFail, which the last command run leaves behind).
  Shell.prototype.errexit = function (io) {
    if (!this.opts.e || this.noErrexit || this.lastStatus === 0 || this.ignoredFail || this.exiting) return;
    this.exiting = true;
    this.exitCode = this.lastStatus;
    // At the prompt a real terminal would close; the console says so and carries on.
    if (!this.depth && !this.funcDepth) io.err.write("logout\n(set -e ended the shell: a real terminal would close here. Type set +e to turn it off.)\n");
  };

  Shell.prototype.runPipeline = function* (node, io) {
    var stdin = io.stdin;
    var status = 0;
    var failed = 0; // pipefail: the last stage that failed
    this.ignoredFail = false;
    for (var k = 0; k < node.cmds.length; k++) {
      var last = k === node.cmds.length - 1;
      var out = last ? io.out : new Sink();
      status = yield* this.runCommand(node.cmds[k], { stdin: stdin, out: out, err: io.err });
      if (status !== 0) failed = status;
      if (!last) stdin = { text: out.text, pos: 0 };
      if (this.exiting) break;
    }
    if (this.opts.pipefail) status = failed;
    if (node.negate) { status = status === 0 ? 1 : 0; this.ignoredFail = true; }
    this.lastStatus = status;
    return status;
  };

  // Redirections are applied left to right, as in bash, so `> f 2>&1` sends
  // both streams to f while `2>&1 > f` leaves errors on the terminal: 2>&1
  // copies wherever stdout points *at that moment*. Files are written when the
  // command finishes.
  Shell.prototype.runCommand = function* (node, io) {
    if (node.line) this.lineNo = node.line + (this.lineOffset || 0); // a redirect's error names this line
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
        // A here-document or here-string is the command's input (#65).
        if (r.heredoc) { cur.stdin = { text: yield* this.expandString(r.heredoc, io), pos: 0 }; continue; }
        if (r.herestring) { cur.stdin = { text: (yield* this.expandString(r.herestring, io)) + "\n", pos: 0 }; continue; }
        // Split and globbed like any word; it must come out as exactly one (#71).
        var fields = yield* this.expandFields(r.word, io);
        if (fields.length !== 1) {
          io.err.write(this.where() + ": " + r.text + ": ambiguous redirect\n");
          return (this.lastStatus = 1);
        }
        path = fields[0];
      } catch (e) {
        return (this.lastStatus = this.expansionFailed(e, io));
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
      case "funcdef": this.funcs[node.name] = node.body; code = 0; break;
      case "if": code = yield* this.runIf(node, cur); break;
      case "while": code = yield* this.runWhile(node, cur); break;
      case "for": code = yield* this.runFor(node, cur); break;
      case "case": code = yield* this.runCase(node, cur); break;
      case "cond":
        try {
          code = (yield* this.cond(node.expr, cur)) ? 0 : 1;
        } catch (e) {
          code = this.expansionFailed(e, cur);
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

  // Who's complaining: in a script, bash says where ("check.sh: line 4"), and
  // at the prompt it's just "bash".
  Shell.prototype.where = function () {
    return this.depth && this.scriptName && this.scriptName !== "bash" ? this.scriptName + ": line " + this.lineNo : "bash";
  };

  // An expansion that went wrong: say so, and under set -u (an unbound
  // variable) a script stops there with status 1, as bash does.
  Shell.prototype.expansionFailed = function (e, io) {
    if (e instanceof Unsupported) { io.err.write("bash: unsupported on the station console: " + e.message + "\n"); return 2; }
    if (!(e instanceof ExpansionError)) throw e;
    io.err.write(this.where() + ": " + e.message + "\n");
    if (e.fatal && this.depth) { this.exiting = true; this.exitCode = 1; }
    return 1;
  };

  // local, export and readonly take NAME=value words as assignments: not
  // split, even unquoted (local name=$1 keeps "a b" whole).
  var DECLARATIONS = ["local", "export", "readonly", "declare"];

  Shell.prototype.runSimple = function* (node, io) {
    if (++this.steps > STEP_LIMIT) throw new Runaway();
    this.lineNo = node.line + (this.lineOffset || 0);
    var argv = [];
    var assigns = [];
    this.substituted = false;
    var declares = node.words.length && DECLARATIONS.indexOf(plain({ t: "word", atoms: node.words[0] })) !== -1;
    try {
      for (var w = 0; w < node.words.length; w++) {
        var word = node.words[w];
        if (declares && w > 0 && "c" in word[0] && !word[0].q && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word[0].c)) argv.push(yield* this.expandString(word, io));
        else Array.prototype.push.apply(argv, yield* this.expandFields(word, io));
      }
      for (var a = 0; a < node.assigns.length; a++) assigns.push([node.assigns[a].name, yield* this.expandString(node.assigns[a].value, io)]);
    } catch (e) {
      return this.expansionFailed(e, io);
    }
    var self = this;
    if (this.opts.x) io.err.write(xtrace(assigns, argv));
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

  // The test of an if, while or until runs with set -e ignored.
  Shell.prototype.condition = function* (items, io) {
    this.noErrexit += 1;
    try {
      return yield* this.runList(items, io);
    } finally {
      this.noErrexit -= 1;
    }
  };

  Shell.prototype.runIf = function* (node, io) {
    for (var i = 0; i < node.clauses.length; i++) {
      yield* this.condition(node.clauses[i].cond, io);
      if (this.unwinding()) return this.lastStatus;
      if (this.lastStatus === 0) return yield* this.runList(node.clauses[i].body, io);
    }
    if (node.otherwise) return yield* this.runList(node.otherwise, io);
    return 0;
  };

  // After a loop body: should the loop stop? break and continue take a count
  // of loops to leave; each loop on the way out takes one off.
  Shell.prototype.loopDone = function () {
    if (this.exiting || this.returning) return true;
    if (this.breaking) { this.breaking -= 1; return true; }
    if (this.continuing) { this.continuing -= 1; return this.continuing > 0; }
    return false;
  };

  Shell.prototype.runWhile = function* (node, io) {
    var status = 0;
    this.loopDepth = (this.loopDepth || 0) + 1;
    try {
      for (;;) {
        yield* this.condition(node.cond, io);
        if (this.unwinding()) { if (this.loopDone()) break; continue; }
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
        return this.expansionFailed(e, io);
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
    var subject;
    try {
      subject = yield* this.expandString(node.subject, io);
    } catch (e) {
      return this.expansionFailed(e, io);
    }
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
      exiting: this.exiting, exitCode: this.exitCode, home: this.home, funcs: this.funcs, opts: this.opts,
      traps: this.traps, frames: this.frames, funcDepth: this.funcDepth, sourceDepth: this.sourceDepth,
      returning: this.returning, returnCode: this.returnCode, noErrexit: this.noErrexit, lineOffset: this.lineOffset };
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
    "help", "clear", "command", "true", "false", "test", "[", "read", "break", "continue", ":",
    "set", "local", "return", "shift", "trap"];
  var KEYWORDS = ["if", "then", "elif", "else", "fi", "for", "in", "do", "done", "while", "until", "case", "esac", "{", "}", "!", "[[", "]]", "function"];
  var SBIN = ["usermod"];

  var NO_BINARY = ["cd", "export", "unset", "type", "source", ".", "jobs", "fg", "bg", "exit", "help", "clear", "command",
    "read", "break", "continue", ":", "set", "local", "return", "shift", "trap"];

  // Where `name` would be found on $PATH: every match, or the first.
  Shell.prototype.which = function (name, all) {
    var found = [];
    var self = this;
    var sbin = SBIN.indexOf(name) !== -1;
    (this.vars.PATH || "").split(":").forEach(function (dir) {
      if (!dir) return;
      var path = join(dir, name);
      var node = self.fs[path] && self.lookup(path).node;
      if (self.fs[path]) {
        if (node && node.type === "file" && node.mode & 0o111) found.push(path);
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
    this.lineOffset = 0;
    this.loopDepth = 0;
    this.breaking = this.continuing = 0;
    this.exiting = false;
    // A new bash: no functions, options or traps from its parent.
    this.funcs = {};
    this.opts = { e: false, u: false, x: false, pipefail: false };
    this.traps = {};
    this.frames = [];
    this.funcDepth = this.sourceDepth = this.noErrexit = 0;
    this.returning = false;
    var code;
    this.depth = (this.depth || 0) + 1;
    try {
      if (this.depth > 20) return { out: "", err: "bash: maximum nesting depth exceeded\n", code: 1 };
      try {
        code = yield* this.runScript(script, name, io);
        if (this.exiting) code = this.exitCode;
      } catch (e) {
        // Ctrl-C while the script waited for input: its INT trap, then its
        // EXIT trap, then it's gone.
        if (!(e instanceof Interrupt)) throw e;
        if (this.traps.INT) yield* this.runTrap("INT", 130, io);
        yield* this.runTrap("EXIT", 130, io);
        throw e;
      }
      code = yield* this.runTrap("EXIT", code, io);
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
  // Run a trap's commands. $? in them is the status the shell is leaving
  // with, and that status stands unless the trap itself exits. Each trap
  // runs once.
  Shell.prototype.runTrap = function* (sig, code, io) {
    var text = this.traps[sig];
    if (!text) return code;
    delete this.traps[sig];
    var prog = parseScript(text);
    this.exiting = false;
    this.returning = false;
    this.lastStatus = code;
    yield* this.runList(prog.items, io);
    return this.exiting ? this.exitCode : code;
  };

  Shell.prototype.lineOf = function (script, prog) {
    return prog.error.line || script.split("\n").length;
  };

  // Call a shell function (#65): in this shell, with its own $1…, $# and "$@",
  // and a frame for `local`, whose variables are put back on return.
  Shell.prototype.callFunction = function* (name, args, io) {
    if (this.funcDepth >= 100) return { out: "", err: "bash: " + name + ": maximum function nesting level exceeded (100)\n", code: 1 };
    var savedArgs = this.args, savedLoops = this.loopDepth;
    var frame = { FUNCNAME: [this.vars.FUNCNAME, this.exported.FUNCNAME] }; // $FUNCNAME is the function running
    this.vars.FUNCNAME = name;
    this.args = args;
    this.loopDepth = 0;
    this.funcDepth += 1;
    this.frames.push(frame);
    var code;
    try {
      code = yield* this.runCommand(this.funcs[name], io);
      if (this.returning) code = this.returnCode;
    } finally {
      this.returning = false;
      // A function call is a simple command: if it fails, set -e stops, even
      // when what failed inside was a test it ignored (unlike { …; }).
      this.ignoredFail = false;
      this.frames.pop();
      this.funcDepth -= 1;
      this.args = savedArgs;
      this.loopDepth = savedLoops;
      var sh = this;
      Object.keys(frame).forEach(function (k) {
        if (frame[k][0] === undefined) delete sh.vars[k]; else sh.vars[k] = frame[k][0];
        if (frame[k][1]) sh.exported[k] = true; else delete sh.exported[k];
      });
    }
    return { out: "", err: "", code: code };
  };

  // A file called NAME on the PATH that isn't executable, which bash finds as a last resort.
  Shell.prototype.plainOnPath = function (name) {
    var sh = this;
    return (this.vars.PATH || "").split(":").map(function (dir) { return dir && join(dir, name); }).filter(function (q) {
      var f = q && sh.fs[q] && sh.lookup(q);
      return f && f.node && f.node.type === "file";
    })[0] || null;
  };

  Shell.prototype.exec = function* (argv, stdin, io) {
    var name = argv[0];
    // On another host (#166), only what a task needs from there.
    if (this.origin && REMOTE_COMMANDS.indexOf(name) === -1) return { out: "", err: "bash: line 1: " + name + ": command not found\n", code: 127 };
    if (this.funcs[name]) return yield* this.callFunction(name, argv.slice(1), io);
    if (name.indexOf("/") !== -1) return yield* this.runFile(name, name, argv.slice(1), io);
    if (BUILTINS.indexOf(name) !== -1) return yield* this.call(name, argv, stdin, io);
    var path = this.which(name)[0];
    if (!path && this.where() !== "bash") {
      // In a script it's bash's own words, with the line: the station's voice
      // would blame the console for what's usually a typo or a quoting bug (#71).
      if (!this.plainOnPath(name)) return { out: "", err: this.where() + ": " + name + ": command not found\n", code: 127 };
    }
    if (!path) {
      // bash's last resort: a file on the PATH that isn't executable is found, and
      // refused (`bash: /station/bin/x: Permission denied`, 126), not "not found".
      var plain = this.plainOnPath(name);
      if (plain) return yield* this.runFile(plain, plain, argv.slice(1), io);
      return {
        out: "",
        err: name + ": command not found. The Meridian's console only knows the basics; type `help` to see them.\n",
        code: 127,
      };
    }
    if (this.fs[path]) return yield* this.runFile(path, path, argv.slice(1), io); // bash's $0 is the path it found
    return yield* this.call(name, argv, stdin, io);
  };

  // A command is a function, or a generator function when it runs shell code
  // or asks for input (sudo, read, bash, source).
  Shell.prototype.call = function* (name, argv, stdin, io) {
    // CMD --help prints its usage, as GNU tools and bash builtins do. Not for
    // echo and test, which print or test the word instead.
    if (argv.indexOf("--help") > 0 && argv.slice(1, argv.indexOf("--help")).indexOf("--") === -1 && ["echo", "test", "["].indexOf(name) === -1) {
      if (BUILTINS.indexOf(name) !== -1 && MANUAL.HELP[name]) return ok(renderHelp(name));
      if (MANUAL.PAGES[name]) return ok(renderUsage(name));
    }
    try {
      var r = COMMANDS[name].call(this, argv.slice(1), stdin, io);
      if (r && typeof r.next === "function") r = yield* r;
      return r;
    } catch (e) {
      if (e instanceof Runaway || e instanceof Interrupt) throw e;
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
    var s = node.type === "dir" ? "d" : node.type === "link" ? "l" : "-";
    var chars = "rwxrwxrwx";
    for (var i = 0; i < 9; i++) s += node.mode & (1 << (8 - i)) ? chars[i] : "-";
    if (node.mode & 0o1000) s = s.slice(0, 9) + (node.mode & 1 ? "t" : "T"); // sticky, like /tmp's
    return s;
  }
  // A file's size: what the exercise says (a big log is sampled), or its contents.
  function size(node) {
    if (node.type === "dir") return 4096;
    if (node.type === "link") return node.target.length;
    return node.size !== undefined ? node.size : new TextEncoder().encode(node.contents).length;
  }
  // What it takes on disk: whole 4K blocks (a link takes none), as du counts.
  function usage(node) {
    if (node.type === "link") return 0;
    return Math.ceil(size(node) / 4096) * 4096;
  }
  function human(n) {
    if (n < 1024) return String(n);
    var units = ["K", "M", "G"];
    var v = n;
    for (var i = 0; i < units.length; i++) {
      v /= 1024;
      if (v < 1024 || i === units.length - 1) return v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) + units[i] : Math.ceil(v) + units[i];
    }
  }
  // ls's date: the time for the last six months, the year before that.
  function stamp(d, now) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var day = d.getDate();
    var old = now && (now - d > 182.5 * 86400000 || d - now > 3600000);
    return MONTHS[d.getMonth()] + " " + (day < 10 ? " " : "") + day + " " + (old ? " " + d.getFullYear() : pad(d.getHours()) + ":" + pad(d.getMinutes()));
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

  function trapName(spec) {
    var s = String(spec).toUpperCase().replace(/^SIG/, "");
    if (s === "0" || s === "EXIT") return "EXIT";
    if (s === "ERR") return "ERR";
    return { 1: "HUP", 2: "INT", 15: "TERM", HUP: "HUP", INT: "INT", TERM: "TERM" }[s] || null;
  }

  // A word as bash shows it back (set -x, set, trap): quoted when it must be.
  function quoteWord(w, always) {
    if (!always && /^[A-Za-z0-9_@%+=:,.\/-]+$/.test(w)) return w;
    return "'" + String(w).replace(/'/g, "'\\''") + "'";
  }
  function xtrace(assigns, argv) {
    return assigns.map(function (a) { return "+ " + a[0] + "=" + quoteWord(a[1]) + "\n"; }).join("") +
      (argv.length ? "+ " + argv.map(function (w) { return quoteWord(w); }).join(" ") + "\n" : "");
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

  // --- the editor, the pager, and the manual (#66) ------------------------------------
  function countLines(text) { return lines(text).length; }

  // nano, as far as the console goes. console.js draws it (nano's title bar,
  // a <textarea>, the message line and the shortcuts) and passes keys here
  // with the text as it stands; this decides what happens. `save(body)`
  // writes the file and says {ok} or {ok: false, message}.
  //   modes: "edit"; "write" (File Name to Write, Enter confirms);
  //          "ask" (Save modified buffer? Y/N, after ^X)
  function Nano(o) {
    this.name = o.name;
    this.text = o.text;
    this.saved = o.text;
    this.save = o.save;
    this.message = o.message || "";
    this.mode = "edit";
    this.exitAfterWrite = false;
    this.done = false;
  }
  Nano.prototype.modified = function (text) { return text !== this.saved; };
  Nano.prototype.prompt = function () {
    if (this.mode === "write") return "File Name to Write: " + this.name;
    if (this.mode === "ask") return "Save modified buffer?   Y Yes   N No   ^C Cancel";
    return "";
  };
  Nano.prototype.key = function (k, text) {
    this.text = text;
    if (this.mode === "write") {
      if (k === "Enter") return this.write(text);
      if (k === "^C") { this.mode = "edit"; this.exitAfterWrite = false; this.message = "[ Cancelled ]"; }
      return this;
    }
    if (this.mode === "ask") {
      if (k === "y" || k === "Y") { this.mode = "write"; this.exitAfterWrite = true; }
      else if (k === "n" || k === "N") this.done = true;
      else if (k === "^C") { this.mode = "edit"; this.message = "[ Cancelled ]"; }
      return this;
    }
    this.message = "";
    if (k === "^O") { this.mode = "write"; this.exitAfterWrite = false; }
    else if (k === "^X") { if (this.modified(text)) this.mode = "ask"; else this.done = true; }
    return this;
  };
  // nano ends a saved file with a newline, as POSIX text files do.
  Nano.prototype.write = function (text) {
    var body = text !== "" && text.slice(-1) !== "\n" ? text + "\n" : text;
    var r = this.save(body);
    this.mode = "edit";
    if (!r.ok) { this.message = r.message; this.exitAfterWrite = false; return this; }
    this.saved = text;
    var n = countLines(body);
    this.message = "[ Wrote " + n + " line" + (n === 1 ? "" : "s") + " ]";
    if (this.exitAfterWrite) this.done = true;
    return this;
  };

  // less, and man's pager. console.js shows view() and passes keys.
  function Pager(o) {
    this.lines = lines(o.text);
    this.name = o.name;
    this.man = !!o.man;
    this.height = o.height || 20;
    this.top = 0;
    this.pattern = null;
    this.match = -1;
    this.message = "";
    this.done = false;
  }
  Pager.prototype.maxTop = function () { return Math.max(0, this.lines.length - this.height); };
  Pager.prototype.atEnd = function () { return this.top + this.height >= this.lines.length; };
  Pager.prototype.status = function () {
    if (this.message) return this.message;
    if (this.man) return "Manual page " + this.name + " line " + (this.top + 1) + (this.atEnd() ? " (END)" : "") + " (press h for help or q to quit)";
    if (this.atEnd()) return "(END)";
    return this.top === 0 && this.name ? this.name : ":";
  };
  Pager.prototype.view = function () {
    return { lines: this.lines.slice(this.top, this.top + this.height), pattern: this.pattern, status: this.status() };
  };
  Pager.prototype.key = function (k) {
    var was = this.message;
    this.message = "";
    if (was && k === "Enter") return this; // "(press RETURN)"
    switch (k) {
      case " ": case "f": case "PageDown": this.top = Math.max(this.top, Math.min(this.top + this.height, this.maxTop())); break;
      case "b": case "PageUp": this.top = Math.max(0, this.top - this.height); break;
      case "j": case "ArrowDown": case "Enter": this.top = Math.max(this.top, Math.min(this.top + 1, this.maxTop())); break;
      case "k": case "ArrowUp": this.top = Math.max(0, this.top - 1); break;
      case "g": case "Home": this.top = 0; break;
      case "G": case "End": this.top = this.maxTop(); break;
      case "n": this.find(1); break;
      case "N": this.find(-1); break;
      case "h": this.message = "Space: next screen   b: back   j/k: a line   g/G: start/end   /text: search   n/N: next/previous match   q: quit"; break;
      case "q": case "Q": this.done = true; break;
    }
    return this;
  };
  Pager.prototype.search = function (pattern) {
    if (pattern) this.pattern = pattern;
    this.match = this.top - 1;
    return this.find(1);
  };
  Pager.prototype.regex = function () {
    try { return new RegExp(this.pattern); } catch (e) { return new RegExp(this.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); }
  };
  Pager.prototype.find = function (dir) {
    if (!this.pattern) { this.message = "No previous regular expression"; return this; }
    var re = this.regex();
    var from = this.match >= 0 ? this.match : this.top - (dir > 0 ? 1 : -1);
    for (var i = from + dir; i >= 0 && i < this.lines.length; i += dir) {
      if (re.test(this.lines[i])) { this.match = i; this.top = i; return this; }
    }
    this.message = "Pattern not found  (press RETURN)";
    return this;
  };

  // less FILE, or a pipe into less. Into a pipe itself, it's cat.
  function* page(cmd, args, stdin, io) {
    var text, name = "";
    if (args.length) {
      var r = this.readFile(cmd, args[0]);
      if (r.error) return { out: "", err: r.error.replace(cmd + ": ", "") + "\n", code: 1 };
      text = r.text;
      name = args[0];
    } else if (!io.stdin.tty) {
      if (this.reading) this.reading.used = true;
      text = stdin;
    } else return { out: "", err: cmd === "less" ? 'Missing filename ("less --help" for help)\n' : "more: bad usage\nTry 'more --help' for more information.\n", code: 1 };
    if (!io.tty) return ok(text);
    yield { pager: new Pager({ text: text, name: name }) };
    return ok();
  }

  // The page for `man [SECTION] NAME`: crontab(1) is "crontab", crontab(5) "crontab.5".
  function manKey(name, section) {
    var keys = section ? [name + "." + section, name] : [name, name + ".5"];
    return keys.filter(function (k) {
      return MANUAL.PAGES[k] && (!section || String(MANUAL.PAGES[k].section || 1) === section);
    })[0] || null;
  }

  // An exercise's own page (#68): /usr/share/man/man8/scrubberd.8, as plain
  // text, already laid out. Sections are searched in man-db's order, and the
  // console's own pages come first within a section.
  var MAN_ORDER = ["1", "8", "3", "2", "5", "4", "6", "7"];
  function manFile(fs, name, section) {
    var found = null;
    (section ? [section] : MAN_ORDER).some(function (s) {
      var key = manKey(name, s);
      if (key) found = { key: key };
      else if (fs["/usr/share/man/man" + s + "/" + name + "." + s]) found = { path: "/usr/share/man/man" + s + "/" + name + "." + s, title: name + "(" + s + ")" };
      return found;
    });
    return found;
  }

  // An option's flag, then its text wrapped at `at` columns (on a line of its
  // own if the flag is too long to share one).
  function optionLines(flag, text, at) {
    var out = wrap(text, 78, at);
    if (flag.length < at) out[0] = flag + out[0].slice(flag.length);
    else out.unshift(flag);
    return out;
  }

  // Word-wrap `text` to `width` columns at `indent` spaces. Paragraphs are
  // split on blank lines; a line starting with four spaces is kept as it is.
  function wrap(text, width, indent) {
    var pad = new Array(indent + 1).join(" ");
    var out = [];
    text.split("\n").forEach(function (para) {
      if (para === "") { out.push(""); return; }
      if (/^ {4}/.test(para)) { out.push(pad + para); return; }
      var line = "";
      para.split(/\s+/).forEach(function (word) {
        if (line && pad.length + line.length + 1 + word.length > width) { out.push(pad + line); line = word; }
        else line = line ? line + " " + word : word;
      });
      if (line) out.push(pad + line);
    });
    return out;
  }

  // man's layout: NAME(1) headers, sections at the margin, text at 7 columns.
  function renderMan(key) {
    var page = MANUAL.PAGES[key];
    var name = page.name || key;
    var head = name.toUpperCase() + "(" + (page.section || 1) + ")";
    var middle = page.section === 5 ? "File Formats" : "User Commands";
    var gap = Math.max(1, Math.floor((78 - 2 * head.length - middle.length) / 2));
    var spaces = function (n) { return new Array(n + 1).join(" "); };
    var out = [head + spaces(gap) + middle + spaces(78 - 2 * head.length - middle.length - gap) + head, "", "NAME", "       " + name + " - " + page.summary, ""];
    if (page.synopsis) out = out.concat(["SYNOPSIS"], page.synopsis.map(function (l) { return "       " + l; }), [""]);
    out = out.concat(["DESCRIPTION"], wrap(page.description, 78, 7));
    (page.options || []).forEach(function (o) {
      out = out.concat([""], ["       " + o[0]], wrap(o[1], 78, 14));
    });
    if (page.options) {
      out = out.concat(["", "STATION CONSOLE"], wrap("This console knows only the options above, and only their short forms (-a, not --all).", 78, 7));
    }
    out = out.concat(["", "Meridian station" + spaces(78 - 16 - head.length) + head]);
    return out.join("\n") + "\n";
  }

  // CMD --help, in GNU's style.
  function renderUsage(key) {
    var page = MANUAL.PAGES[key];
    var out = ["Usage: " + page.synopsis[0]].concat(page.synopsis.slice(1).map(function (l) { return "  or:  " + l; }));
    out = out.concat(wrap(page.description, 78, 0));
    if (page.options) {
      out.push("");
      page.options.forEach(function (o) { out = out.concat(optionLines("  " + o[0], o[1], 30)); });
    }
    return out.join("\n") + "\n";
  }

  // bash's `help NAME`.
  function renderHelp(name) {
    var h = MANUAL.HELP[name];
    var out = [name + ": " + h.usage, "    " + h.summary];
    if (h.description) out = out.concat(["    "], wrap(h.description, 78, 4));
    if (h.options) {
      out = out.concat(["    ", "    Options:"]);
      h.options.forEach(function (o) { out = out.concat(optionLines("      " + o[0], o[1], 18)); });
    }
    return out.join("\n") + "\n";
  }

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

  // --- find, archives and memory (#67) ------------------------------------------------
  function FindError(message) { this.message = message; }

  // find's expression → a tree: or, and (implied between tests), not, tests
  // and actions. With no action, -print is added, as GNU find does.
  function parseFind(toks, opts, sh) {
    var i = 0;
    function need(name) {
      if (i >= toks.length) throw new FindError("missing argument to `" + name + "'");
      return toks[i++];
    }
    function number(name, v) {
      var m = /^([+-]?)(\d+)$/.exec(v);
      if (!m) throw new FindError("invalid argument `" + v + "' to `" + name + "'");
      return { cmp: m[1], n: +m[2] };
    }
    function primary() {
      var t = toks[i++];
      var v, m;
      if (t === "(") {
        var e = or();
        if (toks[i++] !== ")") throw new FindError("invalid expression; I was expecting to find a ')' somewhere but did not see one.");
        return e;
      }
      switch (t) {
        case "-maxdepth": case "-mindepth":
          v = need(t);
          if (!/^\d+$/.test(v)) throw new FindError("Expected a positive decimal integer argument to " + t + ", but got ‘" + v + "’");
          opts[t.slice(1)] = +v; // global: it applies to the whole search, wherever it's written
          return { t: "true" };
        case "-depth": opts.depth = true; return { t: "true" };
        case "-name": case "-iname": case "-path":
          var re = globRegex(need(t), [], 0, true);
          return { t: t === "-path" ? "path" : "name", re: t === "-iname" ? new RegExp(re.source, "i") : re };
        case "-type":
          v = need(t);
          if (!/^[fdl]$/.test(v)) throw new FindError("Unknown argument to -type: " + v);
          return { t: "type", v: { f: "file", d: "dir", l: "link" }[v] };
        case "-size":
          v = need(t);
          m = /^([+-]?)(\d+)([bcwkMG]?)$/.exec(v);
          if (!m) throw new FindError("invalid argument `" + v + "' to `-size'");
          return { t: "size", cmp: m[1], n: +m[2], unit: { "": 512, b: 512, c: 1, w: 2, k: KiB, M: MiB, G: GiB }[m[3]] };
        case "-mtime": case "-mmin":
          var age = number(t, need(t));
          return { t: "age", cmp: age.cmp, n: age.n, unit: t === "-mtime" ? 86400000 : 60000 };
        case "-newer":
          v = need(t);
          var ref = sh.lookup(v);
          if (ref.error) throw new FindError("‘" + v + "’: " + ref.error);
          return { t: "newer", mtime: ref.node.mtime };
        case "-empty": return { t: "empty" };
        case "-user": return { t: "user", v: need(t) };
        case "-true": return { t: "true" };
        case "-false": return { t: "false" };
        case "-print": opts.hasAction = true; return { t: "print" };
        case "-delete": opts.hasAction = true; opts.depth = true; return { t: "delete" };
        case "-exec": {
          opts.hasAction = true;
          var argv = [];
          while (i < toks.length && toks[i] !== ";" && !(toks[i] === "+" && argv[argv.length - 1] === "{}")) argv.push(toks[i++]);
          if (i >= toks.length || !argv.length) throw new FindError("missing argument to `-exec'");
          if (toks[i++] === ";") return { t: "exec", argv: argv };
          var batch = { argv: argv, paths: [] };
          opts.batches.push(batch);
          return { t: "batch", batch: batch };
        }
      }
      if (t === undefined) throw new FindError("invalid expression");
      if (t[0] === "-") throw new FindError("unknown predicate `" + t + "'");
      throw new FindError("paths must precede expression: `" + t + "'");
    }
    function not() {
      if (toks[i] === "!" || toks[i] === "-not") { i++; return { t: "not", e: not() }; }
      return primary();
    }
    function and() {
      var l = not();
      while (i < toks.length && ["-o", "-or", ")"].indexOf(toks[i]) === -1) {
        if (toks[i] === "-a" || toks[i] === "-and") i++;
        l = { t: "and", l: l, r: not() };
      }
      return l;
    }
    function or() {
      var l = and();
      while (toks[i] === "-o" || toks[i] === "-or") { i++; l = { t: "or", l: l, r: and() }; }
      return l;
    }
    var expr = toks.length ? or() : { t: "true" };
    if (i < toks.length) throw new FindError(toks[i] === ")" ? "invalid expression; you have too many ')'" : "unexpected extra predicate '" + toks[i] + "'");
    return opts.hasAction ? expr : { t: "and", l: expr, r: { t: "print" } };
  }

  function compare(value, test) {
    return test.cmp === "+" ? value > test.n : test.cmp === "-" ? value < test.n : value === test.n;
  }

  // One file against find's expression. -size rounds up to its unit, so
  // -size -1M matches only empty files, as in GNU find.
  function* evalFind(e, f, sh, io, opts) {
    switch (e.t) {
      case "true": return true;
      case "false": return false;
      case "and": return (yield* evalFind(e.l, f, sh, io, opts)) && (yield* evalFind(e.r, f, sh, io, opts));
      case "or": return (yield* evalFind(e.l, f, sh, io, opts)) || (yield* evalFind(e.r, f, sh, io, opts));
      case "not": return !(yield* evalFind(e.e, f, sh, io, opts));
      case "name": return e.re.test(baseName(f.shown.replace(/(.)\/+$/, "$1")));
      case "path": return e.re.test(f.shown);
      case "type": return f.node.type === e.v;
      case "size": return compare(Math.ceil(size(f.node) / e.unit), e);
      case "age": return compare(Math.floor((f.now - f.node.mtime) / e.unit), e);
      case "newer": return f.node.mtime > e.mtime;
      case "empty": return f.node.type === "dir" ? !sh.children(f.path).length : f.node.type === "file" && size(f.node) === 0;
      case "user": return f.node.owner === e.v;
      case "print": io.out.write(f.shown + "\n"); return true;
      case "batch": e.batch.paths.push(f.shown); return true;
      case "delete": {
        var why = f.node.type === "dir" && sh.children(f.path).length ? "Directory not empty" : sh.writableParent(f.path);
        if (why) { io.err.write("find: cannot delete ‘" + f.shown + "’: " + why + "\n"); opts.failed = true; return false; }
        sh.removeTree(f.path);
        return true;
      }
      case "exec": {
        var argv = e.argv.map(function (a) { return a.split("{}").join(f.shown); });
        var r = yield* sh.exec(argv, "", { tty: io.tty, stdin: { text: "", pos: 0 }, out: io.out, err: io.err });
        io.err.write(r.err || "");
        io.out.write(r.out || "");
        return r.code === 0;
      }
    }
    return false;
  }

  // free -h: 1.9Gi, 812Mi, 0B.
  function memHuman(n) {
    if (n < 1024) return n + "B";
    var units = ["Ki", "Mi", "Gi", "Ti"];
    var v = n;
    for (var i = 0; i < units.length; i++) {
      v /= 1024;
      if (v < 1024 || i === units.length - 1) return (v < 10 ? (Math.round(v * 10) / 10).toFixed(1) : String(Math.round(v))) + units[i];
    }
  }

  // Simulated archives: a text file, a header line and then JSON, so a
  // round trip is exact and `cat` shows honestly what it is. Sizes are
  // recorded: tar's 512-byte blocks, and gzip shrinking text to about a
  // quarter, with tar's padding almost free (real ratios vary; this is a
  // teaching model).
  var PACKS = { tar: "ORBIT-TAR 1 (a simulated tar archive: list it with tar -tf)\n", gzip: "ORBIT-GZIP 1 (simulated gzip data: read it with zcat)\n" };
  var MAX_ARCHIVE = 20000; // characters: the most a file can hold and still reach the server
  function pack(kind, data) { return PACKS[kind] + JSON.stringify(data) + "\n"; }
  function unpack(text, kind) {
    if (text.indexOf(PACKS[kind]) !== 0) return null;
    try { return JSON.parse(text.slice(PACKS[kind].length)); } catch (e) { return null; }
  }
  function tarSize(entries) {
    var bytes = 1024;
    entries.forEach(function (e) { bytes += 512 + (e.type === "file" ? Math.ceil(entrySize(e) / 512) * 512 : 0); });
    return Math.ceil(bytes / 10240) * 10240;
  }
  function gzSize(bytes) { return 30 + Math.ceil(bytes / 4); }
  function tgzSize(entries) {
    var data = 0;
    entries.forEach(function (e) { if (e.type === "file") data += entrySize(e); });
    return 30 + 50 * entries.length + Math.ceil(data / 4);
  }
  function entrySize(e) { return e.size !== undefined ? e.size : new TextEncoder().encode(e.contents || "").length; }

  // Write an archive file, recording its size.
  var TOO_BIG = ": too big for the station console's simulated archives (keep under 20 KB of text)";

  // The archive itself can't be opened, to read or to write. With -z, gzip runs
  // as tar's child, and says so.
  function cannotOpen(o, error) {
    var why = o.file + ": Cannot open: " + error.slice(error.lastIndexOf(": ") + 2) + "\n";
    if (o.gzip) return { out: "", err: "tar (child): " + why + "tar (child): Error is not recoverable: exiting now\ntar: Child returned status 2\ntar: Error is not recoverable: exiting now\n", code: 2 };
    return { out: "", err: "tar: " + why + "tar: Error is not recoverable: exiting now\n", code: 2 };
  }

  function writeArchive(sh, path, text, bytes) {
    if (text.length > MAX_ARCHIVE) return path + TOO_BIG;
    var why = sh.writeFile(path, text, false);
    if (why) return why;
    if (path !== "/dev/null") sh.lookup(path).node.size = bytes;
    return null;
  }

  function tarCreate(sh, o) {
    if (!o.names.length) return { out: "", err: "tar: Cowardly refusing to create an empty archive\nTry 'tar --help' or 'tar --usage' for more information.\n", code: 2 };
    var entries = [];
    var out = "", err = "", failed = false, warned = false;
    function add(name, path) {
      var f = sh.lookup(path, true);
      if (f.error) { err += "tar: " + name + ": Cannot stat: " + f.error + "\n"; failed = true; return; }
      var n = f.node;
      if (n.type === "file" && !sh.can(n, 4)) { err += "tar: " + name + ": Cannot open: Permission denied\n"; failed = true; return; }
      var e = { name: n.type === "dir" ? name.replace(/\/*$/, "/") : name, type: n.type, mode: n.mode, owner: n.owner, group: n.group, mtime: isoStamp(n.mtime) };
      if (n.type === "link") e.target = n.target;
      if (n.type === "file") { e.contents = n.contents; if (n.size !== undefined) e.size = n.size; }
      entries.push(e);
      if (o.verbose) out += e.name + "\n";
      if (n.type !== "dir") return;
      if (!sh.can(n, 4) || !sh.can(n, 1)) { err += "tar: " + name + ": Cannot open: Permission denied\n"; failed = true; return; }
      sh.children(f.path).sort(compareNames).forEach(function (c) { add(name.replace(/\/+$/, "") + "/" + c, join(f.path, c)); });
    }
    o.names.forEach(function (name) {
      var member = name;
      if (member.charAt(0) === "/") {
        if (!warned) { err += "tar: Removing leading `/' from member names\n"; warned = true; }
        member = member.replace(/^\/+/, "") || ".";
      }
      add(member, o.dir && name.charAt(0) !== "/" ? o.dir.replace(/\/+$/, "") + "/" + name : name);
    });
    var text = pack("tar", { entries: entries });
    var bytes = tarSize(entries);
    if (o.gzip) {
      text = pack("gzip", { name: baseName(o.file).replace(/\.gz$/, "").replace(/\.tgz$/, ".tar"), mode: 0o664, mtime: isoStamp(sh.now()), size: bytes, contents: text });
      bytes = tgzSize(entries);
    }
    var why = writeArchive(sh, o.file, text, bytes);
    if (why && why.slice(-TOO_BIG.length) === TOO_BIG) return { out: out, err: err + "tar: " + why + "\ntar: Error is not recoverable: exiting now\n", code: 2 };
    // GNU tar opens the archive before it reads a member, so a failed open is all it reports.
    if (why) return cannotOpen(o, why);
    if (failed) err += "tar: Exiting with failure status due to previous errors\n";
    return { out: out, err: err, code: failed ? 2 : 0 };
  }

  function tarRead(sh, o, mode) {
    var r = sh.readFile("tar", o.file);
    if (r.error) return cannotOpen(o, r.error);
    var gz = unpack(r.text, "gzip");
    if (o.gzip && !gz) return { out: "", err: "gzip: stdin: not in gzip format\ntar: Child returned status 1\ntar: Error is not recoverable: exiting now\n", code: 2 };
    var tar = unpack(gz ? gz.contents : r.text, "tar");
    if (!tar) return { out: "", err: "tar: This does not look like a tar archive\ntar: Exiting with failure status due to previous errors\n", code: 2 };
    var wanted = o.names.map(function (n) { return n.replace(/\/+$/, ""); });
    var found = {};
    var picked = tar.entries.filter(function (e) {
      if (!wanted.length) return true;
      var name = e.name.replace(/\/+$/, "");
      return wanted.some(function (w) { var hit = name === w || name.indexOf(w + "/") === 0; if (hit) found[w] = true; return hit; });
    });
    var out = "", err = "", failed = false;
    if (mode === "t") {
      picked.forEach(function (e) {
        if (!o.verbose) { out += e.name + "\n"; return; }
        var ug = e.owner + "/" + e.group;
        var bytes = e.type === "file" ? entrySize(e) : 0;
        out += modeString(e) + " " + ug + " " + padLeft(bytes, Math.max(1, 19 - ug.length)) + " " + isoStamp(parseStamp(e.mtime)).replace("T", " ").slice(0, 16) +
          " " + e.name + (e.type === "link" ? " -> " + e.target : "") + "\n";
      });
    } else {
      var base = o.dir ? sh.lookup(o.dir) : { path: sh.cwd, node: sh.fs[sh.cwd] };
      if (!base.node || base.node.type !== "dir") return { out: "", err: "tar: " + o.dir + ": Cannot open: No such file or directory\ntar: Error is not recoverable: exiting now\n", code: 2 };
      picked.forEach(function (e) {
        var name = e.name.replace(/\/+$/, "");
        var path = normalize(base.path + "/" + name);
        // Directories on the way that the archive doesn't list are made too.
        for (var dir = parentOf(path), chain = []; !sh.fs[dir]; dir = parentOf(dir)) chain.unshift(dir);
        for (var c = 0; c < chain.length; c++) {
          var whyDir = sh.writableParent(chain[c]);
          if (whyDir) { err += "tar: " + name + ": Cannot mkdir: " + whyDir + "\n"; failed = true; return; }
          sh.create(chain[c], "dir");
        }
        var existing = sh.lookup(path, true);
        if (e.type === "dir" && existing.node && existing.node.type === "dir") return;
        var why = sh.writableParent(path);
        if (why) { err += "tar: " + name + ": Cannot open: " + why + "\n"; failed = true; return; }
        if (existing.node && existing.node.type === "dir") { err += "tar: " + name + ": Cannot open: Is a directory\n"; failed = true; return; }
        if (existing.node) delete sh.fs[path];
        var node = sh.create(path, e.type === "dir" ? "dir" : "file", e.contents || "");
        node.mode = sh.user === "root" ? e.mode : e.mode & ~UMASK; // tar applies your umask, unless you're root
        node.mtime = parseStamp(e.mtime); // and puts the time back
        if (e.size !== undefined) node.size = e.size;
        if (e.type === "link") { node.type = "link"; node.target = e.target; node.mode = 0o777; }
        if (o.verbose) out += e.name + "\n";
      });
    }
    wanted.forEach(function (w) { if (!found[w]) { err += "tar: " + w + ": Not found in archive\n"; failed = true; } });
    if (failed) err += "tar: Exiting with failure status due to previous errors\n";
    return { out: out, err: err, code: failed ? 2 : 0 };
  }

  function gzipFiles(sh, p) {
    var err = "", code = 0;
    p.args.forEach(function (a) {
      var f = sh.lookup(a, true);
      if (f.error) { err += "gzip: " + a + ": " + f.error + "\n"; code = 1; return; }
      if (f.node.type !== "file") { err += "gzip: " + a + (f.node.type === "dir" ? " is a directory -- ignored\n" : ": Too many levels of symbolic links\n"); code = code || 2; return; }
      if (/\.gz$/.test(a)) { err += "gzip: " + a + " already has .gz suffix -- unchanged\n"; code = code || 2; return; }
      if (!sh.can(f.node, 4)) { err += "gzip: " + a + ": Permission denied\n"; code = 1; return; }
      if (!sh.lookup(a + ".gz", true).error) { err += "gzip: " + a + ".gz already exists; not overwritten\n"; code = code || 2; return; }
      var why = sh.writableParent(f.path);
      if (why) { err += "gzip: " + a + ".gz: " + why + "\n"; code = 1; return; }
      var n = f.node;
      var bytes = size(n);
      why = writeArchive(sh, a + ".gz", pack("gzip", { name: baseName(f.path), mode: n.mode, mtime: isoStamp(n.mtime), size: bytes, contents: n.contents }), gzSize(bytes));
      if (why) { err += "gzip: " + why + "\n"; code = 1; return; }
      var gz = sh.lookup(a + ".gz").node;
      gz.mode = n.mode; // gzip keeps the mode and the time
      gz.mtime = n.mtime;
      if (!p.opts.k) delete sh.fs[f.path];
    });
    return { out: "", err: err, code: code };
  }

  function gunzipFiles(sh, cmd, p) {
    var err = "", code = 0;
    p.args.forEach(function (a) {
      var m = /^(.*)\.(gz|tgz)$/.exec(a);
      if (!m) { err += "gzip: " + a + ": unknown suffix -- ignored\n"; code = code || 2; return; }
      var r = sh.readFile("gzip", a);
      if (r.error) { err += r.error + "\n"; code = 1; return; }
      var data = unpack(r.text, "gzip");
      if (!data) { err += "gzip: " + a + ": not in gzip format\n"; code = 1; return; }
      var to = m[2] === "tgz" ? m[1] + ".tar" : m[1];
      if (!sh.lookup(to, true).error) { err += "gzip: " + to + " already exists; not overwritten\n"; code = code || 2; return; }
      var why = sh.writeFile(to, data.contents, false);
      if (why) { err += "gzip: " + why + "\n"; code = 1; return; }
      var node = sh.lookup(to).node;
      node.mode = data.mode;
      node.mtime = parseStamp(data.mtime);
      if (data.size !== new TextEncoder().encode(data.contents).length) node.size = data.size;
      if (!p.opts.k) delete sh.fs[sh.lookup(a, true).path];
    });
    return { out: "", err: err, code: code };
  }

  // --- the commands ---------------------------------------------------------------
  var COMMANDS = {
    help: function (args) {
      if (args.length) {
        var out = "", err = "";
        args.forEach(function (n) {
          if (MANUAL.HELP[n]) out += renderHelp(n);
          else err += "bash: help: no help topics match `" + n + "'.  Try `help help' or `man -k " + n + "' or `info " + n + "'.\n";
        });
        return { out: out, err: err, code: err ? 1 : 0 };
      }
      return ok(
        "Station console commands:\n" +
        "  files:     pwd cd ls cat echo touch mkdir rmdir cp mv rm chmod chown stat\n" +
        "  text:      grep wc sort uniq head tail cut tee awk sed (small subsets)\n" +
        "  users:     whoami id groups getent sudo usermod\n" +
        "  env:       export unset env printenv type which command source bash\n" +
        "  processes: ps pgrep pkill kill sleep jobs fg bg\n" +
        "  editing:   nano less man crontab\n" +
        "  disk:      find du df free tar gzip gunzip zcat ln readlink\n" +
        "  network:   ip ss ping nc hostname dig host curl ufw ssh\n" +
        "  console:   clear help exit\n" +
        "  scripts:   if/elif/else, for, while/until, case, break continue, test [ ] [[ ]], read\n" +
        "  robust:    name() { … }, local return shift, set -euo pipefail, trap, <<EOF, mktemp\n" +
        "Pipes (|), redirection (> >> < 2> 2>&1 >&2 &>), globs (* ? [...]), {a,b}, ; && ||, $VARS, $(command) and $((1 + 2)) work.\n" +
        "Tab completes paths; ↑ and ↓ walk your history; Ctrl-C abandons a line.\n" +
        "Read about a command with `man CMD` or `CMD --help`, and about a builtin with `help NAME`.\n"
      );
    },
    clear: function () { return { out: "", err: "", code: 0, clear: true }; },
    // nano FILE: the console opens its editor (a Nano, below) in the panel
    // and comes back here when it closes.
    nano: function* (args, stdin, io) {
      if (!args.length || args[0][0] === "-") return { out: "", err: "nano: give it a file to edit: nano FILE (its options aren't on this console)\n", code: 1 };
      if (!io.tty || !io.stdin.tty) return { out: "", err: "nano: the editor needs the console's screen; it can't run in a pipe or a $( )\n", code: 1 };
      var name = args[0];
      var sh = this;
      var found = this.lookup(name);
      var text = "", message;
      if (found.node && found.node.type === "dir") message = '[ "' + name + '" is a directory ]';
      else if (found.node && !this.can(found.node, 4)) message = "[ Error reading " + name + ": Permission denied ]";
      else if (found.node) { text = found.node.contents; message = "[ Read " + countLines(text) + " line" + (countLines(text) === 1 ? "" : "s") + " ]"; }
      else if (found.error === "No such file or directory") message = "[ New File ]";
      else message = "[ Error reading " + name + ": " + found.error + " ]";
      var editor = new Nano({
        name: name,
        text: text,
        message: message,
        save: function (body) {
          var why = sh.writeFile(name, body, false);
          return why ? { ok: false, message: "[ Error writing " + name + ": " + why.slice(why.lastIndexOf(": ") + 2) + " ]" } : { ok: true };
        },
      });
      yield { editor: editor };
      return ok();
    },
    // find PATH... [EXPRESSION] (#67): tests -name -iname -path -type -size
    // -mtime -mmin -newer -empty -user, operators ! -not -a -o ( ), actions
    // -print -delete -exec, and -maxdepth/-mindepth. Like GNU find (-P), it
    // never follows links. Output is written as it goes, so -exec's output
    // lands in order.
    find: function* (args, stdin, io) {
      var sh = this;
      var paths = [];
      var i = 0;
      while (i < args.length && args[i][0] !== "-" && args[i] !== "(" && args[i] !== "!") paths.push(args[i++]);
      if (!paths.length) paths = ["."];
      var expr;
      var opts = { maxdepth: Infinity, mindepth: 0, depth: false, hasAction: false, batches: [] };
      try {
        expr = parseFind(args.slice(i), opts, this);
      } catch (e) {
        if (!(e instanceof FindError)) throw e;
        return { out: "", err: "find: " + e.message + "\n", code: 1 };
      }
      var failed = false;
      var now = this.now();
      function* visit(shown, path, node, depth) {
        var here = depth >= opts.mindepth ? function* () { return yield* evalFind(expr, { shown: shown, path: path, node: node, now: now }, sh, io, opts); } : null;
        if (!opts.depth && here) yield* here(); // a directory is listed before find finds it can't be read
        var kids = [];
        if (node.type === "dir" && depth < opts.maxdepth) {
          if (!sh.can(node, 4) || !sh.can(node, 1)) { io.err.write("find: ‘" + shown + "’: Permission denied\n"); failed = true; }
          else kids = sh.children(path).sort(compareNames);
        }
        for (var k = 0; k < kids.length; k++) {
          var childPath = join(path, kids[k]);
          if (!sh.fs[childPath]) continue; // gone already (-delete, -exec rm)
          yield* visit(shown === "/" ? "/" + kids[k] : shown.replace(/\/+$/, "") + "/" + kids[k], childPath, sh.fs[childPath], depth + 1);
        }
        if (opts.depth && here && sh.fs[path]) yield* here();
      }
      for (var p = 0; p < paths.length; p++) {
        var start = this.lookup(paths[p], true);
        if (start.error) { io.err.write("find: ‘" + paths[p] + "’: " + start.error + "\n"); failed = true; continue; }
        yield* visit(paths[p], start.path, start.node, 0);
      }
      // -exec … {} + runs once, at the end, with every path.
      for (var b = 0; b < opts.batches.length; b++) {
        var batch = opts.batches[b];
        if (!batch.paths.length) continue;
        var argv = [];
        batch.argv.forEach(function (a) { if (a === "{}") Array.prototype.push.apply(argv, batch.paths); else argv.push(a); });
        var r = yield* sh.exec(argv, "", { tty: io.tty, stdin: { text: "", pos: 0 }, out: io.out, err: io.err });
        io.err.write(r.err || "");
        io.out.write(r.out || "");
        if (r.code) failed = true;
      }
      if (opts.failed) failed = true;
      return { out: "", err: "", code: failed ? 1 : 0 };
    },

    // du [-s] [-h] [-a] [-c] [-d N | --max-depth=N] [PATH]...: disk usage in
    // whole 4K blocks, counted in 1K units, deepest directories first.
    du: function (rawArgs) {
      var args = [];
      var depthArg = null;
      for (var k = 0; k < rawArgs.length; k++) {
        var m = /^--max-depth=(\d+)$/.exec(rawArgs[k]);
        if (m) depthArg = +m[1];
        else if (rawArgs[k] === "-d") depthArg = +rawArgs[++k];
        else args.push(rawArgs[k]);
      }
      var p = flags("du", args, "shac");
      var o = p.opts;
      var maxDepth = o.s ? 0 : depthArg === null ? Infinity : depthArg;
      if (isNaN(maxDepth)) throw new Error("invalid maximum depth");
      var sh = this;
      var out = "", err = "", grand = 0;
      var fmt = function (bytes) { return o.h ? (bytes ? human(bytes) : "0") : String(Math.ceil(bytes / 1024)); };
      function walk(shown, path, node, depth) {
        var total = usage(node);
        if (node.type === "dir") {
          if (!sh.can(node, 4) || !sh.can(node, 1)) err += "du: cannot read directory '" + shown + "': Permission denied\n";
          else {
            sh.children(path).sort(compareNames).forEach(function (n) {
              var childPath = join(path, n);
              total += walk(shown.replace(/\/+$/, "") + "/" + n, childPath, sh.fs[childPath], depth + 1);
            });
          }
        }
        if (depth <= maxDepth && (node.type === "dir" || o.a || depth === 0)) out += fmt(total) + "\t" + shown + "\n";
        return total;
      }
      (p.args.length ? p.args : ["."]).forEach(function (a) {
        var f = sh.lookup(a, true);
        if (f.error) { err += "du: cannot access '" + a + "': " + f.error + "\n"; return; }
        grand += walk(a, f.path, f.node, 0);
      });
      if (o.c) out += fmt(grand) + "\ttotal\n";
      return { out: out, err: err, code: err ? 1 : 0 };
    },

    // df [-h] [PATH]: one drive, the exercise's size; used is what the
    // system takes plus every file on it, so deleting files frees space.
    df: function (rawArgs) {
      var p = flags("df", rawArgs, "hT");
      var sh = this;
      var bad = p.args.filter(function (a) { return sh.lookup(a).error; });
      if (bad.length) return { out: "", err: bad.map(function (a) { return "df: " + a + ": No such file or directory\n"; }).join(""), code: 1 };
      var used = this.disk.base;
      Object.keys(this.fs).forEach(function (q) { used += usage(sh.fs[q]); });
      used = Math.min(used, this.disk.size);
      var avail = this.disk.size - used;
      var pct = Math.ceil((used / this.disk.size) * 100) + "%";
      if (p.opts.h) {
        return ok("Filesystem      Size  Used Avail Use% Mounted on\n" +
          padRight("/dev/vda1", 15) + padLeft(human(this.disk.size), 5) + padLeft(human(used), 6) + padLeft(human(avail), 6) + padLeft(pct, 5) + " /\n");
      }
      var k = function (n) { return String(Math.ceil(n / 1024)); };
      return ok("Filesystem     1K-blocks    Used Available Use% Mounted on\n" +
        padRight("/dev/vda1", 14) + padLeft(k(this.disk.size), 10) + padLeft(k(used), 8) + padLeft(k(avail), 10) + padLeft(pct, 5) + " /\n");
    },

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

    // tar -c|-x|-t [-z] [-v] -f ARCHIVE [-C DIR] [PATH]...: archives are
    // simulated (a file recording what's in it), so they round-trip exactly.
    tar: function (rawArgs) {
      var o = { names: [] };
      var letters = [];
      var rest = [];
      rawArgs.forEach(function (a, k) {
        if (k === 0 && /^[a-zA-Z]+$/.test(a)) letters.push.apply(letters, a.split("")); // old style: tar czf …
        else if (/^-[a-zA-Z]+$/.test(a)) letters.push.apply(letters, a.slice(1).split(""));
        else if (/^--/.test(a)) letters.push("--" + a);
        else rest.push(a);
      });
      var mode = null;
      for (var k = 0; k < letters.length; k++) {
        var l = letters[k];
        if (l === "c" || l === "x" || l === "t") {
          if (mode && mode !== l) return { out: "", err: "tar: You may not specify more than one '-Acdtrux', '--delete' or  '--test-label' option\nTry 'tar --help' or 'tar --usage' for more information.\n", code: 2 };
          mode = l;
        } else if (l === "z") o.gzip = true;
        else if (l === "v") o.verbose = true;
        else if (l === "f") { if (!rest.length) return { out: "", err: "tar: option requires an argument -- 'f'\n", code: 2 }; o.file = rest.shift(); }
        else if (l === "C") { if (!rest.length) return { out: "", err: "tar: option requires an argument -- 'C'\n", code: 2 }; o.dir = rest.shift(); }
        else return { out: "", err: "tar: unsupported on the station console: " + (l.indexOf("--") === 0 ? l.slice(2) : "-" + l) + " (it knows -c -x -t -z -v -f -C)\n", code: 2 };
      }
      o.names = rest;
      if (!mode) return { out: "", err: "tar: You must specify one of the '-Acdtrux', '--delete' or '--test-label' options\nTry 'tar --help' or 'tar --usage' for more information.\n", code: 2 };
      if (!o.file) return { out: "", err: "tar: Refusing to " + (mode === "c" ? "write archive contents to" : "read archive contents from") + " terminal (missing -f option?)\ntar: Error is not recoverable: exiting now\n", code: 2 };
      return mode === "c" ? tarCreate(this, o) : tarRead(this, o, mode);
    },
    gzip: function (rawArgs) {
      var p = flags("gzip", rawArgs, "dk");
      return p.opts.d ? gunzipFiles(this, "gzip", p) : gzipFiles(this, p);
    },
    gunzip: function (rawArgs) { return gunzipFiles(this, "gunzip", flags("gunzip", rawArgs, "k")); },
    zcat: function (args) {
      var sh = this;
      var out = "", err = "";
      args.forEach(function (a) {
        var r = sh.readFile("zcat", a);
        if (r.error) { err += r.error.replace(/^zcat: /, "gzip: ") + "\n"; return; }
        var inner = unpack(r.text, "gzip");
        if (!inner) { err += "gzip: " + a + ": not in gzip format\n"; return; }
        out += inner.contents;
      });
      return { out: out, err: err, code: err ? 1 : 0 };
    },

    // ln -s [-f] TARGET [LINK], or ln -s TARGET... DIR. Only symbolic links:
    // the console's files have no inodes to share.
    ln: function (rawArgs) {
      var p = flags("ln", rawArgs, "sfnv");
      if (!p.opts.s) return { out: "", err: "ln: hard links aren't on the station console; make a symbolic one with ln -s TARGET NAME\n", code: 1 };
      if (!p.args.length) throw new Error("missing file operand");
      var sh = this;
      var targets = p.args.length === 1 ? p.args : p.args.slice(0, -1);
      var where = p.args.length === 1 ? "." : p.args[p.args.length - 1];
      var dest = this.lookup(where);
      var intoDir = dest.node && dest.node.type === "dir" && !(p.opts.n && this.lookup(where, true).node.type === "link");
      if (targets.length > 1 && !intoDir) return { out: "", err: "ln: target '" + where + "': " + (dest.node ? "Not a directory" : "No such file or directory") + "\n", code: 1 };
      var err = "", out = "";
      targets.forEach(function (target) {
        var name = intoDir ? join(dest.path, baseName(target.replace(/\/+$/, "")) || target) : sh.lookup(where, true).path;
        var shown = intoDir ? (where === "." ? baseName(name) : where.replace(/\/+$/, "") + "/" + baseName(name)) : where;
        var existing = sh.lookup(name, true);
        if (existing.node) {
          if (!p.opts.f) { err += "ln: failed to create symbolic link '" + shown + "': File exists\n"; return; }
          if (existing.node.type === "dir") { err += "ln: " + shown + ": cannot overwrite directory\n"; return; }
        }
        var why = sh.writableParent(existing.path);
        if (why) { err += "ln: failed to create symbolic link '" + shown + "': " + why + "\n"; return; }
        if (existing.node) delete sh.fs[existing.path];
        var link = sh.create(existing.path, "file");
        link.type = "link";
        link.target = target;
        link.mode = 0o777;
        link.contents = "";
        if (p.opts.v) out += "'" + shown + "' -> '" + target + "'\n";
      });
      return { out: out, err: err, code: err ? 1 : 0 };
    },
    // readlink LINK: where it points. -f: the real path, every link followed.
    readlink: function (rawArgs) {
      var p = flags("readlink", rawArgs, "fe");
      if (!p.args.length) throw new Error("missing operand");
      var sh = this;
      var out = "";
      var code = 0;
      p.args.forEach(function (a) {
        if (p.opts.f || p.opts.e) {
          var f = sh.lookup(a);
          var ok_ = f.node || (!p.opts.e && f.error === "No such file or directory" && sh.lookup(parentOf(f.path)).node);
          if (ok_) out += f.path + "\n"; else code = 1;
          return;
        }
        var l = sh.lookup(a, true);
        if (l.node && l.node.type === "link") out += l.node.target + "\n"; else code = 1;
      });
      return { out: out, err: "", code: code };
    },
    // stat -c FORMAT [-L] FILE... (#206): a file's mode as a number and as letters, as GNU
    // coreutils 9.4 prints them. The plain form (inodes, devices, nanosecond times) isn't here.
    stat: function (args) {
      var usage = "Try 'stat --help' for more information.\n";
      var format = null, follow = false, files = [];
      for (var i = 0; i < args.length; i++) {
        var a = args[i];
        if (a === "--") { files = files.concat(args.slice(i + 1)); break; }
        if (a === "-L" || a === "--dereference") follow = true;
        else if (a.indexOf("--format=") === 0) format = a.slice(9);
        else if (a === "--format" || a === "-c") {
          if (i + 1 >= args.length) return { out: "", err: (a === "-c" ? "stat: option requires an argument -- 'c'\n" : "stat: option '--format' requires an argument\n") + usage, code: 1 };
          format = args[++i];
        } else if (/^-c./.test(a)) format = a.slice(2);
        else if (/^-L+$/.test(a)) follow = true;
        else if (a.length > 1 && a[0] === "-") return { out: "", err: (a[1] === "-" ? "stat: unrecognized option '" + a + "'\n" : "stat: invalid option -- '" + a[1] + "'\n") + usage, code: 1 };
        else files.push(a);
      }
      if (!files.length) return { out: "", err: "stat: missing operand\n" + usage, code: 1 };
      if (format === null) return { out: "", err: "stat: unsupported on the station console: plain stat (devices, inodes and times); try stat -c '%a %A %n' FILE\n", code: 1 };
      var sh = this, out = "", err = "", code = 0;
      files.forEach(function (name) {
        var f = sh.lookup(name, !follow);
        if (f.error) { err += "stat: cannot statx '" + name + "': " + f.error + "\n"; code = 1; return; }
        var n = f.node;
        var mode = n.type === "link" ? 0o777 : n.mode & 0o7777;
        out += format.replace(/%(.)?/g, function (m, c) {
          switch (c) {
            case "a": return mode.toString(8);
            case "A": return modeString(n.type === "link" ? Object.assign({}, n, { mode: 0o777 }) : n);
            case "n": return name;
            case "U": return n.owner;
            case "G": return n.group;
            case "s": return String(size(n));
            case "F": return n.type === "dir" ? "directory" : n.type === "link" ? "symbolic link" : size(n) ? "regular file" : "regular empty file";
            case "%": return "%";
            case undefined: return "%";
            default: return "?";
          }
        }) + "\n";
      });
      return { out: out, err: err, code: code };
    },
    vi: function () { return { out: "", err: "vi: not on this console. Use nano FILE instead: ^O saves, ^X exits.\n", code: 127 }; },
    vim: function () { return { out: "", err: "vim: not on this console. Use nano FILE instead: ^O saves, ^X exits.\n", code: 127 }; },

    // man [SECTION] PAGE: the page in the pager; plain text into a pipe.
    man: function* (args, stdin, io) {
      args = args.slice();
      var section = /^[1-8]$/.test(args[0] || "") && args.length > 1 ? args.shift() : null;
      if (!args.length) return { out: "", err: "What manual page do you want?\nFor example, try 'man man'.\n", code: 1 };
      var out = "", err = "";
      for (var i = 0; i < args.length; i++) {
        var found = manFile(this.fs, args[i], section);
        if (!found) { err += "No manual entry for " + args[i] + (section ? " in section " + section : "") + "\n"; continue; }
        var text, title;
        if (found.key) {
          var page = MANUAL.PAGES[found.key];
          text = renderMan(found.key);
          title = (page.name || found.key) + "(" + (page.section || 1) + ")";
        } else {
          var r = this.readFile("man", found.path);
          if (r.error) { err += r.error + "\n"; continue; }
          text = r.text;
          title = found.title;
        }
        if (!io.tty) { out += text; continue; }
        yield { pager: new Pager({ text: text, name: title, man: true }) };
      }
      return { out: out, err: err, code: err ? 16 : 0 };
    },
    less: function* (args, stdin, io) { return yield* page.call(this, "less", args, stdin, io); },
    more: function* (args, stdin, io) { return yield* page.call(this, "more", args, stdin, io); },

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
    // set: shell options (-e -u -x, -o pipefail and the long names), and
    // `set -- args` for the positional parameters (#65).
    set: function (args) {
      var sh = this;
      var NAMES = { errexit: "e", nounset: "u", xtrace: "x", pipefail: "pipefail" };
      if (!args.length) {
        return ok(unlines(Object.keys(this.vars).sort().map(function (k) { return k + "=" + quoteWord(sh.vars[k]); })));
      }
      for (var i = 0; i < args.length; i++) {
        var a = args[i];
        if (a === "--" || a === "-") { this.args = args.slice(i + 1); return ok(); }
        if (!/^[-+]./.test(a)) { this.args = args.slice(i); return ok(); }
        var on = a[0] === "-";
        for (var j = 1; j < a.length; j++) {
          var c = a[j];
          if (c === "o") {
            var name = args[i + 1];
            if (name === undefined) {
              return ok(unlines(Object.keys(NAMES).sort().map(function (n) { return padRight(n, 15) + "\t" + (sh.opts[NAMES[n]] ? "on" : "off"); })));
            }
            i++;
            if (!NAMES[name]) return { out: "", err: "bash: set: " + name + ": invalid option name\n", code: 2 };
            this.opts[NAMES[name]] = on;
          } else if ("eux".indexOf(c) !== -1) this.opts[c] = on;
          else return { out: "", err: "bash: set: " + a[0] + c + ": invalid option\nset: usage: set [-abefhkmnptuvxBCEHPT] [-o option-name] [--] [-] [arg ...]\n", code: 2 };
        }
      }
      return ok();
    },
    local: function (args) {
      if (!this.frames.length) return { out: "", err: "bash: local: can only be used in a function\n", code: 1 };
      var frame = this.frames[this.frames.length - 1];
      var err = "";
      var sh = this;
      args.forEach(function (a) {
        var m = /^([A-Za-z_][A-Za-z0-9_]*)(?:=([\s\S]*))?$/.exec(a);
        if (!m) { err += "bash: local: `" + a + "': not a valid identifier\n"; return; }
        if (!Object.prototype.hasOwnProperty.call(frame, m[1])) frame[m[1]] = [sh.vars[m[1]], sh.exported[m[1]]];
        if (m[2] !== undefined) sh.setVar(m[1], m[2]);
        else delete sh.vars[m[1]];
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    return: function (args) {
      if (!this.funcDepth && !this.sourceDepth) return { out: "", err: "bash: return: can only `return' from a function or sourced script\n", code: 2 };
      var n = args.length ? args[0] : String(this.lastStatus);
      this.returning = true;
      if (!/^-?\d+$/.test(n)) { this.returnCode = 2; return { out: "", err: "bash: return: " + n + ": numeric argument required\n", code: 2 }; }
      this.returnCode = ((+n % 256) + 256) % 256;
      return { out: "", err: "", code: this.returnCode };
    },
    shift: function (args) {
      var n = args.length ? args[0] : "1";
      if (!/^\d+$/.test(n)) return { out: "", err: "bash: shift: " + n + ": numeric argument required\n", code: 1 };
      var list = this.args || [];
      if (+n > list.length) return { out: "", err: "", code: 1 };
      this.args = list.slice(+n);
      return ok();
    },
    // trap 'commands' SIGNAL…: EXIT runs when a script ends, however it ends;
    // INT when Ctrl-C interrupts it. trap - SIGNAL removes one; trap lists them.
    trap: function (args) {
      var sh = this;
      var list = function (names) {
        return ok(unlines(names.filter(function (n) { return sh.traps[n] !== undefined; }).map(function (n) {
          return "trap -- " + quoteWord(sh.traps[n], true) + " " + n;
        })));
      };
      if (!args.length || args[0] === "-p") return list(args.length > 1 ? args.slice(1).map(trapName) : ["EXIT", "HUP", "INT", "TERM"]);
      if (args.length === 1) return { out: "", err: "trap: usage: trap [-lp] [[arg] signal_spec ...]\n", code: 2 };
      var err = "";
      args.slice(1).forEach(function (spec) {
        var sig = trapName(spec);
        if (sig === "ERR") { err += "bash: trap: unsupported on the station console: ERR traps\n"; return; }
        if (!sig) { err += "bash: trap: " + spec + ": invalid signal specification\n"; return; }
        if (args[0] === "-") delete sh.traps[sig];
        else sh.traps[sig] = args[0];
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    // mktemp [-d] [TEMPLATE]: a new, private file (600) or directory (700),
    // in /tmp by default; the X's become random characters.
    mktemp: function (rawArgs) {
      var p = flags("mktemp", rawArgs, "dt");
      var template = p.args[0] || "tmp.XXXXXXXXXX";
      if (!/XXX$/.test(template)) return { out: "", err: "mktemp: too few X's in template ‘" + template + "’\n", code: 1 };
      var shown = !p.args.length || p.opts.t ? "/tmp/" + template : template;
      if (!this.fs["/tmp"]) this.fs["/tmp"] = { type: "dir", mode: 0o1777, owner: "root", group: "root", contents: "", mtime: this.now() };
      var CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      for (var tries = 0; tries < 100; tries++) {
        var name = shown.replace(/X+$/, function (xs) {
          var out = "";
          for (var k = 0; k < xs.length; k++) out += CHARS[Math.floor(Math.random() * CHARS.length)];
          return out;
        });
        var f = this.lookup(name, true);
        if (f.node) continue;
        var why = f.error === "No such file or directory" ? this.writableParent(f.path) : f.error;
        if (why) return { out: "", err: "mktemp: failed to create " + (p.opts.d ? "directory" : "file") + " via template ‘" + shown + "’: " + why + "\n", code: 1 };
        this.create(f.path, p.opts.d ? "dir" : "file").mode = p.opts.d ? 0o700 : 0o600;
        return ok(name + "\n");
      }
      return { out: "", err: "mktemp: failed to create file via template ‘" + shown + "’: File exists\n", code: 1 };
    },
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
    // unset NAME: the variable, or if there's none, the function (as bash);
    // -v and -f choose.
    unset: function (args) {
      var sh = this;
      var only = args[0] === "-f" || args[0] === "-v" ? args.shift() : null;
      args.forEach(function (a) {
        if (only === "-f" || (!only && !(a in sh.vars) && sh.funcs[a])) delete sh.funcs[a];
        else { delete sh.vars[a]; delete sh.exported[a]; }
      });
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
        if (sh.funcs[n]) lines_.push(p.opts.t ? "function" : n + " is a function");
        else if (KEYWORDS.indexOf(n) !== -1) lines_.push(p.opts.t ? "keyword" : n + " is a shell keyword");
        else if (BUILTINS.indexOf(n) !== -1) lines_.push(p.opts.t ? "builtin" : n + " is a shell builtin");
        if (!lines_.length || p.opts.a) {
          sh.which(n, true).slice(0, p.opts.a ? 99 : 1).forEach(function (path) { lines_.push(p.opts.t ? "file" : n + " is " + path); });
        }
        if (!lines_.length) err += p.opts.t ? "\0" : "bash: type: " + n + ": not found\n"; // -t: silent, just status 1
        else out += unlines(p.opts.a ? lines_ : lines_.slice(0, 1));
      });
      return { out: out, err: err.replace(/\0/g, ""), code: err ? 1 : 0 };
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
      // `return` leaves a sourced file, as it leaves a function.
      this.sourceDepth += 1;
      try {
        var code = yield* this.runScript(r.text, args[0], io);
        if (this.returning) { code = this.returnCode; this.returning = false; }
        return { out: "", err: "", code: code };
      } finally {
        this.sourceDepth -= 1;
      }
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
        // ls -l shows a link itself; plain ls follows a link to a directory.
        var f = sh.lookup(a, true);
        if (f.node && f.node.type === "link" && !o.l && !o.d) {
          var to = sh.lookup(a);
          if (to.node && to.node.type === "dir") f = to;
        }
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
          var name = e.node.type === "link" ? e.name + " -> " + e.node.target : e.name;
          return [modeString(e.node), links(e.node, path), e.node.owner, e.node.group, o.h ? human(bytes) : bytes, stamp(e.node.mtime, sh.now()), name];
        });
        var w = [0, 0, 0, 0, 0];
        rows.forEach(function (r) { for (var k = 0; k < 5; k++) w[k] = Math.max(w[k], String(r[k]).length); });
        return unlines(rows.map(function (r) {
          return [r[0], padLeft(r[1], w[1]), padRight(r[2], w[2]), padRight(r[3], w[3]), padLeft(r[4], w[4]), r[5], r[6]].join(" ");
        }));
      }
      function total(list) {
        var blocks = 0;
        list.forEach(function (e) { blocks += usage(e.node) / 1024; });
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
          else f.node.mtime = sh.now();
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
        var f = sh.lookup(a, true);
        if (f.error) { err += "rmdir: failed to remove '" + a + "': " + f.error + "\n"; return; }
        if (f.node.type !== "dir") { err += "rmdir: failed to remove '" + a + "': Not a directory\n"; return; }
        if (sh.children(f.path).length) { err += "rmdir: failed to remove '" + a + "': Directory not empty\n"; return; }
        var why = sh.writableParent(f.path);
        if (why) { err += "rmdir: failed to remove '" + a + "': " + why + "\n"; return; }
        delete sh.fs[f.path];
      });
      return { out: "", err: err, code: err ? 1 : 0 };
    },
    // rm [-r] [-f] [-i] FILE...: -i asks before each removal, in GNU's words (#101).
    rm: function* (rawArgs, stdin, io) {
      var p = flags("rm", rawArgs, "rfRi");
      var recursive = p.opts.r || p.opts.R;
      var asking = lastOf(rawArgs, "fi") === "i";
      if (!p.args.length && !p.opts.f) throw new Error("missing operand");
      var out = { err: "" };
      for (var i = 0; i < p.args.length; i++) {
        var a = p.args[i];
        var f = this.lookup(a, true);
        if (f.error) { if (!p.opts.f || f.error !== "No such file or directory") out.err += "rm: cannot remove '" + a + "': " + f.error + "\n"; continue; }
        if (f.path === "/") { out.err += "rm: it is dangerous to operate recursively on '/'\n"; continue; }
        if (f.node.type === "dir" && !recursive) { out.err += "rm: cannot remove '" + a + "': Is a directory\n"; continue; }
        var why = this.writableParent(f.path);
        if (why) { out.err += "rm: cannot remove '" + a + "': " + why + "\n"; continue; }
        if (!asking) { this.removeTree(f.path); continue; }
        yield* this.removeAsking(f.path, a, io, out);
      }
      return { out: "", err: out.err, code: out.err ? 1 : 0 };
    },
    cp: function* (rawArgs, stdin, io) {
      var p = flags("cp", rawArgs, "rRai");
      var recursive = p.opts.r || p.opts.R || p.opts.a;
      return yield* this.transfer("cp", p.args, recursive, false, p.opts.i ? io : null);
    },
    mv: function* (rawArgs, stdin, io) {
      var p = flags("mv", rawArgs, "fi");
      return yield* this.transfer("mv", p.args, true, true, lastOf(rawArgs, "fi") === "i" ? io : null);
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
      found.node.mtime = sh.now();
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

  // --- the station network (#164) -------------------------------------------------------
  // The console's interfaces, its own sockets and the other hosts come from the
  // exercise's `network:` (app/content/schema.py NetworkSpec). Nothing real is
  // touched: ip, ss, ping and nc read this, and print what Ubuntu 24.04's do
  // (iproute2 6.1, iputils 20240117, OpenBSD netcat 1.226), checked against
  // the real ones. DEFAULT_NETWORK is NetworkSpec's defaults; a test keeps
  // them equal.
  var DEFAULT_NETWORK = {"interfaces": [{"name": "eth0", "address": "10.4.0.12/24"}], "gateway": "10.4.0.1", "listening": [], "connections": [], "hosts": [], "dns": {"server": null, "records": []}, "firewall": {"enabled": false, "rules": []}};
  var HOSTNAME_ADDRESS = "127.0.1.1"; // the console's own name, as Ubuntu's /etc/hosts has it

  // Port names, as /etc/services on Ubuntu 24.04 has them (ss without -n, nc's [tcp/NAME]).
  var SERVICES = {
    tcp: "1 tcpmux 7 echo 9 discard 11 systat 13 daytime 15 netstat 17 qotd 19 chargen 20 ftp-data 21 ftp 22 ssh 23 telnet 25 smtp 37 time 43 whois 49 tacacs 53 domain 70 gopher 79 finger 80 http 88 kerberos 102 iso-tsap 104 acr-nema 110 pop3 111 sunrpc 113 auth 119 nntp 135 epmap 139 netbios-ssn 143 imap2 161 snmp 162 snmp-trap 163 cmip-man 164 cmip-agent 174 mailq 179 bgp 199 smux 209 qmtp 210 z3950 345 pawserv 346 zserv 369 rpc2portmap 370 codaauth2 389 ldap 427 svrloc 443 https 444 snpp 445 microsoft-ds 464 kpasswd 465 submissions 487 saft 554 rtsp 607 nqs 628 qmqp 631 ipp 646 ldp 512 exec 513 login 514 shell 515 printer 538 gdomap 540 uucp 543 klogin 544 kshell 548 afpovertcp 563 nntps 587 submission 636 ldaps 655 tinc 706 silc 749 kerberos-adm 853 domain-s 873 rsync 989 ftps-data 990 ftps 992 telnets 993 imaps 995 pop3s 1080 socks 1093 proofd 1094 rootd 1194 openvpn 1099 rmiregistry 1352 lotusnote 1433 ms-sql-s 1524 ingreslock 1645 datametrics 1646 sa-msg-port 1649 kermit 1677 groupwise 1812 radius 1813 radius-acct 2000 cisco-sccp 2049 nfs 2086 gnunet 2101 rtcm-sc104 2119 gsigatekeeper 2135 gris 2401 cvspserver 2430 venus 2431 venus-se 2432 codasrv 2433 codasrv-se 2583 mon 2628 dict 2792 f5-globalsite 2811 gsiftp 2947 gpsd 3050 gds-db 3205 isns 3260 iscsi-target 3306 mysql 3389 ms-wbt-server 3493 nut 3632 distcc 3689 daap 3690 svn 4031 suucp 4094 sysrqd 4190 sieve 4369 epmd 4373 remctl 4353 f5-iquery 4460 ntske 4691 mtn 4899 radmin-port 5060 sip 5061 sip-tls 5222 xmpp-client 5269 xmpp-server 5308 cfengine 5432 postgresql 5556 freeciv 5671 amqps 5672 amqp 6000 x11 6001 x11-1 6002 x11-2 6003 x11-3 6004 x11-4 6005 x11-5 6006 x11-6 6007 x11-7 6346 gnutella-svc 6347 gnutella-rtr 6379 redis 6444 sge-qmaster 6445 sge-execd 6446 mysql-proxy 6697 ircs-u 7000 bbs 7100 font-service 8080 http-alt 8140 puppet 9101 bacula-dir 9102 bacula-fd 9103 bacula-sd 9667 xmms2 10809 nbd 10050 zabbix-agent 10051 zabbix-trapper 10080 amanda 11112 dicom 11371 hkp 17500 db-lsp 22125 dcap 22128 gsidcap 22273 wnn6 750 kerberos4 751 kerberos-master 754 krb-prop 2121 iprop 871 supfilesrv 1127 supfiledbg 106 poppassd 775 moira-db 777 moira-update 783 spamd 1178 skkserv 1236 rmtcfg 1313 xtel 1314 xtelw 2600 zebrasrv 2601 zebra 2602 ripd 2603 ripngd 2604 ospfd 2605 bgpd 2606 ospf6d 2607 ospfapi 2608 isisd 4557 fax 4559 hylafax 4949 munin 5666 nrpe 5667 nsca 5680 canna 6514 syslog-tls 6566 sane-port 6667 ircd 8021 zope-ftp 8081 tproxy 8088 omniorb 8990 clc-build-daemon 9098 xinetd 9418 git 9673 zope 10000 webmin 10081 kamanda 10082 amandaidx 10083 amidxtape 17004 sgi-cad 24554 binkp 27374 asp 30865 csync2 57000 dircproxy 60177 tfido 60179 fido",
    udp: "7 echo 9 discard 13 daytime 19 chargen 21 fsp 37 time 49 tacacs 53 domain 67 bootps 68 bootpc 69 tftp 88 kerberos 111 sunrpc 123 ntp 137 netbios-ns 138 netbios-dgm 161 snmp 162 snmp-trap 163 cmip-man 164 cmip-agent 177 xdmcp 213 ipx 319 ptp-event 320 ptp-general 369 rpc2portmap 370 codaauth2 371 clearcase 389 ldap 427 svrloc 443 https 464 kpasswd 500 isakmp 554 rtsp 623 asf-rmcp 646 ldp 512 biff 513 who 514 syslog 517 talk 518 ntalk 520 route 538 gdomap 546 dhcpv6-client 547 dhcpv6-server 636 ldaps 655 tinc 853 domain-s 1194 openvpn 1434 ms-sql-m 1645 datametrics 1646 sa-msg-port 1701 l2f 1812 radius 1813 radius-acct 2049 nfs 2086 gnunet 2101 rtcm-sc104 2430 venus 2431 venus-se 2432 codasrv 2433 codasrv-se 2583 mon 3130 icpv2 3205 isns 3493 nut 4500 ipsec-nat-t 4569 iax 5060 sip 5061 sip-tls 5353 mdns 6346 gnutella-svc 6347 gnutella-rtr 6696 babel 7000 afs3-fileserver 7001 afs3-callback 7002 afs3-prserver 7003 afs3-vlserver 7004 afs3-kaserver 7005 afs3-volser 7007 afs3-bos 7008 afs3-update 7009 afs3-rmtsys 750 kerberos4 751 kerberos-master 752 passwd-server 2102 zephyr-srv 2103 zephyr-clt 2104 zephyr-hm 779 moira-ureg 1210 predict 5555 rplay 17001 sgi-cmsd 17002 sgi-crsd 17003 sgi-gcd 27374 asp",
  };
  Object.keys(SERVICES).forEach(function (proto) {
    var words = SERVICES[proto].split(" ");
    var names = {};
    for (var i = 0; i + 1 < words.length; i += 2) names[words[i]] = words[i + 1];
    SERVICES[proto] = names;
  });
  function serviceName(port, proto) { return SERVICES[proto][port]; }

  function parseIPv4(text) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text || "");
    if (!m) return null;
    var n = 0;
    for (var i = 1; i <= 4; i++) {
      if (+m[i] > 255) return null;
      n = n * 256 + +m[i];
    }
    return n;
  }
  function formatIPv4(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."); }
  function prefixMask(prefix) { return prefix ? (0xffffffff << (32 - prefix)) >>> 0 : 0; }

  function buildNetwork(spec) {
    var ifaces = spec.interfaces.map(function (i, k) {
      var parts = i.address.split("/");
      var address = parseIPv4(parts[0]);
      var prefix = +parts[1];
      var mask = prefixMask(prefix);
      var mac = [0x52, 0x54, 0x00, (address >>> 16) & 255, (address >>> 8) & 255, address & 255];
      // The link-local IPv6 address the kernel derives from the MAC (EUI-64).
      var eui = [((mac[0] ^ 2) << 8) | mac[1], (mac[2] << 8) | 0xff, 0xfe00 | mac[3], (mac[4] << 8) | mac[5]];
      return {
        name: i.name, index: k + 2, address: address, prefix: prefix, mask: mask,
        network: (address & mask) >>> 0, broadcast: ((address & mask) | ~mask) >>> 0,
        mac: mac.map(function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join(":"),
        linkLocal: "fe80::" + eui.map(function (g) { return g.toString(16); }).join(":"),
      };
    });
    var dns = spec.dns || { server: null, records: [] };
    var gateway = spec.gateway ? parseIPv4(spec.gateway) : null;
    return {
      ifaces: ifaces,
      gateway: gateway,
      // The resolver, and the records it answers from (#165).
      dns: {
        server: dns.server ? parseIPv4(dns.server) : gateway,
        records: (dns.records || []).map(function (r) { return { name: r.name, type: r.type || "A", value: r.value, ttl: r.ttl || 300 }; }),
      },
      listening: spec.listening || [],
      connections: spec.connections || [],
      hosts: (spec.hosts || []).map(function (h) {
        return { name: h.name, address: parseIPv4(h.address), up: h.up !== false, ping: h.ping !== false, services: h.services || [], filtered: h.filtered || [], login: h.login === true };
      }),
    };
  }

  // A name for ping and nc, as getaddrinfo finds it: /etc/hosts, then DNS (#165).
  Shell.prototype.resolveName = function (name) {
    if (parseIPv4(name) !== null) return { address: parseIPv4(name), numeric: true };
    if (/^[\d.]+$/.test(name)) return { error: "Name or service not known" };
    var entry = this.hostsEntry(name, false);
    if (entry) return { address: parseIPv4(entry.address), canonical: entry.names[0] };
    var asked = this.askDns(name, "A", 2);
    if (!asked.result) return { error: "Temporary failure in name resolution" };
    var a = asked.result.answer.filter(function (r) { return r.type === "A"; })[0];
    if (!a) return { error: asked.result.status === "NXDOMAIN" ? "Name or service not known" : "No address associated with hostname" };
    return { address: parseIPv4(a.data), canonical: a.name };
  };

  // route() as another host sees it (#166), for ping inside `ssh HOST '…'`: it
  // reaches the console (ufw lets ping in) and every host the exercise has;
  // anything else is silence.
  Shell.prototype.routeFrom = function (addr) {
    var origin = this.origin;
    var iface = { address: origin.address, broadcast: -1 };
    if (addr === origin.address || addr >>> 24 === 127) return { local: true, iface: iface };
    if (this.isConsole(addr)) return { iface: iface, via: null, host: { up: true, ping: true } };
    var host = this.net.hosts.filter(function (h) { return h.address === addr; })[0] || null;
    return { iface: iface, via: host ? null : origin.address, host: host };
  };

  Shell.prototype.isLocal = function (addr) {
    return addr >>> 24 === 127 || this.net.ifaces.some(function (i) { return i.address === addr; });
  };

  // Where a packet to `addr` goes: {local}, {unreachable} (no route), or the
  // interface it leaves by, `via` the gateway unless it's on that subnet, and
  // the host that answers (null when no machine has that address).
  Shell.prototype.route = function (addr) {
    var net = this.net;
    if (this.isLocal(addr)) return { local: true };
    var onlink = net.ifaces.filter(function (i) { return ((addr & i.mask) >>> 0) === i.network; })[0];
    var iface = onlink || (net.gateway !== null && net.ifaces.filter(function (i) { return ((net.gateway & i.mask) >>> 0) === i.network; })[0]);
    if (!iface) return { unreachable: true };
    var host = net.hosts.filter(function (h) { return h.address === addr; })[0] || null;
    if (!host && addr === net.gateway) host = { name: "gateway", address: addr, up: true, ping: true, services: [], filtered: [] };
    return { iface: iface, via: onlink ? null : net.gateway, host: host };
  };

  // The console's own sockets, held by its live processes: kill the process
  // and its sockets go too. sshd listens on 22, as on any server.
  Shell.prototype.sockets = function () {
    var sh = this, net = this.net, fds = {}, out = [];
    function add(socket, name) {
      var proc = sh.procs.filter(function (p) { return p.alive && procName(p.command) === name; })[0];
      if (!proc) return;
      fds[proc.pid] = (fds[proc.pid] || 2) + 1;
      socket.proc = proc;
      socket.fd = fds[proc.pid];
      out.push(socket);
    }
    add({ proto: "tcp", state: "LISTEN", local: "0.0.0.0", port: 22, peer: "0.0.0.0", peerPort: "*" }, "sshd");
    net.listening.forEach(function (s) {
      var proto = s.proto || "tcp";
      add({ proto: proto, state: proto === "tcp" ? "LISTEN" : "UNCONN", local: s.address || "0.0.0.0", port: s.port, peer: "0.0.0.0", peerPort: "*", spec: s }, s.process);
    });
    add({ proto: "tcp", state: "LISTEN", local: "[::]", port: 22, peer: "[::]", peerPort: "*", v6: true }, "sshd");
    net.connections.forEach(function (c, i) {
      var at = c.remote.lastIndexOf(":");
      var remote = parseIPv4(c.remote.slice(0, at));
      var route = sh.route(remote);
      var src = route.iface ? formatIPv4(route.iface.address) : "127.0.0.1";
      // An outgoing connection's own port is an ephemeral one, picked by the kernel.
      var port = c.local_port || 32768 + ((i + 1) * 15485 + +c.remote.slice(at + 1) * 31) % 28232;
      add({ proto: "tcp", state: "ESTAB", local: src, port: port, peer: c.remote.slice(0, at), peerPort: +c.remote.slice(at + 1) }, c.process);
    });
    return out;
  };

  // Is something on the console listening on tcp `port` at `addr`?
  Shell.prototype.listensOn = function (addr, port) {
    return this.sockets().some(function (s) {
      if (s.proto !== "tcp" || s.state !== "LISTEN" || s.port !== port) return false;
      return s.local === "0.0.0.0" || s.local === "[::]" || parseIPv4(s.local) === addr;
    });
  };

  // Options a real command has and the console doesn't, said in so many words.
  function netFlags(cmd, args, supported, real, valued) {
    var p = flags(cmd, args, real, valued);
    Object.keys(p.opts).forEach(function (f) {
      if (supported.indexOf(f) === -1) throw new Error("-" + f + " isn't supported on this console");
    });
    return p;
  }

  // --- ip -----------------------------------------------------------------------------
  function ipFlags(iface) {
    return iface ? "<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP" : "<LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN";
  }
  function ipHeader(iface, link) {
    var head = iface ? iface.index + ": " + iface.name + ": " : "1: lo: ";
    return head + ipFlags(iface) + (link ? " mode DEFAULT" : "") + " group default qlen 1000\n";
  }
  function ipLinkLine(iface) {
    return iface ? "    link/ether " + iface.mac + " brd ff:ff:ff:ff:ff:ff\n" : "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n";
  }
  var FOREVER = "       valid_lft forever preferred_lft forever\n";

  Shell.prototype.ipAddr = function (o, dev, link) {
    var list = [null].concat(this.net.ifaces); // null is lo
    if (dev !== null) {
      list = list.filter(function (i) { return (i ? i.name : "lo") === dev; });
      if (!list.length) return { out: "", err: 'Device "' + dev + '" does not exist.\n', code: 1 };
    }
    var out = "";
    list.forEach(function (i) {
      var name = i ? i.name : "lo";
      var v4 = i ? [formatIPv4(i.address) + "/" + i.prefix] : ["127.0.0.1/8"];
      var v6 = i ? [i.linkLocal + "/64"] : ["::1/128"];
      if (o.brief) {
        var state = i ? "UP" : "UNKNOWN";
        var rest = link
          ? (i ? i.mac : "00:00:00:00:00:00") + " <" + ipFlags(i).slice(1, ipFlags(i).indexOf(">")) + "> "
          : (o.family === 6 ? [] : v4).concat(o.family === 4 ? [] : v6).map(function (a) { return a + " "; }).join("");
        out += padRight(name, 16) + " " + padRight(state, 14) + " " + rest + "\n";
        return;
      }
      out += ipHeader(i, link);
      if (link) { out += ipLinkLine(i); return; }
      if (!o.family) out += ipLinkLine(i);
      if (o.family !== 6) {
        out += i ? "    inet " + v4[0] + " brd " + formatIPv4(i.broadcast) + " scope global " + name + "\n" : "    inet 127.0.0.1/8 scope host lo\n";
        out += FOREVER;
      }
      if (o.family !== 4) {
        out += i ? "    inet6 " + v6[0] + " scope link \n" : "    inet6 ::1/128 scope host noprefixroute \n";
        out += FOREVER;
      }
    });
    return ok(out);
  };

  Shell.prototype.ipRoute = function (words) {
    var net = this.net;
    var verb = words[0] || "show";
    if (/^g(e(t)?)?$/.test(verb)) {
      var target = words[1];
      if (target === "to") target = words[2];
      if (target === undefined) return { out: "", err: "need at least a destination address\n", code: 1 };
      var addr = parseIPv4(target);
      if (addr === null) return { out: "", err: 'Error: any valid prefix is expected rather than "' + target + '".\n', code: 1 };
      var uid = this.account(this.user) ? this.account(this.user).uid : 1000;
      if (this.isLocal(addr)) return ok("local " + target + " dev lo src " + target + " uid " + uid + " \n    cache <local> \n");
      var r = this.route(addr);
      if (r.unreachable) return { out: "", err: "RTNETLINK answers: Network is unreachable\n", code: 2 };
      return ok(target + (r.via !== null ? " via " + formatIPv4(r.via) : "") + " dev " + r.iface.name + " src " + formatIPv4(r.iface.address) + " uid " + uid + " \n    cache \n");
    }
    if (!/^(s(h(o(w)?)?)?|l(i(s(t)?)?)?|lst)$/.test(verb)) return this.ipChange(verb, "route");
    var only = words[1];
    if (only !== undefined && only !== "default") throw new Error("ip route show " + only + " isn't supported on this console; try ip route, or ip route get ADDRESS");
    var out = "";
    if (net.gateway !== null) {
      var gw = net.ifaces.filter(function (i) { return ((net.gateway & i.mask) >>> 0) === i.network; })[0];
      out += "default via " + formatIPv4(net.gateway) + " dev " + gw.name + " proto static \n";
    }
    if (only !== "default") {
      net.ifaces.forEach(function (i) {
        out += formatIPv4(i.network) + "/" + i.prefix + " dev " + i.name + " proto kernel scope link src " + formatIPv4(i.address) + " \n";
      });
    }
    return ok(out);
  };

  // Changing the network: a normal user isn't allowed, as on a real server;
  // root is, there, but this console's network is the exercise's.
  Shell.prototype.ipChange = function (verb, object) {
    if (["add", "del", "delete", "change", "replace", "flush", "set", "append"].indexOf(verb) === -1) {
      return { out: "", err: 'Command "' + verb + '" is unknown, try "ip ' + object + ' help".\n', code: 255 };
    }
    if (this.user !== "root") return { out: "", err: "RTNETLINK answers: Operation not permitted\n", code: 2 };
    throw new Error("changing the network isn't supported on this console");
  };

  COMMANDS.ip = function (args) {
    var o = { family: 0, brief: false };
    var i = 0;
    for (; i < args.length && args[i][0] === "-"; i++) {
      var a = args[i].replace(/^--?/, "-");
      if (a === "-4") o.family = 4;
      else if (a === "-6") o.family = 6;
      else if (/^-br(i(e(f)?)?)?$/.test(a)) o.brief = true;
      else if (/^-c(o(l(o(r)?)?)?)?(=.*)?$/.test(a)) continue; // colour: the console prints plain text
      else if (/^-h(e(l(p)?)?)?$/.test(a)) return ok(renderUsage("ip"));
      else throw new Error(args[i] + " isn't supported on this console");
    }
    var object = args[i];
    var words = args.slice(i + 1);
    if (object === undefined) return { out: "", err: renderUsage("ip"), code: 255 };
    var objects = ["address", "addrlabel", "link", "route", "rule", "neighbour", "neighbor", "ntable", "tunnel", "maddress", "monitor", "netns", "help"];
    var full = objects.filter(function (w) { return w.indexOf(object) === 0; })[0];
    if (!full) return { out: "", err: 'Object "' + object + '" is unknown, try "ip help".\n', code: 1 };
    if (full === "help") return ok(renderUsage("ip"));
    if (full === "route") return this.ipRoute(words);
    if (full !== "address" && full !== "link") throw new Error("ip " + full + " isn't supported on this console; try ip addr, ip link or ip route");
    var verb = words[0] || "show";
    if (!/^(s(h(o(w)?)?)?|l(i(s(t)?)?)?|lst)$/.test(verb)) return this.ipChange(verb, full);
    var rest = words.slice(1);
    if (rest[0] === "dev") rest = rest.slice(1);
    if (rest[0] === "dev" || rest.length > 1) throw new Error("ip " + full + " show takes one device name on this console");
    if (words.length > 1 && !rest.length) return { out: "", err: "Command line is not complete. Try option \"help\"\n", code: 255 };
    return this.ipAddr(o, rest.length ? rest[0] : null, full === "link");
  };

  // --- ss -----------------------------------------------------------------------------
  // Columns as ss lays them out when its output isn't a terminal: each as wide
  // as its widest entry (the header's too), addresses right-aligned against
  // their ports. The console has no screen width to spread them over.
  var SS_COLUMNS = [
    { header: "Netid", delim: "" }, { header: "State", delim: " " }, { header: "Recv-Q", delim: " " }, { header: "Send-Q", delim: " " },
    { header: "Local Address:", delim: " ", right: true }, { header: "Port", delim: "" },
    { header: "Peer Address:", delim: " ", right: true }, { header: "Port", delim: "" }, { header: "Process", delim: "" },
  ];
  function renderSs(rows, withNetid, header) {
    var cols = SS_COLUMNS.map(function (c, k) { return { header: c.header, delim: c.delim, right: c.right, on: k > 0 || withNetid }; });
    var lines = (header ? [cols.map(function (c) { return c.header; })] : []).concat(rows);
    var first = true;
    cols.forEach(function (c, k) {
      if (!c.on) return;
      var max = Math.max.apply(null, lines.map(function (l) { return l[k].length; }));
      c.width = !first && max ? max + c.delim.length : max;
      if (c.width) first = false;
    });
    return lines.map(function (l) {
      var line = "", started = false;
      cols.forEach(function (c, k) {
        if (!c.on) return;
        var printed = started ? c.delim.length : 0;
        line += started ? c.delim : "";
        started = true;
        if (c.right) line += new Array(Math.max(0, c.width - l[k].length - printed) + 1).join(" ") + l[k];
        else line += l[k] + new Array(Math.max(0, c.width - printed - l[k].length) + 1).join(" ");
      });
      return line + "\n";
    }).join("");
  }

  COMMANDS.ss = function (args) {
    var p = netFlags("ss", args, "tulanp46H", "hVHnraloempisEZzb460tuwSxdMKOfAFDN", "fAFDN");
    if (p.args.length) throw new Error("filters (" + p.args.join(" ") + ") aren't supported on this console; pipe ss to grep instead");
    var o = p.opts;
    var sh = this;
    var protos = o.t || o.u ? [o.u && "udp", o.t && "tcp"].filter(Boolean) : ["udp", "tcp"]; // ss lists UDP first
    var root = this.user === "root";
    var rows = [];
    protos.forEach(function (proto) {
      sh.sockets().forEach(function (s) {
        if (s.proto !== proto) return;
        if ((o["4"] && s.v6) || (o["6"] && !s.v6)) return;
        var listening = s.state === "LISTEN" || s.state === "UNCONN";
        if (!o.a && (o.l ? !listening : listening)) return;
        var port = function (n) { return n === "*" || o.n ? String(n) : serviceName(n, proto) || String(n); };
        rows.push([
          proto, s.state, padRight("0", 6), padRight(s.state === "LISTEN" ? "4096" : "0", 6),
          s.local + ":", port(s.port), s.peer + ":", port(s.peerPort),
          // Only root sees other users' processes.
          o.p && (root || s.proc.user === sh.user) ? ' users:(("' + procName(s.proc.command) + '",pid=' + s.proc.pid + ",fd=" + s.fd + "))" : "",
        ]);
      });
    });
    return ok(renderSs(rows, protos.length > 1, !o.H));
  };

  // --- ping ---------------------------------------------------------------------------
  // Round trips are made up but steady: the same host and sequence number
  // always take the same time, so output can be checked.
  function rttFor(addr, seq, base) {
    var h = (((addr >>> 0) ^ Math.imul(seq, 2654435761)) >>> 0) % 1000 / 1000;
    return base * (0.8 + 0.6 * h);
  }
  function pingTime(ms) {
    return ms >= 100 ? String(Math.round(ms)) : ms >= 10 ? ms.toFixed(1) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(3);
  }

  COMMANDS.ping = function (args, stdin, io) {
    var p = netFlags("ping", args, "cqW4", "aAbBc:dDefhHi:I:l:LmM:nOp:qQ:rRs:S:t:T:UvVw:W:4".replace(/:/g, ""), "ciIlMpQsStTwW");
    var o = p.opts;
    if (!p.args.length) return { out: "", err: "ping: usage error: Destination address required\n", code: 1 };
    if (o.c === undefined) return { out: "", err: "ping: give it a count on this console: ping -c 4 " + p.args[p.args.length - 1] + " (a real ping runs until Ctrl-C)\n", code: 2 };
    if (!/^\d+$/.test(o.c)) return { out: "", err: "ping: invalid argument: '" + o.c + "'\n", code: 1 };
    var count = parseInt(o.c, 10);
    if (count < 1) return { out: "", err: "ping: invalid argument: '" + o.c + "': out of range: 1 <= value <= 9223372036854775807\n", code: 1 };
    if (count > 100) throw new Error("-c " + count + " is more than this console will send; 100 at most");
    var name = p.args[p.args.length - 1];
    var found = this.resolveName(name);
    if (found.error) return { out: "", err: "ping: " + name + ": " + found.error + "\n", code: 2 };
    var addr = found.address;
    var shown = formatIPv4(addr);
    // Given a name, ping prints the canonical one and names each reply's
    // sender (/etc/hosts, then a PTR), or just its address without a name.
    var title = found.numeric ? name : found.canonical;
    var sh = this;
    var from = function (a) {
      if (found.numeric) return formatIPv4(a);
      var back = sh.reverseName(a);
      return back ? back + " (" + formatIPv4(a) + ")" : formatIPv4(a);
    };
    var route = this.origin ? this.routeFrom(addr) : this.route(addr);
    if (route.unreachable) return { out: "", err: "ping: connect: Network is unreachable\n", code: 2 };
    if (route.iface && addr === route.iface.broadcast) return { out: "", err: "ping: Do you want to ping broadcast? Then -b. If not, check your local firewall rules\n", code: 2 };
    var host = route.host;
    var answers = route.local || (host && host.up && host.ping);
    var noArp = !route.local && route.via === null && !(host && host.up); // nothing on the wire answers for the address
    var who = answers ? from(addr) : null, me = noArp ? from(route.iface.address) : null;
    io.out.write("PING " + title + " (" + shown + ") 56(84) bytes of data.\n");
    var times = [], errors = 0;
    for (var seq = 1; seq <= count; seq++) {
      if (answers) {
        var ms = rttFor(addr, seq, route.local ? 0.04 : route.via === null ? 0.45 : 24);
        times.push(ms);
        if (!o.q) io.out.write("64 bytes from " + who + ": icmp_seq=" + seq + " ttl=" + (route.via === null || route.local ? 64 : 63) + " time=" + pingTime(ms) + " ms\n");
      } else if (noArp) {
        // The kernel gives up asking who has the address after three tries.
        if (seq === 4) { io.err.write("ping: sendmsg: No route to host\n"); continue; }
        errors++;
        if (!o.q) io.out.write("From " + me + " icmp_seq=" + seq + " Destination Host Unreachable\n");
      }
    }
    this.clock += count;
    this.reap();
    var received = times.length;
    var elapsed = count === 1 ? 0 : (count - 1) * 1000 + (answers ? 2 * count : 20 + 24 * (count - 1));
    var out = "\n--- " + title + " ping statistics ---\n" + count + " packets transmitted, " + received + " received, " +
      (errors ? "+" + errors + " errors, " : "") + Math.round(100 - (received * 100) / count) + "% packet loss, time " + elapsed + "ms\n";
    var tail = [];
    if (received) {
      var sum = times.reduce(function (a, b) { return a + b; }, 0), sq = times.reduce(function (a, b) { return a + b * b; }, 0);
      var avg = sum / received;
      tail.push("rtt min/avg/max/mdev = " + [Math.min.apply(null, times), avg, Math.max.apply(null, times), Math.sqrt(Math.max(0, sq / received - avg * avg))]
        .map(function (n) { return n.toFixed(3); }).join("/") + " ms");
    }
    var pipe = noArp ? Math.min(count, 3) : 1;
    if (pipe > 1) tail.push("pipe " + pipe);
    io.out.write(out + tail.join(", ") + "\n");
    return { out: "", err: "", code: received ? 0 : 1 };
  };

  // --- nc -----------------------------------------------------------------------------
  // nc -z: is anything listening? Three answers, and the lesson is telling
  // them apart: succeeded, refused (the host said no), and timed out or no
  // route (nothing said anything). Debian's nc reports success even without
  // -v, and says all of it on stderr.
  COMMANDS.nc = function (args, stdin, io) {
    var p = netFlags("nc", args, "zvwn4", "46CDdFhI:i:klM:m:NnO:P:p:q:rSs:T:tUuV:vW:w:X:x:Zz".replace(/:/g, ""), "IiMmOPpqsTVWwXx");
    var o = p.opts;
    if (!o.z) throw new Error("this console's nc only checks ports: nc -zv HOST PORT");
    if (o.w !== undefined && !/^\d+$/.test(o.w)) return { out: "", err: "nc: timeout invalid: " + o.w + "\n", code: 1 };
    var name = p.args[0];
    if (name === undefined) throw new Error("usage: nc -zv HOST PORT");
    if (p.args.length < 2) return { out: "", err: "nc: missing port number\n", code: 1 };
    var ports = [];
    for (var k = 1; k < p.args.length; k++) {
      var m = /^(\d+)(?:-(\d+))?$/.exec(p.args[k]);
      if (!m) return { out: "", err: "nc: port number invalid: " + p.args[k] + "\n", code: 1 };
      var lo = +m[1], hi = m[2] === undefined ? lo : +m[2];
      if (hi > 65535 || lo > 65535) return { out: "", err: "nc: port number too large: " + (lo > 65535 ? m[1] : m[2]) + "\n", code: 1 };
      if (lo < 1 || hi < lo) return { out: "", err: "nc: port range not valid: " + p.args[k] + "\n", code: 1 };
      if (hi - lo > 1000) throw new Error("ranges of more than 1000 ports aren't supported on this console");
      for (var n = lo; n <= hi; n++) ports.push(n);
    }
    var found = o.n && parseIPv4(name) === null ? { error: "Name or service not known" } : this.resolveName(name); // -n: no lookups
    if (found.error) return { out: "", err: 'nc: getaddrinfo for host "' + name + '" port ' + p.args[1] + ": " + found.error + "\n", code: 1 };
    var addr = found.address;
    var who = found.numeric ? name : name + " (" + formatIPv4(addr) + ")";
    var opened = false;
    var sh = this;
    ports.forEach(function (port) {
      var outcome = sh.connect(addr, port).outcome; // from here, or from the host `ssh` is on (#166)
      var fail = "nc: connect to " + who + " port " + port + " (tcp) ";
      if (outcome === "open") {
        opened = true;
        io.err.write("Connection to " + who + " " + port + " port [tcp/" + (serviceName(port, "tcp") || "*") + "] succeeded!\n");
      } else if (outcome === "timeout") {
        // With -w, nc gives up when it says; without, the kernel does, after
        // its SYN retries: two minutes and more.
        sh.clock += o.w !== undefined ? +o.w : 134;
        if (o.v) io.err.write(fail + (o.w !== undefined ? "timed out: Operation now in progress\n" : "failed: Connection timed out\n"));
      } else if (o.v) {
        if (outcome === "noroute") sh.clock += 3;
        io.err.write(fail + "failed: " + { refused: "Connection refused", noroute: "No route to host", unreachable: "Network is unreachable" }[outcome] + "\n");
      }
    });
    this.reap();
    return { out: "", err: "", code: opened ? 0 : 1 };
  };

  // --- hostname -----------------------------------------------------------------------
  COMMANDS.hostname = function (args) {
    var p = netFlags("hostname", args, "Iisf", "aAbdfFhiIsvVy", "F");
    var o = p.opts;
    if (p.args.length) {
      if (this.user !== "root") return { out: "", err: "hostname: you must be root to change the host name\n", code: 1 };
      throw new Error("renaming the station isn't supported on this console");
    }
    if (this.origin) return ok(o.I ? formatIPv4(this.origin.address) + " \n" : o.i ? "127.0.1.1\n" : this.origin.name + "\n");
    if (o.I) return ok(this.net.ifaces.map(function (i) { return formatIPv4(i.address) + " "; }).join("") + "\n");
    if (o.i) return ok(HOSTNAME_ADDRESS + "\n");
    return ok("meridian\n");
  };

  // --- names: /etc/hosts and the station's DNS (#165) ---------------------------------
  // getaddrinfo's order is nsswitch.conf's `hosts: files dns`: /etc/hosts
  // first, then the resolver /etc/resolv.conf names. getent, ping and nc go
  // that way; dig and host skip the file and ask the resolver. Both files are
  // read live, so editing them changes the answers. The resolver answers from
  // the exercise's `network.dns` (schema.py DnsSpec). dig and host print what
  // BIND 9.18's do, checked against a bind9 resolver in ubuntu:24.04 containers.
  var ETC_HOSTS = "127.0.0.1 localhost\n127.0.1.1 meridian\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback\nfe00::0 ip6-localnet\nff00::0 ip6-mcastprefix\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n";
  var DIG_BANNER = "; <<>> DiG 9.18.39-0ubuntu0.24.04.8-Ubuntu <<>> ";
  var DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "NS", "PTR", "SOA", "TXT"];
  var OTHER_TYPES = ["ANY", "AXFR", "CAA", "DNSKEY", "DS", "HINFO", "NAPTR", "NSEC", "RRSIG", "SRV", "SSHFP", "TLSA"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // A system file's text, following links: the usual one when the filesystem
  // never had it, and nothing when it's gone or unreadable.
  Shell.prototype.systemFile = function (path, usual) {
    var found = this.lookup(path);
    if (found.node) return found.node.type === "file" ? found.node.contents : "";
    return this.systemFiles[path] ? usual : "";
  };

  // /etc/hosts as entries: an address and its names, comments dropped.
  Shell.prototype.hostsEntries = function () {
    // On another host (#166), that host's own: localhost and its name.
    var text = this.origin ? "127.0.0.1 localhost\n127.0.1.1 " + this.origin.name + "\n" : this.systemFile("/etc/hosts", ETC_HOSTS);
    return lines(text).map(function (l) {
      var words = l.replace(/#.*/, "").trim().split(/\s+/).filter(Boolean);
      return words.length > 1 ? { address: words[0], names: words.slice(1) } : null;
    }).filter(Boolean);
  };

  // The first line naming `name`. glibc asks for IPv6 first when `v6` (getent
  // does): an IPv6 line, or 127.0.0.1, which it hands back as ::1.
  Shell.prototype.hostsEntry = function (name, v6) {
    var key = name.toLowerCase();
    var named = this.hostsEntries().filter(function (e) {
      return e.names.some(function (n) { return n.toLowerCase() === key; });
    });
    if (v6) {
      var six = named.filter(function (e) { return e.address.indexOf(":") !== -1 || e.address === "127.0.0.1"; })[0];
      if (six) return { address: six.address === "127.0.0.1" ? "::1" : six.address, names: six.names };
    }
    return named.filter(function (e) { return parseIPv4(e.address) !== null; })[0] || null;
  };

  // The nameservers /etc/resolv.conf lists, the first three, as resolvers use them.
  Shell.prototype.nameservers = function () {
    var usual = this.net.dns.server === null ? "" : "nameserver " + formatIPv4(this.net.dns.server) + "\n";
    return lines(this.systemFile("/etc/resolv.conf", usual)).map(function (l) {
      var m = /^\s*nameserver\s+(\S+)/.exec(l);
      return m && parseIPv4(m[1]) !== null ? m[1] : null;
    }).filter(Boolean).slice(0, 3);
  };

  // Does a DNS server at `addr` answer? "answers", "refused" (the host is up
  // and nothing listens on 53: an ICMP port unreachable), "timeout", or
  // "unreachable" (no route). The station's resolver answers unless its host
  // is listed as down; any other host answers if it serves udp/53.
  Shell.prototype.dnsReach = function (addr) {
    var serves = function (s) { return s.port === 53 && (s.proto || "tcp") === "udp"; };
    if (this.isLocal(addr)) return this.net.listening.some(serves) ? "answers" : "refused";
    var route = this.route(addr);
    if (route.unreachable) return "unreachable";
    var listed = this.net.hosts.filter(function (h) { return h.address === addr; })[0];
    if (addr === this.net.dns.server) return listed && !listed.up ? "timeout" : "answers";
    if (!route.host || !route.host.up) return "timeout";
    return route.host.services.some(serves) ? "answers" : "refused";
  };

  // The zone a name belongs to, for the SOA a negative answer carries: a /24's
  // reverse zone, the station's own `meridian`, the last two labels, or for a
  // bare word that isn't `meridian`, the root ("").
  function zoneOf(name) {
    var labels = name.split(".");
    if (/\.in-addr\.arpa$/.test(name)) return labels.length > 5 ? labels.slice(-5).join(".") : name;
    if (labels[labels.length - 1] === "meridian") return "meridian";
    return labels.length > 1 ? labels.slice(-2).join(".") : "";
  }
  function soaRecord(zone) {
    if (zone === "") return { name: "", ttl: 86400, type: "SOA", mname: "a.root-servers.net", rname: "nstld.verisign-grs.com", data: "a.root-servers.net. nstld.verisign-grs.com. 2026100800 1800 900 604800 86400" };
    var home = /in-addr\.arpa$/.test(zone) ? "meridian" : zone;
    return { name: zone, ttl: 300, type: "SOA", mname: "ns1." + home, rname: "hostmaster." + home, data: "ns1." + home + ". hostmaster." + home + ". 2026100801 3600 900 604800 300" };
  }
  // A record as dig shows it, and with what the message size needs.
  function dnsRecord(owner, r) {
    var out = { name: owner, ttl: r.ttl, type: r.type };
    if (r.type === "A") out.data = r.value;
    else if (r.type === "TXT") out.data = '"' + r.value.replace(/(["\\])/g, "\\$1") + '"';
    else if (r.type === "MX") {
      var parts = r.value.split(" ");
      out.pref = +parts[0];
      out.target = parts[1];
      out.data = parts[0] + " " + parts[1] + ".";
    } else {
      out.target = r.value;
      out.data = r.value + ".";
    }
    out.value = r.value;
    return out;
  }

  // The resolver's answer to one question: {status, answer, authority, additional}.
  // A CNAME is followed, as a recursive resolver does, unless it's what was asked for.
  Shell.prototype.dnsAnswer = function (qname, qtype) {
    var records = this.net.dns.records;
    var owner = qname.replace(/\.$/, "");
    var name = owner.toLowerCase();
    var named = function (n) { return records.filter(function (r) { return r.name === n; }); };
    var answer = [], authority = [], additional = [];
    for (var hops = 0; hops < 8 && qtype !== "CNAME"; hops++) {
      var alias = named(name).filter(function (r) { return r.type === "CNAME"; })[0];
      if (!alias) break;
      answer.push(dnsRecord(owner, alias));
      owner = name = alias.value;
    }
    var zone = zoneOf(name);
    var hits = named(name).filter(function (r) { return r.type === qtype; }).map(function (r) { return dnsRecord(owner, r); });
    var apexHit = name === zone && records.some(function (r) { return zoneOf(r.name) === zone; });
    if (qtype === "SOA" && apexHit) hits = [soaRecord(zone)];
    answer = answer.concat(hits);
    var exists = apexHit || records.some(function (r) { return r.name === name || r.name.slice(-name.length - 1) === "." + name; });
    if (!hits.length) authority.push(soaRecord(zone));
    hits.forEach(function (r) {
      if (r.type !== "MX") return;
      named(r.target).forEach(function (a) { if (a.type === "A") additional.push(dnsRecord(a.name, a)); });
    });
    return { status: hits.length || exists ? "NOERROR" : "NXDOMAIN", answer: answer, authority: authority, additional: additional };
  };

  // Ask the nameservers in turn, `tries` times each, until one answers.
  // {result, server, failures: [{server, why}]}; the clock moves 5 s per timeout.
  Shell.prototype.askDns = function (qname, qtype, tries, servers) {
    var sh = this;
    var failures = [];
    if (this.origin && !servers) return { result: this.dnsAnswer(qname, qtype), server: formatIPv4(this.net.dns.server || 0), failures: [] }; // another host's resolver answers it
    servers = servers || this.nameservers();
    // With no nameserver at all, resolvers fall back to this machine.
    var list = servers.length ? servers : ["::1", "127.0.0.1"];
    for (var i = 0; i < list.length; i++) {
      var server = list[i];
      var reach = parseIPv4(server) === null ? "refused" : this.dnsReach(parseIPv4(server));
      if (reach === "answers") return { result: this.dnsAnswer(qname, qtype), server: server, failures: failures };
      // The last fallback is tried once; with no route, every client tries three times.
      var times = !servers.length && server === "127.0.0.1" ? 1 : reach === "unreachable" ? 3 : tries;
      for (var t = 0; t < times; t++) {
        failures.push({ server: server, why: reach });
        if (reach === "timeout") sh.clock += 5;
      }
    }
    return { result: null, failures: failures };
  };

  // An address back to a name, for ping's replies: /etc/hosts, then a PTR.
  Shell.prototype.reverseName = function (addr) {
    var shown = formatIPv4(addr);
    var entry = this.hostsEntries().filter(function (e) { return e.address === shown; })[0];
    if (entry) return entry.names[0];
    var asked = this.askDns(reverseOf(shown), "PTR", 2);
    var ptr = asked.result && asked.result.answer.filter(function (r) { return r.type === "PTR"; })[0];
    return ptr ? ptr.value : null;
  };
  function reverseOf(address) { return address.split(".").reverse().join(".") + ".in-addr.arpa"; }

  // The size of the reply on the wire, which dig prints: names are compressed
  // (a repeated suffix is a two-byte pointer), and the OPT record is 11 bytes.
  function dnsSize(qname, sections) {
    var seen = {}, size = 12;
    function name(n) {
      var labels = n.replace(/\.$/, "").split(".").filter(Boolean);
      for (var i = 0; i < labels.length; i++) {
        var suffix = labels.slice(i).join(".").toLowerCase();
        if (seen[suffix] !== undefined) { size += 2; return; }
        seen[suffix] = size;
        size += 1 + labels[i].length;
      }
      size += 1;
    }
    name(qname);
    size += 4;
    sections.forEach(function (r) {
      name(r.name);
      size += 10;
      if (r.type === "A") size += 4;
      else if (r.type === "TXT") size += 1 + new TextEncoder().encode(r.value).length;
      else if (r.type === "SOA") { name(r.mname); name(r.rname); size += 20; }
      else { if (r.type === "MX") size += 2; name(r.target); }
    });
    return size + 11;
  }

  // dig's columns: tabs to the next stop, or one space when the text is past it.
  function digColumns(fields, stops) {
    var line = "", col = 0;
    fields.forEach(function (f, k) {
      line += f;
      col += f.length;
      if (k === fields.length - 1) return;
      if (col >= stops[k]) { line += " "; col++; return; }
      while (col < stops[k]) { line += "\t"; col = (col + 8) & ~7; }
    });
    return line + "\n";
  }
  function digRecord(r) { return digColumns([r.name ? r.name + "." : ".", String(r.ttl), "IN", r.type, r.data], [24, 32, 40, 48]); }

  function stationWhen(d) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return DAYS[d.getDay()] + " " + MONTHS[d.getMonth()] + " " + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + " UTC " + d.getFullYear();
  }

  // What the servers said when none answered, as dig and host print it. With
  // no route, each try gives up at once and says so in full, and dig prints
  // no banner.
  function dnsFailure(f, qname) {
    if (f.why === "unreachable") return ";; UDP setup with " + f.server + "#53(" + f.server + ") for " + qname + " failed: network unreachable.\n;; no servers could be reached\n";
    return ";; communications error to " + f.server + "#53: " + (f.why === "timeout" ? "timed out" : "connection refused") + "\n";
  }
  function dnsFailures(failures, qname, banner) {
    var out = failures.map(function (f) { return dnsFailure(f, qname); }).join("");
    var last = failures[failures.length - 1];
    return last && last.why === "unreachable" ? out : out + (banner || "") + ";; no servers could be reached\n";
  }

  // A name dig will send, or why not.
  function illegalName(name) {
    var labels = name.replace(/\.$/, "").split(".");
    if (name !== "." && labels.some(function (l) { return l === ""; })) return "empty label";
    if (labels.some(function (l) { return l.length > 63; })) return "label too long";
    return null;
  }

  // The server a command was told to ask (dig @SERVER, host NAME SERVER), by
  // address or by name.
  Shell.prototype.namedServer = function (text) {
    if (parseIPv4(text) !== null) return { address: text, name: text };
    var found = this.resolveName(text);
    return found.error ? null : { address: formatIPv4(found.address), name: text };
  };

  // --- dig ----------------------------------------------------------------------------
  COMMANDS.dig = function (args, stdin, io) {
    var o = { short: false, server: null, type: null, name: null };
    for (var i = 0; i < args.length; i++) {
      var a = args[i], upper = a.toUpperCase();
      if (a[0] === "@") o.server = a.slice(1);
      else if (a === "+short") o.short = true;
      else if (a === "+noshort") o.short = false;
      else if (a[0] === "+") throw new Error(a + " isn't supported on this console; dig and dig +short are");
      else if (a === "-4") continue;
      else if (a === "-x" || a === "-t") {
        var value = args[++i];
        if (value === undefined) return { out: "", err: "dig: option requires an argument -- '" + a[1] + "'\n", code: 1 };
        if (a === "-t") { o.type = value.toUpperCase(); continue; }
        if (parseIPv4(value) === null) throw new Error("dig -x takes an IPv4 address on this console, like dig -x 203.0.113.47");
        o.name = reverseOf(value);
        o.type = o.type || "PTR";
      } else if (a[0] === "-") throw new Error(a + " isn't supported on this console");
      else if (o.type === null && DNS_TYPES.indexOf(upper) !== -1) o.type = upper;
      else if (OTHER_TYPES.indexOf(upper) !== -1) throw new Error("dig " + upper + " isn't supported on this console; try A, CNAME, MX, TXT, PTR or SOA");
      else if (upper === "IN") continue;
      else if (o.name === null) o.name = a;
      else throw new Error("one name at a time on this console: dig " + o.name);
    }
    if (o.type !== null && DNS_TYPES.indexOf(o.type) === -1) throw new Error("dig " + o.type + " isn't supported on this console; try A, CNAME, MX, TXT, PTR or SOA");
    if (o.name === null) throw new Error("give dig a name to look up: dig relay.depot-sync.net");
    var why = illegalName(o.name);
    if (why) return { out: "", err: "dig: '" + o.name + "' is not a legal name (" + why + ")\n", code: 10 };
    var type = o.type || "A";
    var servers = null;
    if (o.server !== null) {
      var named = this.namedServer(o.server);
      if (!named) return { out: "", err: "dig: couldn't get address for '" + o.server + "': not found\n", code: 10 };
      servers = [named.address];
    }
    var asked = this.askDns(o.name, type, 3, servers);
    this.reap();
    var banner = "\n" + DIG_BANNER + args.join(" ") + "\n" + (o.server !== null ? "; (1 server found)\n" : "") + ";; global options: +cmd\n";
    if (!asked.result) {
      io.out.write(dnsFailures(asked.failures, o.name, o.short ? "" : banner));
      return { out: "", err: "", code: 9 };
    }
    var out = asked.failures.map(function (f) { return dnsFailure(f, o.name); }).join(""); // servers that didn't answer before one did
    var r = asked.result;
    if (o.short) return ok(out + r.answer.map(function (x) { return x.data + "\n"; }).join(""));
    var qname = o.name.replace(/\.$/, "") + ".";
    var sections = function (title, list) { return list.length ? ";; " + title + " SECTION:\n" + list.map(digRecord).join("") + "\n" : ""; };
    var server = asked.server, addr = parseIPv4(server);
    var route = this.route(addr);
    var ms = route.local || route.via === null ? Math.floor(rttFor(addr, this.clock, 1)) : Math.round(rttFor(addr, this.clock, 24));
    var id = ((addr ^ Math.imul(this.clock + 1, 2654435761) ^ Math.imul(qname.length, 7919)) >>> 0) % 65536; // steady, like the round trips
    out += banner + ";; Got answer:\n" +
      ";; ->>HEADER<<- opcode: QUERY, status: " + r.status + ", id: " + id + "\n" +
      ";; flags: qr rd ra; QUERY: 1, ANSWER: " + r.answer.length + ", AUTHORITY: " + r.authority.length + ", ADDITIONAL: " + (r.additional.length + 1) + "\n\n" +
      ";; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 1232\n" +
      ";; QUESTION SECTION:\n;" + digColumns([qname, "IN", type], [32, 40]) + "\n" +
      sections("ANSWER", r.answer) + sections("AUTHORITY", r.authority) + sections("ADDITIONAL", r.additional) +
      ";; Query time: " + ms + " msec\n" +
      ";; SERVER: " + server + "#53(" + server + ") (UDP)\n" +
      ";; WHEN: " + stationWhen(this.now()) + "\n" +
      ";; MSG SIZE  rcvd: " + dnsSize(qname, r.answer.concat(r.authority, r.additional)) + "\n\n";
    return ok(out);
  };

  // --- host ---------------------------------------------------------------------------
  var HOST_SAYS = { A: "has address", AAAA: "has IPv6 address", MX: "mail is handled by", TXT: "descriptive text", PTR: "domain name pointer", SOA: "has SOA record", NS: "name server" };
  COMMANDS.host = function (args) {
    var p = netFlags("host", args, "t4", "aACdilrsTUvVwW:c:N:R:m:p:t:46".replace(/:/g, ""), "cNRmptW");
    var name = p.args[0];
    if (name === undefined) return { out: "", err: "Usage: host [-aCdilrTvVw] [-c class] [-N ndots] [-t type] [-W time]\n            [-R number] [-m flag] [-p port] hostname [server]\n", code: 1 };
    if (p.args.length > 2) throw new Error("usage: host [-t TYPE] NAME [SERVER]");
    var asked = p.opts.t === undefined ? null : p.opts.t.toUpperCase();
    if (asked !== null && DNS_TYPES.indexOf(asked) === -1) throw new Error("host -t " + p.opts.t + " isn't supported on this console; try A, CNAME, MX, TXT, PTR or SOA");
    var why = illegalName(name);
    if (why) return { out: "", err: "host: '" + name + "' is not a legal name (" + why + ")\n", code: 1 };
    var reverse = parseIPv4(name) !== null;
    var qname = reverse ? reverseOf(name) : name;
    var out = "", servers = null, named = null;
    if (p.args[1] !== undefined) {
      named = this.namedServer(p.args[1]);
      if (!named) return { out: "", err: "host: couldn't get address for '" + p.args[1] + "': not found\n", code: 1 };
      servers = [named.address];
    }
    var types = asked ? [asked] : reverse ? ["PTR"] : ["A", "AAAA", "MX"];
    var aliased = {};
    for (var k = 0; k < types.length; k++) {
      var res = this.askDns(qname, types[k], 2, servers);
      if (!res.result) {
        this.reap();
        return { out: out + dnsFailures(res.failures, qname), err: "", code: 1 };
      }
      var r = res.result;
      // Which server answered is said once it has.
      if (named && !k) out += "Using domain server:\nName: " + named.name + "\nAddress: " + named.address + "#53\nAliases: \n\n";
      if (r.status === "NXDOMAIN") return { out: out + "Host " + qname + (reverse ? "." : "") + " not found: 3(NXDOMAIN)\n", err: "", code: 1 };
      r.answer.forEach(function (x) {
        if (x.type === "CNAME") {
          if (!aliased[x.name]) out += x.name + " is an alias for " + x.data + "\n";
          aliased[x.name] = true;
        } else out += x.name + " " + HOST_SAYS[x.type] + " " + x.data + "\n";
      });
      if (asked && !r.answer.length) out += qname + " has no " + asked + " record\n";
    }
    this.reap();
    return ok(out);
  };

  // getent hosts: the way programs look names up, /etc/hosts first. Listing
  // the file prints its IPv4 lines, and ::1 as 127.0.0.1, as glibc does.
  Shell.prototype.getentHosts = function (keys) {
    var sh = this;
    var line = function (address, names) { return padRight(address, 15) + " " + names.join(" ") + "\n"; };
    if (!keys.length) {
      return ok(this.hostsEntries().map(function (e) {
        if (e.address === "::1") return line("127.0.0.1", e.names);
        return parseIPv4(e.address) !== null ? line(e.address, e.names) : "";
      }).join(""));
    }
    var out = "", missing = false;
    keys.forEach(function (key) {
      if (parseIPv4(key) !== null || key.indexOf(":") !== -1) {
        var entry = sh.hostsEntries().filter(function (e) { return e.address === key; })[0];
        if (entry) { out += line(key, entry.names); return; }
        var ptr = parseIPv4(key) !== null && sh.askDns(reverseOf(key), "PTR", 2).result;
        var found = ptr && ptr.answer.filter(function (r) { return r.type === "PTR"; })[0];
        if (found) out += line(key, [found.value]); else missing = true;
        return;
      }
      var file = sh.hostsEntry(key, true);
      if (file) { out += line(file.address, file.names); return; }
      var asked = sh.askDns(key, "A", 2);
      var a = asked.result && asked.result.answer.filter(function (r) { return r.type === "A"; })[0];
      if (!a) { missing = true; return; }
      out += line(a.data, a.name.toLowerCase() === key.toLowerCase() ? [a.name] : [a.name, key]);
    });
    this.reap();
    return { out: out, err: "", code: missing ? 2 : 0 };
  };

  // --- the console's firewall: ufw (#166) ---------------------------------------------
  // ufw keeps its state in its own files, and so does the console: ENABLED in
  // /etc/ufw/ufw.conf, and the rules as `### tuple ###` lines in user.rules
  // (schema.py writes them for the starting filesystem, byte for byte as ufw
  // 0.36.2 does, and a test holds this renderer to the same bytes). Rules only
  // touch connections *into* the console from other hosts: the first rule that
  // matches decides, and with none, incoming is denied, which drops the packet,
  // so the other end times out. Ping gets through, as ufw's before.rules allow.
  var UFW_CHAINS = ["user-input", "user-output", "user-forward", "before-logging-input", "before-logging-output",
    "before-logging-forward", "user-logging-input", "user-logging-output", "user-logging-forward",
    "after-logging-input", "after-logging-output", "after-logging-forward", "logging-deny", "logging-allow",
    "user-limit", "user-limit-accept"];
  function ufwConf(enabled) {
    return "# /etc/ufw/ufw.conf\n#\n\n# Set to yes to start on boot. If setting this remotely, be sure to add a rule\n" +
      "# to allow your remote connection before starting ufw. Eg: 'ufw allow 22/tcp'\nENABLED=" + (enabled ? "yes" : "no") +
      "\n\n# Please use the 'ufw' command to set the loglevel. Eg: 'ufw logging medium'.\n# See 'man ufw' for details.\nLOGLEVEL=low\n";
  }
  var UFW_INSTALLED = "*filter\n:ufw-user-input - [0:0]\n:ufw-user-output - [0:0]\n:ufw-user-forward - [0:0]\n" +
    ":ufw-user-limit - [0:0]\n:ufw-user-limit-accept - [0:0]\n### RULES ###\n" +
    '-A ufw-user-limit -m limit --limit 3/minute -j LOG --log-prefix "[UFW LIMIT BLOCK] "\n' +
    "-A ufw-user-limit -j REJECT\n-A ufw-user-limit-accept -j ACCEPT\nCOMMIT\n";
  function ufwRules(tuples, six) {
    var chain = six ? "ufw6" : "ufw";
    var log = "-m limit --limit 3/min --limit-burst 10";
    var out = "*filter\n" + UFW_CHAINS.map(function (c) { return ":" + chain + "-" + c + " - [0:0]\n"; }).join("") + "### RULES ###\n";
    tuples.forEach(function (t) {
      var w = t.split(" ");
      if (six) {
        if (w[5] !== "0.0.0.0/0") return; // an IPv4 source has no IPv6 rule
        t = t.replace(/0\.0\.0\.0\/0/g, "::/0");
      }
      out += "\n### tuple ### " + t + "\n";
      var jump = w[0] === "allow" ? "ACCEPT" : "DROP";
      var source = w[5] === "0.0.0.0/0" ? "" : " -s " + w[5];
      if (w[2] === "any") out += "-A " + chain + "-user-input" + source + " -j " + jump + "\n";
      else (w[1] === "any" ? ["tcp", "udp"] : [w[1]]).forEach(function (p) {
        out += "-A " + chain + "-user-input -p " + p + " --dport " + w[2] + source + " -j " + jump + "\n";
      });
    });
    return out + "\n### END RULES ###\n\n### LOGGING ###\n" +
      "-A " + chain + '-after-logging-input -j LOG --log-prefix "[UFW BLOCK] " ' + log + "\n" +
      "-A " + chain + '-after-logging-forward -j LOG --log-prefix "[UFW BLOCK] " ' + log + "\n" +
      "-I " + chain + "-logging-deny -m conntrack --ctstate INVALID -j RETURN " + log + "\n" +
      "-A " + chain + '-logging-deny -j LOG --log-prefix "[UFW BLOCK] " ' + log + "\n" +
      "-A " + chain + '-logging-allow -j LOG --log-prefix "[UFW ALLOW] " ' + log + "\n" +
      "### END LOGGING ###\n\n### RATE LIMITING ###\n" +
      "-A " + chain + '-user-limit -m limit --limit 3/minute -j LOG --log-prefix "[UFW LIMIT BLOCK] "\n' +
      "-A " + chain + "-user-limit -j REJECT\n-A " + chain + "-user-limit-accept -j ACCEPT\n### END RATE LIMITING ###\nCOMMIT\n";
  }
  function ruleTuple(r) { return r.action + " " + r.proto + " " + (r.port === null ? "any" : r.port) + " 0.0.0.0/0 any " + (r.from || "0.0.0.0/0") + " in"; }
  function parseTuple(t) {
    var w = t.split(" ");
    return { action: w[0], proto: w[1], port: w[2] === "any" ? null : +w[2], from: w[5] === "0.0.0.0/0" ? null : w[5] };
  }
  // A rule as `ufw delete` and its prompt write it: allow from 10.4.0.5 to any port 9000 proto tcp.
  function ruleText(r) {
    if (!r.from) return r.action + " " + r.port + (r.proto === "any" ? "" : "/" + r.proto);
    return r.action + " from " + r.from + (r.port === null ? "" : " to any port " + r.port + (r.proto === "any" ? "" : " proto " + r.proto));
  }
  function inNetwork(addr, cidr) {
    var parts = cidr.split("/");
    var mask = prefixMask(parts[1] === undefined ? 32 : +parts[1]);
    return ((addr & mask) >>> 0) === ((parseIPv4(parts[0]) & mask) >>> 0);
  }

  Shell.prototype.ufwState = function () {
    var conf = this.systemFile("/etc/ufw/ufw.conf", ufwConf(false));
    var rules = this.systemFile("/etc/ufw/user.rules", UFW_INSTALLED);
    return {
      enabled: /^ENABLED=yes\s*$/m.test(conf),
      rules: (rules.match(/^### tuple ### .*$/gm) || []).map(function (l) { return parseTuple(l.slice(14)); }),
    };
  };
  // ufw runs as root and writes its files whatever their mode.
  Shell.prototype.ufwWrite = function (path, text, mode) {
    var sh = this;
    ["/etc", "/etc/ufw"].forEach(function (d) {
      if (!sh.fs[d]) sh.fs[d] = { type: "dir", mode: 0o755, owner: "root", group: "root", contents: "", mtime: sh.now() };
    });
    var node = this.fs[path];
    if (!node) node = this.fs[path] = { type: "file", mode: mode, owner: "root", group: "root", contents: "" };
    node.contents = text;
    node.mtime = this.now();
  };
  Shell.prototype.ufwSave = function (state) {
    var tuples = state.rules.map(ruleTuple);
    this.ufwWrite("/etc/ufw/ufw.conf", ufwConf(state.enabled), 0o644);
    this.ufwWrite("/etc/ufw/user.rules", ufwRules(tuples), 0o640);
    this.ufwWrite("/etc/ufw/user6.rules", ufwRules(tuples, true), 0o640);
  };
  // Does the firewall let a connection from `src` in to `port`/`proto`?
  Shell.prototype.firewallLets = function (src, port, proto) {
    var st = this.ufwState();
    if (!st.enabled) return true;
    for (var i = 0; i < st.rules.length; i++) {
      var r = st.rules[i];
      if ((r.proto === "any" || r.proto === proto) && (r.port === null || r.port === port) && (!r.from || inNetwork(src, r.from))) return r.action === "allow";
    }
    return false;
  };

  var UFW_USAGE = "Usage: ufw COMMAND\n\nCommands:\n enable                          enables the firewall\n disable                         disables the firewall\n" +
    " default ARG                     set default policy\n logging LEVEL                   set logging to LEVEL\n allow ARGS                      add allow rule\n" +
    " deny ARGS                       add deny rule\n reject ARGS                     add reject rule\n limit ARGS                      add limit rule\n" +
    " delete RULE|NUM                 delete RULE\n insert NUM RULE                 insert RULE at NUM\n prepend RULE                    prepend RULE\n" +
    " route RULE                      add route RULE\n route delete RULE|NUM           delete route RULE\n route insert NUM RULE           insert route RULE at NUM\n" +
    " reload                          reload firewall\n reset                           reset firewall\n status                          show firewall status\n" +
    " status numbered                 show firewall status as numbered list of RULES\n status verbose                  show verbose firewall status\n" +
    " show ARG                        show firewall report\n version                         display version information\n\n" +
    "Application profile commands:\n app list                        list application profiles\n app info PROFILE                show information on PROFILE\n" +
    " app update PROFILE              update PROFILE\n app default ARG                 set default application policy\n\n";

  // The words after allow/deny: PORT[/PROTO], or from ADDR [to any port PORT [proto PROTO]].
  function parseUfwRule(action, words) {
    var r = { action: action, port: null, proto: "any", from: null };
    if (!words.length) return { error: "ERROR: Invalid syntax\n\n" + UFW_USAGE };
    if (words[0] !== "from") {
      if (words.length > 1) throw new Error("this console's ufw takes PORT[/PROTO] or from ADDR [to any port PORT [proto PROTO]]");
      var m = /^(\d+)(?:\/(tcp|udp))?$/.exec(words[0]);
      if (!m) return { error: /^\d/.test(words[0]) ? "ERROR: Bad port\n" : "ERROR: Could not find a profile matching '" + words[0] + "'\n" };
      if (+m[1] < 1 || +m[1] > 65535) return { error: "ERROR: Bad port\n" };
      r.port = +m[1];
      r.proto = m[2] || "any";
      return { rule: r };
    }
    var src = words[1];
    if (src === undefined) return { error: "ERROR: Invalid syntax\n\n" + UFW_USAGE };
    var cm = /^(\d+\.\d+\.\d+\.\d+)(?:\/(\d+))?$/.exec(src);
    if (src !== "any" && (!cm || parseIPv4(cm[1]) === null || (cm[2] !== undefined && +cm[2] > 32))) return { error: "ERROR: Bad source address\n" };
    r.from = src === "any" ? null : src;
    var rest = words.slice(2);
    if (rest.length) {
      if (rest[0] !== "to" || rest[1] !== "any") throw new Error("this console's ufw only writes rules `to any`: ufw allow from ADDR to any port PORT");
      rest = rest.slice(2);
      if (rest[0] === "port") {
        if (!/^\d+$/.test(rest[1] || "") || +rest[1] < 1 || +rest[1] > 65535) return { error: "ERROR: Bad port\n" };
        r.port = +rest[1];
        rest = rest.slice(2);
      }
      if (rest[0] === "proto") {
        if (rest[1] !== "tcp" && rest[1] !== "udp") return { error: "ERROR: Unsupported protocol '" + (rest[1] || "") + "'\n" };
        if (r.port === null) throw new Error("a protocol needs a port on this console: to any port PORT proto " + rest[1]);
        r.proto = rest[1];
        rest = rest.slice(2);
      }
      if (rest.length) return { error: "ERROR: Invalid syntax\n\n" + UFW_USAGE };
    }
    if (r.from === null && r.port === null) throw new Error("ufw allow from any would let everything in; give a port");
    return { rule: r };
  }
  function sameRule(a, b) { return a.action === b.action && a.port === b.port && a.proto === b.proto && a.from === b.from; }

  // `ufw status`: the rules as ufw lays them out, columns of 27, 12 and 26, IPv4
  // first, then each rule without a source again for IPv6.
  function ufwStatus(st, how) {
    if (!st.enabled) return "Status: inactive\n";
    var rows = [];
    st.rules.forEach(function (r) { rows.push({ r: r, six: false }); });
    st.rules.forEach(function (r) { if (!r.from) rows.push({ r: r, six: true }); });
    var lead = how === "numbered" ? "     " : "";
    var out = "Status: active\n";
    if (how === "verbose") out += "Logging: on (low)\nDefault: deny (incoming), allow (outgoing), deny (routed)\nNew profiles: skip\n";
    if (!rows.length) return out;
    out += "\n" + lead + padRight("To", 27) + padRight("Action", 12) + "From\n" + lead + padRight("--", 27) + padRight("------", 12) + "----\n";
    rows.forEach(function (row, k) {
      var r = row.r, v6 = row.six ? " (v6)" : "";
      var to = (r.port === null ? "Anywhere" : r.port + (r.proto === "any" ? "" : "/" + r.proto)) + v6;
      var action = r.action.toUpperCase() + (how ? " IN" : "");
      var from = (r.from || "Anywhere") + v6;
      var num = how === "numbered" ? "[" + (k + 1 < 10 ? " " : "") + (k + 1) + "] " : "";
      out += num + padRight(to, 27) + padRight(action, 12) + padRight(from, 26) + "\n";
    });
    return out + "\n";
  }

  COMMANDS.ufw = function* (args, stdin, io) {
    if (this.user !== "root") return { out: "", err: "ERROR: You need to be root to run this script\n", code: 1 };
    var st = this.ufwState();
    var verb = args[0];
    var sh = this;
    var out = { err: "" };
    var said = "";
    if (verb === "status") {
      var how = args[1];
      if (how !== undefined && how !== "verbose" && how !== "numbered") return { out: "", err: "ERROR: Invalid syntax\n\n" + UFW_USAGE, code: 1 };
      return ok(ufwStatus(st, how));
    }
    if (verb === "version") return ok("ufw 0.36.2\nCopyright 2008-2023 Canonical Ltd.\n");
    if (verb === "enable" || verb === "disable") {
      if (verb === "enable") {
        // The console's login is over SSH (its shell's parent is sshd), so ufw asks.
        var yes = yield* this.confirm("Command may disrupt existing ssh connections. Proceed with operation (y|n)? ", io, out);
        if (!yes) return { out: "Aborted\n", err: out.err, code: 0 };
      }
      st.enabled = verb === "enable";
      this.ufwSave(st);
      return { out: verb === "enable" ? "Firewall is active and enabled on system startup\n" : "Firewall stopped and disabled on system startup\n", err: out.err, code: 0 };
    }
    if (verb === "allow" || verb === "deny") {
      var parsed = parseUfwRule(verb, args.slice(1));
      if (parsed.error) return { out: "", err: parsed.error, code: 1 };
      var r = parsed.rule;
      var v6 = r.from ? [""] : ["", " (v6)"];
      if (st.rules.some(function (x) { return sameRule(x, r); })) return ok(v6.map(function (s) { return "Skipping adding existing rule" + s + "\n"; }).join(""));
      st.rules.push(r);
      this.ufwSave(st);
      // While ufw is off it only updates the files; while it's on, the rule is live.
      return ok(v6.map(function (s) { return (st.enabled ? "Rule added" : "Rules updated") + s + "\n"; }).join(""));
    }
    if (verb === "delete") {
      var target = args.slice(1);
      if (target.length === 1 && /^\d+$/.test(target[0])) {
        var n = +target[0];
        var listed = st.rules.length + st.rules.filter(function (x) { return !x.from; }).length;
        if (n < 1 || n > listed) return { out: "", err: "ERROR: Could not find rule '" + target[0] + "'\n", code: 1 };
        if (n > st.rules.length) throw new Error("deleting just a (v6) rule isn't supported on this console; delete the rule itself, like ufw delete allow 8080/tcp");
        var rule = st.rules[n - 1];
        if (!(yield* this.confirm("Deleting:\n " + ruleText(rule) + "\nProceed with operation (y|n)? ", io, out))) return { out: "Aborted\n", err: out.err, code: 0 };
        st.rules.splice(n - 1, 1);
        this.ufwSave(st);
        return { out: "Rule deleted\n", err: out.err, code: 0 };
      }
      if (target[0] !== "allow" && target[0] !== "deny") return { out: "", err: "ERROR: Invalid syntax\n\n" + UFW_USAGE, code: 1 };
      var del = parseUfwRule(target[0], target.slice(1));
      if (del.error) return { out: "", err: del.error, code: 1 };
      var suffixes = del.rule.from ? [""] : ["", " (v6)"];
      var at = -1;
      st.rules.forEach(function (x, k) { if (at === -1 && sameRule(x, del.rule)) at = k; });
      if (at === -1) return ok(suffixes.map(function (s) { return "Could not delete non-existent rule" + s + "\n"; }).join(""));
      st.rules.splice(at, 1);
      this.ufwSave(st);
      return ok(suffixes.map(function (s) { return "Rule deleted" + s + "\n"; }).join(""));
    }
    if (["default", "logging", "reject", "limit", "insert", "prepend", "route", "reload", "reset", "show", "app"].indexOf(verb) !== -1) {
      throw new Error("ufw " + verb + " isn't supported on this console; status, enable, disable, allow, deny and delete are");
    }
    said = verb === undefined ? "ERROR: not enough args\n" : "ERROR: Invalid syntax\n\n" + UFW_USAGE;
    return { out: "", err: said, code: 1 };
  };

  // --- connections, from the console or from another host (#166) -----------------------
  // Inside `ssh HOST '…'`, this.origin is that host, and nc, curl and ping see the
  // network from there: the console is just another address, behind its firewall.
  // Where a TCP connection to addr:port gets: {outcome: "open" | "refused" |
  // "timeout" | "noroute" | "unreachable", service, src}. `service` is what
  // answered (a host's ServiceSpec or the console's ListenSpec), for curl.
  Shell.prototype.listener = function (addr, port) {
    return this.sockets().filter(function (s) {
      if (s.proto !== "tcp" || s.state !== "LISTEN" || s.port !== port) return false;
      return s.local === "0.0.0.0" || s.local === "[::]" || parseIPv4(s.local) === addr;
    })[0] || null;
  };
  Shell.prototype.isConsole = function (addr) { return this.net.ifaces.some(function (i) { return i.address === addr; }); };
  function served(host, port) {
    return host.services.filter(function (s) { return s.port === port && (s.proto || "tcp") === "tcp"; })[0] || null;
  }
  Shell.prototype.connect = function (addr, port) {
    var net = this.net, origin = this.origin;
    if (!origin) {
      if (this.isLocal(addr)) {
        var mine = this.listener(addr, port);
        return { outcome: mine ? "open" : "refused", service: mine && mine.spec, src: addr };
      }
      var route = this.route(addr);
      if (route.unreachable) return { outcome: "unreachable" };
      var src = route.iface.address;
      var host = route.host;
      if (!host || !host.up) return { outcome: route.via === null ? "noroute" : "timeout", src: src };
      var svc = served(host, port);
      if (svc) return { outcome: "open", service: svc, host: host, src: src };
      return { outcome: host.filtered.indexOf(port) !== -1 ? "timeout" : "refused", host: host, src: src };
    }
    if (addr === origin.address || addr >>> 24 === 127) {
      var own = served(origin, port);
      return { outcome: own ? "open" : "refused", service: own, host: origin, src: addr };
    }
    if (this.isConsole(addr)) {
      if (!this.firewallLets(origin.address, port, "tcp")) return { outcome: "timeout", src: origin.address };
      var l = this.listener(addr, port);
      return { outcome: l ? "open" : "refused", service: l && l.spec, src: origin.address };
    }
    var other = net.hosts.filter(function (h) { return h.address === addr; })[0];
    if (!other || !other.up) return { outcome: "timeout", src: origin.address };
    var theirs = served(other, port);
    if (theirs) return { outcome: "open", service: theirs, host: other, src: origin.address };
    return { outcome: other.filtered.indexOf(port) !== -1 ? "timeout" : "refused", host: other, src: origin.address };
  };

  // --- curl -----------------------------------------------------------------------------
  // HTTP to the station's services: a host's service (or one of the console's
  // own listeners) with `http` routes answers them; any other path is that
  // server's 404. What it prints is curl 8.5.0's, checked against Ubuntu
  // 24.04's curl talking to a small test server, with no progress meter (the
  // console's output always counts as a terminal).
  var REASONS = { 200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 303: "See Other",
    304: "Not Modified", 307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 418: "I'm a teapot", 422: "Unprocessable Entity", 429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };
  var CURL_TLS = ["* ALPN: curl offers h2,http/1.1", "* TLSv1.3 (OUT), TLS handshake, Client hello (1):", "*  CAfile: /etc/ssl/certs/ca-certificates.crt",
    "*  CApath: /etc/ssl/certs", "* TLSv1.3 (IN), TLS handshake, Server hello (2):", "* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):",
    "* TLSv1.3 (IN), TLS handshake, Certificate (11):"];
  var CURL_TLS_DONE = ["* TLSv1.3 (IN), TLS handshake, CERT verify (15):", "* TLSv1.3 (IN), TLS handshake, Finished (20):",
    "* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):", "* TLSv1.3 (OUT), TLS handshake, Finished (20):",
    "* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / X25519 / id-ecPublicKey", "* ALPN: server accepted http/1.1"];
  var CURL_60 = "\ncurl failed to verify the legitimacy of the server and therefore could not\nestablish a secure connection to it. To learn more about this situation and\nhow to fix it, please visit the web page mentioned above.\n";

  function parseUrl(text) {
    var m = /^(?:([a-zA-Z][a-zA-Z0-9+.-]*):\/\/)?([^\/:?#\s@]+)(?::(\d+))?(\/[^?#\s]*)?(\?[^#\s]*)?(?:#\S*)?$/.exec(text || "");
    if (!m) return null;
    var scheme = (m[1] || "http").toLowerCase();
    return { scheme: scheme, host: m[2].toLowerCase(), port: m[3] ? +m[3] : scheme === "https" ? 443 : 80, explicit: !!m[3], path: m[4] || "/", query: m[5] || "" };
  }
  function urlText(u) {
    var dflt = u.scheme === "https" ? 443 : 80;
    return u.scheme + "://" + u.host + (u.port !== dflt ? ":" + u.port : "") + u.path + u.query;
  }
  function httpDate(d) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return DAYS[d.getDay()] + ", " + pad(d.getDate()) + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + " GMT";
  }
  // What a service answers to METHOD PATH: {status, headers: [[name, value]], body}, or null for no HTTP at all.
  function httpAnswer(service, method, path) {
    if (!service || !service.http) return null;
    var want = method === "HEAD" ? "GET" : method;
    var routes = service.http;
    var route = routes.filter(function (r) { return r.path === path && (r.method || "GET") === want; })[0];
    if (!route) {
      var other = routes.filter(function (r) { return r.path === path; });
      if (other.length) return { status: 405, headers: [["Allow", other.map(function (r) { return r.method || "GET"; }).join(", ")], ["Content-Type", "text/plain"]], body: "Method Not Allowed\n" };
      return { status: 404, headers: [["Content-Type", "text/plain"]], body: "Not Found\n" };
    }
    var headers = Object.keys(route.headers || {}).map(function (k) { return [k, route.headers[k]]; });
    var body = route.body || "";
    if (!headers.some(function (h) { return h[0].toLowerCase() === "content-length"; })) headers.push(["Content-Length", String(new TextEncoder().encode(body).length)]);
    return { status: route.status || 200, headers: headers, body: body };
  }

  var CURL_FLAGS = { v: "verbose", s: "silent", S: "show-error", I: "head", i: "include", L: "location", k: "insecure", f: "fail" };
  var CURL_VALUED = { o: "output", H: "header", X: "request", d: "data", w: "write-out", m: "max-time", A: "user-agent" };
  var CURL_LONG = ["verbose", "silent", "show-error", "head", "include", "location", "insecure", "fail", "output", "header", "request", "data", "data-raw",
    "write-out", "max-time", "connect-timeout", "user-agent"];

  function parseCurl(args) {
    var o = { header: [], data: [], urls: [] };
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a.slice(0, 2) === "--") {
        var eq = a.indexOf("=");
        var name = eq === -1 ? a.slice(2) : a.slice(2, eq);
        if (CURL_LONG.indexOf(name) === -1) throw new Error("option " + a + " isn't supported on this console; try curl --help");
        var takes = ["output", "header", "request", "data", "data-raw", "write-out", "max-time", "connect-timeout", "user-agent"].indexOf(name) !== -1;
        if (!takes) { o[name] = true; continue; }
        var v = eq === -1 ? args[++i] : a.slice(eq + 1);
        if (v === undefined) return { error: "curl: option " + a + ": requires parameter\ncurl: try 'curl --help' or 'curl --manual' for more information\n", code: 2 };
        if (name === "data-raw") name = "data";
        if (name === "header" || name === "data") o[name].push(v); else o[name] = v;
      } else if (a[0] === "-" && a.length > 1) {
        for (var j = 1; j < a.length; j++) {
          var c = a[j];
          if (CURL_FLAGS[c]) { o[CURL_FLAGS[c]] = true; continue; }
          if (CURL_VALUED[c]) {
            var val = a.slice(j + 1) || args[++i];
            if (val === undefined) return { error: "curl: option -" + c + ": requires parameter\ncurl: try 'curl --help' or 'curl --manual' for more information\n", code: 2 };
            var key = CURL_VALUED[c];
            if (key === "header" || key === "data") o[key].push(val); else o[key] = val;
            break;
          }
          throw new Error("option -" + c + " isn't supported on this console; try curl --help");
        }
      } else o.urls.push(a);
    }
    return { opts: o };
  }

  COMMANDS.curl = function (args, stdin, io) {
    var p = parseCurl(args);
    if (p.error) return { out: "", err: p.error, code: p.code };
    var o = p.opts;
    if (!o.urls.length) return { out: "", err: "curl: try 'curl --help' or 'curl --manual' for more information\n", code: 2 };
    if (o.urls.length > 1) throw new Error("one URL at a time on this console");
    var sh = this;
    var say = function (text) { if (o.verbose) io.err.write(text); };
    var fail = function (code, msg) {
      if (!o.silent || o["show-error"]) io.err.write("curl: (" + code + ") " + msg + "\n" + (code === 60 ? "More details here: https://curl.se/docs/sslcerts.html\n" + CURL_60 : ""));
      return code;
    };
    var url = parseUrl(o.urls[0]);
    if (!url) return { out: "", err: o.silent && !o["show-error"] ? "" : "curl: (3) URL rejected: Malformed input to a URL function\n", code: 3 };
    if (url.scheme !== "http" && url.scheme !== "https") return { out: "", err: o.silent && !o["show-error"] ? "" : 'curl: (1) Protocol "' + url.scheme + '" not supported\n', code: 1 };
    var method = o.request || (o.head ? "HEAD" : o.data.length ? "POST" : "GET");
    if (o.verbose && o.request === "POST" && o.data.length) io.err.write("Note: Unnecessary use of -X or --request, POST is already inferred.\n");
    var connectLimit = o["connect-timeout"] !== undefined ? parseFloat(o["connect-timeout"]) : null;
    var maxTime = o["max-time"] !== undefined ? parseFloat(o["max-time"]) : null;
    if ((connectLimit !== null && isNaN(connectLimit)) || (maxTime !== null && isNaN(maxTime))) return { out: "", err: "curl: option: expected a proper numerical parameter\n", code: 2 };
    var body = o.data.join("&");
    var redirects = 0, last = null, remote = "", code = 0, contentType = "";
    var written = "";
    for (;;) {
      var hostShown = url.host + ":" + url.port;
      var found = parseIPv4(url.host) !== null ? { address: parseIPv4(url.host), numeric: true } : this.resolveName(url.host);
      if (found.error) { code = fail(6, "Could not resolve host: " + url.host); say("* Closing connection\n"); break; }
      var addr = found.address, shown = formatIPv4(addr);
      remote = shown;
      if (!found.numeric) say("* Host " + hostShown + " was resolved.\n* IPv6: (none)\n* IPv4: " + shown + "\n");
      say("*   Trying " + shown + ":" + url.port + "...\n");
      var c = this.connect(addr, url.port);
      var limit = connectLimit !== null && maxTime !== null ? Math.min(connectLimit, maxTime) : connectLimit !== null ? connectLimit : maxTime;
      if (c.outcome !== "open") {
        var after;
        if (c.outcome === "timeout") {
          if (limit !== null) {
            this.clock += Math.ceil(limit);
            var ms = Math.round(limit * 1000);
            if (limit === maxTime && (connectLimit === null || maxTime <= connectLimit)) {
              say("* Connection timed out after " + (ms + 4) + " milliseconds\n* Closing connection\n");
              code = fail(28, "Connection timed out after " + (ms + 4) + " milliseconds");
            } else {
              say("* ipv4 connect timeout after " + (ms - 1) + "ms, move on!\n* Failed to connect to " + url.host + " port " + url.port + " after " + (ms + 2) + " ms: Timeout was reached\n* Closing connection\n");
              code = fail(28, "Failed to connect to " + url.host + " port " + url.port + " after " + (ms + 2) + " ms: Timeout was reached");
            }
            break;
          }
          // No limit: the kernel gives up on its SYN retries, as nc's does.
          this.clock += 134;
          after = 134000 + (addr % 997);
          say("* connect to " + shown + " port " + url.port + " from " + formatIPv4(c.src) + " port " + (40000 + addr % 20000) + " failed: Connection timed out\n");
        } else if (c.outcome === "refused") {
          after = 0;
          say("* connect to " + shown + " port " + url.port + " from " + formatIPv4(c.src) + " port " + (40000 + addr % 20000) + " failed: Connection refused\n");
        } else if (c.outcome === "noroute") {
          this.clock += 3;
          after = 3069;
          say("* connect to " + shown + " port " + url.port + " from " + formatIPv4(c.src) + " port " + (40000 + addr % 20000) + " failed: No route to host\n");
        } else {
          after = 0;
          say("* Immediate connect fail for " + shown + ": Network is unreachable\n");
        }
        say("* Failed to connect to " + url.host + " port " + url.port + " after " + after + " ms: Couldn't connect to server\n* Closing connection\n");
        code = fail(c.outcome === "timeout" ? 28 : 7, "Failed to connect to " + url.host + " port " + url.port + " after " + after + " ms: Couldn't connect to server");
        break;
      }
      say("* Connected to " + url.host + " (" + shown + ") port " + url.port + "\n");
      var svc = c.service;
      if (url.scheme === "https") {
        if (!svc || !svc.tls) {
          say(CURL_TLS.slice(0, 4).join("\n") + "\n* OpenSSL/3.0.13: error:0A00010B:SSL routines::wrong version number\n* Closing connection\n");
          code = fail(35, "OpenSSL/3.0.13: error:0A00010B:SSL routines::wrong version number");
          break;
        }
        say(CURL_TLS.join("\n") + "\n");
        var named = parseIPv4(url.host) === null;
        if (!named && !o.insecure) {
          say(CURL_TLS_DONE.join("\n") + "\n* SSL: no alternative certificate subject name matches target host name '" + url.host + "'\n* Closing connection\n");
          code = fail(60, "SSL: no alternative certificate subject name matches target host name '" + url.host + "'");
          break;
        }
        if (svc.tls === "expired" && !o.insecure) {
          say("* TLSv1.3 (OUT), TLS alert, certificate expired (557):\n* SSL certificate problem: certificate has expired\n* Closing connection\n");
          code = fail(60, "SSL certificate problem: certificate has expired");
          break;
        }
        var expired = svc.tls === "expired";
        say(CURL_TLS_DONE.join("\n") + "\n* Server certificate:\n*  subject: CN=" + url.host + "\n" +
          "*  start date: " + (expired ? "Jun 30 09:00:00 2026 GMT" : "Sep 21 09:00:00 2026 GMT") + "\n" +
          "*  expire date: " + (expired ? "Sep 28 09:00:00 2026 GMT" : "Dec 20 09:00:00 2026 GMT") + "\n" +
          '*  subjectAltName: host "' + url.host + '" matched cert\'s "' + url.host + '"\n' +
          "*  issuer: C=US; O=Meridian Station; CN=Meridian Station CA\n" +
          (expired ? "*  SSL certificate verify result: certificate has expired (10), continuing anyway.\n" : "*  SSL certificate verify ok.\n") + "* using HTTP/1.x\n");
      }
      // The request.
      var reqHeaders = [["Host", url.host + (url.explicit && url.port !== (url.scheme === "https" ? 443 : 80) ? ":" + url.port : "")],
        ["User-Agent", o["user-agent"] || "curl/8.5.0"], ["Accept", "*/*"]];
      o.header.forEach(function (h) {
        var at = h.indexOf(":");
        if (at === -1) return;
        var name = h.slice(0, at).trim(), value = h.slice(at + 1).trim();
        var same = reqHeaders.filter(function (x) { return x[0].toLowerCase() === name.toLowerCase(); })[0];
        if (same) same[1] = value; else reqHeaders.push([name, value]);
      });
      if (body && method !== "GET" && method !== "HEAD") {
        if (!reqHeaders.some(function (x) { return x[0].toLowerCase() === "content-type"; })) reqHeaders.push(["Content-Type", "application/x-www-form-urlencoded"]);
        reqHeaders.push(["Content-Length", String(new TextEncoder().encode(body).length)]);
      }
      say("> " + method + " " + url.path + url.query + " HTTP/1.1\n" + reqHeaders.map(function (h) { return "> " + h[0] + ": " + h[1] + "\n"; }).join("") + "> \n");
      var answer = httpAnswer(svc, method, url.path);
      if (!answer) {
        say("* Empty reply from server\n* Closing connection\n");
        code = fail(52, "Empty reply from server");
        break;
      }
      last = answer;
      contentType = (answer.headers.filter(function (h) { return h[0].toLowerCase() === "content-type"; })[0] || ["", ""])[1];
      var statusLine = "HTTP/1.1 " + answer.status + " " + (REASONS[answer.status] || "");
      var headerBlock = statusLine + "\n" + answer.headers.map(function (h) { return h[0] + ": " + h[1] + "\n"; }).join("") + "\n";
      say(headerBlock.split("\n").slice(0, -1).map(function (l) { return "< " + l + "\n"; }).join(""));
      var location = (answer.headers.filter(function (h) { return h[0].toLowerCase() === "location"; })[0] || [])[1];
      var redirect = o.location && location && [301, 302, 303, 307, 308].indexOf(answer.status) !== -1;
      if (o.fail && answer.status >= 400) {
        say("* The requested URL returned error: " + answer.status + "\n* Closing connection\n");
        code = fail(22, "The requested URL returned error: " + answer.status);
        break;
      }
      say("* Connection #0 to host " + url.host + " left intact\n");
      var shownHeaders = o.head || o.include;
      var chunk = (shownHeaders ? headerBlock : "") + (method === "HEAD" || redirect ? "" : answer.body);
      if (redirect && o.head) chunk = headerBlock;
      written += chunk;
      if (!redirect) break;
      if (++redirects > 50) { code = fail(47, "Maximum (50) redirects followed"); break; }
      var next = parseUrl(location);
      if (location[0] === "/") next = { scheme: url.scheme, host: url.host, port: url.port, explicit: url.explicit, path: location.split("?")[0], query: location.indexOf("?") === -1 ? "" : location.slice(location.indexOf("?")) };
      if (!next) { code = fail(3, "URL rejected: Malformed input to a URL function"); break; }
      say("* Issue another request to this URL: '" + urlText(next) + "'\n");
      if ([301, 302, 303].indexOf(answer.status) !== -1 && method === "POST") { method = "GET"; body = ""; }
      url = next;
    }
    // The body, to the screen or a file.
    if (written) {
      if (o.output) {
        var why = this.writeFile(o.output, written, false);
        if (why) {
          io.err.write("Warning: Failed to open the file " + o.output + ": " + why.replace(o.output + ": ", "") + "\n");
          code = fail(23, "Failure writing output to destination");
        }
      } else io.out.write(written);
    }
    if (o["write-out"] !== undefined) {
      var vars = { http_code: last ? String(last.status) : "000", url_effective: urlText(url), remote_ip: remote, num_redirects: String(redirects),
        content_type: contentType, method: method, response_code: last ? String(last.status) : "0" };
      io.out.write(o["write-out"].replace(/%\{(\w+)\}/g, function (m, k) { return k in vars ? vars[k] : ""; })
        .replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r"));
    }
    this.reap();
    return { out: "", err: "", code: code };
  };

  // --- ssh HOST 'COMMAND': from another machine ------------------------------------------
  // Real ssh, but only for one command on a host the exercise lets you log in
  // to (`login: true`, your key already there), so a task can see the console
  // from outside: through its firewall, at its real address.
  var REMOTE_COMMANDS = ["nc", "curl", "ping", "hostname", "echo", "true", "false"];
  COMMANDS.ssh = function* (args, stdin, io) {
    if (this.origin) throw new Error("this console doesn't go another hop: run ssh from the console itself");
    var user = this.user, target = null, rest = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (target === null && a[0] === "-") {
        if (a === "-o" || a === "-i" || a === "-p" || a === "-l") {
          var v = args[++i];
          if (a === "-l") user = v;
          if (a === "-p" && v !== "22") throw new Error("the station's hosts all run sshd on 22; leave -p out");
          continue;
        }
        if (/^-[qT]+$/.test(a)) continue;
        throw new Error(a + " isn't supported on this console; ssh HOST 'COMMAND' is");
      }
      if (target === null) target = a; else rest.push(a);
    }
    if (target === null) return { out: "", err: "usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] [-b bind_address]\n           [-c cipher_spec] [-D [bind_address:]port] [-E log_file]\n           [-e escape_char] [-F configfile] [-I pkcs11] [-i identity_file]\n           [-J destination] [-L address] [-l login_name] [-m mac_spec]\n           [-O ctl_cmd] [-o option] [-P tag] [-p port] [-R address]\n           [-S ctl_path] [-W host:port] [-w local_tun[:remote_tun]]\n           destination [command [argument ...]]\n", code: 255 };
    if (target.indexOf("@") !== -1) { user = target.slice(0, target.indexOf("@")); target = target.slice(target.indexOf("@") + 1); }
    if (!rest.length) throw new Error("this console runs one command on another machine: ssh " + target + " 'COMMAND'");
    var found = this.resolveName(target);
    if (found.error) return { out: "", err: "ssh: Could not resolve hostname " + target + ": " + found.error + "\n", code: 255 };
    var c = this.connect(found.address, 22);
    var fail = { refused: "Connection refused", timeout: "Connection timed out", noroute: "No route to host", unreachable: "Network is unreachable" }[c.outcome];
    if (fail) {
      if (c.outcome === "timeout") this.clock += 134;
      if (c.outcome === "noroute") this.clock += 3;
      this.reap();
      return { out: "", err: "ssh: connect to host " + target + " port 22: " + fail + "\n", code: 255 };
    }
    var host = c.host;
    if (!host || !host.login) return { out: "", err: user + "@" + target + ": Permission denied (publickey).\n", code: 255 };
    this.origin = host;
    try {
      return yield* this.child(rest.join(" "), "bash", [], io);
    } finally {
      this.origin = null;
    }
  };

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

  // Which of `letters` comes last among the options (rm -fi asks, rm -if doesn't).
  function lastOf(rawArgs, letters) {
    var last = null;
    for (var i = 0; i < rawArgs.length && rawArgs[i] !== "--"; i++) {
      if (!/^-[a-zA-Z]+$/.test(rawArgs[i])) continue;
      rawArgs[i].slice(1).split("").forEach(function (l) { if (letters.indexOf(l) !== -1) last = l; });
    }
    return last;
  }

  // A yes-or-no question for -i: from the keyboard at the prompt, or a line of
  // standard input, as GNU's tools read it. Anything starting with y is yes.
  Shell.prototype.confirm = function* (question, io, out) {
    var answer;
    if (io.stdin.tty) answer = yield { prompt: question };
    else {
      out.err += question;
      var stream = io.stdin, nl = stream.text.indexOf("\n", stream.pos);
      if (stream.pos >= stream.text.length) answer = "";
      else if (nl === -1) { answer = stream.text.slice(stream.pos); stream.pos = stream.text.length; }
      else { answer = stream.text.slice(stream.pos, nl); stream.pos = nl + 1; }
    }
    return /^[yY]/.test(answer || "");
  };

  // rm -i: one question per file, and for a directory (with -r) "descend into"
  // first and "remove directory" last, skipped if anything inside was kept.
  Shell.prototype.removeAsking = function* (abs, shown, io, out) {
    var node = this.fs[abs];
    if (node.type !== "dir") {
      var kind = node.type === "link" ? "symbolic link" : size(node) ? "regular file" : "regular empty file";
      if (yield* this.confirm("rm: remove " + kind + " '" + shown + "'? ", io, out)) delete this.fs[abs];
      return;
    }
    var fs = this.fs;
    var inside = Object.keys(fs).filter(function (q) { return q.indexOf(abs + "/") === 0 && q.slice(abs.length + 1).indexOf("/") === -1; }).sort();
    if (inside.length && !(yield* this.confirm("rm: descend into directory '" + shown + "'? ", io, out))) return;
    for (var i = 0; i < inside.length; i++) yield* this.removeAsking(inside[i], shown.replace(/\/$/, "") + "/" + baseName(inside[i]), io, out);
    var left = Object.keys(fs).some(function (q) { return q.indexOf(abs + "/") === 0; });
    if (!left && (yield* this.confirm("rm: remove directory '" + shown + "'? ", io, out))) delete fs[abs];
  };

  // cp and mv: one source to a name, or several into a directory. With `asking`
  // (the command's io, for -i), overwriting an existing file is asked first.
  Shell.prototype.transfer = function* (cmd, args, recursive, move, asking) {
    if (args.length < 2) throw new Error(args.length ? "missing destination file operand after '" + args[0] + "'" : "missing file operand");
    var sh = this;
    var dest = args[args.length - 1];
    var sources = args.slice(0, -1);
    var destFound = this.lookup(dest);
    var intoDir = destFound.node && destFound.node.type === "dir";
    if (sources.length > 1 && !intoDir) return { out: "", err: cmd + ": target '" + dest + "': " + (destFound.node ? "Not a directory" : "No such file or directory") + "\n", code: 1 };
    var out = { err: "" }, declined = false;
    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      var s = sh.lookup(src, move); // mv moves a link; cp copies what it points to
      if (s.error) { out.err += cmd + ": cannot stat '" + src + "': " + s.error + "\n"; continue; }
      if (s.node.type === "dir" && !recursive) { out.err += "cp: -r not specified; omitting directory '" + src + "'\n"; continue; }
      if (!move && !sh.can(s.node, 4)) { out.err += "cp: cannot open '" + src + "' for reading: Permission denied\n"; continue; }
      var target = intoDir ? join(destFound.path, baseName(s.path)) : destFound.path;
      if (target === s.path) { out.err += cmd + ": '" + src + "' and '" + dest + "' are the same file\n"; continue; }
      if (target.indexOf(s.path + "/") === 0) { out.err += cmd + ": cannot " + (move ? "move" : "copy") + " '" + src + "' to a subdirectory of itself\n"; continue; }
      var why = sh.writableParent(target) || (move ? sh.writableParent(s.path) : null);
      if (why) { out.err += cmd + ": cannot " + (move ? "move" : "create regular file") + " '" + dest + "': " + why + "\n"; continue; }
      var existing = sh.fs[target];
      if (existing && existing.type === "dir" && s.node.type !== "dir") { out.err += cmd + ": cannot overwrite directory '" + target + "' with non-directory\n"; continue; }
      var shownTarget = intoDir ? dest.replace(/\/$/, "") + "/" + baseName(s.path) : dest;
      if (existing && asking && !(yield* sh.confirm(cmd + ": overwrite '" + shownTarget + "'? ", asking, out))) { declined = true; continue; }
      var paths = Object.keys(sh.fs).filter(function (q) { return q === s.path || q.indexOf(s.path + "/") === 0; });
      if (existing) sh.removeTree(target);
      paths.forEach(function (q) {
        var from = sh.fs[q];
        var copy = move
          ? from
          : { type: from.type, mode: from.mode & ~UMASK, owner: sh.user, group: sh.group, contents: from.contents, mtime: sh.now() };
        if (!move && from.size !== undefined) copy.size = from.size;
        if (!move && from.type === "link") copy.target = from.target;
        sh.fs[target + q.slice(s.path.length)] = copy;
      });
      if (move) paths.forEach(function (q) { delete sh.fs[q]; });
    }
    // GNU's mv answers 1 when a file was kept by declining; cp answers 0.
    return { out: "", err: out.err, code: out.err || (declined && move) ? 1 : 0 };
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
      var node = { type: n.type, mode: n.mode, owner: n.owner, group: n.group, contents: n.type === "file" ? n.contents : "", mtime: isoStamp(n.mtime) };
      if (n.type === "file" && n.size !== undefined) node.size = n.size;
      if (n.type === "link") node.target = n.target;
      out[p] = node;
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
    return checks.filter(function (c) { return passes(c, state, cwd, procs); }).length;
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
