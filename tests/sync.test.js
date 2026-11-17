(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/sync.js") : window.OSLib;
  const M = typeof require !== "undefined" ? require("../js/lib/misc.js") : window.OSLib;

  QUnit.module("race condition");

  QUnit.test("Serial schedule gives the correct answer even without a lock", (assert) => {
    const s = L.newRace(3, false);
    while (L.raceRunnable(s, 0)) L.raceStep(s, 0);
    while (L.raceRunnable(s, 1)) L.raceStep(s, 1);
    assert.equal(s.counter, 6);
  });

  QUnit.test("The classic lost update: both threads LOAD before either STOREs", (assert) => {
    const s = L.newRace(1, false);
    L.raceStep(s, 0); L.raceStep(s, 1);           // both LOAD 0
    L.raceStep(s, 0); L.raceStep(s, 1);           // both ADD
    L.raceStep(s, 0); L.raceStep(s, 1);           // both STORE 1
    assert.equal(s.counter, 1, "one increment was lost");
  });

  QUnit.test("A lock blocks the second thread until the holder unlocks", (assert) => {
    const s = L.newRace(1, true);
    assert.equal(L.raceStep(s, 0), "LOCK");
    assert.true(L.raceBlocked(s, 1));
    assert.strictEqual(L.raceStep(s, 1), null);
    L.raceStep(s, 0); L.raceStep(s, 0); L.raceStep(s, 0); // LOAD ADD STORE
    assert.equal(L.raceStep(s, 0), "UNLOCK");
    assert.false(L.raceBlocked(s, 1));
  });

  QUnit.test("With a lock, 500 random schedules always give the right answer", (assert) => {
    const rng = M.mulberry32(99);
    let wrong = 0;
    for (let i = 0; i < 500; i++) if (L.raceRandomRun(L.newRace(3, true), rng) !== 6) wrong++;
    assert.equal(wrong, 0, "no lost updates in 500 runs");
  });

  QUnit.test("Without a lock, random schedules sometimes lose updates (and never exceed the correct total)", (assert) => {
    const rng = M.mulberry32(7);
    let wrong = 0;
    for (let i = 0; i < 500; i++) {
      const c = L.raceRandomRun(L.newRace(3, false), rng);
      if (c !== 6) wrong++;
      if (c > 6 || c < 1) { assert.ok(false, "impossible result " + c); return; }
    }
    assert.ok(wrong > 0, `${wrong}/500 runs were wrong`);
  });

  QUnit.module("bounded buffer");

  QUnit.test("Semaphore invariants: empty + full = N, 0 ≤ full ≤ N, FIFO order", (assert) => {
    const rng = M.mulberry32(3), b = L.newBuffer(4), out = [];
    for (let i = 0; i < 2000; i++) {
      const r = L.bufferTick(b, 0.8, 0.5, rng);
      if (r.consumed !== null) out.push(r.consumed);
      if (b.empty + b.full !== b.N || b.full < 0 || b.full > b.N) { assert.ok(false, "invariant broken at tick " + i); return; }
    }
    assert.ok(out.every((v, i) => v === i + 1), "items are consumed in the order produced");
    assert.equal(b.produced - b.consumed, b.full);
  });

  QUnit.test("A faster producer fills the buffer and gets blocked; a faster consumer starves", (assert) => {
    let b = L.newBuffer(3), rng = M.mulberry32(1);
    for (let i = 0; i < 500; i++) L.bufferTick(b, 1, 0.2, rng);
    assert.ok(b.prodBlocked > 0 && b.consBlocked <= b.prodBlocked);
    b = L.newBuffer(3); rng = M.mulberry32(1);
    for (let i = 0; i < 500; i++) L.bufferTick(b, 0.2, 1, rng);
    assert.ok(b.consBlocked > b.prodBlocked);
  });
})();
