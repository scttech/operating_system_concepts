/* Shareable links: every kind of field round-trips, and malformed or hostile links are ignored, never trusted. */
(function () {
  "use strict";
  let S;
  if (typeof require !== "undefined") S = require("../js/lib/share.js"); else S = window.OSLib.share;
  const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (r, n) => Math.floor(r() * n);

  QUnit.module("share links");

  QUnit.test("Each kind of value decodes only what it should", (assert) => {
    const cases = [
      [S.int(0, 10), ["0", "10", "7"], ["", "-1", "11", "1.5", "1e3", "0x5", " 5", "5 ", "+5", "NaN", "Infinity", "99999999999"]],
      [S.num(0.01, 1, 2), ["0.01", "1", "0.5"], ["0", "1.01", "0.005x", "", ".5", "1e-1", "-0.5"]],
      [S.bool(), ["1", "0"], ["", "true", "2"]],
      [S.oneOf(["FCFS", "RR"]), ["FCFS", "RR"], ["", "fcfs", "RR,FCFS", "FCFS ", "__proto__", "constructor"]],
      [S.word(4), ["P1", "a_b-", "ABCD"], ["", "ABCDE", "a b", "<b>", "a;b", "a,b", "é", "a=b"]],
      [S.ints(0, 9, 1, 3), ["1", "1,2,3", "0,9"], ["", "1,2,3,4", "10", "1,,2", "1,a", "1, 2", ","]],
      [S.table([S.word(3), S.int(0, 9)], 1, 2, 0), ["P,1", "P,1;Q,2"], ["", "P,1;P,2", "P", "P,1,2", "P,10", "P,1;Q,2;R,3", "P,1;"]],
      [S.matrix(2, 2, 0, 9), ["1,2;3,4"], ["1,2", "1,2;3", "1,2;3,4;5,6", "1,2;3,x", "1,2;3,10"]],
      [S.tokens("a[0-9]{1,2}|c", 3), ["a5,c,a10", "c"], ["a", "a100", "b", "a5,c,a1,c", "a5,,c", "C"]]
    ];
    cases.forEach(([t, good, bad]) => {
      good.forEach((g) => assert.notStrictEqual(S.decode(t, g), undefined, `${t.k}: accepts ${JSON.stringify(g)}`));
      bad.forEach((b) => assert.strictEqual(S.decode(t, b), undefined, `${t.k}: rejects ${JSON.stringify(b)}`));
    });
    assert.deepEqual(S.decode(S.table([S.word(3), S.int(0, 9)], 1, 2, 0), "P,1;Q,2"), [["P", 1], ["Q", 2]]);
    assert.deepEqual(S.decode(S.tokens("c", 5), ""), [], "an empty list of commands is valid");
    assert.strictEqual(S.decode(S.int(0, 10), 5), undefined, "only text is decoded");
    assert.strictEqual(S.decode(S.word(8), "x".repeat(5000)), undefined, "huge values are refused");
  });

  QUnit.test("encode refuses values it could not read back", (assert) => {
    assert.strictEqual(S.encode(S.int(0, 10), 11), null);
    assert.strictEqual(S.encode(S.int(0, 10), 1.5), null);
    assert.strictEqual(S.encode(S.int(0, 10), "5"), null);
    assert.strictEqual(S.encode(S.num(0, 1, 2), NaN), null);
    assert.strictEqual(S.encode(S.oneOf(["a"]), "b"), null);
    assert.strictEqual(S.encode(S.word(3), "a b"), null);
    assert.strictEqual(S.encode(S.ints(0, 9, 1, 2), [1, 2, 3]), null);
    assert.strictEqual(S.encode(S.table([S.word(3)], 1, 2, 0), [["a"], ["a"]]), null, "duplicates in a unique column");
    assert.strictEqual(S.encode(S.matrix(1, 2, 0, 9), [[1]]), null);
    assert.strictEqual(S.encode(S.tokens("a", 2), ["a", "b"]), null);
    assert.strictEqual(S.encode(S.num(0, 1, 2), 0.456), "0.46", "numbers are written with their limit of decimals");
  });

  QUnit.test("Round trip: state to link to state, for random states of every kind", (assert) => {
    const spec = { n: S.int(-5, 500), x: S.num(0, 9.99, 2), on: S.bool(), mode: S.oneOf(["up", "down", "both"]), name: S.word(6),
      list: S.ints(0, 999, 1, 30), procs: S.table([S.word(4), S.int(0, 99), S.int(1, 99)], 1, 8, 0), grid: S.matrix(3, 3, 0, 99), ops: S.tokens("a[0-9]{1,3}|f[0-9]|c", 20) };
    const r = rng(42), words = ["P1", "P2", "P3", "P4", "P5", "Q", "abc", "x_y"];
    for (let k = 0; k < 300; k++) {
      const state = {
        n: pick(r, 506) - 5, x: Math.round(r() * 999) / 100, on: r() < 0.5, mode: ["up", "down", "both"][pick(r, 3)], name: words[pick(r, words.length)],
        list: Array.from({ length: 1 + pick(r, 30) }, () => pick(r, 1000)),
        procs: Array.from({ length: 1 + pick(r, 8) }, (_, i) => [words[i], pick(r, 100), 1 + pick(r, 99)]),
        grid: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => pick(r, 100))),
        ops: Array.from({ length: pick(r, 21) }, () => ["a" + (1 + pick(r, 999)), "f" + pick(r, 10), "c"][pick(r, 3)])
      };
      const hash = S.toHash("sim", spec, state);
      assert.ok(hash.length < S.MAX_HASH, "a typical link is short enough");
      const back = S.fromHash("sim", spec, "#" + hash);
      assert.deepEqual(back.ignored, [], "nothing ignored");
      assert.deepEqual(back.state, state, "state survives the link: " + hash.slice(0, 80));
      assert.equal(S.toHash("sim", spec, back.state), hash, "and the link is stable");
    }
  });

  QUnit.test("Links name a simulation: other simulations' keys and unknown keys are ignored", (assert) => {
    const spec = { q: S.int(1, 12), algo: S.oneOf(["FCFS", "RR"]) };
    const h = "#scheduling.q=3&disk.q=9&scheduling.algo=RR&scheduling.evil=1&p=disk:1:1&compare=windows";
    assert.deepEqual(S.fromHash("scheduling", spec, h), { state: { q: 3, algo: "RR" }, ignored: [] });
    assert.deepEqual(S.fromHash("disk", spec, h), { state: { q: 9 }, ignored: [] });
    assert.deepEqual(S.fromHash("paging", spec, h), { state: {}, ignored: [] });
    assert.deepEqual(S.fromHash("scheduling", spec, "scheduling.q=3"), { state: { q: 3 }, ignored: [] }, "the leading # is optional");
    assert.deepEqual(S.fromHash("scheduling", spec, "#scheduling.q=3&scheduling.q=4").state, { q: 3 }, "the first value wins");
  });

  QUnit.test("One bad field does not spoil the others, and is reported", (assert) => {
    const spec = { q: S.int(1, 12), algo: S.oneOf(["FCFS", "RR"]), list: S.ints(0, 9, 1, 3) };
    const r = S.fromHash("s", spec, "#s.q=99&s.algo=RR&s.list=1,2,3,4");
    assert.deepEqual(r.state, { algo: "RR" });
    assert.deepEqual(r.ignored.sort(), ["list", "q"]);
  });

  QUnit.test("Hostile and malformed links are harmless", (assert) => {
    const spec = { name: S.word(8), q: S.int(0, 9), mode: S.oneOf(["a", "b"]), t: S.table([S.word(4), S.int(0, 9)], 1, 3, 0) };
    const hostile = [
      "#s.name=<script>alert(1)</script>", "#s.name=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E", "#s.name=%00", "#s.name=%E0%A4%A", "#s.name=%",
      "#s.q=1;drop", "#s.q=9e0", "#s.q=%2B5", "#s.mode=__proto__", "#s.mode=toString", "#__proto__.x=1", "#s.__proto__=1", "#s.constructor=1",
      "#s.t=a,1;b,<x>,3", "#=&&&==", "#s.name", "#&&&", "#s.q=" + "9".repeat(4000), "#" + "a".repeat(5000), "#s.name=a&".repeat(100) + "s.q=3", "javascript:alert(1)", null, undefined, 42, {}
    ];
    hostile.forEach((h) => {
      let r;
      assert.ok((() => { try { r = S.fromHash("s", spec, h); return true; } catch (e) { return false; } })(), `does not throw: ${String(h).slice(0, 40)}`);
      Object.values(r.state).forEach((v) => assert.ok(typeof v === "number" || typeof v === "string" || Array.isArray(v), "only plain values"));
      assert.ok(!/[<>"'`&]/.test(JSON.stringify(Object.values(r.state)).replace(/"/g, "")), "nothing that could be markup: " + String(h).slice(0, 30));
    });
    assert.deepEqual(S.fromHash("s", spec, "#s.name=a&".repeat(100) + "s.q=3").state, { name: "a" }, "past the limit on pairs, the rest is ignored");
    assert.deepEqual(S.fromHash("s", spec, "#s.q=" + "9".repeat(4000)).state, {}, "an oversized link is ignored whole");
    assert.equal({}.polluted, undefined, "nothing was added to Object.prototype");
    assert.equal(Object.getPrototypeOf(S.pairs("#s.q=1")), null, "parsed pairs have no prototype");
    assert.deepEqual(S.fromHash("s", spec, "#s.q=7&s.name=ok").state, { q: 7, name: "ok" }, "and good links still work");
  });

  QUnit.test("Percent-encoded values are decoded once, and links are built without unsafe characters", (assert) => {
    const spec = { w: S.word(8), l: S.ints(0, 9, 1, 5) };
    assert.deepEqual(S.fromHash("s", spec, "#s.l=1%2C2%2C3&s.w=a%2db").state, { l: [1, 2, 3], w: "a-b" });
    assert.deepEqual(S.fromHash("s", spec, "#s.w=a%2520b").state, {}, "%25 decodes once, leaving 'a%20b', which is not a word");
    const link = S.linkFor("https://example.org/p/x.html?x=1#old", "s", spec, { w: "ab", l: [1, 2] });
    assert.equal(link, "https://example.org/p/x.html?x=1#s.w=ab&s.l=1,2", "old hash replaced, query kept");
    assert.ok(/^[A-Za-z0-9:\/.?=#&,;_%-]+$/.test(link), "only URL-safe characters");
  });
})();
