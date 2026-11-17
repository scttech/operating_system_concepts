(function () {
  "use strict";
  const { h } = OSUI;
  const grid = document.getElementById("module-grid");
  OSData.modules.forEach((m) => {
    grid.append(h("li", {}, h("a", { class: "card", href: `modules/${m.slug}.html` },
      h("span", { class: "num", text: `Module ${m.n}` }), h("h3", { text: m.title }), h("p", { text: m.summary }),
      h("div", {}, m.tags.map((t) => h("span", { class: "tag", text: t }))))));
  });
})();
