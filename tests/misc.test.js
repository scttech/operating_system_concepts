(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/misc.js") : window.OSLib;
  const near = (assert, a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ""} ${a} ≈ ${b}`);

  QUnit.module("performance formulas");

  QUnit.test("Amdahl's law", (assert) => {
    near(assert, L.amdahl(0.9, 10), 1 / 0.19, "p=0.9, N=10");
    assert.equal(L.amdahl(0.5, 1), 1);
    assert.equal(L.amdahlLimit(0.5), 2);
    assert.equal(L.amdahlLimit(1), Infinity);
    assert.ok(L.amdahl(0.5, 1e9) < 2);
    near(assert, L.gustafson(0.9, 10), 9.1, "Gustafson");
  });

  QUnit.test("Context-switch efficiency", (assert) => {
    near(assert, L.switchEfficiency(10, 1), 10 / 11);
  });

  QUnit.module("permissions");

  QUnit.test("Octal / symbolic conversions", (assert) => {
    assert.equal(L.bitsToOctal(L.octalToBits("754")), "754");
    assert.equal(L.bitsToSymbolic(L.octalToBits("754")), "rwxr-xr--");
    assert.equal(L.bitsToSymbolic(L.octalToBits("644")), "rw-r--r--");
    assert.equal(L.bitsToOctal(L.octalToBits("0")), "000");
    for (let n = 0; n < 512; n++) { const o = n.toString(8).padStart(3, "0"); assert.equal(L.bitsToOctal(L.octalToBits(o)), o); }
  });

  QUnit.test("umask", (assert) => {
    assert.equal(L.applyUmask("666", "022"), "644");
    assert.equal(L.applyUmask("777", "022"), "755");
    assert.equal(L.applyUmask("666", "077"), "600");
  });

  QUnit.test("allowed()", (assert) => {
    const bits = L.octalToBits("640");
    assert.true(L.allowed(bits, "owner", "w"));
    assert.true(L.allowed(bits, "group", "r"));
    assert.false(L.allowed(bits, "group", "w"));
    assert.false(L.allowed(bits, "other", "r"));
  });

  QUnit.module("file systems");

  QUnit.test("Maximum file size", (assert) => {
    assert.equal(L.maxFileSize({ blockSize: 4096, ptrSize: 4, direct: 12, single: 1, double: 0 }), 4144 * 1024);
    assert.equal(L.maxFileSize({ blockSize: 4096, ptrSize: 4, direct: 12, single: 1, double: 1 }), (12 + 1024 + 1024 * 1024) * 4096);
    assert.equal(L.maxFileSize({ blockSize: 1024, ptrSize: 4, direct: 10, single: 0, double: 0 }), 10 * 1024);
  });

  QUnit.test("Reads needed to reach a block", (assert) => {
    assert.equal(L.readsToBlock("contiguous", 100), 1);
    assert.equal(L.readsToBlock("linked", 0), 1);
    assert.equal(L.readsToBlock("linked", 9), 10);
    assert.equal(L.readsToBlock("fat", 9), 1);
    assert.equal(L.readsToBlock("indexed", 5), 1);
    assert.equal(L.readsToBlock("indexed", 12), 2);
    assert.equal(L.readsToBlock("indexed", 12 + 1024), 3);
    assert.throws(() => L.readsToBlock("bogus", 1));
  });

  QUnit.module("processes");

  QUnit.test("fork tree has 2^n processes", (assert) => {
    const count = (n) => 1 + n.children.reduce((s, c) => s + count(c), 0);
    for (let n = 0; n <= 6; n++) { assert.equal(count(L.forkTree(n)), L.forkCount(n)); }
    assert.equal(L.forkCount(3), 8);
  });

  QUnit.module("dining philosophers");

  function run(strategy, seed, steps = 3000, n = 5) {
    const t = L.newTable(n, strategy, seed);
    for (let i = 0; i < steps; i++) {
      if (L.stepTable(t) === null) return { t, deadlocked: true };
      // safety: neighbors never eat at once, an eater holds both forks
      for (let p = 0; p < n; p++) {
        if (t.phil[p].s === "eating") {
          if (t.phil[(p + 1) % n].s === "eating") throw new Error("neighbors eating simultaneously");
          if (t.fork[p] !== p || t.fork[(p + 1) % n] !== p) throw new Error("eater does not hold both forks");
        }
      }
    }
    return { t, deadlocked: false };
  }

  QUnit.test("Naive strategy deadlocks for some seeds", (assert) => {
    const dead = [...Array(30).keys()].filter((s) => run("naive", s + 1).deadlocked);
    assert.ok(dead.length > 0, `${dead.length}/30 seeds deadlocked`);
    const t = run("naive", dead[0] + 1).t;
    assert.true(L.isDeadlocked(t));
    assert.ok(t.phil.every((p) => p.s === "hasFirst"), "classic deadlock: everyone holds exactly one fork");
  });

  ["ordered", "asymmetric", "limit"].forEach((strategy) => {
    QUnit.test(`${strategy} strategy never deadlocks and everyone eats`, (assert) => {
      for (let seed = 1; seed <= 25; seed++) {
        const r = run(strategy, seed);
        assert.false(r.deadlocked, `seed ${seed}`);
        assert.ok(r.t.phil.every((p) => p.meals > 0), `seed ${seed}: no one starved`);
      }
    });
  });

  QUnit.test("Seeded runs are reproducible", (assert) => {
    const a = L.newTable(5, "naive", 7), b = L.newTable(5, "naive", 7);
    const la = [], lb = [];
    for (let i = 0; i < 50; i++) { la.push(L.stepTable(a)); lb.push(L.stepTable(b)); }
    assert.deepEqual(la, lb);
  });
})();
