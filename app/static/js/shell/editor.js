// The station console's shell, part 4 of 13 (#255): nano, the pager (less,
// more) and man, as state objects console.js draws in the panel (#66).
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var COMMANDS = S.COMMANDS, lines = S.lines, MANUAL = S.MANUAL, ok = S.ok;

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

  Object.assign(COMMANDS, {
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
  });

  Object.assign(S, { countLines: countLines, Nano: Nano, Pager: Pager, renderHelp: renderHelp,
    renderUsage: renderUsage });
});
