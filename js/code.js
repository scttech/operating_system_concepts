/* Source viewer: syntax highlighting (vendored Prism, js/vendor/prism.min.js), numbered-comment markers,
 * language tabs (C | Python), and a toolbar (language, Download, Copy) for listings that come from a real file
 * (<pre class="code" data-src="...">). Any <pre data-lang="c|python|bash"> on a page is highlighted too. */
(function () {
  "use strict";
  const { h } = OSUI;
  const root = document.body.dataset.root || "";
  const EXT = { py: "python", c: "c", h: "c", sh: "bash", bash: "bash" };
  const LABEL = { python: "Python", c: "C", bash: "Shell" };

  function languageOf(el) {
    if (el.dataset.lang) return el.dataset.lang;
    const m = /\.([a-z]+)$/i.exec(el.dataset.src || "");
    return m ? EXT[m[1].toLowerCase()] || null : null;
  }

  /** Turn "(1)", "(2)" inside comments into numbered badges, so the lesson text ("see (3)") can point at them. */
  function markCallouts(code) {
    code.querySelectorAll(".token.comment").forEach((comment) => {
      const walker = document.createTreeWalker(comment, NodeFilter.SHOW_TEXT), nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const parts = node.nodeValue.split(/(\(\d+\))/);
        if (parts.length === 1) return;
        const frag = document.createDocumentFragment();
        parts.forEach((p) => {
          if (/^\(\d+\)$/.test(p)) frag.append(h("span", { class: "marker", text: p }));
          else if (p) frag.append(p);
        });
        node.replaceWith(frag);
      });
    });
  }

  function highlight(pre) {
    const lang = languageOf(pre);
    if (!lang) return null;
    let code = pre.querySelector("code");
    if (!code) { code = document.createElement("code"); code.append(...pre.childNodes); pre.append(code); }
    code.className = `language-${lang}`;
    pre.classList.add(`language-${lang}`);
    pre.dataset.lang = lang;
    if (window.Prism && Prism.languages[lang]) { Prism.highlightElement(code); markCallouts(code); }
    return lang;
  }

  function toolbar(pre, lang) {
    const src = pre.dataset.src, name = src.split("/").pop();
    const bar = h("div", { class: "codebar" },
      h("span", { class: "filename", text: name }),
      lang ? h("span", { class: "lang", text: LABEL[lang] || lang }) : null,
      h("a", { href: root + src, download: name, text: "Download" }));
    const btn = h("button", { type: "button", class: "btn secondary", text: "Copy", "aria-label": `Copy ${name} to the clipboard` });
    btn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(pre.textContent); btn.textContent = "Copied"; }
      catch (e) { btn.textContent = "Select the code and press Ctrl+C"; }
      setTimeout(() => { btn.textContent = "Copy"; }, 2000);
    });
    bar.append(btn);
    pre.before(bar);
  }

  // ---------- language tabs ----------
  // <div class="code-tabs"> holds one <pre class="code" data-src="..."> per language, plus optional <div class="lang-note" data-lang="python">
  // notes. Choosing a language in one place switches every code sample on the page, and the choice is remembered.
  const STORE = "osc-lang", groups = [];
  const readPref = () => { try { return localStorage.getItem(STORE); } catch (e) { return null; } };
  const savePref = (lang) => { try { localStorage.setItem(STORE, lang); } catch (e) { /* storage unavailable: just not remembered */ } };

  function chooseLanguage(lang, fromGroup, focus) {
    groups.forEach((g) => { if (g.has(lang)) g.select(lang); });
    savePref(lang);
    if (focus && fromGroup) fromGroup.focusTab(lang);
  }

  function buildTabs(box, index) {
    const items = [...box.children], langs = [];
    items.filter((el) => el.tagName === "PRE").forEach((el) => { const l = languageOf(el); if (l && !langs.includes(l)) langs.push(l); });   // tab order follows the code blocks, not the notes
    if (langs.length < 2) return;                                   // a single language needs no tabs
    const list = h("div", { class: "tablist", role: "tablist", "aria-label": box.getAttribute("aria-label") || "Code language" });
    const tabs = {}, panels = {};
    langs.forEach((l) => {
      const id = `ct${index}-${l}`;
      tabs[l] = h("button", { type: "button", role: "tab", id: `${id}-tab`, "aria-controls": `${id}-panel`, class: "tab", text: LABEL[l] || l });
      panels[l] = h("div", { role: "tabpanel", id: `${id}-panel`, "aria-labelledby": `${id}-tab`, class: "tabpanel" });
      list.append(tabs[l]);
    });
    items.forEach((el) => { const l = languageOf(el); if (l && panels[l]) panels[l].append(el); });
    box.replaceChildren(list, ...langs.map((l) => panels[l]));
    box.classList.add("ready");

    const group = {
      has: (l) => langs.includes(l),
      select(lang) { langs.forEach((l) => { const on = l === lang; tabs[l].setAttribute("aria-selected", String(on)); tabs[l].tabIndex = on ? 0 : -1; panels[l].hidden = !on; }); },
      focusTab(lang) { tabs[lang].focus(); }
    };
    list.addEventListener("click", (e) => {
      const tab = e.target.closest("[role=tab]");
      if (tab) chooseLanguage(langs.find((l) => tabs[l] === tab), group, false);
    });
    list.addEventListener("keydown", (e) => {                       // arrow keys move between tabs (WAI-ARIA tabs pattern)
      const i = langs.findIndex((l) => tabs[l] === document.activeElement);
      const to = { ArrowRight: (i + 1) % langs.length, ArrowLeft: (i - 1 + langs.length) % langs.length, Home: 0, End: langs.length - 1 }[e.key];
      if (i >= 0 && to !== undefined) { e.preventDefault(); chooseLanguage(langs[to], group, true); }
    });
    groups.push(group);
    group.select(group.has(readPref()) ? readPref() : langs[0]);
  }

  document.querySelectorAll(".code-tabs").forEach(buildTabs);

  document.querySelectorAll("pre.code, pre[data-lang]").forEach((pre) => {
    const lang = highlight(pre);
    if (pre.classList.contains("code") && pre.dataset.src) toolbar(pre, lang);
  });
})();
