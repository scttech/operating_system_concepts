/* Race-condition and bounded-buffer simulation logic. Pure; works in browser and Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ---------- Race condition: two threads each execute counter++ `iters` times ----------
  function raceProgram(iters, useLock) {
    const ops = [];
    for (let i = 0; i < iters; i++) {
      if (useLock) ops.push("LOCK");
      ops.push("LOAD", "ADD", "STORE");
      if (useLock) ops.push("UNLOCK");
    }
    return ops;
  }
  function newRace(iters, useLock) {
    const ops = raceProgram(iters, useLock);
    return { iters, useLock, counter: 0, holder: null, threads: [0, 1].map(() => ({ ops, pc: 0, reg: null })) };
  }
  const raceDone = (s, t) => s.threads[t].pc >= s.threads[t].ops.length;
  const raceBlocked = (s, t) => !raceDone(s, t) && s.threads[t].ops[s.threads[t].pc] === "LOCK" && s.holder !== null;
  const raceRunnable = (s, t) => !raceDone(s, t) && !raceBlocked(s, t);
  /** Execute one operation of thread t. Returns the op executed, or null if it could not run. */
  function raceStep(s, t) {
    if (!raceRunnable(s, t)) return null;
    const th = s.threads[t], op = th.ops[th.pc];
    if (op === "LOCK") s.holder = t;
    else if (op === "UNLOCK") s.holder = null;
    else if (op === "LOAD") th.reg = s.counter;
    else if (op === "ADD") th.reg += 1;
    else if (op === "STORE") s.counter = th.reg;
    th.pc++;
    return op;
  }
  /** Run to completion with a random scheduler. rng() -> [0,1). Returns final counter. */
  function raceRandomRun(s, rng) {
    for (let guard = 0; guard < 10000; guard++) {
      const able = [0, 1].filter((t) => raceRunnable(s, t));
      if (!able.length) break;
      raceStep(s, able[Math.floor(rng() * able.length)]);
    }
    return s.counter;
  }

  // ---------- Bounded buffer with counting semaphores ----------
  function newBuffer(N) {
    return { N, slots: Array(N).fill(null), empty: N, full: 0, in: 0, out: 0, next: 1, produced: 0, consumed: 0, prodBlocked: 0, consBlocked: 0 };
  }
  /** One time step. pProd/pCons are probabilities the thread tries to act this tick. */
  function bufferTick(b, pProd, pCons, rng) {
    const res = { prod: "idle", cons: "idle", produced: null, consumed: null };
    if (rng() < pProd) {
      if (b.empty > 0) { // wait(empty); lock; insert; unlock; signal(full)
        b.empty--; b.slots[b.in] = b.next; res.produced = b.next++; b.in = (b.in + 1) % b.N; b.full++; b.produced++; res.prod = "produced";
      } else { b.prodBlocked++; res.prod = "blocked"; }
    }
    if (rng() < pCons) {
      if (b.full > 0) { // wait(full); lock; remove; unlock; signal(empty)
        b.full--; res.consumed = b.slots[b.out]; b.slots[b.out] = null; b.out = (b.out + 1) % b.N; b.empty++; b.consumed++; res.cons = "consumed";
      } else { b.consBlocked++; res.cons = "blocked"; }
    }
    return res;
  }

  return { raceProgram, newRace, raceStep, raceRunnable, raceBlocked, raceDone, raceRandomRun, newBuffer, bufferTick };
});
