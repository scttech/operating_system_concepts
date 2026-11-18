/* Side-by-side comparison of two algorithms on the same workload: CPU schedulers and page-replacement policies. Pure logic that builds on
 * scheduling.js and paging.js, and adds the "which is better, on what, and by how much" part. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function deps() {
    const g = typeof window !== "undefined" ? window : globalThis;
    if (typeof require === "function" && typeof module === "object") return Object.assign({}, require("./scheduling.js"), require("./paging.js"));
    return g.OSLib || {};   // in a page, whichever of scheduling.js and paging.js the page loads
  }
  const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
  const verdict = (a, b) => (a < b ? "a" : b < a ? "b" : "tie");   // lower is better for every measure here

  /** The same processes under two algorithms. Rows say which is better on each measure; the summary says it in words. */
  function compareSchedules(procs, algoA, algoB, opts) {
    const D = deps(), o = opts || {};
    if (!D.simulateScheduling) throw new Error("compare.js needs scheduling.js");
    const labelOf = (k) => (D.schedulingAlgos[k] ? D.schedulingAlgos[k].label : null);
    if (!labelOf(algoA) || !labelOf(algoB)) throw new Error("unknown algorithm");
    const a = D.simulateScheduling(procs, algoA, { quantum: o.quantum }), b = D.simulateScheduling(procs, algoB, { quantum: o.quantum });
    const defs = [["waiting", "Average waiting time", (r) => r.avg.waiting], ["turnaround", "Average turnaround time", (r) => r.avg.turnaround], ["response", "Average response time", (r) => r.avg.response], ["switches", "Context switches", (r) => r.contextSwitches], ["makespan", "Time until everything is done", (r) => r.makespan]];
    const rows = defs.map(([key, label, get]) => ({ key, label, a: get(a), b: get(b), better: verdict(get(a), get(b)) }));
    const A = labelOf(algoA), B = labelOf(algoB), summary = [];
    if (algoA === algoB) summary.push("Both sides run the same algorithm, so every number is the same.");
    else {
      const wins = { a: rows.filter((r) => r.better === "a" && ["waiting", "turnaround", "response"].includes(r.key)), b: rows.filter((r) => r.better === "b" && ["waiting", "turnaround", "response"].includes(r.key)) };
      rows.filter((r) => r.better !== "tie" && ["waiting", "turnaround", "response"].includes(r.key)).forEach((r) => {
        const win = r.better === "a" ? A : B, lo = Math.min(r.a, r.b), hi = Math.max(r.a, r.b);
        summary.push(`${win} has the lower ${r.label.toLowerCase()} (${f1(lo)} against ${f1(hi)}).`);
      });
      const sw = rows.find((r) => r.key === "switches");
      if (sw.better !== "tie") summary.push(`${sw.better === "a" ? B : A} makes ${Math.abs(sw.a - sw.b)} more context switch${Math.abs(sw.a - sw.b) === 1 ? "" : "es"}.`);
      if (wins.a.length && wins.b.length) summary.push("There is no single winner: each is better at something different.");
      else if (!wins.a.length && !wins.b.length) summary.push("On these measures the two are equal for this workload.");
    }
    return { a, b, labelA: A, labelB: B, rows, summary };
  }

  /** The same reference string and number of frames under two replacement policies. */
  function comparePaging(refs, frames, algoA, algoB) {
    const D = deps();
    if (!D.replacePages) throw new Error("compare.js needs paging.js");
    if (!D.pageAlgos[algoA] || !D.pageAlgos[algoB]) throw new Error("unknown algorithm");
    const a = D.replacePages(refs, frames, algoA), b = D.replacePages(refs, frames, algoB);
    const onlyA = [], onlyB = [];
    a.steps.forEach((s, i) => { if (s.fault && !b.steps[i].fault) onlyA.push(i); else if (!s.fault && b.steps[i].fault) onlyB.push(i); });
    const A = D.pageAlgos[algoA], B = D.pageAlgos[algoB], better = verdict(a.faults, b.faults), summary = [];
    if (algoA === algoB) summary.push("Both sides use the same policy, so they fault in exactly the same places.");
    else {
      if (better === "tie") summary.push(`Both cause ${a.faults} page faults${onlyA.length || onlyB.length ? ", but not on the same references" : ", on the same references"}.`);
      else summary.push(`${better === "a" ? A : B} causes ${Math.abs(a.faults - b.faults)} fewer page fault${Math.abs(a.faults - b.faults) === 1 ? "" : "s"} (${Math.min(a.faults, b.faults)} against ${Math.max(a.faults, b.faults)}).`);
      if (onlyA.length) summary.push(`${A} alone faults at reference${onlyA.length === 1 ? "" : "s"} ${onlyA.map((i) => i + 1).join(", ")}.`);
      if (onlyB.length) summary.push(`${B} alone faults at reference${onlyB.length === 1 ? "" : "s"} ${onlyB.map((i) => i + 1).join(", ")}.`);
    }
    return { a, b, labelA: A, labelB: B, faultsA: a.faults, faultsB: b.faults, better, onlyA, onlyB, summary };
  }

  return { compareSchedules, comparePaging };
});
