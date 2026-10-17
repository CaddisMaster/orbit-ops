// The station console on a module page (#17): a terminal drawn with our own
// markup (a scrolling log and a real <input> as the prompt line) over the
// simulated shell in shell.js. Not xterm.js: its renderer injects <style>
// elements, which `style-src 'self'` rightly blocks.
//
// Grading happens here as you go, for instant feedback, and again on the
// server: the first time the checks pass, the console POSTs the filesystem it
// ended with, and the server's verdict is the one recorded (app/terminal.py).
(function () {
  "use strict";

  var HISTORY_MAX = 100;

  function csrfToken() {
    try {
      return JSON.parse(document.body.getAttribute("hx-headers"))["X-CSRF-Token"];
    } catch (e) {
      return "";
    }
  }

  function mount(root) {
    var spec = JSON.parse(root.getAttribute("data-terminal"));
    var reportUrl = root.getAttribute("data-report");
    var term = root.querySelector(".term");
    var log = root.querySelector(".term-log");
    var form = root.querySelector(".term-line");
    var input = root.querySelector(".term-input");
    var promptEl = root.querySelector(".term-prompt");
    var status = root.querySelector(".term-status");
    var keysBar = root.querySelector("[data-shell-only]");
    var editorEl = root.querySelector(".term-editor");
    var textarea = root.querySelector(".nano-text");
    var nanoName = root.querySelector(".nano-name");
    var nanoFlag = root.querySelector(".nano-flag");
    var nanoMessage = root.querySelector(".nano-message");
    var pagerEl = root.querySelector(".term-pager");
    var pagerText = root.querySelector(".pager-text");
    var pagerStatus = root.querySelector(".pager-status");
    var pagerFind = root.querySelector(".pager-find");
    var pagerInput = root.querySelector(".pager-input");
    var PAGER_ROWS = 16;
    var sh, history, at, reported, before, changed;
    var editor = null, pager = null, clipboard = "", leaving = false;

    function print(text, cls) {
      if (!text) return;
      var line = document.createElement("div");
      line.className = "term-out" + (cls ? " " + cls : "");
      line.textContent = text.replace(/\n$/, "");
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }

    // sudo's password prompt: the input is masked, and what's typed is never
    // echoed into the log or kept in the history, as on a real terminal.
    function setPrompt() {
      promptEl.textContent = sh.prompt();
      var secret = !!(sh.pending && sh.pending.secret);
      input.type = secret ? "password" : "text";
      input.setAttribute("aria-label", secret ? "Password" : "Command");
    }

    // --- the shell, nano or the pager: one owns the panel at a time ---------------
    function show(mode) {
      log.hidden = form.hidden = mode !== "shell";
      editorEl.hidden = mode !== "editor";
      pagerEl.hidden = mode !== "pager";
      keysBar.hidden = mode !== "shell";
    }

    // After the shell runs: print, then hand the panel to whatever the command
    // opened, or back to the prompt.
    function settle(result) {
      if (result.clear) log.textContent = "";
      print(result.output);
      var p = sh.pending;
      if (p && p.editor) openEditor(p.editor);
      else if (p && p.pager) openPager(p.pager);
      else {
        editor = pager = null;
        show("shell");
        setPrompt();
        input.focus();
      }
      if (!reported && sh.solved(spec.checks)) report();
      else if (!reported) showProgress();
    }

    // What the task's checks can see: once it differs from the start, the
    // learner has changed something, and the status line counts the checks.
    function snapshot() {
      return JSON.stringify([sh.state(), sh.cwd, sh.processes()]);
    }

    function showProgress() {
      if (!changed) changed = snapshot() !== before;
      status.textContent = OrbitShell.progressNote(sh.progress(spec.checks), spec.checks.length, changed);
    }

    function openEditor(ed) {
      editor = ed;
      leaving = false;
      textarea.value = ed.text;
      nanoName.textContent = ed.name;
      show("editor");
      drawEditor();
      textarea.focus();
      textarea.setSelectionRange(0, 0);
      textarea.scrollTop = 0;
    }

    function drawEditor() {
      nanoFlag.textContent = editor.modified(textarea.value) ? "Modified" : "";
      var asking = editor.prompt();
      nanoMessage.classList.toggle("is-prompt", !!asking);
      nanoMessage.textContent = "";
      if (asking) nanoMessage.textContent = asking;
      else if (editor.message) {
        var span = document.createElement("span");
        span.textContent = editor.message;
        nanoMessage.appendChild(span);
      }
    }

    function editorKey(k) {
      editor.key(k, textarea.value);
      if (editor.done) settle(sh.answer());
      else drawEditor();
    }

    // ^K cuts the line the cursor is on (into nano's own cutbuffer); ^U pastes it.
    function cutLine() {
      var v = textarea.value;
      var start = v.lastIndexOf("\n", textarea.selectionStart - 1) + 1;
      var end = v.indexOf("\n", textarea.selectionStart);
      end = end === -1 ? v.length : end + 1;
      clipboard = v.slice(start, end);
      textarea.setRangeText("", start, end, "start");
    }
    function pasteLine() {
      var v = textarea.value;
      var start = v.lastIndexOf("\n", textarea.selectionStart - 1) + 1;
      textarea.setRangeText(clipboard, start, start, "end");
    }

    textarea.addEventListener("keydown", function (e) {
      if (!editor) return;
      var ctrl = e.ctrlKey && !e.metaKey && !e.altKey ? e.key.toLowerCase() : null;
      if (editor.mode !== "edit") {
        // Write Out's or Exit's question: the keys answer it, the text is untouched.
        if (e.key === "Tab") return;
        e.preventDefault();
        if (e.key === "Enter") editorKey("Enter");
        else if (ctrl === "c") editorKey("^C");
        else if (e.key.length === 1) editorKey(e.key);
        return;
      }
      if (e.key === "Escape") { leaving = true; return; }
      if (e.key === "Tab" && !e.shiftKey && !leaving) { e.preventDefault(); textarea.setRangeText("\t", textarea.selectionStart, textarea.selectionEnd, "end"); drawEditor(); return; }
      leaving = false;
      if (ctrl === "o") { e.preventDefault(); editorKey("^O"); }
      else if (ctrl === "x") { e.preventDefault(); editorKey("^X"); }
      else if (ctrl === "k") { e.preventDefault(); cutLine(); drawEditor(); }
      else if (ctrl === "u") { e.preventDefault(); pasteLine(); drawEditor(); }
    });
    textarea.addEventListener("input", function () { if (editor) drawEditor(); });

    function openPager(pg) {
      pager = pg;
      pager.height = PAGER_ROWS;
      pagerFind.hidden = true;
      show("pager");
      drawPager();
      pagerEl.focus();
    }

    function drawPager() {
      var view = pager.view();
      pagerText.textContent = "";
      var re = null;
      if (view.pattern) { try { re = new RegExp(view.pattern, "g"); } catch (e) { re = null; } }
      view.lines.forEach(function (line, i) {
        if (i) pagerText.appendChild(document.createTextNode("\n"));
        if (!re) { pagerText.appendChild(document.createTextNode(line)); return; }
        var last = 0;
        line.replace(re, function (m, offset) {
          if (!m) return m;
          pagerText.appendChild(document.createTextNode(line.slice(last, offset)));
          var mark = document.createElement("mark");
          mark.textContent = m;
          pagerText.appendChild(mark);
          last = offset + m.length;
          return m;
        });
        pagerText.appendChild(document.createTextNode(line.slice(last)));
      });
      for (var k = view.lines.length; k < PAGER_ROWS; k++) {
        var tilde = document.createElement("span");
        tilde.className = "pager-tilde";
        tilde.textContent = (k ? "\n" : "") + "~";
        pagerText.appendChild(tilde);
      }
      pagerStatus.textContent = view.status;
    }

    var PAGER_KEYS = [" ", "f", "b", "j", "k", "g", "G", "n", "N", "h", "q", "Q", "Enter",
      "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"];
    pagerEl.addEventListener("keydown", function (e) {
      if (!pager || e.target !== pagerEl || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        pagerFind.hidden = false;
        pagerStatus.textContent = "";
        pagerInput.value = "";
        pagerInput.focus();
        return;
      }
      if (PAGER_KEYS.indexOf(e.key) === -1) return;
      e.preventDefault();
      pager.key(e.key);
      if (pager.done) settle(sh.answer());
      else drawPager();
    });
    pagerFind.addEventListener("submit", function (e) {
      e.preventDefault();
      pagerFind.hidden = true;
      pager.search(pagerInput.value);
      drawPager();
      pagerEl.focus();
    });
    pagerInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); pagerFind.hidden = true; drawPager(); pagerEl.focus(); }
    });

    function reset() {
      sh = new OrbitShell.Shell(spec);
      history = [];
      at = 0;
      reported = false;
      before = snapshot();
      changed = false;
      log.textContent = "";
      status.textContent = "";
      editor = pager = null;
      show("shell");
      print("Meridian station console · " + spec.user + " · type `help` for commands", "term-banner");
      setPrompt();
    }

    function report() {
      reported = true;
      print(spec.success, "term-success");
      status.textContent = "Reporting to the bridge…";
      fetch(reportUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
        body: JSON.stringify({ state: sh.state(), cwd: sh.cwd, processes: sh.processes(), passed: true }),
        credentials: "same-origin",
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (body) {
          var commsLog = document.getElementById("comms-log");
          if (body.comms && commsLog) {
            // The crew's reply: server-rendered markup from our own template.
            commsLog.insertAdjacentHTML("beforeend", body.comms);
            document.dispatchEvent(new CustomEvent("comms:arrived"));
          }
          var outside = document.getElementById("window-event");
          if (body.window && outside) outside.outerHTML = body.window; // a window event, once
          status.textContent = body.correct
            ? "Logged: task complete."
            : "The bridge couldn't confirm that. Check the task and try again.";
          if (!body.correct) reported = false;
        })
        .catch(function () {
          status.textContent = "Couldn't reach the bridge. Your work is still here; try another command to resend.";
          reported = false;
        });
    }

    function runLine(line) {
      var secret = !!(sh.pending && sh.pending.secret);
      print(sh.prompt() + (secret ? "" : line), "term-echo");
      if (line.trim() && !secret) {
        if (history[history.length - 1] !== line) history.push(line);
        if (history.length > HISTORY_MAX) history.shift();
        // What a hint sees of the attempt (#123): recent commands, never a masked line.
        var tried = root.querySelector("#hint-attempt-console");
        if (tried) tried.value = history.slice(-15).join("\n");
      }
      at = history.length;
      settle(sh.run(line));
    }

    function interrupt() {
      var secret = !!(sh.pending && sh.pending.secret);
      print(sh.prompt() + (secret ? "" : input.value) + "^C", "term-echo");
      var result = sh.cancel(); // a script's INT and EXIT traps may print
      input.value = "";
      at = history.length;
      if (result) settle(result);
      else setPrompt();
    }

    function recall(step) {
      if (!history.length || sh.pending) return;
      at = Math.max(0, Math.min(history.length, at + step));
      input.value = at === history.length ? "" : history[at];
      input.setSelectionRange(input.value.length, input.value.length);
    }

    function complete() {
      if (sh.pending) return;
      var c = sh.complete(input.value);
      input.value = c.line;
      if (c.options.length) {
        print(sh.prompt() + c.line, "term-echo");
        print(c.options.join("  "));
      }
    }

    var keys = {
      Tab: complete,
      "Ctrl-C": interrupt,
      Up: function () { recall(-1); },
      Down: function () { recall(1); },
    };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var line = input.value;
      input.value = "";
      runLine(line);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); complete(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); recall(-1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); recall(1); }
      else if (e.ctrlKey && (e.key === "c" || e.key === "C")) { e.preventDefault(); interrupt(); }
      else if (e.ctrlKey && (e.key === "l" || e.key === "L")) { e.preventDefault(); log.textContent = ""; }
    });

    root.querySelectorAll("[data-key]").forEach(function (button) {
      // pointerdown + preventDefault keeps focus (and a phone's keyboard) on the input.
      button.addEventListener("pointerdown", function (e) { e.preventDefault(); });
      button.addEventListener("click", function () {
        keys[button.getAttribute("data-key")]();
        input.focus();
      });
    });

    root.querySelector("[data-reset]").addEventListener("click", function () {
      reset();
      input.focus();
    });

    log.addEventListener("click", function () {
      if (!window.getSelection().toString()) input.focus();
    });

    reset();
    root.querySelectorAll("[data-needs-js]").forEach(function (el) { el.hidden = false; });
    root.querySelector(".term-nojs").hidden = true;
    term.hidden = false;
  }

  function start() {
    document.querySelectorAll("[data-terminal]").forEach(mount);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
