(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/scheduling.js") : window.OSLib;
  const sim = L.simulateScheduling;
  const P = (pid, arrival, burst, priority = 0) => ({ pid, arrival, burst, priority });
  const near = (assert, actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: ${actual} ≈ ${expected}`);

  QUnit.module("scheduling");

  QUnit.test("FCFS textbook example (6, 8, 3): average wait 20/3", (assert) => {
    const r = sim([P("P1", 0, 6), P("P2", 0, 8), P("P3", 0, 3)], "FCFS");
    near(assert, r.avg.waiting, 20 / 3, "avg waiting");
    assert.deepEqual(r.segments.map((s) => [s.pid, s.start, s.end]), [["P1", 0, 6], ["P2", 6, 14], ["P3", 14, 17]]);
  });

  QUnit.test("SJF on the same set gives average wait 4", (assert) => {
    const r = sim([P("P1", 0, 6), P("P2", 0, 8), P("P3", 0, 3)], "SJF");
    near(assert, r.avg.waiting, 4, "avg waiting");
    assert.deepEqual(r.segments.map((s) => s.pid), ["P3", "P1", "P2"]);
  });

  QUnit.test("SRTF textbook example: average wait 6.5", (assert) => {
    const r = sim([P("P1", 0, 8), P("P2", 1, 4), P("P3", 2, 9), P("P4", 3, 5)], "SRTF");
    near(assert, r.avg.waiting, 6.5, "avg waiting");
    assert.equal(r.stats.find((s) => s.pid === "P2").completion, 5);
  });

  QUnit.test("Round Robin (24, 3, 3; q = 4): waits 6, 4, 7", (assert) => {
    const r = sim([P("P1", 0, 24), P("P2", 0, 3), P("P3", 0, 3)], "RR", { quantum: 4 });
    assert.deepEqual(r.stats.map((s) => s.waiting), [6, 4, 7]);
    assert.deepEqual(r.stats.map((s) => s.response), [0, 4, 7]);
  });

  QUnit.test("Round Robin with a huge quantum equals FCFS", (assert) => {
    const set = [P("A", 0, 5), P("B", 1, 3), P("C", 2, 8)];
    assert.deepEqual(sim(set, "RR", { quantum: 1000 }).stats, sim(set, "FCFS").stats);
  });

  QUnit.test("Priority (non-preemptive) textbook example: average wait 8.2", (assert) => {
    const r = sim([P("P1", 0, 10, 3), P("P2", 0, 1, 1), P("P3", 0, 2, 4), P("P4", 0, 1, 5), P("P5", 0, 5, 2)], "PRIORITY");
    near(assert, r.avg.waiting, 8.2, "avg waiting");
    assert.deepEqual(r.segments.map((s) => s.pid), ["P2", "P5", "P1", "P3", "P4"]);
  });

  QUnit.test("Preemptive priority interrupts a lower-priority process", (assert) => {
    const r = sim([P("L", 0, 5, 5), P("H", 2, 2, 1)], "PRIORITY_P");
    assert.deepEqual(r.segments.map((s) => [s.pid, s.start, s.end]), [["L", 0, 2], ["H", 2, 4], ["L", 4, 7]]);
  });

  QUnit.test("CPU idles until the first arrival", (assert) => {
    const r = sim([P("P1", 3, 2)], "FCFS");
    assert.deepEqual(r.segments, [{ pid: null, start: 0, end: 3 }, { pid: "P1", start: 3, end: 5 }]);
    assert.equal(r.idle, 3);
  });

  QUnit.test("Bad input is sanitized (zero/negative bursts become 1)", (assert) => {
    const r = sim([P("P1", 0, 0), P("P2", -3, -5)], "FCFS");
    assert.ok(r.stats.every((s) => s.burst === 1 && s.completion > 0));
  });

  QUnit.test("Invariants hold for every algorithm on random workloads", (assert) => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let trial = 0; trial < 40; trial++) {
      const n = 1 + Math.floor(rnd() * 6);
      const set = Array.from({ length: n }, (_, i) => P("P" + i, Math.floor(rnd() * 8), 1 + Math.floor(rnd() * 9), Math.floor(rnd() * 5)));
      for (const algo of Object.keys(L.schedulingAlgos)) {
        const r = sim(set, algo, { quantum: 1 + Math.floor(rnd() * 4) });
        const ran = {};
        r.segments.forEach((s) => { if (s.pid) ran[s.pid] = (ran[s.pid] || 0) + s.end - s.start; });
        const okBurst = set.every((p) => ran[p.pid] === p.burst);
        const contiguous = r.segments.every((s, i) => (i === 0 ? s.start === 0 : s.start === r.segments[i - 1].end));
        const noEarly = r.segments.every((s) => !s.pid || s.start >= set.find((p) => p.pid === s.pid).arrival);
        const waitOk = r.stats.every((s) => s.waiting >= 0 && s.turnaround === s.waiting + s.burst);
        if (!(okBurst && contiguous && noEarly && waitOk)) { assert.ok(false, `${algo} violated an invariant: ${JSON.stringify(set)}`); return; }
      }
    }
    assert.ok(true, "all 240 simulations satisfy burst, contiguity, arrival and wait invariants");
  });

  QUnit.test("stateAt: snapshots of the ready queue, CPU and remaining burst (RR, q = 4)", (assert) => {
    const r = sim([P("P1", 0, 24), P("P2", 0, 3), P("P3", 0, 3)], "RR", { quantum: 4 });
    let s = L.stateAt(r, 0);
    assert.equal(s.running, "P1");
    assert.deepEqual(s.ready, ["P2", "P3"]);
    assert.deepEqual(s.remaining, { P1: 24, P2: 3, P3: 3 });
    s = L.stateAt(r, 4);                               // quantum expired: P2 runs, P3 waits, P1 went to the back
    assert.equal(s.running, "P2");
    assert.deepEqual(s.ready, ["P3", "P1"]);
    assert.equal(s.remaining.P1, 20);
    s = L.stateAt(r, 7);
    assert.equal(s.running, "P3");
    assert.deepEqual(s.done, ["P2"]);
    s = L.stateAt(r, r.makespan);
    assert.strictEqual(s.running, null);
    assert.deepEqual(s.done.sort(), ["P1", "P2", "P3"]);
    assert.deepEqual(s.ready, []);
  });

  QUnit.test("stateAt: late arrivals are not queued and idle time has no running process", (assert) => {
    const r = sim([P("A", 0, 2), P("B", 5, 2)], "FCFS");
    let s = L.stateAt(r, 3);
    assert.strictEqual(s.running, null, "CPU idle at t=3");
    assert.deepEqual(s.notArrived, ["B"]);
    assert.deepEqual(s.done, ["A"]);
    s = L.stateAt(r, 5);
    assert.equal(s.running, "B");
  });

  QUnit.test("stateAt agrees with the simulator at every instant", (assert) => {
    let seed = 99;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let trial = 0; trial < 25; trial++) {
      const set = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => P("P" + i, Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 7), Math.floor(rnd() * 4)));
      for (const algo of Object.keys(L.schedulingAlgos)) {
        const r = sim(set, algo, { quantum: 2 });
        for (let t = 0; t <= r.makespan; t++) {
          const s = L.stateAt(r, t);
          const sum = (s.running ? 1 : 0) + s.ready.length + s.done.length + s.notArrived.length;
          if (sum !== set.length || Object.values(s.remaining).some((v) => v < 0)) { assert.ok(false, `${algo} t=${t} inconsistent`); return; }
          if (t === r.makespan && s.done.length !== set.length) { assert.ok(false, "not all done at the end"); return; }
        }
      }
    }
    assert.ok(true, "every process is in exactly one place at every instant");
  });

  QUnit.test("SJF never has higher average wait than FCFS when all arrive together", (assert) => {
    const set = [P("A", 0, 9), P("B", 0, 2), P("C", 0, 5), P("D", 0, 1)];
    assert.ok(sim(set, "SJF").avg.waiting <= sim(set, "FCFS").avg.waiting);
  });
})();
