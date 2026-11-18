/* Hands-on (Docker) index page: the list of labs, from js/data/handson.js. */
(function () {
  "use strict";
  const { h } = OSUI;
  const grid = document.getElementById("handson-grid");
  if (!grid) return;
  const mods = Object.fromEntries(OSData.modules.map((m) => [m.n, m]));
  OSData.handson.forEach((l) => {
    grid.append(h("li", {}, h("a", { class: "card", href: `${l.slug}.html` },
      h("span", { class: "num", text: `Lab ${l.n} · about ${l.minutes} minutes · ${l.level}` }), h("h3", { text: l.title }), h("p", { text: l.summary }),
      h("div", {}, l.related.map((n) => h("span", { class: "tag", text: `Module ${n}: ${mods[n].title}` }))),
      l.needs.length ? h("p", { class: "small", style: "margin-top:.5rem", text: `Do first: ${l.needs.map((n) => "Lab " + n).join(", ")}` }) : null)));
  });
})();
