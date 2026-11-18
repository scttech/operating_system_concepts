/* Exam mode: balanced selection, shuffling, scoring and the clock text. */
(function () {
  "use strict";
  let L, D;
  if (typeof require !== "undefined") {
    globalThis.window = globalThis;
    delete globalThis.OSData;
    delete require.cache[require.resolve("../js/data/quizzes.js")];
    require("../js/data/quizzes.js");
    L = require("../js/lib/exam.js");
  } else L = window.OSLib;
  D = window.OSData;
  const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const modsOf = (e) => e.items.map((it) => it.q.mod);

  QUnit.module("exam mode");

  QUnit.test("Shuffle keeps every element exactly once and is reproducible", (assert) => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const s = L.examShuffle(a, rng(1));
    assert.deepEqual([...s].sort(), a);
    assert.deepEqual(a, [1, 2, 3, 4, 5, 6, 7, 8], "the input is not changed");
    assert.deepEqual(L.examShuffle(a, rng(1)), s, "same seed, same order");
    assert.notDeepEqual(L.examShuffle(a, rng(2)), s);
  });

  QUnit.test("An exam draws the requested number, spread evenly over the chosen modules, without repeats", (assert) => {
    const e = L.buildExam(D.quizzes, { mods: [3, 4, 5], count: 9, rnd: rng(5) });
    assert.equal(e.items.length, 9);
    assert.equal(new Set(e.items.map((it) => it.q.q)).size, 9, "no question twice");
    const per = [3, 4, 5].map((m) => modsOf(e).filter((x) => x === m).length);
    assert.deepEqual(per, [3, 3, 3], "three from each module");
    const e2 = L.buildExam(D.quizzes, { mods: [3, 4, 5], count: 10, rnd: rng(6) });
    assert.deepEqual(modsOf(e2).filter((x) => x === 3).length + modsOf(e2).filter((x) => x === 4).length + modsOf(e2).filter((x) => x === 5).length, 10);
    assert.ok([3, 4, 5].every((m) => { const c = modsOf(e2).filter((x) => x === m).length; return c >= 3 && c <= 4; }), "as even as possible");
    assert.deepEqual(e.mods, [3, 4, 5]);
  });

  QUnit.test("Asking for more than exist, or for everything, is handled", (assert) => {
    const total = D.quizzes.filter((q) => q.mod === 2).length;
    const e = L.buildExam(D.quizzes, { mods: [2], count: 500, rnd: rng(1) });
    assert.equal(e.items.length, total, "capped at the bank size");
    const all = L.buildExam(D.quizzes, { count: 40, rnd: rng(2) });
    assert.equal(all.items.length, 40);
    assert.ok(new Set(modsOf(all)).size >= 12, "an all-modules exam touches most modules");
    assert.throws(() => L.buildExam(D.quizzes, { mods: [999], count: 5 }));
    assert.equal(L.buildExam(D.quizzes, { mods: [1], count: -3, rnd: rng(1) }).items.length, 1, "at least one question");
  });

  QUnit.test("Choices are a permutation of the originals, and the correct answer is not always first", (assert) => {
    const e = L.buildExam(D.quizzes, { count: 120, rnd: rng(7) });
    e.items.forEach((it) => assert.deepEqual([...it.order].sort(), it.q.choices.map((_, i) => i)));
    const pos = e.items.map((it) => it.order.indexOf(it.q.answer));
    const counts = [0, 1, 2, 3].map((p) => pos.filter((x) => x === p).length);
    assert.ok(counts.every((c) => c > 120 * 0.12), "the right answer appears in every position: " + counts.join(","));
  });

  QUnit.test("Scoring: right, wrong and blank answers, per-module totals and the misses to review", (assert) => {
    const e = L.buildExam(D.quizzes, { mods: [1, 2], count: 6, rnd: rng(3) });
    const answers = e.items.map((it, i) => (i < 3 ? it.q.answer : i === 3 ? (it.q.answer + 1) % it.q.choices.length : null));
    const s = L.scoreExam(e, answers);
    assert.deepEqual([s.correct, s.wrong, s.unanswered, s.total, s.percent], [3, 1, 2, 6, 50]);
    assert.equal(s.misses.length, 3);
    assert.deepEqual(s.misses.map((m) => m.chosen === null), [false, true, true]);
    assert.equal(Object.values(s.byModule).reduce((a, m) => a + m.total, 0), 6);
    assert.equal(Object.values(s.byModule).reduce((a, m) => a + m.correct, 0), 3);
    const perfect = L.scoreExam(e, e.items.map((it) => it.q.answer));
    assert.deepEqual([perfect.percent, perfect.misses.length], [100, 0]);
    assert.equal(L.scoreExam(e, []).correct, 0, "an empty answer sheet scores zero");
  });

  QUnit.test("Time limits and the clock", (assert) => {
    assert.equal(L.suggestedSeconds(10), 750);
    assert.equal(L.suggestedSeconds(20), 1500);
    assert.equal(L.suggestedSeconds(1), 90);
    assert.equal(L.formatClock(0), "0:00");
    assert.equal(L.formatClock(61), "1:01");
    assert.equal(L.formatClock(599.2), "10:00");
    assert.equal(L.formatClock(-5), "0:00");
  });
})();
