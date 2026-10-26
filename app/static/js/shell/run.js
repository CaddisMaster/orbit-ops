// The station console's shell, part 6 of 13 (#255): running what the parser
// read. Lists, pipelines, redirects, compound commands, jobs and signals,
// scripts and functions, and finding a command by name.
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var COMMANDS = S.COMMANDS, join = S.join, MANUAL = S.MANUAL, ok = S.ok, padRight = S.padRight,
    Sink = S.Sink, Shell = S.Shell, SHELL_PID = S.SHELL_PID, ExpansionError = S.ExpansionError,
    Incomplete = S.Incomplete, Interrupt = S.Interrupt, parse = S.parse,
    parseScript = S.parseScript, plain = S.plain, Runaway = S.Runaway, SyntaxErr = S.SyntaxErr,
    Unsupported = S.Unsupported, renderHelp = S.renderHelp, renderUsage = S.renderUsage,
    globRegex = S.globRegex;

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
    var first = command.replace(/^-+/, "").split(" ")[0]; // the same rule as app/content/schema/terminal/system.py proc_name()
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

  function quoteWord(w, always) {
    if (!always && /^[A-Za-z0-9_@%+=:,.\/-]+$/.test(w)) return w;
    return "'" + String(w).replace(/'/g, "'\\''") + "'";
  }
  function xtrace(assigns, argv) {
    return assigns.map(function (a) { return "+ " + a[0] + "=" + quoteWord(a[1]) + "\n"; }).join("") +
      (argv.length ? "+ " + argv.map(function (w) { return quoteWord(w); }).join(" ") + "\n" : "");
  }

  // All that `ssh HOST 'COMMAND'` can run on another host (network.js).
  var REMOTE_COMMANDS = ["nc", "curl", "ping", "hostname", "echo", "true", "false"];

  Object.assign(S, { BUILTINS: BUILTINS, jobLine: jobLine, KEYWORDS: KEYWORDS, procName: procName,
    quoteWord: quoteWord, signalName: signalName });
});
