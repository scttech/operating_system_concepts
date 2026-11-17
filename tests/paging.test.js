(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/paging.js") : window.OSLib;
  const classic = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
  const belady = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

  QUnit.module("page replacement");

  QUnit.test("Classic reference string with 3 frames: FIFO 15, LRU 12, OPT 9", (assert) => {
    assert.equal(L.replacePages(classic, 3, "FIFO").faults, 15);
    assert.equal(L.replacePages(classic, 3, "LRU").faults, 12);
    assert.equal(L.replacePages(classic, 3, "OPT").faults, 9);
  });

  QUnit.test("Belady's anomaly: FIFO has 9 faults with 3 frames but 10 with 4", (assert) => {
    assert.equal(L.replacePages(belady, 3, "FIFO").faults, 9);
    assert.equal(L.replacePages(belady, 4, "FIFO").faults, 10);
  });

  QUnit.test("LRU and OPT never exhibit Belady's anomaly", (assert) => {
    ["LRU", "OPT"].forEach((algo) => {
      const f = L.faultsByFrames(belady, algo, 7).map((x) => x.faults);
      assert.ok(f.every((x, i) => i === 0 || x <= f[i - 1]), `${algo} faults non-increasing: ${f}`);
    });
  });

  QUnit.test("OPT is a lower bound for every algorithm", (assert) => {
    for (let frames = 1; frames <= 6; frames++) {
      const opt = L.replacePages(classic, frames, "OPT").faults;
      ["FIFO", "LRU", "CLOCK"].forEach((a) => assert.ok(L.replacePages(classic, frames, a).faults >= opt, `${a} with ${frames} frames`));
    }
  });

  QUnit.test("Quiz item: 1,2,3,1,4 with 3 frames under LRU has 4 faults and evicts page 2", (assert) => {
    const r = L.replacePages([1, 2, 3, 1, 4], 3, "LRU");
    assert.equal(r.faults, 4);
    assert.equal(r.steps[4].evicted, 2);
    assert.false(r.steps[3].fault, "second reference to 1 is a hit");
  });

  QUnit.test("One frame faults on every change of page; enough frames fault once per distinct page", (assert) => {
    assert.equal(L.replacePages([1, 2, 1, 2], 1, "LRU").faults, 4);
    assert.equal(L.replacePages(classic, 8, "FIFO").faults, new Set(classic).size);
  });

  QUnit.test("Clock gives a second chance to recently referenced pages", (assert) => {
    const r = L.replacePages([1, 2, 3, 1, 4], 3, "CLOCK");
    assert.equal(r.faults, 4);
    assert.ok(r.steps[4].evicted !== null);
    assert.equal(r.steps[4].frames.filter((x) => x === 4).length, 1);
  });

  QUnit.test("Every step keeps frames unique and containing the referenced page", (assert) => {
    ["FIFO", "LRU", "OPT", "CLOCK"].forEach((a) => {
      L.replacePages(classic, 4, a).steps.forEach((s) => {
        const present = s.frames.filter((x) => x !== null);
        assert.ok(new Set(present).size === present.length && present.includes(s.ref));
      });
    });
  });

  QUnit.test("Effective access time", (assert) => {
    assert.ok(Math.abs(L.effectiveAccessTime(100, 8e6, 0.001) - 8099.9) < 1e-6);
    assert.equal(L.effectiveAccessTime(100, 8e6, 0), 100);
  });
})();
