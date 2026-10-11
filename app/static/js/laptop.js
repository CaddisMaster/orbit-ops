// The laptop's lid (#55): close it to see the room, open it to carry on. It's
// the same page throughout, never reloaded, so the scroll position, a
// half-typed console command and the comms log are as you left them. While
// shut, the screen is inert: out of the tab order and hidden from assistive
// tech. Without JavaScript the buttons stay hidden and the laptop stays open.
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var laptop = document.getElementById("laptop");
    if (!laptop) return;
    var lid = laptop.querySelector(".lid");
    var close = laptop.querySelector(".lid-close");
    var open = laptop.querySelector(".laptop-open");

    close.hidden = false;
    close.addEventListener("click", function () {
      laptop.classList.add("is-closed");
      lid.inert = true;
      open.hidden = false;
      open.focus();
    });
    open.addEventListener("click", function () {
      laptop.classList.remove("is-closed");
      lid.inert = false;
      open.hidden = true;
      close.focus({ preventScroll: true });
    });
  });
})();
