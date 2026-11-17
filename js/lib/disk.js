/* Disk-arm scheduling. Pure logic. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const ALGOS = { FCFS: "FCFS", SSTF: "SSTF", SCAN: "SCAN (elevator)", CSCAN: "C-SCAN", LOOK: "LOOK", CLOOK: "C-LOOK" };

  /** Sweep upward assuming direction "up"; returns array of {pos, jump, served}. */
  function sweepUp(reqs, head, max, algo) {
    const above = reqs.filter((r) => r >= head).sort((a, b) => a - b);
    const below = reqs.filter((r) => r < head).sort((a, b) => a - b);
    const path = [{ pos: head, jump: false, served: false }];
    const go = (pos, served = true, jump = false) => path.push({ pos, jump, served });
    above.forEach((r) => go(r));
    if (algo === "SCAN") {
      if (path[path.length - 1].pos !== max) go(max, false);
      below.slice().reverse().forEach((r) => go(r));
    } else if (algo === "CSCAN") {
      if (path[path.length - 1].pos !== max) go(max, false);
      if (below.length) { go(0, false, true); below.forEach((r) => go(r)); }
    } else if (algo === "LOOK") {
      below.slice().reverse().forEach((r) => go(r));
    } else if (algo === "CLOOK") {
      if (below.length) { go(below[0], true, true); below.slice(1).forEach((r) => go(r)); }
    }
    return path;
  }

  /**
   * reqs: cylinder numbers, head: starting cylinder, max: highest cylinder, dir: "up"|"down" (SCAN family).
   * Returns {path:[{pos,jump,served}], total}. Jumps (C-SCAN/C-LOOK return) are counted in total.
   */
  function scheduleDisk(reqs, head, algo, { max = 199, dir = "up" } = {}) {
    let path;
    if (algo === "FCFS") {
      path = [{ pos: head, jump: false, served: false }, ...reqs.map((r) => ({ pos: r, jump: false, served: true }))];
    } else if (algo === "SSTF") {
      const left = reqs.slice(); let cur = head;
      path = [{ pos: head, jump: false, served: false }];
      while (left.length) {
        let bi = 0;
        left.forEach((r, i) => { if (Math.abs(r - cur) < Math.abs(left[bi] - cur)) bi = i; });
        cur = left.splice(bi, 1)[0];
        path.push({ pos: cur, jump: false, served: true });
      }
    } else if (dir === "down") {
      const m = (x) => max - x;
      path = sweepUp(reqs.map(m), m(head), max, algo).map((s) => ({ ...s, pos: m(s.pos) }));
    } else {
      path = sweepUp(reqs, head, max, algo);
    }
    let total = 0;
    for (let i = 1; i < path.length; i++) total += Math.abs(path[i].pos - path[i - 1].pos);
    return { path, total };
  }

  return { diskAlgos: ALGOS, scheduleDisk };
});
