/* The boot process: stage sequences and failures, the master boot record byte layout, service start order, and the chain of trust. */
(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/boot.js") : window.OSLib;
  const ids = (r) => r.steps.map((s) => s.id);

  QUnit.module("boot process");

  QUnit.test("A normal boot walks the stages in order, ending with user space", (assert) => {
    for (const k of Object.keys(L.bootStages)) {
      const r = L.bootRun(k, "none");
      assert.equal(r.outcome, "booted");
      assert.equal(r.failedAt, null);
      assert.equal(ids(r)[0], "power", `${k}: starts at power-on`);
      assert.deepEqual(ids(r).slice(-5), ["kernel-load", "kernel-start", "initramfs", "init", "login"], `${k}: the common tail`);
      assert.equal(new Set(ids(r)).size, ids(r).length, `${k}: no stage repeats`);
      assert.true(r.steps.every((s) => s.actor && s.title && s.where && s.mode && s.text));
    }
    assert.true(ids(L.bootRun("bios", "none")).includes("stage1"), "only the BIOS path has the 446-byte stage");
    assert.false(ids(L.bootRun("uefi", "none")).includes("stage1"));
    assert.true(ids(L.bootRun("secure", "none")).includes("verify-loader") && ids(L.bootRun("secure", "none")).includes("verify-kernel"));
  });

  QUnit.test("Each failure stops the boot at the right stage with the right outcome", (assert) => {
    let r = L.bootRun("bios", "nosig");
    assert.deepEqual([r.failedAt, r.outcome, ids(r).slice(-1)[0]], ["mbr", "halted", "mbr"]);
    assert.ok(/Missing operating system/.test(r.message));
    r = L.bootRun("uefi", "nosig");
    assert.equal(r.failedAt, "esp");
    r = L.bootRun("secure", "unsigned");
    assert.deepEqual([r.failedAt, r.outcome], ["verify-loader", "halted"]);
    assert.false(ids(r).includes("loader"), "the unsigned loader never ran");
    r = L.bootRun("uefi", "unsigned");
    assert.deepEqual([r.failedAt, r.outcome], [null, "booted"], "without Secure Boot the tampered loader runs");
    r = L.bootRun("bios", "unsigned");
    assert.equal(r.outcome, "booted");
    r = L.bootRun("uefi", "nokernel");
    assert.deepEqual([r.failedAt, ids(r).slice(-1)[0]], ["kernel-load", "kernel-load"]);
    r = L.bootRun("secure", "noroot");
    assert.deepEqual([r.failedAt, r.outcome], ["initramfs", "halted"]);
    assert.false(ids(r).includes("init"), "no PID 1 without a root file system");
    r = L.bootRun("bios", "service");
    assert.deepEqual([r.failedAt, r.outcome, ids(r).slice(-1)[0]], ["init", "recovery", "init"], "the machine is up enough to repair");
    assert.throws(() => L.bootRun("tape", "none"));
    assert.throws(() => L.bootRun("bios", "flood"));
  });

  QUnit.test("Master boot record: the byte layout", (assert) => {
    const b = L.mbrBuild([{ active: true, type: 0x83, start: 2048, sectors: 1048576 }]);
    assert.equal(b.length, 512);
    assert.deepEqual([b[510], b[511]], [0x55, 0xaa], "signature at 510-511");
    assert.deepEqual([...b.slice(446, 462)], [0x80, 0xfe, 0xff, 0xff, 0x83, 0xfe, 0xff, 0xff, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00], "first entry, little-endian LBA and size");
    assert.true([...b.slice(462, 510)].every((x) => x === 0), "the other three entries are empty");
    assert.true([...b.slice(0, 446)].every((x) => x === 0), "boot code area");
    assert.equal(L.mbrBuild([], 0x90)[0], 0x90, "boot code area can be filled");
    assert.throws(() => L.mbrBuild(Array(5).fill({ type: 1, start: 1, sectors: 1 })), /four/);
    assert.throws(() => L.mbrBuild([{ type: 1, start: -1, sectors: 1 }]));
    assert.throws(() => L.mbrBuild([{ type: 1, start: 1, sectors: 2 ** 32 }]));
    assert.throws(() => L.mbrParse(new Uint8Array(511)));
  });

  QUnit.test("MBR: parsing the example disk and the lines the C and Python examples print", (assert) => {
    const b = L.mbrBuild([{ active: true, type: 0x83, start: 2048, sectors: 1048576 }, { type: 0x82, start: 1050624, sectors: 2097152 }, { type: 0x07, start: 3147776, sectors: 41943040 }]);
    const m = L.mbrParse(b);
    assert.true(m.valid);
    assert.deepEqual(m.partitions.map((p) => [p.used, p.type, p.start, p.sectors]), [[true, 0x83, 2048, 1048576], [true, 0x82, 1050624, 2097152], [true, 0x07, 3147776, 41943040], [false, 0, 0, 0]]);
    assert.deepEqual(L.mbrLines(m), [
      "boot signature (bytes 510-511): 0x55AA, valid",
      "partition 1: active type 0x83 Linux          start LBA 2048     size 512 MiB",
      "partition 2: idle   type 0x82 Linux swap     start LBA 1050624  size 1024 MiB",
      "partition 3: idle   type 0x07 NTFS / exFAT   start LBA 3147776  size 20480 MiB",
      "partition 4: unused",
      "the first partition starts at byte 1048576 (1 MiB), aligned to 1 MiB: True"
    ]);
    const bad = new Uint8Array(b); bad[511] = 0;
    assert.false(L.mbrParse(bad).valid);
    assert.ok(/not 0x55AA, invalid/.test(L.mbrLines(L.mbrParse(bad))[0]));
    assert.equal(L.mbrParse(L.mbrBuild([{ type: 0x99, start: 63, sectors: 100 }])).partitions[0].typeName, "unknown");
    assert.ok(/aligned to 1 MiB: False/.test(L.mbrLines(L.mbrParse(L.mbrBuild([{ type: 0x83, start: 63, sectors: 4096 }]))).pop()), "the old start at sector 63 is not aligned");
  });

  QUnit.test("MBR: random sectors survive a build and parse round trip, including values over 2^31", (assert) => {
    let seed = 5;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let bad = 0;
    for (let t = 0; t < 300; t++) {
      const parts = Array.from({ length: Math.floor(rnd() * 5) }, () => ({ active: rnd() < 0.3, type: 1 + Math.floor(rnd() * 254), start: Math.floor(rnd() * 0xffffffff), sectors: 1 + Math.floor(rnd() * 0xfffffffe) }));
      const m = L.mbrParse(L.mbrBuild(parts));
      parts.forEach((p, i) => { const q = m.partitions[i]; if (q.active !== p.active || q.type !== p.type || q.start !== p.start || q.sectors !== p.sectors) bad++; });
      if (!m.valid || m.partitions.slice(parts.length).some((q) => q.used)) bad++;
    }
    assert.equal(bad, 0);
  });

  const web = [
    { name: "local-fs", dur: 2, after: [] }, { name: "network", dur: 3, after: ["local-fs"] }, { name: "logging", dur: 1, after: ["local-fs"] },
    { name: "database", dur: 4, after: ["network", "logging"] }, { name: "web", dur: 2, after: ["database", "network"] }, { name: "cron", dur: 1, after: ["logging"] }, { name: "ssh", dur: 1, after: ["network"] }
  ];

  QUnit.test("Service order: parallel start, total time and critical path", (assert) => {
    const r = L.bootOrder(web);
    assert.deepEqual(r.schedule.map((s) => `${s.name}@${s.start}`), ["local-fs@0", "logging@2", "network@2", "cron@3", "database@5", "ssh@5", "web@9"]);
    assert.equal(r.total, 11);
    assert.equal(r.serial, 14);
    assert.deepEqual(r.critical, ["local-fs", "network", "database", "web"]);
    assert.deepEqual(L.bootOrder([{ name: "a", dur: 3, after: [] }, { name: "b", dur: 3, after: [] }]).total, 3, "independent units run together");
    assert.deepEqual(L.bootOrder([{ name: "a", dur: 1, after: [] }, { name: "b", dur: 1, after: ["a"] }, { name: "c", dur: 1, after: ["b"] }]).critical, ["a", "b", "c"]);
  });

  QUnit.test("Service order: cycles are detected, bad input is rejected", (assert) => {
    assert.deepEqual(L.bootOrder([{ name: "a", dur: 1, after: ["b"] }, { name: "b", dur: 1, after: ["a"] }, { name: "c", dur: 1, after: [] }]).cycle, ["a", "b"]);
    assert.deepEqual(L.bootOrder([{ name: "a", dur: 1, after: ["a"] }]).cycle, ["a"], "a unit that waits for itself");
    assert.throws(() => L.bootOrder([{ name: "a", dur: 1, after: ["zzz"] }]));
    assert.throws(() => L.bootOrder([{ name: "a", dur: 1, after: [] }, { name: "a", dur: 1, after: [] }]));
    assert.throws(() => L.bootOrder([{ name: "a", dur: 0, after: [] }]));
  });

  QUnit.test("Service order on random graphs matches a longest-path calculation, and cycles match a depth-first search", (assert) => {
    let seed = 31;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let bad = 0, cyc = 0;
    for (let t = 0; t < 400; t++) {
      const n = 2 + Math.floor(rnd() * 8), allowBack = rnd() < 0.3;
      const units = Array.from({ length: n }, (_, i) => ({ name: "u" + i, dur: 1 + Math.floor(rnd() * 5), after: [] }));
      units.forEach((u, i) => { for (let j = 0; j < n; j++) if (j !== i && rnd() < 0.25 && (j < i || allowBack)) u.after.push("u" + j); });
      // oracle: depth-first search for a cycle, then memoized longest path
      const idx = (name) => +name.slice(1), color = Array(n).fill(0); let hasCycle = false;
      const dfs = (i) => { color[i] = 1; for (const d of units[i].after) { const j = idx(d); if (color[j] === 1) hasCycle = true; else if (color[j] === 0) dfs(j); } color[i] = 2; };
      for (let i = 0; i < n; i++) if (color[i] === 0) dfs(i);
      const r = L.bootOrder(units);
      if (hasCycle !== !!r.cycle) { bad++; continue; }
      if (hasCycle) { cyc++; continue; }
      const memo = {}, finish = (i) => (memo[i] !== undefined ? memo[i] : (memo[i] = units[i].dur + Math.max(0, ...units[i].after.map((d) => finish(idx(d))))));
      const want = Math.max(...units.map((_, i) => finish(i)));
      if (r.total !== want) bad++;
      r.schedule.forEach((s) => { if (s.end !== finish(idx(s.name))) bad++; });
      const chain = r.critical.map((nm) => units[idx(nm)]);
      if (chain.reduce((a, u) => a + u.dur, 0) !== want) bad++;
      chain.forEach((u, i) => { if (i && !u.after.includes(chain[i - 1].name)) bad++; });
    }
    assert.equal(bad, 0);
    assert.ok(cyc > 10, `cyclic cases were exercised (${cyc})`);
  });

  QUnit.test("Chain of trust: the first tampered link breaks everything after it", (assert) => {
    assert.deepEqual(L.verifyChain([]), { verified: L.bootChain.map((c) => c.name), failedAt: null, refused: [] });
    const r = L.verifyChain(["Boot loader (GRUB)"]);
    assert.equal(r.failedAt, "Boot loader (GRUB)");
    assert.deepEqual(r.verified, ["Firmware", "Boot loader (shim)"]);
    assert.deepEqual(r.refused, ["Boot loader (GRUB)", "Kernel", "Kernel modules (drivers)"]);
    assert.equal(L.verifyChain(["Kernel modules (drivers)", "Kernel"]).failedAt, "Kernel", "the earliest tampered link is reported");
    assert.equal(L.verifyChain(["Firmware"]).failedAt, null, "firmware is the root of trust: it is not verified by anything earlier");
  });
})();
