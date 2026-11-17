(function () {
  "use strict";
  const { h } = OSUI;
  const host = document.getElementById("module-grid");
  const byNum = Object.fromEntries(OSData.modules.map((m) => [m.n, m]));
  OSData.parts.forEach((part, i) => {
    const id = "part-" + part.id;
    host.append(h("section", { "aria-labelledby": id, class: "part" },
      h("h3", { id, text: `Part ${i + 1}: ${part.title}` }), h("p", { class: "part-blurb", text: part.blurb }),
      h("ul", { class: "grid" }, part.modules.map((n) => {
        const m = byNum[n];
        return h("li", {}, h("a", { class: "card", href: `modules/${m.slug}.html` },
          h("span", { class: "num", text: `Module ${m.n}` }), h("h4", { text: m.title }), h("p", { text: m.summary }),
          h("div", {}, m.tags.map((t) => h("span", { class: "tag", text: t })))));
      }))));
  });
})();
