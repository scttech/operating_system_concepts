/* Virtualization and containers: stacks, namespaces, control-group allocation and VM exits, checked against independent calculations. */
(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/virt.js") : window.OSLib;
  const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

  QUnit.module("virtualization");

  QUnit.test("Kernel counts: containers share one kernel, VMs each bring their own", (assert) => {
    assert.equal(L.virtKernelCount("bare", 5), 1);
    assert.equal(L.virtKernelCount("container", 1), 1);
    assert.equal(L.virtKernelCount("container", 50), 1, "fifty containers, one kernel");
    assert.equal(L.virtKernelCount("type1", 3), 3, "the bare-metal hypervisor is not a general-purpose kernel; each guest has one");
    assert.equal(L.virtKernelCount("type2", 3), 4, "the host OS plus three guests");
    assert.equal(L.virtKernelCount("cloud", 4), 4, "one guest kernel per VM, however many containers run inside");
    assert.throws(() => L.virtKernelCount("nope", 1));
    assert.throws(() => L.virtKernelCount("bare", 0));
    Object.values(L.virtStacks).forEach((s) => assert.ok(s.name && s.note && s.base.length && s.unit.length));
  });

  QUnit.test("Isolation matrix: a container is not a VM", (assert) => {
    const row = (a) => L.isolationMatrix.find((r) => r.aspect === a);
    assert.deepEqual([row("Own kernel").process, row("Own kernel").container, row("Own kernel").vm], [false, false, true]);
    assert.true(row("Can run a different operating system").vm);
    assert.false(row("Can run a different operating system").container);
    assert.true(row("Starts in about a second or less").container);
    assert.false(row("Starts in about a second or less").vm);
    L.isolationMatrix.forEach((r) => assert.ok(L.isolationTech.every((t) => typeof r[t] === "boolean") && r.note));
  });

  QUnit.test("Namespaces: each one changes exactly its own probe", (assert) => {
    const none = L.nsView({}), all = L.nsView(Object.fromEntries(L.nsNames.map((n) => [n.key, true])));
    assert.equal(none.length, 7);
    assert.true(none.every((p) => !p.isolated));
    assert.true(all.every((p) => p.isolated));
    L.nsNames.forEach((n) => {
      const one = L.nsView({ [n.key]: true });
      one.forEach((p, i) => {
        if (p.ns === n.key) assert.notDeepEqual([p.output, p.isolated], [none[i].output, none[i].isolated], `${n.key} changes what ${p.command} prints`);
        else assert.deepEqual(p, none[i], `${n.key} does not change ${p.command}`);
      });
    });
    assert.ok(/^1 /.test(L.nsView({ pid: true }).find((p) => p.ns === "pid").output), "the first process inside a PID namespace is PID 1");
    assert.equal(L.nsView(undefined).length, 7, "missing flags mean no isolation");
  });

  QUnit.test("PID translation: the same processes under two numberings", (assert) => {
    assert.deepEqual(L.pidTranslate([4150, 4188, 4201]), [{ host: 4150, inside: 1 }, { host: 4188, inside: 2 }, { host: 4201, inside: 3 }]);
    assert.deepEqual(L.pidTranslate([]), []);
    assert.throws(() => L.pidTranslate([5, 5]));
    assert.throws(() => L.pidTranslate([0]));
  });

  /** Independent oracle: find the water level by bisection. Each group gets min(limit, weight * level). */
  function oracle(groups, cpus) {
    const lim = groups.map((g) => Math.min(g.demand, g.cap === null || g.cap === undefined ? Infinity : g.cap));
    const total = (lv) => groups.reduce((s, g, i) => s + Math.min(lim[i], g.weight * lv), 0);
    if (lim.reduce((a, b) => a + b, 0) <= cpus) return lim;
    let lo = 0, hi = 1e6;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (total(mid) < cpus) lo = mid; else hi = mid; }
    return groups.map((g, i) => Math.min(lim[i], g.weight * lo));
  }

  QUnit.test("CPU allocation: equal weights, caps and spare capacity", (assert) => {
    let r = L.cgAllocate([{ name: "a", weight: 100, demand: 4 }, { name: "b", weight: 100, demand: 4 }], 4);
    assert.deepEqual(r.map((x) => x.alloc), [2, 2], "equal weights share equally");
    assert.deepEqual(r.map((x) => x.state), ["squeezed", "squeezed"]);
    r = L.cgAllocate([{ name: "a", weight: 300, demand: 4 }, { name: "b", weight: 100, demand: 4 }], 4);
    assert.deepEqual(r.map((x) => x.alloc), [3, 1], "weights are proportional under contention");
    r = L.cgAllocate([{ name: "a", weight: 100, demand: 1 }, { name: "b", weight: 100, demand: 8 }], 4);
    assert.deepEqual(r.map((x) => x.alloc), [1, 3], "a group that needs less leaves the rest to the others (work-conserving)");
    assert.equal(r[0].state, "satisfied");
    r = L.cgAllocate([{ name: "a", weight: 100, demand: 4, cap: 0.5 }], 8);
    assert.deepEqual([r[0].alloc, r[0].state], [0.5, "capped"], "a cap holds a group back even when the machine is idle");
    r = L.cgAllocate([{ name: "a", weight: 100, demand: 0 }, { name: "b", weight: 100, demand: 2 }], 4);
    assert.deepEqual(r.map((x) => x.alloc), [0, 2]);
    assert.throws(() => L.cgAllocate([{ name: "a", weight: 0, demand: 1 }], 1));
    assert.throws(() => L.cgAllocate([], 0));
  });

  QUnit.test("CPU allocation on random inputs matches an independent bisection and never breaks the rules", (assert) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let bad = 0;
    for (let t = 0; t < 500; t++) {
      const n = 1 + Math.floor(rnd() * 5), cpus = 1 + Math.floor(rnd() * 8);
      const groups = Array.from({ length: n }, (_, i) => ({ name: "g" + i, weight: 1 + Math.floor(rnd() * 500), demand: Math.round(rnd() * 80) / 10, cap: rnd() < 0.4 ? Math.round(rnd() * 40) / 10 : null }));
      const r = L.cgAllocate(groups, cpus), want = oracle(groups, cpus);
      const sum = r.reduce((s, x) => s + x.alloc, 0), wantSum = Math.min(cpus, groups.reduce((s, g) => s + Math.min(g.demand, g.cap === null ? Infinity : g.cap), 0));
      if (!near(sum, wantSum, 1e-6)) bad++;
      r.forEach((x, i) => { if (!near(x.alloc, want[i], 1e-5) || x.alloc > x.limit + 1e-9 || x.alloc < -1e-12) bad++; });
    }
    assert.equal(bad, 0, "500 random cases: total = min(cores, total limits), each group = min(limit, weight x level)");
  });

  QUnit.test("Memory limit: the OOM killer works inside the group and takes the largest first", (assert) => {
    let r = L.oomKill([{ name: "db", mib: 300 }, { name: "web", mib: 100 }, { name: "cache", mib: 150 }], 600);
    assert.deepEqual([r.killed, r.total], [[], 550], "within the limit nothing happens");
    r = L.oomKill([{ name: "db", mib: 300 }, { name: "web", mib: 100 }, { name: "cache", mib: 250 }], 400);
    assert.deepEqual(r.killed, ["db"], "the biggest process goes first");
    assert.deepEqual(r.remaining, ["web", "cache"]);
    assert.equal(r.total, 350);
    r = L.oomKill([{ name: "a", mib: 500 }], 100);
    assert.deepEqual([r.killed, r.remaining, r.total], [["a"], [], 0]);
    assert.throws(() => L.oomKill([{ name: "x", mib: -1 }], 10));
  });

  QUnit.test("VM exits: emulated devices exit constantly, virtio batches, passthrough avoids them", (assert) => {
    assert.deepEqual(L.vmExits(1000, 32, "emulated", 2000), { exits: 7000, cycles: 14000000, perPacket: 14000 });
    assert.equal(L.vmExits(1000, 32, "virtio", 2000).exits, 2 * Math.ceil(1000 / 32), "one kick and one interrupt per batch");
    assert.equal(L.vmExits(1000, 1, "virtio", 2000).exits, 2000, "a batch of 1 gives up the advantage");
    assert.equal(L.vmExits(1000, 32, "passthrough", 2000).exits, 0);
    assert.equal(L.vmExits(0, 8, "virtio", 100).perPacket, 0);
    for (const batch of [1, 2, 8, 64]) assert.true(L.vmExits(500, batch, "virtio", 1).exits <= L.vmExits(500, batch, "emulated", 1).exits, "virtio never needs more exits than emulation");
    assert.throws(() => L.vmExits(10, 0, "virtio", 1));
    assert.throws(() => L.vmExits(10, 1, "magic", 1));
    assert.throws(() => L.vmExits(-1, 1, "virtio", 1));
  });
})();
