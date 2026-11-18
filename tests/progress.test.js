/* Learner progress: recording, summarizing, and the strict reading of imported (untrusted) data. */
(function () {
  "use strict";
  let L, D;
  if (typeof require !== "undefined") {
    globalThis.window = globalThis;
    delete globalThis.OSData;
    ["modules", "quizzes"].forEach((f) => { delete require.cache[require.resolve(`../js/data/${f}.js`)]; require(`../js/data/${f}.js`); });
    L = require("../js/lib/progress.js");
  } else L = window.OSLib;
  D = window.OSData;

  QUnit.module("learner progress");

  QUnit.test("Visits keep the first day and reject bad input", (assert) => {
    const p = L.newProgress();
    L.markVisited(p, 3, "2026-11-01"); L.markVisited(p, 3, "2026-11-09");
    assert.deepEqual(p.visited, { 3: "2026-11-01" });
    assert.throws(() => L.markVisited(p, 0, "2026-11-01"));
    assert.throws(() => L.markVisited(p, 2, "yesterday"));
    assert.throws(() => L.markVisited(p, 2.5, "2026-11-01"));
  });

  QUnit.test("Mastery follows the latest answer to each question", (assert) => {
    const p = L.newProgress(), mods = [{ n: 1, title: "A" }, { n: 2, title: "B" }];
    L.recordAnswer(p, 1, "a", false); L.recordAnswer(p, 1, "a", true);     // wrong, then right: mastered
    L.recordAnswer(p, 1, "b", true); L.recordAnswer(p, 1, "b", false);     // right, then wrong: not mastered
    L.recordAnswer(p, 1, "c", true);
    const s = L.summarize(p, mods, { 1: 4, 2: 5 });
    assert.deepEqual([s.rows[0].answered, s.rows[0].correct, s.rows[0].mastered, s.rows[0].percent], [5, 3, 2, 50]);
    assert.deepEqual([s.rows[1].answered, s.rows[1].mastered, s.rows[1].percent, s.rows[1].visited], [0, 0, 0, null]);
    assert.deepEqual([s.mastered, s.questions], [2, 9]);
    assert.throws(() => L.recordAnswer(p, 1, "", true));
    assert.throws(() => L.recordAnswer(p, 0, "a", true));
  });

  QUnit.test("Mastery never exceeds the questions that exist", (assert) => {
    const p = L.newProgress();
    ["a", "b", "c"].forEach((id) => L.recordAnswer(p, 1, id, true));
    const s = L.summarize(p, [{ n: 1, title: "A" }], { 1: 2 });   // two questions were removed from the bank since
    assert.deepEqual([s.rows[0].mastered, s.rows[0].percent], [2, 100]);
  });

  QUnit.test("Flashcard boxes: up one when known, back to the start when not, capped", (assert) => {
    const p = L.newProgress();
    [true, true, true, true, true].forEach(() => L.gradeCard(p, "Deadlock", true));
    assert.deepEqual(p.cards.Deadlock, { box: 3, seen: 5 });
    L.gradeCard(p, "Deadlock", false);
    assert.deepEqual(p.cards.Deadlock, { box: 0, seen: 6 });
    L.gradeCard(p, "Mutex", true);
    const s = L.summarize(p, [], {});
    assert.deepEqual(s.cards, { seen: 2, known: 0, learning: 2 });
    assert.throws(() => L.gradeCard(p, "", true));
  });

  QUnit.test("Exams keep the latest twenty and validate what they store", (assert) => {
    const p = L.newProgress();
    for (let i = 0; i < 25; i++) L.recordExam(p, { date: "2026-11-02", mods: [1, 2], total: 10, correct: i % 11, seconds: 100 + i });
    assert.equal(p.exams.length, 20);
    assert.equal(p.exams[0].seconds, 105, "the oldest five were dropped");
    [{ date: "x", mods: [1], total: 5, correct: 1, seconds: 1 }, { date: "2026-11-02", mods: [], total: 0, correct: 0, seconds: 1 }, { date: "2026-11-02", mods: [1], total: 5, correct: 6, seconds: 1 }, { date: "2026-11-02", mods: ["1"], total: 5, correct: 1, seconds: 1 }, { date: "2026-11-02", mods: [1], total: 5, correct: 1, seconds: -1 }]
      .forEach((e, i) => assert.throws(() => L.recordExam(p, e), `bad exam ${i}`));
    assert.equal(p.exams.length, 20, "bad exams are not stored");
  });

  QUnit.test("Question ids are stable, short, and unique across the whole quiz bank", (assert) => {
    assert.equal(L.questionId("What is a process?"), L.questionId("What is a process?"));
    assert.notEqual(L.questionId("What is a process?"), L.questionId("What is a thread?"));
    const ids = D.quizzes.map((q) => L.questionId(q.q));
    assert.ok(ids.every((id) => /^[a-z0-9]{1,8}$/.test(id)));
    assert.equal(new Set(ids).size, ids.length, `no collisions among ${ids.length} questions`);
  });

  QUnit.test("Export and import round-trip exactly", (assert) => {
    const p = L.newProgress();
    L.markVisited(p, 4, "2026-11-03"); L.recordAnswer(p, 4, "x1", true); L.recordAnswer(p, 4, "x2", false); L.gradeCard(p, "Semaphore", true);
    L.recordExam(p, { date: "2026-11-04", mods: [4, 5], total: 12, correct: 9, seconds: 400 });
    const r = L.parseProgress(L.serializeProgress(p));
    assert.true(r.ok);
    assert.deepEqual(r.progress, p);
  });

  QUnit.test("Imported text is untrusted: bad shapes are refused, bad parts are dropped, nothing leaks into Object.prototype", (assert) => {
    ["", "   ", "not json", "[]", "null", "42", '{"v":2}', '{"visited":{}}', JSON.stringify("x".repeat(300000))].forEach((t) => assert.false(L.parseProgress(t).ok, `refuses ${t.slice(0, 20)}`));
    assert.false(L.parseProgress(null).ok);
    const evil = '{"v":1,"visited":{"3":"2026-11-01","99999":"2026-11-01","abc":"2026-11-01","4":"<script>"},"quiz":{"3":{"answered":2,"correct":5,"q":{}},"5":{"answered":3,"correct":1,"q":{"ok1":1,"bad id":1,"x":7}},"__proto__":{"answered":1,"correct":1,"q":{}}},"cards":{"Deadlock":{"box":9,"seen":1},"Mutex":{"box":2,"seen":4},"__proto__":{"box":1,"seen":1}},"exams":[{"date":"nope"},{"date":"2026-11-02","mods":[1],"total":3,"correct":2,"seconds":5}],"extra":"ignored"}';
    const r = L.parseProgress(evil);
    assert.true(r.ok);
    assert.deepEqual(r.progress.visited, { 3: "2026-11-01" }, "only valid modules and dates survive");
    assert.deepEqual(Object.keys(r.progress.quiz), ["5"], "an impossible score is dropped");
    assert.deepEqual(r.progress.quiz[5].q, { ok1: 1 }, "bad question ids and values are dropped");
    assert.deepEqual(Object.keys(r.progress.cards), ["Mutex"]);
    assert.equal(r.progress.exams.length, 1);
    assert.false("extra" in r.progress);
    assert.equal({}.answered, undefined, "Object.prototype is untouched");
    assert.equal({}.box, undefined);
    assert.equal(r.progress.cards.box, undefined, "a __proto__ card did not become the prototype of the card table");
  });
})();
