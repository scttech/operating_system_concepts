/* Printable handouts: which modules, questions and terms go on each sheet. */
(function () {
  "use strict";
  let L, D;
  if (typeof require !== "undefined") {
    globalThis.window = globalThis;
    delete globalThis.OSData;
    ["modules", "glossary", "quizzes", "study"].forEach((f) => { const p = require.resolve(`../js/data/${f}.js`); delete require.cache[p]; require(`../js/data/${f}.js`); });
    L = require("../js/lib/handouts.js");
  } else L = window.OSLib;
  D = window.OSData;
  const all = D.modules.map((m) => m.n);

  QUnit.module("handouts");

  QUnit.test("Modules print in the course reading order, only those chosen and only those that exist", (assert) => {
    assert.deepEqual(L.chosenModules(D.modules, all, D.readingOrder), D.readingOrder, "all modules, reading order");
    assert.deepEqual(L.chosenModules(D.modules, [19, 3, 99, 1], D.readingOrder), [1, 3, 19], "chosen subset, unknown number dropped");
    assert.deepEqual(L.chosenModules(D.modules, [5, 2], null), [2, 5], "numeric order without a reading order");
    assert.deepEqual(L.chosenModules(D.modules, [], D.readingOrder), []);
  });

  QUnit.test("Study guide: every module has objectives and takeaways copied from the study data", (assert) => {
    const g = L.studyGuide(D.modules, D.study, all, D.readingOrder);
    assert.equal(g.length, D.modules.length);
    g.forEach((b) => {
      assert.ok(b.objectives.length >= 3 && b.takeaways.length >= 2, `module ${b.n} has content`);
      assert.deepEqual(b.objectives, D.study[b.n].objectives);
      assert.notStrictEqual(b.objectives, D.study[b.n].objectives, "a copy, so printing can never change the data");
    });
    assert.deepEqual(L.studyGuide([{ n: 1, title: "X" }], {}, [1], [1]), [{ n: 1, title: "X", summary: "", objectives: [], takeaways: [] }], "a module without notes still appears");
  });

  QUnit.test("Question list: numbered 1..n, lettered choices, correct letter matches the bank", (assert) => {
    const list = L.questionList(D.modules, D.quizzes, all, D.readingOrder, 0);
    assert.equal(list.length, D.quizzes.length, "every question is included");
    list.forEach((x, i) => {
      assert.equal(x.number, i + 1);
      const src = D.quizzes.find((q) => q.q === x.q);
      assert.equal(x.choices.length, src.choices.length);
      assert.deepEqual(x.choices.map((c) => c.letter), [..."ABCDEFGH"].slice(0, src.choices.length), "A, B, C, ...");
      assert.equal(x.choices.find((c) => c.letter === x.answer).text, src.choices[src.answer], "the key's letter names the right choice");
    });
    const mods = list.map((x) => x.mod), order = D.readingOrder;
    assert.ok(mods.every((m, i) => i === 0 || order.indexOf(m) >= order.indexOf(mods[i - 1])), "questions follow reading order");
  });

  QUnit.test("Limit per module, and a module with no chosen questions contributes none", (assert) => {
    const some = L.questionList(D.modules, D.quizzes, [4, 6], D.readingOrder, 3);
    assert.equal(some.length, 6);
    assert.deepEqual([...new Set(some.map((x) => x.mod))], [4, 6]);
    assert.deepEqual(some.map((x) => x.number), [1, 2, 3, 4, 5, 6]);
    assert.equal(L.questionList(D.modules, D.quizzes, [], D.readingOrder, 5).length, 0);
  });

  QUnit.test("The worksheet never reveals an answer, and the key lines up with it", (assert) => {
    const list = L.questionList(D.modules, D.quizzes, [1, 2, 3], D.readingOrder, 5);
    const ws = L.worksheet(list), key = L.answerKey(list);
    ws.forEach((x) => {
      assert.deepEqual(Object.keys(x).sort(), ["choices", "mod", "number", "q", "title"], "only the question side");
      assert.ok(!("answer" in x) && !("explain" in x));
    });
    assert.deepEqual(key.map((k) => k.number), ws.map((w) => w.number), "same numbers");
    assert.deepEqual(key.map((k) => k.mod), ws.map((w) => w.mod), "same modules");
    key.forEach((k, i) => { assert.ok(k.explain.length > 10, "has an explanation"); assert.equal(ws[i].choices.find((c) => c.letter === k.answer).text, k.text); });
    assert.ok(!JSON.stringify(ws).includes(list[0].explain), "explanations stay off the worksheet");
  });

  QUnit.test("Glossary sheet: every term exactly once, topics and terms alphabetical", (assert) => {
    const g = L.glossarySheet(D.glossary);
    assert.equal(g.reduce((n, c) => n + c.terms.length, 0), D.glossary.length);
    const cats = g.map((c) => c.cat);
    assert.deepEqual(cats, [...cats].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    g.forEach((c) => {
      const names = c.terms.map((t) => t.term);
      assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })), c.cat);
    });
    assert.deepEqual(L.glossarySheet([]), []);
  });
})();
