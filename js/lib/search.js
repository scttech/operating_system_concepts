/* Site-wide search. Pure logic, no DOM: builds a list of searchable documents from the site's data and ranks them for a query.
 * Matching is plain substring matching on lower-cased text. The query is never turned into a regular expression pattern, so any
 * characters a person types are safe. A document matches when every word of the query occurs in it (AND). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const stripTags = (s) => String(s).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  const KINDS = ["Module", "Lesson", "Glossary", "FAQ", "Lab", "Operating system", "Cheat sheet", "Study path", "Prompt", "Teaching note", "Study tool"];
  /** The study tools and handouts, which are pages rather than data: [title, url, what is there]. */
  const TOOLS = [
    ["Quiz questions", "pages/practice.html", "Pick modules and answer quiz questions with instant feedback and an explanation."],
    ["Flashcards", "pages/flashcards.html", "Glossary flashcards that come back more often until you know them."],
    ["Scenario questions", "pages/scenarios.html", "Which scheduler, lock, isolation or operating system fits this situation, and why?"],
    ["Calculation practice", "pages/problems.html", "A fresh scheduling, paging, disk or deadlock problem each time, with worked solutions and shareable problem codes."],
    ["Exam mode", "pages/exam.html", "A timed, shuffled practice exam with a score by module and a review of every miss."],
    ["My progress", "pages/progress.html", "Modules visited, questions mastered and exam scores, kept privately in your browser and exportable."],
    ["Printable handouts", "pages/handouts.html", "Print a study guide, a quiz worksheet, an answer key, a prompts sheet with writing space, or a glossary sheet for the modules you choose."],
    ["Study paths", "pages/paths.html", "Ordered routes through the lessons, simulations, labs and practice for one goal, from newcomer to advanced."],
    ["Teaching notes", "pages/teaching.html", "For instructors: common misconceptions, a classroom demonstration and what to listen for in discussion, for every module."]
  ];

  /**
   * data: { modules, glossary, faq, labs, osList, searchIndex } as in window.OSData (any may be missing).
   * Returns documents { kind, title, where, url, text } with lower-cased copies for matching.
   */
  function buildDocs(data) {
    const d = data || {}, docs = [];
    const add = (kind, title, where, url, text, matchTitle) => docs.push({ kind, title, where, url, text, lt: (matchTitle || title).toLowerCase(), lw: (where || "").toLowerCase(), lx: text.toLowerCase() });
    (d.modules || []).forEach((m) => add("Module", `${m.n}. ${m.title}`, "Module overview", `modules/${m.slug}.html`, `${m.summary} ${(m.tags || []).join(" ")}`, m.title));
    const bySlug = Object.fromEntries((d.modules || []).map((m) => [m.n, m]));
    Object.entries(d.study || {}).forEach(([n, st]) => {
      const m = bySlug[n];
      if (!m) return;
      const where = `Module ${m.n}: ${m.title}`, url = `modules/${m.slug}.html`;
      add("Lesson", "What you should be able to do", where, `${url}#objectives`, st.objectives.join(" "));
      add("Lesson", "Key takeaways", where, `${url}#key-takeaways`, st.takeaways.join(" "));
      add("Lesson", "Further reading", where, `${url}#further-reading`, st.reading.map((r) => `${r[0]} ${r[2]}`).join(" "));
    });
    (d.searchIndex || []).forEach(([url, page, heading, text, kind]) => add(kind, heading, page, url, text));
    (d.glossary || []).forEach((g) => add("Glossary", g.term, g.cat, `pages/glossary.html#${slug(g.term)}`, g.def));
    (d.faq || []).forEach((f) => add("FAQ", f.q, f.group, "pages/faq.html", stripTags(f.a)));
    (d.labs || []).forEach((l) => add("Lab", `Lab ${l.n}: ${l.title}`, "Lab overview", `labs/${l.slug}.html`, `${l.summary} ${l.platform || ""}`));
    (d.handson || []).forEach((l) => add("Lab", `Hands-on Lab ${l.n}: ${l.title}`, "Hands-on with Docker (optional)", `handson/${l.slug}.html`, `${l.summary} Docker containers`));
    (d.osList || []).forEach((o) => add("Operating system", o.name, o.group, `modules/18-os-landscape.html#compare=${o.id}`,
      [o.tagline, o.category, o.maker, o.uses, o.kernel, o.scheduling, o.memory, o.files, o.security, o.strengths, o.tradeoffs, o.fact].filter(Boolean).join(" ")));
    (d.paths || []).forEach((p) => add("Study path", p.title, "Study paths", `pages/paths.html#${p.id}`, [p.who, p.goal, ...p.steps.map((s) => `${s.label} ${s.note}`)].join(" ")));
    (d.modules || []).forEach((m) => {
      const prompts = (d.prompts || {})[m.n], notes = (d.teaching || {})[m.n], where = `Module ${m.n}: ${m.title}`;
      if (prompts) add("Prompt", "Think, discuss, write", where, `modules/${m.slug}.html#think-and-discuss`, prompts.map((q) => q.text).join(" "));
      if (notes) add("Teaching note", "Misconceptions, demonstration and what to listen for", where, `pages/teaching.html#module-${m.n}`,
        [...notes.misconceptions.map((x) => x.join(" ")), ...notes.demos.map((x) => `${x.title} ${x.steps.join(" ")}`), ...notes.listen].join(" "));
    });
    TOOLS.forEach(([title, url, text]) => add("Study tool", title, "Study tools", url, text));
    return docs;
  }

  /** The words of a query: lower-case, at most 8 words of at most 40 characters. */
  function tokens(query) {
    return String(query == null ? "" : query).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8).map((t) => t.slice(0, 40));
  }
  const count = (hay, tok) => { let n = 0, i = hay.indexOf(tok); while (i !== -1 && n < 50) { n++; i = hay.indexOf(tok, i + tok.length); } return n; };
  const wordStart = (hay, tok) => { let i = hay.indexOf(tok); while (i !== -1) { if (i === 0 || !/[a-z0-9]/.test(hay[i - 1])) return true; i = hay.indexOf(tok, i + 1); } return false; };

  /** Rank the documents for a query. Returns { results: [{doc, score}], total, words }. kinds: optional list to keep (for example ["Glossary"]). */
  function search(docs, query, opts) {
    const o = opts || {}, words = tokens(query), limit = o.limit || 60;
    if (!words.length) return { results: [], total: 0, words };
    const keep = o.kinds && o.kinds.length ? new Set(o.kinds) : null;
    const hits = [];
    docs.forEach((doc, order) => {
      if (keep && !keep.has(doc.kind)) return;
      let score = 0;
      for (const w of words) {
        const inTitle = doc.lt.includes(w), inWhere = doc.lw.includes(w), inText = doc.lx.includes(w);
        if (!inTitle && !inWhere && !inText) return;       // every word must occur somewhere
        if (doc.lt === w) score += 40;
        else if (doc.lt.startsWith(w)) score += 24;
        else if (inTitle) score += wordStart(doc.lt, w) ? 16 : 8;
        if (inWhere) score += 3;
        if (inText) score += Math.min(6, count(doc.lx, w)) + (wordStart(doc.lx, w) ? 3 : 0);
      }
      score += { Glossary: 3, Module: 2, Lesson: 1, FAQ: 1 }[doc.kind] || 0;
      hits.push({ doc, score, order });
    });
    hits.sort((a, b) => b.score - a.score || a.order - b.order);
    return { results: hits.slice(0, limit).map(({ doc, score }) => ({ doc, score })), total: hits.length, words };
  }

  /** Split text into [{text, match}] so that the query words can be highlighted without building any HTML. */
  function highlight(text, words) {
    const lower = String(text).toLowerCase(), ranges = [];
    (words || []).forEach((w) => { if (!w) return; let i = lower.indexOf(w); while (i !== -1) { ranges.push([i, i + w.length]); i = lower.indexOf(w, i + w.length); } });
    ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const merged = [];
    ranges.forEach((r) => { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([r[0], r[1]]); });
    const out = []; let pos = 0;
    merged.forEach(([a, b]) => { if (a > pos) out.push({ text: String(text).slice(pos, a), match: false }); out.push({ text: String(text).slice(a, b), match: true }); pos = b; });
    if (pos < String(text).length) out.push({ text: String(text).slice(pos), match: false });
    return out;
  }

  /** A short piece of the document's text around the first occurrence of a query word (or its start), as highlight segments. */
  function snippet(doc, words, width) {
    const w = width || 180, text = doc.text, lower = doc.lx;
    let at = -1;
    (words || []).forEach((t) => { const i = lower.indexOf(t); if (i !== -1 && (at === -1 || i < at)) at = i; });
    let start = Math.max(0, at - 60);
    if (start > 0) { const sp = text.indexOf(" ", start); if (sp !== -1 && sp < at) start = sp + 1; }
    let end = Math.min(text.length, start + w);
    if (end < text.length) { const sp = text.lastIndexOf(" ", end); if (sp > start + w / 2) end = sp; }
    const piece = (start > 0 ? "… " : "") + text.slice(start, end) + (end < text.length ? " …" : "");
    return highlight(piece, words);
  }

  return { buildDocs, searchTokens: tokens, searchDocs: search, highlightMatches: highlight, searchSnippet: snippet, searchKinds: KINDS };
});
