/* Lab pages: a Copy button for every code listing. */
(function () {
  "use strict";
  const { h } = OSUI;
  document.querySelectorAll("pre.code").forEach((pre) => {
    const src = pre.dataset.src || "";
    const name = src.split("/").pop();
    const bar = h("div", { class: "codebar" }, h("span", { class: "small", text: name }),
      h("a", { href: `code/${name}`, download: name, text: "Download" }));
    const btn = h("button", { type: "button", class: "btn secondary", text: "Copy", "aria-label": `Copy ${name} to the clipboard` });
    btn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(pre.textContent); btn.textContent = "Copied"; }
      catch (e) { btn.textContent = "Select the code and press Ctrl+C"; }
      setTimeout(() => { btn.textContent = "Copy"; }, 2000);
    });
    bar.append(btn);
    pre.before(bar);
  });
})();
