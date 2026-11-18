/* Any <button data-print> opens the browser's print dialog. */
(function () {
  "use strict";
  document.querySelectorAll("button[data-print]").forEach((b) => b.addEventListener("click", () => window.print()));
})();
