/* Readers-writers scheduling and monitor (condition-variable) semantics. Pure logic, no DOM.
 *   rwSimulate : who gets a read-write lock when, under three policies (reader preference, writer preference, first-come first-served);
 *   monitor*   : a tiny interpreter for consumers and producers sharing a counter protected by a lock and a condition variable,
 *                with the guard written as "if" or as "while" (Mesa semantics: the woken thread must re-check). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ---------- read-write lock ----------
  const rwPolicies = { reader: "Reader preference", writer: "Writer preference", fair: "First come, first served" };

  /**
   * requests: [{id, kind: "R" | "W", arrive, dur}] with integer arrive >= 0 and dur >= 1.
   * Many readers may hold the lock together; a writer needs it alone. At each tick, finished holders release first, then arrivals queue up,
   * then the policy admits whoever it likes:
   *   reader  - readers never wait behind other readers, even if a writer is waiting; a writer starts only when no one else wants or holds the lock;
   *   writer  - no reader starts while any writer is waiting or running;
   *   fair    - strictly in arrival order; consecutive readers at the front start together, and nobody overtakes.
   */
  function rwSimulate(requests, policy) {
    if (!rwPolicies[policy]) throw new Error("unknown policy: " + policy);
    if (!Array.isArray(requests) || requests.some((r) => (r.kind !== "R" && r.kind !== "W") || !Number.isInteger(r.arrive) || r.arrive < 0 || !Number.isInteger(r.dur) || r.dur < 1)) throw new Error("bad requests");
    if (new Set(requests.map((r) => r.id)).size !== requests.length) throw new Error("request ids must be unique");
    const list = requests.map((r) => ({ id: r.id, kind: r.kind, arrive: r.arrive, dur: r.dur, start: null, end: null }));
    let t = 0, activeR = [], activeW = null, queue = [], done = 0;
    const begin = (r) => { r.start = t; r.end = t + r.dur; queue.splice(queue.indexOf(r), 1); if (r.kind === "R") activeR.push(r); else activeW = r; };
    while (done < list.length) {
      activeR = activeR.filter((r) => { if (r.end === t) { done++; return false; } return true; });
      if (activeW && activeW.end === t) { activeW = null; done++; }
      list.filter((r) => r.arrive === t).forEach((r) => queue.push(r));
      if (policy === "reader") {
        if (!activeW) {
          queue.filter((r) => r.kind === "R").forEach(begin);
          if (!activeR.length) { const w = queue.find((r) => r.kind === "W"); if (w) begin(w); }
        }
      } else if (policy === "writer") {
        if (!activeW && !activeR.length) { const w = queue.find((r) => r.kind === "W"); if (w) begin(w); }
        if (!activeW && !queue.some((r) => r.kind === "W")) queue.filter((r) => r.kind === "R").forEach(begin);
      } else {
        while (queue.length) {
          const head = queue[0];
          if (head.kind === "R") { if (activeW) break; begin(head); }
          else { if (activeW || activeR.length) break; begin(head); break; }
        }
      }
      t++;
      if (t > 100000) throw new Error("simulation did not finish");
    }
    const rows = list.map((r) => ({ ...r, wait: r.start - r.arrive }));
    const maxOf = (kind) => rows.filter((r) => r.kind === kind).reduce((m, r) => Math.max(m, r.wait), 0);
    const worst = rows.reduce((b, r) => (b === null || r.wait / r.dur > b.wait / b.dur ? r : b), null);
    return { rows, policy, end: Math.max(...rows.map((r) => r.end)), maxReaderWait: maxOf("R"), maxWriterWait: maxOf("W"), meanWait: rows.reduce((s, r) => s + r.wait, 0) / rows.length, worst };
  }

  /** Ready-made workloads for the simulator. */
  const rwPresets = {
    stream: { label: "A steady stream of readers, one writer", requests: [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `R${i + 1}`, kind: "R", arrive: i * 2, dur: 3 })),
      { id: "W1", kind: "W", arrive: 3, dur: 2 }] },
    writers: { label: "A steady stream of writers, one reader", requests: [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `W${i + 1}`, kind: "W", arrive: i * 2, dur: 3 })),
      { id: "R1", kind: "R", arrive: 3, dur: 2 }] },
    mixed: { label: "A mixed workload", requests: [
      { id: "R1", kind: "R", arrive: 0, dur: 4 }, { id: "R2", kind: "R", arrive: 1, dur: 3 }, { id: "W1", kind: "W", arrive: 2, dur: 2 },
      { id: "R3", kind: "R", arrive: 3, dur: 2 }, { id: "R4", kind: "R", arrive: 5, dur: 3 }, { id: "W2", kind: "W", arrive: 6, dur: 2 }, { id: "R5", kind: "R", arrive: 8, dur: 2 }] }
  };

  // ---------- monitor with a condition variable ----------
  /**
   * Consumers take one item from a shared count; producers add one. The count is protected by a lock, and consumers wait on a condition
   * variable while the count is zero. mode "if" checks the condition once; "while" re-checks it after every wake-up.
   * With Mesa semantics (what real systems implement) a signal only makes the waiter ready: another thread may take the item before the
   * waiter gets the lock back, so only "while" is correct.
   */
  function monitorNew(mode, consumers, producers) {
    if (mode !== "if" && mode !== "while") throw new Error("mode must be 'if' or 'while'");
    if (!Number.isInteger(consumers) || consumers < 1 || !Number.isInteger(producers) || producers < 1) throw new Error("need at least one consumer and one producer");
    const threads = [];
    for (let i = 1; i <= consumers; i++) threads.push({ name: "C" + i, role: "C", pc: "lock", status: "ready", bug: false });
    for (let i = 1; i <= producers; i++) threads.push({ name: "P" + i, role: "P", pc: "lock", status: "ready", bug: false });
    return { mode, count: 0, holder: null, cond: [], threads, errors: [], log: [] };
  }
  const thread = (s, name) => s.threads.find((t) => t.name === name);
  const monitorRunnable = (s, name) => {
    const t = thread(s, name);
    if (!t || t.status !== "ready") return false;
    return t.pc === "lock" || t.pc === "relock" ? s.holder === null : true;
  };
  /** Run one step of the named thread. Returns {ran, text}; ran is false when the thread cannot move (done, waiting, or the lock is taken). */
  function monitorStep(s, name) {
    if (!monitorRunnable(s, name)) return { ran: false, text: `${name} cannot run now.` };
    const t = thread(s, name);
    const say = (text) => { s.log.push(`${name}: ${text}`); return { ran: true, text: `${name}: ${text}` }; };
    switch (t.pc) {
      case "lock": s.holder = name; t.pc = t.role === "C" ? "check" : "put"; return say("acquires the lock.");
      case "relock": s.holder = name; t.pc = s.mode === "while" ? "check" : "take"; return say(s.mode === "while" ? "gets the lock back and re-checks the condition." : "gets the lock back and carries on, assuming the condition still holds.");
      case "check": if (s.count === 0) { t.pc = "wait"; return say("the buffer is empty, so it must wait."); } t.pc = "take"; return say("the buffer has an item.");
      case "wait": s.holder = null; s.cond.push(name); t.status = "waiting"; return say("waits: releases the lock and sleeps on the condition variable.");
      case "take":
        if (s.count === 0) { t.bug = true; s.errors.push(`${name} took an item from an empty buffer`); t.pc = "unlock"; return say("takes an item... but the buffer is EMPTY. Bug: the condition was no longer true.") }
        s.count--; t.pc = "unlock"; return say("takes the item.");
      case "unlock": s.holder = null; t.pc = "done"; t.status = "done"; return say("releases the lock and finishes.");
      case "put": s.count++; t.pc = "signal"; return say("puts an item in the buffer.");
      case "signal": {
        const w = s.cond.shift();
        if (w) { const wt = thread(s, w); wt.status = "ready"; wt.pc = "relock"; t.pc = "unlock2"; return say(`signals: ${w} becomes ready, but the lock is still held by ${name}.`); }
        t.pc = "unlock2"; return say("signals: nobody is waiting.");
      }
      case "unlock2": s.holder = null; t.pc = "done"; t.status = "done"; return say("releases the lock and finishes.");
      default: return { ran: false, text: "finished" };
    }
  }
  /** The interleaving that exposes the "if" bug: C1 waits, P1 produces and signals, C2 slips in and takes the item, then C1 resumes. */
  const monitorScript = ["C1", "C1", "C1", "P1", "P1", "P1", "P1", "C2", "C2", "C2", "C2", "C1", "C1", "C1"];
  /** Run random interleavings until nobody can move. A thread left waiting forever is not an error: there were simply too few producers. */
  function monitorRandom(mode, consumers, producers, rnd) {
    const s = monitorNew(mode, consumers, producers);
    for (let guard = 0; guard < 1000; guard++) {
      const able = s.threads.filter((t) => monitorRunnable(s, t.name));
      if (!able.length) break;
      monitorStep(s, able[Math.floor(rnd() * able.length)].name);
    }
    return s;
  }

  return { rwPolicies, rwSimulate, rwPresets, monitorNew, monitorStep, monitorRunnable, monitorScript, monitorRandom };
});
