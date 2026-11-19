/* Site chrome: header, footer, module pager, theme toggle, glossary tooltips. */
(function () {
  "use strict";
  const body = document.body;
  const root = body.dataset.root || "";
  const modules = (window.OSData && window.OSData.modules) || [];
  const page = body.dataset.page || "";
  const modNum = body.dataset.module ? +body.dataset.module : null;

  // Theme (persisted, but never required)
  try {
    const saved = localStorage.getItem("osc-theme");
    if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
  } catch (e) { /* storage unavailable */ }

  const links = [
    ["index.html", "Home", ["home"]], ["pages/labs.html", "Labs", ["labs"]],
    ["pages/study.html", "Study tools", ["study", "practice", "problems", "flashcards", "scenarios", "exam", "progress", "handouts", "paths", "teaching"]],
    ["pages/glossary.html", "Glossary", ["glossary"]], ["pages/faq.html", "FAQ", ["faq"]],
    ["pages/cheatsheet.html", "Cheat sheet", ["cheatsheet"]], ["pages/search.html", "Search", ["search"]]
  ];
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Main");
  links.forEach(([href, text, keys]) => {
    const a = document.createElement("a");
    a.href = root + href; a.textContent = text;
    if (keys.includes(page)) a.setAttribute("aria-current", "page");
    nav.append(a);
  });
  const modSel = document.createElement("select");
  modSel.setAttribute("aria-label", "Jump to module");
  const parts = (window.OSData && window.OSData.parts) || [];
  const optionFor = (m) => `<option value="${m.slug}"${m.n === modNum ? " selected" : ""}>${m.n}. ${m.title}</option>`;
  modSel.innerHTML = '<option value="">Modules…</option>' + (parts.length
    ? parts.map((pt, k) => `<optgroup label="Part ${k + 1}: ${pt.title}">${pt.modules.map((n) => modules.find((m) => m.n === n)).filter(Boolean).map(optionFor).join("")}</optgroup>`).join("")
    : modules.map(optionFor).join(""));
  modSel.addEventListener("change", () => { if (modSel.value) location.href = `${root}modules/${modSel.value}.html`; });
  nav.append(modSel);

  // Theme toggle: an icon button. It shows the theme a click will switch TO (a moon in light mode, a sun in dark mode),
  // and its label says the same in words. Until the reader picks, it follows the system setting.
  const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const currentTheme = () => document.documentElement.dataset.theme || (darkQuery && darkQuery.matches ? "dark" : "light");
  const SVG = "http://www.w3.org/2000/svg";
  const icon = (paths) => {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "18"); svg.setAttribute("height", "18");
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
    paths.forEach((d) => { const p = document.createElementNS(SVG, "path"); p.setAttribute("d", d); svg.append(p); });
    return svg;
  };
  const MOON = ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"];
  const SUN = ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"];
  const toggle = document.createElement("button");
  toggle.id = "theme-toggle"; toggle.type = "button";
  const paintToggle = () => {
    const dark = currentTheme() === "dark", label = dark ? "Switch to light theme" : "Switch to dark theme";
    toggle.replaceChildren(icon(dark ? SUN : MOON));
    toggle.setAttribute("aria-label", label); toggle.title = label;
  };
  toggle.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("osc-theme", next); } catch (e) { /* ignore */ }
    paintToggle();
  });
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", paintToggle);
  paintToggle();

  const header = document.createElement("header");
  header.className = "site";
  const inner = document.createElement("div");
  inner.className = "inner";
  const brand = document.createElement("a");
  brand.className = "brand"; brand.href = root + "index.html";
  const mark = document.createElement("img");
  mark.src = root + "images/favicon.png"; mark.alt = ""; mark.width = 32; mark.height = 32; // decorative; the link text names it
  brand.append(mark, document.createTextNode("OS Concepts"));
  inner.append(brand, nav, toggle);
  header.append(inner);

  const skip = document.createElement("a");
  skip.className = "skip"; skip.href = "#main"; skip.textContent = "Skip to content";
  body.prepend(header); body.prepend(skip);
  const main = document.querySelector("main");
  if (main) main.id = "main";

  // Give every lesson section a link target: the heading's slug, made unique on the page. tools/build-search-index.js uses the same rule.
  if (main) {
    const used = new Set([...document.querySelectorAll("[id]")].map((e) => e.id));
    main.querySelectorAll("h2").forEach((hd) => {
      if (hd.id) return;
      const base = hd.textContent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
      let id = base, n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id); hd.id = id;
    });
  }

  // Prev/next pager on module pages
  if (modNum && main) {
    const order = ((window.OSData && window.OSData.readingOrder) || modules.map((m) => m.n)).map((n) => modules.find((m) => m.n === n)).filter(Boolean);
    const i = order.findIndex((m) => m.n === modNum);
    const pager = document.createElement("div");
    pager.className = "pager";
    const mk = (m, label) => {
      const a = document.createElement("a");
      a.className = "btn secondary"; a.href = `${m.slug}.html`; a.textContent = label;
      return a;
    };
    pager.append(i > 0 ? mk(order[i - 1], `← ${order[i - 1].n}. ${order[i - 1].title}`) : document.createElement("span"));
    pager.append(i >= 0 && i < order.length - 1 ? mk(order[i + 1], `${order[i + 1].n}. ${order[i + 1].title} →`) : document.createElement("span"));
    // Show where this module sits in the course, next to its number.
    const where = window.OSData && window.OSData.partOf && window.OSData.partOf(modNum), eyebrow = main.querySelector(".eyebrow");
    if (where && eyebrow) {
      const a = document.createElement("a");
      a.href = `${root}index.html#part-${where.part.id}`; a.textContent = `Part ${where.number}: ${where.part.title}`;
      eyebrow.append(" · ", a, ` (${where.index} of ${where.of})`);
    }
    main.append(pager);
  }

  // Study aids from js/data/study.js: objectives under the introduction, key takeaways before the quiz, further reading after it.
  const study = window.OSData && window.OSData.study && modNum ? window.OSData.study[modNum] : null;
  if (study && main) {
    const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); e.append(...kids); return e; };
    const list = (items) => el("ul", {}, ...items.map((t) => el("li", {}, t)));
    const lead = main.querySelector(".lead"), quiz = main.querySelector("[data-quiz]");
    if (lead) lead.after(el("section", { class: "study objectives", "aria-labelledby": "objectives" }, el("h2", { id: "objectives" }, "What you should be able to do"), list(study.objectives)));
    if (quiz) {
      const quizHeading = quiz.previousElementSibling && quiz.previousElementSibling.tagName === "H2" ? quiz.previousElementSibling : quiz;
      quizHeading.before(el("section", { class: "study takeaways", "aria-labelledby": "key-takeaways" }, el("h2", { id: "key-takeaways" }, "Key takeaways"), list(study.takeaways)));
      // Discussion and journal prompts (js/data/prompts.js): for a group, a journal or an exit ticket.
      const prompts = window.OSLib && OSLib.promptsFor ? OSLib.promptsFor(modNum, window.OSData) : [];
      if (prompts.length) {
        const items = prompts.map((p) => el("li", {}, el("b", {}, p.kind + ": "), p.text, ...(p.href ? [" ", el("a", { href: root + p.href }, p.label || "Open")] : [])));
        quizHeading.before(el("section", { class: "study prompts", "aria-labelledby": "think-and-discuss" }, el("h2", { id: "think-and-discuss" }, "Think, discuss, write"),
          el("p", { class: "small" }, "For a study group, a journal or a short exit ticket. There is no single right answer: a good answer names the trade-off."), el("ul", { class: "prompt-list" }, ...items)));
      }
      const links = el("ul", {}, ...study.reading.map(([title, url, note]) => {
        const a = el("a", { href: url, rel: "noopener" }, title);
        return el("li", {}, a, el("span", { class: "small" }, ` (${note}; opens an outside site)`));
      }));
      quiz.after(el("section", { class: "study reading", "aria-labelledby": "further-reading" }, el("h2", { id: "further-reading" }, "Further reading"), el("p", { class: "small" }, "Free, outside this site. Use them to go deeper or to read the same idea explained differently."), links));
    }
  }

  // Wide content must scroll inside its own box, never sideways across the whole page (phones), and be keyboard reachable.
  if (main) {
    main.querySelectorAll("table").forEach((t) => {
      if (t.closest(".sim, .compare-wrap, .table-scroll")) return;
      const box = document.createElement("div");
      box.className = "table-scroll";
      t.parentNode.insertBefore(box, t); box.append(t);
    });
    main.querySelectorAll("pre, .table-scroll").forEach((el) => { if (window.OSUI && OSUI.watchScroll) OSUI.watchScroll(el); });
  }

  // Prev/next pager on lab pages
  const labNum = body.dataset.lab ? +body.dataset.lab : null;
  if (labNum && main) {
    const labs = (window.OSData && window.OSData.labs) || [], i = labs.findIndex((l) => l.n === labNum);
    const pager = document.createElement("div");
    pager.className = "pager";
    const mk = (l, label) => { const a = document.createElement("a"); a.className = "btn secondary"; a.href = `${l.slug}.html`; a.textContent = label; return a; };
    pager.append(i > 0 ? mk(labs[i - 1], `← Lab ${labs[i - 1].n}: ${labs[i - 1].title}`) : document.createElement("span"));
    pager.append(i >= 0 && i < labs.length - 1 ? mk(labs[i + 1], `Lab ${labs[i + 1].n}: ${labs[i + 1].title} →`) : document.createElement("span"));
    main.append(pager);
  }

  // Prev/next pager on the hands-on (Docker) lab pages
  const handsonNum = body.dataset.handson !== undefined ? +body.dataset.handson : null;
  if (handsonNum !== null && main) {
    const labs = (window.OSData && window.OSData.handson) || [], i = labs.findIndex((l) => l.n === handsonNum);
    const pager = document.createElement("div");
    pager.className = "pager";
    const mk = (l, label) => { const a = document.createElement("a"); a.className = "btn secondary"; a.href = `${l.slug}.html`; a.textContent = label; return a; };
    pager.append(i > 0 ? mk(labs[i - 1], `← Lab ${labs[i - 1].n}: ${labs[i - 1].title}`) : document.createElement("span"));
    pager.append(i >= 0 && i < labs.length - 1 ? mk(labs[i + 1], `Lab ${labs[i + 1].n}: ${labs[i + 1].title} →`) : document.createElement("span"));
    main.append(pager);
  }

  const footer = document.createElement("footer");
  footer.className = "site";
  const licenseLink = document.createElement("a");
  licenseLink.href = root + "LICENSE.txt"; licenseLink.textContent = "MIT License";
  footer.append("Operating System Concepts: an independent, open educational resource. Free to copy and adapt under the ", licenseLink,
    ". Simulations are simplified for teaching. ");
  // Where to send corrections and ideas (the issue forms ask for the page, so reports are easy to act on). OSData.site.repo sets it.
  const repo = window.OSData && window.OSData.site && window.OSData.site.repo;
  if (repo) {
    const report = document.createElement("a");
    report.href = (repo.endsWith("/") ? repo.slice(0, -1) : repo) + "/issues/new/choose"; report.rel = "noopener"; report.textContent = "Report a problem or suggest a change";
    footer.append(report, ".");
  }
  body.append(footer);

  // <dfn data-term="deadlock">…</dfn> -> tooltip + link to glossary
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const glossary = (window.OSData && window.OSData.glossary) || [];
  // Safe to call repeatedly (simulations add <dfn>s after the page loads).
  function enhanceTerms(scope) {
    (scope || document).querySelectorAll("dfn[data-term]").forEach((el) => {
      if (el.title) return;
      const key = el.dataset.term.toLowerCase();
      const entry = glossary.find((g) => g.term.toLowerCase() === key);
      if (!entry) return;
      el.title = entry.def;
      // The first <dfn> for a term on a page becomes its anchor, so the glossary can link straight to it (modules/…#term-deadlock).
      const anchor = `term-${slug(entry.term)}`;
      if (!document.getElementById(anchor)) el.id = anchor;
      const a = document.createElement("a");
      a.href = `${root}pages/glossary.html#${slug(entry.term)}`;
      a.append(...el.childNodes);
      el.append(a);
    });
  }
  enhanceTerms();

  /** decodeURIComponent throws on malformed input such as "%E0%A4%A"; a bad link must never break a page. */
  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  /** Arriving from the glossary (#term-…): bring the term into view and flash it. Re-run once simulations have changed the layout. */
  function focusHash() {
    if (!/^#term-/.test(location.hash)) return;
    const el = document.getElementById(safeDecode(location.hash.slice(1)));
    if (!el) return;
    if (el.scrollIntoView) el.scrollIntoView({ block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
  focusHash();

  window.OSSite = { slug, enhance: enhanceTerms, focusHash, safeDecode };
})();
