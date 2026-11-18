/* Security in depth: the stack-smashing model, password search spaces, SHA-256 (against Node's own implementation) and threat scoring. */
(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/security.js") : window.OSLib;
  const nodeCrypto = typeof require !== "undefined" ? require("node:crypto") : null;
  const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  QUnit.module("security in depth");

  QUnit.test("Stack frame layout: the return address sits above the buffer, and a canary shifts it up", (assert) => {
    const plain = L.stackLayout(false), guarded = L.stackLayout(true);
    assert.deepEqual(plain.segs.map((s) => [s.name, s.start, s.len]), [["buffer", 0, 16], ["saved frame pointer", 16, 4], ["return address", 20, 4]]);
    assert.deepEqual(guarded.segs.map((s) => [s.name, s.start, s.len]), [["buffer", 0, 16], ["canary", 16, 4], ["saved frame pointer", 20, 4], ["return address", 24, 4]]);
    assert.deepEqual([plain.size, guarded.size], [24, 28]);
  });

  QUnit.test("Overflow lengths: fits, spills into the frame pointer, partly overwrites the return address, replaces it", (assert) => {
    const o = (n, x) => L.stackAttack(Object.assign({ inputLen: n }, x)).outcome;
    assert.equal(o(0), "safe"); assert.equal(o(16), "safe", "exactly the buffer size is fine");
    assert.equal(o(17), "corrupted", "one byte too many reaches the frame pointer");
    assert.equal(o(20), "corrupted", "the frame pointer is full but the return address is untouched");
    assert.equal(o(21), "crash", "a partly overwritten return address crashes");
    assert.equal(o(24), "crash", "plain filler in the return address is not valid code");
    assert.equal(o(17, { canary: true }), "canary-abort", "with a canary, even one byte over is caught");
    assert.equal(o(16, { canary: true }), "safe");
    assert.equal(o(28, { canary: true }), "canary-abort");
    const cells = L.stackAttack({ inputLen: 18 }).cells;
    assert.deepEqual([cells.filter((c) => c.state === "written").length, cells.filter((c) => c.state === "empty").length, cells.length], [18, 0, 24]);
    assert.throws(() => L.stackAttack({ inputLen: -1 })); assert.throws(() => L.stackAttack({ inputLen: 65 })); assert.throws(() => L.stackAttack({ target: "magic" }));
  });

  QUnit.test("Defenses against a crafted payload, checked against an independent truth table over every combination", (assert) => {
    let bad = 0, hijacked = 0, count = 0;
    for (const canary of [false, true]) for (const nx of [false, true]) for (const aslr of [false, true]) for (const leak of [false, true]) for (const target of ["shellcode", "reuse"]) {
      const need = canary ? 28 : 24, r = L.stackAttack({ inputLen: need, crafted: true, canary, nx, aslr, leak, target });
      // independent reasoning: the attacker wins only if every defense that is on is beaten
      const beatsCanary = !canary || leak, beatsAslr = !aslr || leak, beatsNx = !nx || target === "reuse";
      const expected = !beatsCanary ? "canary-abort" : !beatsAslr ? "crash" : !beatsNx ? "blocked-nx" : "hijacked";
      if (r.outcome !== expected) bad++;
      if (r.outcome === "hijacked") hijacked++;
      count++;
    }
    assert.equal(bad, 0);
    assert.equal(count, 32);
    assert.equal(L.stackAttack({ inputLen: 24, crafted: true }).outcome, "hijacked", "no defenses: the attacker wins");
    assert.equal(L.stackAttack({ inputLen: 28, crafted: true, canary: true, nx: true, aslr: true }).outcome, "canary-abort", "all three defenses stop it");
    assert.equal(L.stackAttack({ inputLen: 28, crafted: true, canary: true, nx: true, aslr: true, leak: true, target: "reuse" }).outcome, "hijacked", "an information leak defeats the canary and ASLR, and reuse defeats NX");
    assert.equal(L.stackAttack({ inputLen: 28, crafted: true, canary: true, nx: true, aslr: true, leak: true, target: "shellcode" }).outcome, "blocked-nx", "but NX alone still blocks injected code");
    assert.ok(hijacked >= 8);
  });

  QUnit.test("Every outcome has a name and explanatory steps", (assert) => {
    const seen = new Set();
    for (let n = 0; n <= 40; n += 1) for (const canary of [false, true]) {
      const r = L.stackAttack({ inputLen: n, canary, crafted: n >= 24, nx: n % 3 === 0, aslr: n % 5 === 0, leak: n % 7 === 0 });
      seen.add(r.outcome);
      assert.ok(r.steps.length >= 1 && r.steps.every((s) => s.length > 20) && L.stackOutcomes[r.outcome], `${n}: ${r.outcome}`);
    }
    assert.deepEqual([...seen].sort(), Object.keys(L.stackOutcomes).sort(), "every outcome is reachable");
  });

  QUnit.test("Password search spaces, entropy and times", (assert) => {
    assert.equal(L.passwordSpace(4, 10), 10000);
    assert.equal(L.passwordSpace(8, 26), 208827064576);
    assert.ok(Math.abs(L.entropyBits(L.passwordSpace(10, 2)) - 10) < 1e-9);
    assert.equal(L.passwordSpace(1, 94), 94);
    assert.throws(() => L.passwordSpace(0, 10)); assert.throws(() => L.passwordSpace(8, 1)); assert.throws(() => L.passwordSpace(65, 10));
    assert.equal(L.crackSeconds(1000, 10), 50, "on average half the space is searched");
    assert.throws(() => L.crackSeconds(0, 1)); assert.throws(() => L.crackSeconds(10, 0));
    const fast = L.attackers.fast.rate, slow = L.attackers.slow.rate;
    assert.ok(L.crackSeconds(L.passwordSpace(8, 26), fast) < 60, "eight lower-case letters fall in seconds to a fast hash");
    assert.ok(L.crackSeconds(L.passwordSpace(8, 26), slow) / 86400 > 5, "but take days against a slow, salted hash");
    assert.ok(L.crackSeconds(L.passwordSpace(16, 94), fast) > 1e20, "sixteen random characters of all kinds are far out of reach");
    assert.equal(L.passwordSpace(8, 94) / L.passwordSpace(8, 26) > 1000, true);
  });

  QUnit.test("Human-readable durations", (assert) => {
    const t = L.humanTime;
    assert.equal(t(0.2), "less than a second");
    assert.equal(t(1), "1.0 second");
    assert.equal(t(45), "45 seconds");
    assert.equal(t(90), "1.5 minutes");
    assert.equal(t(7200), "2.0 hours");
    assert.equal(t(86400 * 3), "3.0 days");
    assert.equal(t(31557600 * 2.5), "2.5 years");
    assert.equal(t(31557600 * 5000), "5.0 thousand years");
    assert.equal(t(31557600 * 3e6), "3.0 million years");
    assert.equal(t(31557600 * 4e9), "4.0 billion years");
    assert.equal(t(1e30), "longer than the age of the universe");
    assert.throws(() => t(-1));
  });

  const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");

  QUnit.test("SHA-256 matches the published test vectors", (assert) => {
    assert.equal(L.sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.equal(L.sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(L.sha256Hex("password"), "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8");
    assert.equal(L.sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1", "a two-block message");
    assert.equal(L.sha256Hex("a".repeat(1000000)), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0", "one million letters a");
    assert.equal(L.sha256Hex("é"), L.sha256Hex(new Uint8Array([0xc3, 0xa9])), "text is hashed as UTF-8");
  });

  QUnit.test("Text is hashed as UTF-8 for one-, two-, three- and four-byte characters, like Node does", (assert) => {
    if (!nodeCrypto) { assert.ok(true, "Node only"); return; }
    ["a", "é", "€", "😀", "pässwörd €1 🔒"].forEach((t) => assert.equal(L.sha256Hex(t), nodeCrypto.createHash("sha256").update(t, "utf8").digest("hex"), t));
  });

  QUnit.test("SHA-256 agrees with Node's implementation on random inputs, including every padding boundary", (assert) => {
    if (!nodeCrypto) { assert.ok(true, "Node only"); return; }
    const r = rng(17);
    let bad = 0;
    for (let len = 0; len <= 200; len++) { const b = Uint8Array.from({ length: len }, () => Math.floor(r() * 256)); if (hex(L.sha256(b)) !== nodeCrypto.createHash("sha256").update(b).digest("hex")) bad++; }
    assert.equal(bad, 0, "lengths 0 to 200, which cover the 55, 56 and 64 byte boundaries");
  });

  QUnit.test("Salted and stretched hashes: same password, different salts; every round costs one hash", (assert) => {
    assert.equal(L.plainHash("hunter2"), L.plainHash("hunter2"), "unsalted hashes of the same password are identical, so they reveal who shares a password");
    assert.notEqual(L.saltedHash("a1b2", "hunter2"), L.saltedHash("c3d4", "hunter2"), "salts make them differ");
    assert.equal(L.saltedHash("a1b2", "hunter2"), L.sha256Hex("a1b2hunter2"));
    assert.equal(L.stretchedHash("s", "pw", 1), L.saltedHash("s", "pw"), "one round is just the salted hash");
    assert.equal(L.stretchedHash("s", "pw", 2), L.sha256Hex(Uint8Array.from([...L.sha256(new TextEncoder().encode("spw")), ...new TextEncoder().encode("pw")])));
    assert.notEqual(L.stretchedHash("s", "pw", 3), L.stretchedHash("s", "pw", 4));
    assert.throws(() => L.stretchedHash("s", "pw", 0)); assert.throws(() => L.stretchedHash("s", "pw", 2000000));
    if (nodeCrypto) {
      let h = nodeCrypto.createHash("sha256").update("salt" + "pw").digest();
      for (let i = 1; i < 50; i++) h = nodeCrypto.createHash("sha256").update(Buffer.concat([h, Buffer.from("pw")])).digest();
      assert.equal(L.stretchedHash("salt", "pw", 50), h.toString("hex"), "50 rounds match Node's implementation");
    }
  });

  const system = { threats: [{ cat: "S" }, { cat: "T" }, { cat: "R" }, { cat: "I" }] };

  QUnit.test("Threat scoring counts correct, wrong and unanswered", (assert) => {
    const s = L.scoreThreats(system, { 0: "S", 1: "I", 3: "I" });
    assert.deepEqual([s.correct, s.answered, s.total], [2, 3, 4]);
    assert.deepEqual(s.results.map((r) => r.correct), [true, false, false, true]);
    assert.equal(L.scoreThreats(system, {}).answered, 0);
    assert.equal(L.scoreThreats(system, { 0: "Z" }).answered, 0, "an unknown category is not an answer");
    assert.deepEqual(Object.keys(L.stride), ["S", "T", "R", "I", "D", "E"]);
    Object.keys(L.stride).forEach((k) => assert.ok(L.strideAsks[k]));
  });
})();
