(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/banker.js") : window.OSLib;
  const available = [3, 3, 2];
  const alloc = [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]];
  const max = [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]];

  QUnit.module("banker's algorithm");

  QUnit.test("Need matrix = max − allocation", (assert) => {
    assert.deepEqual(L.needMatrix(alloc, max), [[7, 4, 3], [1, 2, 2], [6, 0, 0], [0, 1, 1], [4, 3, 1]]);
  });

  QUnit.test("Textbook state is safe with sequence P1, P3, P4, P0, P2", (assert) => {
    const r = L.isSafe(available, alloc, max);
    assert.true(r.safe);
    assert.deepEqual(r.sequence, [1, 3, 4, 0, 2]);
  });

  QUnit.test("A state with nothing available and all processes needing more is unsafe", (assert) => {
    assert.false(L.isSafe([0, 0, 0], alloc, max).safe);
  });

  QUnit.test("Request (1,0,2) by P1 is granted", (assert) => {
    const r = L.requestResources(1, [1, 0, 2], available, alloc, max);
    assert.true(r.granted);
    assert.true(r.safety.safe);
  });

  QUnit.test("Request (3,3,0) by P4 is denied because it leads to an unsafe state", (assert) => {
    const r = L.requestResources(4, [3, 3, 0], available, alloc, max);
    assert.false(r.granted);
    assert.ok(/unsafe/.test(r.reason));
  });

  QUnit.test("Requests above the declared need or above availability are rejected", (assert) => {
    assert.ok(/exceeds/.test(L.requestResources(1, [9, 0, 0], available, alloc, max).reason));
    assert.ok(/wait/.test(L.requestResources(0, [0, 2, 0], [0, 0, 0], alloc, max).reason));
  });

  QUnit.test("The input arrays are not mutated", (assert) => {
    const a = JSON.stringify([available, alloc, max]);
    L.requestResources(1, [1, 0, 2], available, alloc, max);
    L.isSafe(available, alloc, max);
    assert.equal(JSON.stringify([available, alloc, max]), a);
  });

  QUnit.test("findCycle detects wait-for cycles", (assert) => {
    assert.deepEqual(L.findCycle(["A", "B", "C"], [["A", "B"], ["B", "C"], ["C", "A"]]).sort(), ["A", "B", "C"]);
    assert.strictEqual(L.findCycle(["A", "B", "C"], [["A", "B"], ["B", "C"]]), null);
    assert.strictEqual(L.findCycle([], []), null);
  });
})();
