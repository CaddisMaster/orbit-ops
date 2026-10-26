// The station console's shell, part 9 of 13 (#255): commands for text.
// grep, wc, sort, uniq, tee, head, tail, cut, awk and sed.
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var COMMANDS = S.COMMANDS, flags = S.flags, inputs = S.inputs, lines = S.lines,
    padLeft = S.padLeft, parentOf = S.parentOf, unlines = S.unlines, Unsupported = S.Unsupported;

  Object.assign(COMMANDS, {
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
  });

  // --- awk and sed: small, honest subsets (#41) ------------------------------------------
  // Enough for what Unit 1.1 teaches, with GNU-accurate output. Anything outside
  // the subset is refused with a clear message, never silently answered wrong.

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

});
