// The comms log (#38): messages that arrive on this page view come in one at
// a time, each after a moment of "… is typing". A click on the log or the
// Escape key brings the rest in at once; under reduced motion they're all
// simply there. Without JavaScript nothing is hidden (the hiding rule needs
// the js-comms class this file adds).
//
// New lines come from the server: a first visit's briefing in the page, the
// debrief in the completing quiz answer (htmx, out of band), and the console's
// reply in its report response (console.js inserts it, then fires
// "comms:arrived").
(function () {
  "use strict";

  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var busy = false;
  var log;

  function pending() {
    return log ? Array.prototype.slice.call(log.querySelectorAll(".comms-line.is-new:not(.shown)")) : [];
  }

  function scroll() { if (log) log.scrollTop = log.scrollHeight; }

  function showAll() {
    pending().forEach(function (line) { line.classList.add("shown"); });
    var typing = log && log.querySelector(".comms-typing");
    if (typing) typing.remove();
    busy = false;
    scroll();
  }

  function next() {
    var line = pending()[0];
    if (!line) { busy = false; return; }
    busy = true;
    var typing = document.createElement("p");
    typing.className = "comms-typing";
    typing.setAttribute("aria-hidden", "true");
    typing.textContent = line.querySelector(".who").firstChild.textContent.trim() + " is typing";
    log.appendChild(typing);
    scroll();
    var chars = line.querySelector(".said").textContent.length;
    setTimeout(function () {
      if (!typing.isConnected) return; // skipped meanwhile
      typing.remove();
      line.classList.add("shown");
      scroll();
      setTimeout(next, 250);
    }, Math.max(600, Math.min(1800, chars * 22)));
  }

  function arrive() {
    if (!log) return;
    if (still) return showAll();
    if (!busy) next();
  }

  function start() {
    log = document.getElementById("comms-log");
    if (!log) return;
    document.documentElement.classList.add("js-comms");
    log.addEventListener("click", showAll);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") showAll(); });
    document.body.addEventListener("htmx:afterSettle", arrive);
    document.addEventListener("comms:arrived", arrive);
    scroll();
    arrive();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
