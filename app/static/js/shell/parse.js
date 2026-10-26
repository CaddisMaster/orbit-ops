// The station console's shell, part 3 of 13 (#255): reading a command line.
// The lexer and the parser that turn a line or a script into commands, and
// the errors they throw.
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

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

  // awk or sed outside the subset text.js has (#41): refused, never guessed.
  function Unsupported(what) { this.message = what; }

  Object.assign(S, { BINARY: BINARY, ExpansionError: ExpansionError, Incomplete: Incomplete,
    Interrupt: Interrupt, lex: lex, parse: parse, parseScript: parseScript, plain: plain,
    Runaway: Runaway, SyntaxErr: SyntaxErr, UNARY: UNARY, Unsupported: Unsupported });
});
