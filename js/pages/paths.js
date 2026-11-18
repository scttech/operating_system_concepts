/* Study paths page. The steps are in js/data/paths.js; link resolution is in js/lib/guide.js. */
(function () {
  "use strict";
  const base = document.body.dataset.root || "";
  const { h } = OSUI;
  const L = OSLib, $ = (id) => document.getElementById(id);
  const sel = $("path"), view = $("path-view");
  sel.append(...OSData.paths.map((p) => h("option", { value: p.id, text: p.title })));

  function show(id) {
    const p = OSData.paths.find((x) => x.id === id) || OSData.paths[0], sum = L.pathSummary(p, OSData);
    sel.value = p.id;
    try { history.replaceState(null, "", "#" + p.id); } catch (e) { /* some file:// contexts */ }
    const lab = sum.labs.length ? `, ${sum.labs.length} lab${sum.labs.length > 1 ? "s" : ""} (about ${sum.labMinutes} minutes of lab time)` : "";
    view.replaceChildren(
      h("h2", { text: p.title }),
      h("p", { class: "lead", text: p.goal }),
      h("p", { class: "small" }, h("b", { text: "For: " }), p.who),
      h("p", { class: "small", text: `${sum.modules.length} module${sum.modules.length > 1 ? "s" : ""}${lab}. Allow time for the practice and for rereading; most people need more than one sitting.` }),
      h("ol", { class: "path-steps" }, p.steps.map((s) => { const r = L.resolveStep(s, OSData);
        return h("li", {}, h("span", { class: "tag step-" + r.t, text: r.kind }), " ", h("a", { href: base + r.href, text: r.label }), h("span", { class: "small" }, " — " + r.note)); })));
  }
  sel.addEventListener("change", () => show(sel.value));
  const wanted = OSSite && OSSite.safeDecode ? OSSite.safeDecode(location.hash || "").slice(1) : "";
  show(wanted);
})();
