(function () {
  "use strict";
  const { h } = OSUI;
  const host = document.getElementById("module-grid");
  const byNum = Object.fromEntries(OSData.modules.map((m) => [m.n, m]));
  const KEY = "osc-parts-collapsed"; // a per-reader convenience; the page works without it

  // Which parts the reader folded away last time (never required).
  let folded = [];
  try { folded = JSON.parse(localStorage.getItem(KEY) || "[]").filter((x) => typeof x === "string"); } catch (e) { folded = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(folded)); } catch (e) { /* ignore */ } };

  const sections = []; // { id, section, button, grid, chev }
  const setOpen = (s, open, remember) => {
    s.grid.hidden = !open;
    s.button.setAttribute("aria-expanded", String(open));
    s.section.classList.toggle("collapsed", !open);
    if (remember) { folded = folded.filter((x) => x !== s.id); if (!open) folded.push(s.id); save(); }
  };

  OSData.parts.forEach((part, i) => {
    const id = "part-" + part.id, gridId = id + "-modules";
    const grid = h("ul", { class: "grid", id: gridId }, part.modules.map((n) => {
      const m = byNum[n];
      return h("li", {}, h("a", { class: "card", href: `modules/${m.slug}.html` },
        h("span", { class: "num", text: `Module ${m.n}` }), h("h4", { text: m.title }), h("p", { text: m.summary }),
        h("div", {}, m.tags.map((t) => h("span", { class: "tag", text: t })))));
    }));
    // The heading keeps its id (module pages link to #part-…); the button inside it is the control.
    const button = h("button", { type: "button", class: "part-toggle", "aria-expanded": "true", "aria-controls": gridId },
      `Part ${i + 1}: ${part.title}`);
    const count = h("span", { class: "part-count small", text: `${part.modules.length} modules` });
    const section = h("section", { "aria-labelledby": id, class: "part" },
      h("div", { class: "part-head" }, h("h3", { id }, button), count), h("p", { class: "part-blurb", text: part.blurb }), grid);
    const s = { id: part.id, section, button, grid, count, part };
    sections.push(s);
    button.addEventListener("click", () => setOpen(s, grid.hidden, true));
    host.append(section);
  });

  // Expand all / Collapse all
  const all = (open) => sections.forEach((s) => setOpen(s, open, true));
  host.before(h("div", { class: "part-tools", role: "group", "aria-label": "Show or hide all parts" },
    h("button", { type: "button", class: "btn secondary", text: "Expand all", onclick: () => all(true) }),
    h("button", { type: "button", class: "btn secondary", text: "Collapse all", onclick: () => all(false) })));

  sections.forEach((s) => setOpen(s, !folded.includes(s.id), false));
  // A link such as index.html#part-concurrency must land on an open part.
  const openFromHash = () => {
    const s = sections.find((x) => "#part-" + x.id === location.hash);
    if (s) { setOpen(s, true, true); s.section.scrollIntoView(); }
  };
  openFromHash();
  window.addEventListener("hashchange", openFromHash);

  // Show private progress on the cards, when there is any (it lives only in this browser).
  if (window.OSProgress) {
    const rows = window.OSProgress.summary().rows;
    rows.forEach((r) => {
      const card = [...host.querySelectorAll(".card")].find((c) => c.querySelector(".num").textContent === `Module ${r.n}`);
      if (card && (r.visited || r.answered)) card.querySelector("p").after(h("p", { class: "small progress-chip", text: `${r.visited ? "Visited" : ""}${r.visited && r.answered ? " · " : ""}${r.answered ? `${r.mastered} of ${r.total} questions mastered` : ""}` }));
    });
    // So a folded part still shows how far along you are.
    sections.forEach((s) => {
      const seen = s.part.modules.filter((n) => { const r = rows.find((x) => x.n === n); return r && r.visited; }).length;
      if (seen) s.count.textContent = `${s.part.modules.length} modules · ${seen} visited`;
    });
  }
})();
