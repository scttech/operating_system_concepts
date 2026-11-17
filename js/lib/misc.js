/* Misc formulas: Amdahl, permissions, inode sizes, dining philosophers, fork trees. Pure logic. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ---- Performance ----
  const amdahl = (p, n) => 1 / ((1 - p) + p / n);
  const amdahlLimit = (p) => (p >= 1 ? Infinity : 1 / (1 - p));
  const gustafson = (p, n) => (1 - p) + p * n;
  const switchEfficiency = (quantum, switchCost) => quantum / (quantum + switchCost);

  // ---- Permissions ----
  /** bits: 9-element boolean array (owner rwx, group rwx, other rwx). */
  function bitsToOctal(bits) {
    return [0, 3, 6].map((o) => (bits[o] ? 4 : 0) + (bits[o + 1] ? 2 : 0) + (bits[o + 2] ? 1 : 0)).join("");
  }
  function bitsToSymbolic(bits) {
    return bits.map((b, i) => (b ? "rwx"[i % 3] : "-")).join("");
  }
  function octalToBits(oct) {
    const s = String(oct).padStart(3, "0").slice(-3);
    const bits = [];
    for (const ch of s) { const d = parseInt(ch, 8); bits.push(!!(d & 4), !!(d & 2), !!(d & 1)); }
    return bits;
  }
  /** Mode created by a process with default `base` (e.g., 666 for files, 777 for dirs) and `umask` (octal strings). */
  function applyUmask(base, umask) {
    return (parseInt(base, 8) & ~parseInt(umask, 8) & 0o777).toString(8).padStart(3, "0");
  }
  /** Can `who` ("owner"|"group"|"other") perform op ("r"|"w"|"x") given bits? */
  function allowed(bits, who, op) { return bits[{ owner: 0, group: 3, other: 6 }[who] + "rwx".indexOf(op)]; }

  // ---- File systems ----
  /** Maximum file size in bytes for a classic inode layout. */
  function maxFileSize({ blockSize, ptrSize, direct, single = 1, double = 1, triple = 0 }) {
    const k = Math.floor(blockSize / ptrSize);
    return (direct + single * k + double * k * k + triple * k * k * k) * blockSize;
  }
  /** Disk reads needed to read logical block k (0-based) of a file, ignoring caching. */
  function readsToBlock(method, k, { blockSize = 4096, ptrSize = 4, direct = 12 } = {}) {
    const ppb = Math.floor(blockSize / ptrSize);
    if (method === "contiguous") return 1;
    if (method === "linked") return k + 1;
    if (method === "fat") return 1; // table cached in memory
    if (method === "indexed") {
      if (k < direct) return 1 + 0 + 0; // inode already in memory
      if (k < direct + ppb) return 2;
      if (k < direct + ppb + ppb * ppb) return 3;
      return 4;
    }
    throw new Error("unknown method " + method);
  }

  // ---- Processes ----
  /** Number of processes after n sequential unconditional forks. */
  const forkCount = (n) => 2 ** n;
  /** Build tree for n sequential fork() calls. Each process created at step i continues to remaining forks. */
  function forkTree(n) {
    let id = 0;
    function build(name, step) {
      const node = { name, step, children: [] };
      for (let s = step; s < n; s++) node.children.push(build(`${name}.${node.children.length + 1}`, s + 1));
      return node;
    }
    const root = build("P", 0);
    (function number(node) { node.id = id++; node.children.forEach(number); })(root);
    return root;
  }

  // ---- Dining philosophers ----
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const PHIL_STRATEGIES = {
    naive: "Naive (left fork, then right fork)",
    ordered: "Resource ordering (lower-numbered fork first)",
    limit: "Limit table to N−1 seated (room semaphore)",
    asymmetric: "Asymmetric (odd philosophers go right-first)"
  };
  /** State: {n, strategy, phil:[{s:'thinking'|'hungry'|'hasFirst'|'eating'}], fork:[owner|null], seated, rng}. */
  function newTable(n, strategy, seed = 1) {
    return { n, strategy, seed, rng: mulberry32(seed), phil: Array.from({ length: n }, () => ({ s: "thinking", meals: 0 })),
      fork: Array(n).fill(null), seated: 0, steps: 0 };
  }
  function forkOrder(t, i) {
    const left = i, right = (i + 1) % t.n;
    if (t.strategy === "ordered") return [Math.min(left, right), Math.max(left, right)];
    if (t.strategy === "asymmetric" && i % 2 === 1) return [right, left];
    return [left, right];
  }
  function canAct(t, i) {
    const p = t.phil[i], [f1, f2] = forkOrder(t, i);
    switch (p.s) {
      case "thinking": return t.strategy !== "limit" || t.seated < t.n - 1;
      case "hungry": return t.fork[f1] === null;
      case "hasFirst": return t.fork[f2] === null;
      default: return true;
    }
  }
  function isDeadlocked(t) { for (let i = 0; i < t.n; i++) if (canAct(t, i)) return false; return true; }
  /** Pick a random philosopher among those who can act and let them take one action. Returns log string or null if deadlocked. */
  function stepTable(t) {
    const able = []; for (let i = 0; i < t.n; i++) if (canAct(t, i)) able.push(i);
    if (!able.length) return null;
    const i = able[Math.floor(t.rng() * able.length)], p = t.phil[i], [f1, f2] = forkOrder(t, i);
    t.steps++;
    switch (p.s) {
      case "thinking": p.s = "hungry"; if (t.strategy === "limit") t.seated++; return `Philosopher ${i} gets hungry`;
      case "hungry": t.fork[f1] = i; p.s = "hasFirst"; return `Philosopher ${i} picks up fork ${f1}`;
      case "hasFirst": t.fork[f2] = i; p.s = "eating"; p.meals++; return `Philosopher ${i} picks up fork ${f2} and eats`;
      default:
        t.fork[f1] = null; t.fork[f2] = null; p.s = "thinking";
        if (t.strategy === "limit") t.seated--;
        return `Philosopher ${i} finishes eating and puts down both forks`;
    }
  }

  return { amdahl, amdahlLimit, gustafson, switchEfficiency, bitsToOctal, bitsToSymbolic, octalToBits, applyUmask, allowed,
    maxFileSize, readsToBlock, forkCount, forkTree, mulberry32, PHIL_STRATEGIES, newTable, forkOrder, canAct, isDeadlocked, stepTable };
});
