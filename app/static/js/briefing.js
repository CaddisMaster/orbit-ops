// Mission briefings arrive as an incoming transmission: the story types itself
// out, and a click on it or any key shows the rest at once.
//
// Progressive enhancement. The server renders the full text, and this only
// hides and re-reveals it, so without JavaScript, or when the system prefers
// reduced motion, the briefing is simply there. A served file, not an inline
// script, so the CSP needs nothing new. Screen readers get a full copy rather
// than a half-typed one.
(function () {
  "use strict";

  var CHARS_PER_SECOND = 90;

  function textNodes(root, skip) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return skip.contains(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function transmit(el) {
    var header = el.querySelector(".comm-from") || document.createElement("span");
    var nodes = textNodes(el, header);
    var full = nodes.map(function (n) { return n.nodeValue; });
    var total = full.reduce(function (sum, t) { return sum + t.length; }, 0);
    if (!total) return;

    var copy = document.createElement("div");
    copy.className = "visually-hidden";
    copy.innerHTML = el.innerHTML;
    el.after(copy);
    el.setAttribute("aria-hidden", "true");

    // Hold the full height while typing so the lesson below doesn't creep down.
    // (Setting a style through the CSSOM is not an inline style the CSP blocks.)
    el.style.minHeight = el.offsetHeight + "px";
    nodes.forEach(function (n) { n.nodeValue = ""; });
    el.classList.add("is-typing");

    var started = null;
    var done = false;

    function show(count) {
      var left = count;
      nodes.forEach(function (n, i) {
        var take = Math.max(0, Math.min(full[i].length, left));
        n.nodeValue = full[i].slice(0, take);
        left -= take;
      });
    }

    function finish() {
      if (done) return;
      done = true;
      show(total);
      el.classList.remove("is-typing");
      el.style.minHeight = "";
      el.removeAttribute("aria-hidden");
      copy.remove();
      el.removeEventListener("click", finish);
      document.removeEventListener("keydown", finish);
    }

    function frame(now) {
      if (done) return;
      if (started === null) started = now;
      var count = Math.floor(((now - started) / 1000) * CHARS_PER_SECOND);
      if (count >= total) return finish();
      show(count);
      requestAnimationFrame(frame);
    }

    el.addEventListener("click", finish);
    document.addEventListener("keydown", finish);
    requestAnimationFrame(frame);
  }

  function start() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll("[data-transmission]").forEach(transmit);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
