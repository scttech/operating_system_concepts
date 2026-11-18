(function () {
  "use strict";
  const base = document.body.dataset.root || "";
  const { h } = OSUI;
  const grid = document.getElementById("lab-grid");
  const mods = Object.fromEntries(OSData.modules.map((m) => [m.n, m]));
  OSData.labs.forEach((l) => {
    grid.append(h("li", {}, h("a", { class: "card", href: base + `labs/${l.slug}.html` },
      h("span", { class: "num", text: `Lab ${l.n} · about ${l.minutes} minutes` }), h("h3", { text: l.title }), h("p", { text: l.summary }),
      h("div", {}, l.related.map((n) => h("span", { class: "tag", text: `Module ${n}: ${mods[n].title}` }))),
      h("p", { class: "small", style: "margin-top:.5rem", text: l.platform }))));
  });
})();
