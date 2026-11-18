/* Integrity checks for the content data (quiz bank, glossary, FAQ, module list). Runs in Node and in the browser. */
(function () {
  "use strict";
  if (typeof require !== "undefined") {
    globalThis.window = globalThis;
    ["modules", "glossary", "quizzes", "faq", "oslist", "study", "scenarios", "threats"].forEach((f) => require(`../js/data/${f}.js`));
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

  QUnit.test("Parts: every module is in exactly one part, in a stated reading order", (assert) => {
    assert.ok(D.parts.length >= 4);
    assert.equal(new Set(D.parts.map((p) => p.id)).size, D.parts.length, "part ids unique");
    D.parts.forEach((p) => assert.ok(/^[a-z]+$/.test(p.id) && p.title && p.blurb.length > 20 && p.modules.length >= 2, `part ${p.id} is complete`));
    const flat = D.parts.flatMap((p) => p.modules);
    assert.deepEqual([...flat].sort((a, b) => a - b), D.modules.map((m) => m.n), "each module appears once, and none is missing");
    assert.deepEqual(D.readingOrder, flat);
    assert.equal(D.partOf(15).part.id, "concurrency");
    assert.deepEqual([D.partOf(15).index, D.partOf(15).of, D.partOf(15).number], [2, 4, 3]);
    assert.equal(D.partOf(99), null);
    assert.ok(D.readingOrder.indexOf(1) === 0, "the course starts with Module 1");
  });

  QUnit.test("Study aids: every module has objectives, takeaways and working-looking free reading links", (assert) => {
    assert.deepEqual(Object.keys(D.study).map(Number).sort((a, b) => a - b), D.modules.map((m) => m.n), "one entry per module, no extras");
    D.modules.forEach((m) => {
      const st = D.study[m.n];
      assert.ok(st.objectives.length >= 3 && st.objectives.length <= 6, `module ${m.n} has 3 to 6 objectives`);
      assert.ok(st.takeaways.length >= 3 && st.takeaways.length <= 5, `module ${m.n} has 3 to 5 takeaways`);
      assert.ok(st.reading.length >= 2, `module ${m.n} has further reading`);
      [...st.objectives, ...st.takeaways].forEach((t) => assert.ok(/^[A-Za-z]/.test(t) && /[.]$/.test(t) && t.length > 30 && t.length < 260, `module ${m.n}: a full sentence: ${t.slice(0, 40)}`));
      st.objectives.forEach((t) => assert.ok(/^(Name|Explain|Tell|Trace|State|Read|Match|List|Draw|Describe|Compare|Simulate|Define|Say|Show|Use|Find|Run|Break|Translate|Walk|Compute|Test|Apply|Place|Order|Predict|Choose|Build|Classify|Rebuild) /.test(t), `module ${m.n}: starts with a skill verb: ${t.slice(0, 30)}`));
      const urls = st.reading.map((r) => r[1]);
      assert.equal(new Set(urls).size, urls.length, `module ${m.n}: no duplicate links`);
      st.reading.forEach(([title, url, note]) => assert.ok(title && note && /^https:\/\/[a-z0-9.~-]+\/[^\s"'<>]*$/i.test(url) && !/[()]/.test(url), `module ${m.n}: ${url}`));
    });
    const everyUrl = Object.values(D.study).flatMap((st) => st.reading.map((r) => r[1]));
    assert.ok(everyUrl.filter((u) => u.includes("OSTEP")).length >= 20, "the free OSTEP textbook is the backbone");
  });

  QUnit.test("Scenario questions are complete: four options, one best fit, a note for each", (assert) => {
    const sc = D.scenarios;
    assert.ok(sc.length >= 12);
    assert.equal(new Set(sc.map((x) => x.id)).size, sc.length, "ids unique");
    sc.forEach((x) => {
      assert.ok(D.modules.some((m) => m.n === x.mod), `${x.id}: real module`);
      assert.equal(x.options.length, 4, `${x.id}: four options`);
      assert.equal(x.notes.length, 4, `${x.id}: a note for every option`);
      assert.ok(Number.isInteger(x.answer) && x.answer >= 0 && x.answer < 4, `${x.id}: valid answer`);
      assert.ok(x.situation.length > 60 && /[?]$/.test(x.question) && x.topic, `${x.id}: situation, question and topic`);
      assert.equal(new Set(x.options).size, 4, `${x.id}: options differ`);
      x.notes.forEach((n) => assert.ok(n.length > 25 && /[.]$/.test(n), `${x.id}: note is a sentence`));
      assert.ok(x.notes[x.answer].startsWith("Right."), `${x.id}: the best-fit note says so`);
    });
    const pos = [0, 1, 2, 3].map((i) => sc.filter((x) => x.answer === i).length);
    assert.ok(pos.every((c) => c >= 2), "the best answer is not always in the same position: " + pos.join(","));
    assert.ok(new Set(sc.map((x) => x.mod)).size >= 8, "scenarios span many modules");
  });

  QUnit.test("Threat-modeling exercises cover all six STRIDE categories and explain each answer", (assert) => {
    const systems = D.threatSystems;
    assert.ok(systems.length >= 3);
    assert.equal(new Set(systems.map((x) => x.id)).size, systems.length, "ids unique");
    systems.forEach((x) => {
      assert.ok(x.name && x.description.length > 60 && x.components.length >= 3, `${x.id}: described`);
      assert.deepEqual([...new Set(x.threats.map((t) => t.cat))].sort(), ["D", "E", "I", "R", "S", "T"], `${x.id}: every STRIDE category appears`);
      assert.ok(x.threats.length >= 6 && x.threats.length <= 8, `${x.id}: six to eight threats`);
      x.threats.forEach((t) => assert.ok(t.text.length > 40 && t.why.length > 25 && t.fix.length > 25 && /[.]$/.test(t.text), `${x.id}: ${t.text.slice(0, 30)} is complete`));
      assert.equal(new Set(x.threats.map((t) => t.text)).size, x.threats.length, `${x.id}: threats differ`);
    });
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

  QUnit.test("The newer and older designs are profiled, grouped and placed in the family tree", (assert) => {
    const ids = D.osList.map((o) => o.id);
    ["harmonyos", "fuchsia", "solaris", "openbsd", "zvm", "ztpf", "plan9", "minix3"].forEach((id) => assert.ok(ids.includes(id), `${id} has a profile`));
    assert.ok(D.osList.filter((o) => o.group === "Research & new designs").length >= 3, "the research group has members");
    assert.ok(D.osList.some((o) => o.id === "fuchsia" && /capabilit/i.test(o.security)), "Fuchsia's profile explains capabilities");
    assert.ok(D.osList.some((o) => o.id === "plan9" && /namespace/i.test(o.security)), "Plan 9's profile explains namespaces");
    assert.ok(D.osList.some((o) => o.id === "openbsd" && /pledge/i.test(o.security)));
    const labels = D.osTree.nodes.map((n) => n.label);
    ["Solaris", "illumos", "OpenBSD", "Plan 9", "MINIX", "MINIX 3", "Fuchsia", "HarmonyOS", "CP-67", "VM/370", "z/VM", "ACP", "TPF", "z/TPF", "SunOS"].forEach((l) => assert.ok(labels.includes(l), `${l} is in the family tree`));
    assert.true(D.osLanes.every((l) => l.length <= 24), "lane names fit in the margin of the tree");
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

    const search = require("../tools/build-search-index.js");
    QUnit.test("js/data/search-index.js is up to date with the pages (run `npm run build:search` if this fails)", (assert) => {
      assert.true(fs.readFileSync(search.OUT, "utf8") === search.render(search.buildSections()), "the committed search index matches what the generator produces");
    });

    QUnit.test("Search index: every module, lab and the cheat sheet is covered, with readable text and no code listings", (assert) => {
      const sections = search.buildSections();
      D.modules.forEach((m) => assert.ok(sections.filter((s) => s[0].startsWith(`modules/${m.slug}.html`)).length >= 3, `${m.slug} has several sections`));
      assert.ok(sections.some((s) => s[4] === "Cheat sheet") && sections.some((s) => s[4] === "Lab"));
      sections.forEach((s) => { assert.ok(s[3].length > 20 && s[3].length <= 2500 && !/\s{2,}/.test(s[3]), `${s[0]} text is clean`); assert.ok(!/<\/?(p|div|span|code|b|i|em|a|ul|ol|li|table|tr|td|th|pre|br|details|summary)[\s>]/.test(s[3]), `${s[0]} has no markup`); });
      assert.ok(!sections.some((s) => s[3].includes("#include <stdio.h>")), "code listings are not indexed");
      assert.equal(new Set(sections.map((s) => s[0])).size, sections.length, "every section has its own link");
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
