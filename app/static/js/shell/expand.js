// The station console's shell, part 5 of 13 (#255): expanding words.
// Parameters, globs, braces, $(…), arithmetic, and test / [[ ]].
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var compareNames = S.compareNames, join = S.join, normalize = S.normalize, Sink = S.Sink,
    size = S.size, Shell = S.Shell, SHELL_PID = S.SHELL_PID, BINARY = S.BINARY,
    ExpansionError = S.ExpansionError, lex = S.lex, parseScript = S.parseScript, UNARY = S.UNARY,
    Unsupported = S.Unsupported;

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

  Object.assign(S, { globRegex: globRegex, TestError: TestError });
});
