// A module's bonus Python challenge (#54): an editor, Run and Submit, over
// OrbitPython (python.js). Run shows what the program prints. Submit also runs
// the hidden checks and reports which passed to the server, which records the
// browser's verdict (app/challenge.py). A failed check shows what it checks,
// in words, never its code.
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-challenge]");
    if (!root || !window.OrbitPython) return;
    var spec = JSON.parse(root.getAttribute("data-challenge"));
    var reportUrl = root.getAttribute("data-report");
    var editor = root.querySelector(".code-editor");
    var output = root.querySelector(".challenge-output");
    var checkList = root.querySelector(".challenge-checks");
    var status = root.querySelector(".challenge-status");
    var buttons = root.querySelectorAll("[data-run], [data-submit], [data-reset]");
    var loaded = false;
    var leaving = false;  // Esc then Tab: let Tab move focus instead of indenting

    root.querySelector(".challenge-nojs").hidden = true;
    root.querySelector(".challenge-ui").hidden = false;

    function csrfToken() {
      return JSON.parse(document.body.getAttribute("hx-headers"))["X-CSRF-Token"];
    }

    function busy(on) {
      buttons.forEach(function (b) { b.disabled = on; });
    }

    function show(result) {
      var text = [result.stdout, result.stderr, result.error].filter(Boolean).join("\n");
      if (result.timedOut) text = "Stopped: it was still running after " + window.OrbitPython.RUN_TIMEOUT_MS / 1000 + " seconds. Is there a loop that never ends?";
      output.textContent = text || "(no output)";
      output.classList.toggle("is-error", Boolean(result.error || result.timedOut));
      output.hidden = false;
    }

    function execute(withChecks) {
      busy(true);
      checkList.hidden = true;
      status.textContent = loaded ? "Running…" : "Starting Python (the first run takes a few seconds)…";
      return window.OrbitPython.run(editor.value, { inputs: spec.inputs, checks: withChecks ? spec.checks : [] })
        .then(function (result) {
          loaded = true;
          show(result);
          status.textContent = "";
          return result;
        })
        .catch(function (e) {
          status.textContent = "Python couldn't start: " + e.message;
          return null;
        })
        .finally(function () { busy(false); });
    }

    function listChecks(results) {
      checkList.innerHTML = "";
      results.forEach(function (ok, i) {
        var li = document.createElement("li");
        li.className = ok ? "is-right" : "is-wrong";
        li.textContent = (ok ? "✓ " : "✗ ") + spec.says[i];
        checkList.appendChild(li);
      });
      checkList.hidden = false;
    }

    function submit() {
      execute(true).then(function (result) {
        if (!result || result.timedOut) return;
        listChecks(result.checks);
        var failed = result.checks.filter(function (ok) { return !ok; }).length;
        return fetch(reportUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
          body: JSON.stringify({ code: editor.value, results: result.checks }),
        })
          .then(function (r) { return r.json(); })
          .then(function (body) {
            if (body.correct) {
              status.innerHTML = "";
              var passed = document.createElement("span");
              passed.className = "challenge-passed";
              passed.textContent = "✓ Passed";
              status.appendChild(passed);
              status.appendChild(document.createTextNode(body.xp_gained ? ": +" + body.xp_gained + " XP." : ". Every check passes."));
            } else {
              status.textContent = failed === 1 ? "One check failed. Read what it checks, then try again." : failed + " checks failed.";
            }
          })
          .catch(function () { status.textContent = "Your result couldn't be saved. Try Submit again."; });
      });
    }

    root.querySelector("[data-run]").addEventListener("click", function () { execute(false); });
    root.querySelector("[data-submit]").addEventListener("click", submit);
    root.querySelector("[data-reset]").addEventListener("click", function () {
      editor.value = spec.starter;
      editor.focus();
    });

    editor.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { leaving = true; return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); execute(false); return; }
      if (e.key === "Tab" && !e.shiftKey && !leaving) {
        e.preventDefault();
        editor.setRangeText("    ", editor.selectionStart, editor.selectionEnd, "end");
      }
      leaving = false;
    });
  });
})();
