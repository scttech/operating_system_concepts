/* CPU scheduling simulator (integer time, unit ticks). Pure logic: works in browser and Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const ALGOS = {
    FCFS: { label: "FCFS", preemptive: false },
    SJF: { label: "SJF (non-preemptive)", preemptive: false },
    SRTF: { label: "SRTF (preemptive SJF)", preemptive: true },
    PRIORITY: { label: "Priority (non-preemptive)", preemptive: false },
    PRIORITY_P: { label: "Priority (preemptive)", preemptive: true },
    RR: { label: "Round Robin", preemptive: true }
  };

  /**
   * procs: [{pid, arrival, burst, priority}] — lower priority number = higher priority.
   * Returns {segments:[{pid|null,start,end}], stats:[...], avg:{waiting,turnaround,response}, makespan, idle}
   */
  function simulate(procs, algo, opts = {}) {
    const quantum = Math.max(1, Math.floor(opts.quantum || 2));
    const ps = procs.map((p, idx) => ({
      pid: p.pid, idx, arrival: Math.max(0, Math.floor(p.arrival)), burst: Math.max(1, Math.floor(p.burst)),
      priority: p.priority || 0, rem: Math.max(1, Math.floor(p.burst)), first: null, completion: null
    }));
    const n = ps.length;
    const ticks = [];
    let t = 0, done = 0, current = null, slice = 0;
    const rq = [], queued = new Set();

    const enqueueArrivals = () => {
      ps.filter((p) => p.arrival <= t && !queued.has(p.idx))
        .sort((a, b) => a.arrival - b.arrival || a.idx - b.idx)
        .forEach((p) => { queued.add(p.idx); rq.push(p); });
    };
    const primary = {
      FCFS: (p) => p.arrival, SJF: (p) => p.burst, SRTF: (p) => p.rem,
      PRIORITY: (p) => p.priority, PRIORITY_P: (p) => p.priority
    }[algo];
    const pick = (ready) => ready.slice().sort((a, b) =>
      primary(a) - primary(b) || (b === current) - (a === current) || a.arrival - b.arrival || a.idx - b.idx)[0];

    while (done < n && t < 100000) {
      if (algo === "RR") {
        enqueueArrivals();
        if (!current && rq.length) { current = rq.shift(); slice = quantum; }
      } else {
        const ready = ps.filter((p) => p.arrival <= t && p.rem > 0);
        if (ALGOS[algo].preemptive || !current) current = ready.length ? pick(ready) : null;
      }
      if (!current) { ticks.push(null); t++; continue; }
      if (current.first === null) current.first = t;
      current.rem--; ticks.push(current.pid); t++;
      if (algo === "RR") slice--;
      if (current.rem === 0) {
        current.completion = t; done++; current = null;
      } else if (algo === "RR" && slice === 0) {
        enqueueArrivals(); rq.push(current); current = null;
      }
    }

    const segments = [];
    ticks.forEach((pid, i) => {
      const last = segments[segments.length - 1];
      if (last && last.pid === pid) last.end = i + 1;
      else segments.push({ pid, start: i, end: i + 1 });
    });
    const stats = ps.map((p) => {
      const turnaround = p.completion - p.arrival;
      return { pid: p.pid, arrival: p.arrival, burst: p.burst, priority: p.priority, completion: p.completion,
        turnaround, waiting: turnaround - p.burst, response: p.first - p.arrival };
    });
    const mean = (k) => stats.reduce((s, x) => s + x[k], 0) / (stats.length || 1);
    const idle = ticks.filter((x) => x === null).length;
    return {
      segments, stats, makespan: ticks.length, idle,
      avg: { waiting: mean("waiting"), turnaround: mean("turnaround"), response: mean("response") },
      contextSwitches: segments.filter((s, i) => i > 0 && s.pid !== null && segments[i - 1].pid !== null).length
    };
  }

  /**
   * Snapshot of the system at time t (0..makespan), derived from a simulate() result.
   * running: pid on the CPU during [t, t+1) or null; ready: queued pids, longest-waiting first;
   * remaining: {pid: burst left at t}; done / notArrived: lists of pids.
   */
  function stateAt(result, t) {
    const ran = {}, lastEnd = {};
    let running = null;
    result.segments.forEach((s) => {
      if (s.pid === null) return;
      ran[s.pid] = (ran[s.pid] || 0) + Math.max(0, Math.min(s.end, t) - s.start);
      if (s.end <= t) lastEnd[s.pid] = s.end;
      if (s.start <= t && t < s.end) running = s.pid;
    });
    const remaining = {}, done = [], notArrived = [], waiting = [];
    result.stats.forEach((p, idx) => {
      remaining[p.pid] = p.burst - (ran[p.pid] || 0);
      if (p.arrival > t) notArrived.push(p.pid);
      else if (remaining[p.pid] === 0) done.push(p.pid);
      else if (p.pid !== running) waiting.push({ pid: p.pid, since: Math.max(p.arrival, lastEnd[p.pid] || 0), idx });
    });
    waiting.sort((a, b) => a.since - b.since || a.idx - b.idx);
    return { t, running, ready: waiting.map((w) => w.pid), remaining, done, notArrived };
  }

  return { schedulingAlgos: ALGOS, simulateScheduling: simulate, stateAt };
});
