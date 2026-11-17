(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/memory.js") : window.OSLib;

  // Holes of 100, 500, 200, 300, 600 separated by occupied blocks (textbook layout).
  function layout() {
    const sizes = [100, 500, 200, 300, 600];
    const out = []; let pos = 0;
    sizes.forEach((s, i) => {
      out.push({ start: pos, size: s, pid: null }); pos += s;
      if (i < sizes.length - 1) { out.push({ start: pos, size: 10, pid: "os" + i }); pos += 10; }
    });
    return out;
  }
  const placeAll = (strategy) => {
    let blocks = layout(); const results = [];
    [212, 417, 112, 426].forEach((sz, i) => {
      const r = L.allocate(blocks, "P" + i, sz, strategy);
      results.push(r.ok); blocks = r.blocks;
    });
    return { results, blocks };
  };

  QUnit.module("memory allocation");

  QUnit.test("First-fit cannot place the 426K request", (assert) => assert.deepEqual(placeAll("first").results, [true, true, true, false]));
  QUnit.test("Best-fit places all four requests", (assert) => assert.deepEqual(placeAll("best").results, [true, true, true, true]));
  QUnit.test("Worst-fit cannot place the 426K request", (assert) => assert.deepEqual(placeAll("worst").results, [true, true, true, false]));

  QUnit.test("Best-fit puts 212K in the 300K hole", (assert) => {
    const r = L.allocate(layout(), "P", 212, "best");
    assert.equal(r.blocks.find((b) => b.pid === "P").start, layout().find((b) => b.size === 300).start);
  });

  QUnit.test("Allocation conserves total memory and keeps blocks contiguous", (assert) => {
    ["first", "best", "worst"].forEach((s) => {
      const { blocks } = placeAll(s);
      assert.equal(blocks.reduce((t, b) => t + b.size, 0), 1700 + 40);
      assert.ok(blocks.every((b, i) => i === 0 || b.start === blocks[i - 1].start + blocks[i - 1].size));
    });
  });

  QUnit.test("Releasing merges adjacent holes", (assert) => {
    let b = [{ start: 0, size: 100, pid: null }];
    b = L.allocate(b, "A", 30, "first").blocks;
    b = L.allocate(b, "B", 30, "first").blocks;
    b = L.release(b, "A"); b = L.release(b, "B");
    assert.deepEqual(b, [{ start: 0, size: 100, pid: null }]);
  });

  QUnit.test("Compaction eliminates external fragmentation", (assert) => {
    const { blocks } = placeAll("first");
    const before = L.fragmentation(blocks), after = L.fragmentation(L.compact(blocks));
    assert.ok(before.external > 0);
    assert.equal(after.holes, 1);
    assert.equal(after.external, 0);
    assert.equal(after.free, before.free);
  });

  QUnit.test("Paging translation", (assert) => {
    assert.deepEqual(L.translate(5000, 1024, [7, 3, 2, 9, 1]), { page: 4, offset: 904, frame: 1, physical: 1928, valid: true });
    assert.false(L.translate(6000, 1024, [7, 3, 2, 9, 1]).valid, "page 5 is not in the table");
    assert.false(L.translate(0, 1024, [null]).valid);
  });

  QUnit.test("Power-of-two helpers", (assert) => {
    assert.true(L.isPow2(4096)); assert.false(L.isPow2(0)); assert.false(L.isPow2(3000));
    assert.equal(L.log2(4096), 12);
  });
})();
