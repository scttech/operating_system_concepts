/* Advanced scheduling: MLFQ, real-time (RM and EDF) and multicore balancing, checked on hand-worked cases and on random workloads against independent analysis. */
(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/advsched.js") : window.OSLib;
  const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
  const trace = (r) => r.timeline.map((x) => x.id || ".").join("");
  const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  QUnit.module("advanced scheduling: multilevel feedback queue");

  QUnit.test("A CPU-bound job sinks while a shorter job finishes ahead of it", (assert) => {
    const r = L.mlfqSimulate([{ id: "A", arrive: 0, total: 10 }, { id: "B", arrive: 0, total: 3 }], { quanta: [2, 4] });
    assert.equal(trace(r), "AABBAAAABAAAA");
    assert.deepEqual(r.timeline.map((x) => x.level).slice(0, 5), [0, 0, 0, 0, 1], "both start at the top, then drop");
    const by = Object.fromEntries(r.jobs.map((j) => [j.id, j]));
    assert.deepEqual([by.A.finish, by.B.finish], [13, 9]);
    assert.deepEqual([by.A.response, by.B.response, by.B.turnaround, by.B.wait], [0, 2, 9, 6]);
    assert.deepEqual([by.A.longestWait, by.B.longestWait], [2, 4], "B waits 2 ticks at the start, then 4 while A has the CPU");
  });

  QUnit.test("An interactive job that blocks early keeps its high priority; the CPU hog sinks to the bottom", (assert) => {
    const r = L.mlfqSimulate([{ id: "I", arrive: 0, total: 3, burst: 1, wait: 2 }, { id: "C", arrive: 0, total: 10 }], { quanta: [2, 4, 8] });
    const ranI = r.timeline.filter((x) => x.id === "I");
    assert.true(ranI.every((x) => x.level === 0), "I is always at the top level");
    assert.equal(r.jobs.find((j) => j.id === "I").response, 0);
    assert.ok(r.timeline.filter((x) => x.id === "C").some((x) => x.level === 2), "C ends up at the lowest level");
    assert.ok(r.jobs.find((j) => j.id === "I").finish < r.jobs.find((j) => j.id === "C").finish);
  });

  QUnit.test("Starvation and the priority boost", (assert) => {
    const jobs = L.mlfqPresets.starve.jobs;
    const plain = L.mlfqSimulate(jobs, { quanta: [2, 4, 8] }), boosted = L.mlfqSimulate(jobs, { quanta: [2, 4, 8], boost: 6 });
    const progress = (r, by) => r.timeline.slice(0, by).filter((x) => x.id === "long").length;
    assert.ok(progress(boosted, 20) > progress(plain, 20), `by tick 20 the long job has had more CPU with a boost (${progress(boosted, 20)} vs ${progress(plain, 20)} ticks)`);
    assert.equal(progress(plain, 20), 3, "without a boost it ran only until the first short job arrived at tick 3, then was buried");
    const meanShort = (r) => { const q = r.jobs.filter((j) => j.id !== "long"); return q.reduce((a, j) => a + j.turnaround, 0) / q.length; };
    assert.ok(meanShort(boosted) >= meanShort(plain), "the price: the short jobs wait a little longer on average");
    assert.equal(boosted.end, plain.end, "the machine does the same total work either way");
    assert.deepEqual(boosted.boosts.slice(0, 3), [6, 12, 18]);
    assert.deepEqual(plain.boosts, []);
    assert.ok(plain.jobs.find((j) => j.id === "long").wait > 20, "without a boost the long job waits for the whole stream");
  });

  QUnit.test("Bad MLFQ input is rejected", (assert) => {
    assert.throws(() => L.mlfqSimulate([{ id: "a", arrive: 0, total: 0 }]));
    assert.throws(() => L.mlfqSimulate([{ id: "a", arrive: 0, total: 1 }, { id: "a", arrive: 0, total: 1 }]));
    assert.throws(() => L.mlfqSimulate([{ id: "a", arrive: 0, total: 3, burst: 1 }]), "a job that blocks needs a wait");
    assert.throws(() => L.mlfqSimulate([{ id: "a", arrive: 0, total: 1 }], { quanta: [] }));
    assert.throws(() => L.mlfqSimulate([{ id: "a", arrive: 0, total: 1 }], { quanta: [0] }));
  });

  QUnit.test("MLFQ on random workloads: every job gets exactly its CPU time, strict priority, quanta and I/O waits are respected", (assert) => {
    const rnd = rng(77), bad = { time: 0, early: 0, priority: 0, quantum: 0, io: 0 };
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + Math.floor(rnd() * 5), quanta = [1 + Math.floor(rnd() * 3), 2 + Math.floor(rnd() * 4), 4 + Math.floor(rnd() * 6)].sort((a, b) => a - b);
      const jobs = Array.from({ length: n }, (_, i) => {
        const io = rnd() < 0.5;
        return { id: "j" + i, arrive: Math.floor(rnd() * 8), total: 1 + Math.floor(rnd() * 12), burst: io ? 1 + Math.floor(rnd() * 3) : null, wait: io ? 1 + Math.floor(rnd() * 4) : 0 };
      });
      const boost = rnd() < 0.4 ? 5 + Math.floor(rnd() * 10) : 0, r = L.mlfqSimulate(jobs, { quanta, boost });
      jobs.forEach((j) => {
        const ticks = r.timeline.filter((x) => x.id === j.id);
        if (ticks.length !== j.total) bad.time++;
        if (ticks.length && ticks[0].t < j.arrive) bad.early++;
        if (j.burst) {
          ticks.forEach((x, k) => { if ((k + 1) % j.burst === 0 && k + 1 < ticks.length && ticks[k + 1].t - (x.t + 1) < j.wait) bad.io++; });
        }
      });
      r.timeline.forEach((x, i) => {
        if (x.id && x.waiting.some((w) => w.level < x.level)) bad.priority++;
        const prev = r.timeline[i - 1];
        if (x.id && x.level < quanta.length - 1) {
          let run = 1; for (let k = i - 1; k >= 0 && r.timeline[k].id === x.id && r.timeline[k].level === x.level && !(boost && r.timeline[k + 1].t % boost === 0); k--) run++;
          if (run > quanta[x.level]) bad.quantum++;
        }
      });
    }
    assert.deepEqual(bad, { time: 0, early: 0, priority: 0, quantum: 0, io: 0 });
  });

  QUnit.module("advanced scheduling: real time");

  QUnit.test("Analysis: utilization, bounds and response times", (assert) => {
    let a = L.rtAnalysis(L.rtPresets.classic.tasks);
    assert.ok(near(a.U, 2 / 5 + 4 / 7));
    assert.ok(near(a.rmBound, 2 * (Math.SQRT2 - 1)), "Liu and Layland bound for two tasks");
    assert.deepEqual([a.rmGuaranteedByBound, a.rmSchedulable, a.edfSchedulable, a.hyperperiod], [false, false, true, 35]);
    assert.deepEqual(a.response, [2, 8], "T2 needs 8 ticks to finish but has only 7");
    a = L.rtAnalysis(L.rtPresets.easy.tasks);
    assert.deepEqual([a.rmGuaranteedByBound, a.rmSchedulable, a.edfSchedulable], [true, true, true]);
    a = L.rtAnalysis(L.rtPresets.full.tasks);
    assert.deepEqual([a.rmGuaranteedByBound, a.rmSchedulable, a.edfSchedulable], [false, true, true], "harmonic periods: RM can reach 100% even though the bound says nothing");
    a = L.rtAnalysis(L.rtPresets.over.tasks);
    assert.deepEqual([a.rmSchedulable, a.edfSchedulable], [false, false]);
    assert.ok(near(L.rtAnalysis([{ C: 1, T: 2 }]).rmBound, 1), "one task: bound is 1");
    assert.throws(() => L.rtAnalysis([{ C: 5, T: 4 }]));
    assert.throws(() => L.rtAnalysis([]));
  });

  QUnit.test("Simulation: the classic set misses under RM and not under EDF", (assert) => {
    const rm = L.rtSimulate(L.rtPresets.classic.tasks, "rm"), edf = L.rtSimulate(L.rtPresets.classic.tasks, "edf");
    assert.equal(rm.horizon, 35);
    assert.deepEqual(rm.misses[0], { task: 1, release: 0, deadline: 7 });
    assert.deepEqual(rm.timeline.slice(0, 9), [0, 0, 1, 1, 1, 0, 0, 1, 1], "T1 preempts T2 at tick 5, so T2 finishes after its deadline of 7");
    assert.deepEqual(edf.misses, []);
    assert.equal(edf.timeline.filter((x) => x === -1).length, 35 - Math.round(35 * (2 / 5 + 4 / 7)), "idle ticks = unused capacity");
    assert.deepEqual(L.rtSimulate(L.rtPresets.full.tasks, "edf").misses, []);
    assert.deepEqual(L.rtSimulate(L.rtPresets.full.tasks, "rm").misses, [], "harmonic periods");
    assert.ok(L.rtSimulate(L.rtPresets.over.tasks, "edf").misses.length > 0);
    assert.throws(() => L.rtSimulate(L.rtPresets.easy.tasks, "fifo"));
  });

  QUnit.test("Random task sets: the simulation agrees with exact response-time analysis (RM) and with U <= 1 (EDF)", (assert) => {
    const rnd = rng(4), bad = { rm: 0, edf: 0, work: 0 };
    let missRm = 0, okRm = 0, missEdf = 0;
    for (let trial = 0; trial < 500; trial++) {
      const n = 1 + Math.floor(rnd() * 4), tasks = Array.from({ length: n }, () => { const T = 2 + Math.floor(rnd() * 11); return { C: 1 + Math.floor(rnd() * Math.max(1, Math.ceil(T * 0.6))), T }; });
      tasks.forEach((x) => { x.C = Math.min(x.C, x.T); });
      const a = L.rtAnalysis(tasks), H = a.hyperperiod;
      if (H > 3000) continue;
      const rm = L.rtSimulate(tasks, "rm"), edf = L.rtSimulate(tasks, "edf");
      if ((rm.misses.length === 0) !== a.rmSchedulable) bad.rm++;
      const demand = tasks.reduce((s, x) => s + x.C * (H / x.T), 0);
      if ((edf.misses.length === 0) !== (demand <= H)) bad.edf++;
      if (a.rmGuaranteedByBound && rm.misses.length) bad.rm++;
      const busy = (r) => r.timeline.filter((x) => x >= 0).length;
      if (rm.misses.length === 0 && busy(rm) !== demand) bad.work++;
      if (rm.misses.length) missRm++; else okRm++;
      if (edf.misses.length) missEdf++;
    }
    assert.deepEqual(bad, { rm: 0, edf: 0, work: 0 });
    assert.ok(missRm > 20 && okRm > 20 && missEdf > 10, `both outcomes occurred (${okRm} fine, ${missRm} RM misses, ${missEdf} EDF misses)`);
  });

  QUnit.module("advanced scheduling: multicore");

  QUnit.test("Work stealing fixes a lopsided placement, at a price per migration", (assert) => {
    const t = L.mcTasks([4, 4, 4, 4]);
    let r = L.mcSimulate(t, 2, { policy: "static", place: "one" });
    assert.deepEqual([r.makespan, r.migrations, r.utilization], [16, 0, 0.5], "everything on core 0: core 1 idles");
    r = L.mcSimulate(t, 2, { policy: "steal", place: "one" });
    assert.deepEqual([r.makespan, r.migrations, r.utilization], [8, 2, 1]);
    r = L.mcSimulate(t, 2, { policy: "steal", place: "one", penalty: 2 });
    assert.deepEqual([r.makespan, r.migrations], [12, 2], "each stolen task costs 2 extra ticks of cold-cache work");
    r = L.mcSimulate(t, 2, { policy: "static", place: "spread" });
    assert.deepEqual([r.makespan, r.migrations], [8, 0], "a good initial placement needs no stealing");
    r = L.mcSimulate(L.mcTasks([9, 1, 1, 1, 1, 1]), 2, { policy: "static", place: "spread" });
    assert.equal(r.makespan, 11, "round-robin placement puts 9 + 1 + 1 on one core and 1 + 1 + 1 on the other");
    assert.equal(L.mcSimulate(L.mcTasks([9, 1, 1, 1, 1, 1]), 2, { policy: "steal", place: "spread" }).makespan, 9, "stealing lets the idle core take the leftover small tasks");
  });

  QUnit.test("Multicore: invalid input", (assert) => {
    assert.throws(() => L.mcSimulate(L.mcTasks([1]), 0));
    assert.throws(() => L.mcSimulate([], 2));
    assert.throws(() => L.mcSimulate(L.mcTasks([1]), 2, { policy: "magic" }));
    assert.throws(() => L.mcSimulate(L.mcTasks([1]), 2, { penalty: -1 }));
  });

  QUnit.test("Multicore on random loads: work is conserved, and free stealing stays within Graham's bound of the lower bound", (assert) => {
    const rnd = rng(11), bad = { work: 0, finish: 0, steal: 0, graham: 0, lb: 0 };
    for (let trial = 0; trial < 400; trial++) {
      const m = 1 + Math.floor(rnd() * 6), works = Array.from({ length: 1 + Math.floor(rnd() * 14) }, () => 1 + Math.floor(rnd() * 9)), tasks = L.mcTasks(works), total = works.reduce((a, b) => a + b, 0);
      const stat = L.mcSimulate(tasks, m, { policy: "static", place: "one" }), free = L.mcSimulate(tasks, m, { policy: "steal", place: "one" });
      const pen = 1 + Math.floor(rnd() * 3), costly = L.mcSimulate(tasks, m, { policy: "steal", place: "one", penalty: pen });
      [stat, free].forEach((r) => { if (r.busy.reduce((a, b) => a + b, 0) !== total) bad.work++; if (Object.values(r.finish).some((x) => !(x >= 1))) bad.finish++; if (r.makespan < r.lowerBound) bad.lb++; });
      if (costly.busy.reduce((a, b) => a + b, 0) !== total + pen * costly.migrations) bad.work++;
      if (free.makespan > stat.makespan) bad.steal++;
      if (free.makespan > (2 - 1 / m) * free.lowerBound + 1e-9) bad.graham++;
      if (stat.makespan !== total) bad.steal++;
    }
    assert.deepEqual(bad, { work: 0, finish: 0, steal: 0, graham: 0, lb: 0 });
  });
})();
