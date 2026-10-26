// The station console's shell, part 7 of 13 (#255): the shell's own commands
// and its environment (cd, echo, set, read, trap, export, source, bash…).
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var COMMANDS = S.COMMANDS, flags = S.flags, MANUAL = S.MANUAL, ok = S.ok, padRight = S.padRight,
    unlines = S.unlines, renderHelp = S.renderHelp, TestError = S.TestError, BUILTINS = S.BUILTINS,
    KEYWORDS = S.KEYWORDS, quoteWord = S.quoteWord;

  function trapName(spec) {
    var s = String(spec).toUpperCase().replace(/^SIG/, "");
    if (s === "0" || s === "EXIT") return "EXIT";
    if (s === "ERR") return "ERR";
    return { 1: "HUP", 2: "INT", 15: "TERM", HUP: "HUP", INT: "INT", TERM: "TERM" }[s] || null;
  }

  // A word as bash shows it back (set -x, set, trap): quoted when it must be.

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

  Object.assign(COMMANDS, {
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
        "  services:  systemctl\n" +
        "  console:   clear help exit\n" +
        "  scripts:   if/elif/else, for, while/until, case, break continue, test [ ] [[ ]], read\n" +
        "  robust:    name() { … }, local return shift, set -euo pipefail, trap, <<EOF, mktemp\n" +
        "Pipes (|), redirection (> >> < 2> 2>&1 >&2 &>), globs (* ? [...]), {a,b}, ; && ||, $VARS, $(command) and $((1 + 2)) work.\n" +
        "Tab completes paths; ↑ and ↓ walk your history; Ctrl-C abandons a line.\n" +
        "Read about a command with `man CMD` or `CMD --help`, and about a builtin with `help NAME`.\n"
      );
    },
    clear: function () { return { out: "", err: "", code: 0, clear: true }; },
    pwd: function () { return ok(this.cwd + "\n"); },
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
  });
});
