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
    var sh, history, at, reported;

    function print(text, cls) {
      if (!text) return;
      var line = document.createElement("div");
      line.className = "term-out" + (cls ? " " + cls : "");
      line.textContent = text.replace(/\n$/, "");
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }

    function setPrompt() {
      promptEl.textContent = sh.prompt();
    }

    function reset() {
      sh = new OrbitShell.Shell(spec);
      history = [];
      at = 0;
      reported = false;
      log.textContent = "";
      status.textContent = "";
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
        body: JSON.stringify({ state: sh.state(), cwd: sh.cwd, passed: true }),
        credentials: "same-origin",
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (body) {
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
      print(sh.prompt() + line, "term-echo");
      if (line.trim()) {
        if (history[history.length - 1] !== line) history.push(line);
        if (history.length > HISTORY_MAX) history.shift();
      }
      at = history.length;
      var result = sh.run(line);
      if (result.clear) log.textContent = "";
      print(result.output);
      setPrompt();
      if (!reported && sh.solved(spec.checks)) report();
    }

    function interrupt() {
      print(sh.prompt() + input.value + "^C", "term-echo");
      input.value = "";
      at = history.length;
    }

    function recall(step) {
      if (!history.length) return;
      at = Math.max(0, Math.min(history.length, at + step));
      input.value = at === history.length ? "" : history[at];
      input.setSelectionRange(input.value.length, input.value.length);
    }

    function complete() {
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
