(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/disk.js") : window.OSLib;
  const reqs = [98, 183, 37, 122, 14, 124, 65, 67];
  const run = (algo, dir) => L.scheduleDisk(reqs, 53, algo, { max: 199, dir });

  QUnit.module("disk scheduling");

  QUnit.test("Textbook totals (head 53, 200 cylinders)", (assert) => {
    assert.equal(run("FCFS").total, 640);
    assert.equal(run("SSTF").total, 236);
    assert.equal(run("SCAN", "up").total, 331);
    assert.equal(run("CSCAN", "up").total, 382);
    assert.equal(run("LOOK", "up").total, 299);
    assert.equal(run("CLOOK", "up").total, 322);
  });

  QUnit.test("Downward sweeps mirror correctly", (assert) => {
    assert.equal(run("SCAN", "down").total, 236);
    assert.equal(run("LOOK", "down").total, 208);
    assert.deepEqual(run("SCAN", "down").path.slice(0, 4).map((p) => p.pos), [53, 37, 14, 0]);
  });

  QUnit.test("SSTF service order", (assert) => {
    assert.deepEqual(run("SSTF").path.map((p) => p.pos), [53, 65, 67, 37, 14, 98, 122, 124, 183]);
  });

  QUnit.test("Every algorithm services every request exactly once", (assert) => {
    Object.keys(L.diskAlgos).forEach((a) => ["up", "down"].forEach((d) => {
      const served = run(a, d).path.filter((p) => p.served).map((p) => p.pos).sort((x, y) => x - y);
      assert.deepEqual(served, reqs.slice().sort((x, y) => x - y), `${a} ${d}`);
    }));
  });

  QUnit.test("C-SCAN marks the return trip as a jump", (assert) => {
    const r = run("CSCAN", "up");
    assert.equal(r.path.filter((p) => p.jump).length, 1);
    assert.equal(r.path.find((p) => p.jump).pos, 0);
  });

  QUnit.test("Edge cases: empty queue and head on a request", (assert) => {
    assert.equal(L.scheduleDisk([], 10, "FCFS").total, 0);
    assert.equal(L.scheduleDisk([10], 10, "SSTF").total, 0);
    assert.equal(L.scheduleDisk([10], 10, "LOOK").total, 0);
  });

  QUnit.test("LOOK never moves more than SCAN; C-LOOK never more than C-SCAN", (assert) => {
    for (let head = 0; head < 200; head += 17) {
      ["up", "down"].forEach((dir) => {
        const o = { max: 199, dir };
        assert.ok(L.scheduleDisk(reqs, head, "LOOK", o).total <= L.scheduleDisk(reqs, head, "SCAN", o).total);
        assert.ok(L.scheduleDisk(reqs, head, "CLOOK", o).total <= L.scheduleDisk(reqs, head, "CSCAN", o).total);
      });
    }
  });
})();
