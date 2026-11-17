/* Integrity checks for the content data (quiz bank, glossary, FAQ, module list). Runs in Node and in the browser. */
(function () {
  "use strict";
  if (typeof require !== "undefined") {
    globalThis.window = globalThis;
    ["modules", "glossary", "quizzes", "faq", "oslist"].forEach((f) => require(`../js/data/${f}.js`));
  }
  const D = window.OSData;

  QUnit.module("content data");

  QUnit.test("Modules are numbered sequentially from 1 with unique slugs", (assert) => {
    assert.ok(D.modules.length >= 11);
    D.modules.forEach((m, i) => assert.equal(m.n, i + 1, `module ${i + 1} has n=${m.n}`));
    assert.equal(new Set(D.modules.map((m) => m.slug)).size, D.modules.length, "slugs unique");
    D.modules.forEach((m) => assert.ok(m.slug.startsWith(String(m.n).padStart(2, "0") + "-"), `${m.slug} is prefixed with its number`));
    assert.ok(D.modules.every((m) => m.title && m.summary && m.tags.length), "every module has title, summary and tags");
  });

  QUnit.test("Every quiz question is well formed", (assert) => {
    const stems = new Set();
    D.quizzes.forEach((q, i) => {
      const id = `#${i} (module ${q.mod})`;
      assert.ok(D.modules.some((m) => m.n === q.mod), `${id} refers to a real module`);
      assert.ok(Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 5, `${id} has 2–5 choices`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `${id} answer index in range`);
      assert.equal(new Set(q.choices).size, q.choices.length, `${id} has no duplicate choices`);
      assert.ok(q.q.trim().length > 10 && q.explain.trim().length > 10, `${id} has a stem and an explanation`);
      assert.false(stems.has(q.q), `${id} stem is unique`);
      stems.add(q.q);
    });
  });

  QUnit.test("Every module has at least 6 questions", (assert) => {
    D.modules.forEach((m) => assert.ok(D.quizzes.filter((q) => q.mod === m.n).length >= 6, `module ${m.n}`));
  });

  QUnit.test("Glossary terms are unique and defined", (assert) => {
    const seen = new Set();
    D.glossary.forEach((g) => {
      const k = g.term.toLowerCase();
      assert.false(seen.has(k), `duplicate term: ${g.term}`);
      seen.add(k);
      assert.ok(g.def.length > 15 && g.cat, `${g.term} has a definition and category`);
    });
    assert.ok(D.glossary.length >= 80);
  });

  QUnit.module("operating-system profiles");

  QUnit.test("Every profile has every row of the comparison table filled in", (assert) => {
    const keys = D.osSections.flatMap((s) => s.rows.map(([k]) => k));
    assert.equal(new Set(keys).size, keys.length, "row keys are unique");
    assert.ok(D.osList.length >= 14);
    assert.equal(new Set(D.osList.map((o) => o.id)).size, D.osList.length, "ids are unique");
    D.osList.forEach((o) => {
      assert.ok(o.name && o.tagline && D.osGroups.includes(o.group), `${o.id}: name, tagline and a known group`);
      keys.forEach((k) => assert.ok(typeof o[k] === "string" && o[k].trim().length >= 3, `${o.id}.${k} is filled in`));
    });
  });

  QUnit.test("The profiles cover the families the course asks for", (assert) => {
    const ids = D.osList.map((o) => o.id);
    ["windows", "macos", "linux", "android", "ios", "qubes", "rpi", "zos", "zvse", "ibmi"].forEach((id) => assert.ok(ids.includes(id), id));
    assert.ok(D.osList.filter((o) => o.group === "Mainframe & enterprise").length >= 3, "mainframe and midrange systems");
    assert.ok(D.osList.some((o) => /real-time/i.test(o.category)), "a real-time OS");
  });

  QUnit.test("Family tree is internally consistent", (assert) => {
    const { nodes, edges } = D.osTree, ids = new Set(nodes.map((n) => n.id)), byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    assert.equal(ids.size, nodes.length, "node ids unique");
    nodes.forEach((n) => {
      assert.ok(n.lane >= 0 && n.lane < D.osLanes.length, `${n.id} is in a real lane`);
      assert.ok(n.year >= 1965 && n.year <= 2023, `${n.id} year fits the axis`);
      assert.ok(n.info || n.osId, `${n.id} has a description or a profile`);
      if (n.osId) assert.ok(D.osList.some((o) => o.id === n.osId), `${n.id} refers to a real profile`);
    });
    edges.forEach(([a, b]) => {
      assert.ok(ids.has(a) && ids.has(b), `${a} → ${b} connects real nodes`);
      assert.ok(byId[a].year <= byId[b].year, `${a} → ${b} does not go backwards in time`);
    });
    const shown = new Set(nodes.map((n) => n.osId).filter(Boolean));
    D.osList.forEach((o) => assert.ok(shown.has(o.id), `${o.id} appears in the family tree`));
  });

  QUnit.module("glossary index (where terms are discussed)");

  if (typeof require !== "undefined") {
    const fs = require("fs"), path = require("path");
    const gen = require("../tools/build-glossary-index.js");

    QUnit.test("js/data/glossary-index.js is up to date with the lessons (run `npm run build:glossary` if this fails)", (assert) => {
      const committed = fs.readFileSync(gen.OUT, "utf8");
      assert.true(committed === gen.render(gen.buildIndex()), "the committed index matches what the generator produces from the module HTML");
    });

    QUnit.test("Every glossary term points to a lesson, and most to a marked definition", (assert) => {
      const idx = gen.buildIndex().index;
      D.glossary.forEach((g) => assert.ok(idx[g.term] && idx[g.term].length, `${g.term} is discussed in at least one module`));
      const marked = Object.values(idx).filter((v) => v[0].kind === "dfn").length;
      assert.ok(marked / D.glossary.length > 0.9, `${marked} of ${D.glossary.length} terms have a marked definition`);
    });

    QUnit.test("Index entries are well formed and ordered (definitions first, then by module)", (assert) => {
      Object.entries(gen.buildIndex().index).forEach(([term, entries]) => {
        entries.forEach((e) => {
          assert.ok(D.modules.some((m) => m.n === e.m), `${term}: module ${e.m} exists`);
          if (e.kind === "dfn") assert.equal(e.id, `term-${gen.slug(term)}`, `${term}: anchor id`);
        });
        const kinds = entries.map((e) => e.kind), firstMention = kinds.indexOf("mention");
        assert.ok(firstMention === -1 || kinds.slice(firstMention).every((k) => k === "mention"), `${term}: definitions come before plain mentions`);
        const dfns = entries.filter((e) => e.kind === "dfn").map((e) => e.m);
        assert.deepEqual(dfns, dfns.slice().sort((a, b) => a - b), `${term}: definitions in module order`);
      });
    });

    QUnit.test("Every <dfn data-term> in the lessons names a real glossary term", (assert) => {
      const known = new Set(D.glossary.map((g) => g.term.toLowerCase()));
      D.modules.forEach((m) => {
        const html = fs.readFileSync(path.join(__dirname, "..", "modules", `${m.slug}.html`), "utf8");
        for (const [, term] of html.matchAll(/data-term="([^"]+)"/g)) assert.ok(known.has(term.toLowerCase()), `${m.slug}: “${term}”`);
      });
    });
  }

  QUnit.module("content data (continued)");

  QUnit.test("FAQ entries are well formed", (assert) => {
    assert.ok(D.faq.length >= 20);
    D.faq.forEach((f) => assert.ok(f.group && f.q.endsWith("?") && f.a.length > 30, f.q));
  });
})();
