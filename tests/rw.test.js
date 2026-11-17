/* Readers-writers policies and Mesa-style monitors: hand-worked cases, then invariants on random workloads. */
(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/rw.js") : window.OSLib;

  QUnit.module("readers-writers and monitors");

  const byId = (r, id) => r.rows.find((x) => x.id === id);
  const startsOf = (r) => Object.fromEntries(r.rows.map((x) => [x.id, x.start]));

  QUnit.test("A single writer among a steady stream of readers: who waits how long", (assert) => {
    const reqs = L.rwPresets.stream.requests;
    const reader = L.rwSimulate(reqs, "reader"), writer = L.rwSimulate(reqs, "writer"), fair = L.rwSimulate(reqs, "fair");
    assert.deepEqual([byId(reader, "W1").start, byId(reader, "W1").wait], [21, 18], "reader preference: the writer waits for the whole stream to end");
    assert.equal(reader.maxReaderWait, 0, "no reader ever waits");
    assert.deepEqual([byId(writer, "W1").start, byId(writer, "W1").wait], [5, 2], "writer preference: the writer goes as soon as the current readers leave");
    assert.deepEqual([byId(fair, "W1").start, byId(fair, "W1").wait], [5, 2], "first come first served: it waits only for those ahead of it");
    assert.equal(byId(fair, "R3").start, 7, "and the later readers wait for it");
  });

  QUnit.test("A stream of writers with one reader: now the reader can starve under writer preference", (assert) => {
    const reqs = L.rwPresets.writers.requests;
    const writer = L.rwSimulate(reqs, "writer"), reader = L.rwSimulate(reqs, "reader"), fair = L.rwSimulate(reqs, "fair");
    assert.ok(byId(writer, "R1").wait >= 20, `writer preference: the reader waits ${byId(writer, "R1").wait} ticks`);
    assert.ok(byId(fair, "R1").wait < byId(writer, "R1").wait, "first come first served bounds the reader's wait");
    assert.ok(byId(reader, "R1").wait < byId(writer, "R1").wait, "reader preference lets it in at the first gap");
    assert.equal(writer.worst.id, "R1", "the reader has the worst wait relative to its own length");
  });

  QUnit.test("Readers share the lock, writers do not", (assert) => {
    const r = L.rwSimulate([{ id: "R1", kind: "R", arrive: 0, dur: 5 }, { id: "R2", kind: "R", arrive: 0, dur: 5 }, { id: "W1", kind: "W", arrive: 0, dur: 2 }], "fair");
    assert.deepEqual(startsOf(r), { R1: 0, R2: 0, W1: 5 }, "two readers together, then the writer");
    const w = L.rwSimulate([{ id: "W1", kind: "W", arrive: 0, dur: 2 }, { id: "W2", kind: "W", arrive: 0, dur: 2 }], "reader");
    assert.deepEqual(startsOf(w), { W1: 0, W2: 2 }, "two writers one after the other");
  });

  QUnit.test("Bad requests are rejected", (assert) => {
    assert.throws(() => L.rwSimulate([{ id: "a", kind: "X", arrive: 0, dur: 1 }], "fair"));
    assert.throws(() => L.rwSimulate([{ id: "a", kind: "R", arrive: 0, dur: 0 }], "fair"));
    assert.throws(() => L.rwSimulate([{ id: "a", kind: "R", arrive: -1, dur: 1 }], "fair"));
    assert.throws(() => L.rwSimulate([{ id: "a", kind: "R", arrive: 0, dur: 1 }, { id: "a", kind: "W", arrive: 0, dur: 1 }], "fair"));
    assert.throws(() => L.rwSimulate([{ id: "a", kind: "R", arrive: 0, dur: 1 }], "lifo"));
  });

  QUnit.test("Random workloads: exclusion, completion, work conservation and each policy's defining rule", (assert) => {
    let seed = 99;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const bad = { exclusion: 0, complete: 0, idle: 0, reader: 0, writer: 0, fair: 0 };
    for (let trial = 0; trial < 400; trial++) {
      const n = 2 + Math.floor(rnd() * 10);
      const reqs = Array.from({ length: n }, (_, i) => ({ id: "q" + i, kind: rnd() < 0.35 ? "W" : "R", arrive: Math.floor(rnd() * 12), dur: 1 + Math.floor(rnd() * 5) }));
      for (const policy of Object.keys(L.rwPolicies)) {
        const r = L.rwSimulate(reqs, policy), rows = r.rows;
        rows.forEach((a) => {
          if (a.start < a.arrive || a.end !== a.start + a.dur) bad.complete++;
          rows.forEach((b) => { if (a.id < b.id && (a.kind === "W" || b.kind === "W") && a.start < b.end && b.start < a.end) bad.exclusion++; });
        });
        for (let t = 0; t < r.end; t++) {
          const waiting = rows.some((a) => a.arrive <= t && t < a.start), active = rows.some((a) => a.start <= t && t < a.end);
          if (waiting && !active) bad.idle++;
        }
        if (policy === "reader") rows.filter((w) => w.kind === "W").forEach((w) => { if (rows.some((x) => x.kind === "R" && x.arrive <= w.start && x.start > w.start)) bad.reader++; });
        if (policy === "writer") rows.filter((x) => x.kind === "R").forEach((x) => { if (rows.some((w) => w.kind === "W" && w.arrive <= x.start && x.start < w.end)) bad.writer++; });
        if (policy === "fair") {
          const order = rows.map((x, i) => ({ x, i })).sort((p, q) => p.x.arrive - q.x.arrive || p.i - q.i).map((p) => p.x);
          for (let i = 1; i < order.length; i++) if (order[i].start < order[i - 1].start) bad.fair++;
        }
      }
    }
    assert.deepEqual(bad, { exclusion: 0, complete: 0, idle: 0, reader: 0, writer: 0, fair: 0 });
  });

  QUnit.test("Monitor with 'if': the woken consumer can find the buffer empty (Mesa semantics)", (assert) => {
    const s = L.monitorNew("if", 2, 1);
    L.monitorScript.forEach((n) => L.monitorStep(s, n));
    assert.deepEqual(s.errors, ["C1 took an item from an empty buffer"]);
    assert.true(s.threads.find((t) => t.name === "C1").bug);
  });

  QUnit.test("Monitor with 'while': the same interleaving is harmless", (assert) => {
    const s = L.monitorNew("while", 2, 1);
    const ran = L.monitorScript.map((n) => L.monitorStep(s, n).ran);
    assert.deepEqual(s.errors, []);
    assert.equal(s.threads.find((t) => t.name === "C1").status, "waiting", "C1 re-checked, found nothing and went back to sleep");
    assert.equal(s.threads.find((t) => t.name === "C2").status, "done");
    assert.true(ran.every(Boolean), "every scripted step was possible; the last one put C1 back to sleep");
  });

  QUnit.test("Monitor: the lock is exclusive and a waiting thread cannot run", (assert) => {
    const s = L.monitorNew("while", 1, 1);
    assert.true(L.monitorStep(s, "C1").ran);
    assert.equal(s.holder, "C1");
    assert.false(L.monitorStep(s, "P1").ran, "P1 must wait for the lock");
    L.monitorStep(s, "C1"); L.monitorStep(s, "C1");
    assert.equal(s.holder, null, "waiting releases the lock");
    assert.false(L.monitorStep(s, "C1").ran, "a waiting thread does not run until it is signaled");
    assert.throws(() => L.monitorNew("maybe", 1, 1));
    assert.throws(() => L.monitorNew("if", 0, 1));
  });

  QUnit.test("Random interleavings: 'while' never takes from an empty buffer; 'if' sometimes does", (assert) => {
    let seed = 2024;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let whileBad = 0, ifBad = 0, conserved = 0;
    for (let i = 0; i < 3000; i++) {
      const w = L.monitorRandom("while", 3, 2, rnd), f = L.monitorRandom("if", 3, 2, rnd);
      if (w.errors.length) whileBad++;
      if (f.errors.length) ifBad++;
      const took = w.threads.filter((t) => t.role === "C" && t.status === "done").length, put = w.threads.filter((t) => t.role === "P" && t.status === "done").length;
      if (took + w.count !== put) conserved++;
    }
    assert.equal(whileBad, 0, "3000 random schedules, no error with a while loop");
    assert.ok(ifBad > 0, `an if guard fails on some schedules (${ifBad} of 3000)`);
    assert.equal(conserved, 0, "items taken + items left = items put");
  });
})();
