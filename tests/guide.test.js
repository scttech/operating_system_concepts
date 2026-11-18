/* Study paths, discussion prompts and teaching notes: the data is complete, and every link in it lands on something real. */
(function () {
  "use strict";
  let L, D, fs, path, JSDOM, ROOT, search;
  const node = typeof require !== "undefined";
  if (node) {
    globalThis.window = globalThis;
    delete globalThis.OSData;
    ["modules", "labs", "paths", "prompts", "teaching"].forEach((f) => { const p = require.resolve(`../js/data/${f}.js`); delete require.cache[p]; require(`../js/data/${f}.js`); });
    L = require("../js/lib/guide.js");
    fs = require("node:fs"); path = require("node:path"); ({ JSDOM } = require("jsdom")); ROOT = path.resolve(__dirname, "..");
    search = require("../tools/build-search-index.js");
    // problems.js is a library
    globalThis.PROBLEMS = require("../js/lib/problems.js");
  } else L = window.OSLib;
  D = window.OSData;
  const kindIds = () => (node ? globalThis.PROBLEMS : window.OSLib).problemKinds.map((k) => k.id);

  /** The ids on a page: those written in the HTML and those js/site.js gives the h2 headings. */
  const idCache = {};
  function idsOn(rel) {
    if (!idCache[rel]) {
      const doc = new JSDOM(fs.readFileSync(path.join(ROOT, rel), "utf8")).window.document;
      const set = new Set([...doc.querySelectorAll("[id]")].map((e) => e.id));
      search.headingIds(doc).forEach((id) => set.add(id));
      idCache[rel] = set;
    }
    return idCache[rel];
  }
  /** Check a path such as "modules/04-scheduling.html#simulator" against the files; returns a problem description or "". */
  function problemWith(href) {
    if (!href) return "does not resolve";
    const [file, frag] = href.split("#");
    if (!fs.existsSync(path.join(ROOT, file))) return `${file} does not exist`;
    if (!frag) return "";
    if (file === "problems.html") return /^topic=/.test(frag) && kindIds().includes(frag.slice(6)) ? "" : `unknown problem topic ${frag}`;
    return idsOn(file).has(frag) ? "" : `${file} has no #${frag}`;
  }

  QUnit.module("study paths, prompts and teaching notes");

  QUnit.test("targetPath resolves modules, headings, labs and pages, and rejects anything else", (assert) => {
    assert.equal(L.targetPath({ mod: 4 }, undefined, D), "modules/04-scheduling.html");
    assert.equal(L.targetPath({ mod: 4, id: "simulator" }, undefined, D), "modules/04-scheduling.html#simulator");
    assert.equal(L.targetPath({ id: "paging" }, 8, D), "modules/08-memory.html#paging", "a prompt's own module is the default");
    assert.equal(L.targetPath({ mod: 12, id: "compare-the-systems" }, 4, D), "modules/12-os-landscape.html#compare-the-systems", "another module overrides it");
    assert.equal(L.targetPath({ lab: 2 }, undefined, D), "labs/02-threads.html");
    assert.equal(L.targetPath({ page: "problems.html", hash: "topic=paging" }, undefined, D), "problems.html#topic=paging");
    ["", null, undefined, {}, { mod: 99 }, { lab: 99 }, { page: "../etc/passwd" }, { page: "a.html?x" }, { page: "javascript:alert(1)" }, "modules/04.html"].forEach((bad) => assert.equal(L.targetPath(bad, undefined, D), null, JSON.stringify(bad)));
  });

  QUnit.test("Paths: complete, and each step is a real place", (assert) => {
    assert.ok(D.paths.length >= 6, "at least six paths");
    assert.equal(new Set(D.paths.map((p) => p.id)).size, D.paths.length, "ids are unique");
    D.paths.forEach((p) => {
      assert.ok(p.title && p.who && p.goal, `${p.id}: has a title, an audience and a goal`);
      assert.ok(p.steps.length >= 6, `${p.id}: at least six steps`);
      p.steps.forEach((s, i) => {
        assert.ok(L.STEP_KIND[s.t], `${p.id} step ${i + 1}: known kind ${s.t}`);
        assert.ok(s.label && s.note && /[.?]$/.test(s.note), `${p.id} step ${i + 1}: label and a one-sentence note`);
        const r = L.resolveStep(s, D);
        if (node) assert.equal(problemWith(r.href), "", `${p.id} step ${i + 1} (${s.label}): ${r.href}`);
        else assert.ok(r.href, `${p.id} step ${i + 1} resolves`);
      });
    });
  });

  QUnit.test("Paths together cover every module and every lab; the newcomer path follows reading order", (assert) => {
    const mods = new Set(), labs = new Set();
    D.paths.forEach((p) => { const s = L.pathSummary(p, D); s.modules.forEach((n) => mods.add(n)); s.labs.forEach((n) => labs.add(n)); });
    assert.deepEqual([...mods].sort((a, b) => a - b), D.modules.map((m) => m.n), "every module is on some path");
    assert.deepEqual([...labs].sort(), D.labs.map((l) => l.n).sort(), "every lab is on some path");
    const newcomer = L.pathSummary(D.paths.find((p) => p.id === "newcomer"), D).modules;
    const early = newcomer.filter((n) => n <= 11);
    assert.deepEqual(early, [...early].sort((a, b) => a - b), "modules 1 to 11 come in order on the newcomer path");
    const sum = L.pathSummary({ steps: [{ to: { lab: 1 } }, { to: { lab: 3 } }, { to: { lab: 1 } }, { to: { lab: 99 } }] }, D);
    assert.deepEqual(sum.labs, [1, 3, 99]);
    assert.equal(sum.labMinutes, D.labs[0].minutes + D.labs[2].minutes, "unknown labs count for nothing, repeats once");
  });

  QUnit.test("Prompts: every module has them, written as an invitation to think, and every link lands", (assert) => {
    D.modules.forEach((m) => {
      const list = D.prompts[m.n];
      assert.ok(list && list.length >= 3, `module ${m.n} has at least three prompts`);
      assert.ok(list.some((p) => p.k === "try" && p.to), `module ${m.n} has a prompt that sends learners to a simulation`);
      list.forEach((p, i) => {
        assert.ok(L.PROMPT_KIND[p.k], `module ${m.n} prompt ${i + 1}: kind ${p.k}`);
        assert.ok(p.text.length >= 50 && /[.?]$/.test(p.text), `module ${m.n} prompt ${i + 1}: a full sentence or two`);
        if (p.to) {
          assert.ok(p.label, `module ${m.n} prompt ${i + 1}: link text`);
          const href = L.targetPath(p.to, m.n, D);
          if (node) assert.equal(problemWith(href), "", `module ${m.n} prompt ${i + 1}: ${href}`);
        } else assert.ok(!p.label, "no link text without a link");
      });
    });
    assert.deepEqual(Object.keys(D.prompts).map(Number).sort((a, b) => a - b), D.modules.map((m) => m.n), "no prompts for modules that do not exist");
  });

  QUnit.test("Teaching notes: misconceptions, a demonstration and one 'listen for' line per prompt, for every module", (assert) => {
    D.modules.forEach((m) => {
      const t = D.teaching[m.n];
      assert.ok(t, `module ${m.n} has notes`);
      assert.ok(t.misconceptions.length >= 3 && t.misconceptions.every((x) => x.length === 2 && x[0].length > 15 && x[1].length > 30), `module ${m.n}: three or more misconceptions, each with a correction`);
      assert.ok(t.demos.length >= 1 && t.demos.every((d) => d.title && d.steps.length >= 3 && d.steps.every((s) => s.length > 15)), `module ${m.n}: a demonstration with steps`);
      assert.equal(t.listen.length, D.prompts[m.n].length, `module ${m.n}: one listen-for line per prompt`);
      assert.ok(t.listen.every((s) => s.length > 30), `module ${m.n}: listen-for lines say something`);
      t.demos.forEach((d) => { if (d.to && node) { const href = L.targetPath(d.to, m.n, D); assert.equal(problemWith(href), "", `module ${m.n} demo ${d.title}: ${href}`); } });
    });
  });

  QUnit.test("promptsFor joins prompts, links and teaching notes; promptSheet follows reading order", (assert) => {
    const p = L.promptsFor(4, D);
    assert.equal(p.length, D.prompts[4].length);
    assert.equal(p[0].kind, "Try it");
    assert.equal(p[0].href, "modules/04-scheduling.html#simulator");
    assert.equal(p[0].listen, D.teaching[4].listen[0]);
    assert.equal(p[1].href, null, "a prompt with no target has no link");
    assert.deepEqual(L.promptsFor(99, D), []);
    const sheet = L.promptSheet(D, [19, 3, 1, 99], [1, 3, 19, 4]);
    assert.deepEqual(sheet.map((b) => b.n), [1, 3, 19], "reading order, only chosen modules that exist");
    assert.equal(sheet[0].prompts.length, D.prompts[1].length);
  });
})();
