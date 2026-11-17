/* Banker's algorithm and deadlock helpers. Pure logic. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const le = (a, b) => a.every((x, i) => x <= b[i]);
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const sub = (a, b) => a.map((x, i) => x - b[i]);

  function needMatrix(alloc, max) { return max.map((row, i) => sub(row, alloc[i])); }

  /** Safety algorithm. Returns {safe, sequence:[index], steps:[{pid, work}]} */
  function isSafe(available, alloc, max) {
    const need = needMatrix(alloc, max);
    let work = available.slice();
    const finish = alloc.map(() => false);
    const sequence = [], steps = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < alloc.length; i++) {
        if (!finish[i] && le(need[i], work)) {
          steps.push({ pid: i, workBefore: work.slice() });
          work = add(work, alloc[i]);
          steps[steps.length - 1].workAfter = work.slice();
          finish[i] = true; sequence.push(i); progress = true;
        }
      }
    }
    return { safe: finish.every(Boolean), sequence, steps, need };
  }

  /** Resource-request algorithm. Returns {granted, reason, safety?} */
  function requestResources(pid, request, available, alloc, max) {
    const need = needMatrix(alloc, max);
    if (!le(request, need[pid])) return { granted: false, reason: "Error: request exceeds the process's declared maximum need." };
    if (!le(request, available)) return { granted: false, reason: "Must wait: not enough resources are currently available." };
    const a2 = sub(available, request);
    const alloc2 = alloc.map((r, i) => (i === pid ? add(r, request) : r.slice()));
    const safety = isSafe(a2, alloc2, max);
    return safety.safe
      ? { granted: true, reason: "Granted: the resulting state is safe.", safety }
      : { granted: false, reason: "Denied: granting this request would leave the system in an unsafe state.", safety };
  }

  /** Deadlock detection for a wait-for graph: edges [[from,to]]. Returns a cycle (array of nodes) or null. */
  function findCycle(nodes, edges) {
    const adj = new Map(nodes.map((n) => [n, []]));
    edges.forEach(([a, b]) => adj.get(a) && adj.get(a).push(b));
    const color = new Map(); const stack = [];
    function dfs(u) {
      color.set(u, 1); stack.push(u);
      for (const v of adj.get(u) || []) {
        if (color.get(v) === 1) return stack.slice(stack.indexOf(v));
        if (!color.get(v)) { const c = dfs(v); if (c) return c; }
      }
      stack.pop(); color.set(u, 2); return null;
    }
    for (const n of nodes) if (!color.get(n)) { const c = dfs(n); if (c) return c; }
    return null;
  }

  return { needMatrix, isSafe, requestResources, findCycle };
});
