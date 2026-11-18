/* Site-wide search: ranking, matching rules, safety with odd input, highlighting, and that every glossary term, module and operating system can be found. */
(function () {
  "use strict";
  let L, D;
  if (typeof require !== "undefined") {
    globalThis.window = globalThis;
    delete globalThis.OSData;
    ["modules", "glossary", "faq", "labs", "oslist", "search-index"].forEach((f) => { delete require.cache[require.resolve(`../js/data/${f}.js`)]; require(`../js/data/${f}.js`); });
    L = require("../js/lib/search.js");
  } else L = window.OSLib;
  D = window.OSData;
  const docs = L.buildDocs(D);
  const top = (q, n = 5, opts) => L.searchDocs(docs, q, opts).results.slice(0, n).map((r) => `${r.doc.kind}: ${r.doc.title}`);

  QUnit.module("site search");

  QUnit.test("Documents come from every source, with safe local urls", (assert) => {
    const kinds = new Set(docs.map((d) => d.kind));
    L.searchKinds.forEach((k) => assert.true(kinds.has(k), `has ${k} documents`));
    assert.equal(docs.filter((d) => d.kind === "Module").length, D.modules.length);
    assert.equal(docs.filter((d) => d.kind === "Glossary").length, D.glossary.length);
    assert.equal(docs.filter((d) => d.kind === "FAQ").length, D.faq.length);
    assert.ok(docs.filter((d) => d.kind === "Lesson").length >= 100, "lesson sections are indexed");
    docs.forEach((d) => { if (!/^(modules|labs)\/[\w.-]+\.html(#[\w=,.-]+)?$|^pages\/(glossary|faq|cheatsheet)\.html(#[\w=,.-]+)?$/.test(d.url)) assert.ok(false, `odd url: ${d.url}`); });
    assert.deepEqual(L.buildDocs({}), [], "missing sources are fine");
    assert.deepEqual(L.buildDocs(), []);
  });

  QUnit.test("Queries: empty, case, several words, and nothing found", (assert) => {
    assert.deepEqual(L.searchDocs(docs, "").results, []);
    assert.deepEqual(L.searchDocs(docs, "   \t ").results, []);
    assert.deepEqual(L.searchDocs(docs, null).results, []);
    assert.deepEqual(top("DEADLOCK", 1), top("deadlock", 1), "case does not matter");
    assert.equal(top("deadlock", 1)[0], "Glossary: Deadlock", "an exact title match beats everything else");
    assert.ok(top("page fault", 8).some((t) => t === "Glossary: Page fault"), "a two-word query finds the term");
    const r = L.searchDocs(docs, "semaphore deadlock banker");
    assert.ok(r.total > 0 && r.results.every((x) => ["semaphore", "deadlock", "banker"].every((w) => x.doc.lt.includes(w) || x.doc.lw.includes(w) || x.doc.lx.includes(w))), "every word must occur (AND)");
    assert.equal(L.searchDocs(docs, "zzzzqqqq").total, 0);
    assert.equal(L.searchDocs(docs, "deadlock zzzzqqqq").total, 0, "one missing word means no match");
  });

  QUnit.test("Ranking: titles beat body text, glossary terms beat prose", (assert) => {
    const r = L.searchDocs(docs, "mutex").results;
    assert.equal(r[0].doc.kind, "Glossary", "the definition of the term comes first");
    assert.true(r.every((x, i) => i === 0 || r[i - 1].score >= x.score), "results are in descending score order");
    assert.ok(top("scheduling", 3).some((t) => /Scheduling/.test(t) && /^Module/.test(t)), "the module overview ranks near the top");
    const a = L.searchDocs(docs, "tlb").results[0].doc;
    assert.ok(/TLB|Translation/i.test(a.title), "an abbreviation finds its term: " + a.title);
  });

  QUnit.test("Filtering by kind, limits and totals", (assert) => {
    const g = L.searchDocs(docs, "memory", { kinds: ["Glossary"] });
    assert.true(g.results.length > 0 && g.results.every((x) => x.doc.kind === "Glossary"));
    const two = L.searchDocs(docs, "memory", { kinds: ["FAQ", "Lab"] });
    assert.true(two.results.every((x) => x.doc.kind === "FAQ" || x.doc.kind === "Lab"));
    const all = L.searchDocs(docs, "memory");
    assert.ok(all.total > 60 && all.results.length === 60, "default limit is 60 but the total is reported");
    assert.equal(L.searchDocs(docs, "memory", { limit: 5 }).results.length, 5);
    assert.deepEqual(L.searchDocs(docs, "memory", { kinds: [] }).total, all.total, "an empty filter means all kinds");
  });

  QUnit.test("Odd input is plain text: no regular-expression or markup surprises", (assert) => {
    for (const q of ["c++", "(", "[", ".*", "\\", "a|b", "<img src=x onerror=alert(1)>", "%E0%A4%A", "😀", "x".repeat(500), "a b c d e f g h i j k l m n o p"]) {
      assert.ok(Array.isArray(L.searchDocs(docs, q).results), `survives ${JSON.stringify(q).slice(0, 30)}`);
    }
    assert.equal(L.searchDocs(docs, ".*").total, docs.filter((d) => (d.lt + d.lw + d.lx).includes(".*")).length, "'.*' means the two characters, not 'anything'");
    assert.deepEqual(L.searchTokens("  Hello   WORLD "), ["hello", "world"]);
    assert.equal(L.searchTokens("a b c d e f g h i j").length, 8, "at most 8 words");
    assert.equal(L.searchTokens("x".repeat(100))[0].length, 40, "long words are cut");
  });

  QUnit.test("Highlighting and snippets", (assert) => {
    const segs = L.highlightMatches("The page table maps pages", ["page"]);
    assert.equal(segs.map((s) => s.text).join(""), "The page table maps pages", "nothing is lost");
    assert.deepEqual(segs.filter((s) => s.match).map((s) => s.text), ["page", "page"]);
    assert.deepEqual(L.highlightMatches("abcd", ["ab", "bc"]).map((s) => [s.text, s.match]), [["abc", true], ["d", false]], "overlaps merge");
    assert.deepEqual(L.highlightMatches("none here", ["zzz"]), [{ text: "none here", match: false }]);
    assert.deepEqual(L.highlightMatches("", ["a"]), []);
    const doc = docs.find((d) => d.kind === "Lesson" && d.lx.length > 600 && d.lx.indexOf("kernel", 400) > 400);
    const sn = L.searchSnippet(doc, ["kernel"]);
    assert.true(sn.some((s) => s.match && s.text.toLowerCase() === "kernel"), "the snippet shows the word");
    assert.ok(sn.map((s) => s.text).join("").length < 260, "snippets are short");
    assert.ok(sn[0].text.startsWith("… "), "and say when they start mid-text");
    assert.ok(L.searchSnippet(doc, ["qqqq"]).length > 0, "a snippet without a hit shows the start");
  });

  QUnit.test("Everything can be found by its own name", (assert) => {
    const miss = [];
    D.glossary.forEach((g) => { if (!top(g.term, 6).includes(`Glossary: ${g.term}`)) miss.push("glossary " + g.term); });
    D.modules.forEach((m) => { if (!top(m.title, 6).includes(`Module: ${m.n}. ${m.title}`)) miss.push("module " + m.title); });
    D.osList.forEach((o) => { if (!top(o.name, 6).includes(`Operating system: ${o.name}`)) miss.push("os " + o.name); });
    D.labs.forEach((l) => { if (!top(`Lab ${l.n}: ${l.title}`, 6).includes(`Lab: Lab ${l.n}: ${l.title}`)) miss.push("lab " + l.title); });
    assert.deepEqual(miss, []);
  });
})();
