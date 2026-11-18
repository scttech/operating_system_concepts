/* Side-by-side comparison: results must be exactly what the underlying simulators give, and the verdicts must follow from the numbers. */
(function () {
  "use strict";
  const S = typeof require !== "undefined" ? require("../js/lib/scheduling.js") : window.OSLib;
  const P = typeof require !== "undefined" ? require("../js/lib/paging.js") : window.OSLib;
  const C = typeof require !== "undefined" ? require("../js/lib/compare.js") : window.OSLib;
  const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const textbook = [{ pid: "P1", arrival: 0, burst: 6, priority: 2 }, { pid: "P2", arrival: 0, burst: 8, priority: 1 }, { pid: "P3", arrival: 0, burst: 3, priority: 3 }];

  QUnit.module("side-by-side comparison");

  QUnit.test("Scheduling: FCFS against SJF on the textbook workload", (assert) => {
    const c = C.compareSchedules(textbook, "FCFS", "SJF");
    const row = (k) => c.rows.find((r) => r.key === k);
    assert.ok(Math.abs(row("waiting").a - 20 / 3) < 1e-9 && row("waiting").b === 4, "FCFS waits 20/3 on average, SJF 4");
    assert.deepEqual([row("waiting").better, row("turnaround").better, row("response").better], ["b", "b", "b"], "SJF wins all three");
    assert.equal(row("makespan").better, "tie", "the same work takes the same time");
    assert.ok(c.summary.some((t) => /Shortest Job First|SJF/i.test(t) && /lower average waiting time/.test(t)), c.summary.join(" | "));
    assert.equal(c.labelA, S.schedulingAlgos.FCFS.label);
  });

  QUnit.test("Scheduling: Round Robin trades waiting for response and context switches; no single winner", (assert) => {
    const rr = [{ pid: "P1", arrival: 0, burst: 24, priority: 3 }, { pid: "P2", arrival: 0, burst: 3, priority: 1 }, { pid: "P3", arrival: 0, burst: 3, priority: 2 }];
    const c = C.compareSchedules(rr, "FCFS", "RR", { quantum: 4 });
    const row = (k) => c.rows.find((r) => r.key === k);
    assert.equal(row("response").better, "b", "round robin responds sooner");
    assert.equal(row("waiting").better, "b", "and in this workload also waits less");
    assert.equal(row("switches").better, "a", "FCFS switches less often");
    assert.ok(c.summary.some((t) => /more context switch/.test(t)));
    const mixed = C.compareSchedules(textbook, "SJF", "RR", { quantum: 2 });
    assert.deepEqual(mixed.rows.map((r) => r.better), ["a", "a", "b", "a", "tie"], "SJF waits less, round robin responds sooner, SJF switches less");
    assert.ok(mixed.summary.includes("There is no single winner: each is better at something different."));
    assert.ok(mixed.summary.includes("Round Robin makes 5 more context switches."));
  });

  QUnit.test("Scheduling: the same algorithm twice is a tie everywhere, and bad names are refused", (assert) => {
    const c = C.compareSchedules(textbook, "SRTF", "SRTF");
    assert.true(c.rows.every((r) => r.better === "tie" && r.a === r.b));
    assert.deepEqual(c.summary, ["Both sides run the same algorithm, so every number is the same."]);
    assert.throws(() => C.compareSchedules(textbook, "FCFS", "LIFO"));
  });

  QUnit.test("Scheduling: numbers equal the simulator's, swapping sides mirrors the verdicts (random workloads)", (assert) => {
    const r = rng(8), algos = Object.keys(S.schedulingAlgos);
    let bad = 0;
    for (let t = 0; t < 200; t++) {
      const procs = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => ({ pid: "P" + (i + 1), arrival: Math.floor(r() * 8), burst: 1 + Math.floor(r() * 9), priority: Math.floor(r() * 4) }));
      const A = algos[Math.floor(r() * algos.length)], B = algos[Math.floor(r() * algos.length)], q = 1 + Math.floor(r() * 5);
      const ab = C.compareSchedules(procs, A, B, { quantum: q }), ba = C.compareSchedules(procs, B, A, { quantum: q });
      const sa = S.simulateScheduling(procs, A, { quantum: q });
      if (ab.rows[0].a !== sa.avg.waiting || ab.rows[3].a !== sa.contextSwitches) bad++;
      ab.rows.forEach((row, i) => { const m = { a: "b", b: "a", tie: "tie" }; if (ba.rows[i].better !== m[row.better] || ba.rows[i].a !== row.b) bad++; if ((row.a < row.b) !== (row.better === "a")) bad++; });
    }
    assert.equal(bad, 0);
  });

  QUnit.test("Paging: FIFO against LRU on the classic string, with where they differ", (assert) => {
    const refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
    const c = C.comparePaging(refs, 3, "FIFO", "LRU");
    assert.deepEqual([c.faultsA, c.faultsB, c.better], [15, 12, "b"]);
    assert.ok(c.summary[0].includes("LRU causes 3 fewer page faults (12 against 15)"), c.summary[0]);
    assert.true(c.onlyA.every((i) => c.a.steps[i].fault && !c.b.steps[i].fault));
    assert.true(c.onlyB.every((i) => !c.a.steps[i].fault && c.b.steps[i].fault));
    assert.equal(c.onlyA.length - c.onlyB.length, 3, "the difference in faults is the difference in the two lists");
    const o = C.comparePaging(refs, 3, "LRU", "OPT");
    assert.deepEqual([o.faultsA, o.faultsB], [12, 9]);
  });

  QUnit.test("Paging: Belady's anomaly, a tie, and the same policy twice", (assert) => {
    const belady = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
    assert.deepEqual([C.comparePaging(belady, 3, "FIFO", "FIFO").faultsA, C.comparePaging(belady, 4, "FIFO", "FIFO").faultsA], [9, 10]);
    const same = C.comparePaging(belady, 3, "LRU", "LRU");
    assert.deepEqual([same.onlyA, same.onlyB, same.better], [[], [], "tie"]);
    assert.ok(/same policy/.test(same.summary[0]));
    const tie = C.comparePaging([1, 2, 3], 3, "FIFO", "LRU");
    assert.ok(/Both cause 3 page faults, on the same references/.test(tie.summary[0]), tie.summary[0]);
    assert.throws(() => C.comparePaging([1], 2, "FIFO", "RANDOM"));
  });

  QUnit.test("Paging: OPT never faults more than another policy (random strings)", (assert) => {
    const r = rng(21);
    let bad = 0;
    for (let t = 0; t < 300; t++) {
      const refs = Array.from({ length: 5 + Math.floor(r() * 25) }, () => Math.floor(r() * 7)), frames = 1 + Math.floor(r() * 5);
      for (const other of ["FIFO", "LRU", "CLOCK"]) { const c = C.comparePaging(refs, frames, "OPT", other); if (c.faultsA > c.faultsB || c.onlyA.length - c.onlyB.length !== c.faultsA - c.faultsB) bad++; }
    }
    assert.equal(bad, 0);
  });
})();
