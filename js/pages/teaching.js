/* Teaching notes page. The notes are in js/data/teaching.js, the prompts in js/data/prompts.js. */
(function () {
  "use strict";
  const base = document.body.dataset.root || "";
  const { h } = OSUI;
  const L = OSLib, $ = (id) => document.getElementById(id);
  const sel = $("mod"), view = $("notes");
  sel.append(h("option", { value: "all", text: "All modules" }), ...OSData.readingOrder.map((n) => h("option", { value: n, text: `${n}. ${OSData.modules.find((m) => m.n === n).title}` })));

  function block(n) {
    const m = OSData.modules.find((x) => x.n === n), t = OSData.teaching[n], prompts = L.promptsFor(n, OSData);
    const link = (href, text) => h("a", { href: base + href, text });
    return h("section", { class: "teach-module" },
      h("h2", { id: `module-${n}` }, `Module ${n}: ${m.title} `, h("a", { class: "small no-print", href: base + `modules/${m.slug}.html`, text: "(open the lesson)" })),
      h("h3", { text: "Misconceptions to listen for" }),
      h("ul", {}, t.misconceptions.map(([wrong, right]) => h("li", {}, h("b", { text: "Students may think: " }), wrong, " ", h("b", { text: "In fact: " }), right))),
      h("h3", { text: "A demonstration to run" }),
      t.demos.map((d) => h("div", { class: "demo" }, h("h4", {}, d.title, " ", d.to ? link(L.targetPath(d.to, n, OSData), "(open it)") : null), h("ol", {}, d.steps.map((s) => h("li", { text: s }))))),
      h("h3", { text: "Discussion prompts, and what a good answer contains" }),
      h("ol", {}, prompts.map((p) => h("li", {}, h("b", { text: p.kind + ": " }), p.text, p.href ? [" ", link(p.href, p.label || "Open")] : null,
        h("p", { class: "listen" }, h("b", { text: "Listen for: " }), p.listen)))));
  }

  function render() {
    const list = sel.value === "all" ? OSData.readingOrder : [+sel.value];
    view.replaceChildren(...list.map(block));
    try { history.replaceState(null, "", sel.value === "all" ? location.pathname : "#module-" + sel.value); } catch (e) { /* ignore */ }
  }
  sel.addEventListener("change", render);
  const m = /^#module-([0-9]+)$/.exec(location.hash || "");
  if (m && OSData.teaching[+m[1]]) sel.value = m[1];
  render();
})();
