/* Multi-level page tables and the TLB, checked against independent calculations (BigInt shifts, direct mapping lookups). */
(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/pagetable.js") : window.OSLib;
  const M = typeof require !== "undefined" ? require("../js/lib/misc.js") : window.OSLib;
  const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;

  QUnit.module("page tables");

  QUnit.test("Splitting an address: textbook 10 + 10 + 12 cases", (assert) => {
    const cfg = L.ptPresets.x86_32.cfg;
    let s = L.ptSplit(0x00403004, cfg);
    assert.deepEqual([s.indices, s.offset, s.vpn], [[1, 3], 4, 0x403]);
    s = L.ptSplit(0xbfffdff0, cfg);
    assert.deepEqual([s.indices, s.offset], [[0x2ff, 0x3fd], 0xff0]);
    s = L.ptSplit(0, cfg); assert.deepEqual([s.indices, s.offset], [[0, 0], 0]);
    s = L.ptSplit(0xffffffff, cfg); assert.deepEqual([s.indices, s.offset, s.inRange], [[1023, 1023], 4095, true]);
    assert.false(L.ptSplit(2 ** 32, cfg).inRange, "one past the end");
    assert.false(L.ptSplit(-1, cfg).inRange); assert.false(L.ptSplit(1.5, cfg).inRange);
  });

  QUnit.test("Splitting matches independent BigInt bit-shifts for every preset, on random addresses", (assert) => {
    const rng = M.mulberry32(2024);
    for (const name of Object.keys(L.ptPresets)) {
      const cfg = L.ptPresets[name].cfg; let bad = null;
      for (let i = 0; i < 400 && !bad; i++) {
        const bits = BigInt(cfg.vaBits), big = (BigInt(Math.floor(rng() * 2 ** 26)) << 26n | BigInt(Math.floor(rng() * 2 ** 26))) & ((1n << bits) - 1n);
        const addr = Number(big), sp = L.ptSplit(addr, cfg);
        let shift = BigInt(cfg.offsetBits); const want = [];
        for (let l = cfg.levelBits.length - 1; l >= 0; l--) { want[l] = Number((big >> shift) & ((1n << BigInt(cfg.levelBits[l])) - 1n)); shift += BigInt(cfg.levelBits[l]); }
        if (JSON.stringify(sp.indices) !== JSON.stringify(want) || sp.offset !== Number(big & ((1n << BigInt(cfg.offsetBits)) - 1n))) bad = `${name} ${addr.toString(16)}`;
      }
      assert.strictEqual(bad, null, `${name}: ${bad || "400 random addresses agree"}`);
    }
  });

  QUnit.test("Configurations must add up", (assert) => {
    assert.throws(() => L.ptBuild({ vaBits: 32, offsetBits: 12, levelBits: [10, 9], pteBytes: 4 }, []), /add up/);
    assert.throws(() => L.ptBuild({ vaBits: 32, offsetBits: 12, levelBits: [], pteBytes: 4 }, []));
    assert.throws(() => L.ptBuild({ vaBits: 64, offsetBits: 12, levelBits: [26, 26], pteBytes: 8 }, []), /52 bits/);
    Object.values(L.ptPresets).forEach((p) => assert.ok(L.ptValidate(p.cfg)));
  });

  QUnit.test("Walking: every mapped page translates to frame × page size + offset; every other page faults", (assert) => {
    const rng = M.mulberry32(7);
    for (const name of Object.keys(L.ptPresets)) {
      const p = L.ptPresets[name], table = L.ptPresetTable(name), maps = L.ptPresetMappings(name), size = 2 ** p.cfg.offsetBits;
      const direct = new Map(maps.map((m) => [m.vpn, m.frame]));
      let bad = null, ok = 0, faults = 0;
      maps.forEach((m) => { for (let k = 0; k < 5; k++) {
        const off = Math.floor(rng() * size), w = L.ptWalk(table, m.vpn * size + off);
        if (w.fault || w.physical !== m.frame * size + off || w.steps.length !== p.cfg.levelBits.length || w.memRefs !== p.cfg.levelBits.length) bad = bad || `${name} vpn ${m.vpn.toString(16)}`;
        ok++;
      } });
      for (let i = 0; i < 300; i++) {
        const addr = Math.floor(rng() * 2 ** p.cfg.vaBits), vpn = Math.floor(addr / size), w = L.ptWalk(table, addr);
        if (direct.has(vpn)) { if (w.fault || w.physical !== direct.get(vpn) * size + (addr % size)) bad = bad || `${name} random mapped ${addr.toString(16)}`; }
        else { if (!w.fault) bad = bad || `${name} ${addr.toString(16)} should fault`; faults++; }
      }
      assert.strictEqual(bad, null, `${name}: ${bad || `${ok} mapped and ${faults} unmapped addresses behave`}`);
    }
  });

  QUnit.test("A fault is reported at the first level whose entry is missing", (assert) => {
    const table = L.ptPresetTable("x86_32");
    let w = L.ptWalk(table, 0x7fff0000);           // directory index 0x1ff has no page table at all
    assert.equal(w.fault.level, 0); assert.equal(w.steps.length, 1); assert.equal(w.steps[0].name, "Page directory");
    w = L.ptWalk(table, 0x00408000);               // directory entry 1 exists, but page 8 of that table is unmapped
    assert.equal(w.fault.level, 1); assert.equal(w.steps.length, 2); assert.equal(w.memRefs, 2);
    assert.ok(/Page table\[8\]/.test(w.fault.reason));
    w = L.ptWalk(table, 2 ** 32);
    assert.equal(w.fault.level, -1); assert.equal(w.steps.length, 0);
  });

  QUnit.test("Tables are sparse: only the tables a process needs exist", (assert) => {
    const m32 = L.ptMemory(L.ptPresetTable("x86_32"));
    assert.deepEqual(m32.perLevel.map((l) => l.tables), [1, 3], "one directory and three page tables (code, heap, stack)");
    assert.equal(m32.total, 4 * 1024 * 4, "16 KiB in total");
    assert.equal(m32.flatBytes, 4 * 1024 * 1024, "a flat table for 2^20 pages of 4 bytes is 4 MiB");
    assert.ok(near(m32.savedFraction, 1 - 16384 / 4194304));
    const t16 = L.ptMemory(L.ptPresetTable("teach16"));
    assert.deepEqual(t16.perLevel.map((l) => l.tables), [1, 3]); assert.equal(t16.total, 256); assert.equal(t16.flatBytes, 1024); assert.equal(t16.savedFraction, 0.75);
    const m64 = L.ptMemory(L.ptPresetTable("x86_64"));
    assert.equal(m64.flatBytes, 2 ** 36 * 8, "a flat table would need 512 GiB");
    assert.ok(m64.total < 100 * 1024, "the real tables need only a few KiB");
  });

  QUnit.test("Table counts match an independent count of distinct address prefixes", (assert) => {
    const rng = M.mulberry32(99);
    for (let trial = 0; trial < 60; trial++) {
      const nl = 1 + Math.floor(rng() * 4), bits = Array.from({ length: nl }, () => 2 + Math.floor(rng() * 5)), off = 4 + Math.floor(rng() * 6);
      const cfg = { vaBits: off + bits.reduce((a, b) => a + b, 0), offsetBits: off, levelBits: bits, pteBytes: 4 };
      const maxVpn = 2 ** (cfg.vaBits - off), vpns = [...new Set(Array.from({ length: 1 + Math.floor(rng() * 30) }, () => Math.floor(rng() * maxVpn)))];
      const table = L.ptBuild(cfg, vpns.map((v, i) => ({ vpn: v, frame: i })));
      const mem = L.ptMemory(table);
      for (let lvl = 0; lvl < nl; lvl++) {
        const below = bits.slice(lvl).reduce((a, b) => a + b, 0);                 // bits that select an entry in/below this level
        const prefixes = new Set(vpns.map((v) => Math.floor(v / 2 ** below)));    // one table per distinct prefix above this level
        if (mem.perLevel[lvl].tables !== prefixes.size) { assert.ok(false, `config ${JSON.stringify(cfg)} level ${lvl}: ${mem.perLevel[lvl].tables} vs ${prefixes.size}`); return; }
      }
      vpns.forEach((v, i) => { const w = L.ptWalk(table, v * 2 ** off + 1); if (w.frame !== i) assert.ok(false, "walk disagrees with the mapping"); });
    }
    assert.ok(true, "60 random configurations with 1 to 4 levels agree");
  });

  QUnit.module("TLB");

  const tinyTable = () => L.ptBuild({ vaBits: 12, offsetBits: 4, levelBits: [4, 4], pteBytes: 4 }, Array.from({ length: 16 }, (_, i) => ({ vpn: i, frame: 100 + i })));
  const pageAddr = (vpn) => vpn * 16 + 3;

  QUnit.test("LRU versus FIFO on the same sequence (A B A C B, 2 entries)", (assert) => {
    const t = tinyTable(), seq = [0, 1, 0, 2, 1].map(pageAddr);
    const lru = L.ptRunSequence(t, seq, { entries: 2, policy: "LRU" }), fifo = L.ptRunSequence(t, seq, { entries: 2, policy: "FIFO" });
    assert.deepEqual([lru.hits, lru.misses], [1, 4], "LRU: A hit refreshes A, so C evicts B and then B evicts A");
    assert.deepEqual([fifo.hits, fifo.misses], [2, 3], "FIFO: C evicts A (oldest), so the later B is still cached");
    assert.deepEqual(lru.steps.map((s) => s.tlbHit), [false, false, true, false, false]);
    assert.deepEqual(lru.steps[3].evicted, 1, "LRU evicted page 1 when page 2 arrived");
    assert.deepEqual(fifo.steps[3].evicted, 0, "FIFO evicted page 0");
    assert.deepEqual(lru.steps[4].tlb.map((e) => e.vpn), [2, 1], "snapshot: oldest first");
  });

  QUnit.test("Memory references: a hit costs 1, a miss costs (levels + 1), a fault costs only the reads it made", (assert) => {
    const t = tinyTable(), r = L.ptRunSequence(t, [0, 0, 5].map(pageAddr).concat([4096]), { entries: 4 });   // 4096 = one past the end of the 12-bit space
    assert.deepEqual(r.steps.map((s) => s.memRefs), [3, 1, 3, 0], "miss=2 table reads + data; hit=data only; out of range=0");
    const inRange = L.ptRunSequence(t, [256], { entries: 4 }).steps[0];   // page 16 is inside the space but unmapped: the top-level entry is missing
    assert.deepEqual([inRange.fault.level, inRange.memRefs], [0, 1], "an in-range fault costs the table reads made before the missing entry");
    assert.equal(r.totalMemRefs, 7); assert.equal(r.faults, 1); assert.equal(r.hits, 1); assert.equal(r.misses, 2);
    const noTLB = L.ptRunSequence(t, [0, 0, 0].map(pageAddr), { entries: 0 });
    assert.deepEqual(noTLB.steps.map((s) => s.memRefs), [3, 3, 3], "without a TLB every access walks the tables");
    assert.equal(noTLB.hits, 0);
  });

  QUnit.test("A faulting access is never cached; the TLB never holds a stale or wrong translation", (assert) => {
    const table = L.ptPresetTable("teach16"), maps = new Map(L.ptPresetMappings("teach16").map((m) => [m.vpn, m.frame]));
    const rng = M.mulberry32(5);
    const addrs = Array.from({ length: 400 }, () => (rng() < 0.7 ? [0x0010, 0x1034, 0xfe80, 0x0112, 0x1122, 0xff01][Math.floor(rng() * 6)] : Math.floor(rng() * 65536)));
    for (const policy of ["LRU", "FIFO"]) for (const entries of [1, 2, 4, 8]) {
      const run = L.ptRunSequence(table, addrs, { entries, policy });
      assert.equal(run.hits + run.misses + run.faults, addrs.length, `${policy}/${entries}: every access is a hit, a miss or a fault`);
      let bad = null;
      run.steps.forEach((s) => {
        if (s.tlb.length > entries) bad = "TLB over capacity";
        s.tlb.forEach((e) => { if (maps.get(e.vpn) !== e.frame) bad = "wrong cached translation"; });
        if (s.fault && s.tlb.some((e) => e.vpn === s.split.vpn)) bad = "faulting page was cached";
        if (!s.fault && s.physical !== maps.get(s.split.vpn) * 256 + s.split.offset) bad = "wrong physical address";
      });
      assert.strictEqual(bad, null, `${policy}/${entries}: ${bad || "consistent"}`);
    }
  });

  QUnit.test("A bigger TLB never has fewer hits for LRU (stack property) on a repeating loop", (assert) => {
    const table = L.ptPresetTable("teach16"), loop = [0x0010, 0x0110, 0x1010, 0x1110, 0xfe10].flatMap((a) => [a, a + 1]);
    const seq = Array.from({ length: 6 }, () => loop).flat();
    const hits = [0, 1, 2, 3, 4, 5, 8].map((n) => L.ptRunSequence(table, seq, { entries: n, policy: "LRU" }).hits);
    assert.ok(hits.every((h, i) => i === 0 || h >= hits[i - 1]), `hits by TLB size: ${hits}`);
    assert.equal(hits[0], 0, "no TLB, no hits");
  });

  QUnit.test("Effective access time and TLB reach", (assert) => {
    assert.ok(near(L.eatWithTLB({ hit: 0.98, tlbNs: 1, memNs: 100, levels: 1 }), 103.0), "the single-level figure in the lesson");
    assert.ok(near(L.eatWithTLB({ hit: 0.98, tlbNs: 1, memNs: 100, levels: 2 }), 105.0), "two levels: 0.98×101 + 0.02×301");
    assert.ok(near(L.eatWithTLB({ hit: 1, tlbNs: 1, memNs: 100, levels: 4 }), 101), "perfect TLB: the number of levels does not matter");
    assert.ok(near(L.eatWithTLB({ hit: 0, tlbNs: 1, memNs: 100, levels: 4 }), 501), "no hits: 4 table reads + data + TLB probe");
    assert.equal(L.tlbReach(64, 4096), 262144, "64 entries × 4 KiB = 256 KiB");
    assert.equal(L.tlbReach(64, 2 * 1024 * 1024), 128 * 1024 * 1024, "huge pages multiply the reach");
  });
})();
