// The station console's shell, part 8 of 13 (#255): commands for files and
// disks. ls, cp, mv, rm, chmod, find, du, df, tar, gzip, ln and stat.
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var applyMode = S.applyMode, baseName = S.baseName, COMMANDS = S.COMMANDS,
    compareNames = S.compareNames, flags = S.flags, GiB = S.GiB, human = S.human, inputs = S.inputs,
    isoStamp = S.isoStamp, join = S.join, KiB = S.KiB, lastOf = S.lastOf, MiB = S.MiB,
    modeString = S.modeString, normalize = S.normalize, ok = S.ok, padLeft = S.padLeft,
    padRight = S.padRight, parentOf = S.parentOf, parseStamp = S.parseStamp, size = S.size,
    stamp = S.stamp, UMASK = S.UMASK, unlines = S.unlines, usage = S.usage, Shell = S.Shell,
    globRegex = S.globRegex;

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

  Object.assign(COMMANDS, {
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
  });

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
      // `dest/` means "into this directory": a file is never renamed to it (#229). A
      // directory may still be, as GNU allows `mv d newd/`.
      if (/\/$/.test(dest) && !intoDir && s.node.type !== "dir") {
        if (destFound.node || destFound.error === "Not a directory") out.err += cmd + ": cannot stat '" + dest + "': Not a directory\n";
        else out.err += (move ? "mv: cannot move '" + src + "' to '" : "cp: cannot create regular file '") + dest + "': Not a directory\n";
        continue;
      }
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

  Object.assign(S, { memHuman: memHuman });
});
