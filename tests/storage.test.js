/* Storage reliability: RAID capacity, tolerance and parity (checked by brute force), SSD write amplification (invariants and trends), and journaling at every crash point. */
(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/storage.js") : window.OSLib;
  const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const bytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const text = (u8) => String.fromCharCode(...u8);

  QUnit.module("storage reliability: RAID");

  QUnit.test("Capacity, efficiency and the cost of a small write for each level", (assert) => {
    const c = (lvl, n) => { const i = L.raidInfo(lvl, n, 4); return [i.usable, i.guaranteed, i.bestCase, i.smallWriteIOs]; };
    assert.deepEqual(c("0", 4), [16, 0, 0, 1]);
    assert.deepEqual(c("1", 2), [4, 1, 1, 2]);
    assert.deepEqual(c("1", 3), [4, 2, 2, 3], "a three-way mirror survives two failures");
    assert.deepEqual(c("5", 4), [12, 1, 1, 4]);
    assert.deepEqual(c("6", 6), [16, 2, 2, 6]);
    assert.deepEqual(c("10", 6), [12, 1, 3, 2], "striped mirrors: one failure for sure, up to three if each lands in a different pair");
    assert.equal(L.raidInfo("5", 4, 4).efficiency, 0.75);
    assert.equal(L.raidInfo("5", 8, 4).efficiency, 0.875, "more disks, a smaller share spent on parity");
    assert.false(L.raidInfo("5", 2, 4).valid); assert.false(L.raidInfo("6", 3, 4).valid); assert.false(L.raidInfo("10", 5, 4).valid);
    assert.ok(/even number/.test(L.raidInfo("10", 5, 4).note));
    assert.throws(() => L.raidInfo("7", 4, 4)); assert.throws(() => L.raidInfo("5", 4, 0)); assert.throws(() => L.raidInfo("5", 17, 4));
  });

  QUnit.test("Survival, by brute force over every set of failed disks, agrees with the stated tolerance", (assert) => {
    const subsets = (n) => Array.from({ length: 1 << n }, (_, m) => [...Array(n).keys()].filter((i) => m & (1 << i)));
    let bad = 0;
    for (const level of Object.keys(L.raidLevels)) for (let n = 2; n <= 8; n++) {
      const info = L.raidInfo(level, n, 1);
      if (!info.valid) continue;
      let smallestFatal = Infinity, largestSurvivable = 0;
      subsets(n).forEach((f) => { if (L.raidSurvives(level, n, f)) largestSurvivable = Math.max(largestSurvivable, f.length); else smallestFatal = Math.min(smallestFatal, f.length); });
      if (smallestFatal - 1 !== info.guaranteed && !(smallestFatal === Infinity && info.guaranteed === n - 1)) bad++;
      if (largestSurvivable !== info.bestCase) bad++;
      if (!L.raidSurvives(level, n, [])) bad++;
    }
    assert.equal(bad, 0);
    assert.false(L.raidSurvives("10", 4, [0, 1]), "both disks of one mirror pair");
    assert.true(L.raidSurvives("10", 4, [0, 2]), "one disk from each pair");
    assert.false(L.raidSurvives("1", 2, [0, 1])); assert.true(L.raidSurvives("1", 3, [0, 1]));
    assert.false(L.raidSurvives("0", 3, [2]));
    assert.throws(() => L.raidSurvives("5", 4, [9])); assert.throws(() => L.raidSurvives("5", 2, []));
  });

  QUnit.test("XOR parity: any one missing block is recoverable, and a small write can update parity without reading the others", (assert) => {
    const data = ["alpha-01", "bravo-02", "charlie3", "delta-04"].map(bytes), parity = L.xorBlocks(data);
    assert.equal(text(L.rebuildBlock([data[0], data[1], data[3]], parity)), "charlie3");
    for (let lost = 0; lost < 4; lost++) assert.equal(text(L.rebuildBlock(data.filter((_, i) => i !== lost), parity)), text(data[lost]), `disk ${lost} rebuilt`);
    const fresh = bytes("BRAVO-99"), updated = L.updateParity(parity, data[1], fresh);
    assert.equal(text(updated), text(L.xorBlocks([data[0], fresh, data[2], data[3]])), "the shortcut equals a full recompute");
    assert.notEqual(text(L.rebuildBlock([data[0], data[3]], parity)), "charlie3", "with two blocks missing the equation has two unknowns");
    assert.throws(() => L.xorBlocks([])); assert.throws(() => L.xorBlocks([bytes("ab"), bytes("abc")]));
    const r = rng(3);
    let bad = 0;
    for (let t = 0; t < 200; t++) {
      const n = 2 + Math.floor(r() * 6), len = 1 + Math.floor(r() * 12), blocks = Array.from({ length: n }, () => Uint8Array.from({ length: len }, () => Math.floor(r() * 256)));
      const p = L.xorBlocks(blocks), lost = Math.floor(r() * n);
      if (text(L.rebuildBlock(blocks.filter((_, i) => i !== lost), p)) !== text(blocks[lost])) bad++;
      if (!L.xorBlocks([...blocks, p]).every((x) => x === 0)) bad++;
    }
    assert.equal(bad, 0, "200 random arrays: XOR of everything including parity is zero");
  });

  QUnit.test("Rebuild risk: chance of a read error while rebuilding, from the closed form", (assert) => {
    const r = L.rebuildRisk("5", 4, 4, 1e14);
    assert.equal(r.bitsRead, 3 * 4 * 8e12);
    assert.ok(Math.abs(r.probability - (1 - Math.exp(-0.96))) < 1e-12, "RAID 5 on four 4 TB disks: about 62 percent with a 1-in-10^14 error rate");
    assert.ok(L.rebuildRisk("5", 4, 4, 1e15).probability < 0.1, "enterprise drives are ten times better");
    assert.ok(L.rebuildRisk("5", 8, 16, 1e14).probability > L.rebuildRisk("5", 4, 4, 1e14).probability, "bigger and more disks are riskier");
    assert.deepEqual([L.rebuildRisk("6", 6, 16, 1e14).probability, L.rebuildRisk("6", 6, 16, 1e14).covered], [0, true]);
    assert.ok(L.rebuildRisk("6", 6, 16, 1e14).rawProbability > 0.5, "the raw error chance is still high, but RAID 6 can correct it");
    assert.ok(L.rebuildRisk("1", 2, 4, 1e14).probability < L.rebuildRisk("5", 4, 4, 1e14).probability, "a mirror reads one disk, not three");
    assert.equal(L.rebuildRisk("0", 2, 4, 1e14).probability, 1);
    assert.throws(() => L.rebuildRisk("5", 2, 4, 1e14)); assert.throws(() => L.rebuildRisk("5", 4, 4, 0));
  });

  QUnit.module("storage reliability: SSD");

  QUnit.test("Sequential overwrites cost nothing extra; random overwrites of a nearly full drive cost a lot", (assert) => {
    const seq = L.ssdSimulate({ pattern: "sequential", fill: 0.9, writes: 8000 });
    assert.ok(Math.abs(seq.wa - 1) < 0.02, `sequential write amplification is about 1 (${seq.wa.toFixed(3)})`);
    const rand = L.ssdSimulate({ pattern: "random", fill: 0.9, writes: 20000 });
    assert.ok(rand.wa > 2, `random write amplification at 90% full is well above 1 (${rand.wa.toFixed(2)})`);
    assert.ok(L.ssdSimulate({ pattern: "random", fill: 0.4, writes: 20000 }).wa < rand.wa, "an emptier drive amplifies less");
    assert.true(rand.consistent);
  });

  QUnit.test("More hidden spare space and separating data by how often it changes reduce write amplification", (assert) => {
    const wa = (o) => L.ssdSimulate(Object.assign({ fill: 0.9, writes: 20000 }, o)).wa;
    assert.ok(wa({ overProvision: 0.28 }) < wa({ overProvision: 0.07 }), "28% spare beats 7%");
    assert.ok(wa({ overProvision: 0.12 }) < wa({ overProvision: 0.07 }));
    for (const fill of [0.5, 0.7, 0.9]) assert.ok(wa({ pattern: "hotcold", separate: true, fill }) < wa({ pattern: "hotcold", separate: false, fill }), `at ${fill * 100}% full, keeping frequently and rarely changed data in separate blocks lowers write amplification`);
    assert.ok(Math.abs(wa({ pattern: "random", separate: true }) - wa({ pattern: "random", separate: false })) < 0.25, "with uniformly random writes there is nothing to separate, so it makes little difference");
  });

  QUnit.test("Invariants on random settings: nothing is lost, every flash write is accounted for, and erases add up", (assert) => {
    const r = rng(12);
    let bad = 0;
    for (let t = 0; t < 40; t++) {
      const o = { blocks: 8 + Math.floor(r() * 24), pagesPerBlock: 4 + Math.floor(r() * 28), overProvision: 0.12 + r() * 0.3, fill: 0.2 + r() * 0.8, writes: 500 + Math.floor(r() * 3000), pattern: ["random", "sequential", "hotcold"][Math.floor(r() * 3)], seed: 1 + Math.floor(r() * 1000) };
      let s;
      try { s = L.ssdSimulate(o); } catch (e) { continue; }
      if (!s.consistent) bad++;
      if (s.flashWrites !== s.hostWrites + s.relocated) bad++;
      if (s.wa < 1) bad++;
      if (s.erases.reduce((a, b) => a + b, 0) !== s.erasesTotal) bad++;
      if (s.mapped !== s.used) bad++;
      if (s.flashWrites > 0 && s.erasesTotal * o.pagesPerBlock > s.flashWrites + o.blocks * o.pagesPerBlock) bad++;
    }
    assert.equal(bad, 0);
    assert.deepEqual(L.ssdSimulate({ seed: 5, writes: 3000 }), L.ssdSimulate({ seed: 5, writes: 3000 }), "the same seed gives the same run");
  });

  QUnit.test("Wear is spread: the most-erased block is not far above the average", (assert) => {
    const s = L.ssdSimulate({ pattern: "random", fill: 0.8, writes: 40000 });
    const mean = s.erasesTotal / s.erases.length;
    assert.ok(s.maxErase < mean * 2.5 && s.minErase > mean * 0.3, `erases per block: min ${s.minErase}, mean ${mean.toFixed(0)}, max ${s.maxErase}`);
  });

  QUnit.test("Bad SSD settings are refused", (assert) => {
    assert.throws(() => L.ssdSimulate({ blocks: 4 })); assert.throws(() => L.ssdSimulate({ overProvision: 0 })); assert.throws(() => L.ssdSimulate({ fill: 0 }));
    assert.throws(() => L.ssdSimulate({ pattern: "zigzag" })); assert.throws(() => L.ssdSimulate({ writes: 0 }));
  });

  QUnit.module("storage reliability: journaling");

  QUnit.test("Without a journal, an interrupted append can leave damage, and which damage depends on the order of the writes", (assert) => {
    const outcomes = (order) => [0, 1, 2, 3].map((k) => L.journalCrash("none", order, k));
    const [m0, m1, m2, m3] = outcomes("metadata-first");
    assert.deepEqual([m0.state, m1.state, m2.state, m3.state], ["old", "broken", "broken", "new"]);
    assert.equal(m1.problems[0].kind, "leak"); assert.false(m1.severe, "a leaked block is a minor problem");
    assert.true(m2.severe); assert.ok(m2.problems.some((p) => p.kind === "garbage"), "the inode points to a block with no data yet");
    const i = outcomes("inode-first");
    assert.true(i[1].severe); assert.ok(i[1].problems.some((p) => p.kind === "dangling") && i[1].problems.some((p) => p.kind === "garbage"));
    const d = outcomes("data-first");
    assert.deepEqual(d.map((x) => x.state), ["old", "old", "broken", "new"], "data first: a crash after the data alone changes nothing visible");
    assert.true(d.every((x) => !x.severe), "data first can leak a block but never corrupts a file");
    assert.deepEqual(d[2].problems.map((p) => p.kind), ["leak"]);
    assert.equal(m1.recovery.includes("no journal"), true);
  });

  QUnit.test("With a journal, every crash point ends up all-old or all-new, and the commit record is the dividing line", (assert) => {
    for (const mode of ["metadata", "full"]) {
      const { steps, commitAt } = L.journalSteps(mode);
      assert.equal(steps[commitAt - 1].id, "commit", `${mode}: the third step is the commit record`);
      for (let k = 0; k <= steps.length; k++) {
        const r = L.journalCrash(mode, undefined, k);
        assert.true(r.consistent && !r.severe, `${mode} after ${k} steps: consistent after recovery`);
        assert.equal(r.state, k >= commitAt ? "new" : "old", `${mode} after ${k} steps: ${r.state}`);
        assert.equal(r.committed, k >= commitAt);
        assert.deepEqual(r.afterRecovery, k >= commitAt ? { bitmap: true, inode: true, data: true } : { bitmap: false, inode: false, data: false });
      }
    }
  });

  QUnit.test("A journal can leave the in-place data half-updated at the crash, which recovery then repairs", (assert) => {
    const r = L.journalCrash("metadata", undefined, 4);     // data, log, commit, and the bitmap applied, but not the inode
    assert.deepEqual(r.atCrash, { bitmap: true, inode: false, data: true });
    assert.equal(r.beforeRecovery.state, "broken", "at the instant of the crash the disk is inconsistent");
    assert.equal(r.state, "new", "but replaying the journal finishes the job");
    assert.ok(/replays/.test(r.recovery));
    const early = L.journalCrash("full", undefined, 2);
    assert.ok(/ignores/.test(early.recovery) && early.state === "old");
    assert.ok(/Nothing was written/.test(L.journalCrash("metadata", undefined, 0).recovery));
  });

  QUnit.test("Bad journal input is refused", (assert) => {
    assert.throws(() => L.journalCrash("magic", "data-first", 0)); assert.throws(() => L.journalCrash("none", "sideways", 0));
    assert.throws(() => L.journalCrash("none", "data-first", 4)); assert.throws(() => L.journalCrash("none", "data-first", -1)); assert.throws(() => L.journalCrash("metadata", undefined, 6));
  });
})();
