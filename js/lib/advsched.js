/* Advanced CPU scheduling: multilevel feedback queues, real-time scheduling (rate-monotonic and earliest-deadline-first), and multicore load
 * balancing. Pure logic, no DOM. Time is counted in whole ticks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ---------- multilevel feedback queue ----------
  /**
   * jobs: [{id, arrive, total, burst, wait}]. A job needs `total` ticks of CPU. After every `burst` ticks it blocks for `wait` ticks (think disk or
   * keyboard); burst null means CPU-bound (never blocks). opts: {quanta: [..] one time slice per level, boost: every N ticks move every job back to the top (0 = never)}.
   * Rules: new jobs enter the top queue; the highest non-empty queue runs, round robin inside a queue; a job that uses its whole quantum drops a level;
   * a job that blocks before its quantum is up keeps its level; a job in a higher queue preempts a lower one at the next tick.
   */
  function mlfqSimulate(jobsIn, opts) {
    const o = opts || {}, quanta = o.quanta || [2, 4, 8], boost = o.boost || 0, nQ = quanta.length;
    if (!quanta.length || quanta.some((q) => !Number.isInteger(q) || q < 1) || !Number.isInteger(boost) || boost < 0) throw new Error("bad options");
    if (new Set(jobsIn.map((j) => j.id)).size !== jobsIn.length) throw new Error("job ids must be unique");
    jobsIn.forEach((j) => {
      if (!Number.isInteger(j.arrive) || j.arrive < 0 || !Number.isInteger(j.total) || j.total < 1) throw new Error("bad job " + j.id);
      if (j.burst != null && (!Number.isInteger(j.burst) || j.burst < 1 || !Number.isInteger(j.wait) || j.wait < 1)) throw new Error("bad burst or wait for " + j.id);
    });
    const jobs = jobsIn.map((j) => ({ id: j.id, arrive: j.arrive, total: j.total, burst: j.burst == null ? Infinity : j.burst, wait: j.wait || 0, remaining: j.total, burstLeft: j.burst == null ? Infinity : j.burst, level: 0, used: 0, state: "new", blockedUntil: null, firstRun: null, finish: null }));
    const queues = Array.from({ length: nQ }, () => []);
    const timeline = [], boosts = [];
    let t = 0, current = null;
    while (jobs.some((j) => j.finish === null)) {
      if (t > 5000) throw new Error("simulation did not finish");
      if (boost > 0 && t > 0 && t % boost === 0) {
        const all = queues.flat();
        queues.forEach((q) => { q.length = 0; });
        if (current) { all.push(current); current.used = 0; current = null; }
        jobs.forEach((j) => { if (j.finish === null) j.level = 0; });
        queues[0].push(...all);
        boosts.push(t);
      }
      jobs.forEach((j) => { if (j.state === "blocked" && j.blockedUntil === t) { j.state = "ready"; j.burstLeft = j.burst; queues[j.level].push(j); } });
      jobs.forEach((j) => { if (j.state === "new" && j.arrive === t) { j.state = "ready"; queues[0].push(j); } });
      if (current && queues.slice(0, current.level).some((q) => q.length)) { current.used = 0; queues[current.level].push(current); current = null; }
      if (!current) {
        const q = queues.find((x) => x.length);
        if (q) { current = q.shift(); current.used = 0; }
      }
      if (!current) { timeline.push({ t, id: null, level: null, waiting: [] }); t++; continue; }
      const j = current;
      timeline.push({ t, id: j.id, level: j.level, waiting: queues.flat().map((w) => ({ id: w.id, level: w.level })) });
      if (j.firstRun === null) j.firstRun = t;
      j.remaining--; j.burstLeft--; j.used++;
      if (j.remaining === 0) { j.finish = t + 1; j.state = "done"; current = null; }
      else if (j.burstLeft === 0) { j.state = "blocked"; j.blockedUntil = t + 1 + j.wait; current = null; }
      else if (j.used === quanta[j.level]) { j.level = Math.min(j.level + 1, nQ - 1); queues[j.level].push(j); current = null; }
      t++;
    }
    return {
      timeline, quanta, boost, boosts, end: t,
      jobs: jobs.map((j) => {
        let run = 0, longest = 0;      // longest unbroken stretch spent ready but not running
        timeline.forEach((x) => { if (x.waiting.some((w) => w.id === j.id)) { run++; if (run > longest) longest = run; } else run = 0; });
        return { id: j.id, arrive: j.arrive, total: j.total, firstRun: j.firstRun, finish: j.finish, response: j.firstRun - j.arrive, turnaround: j.finish - j.arrive, wait: j.finish - j.arrive - j.total, longestWait: longest };
      })
    };
  }
  const mlfqPresets = {
    mixed: { label: "Interactive jobs and a long CPU-bound job", jobs: [
      { id: "long", arrive: 0, total: 20, burst: null }, { id: "typing", arrive: 1, total: 6, burst: 1, wait: 3 }, { id: "editor", arrive: 2, total: 8, burst: 2, wait: 4 }, { id: "compile", arrive: 4, total: 9, burst: null }] },
    starve: { label: "A steady stream of short jobs (the long job can starve)", jobs: [
      { id: "long", arrive: 0, total: 12, burst: null },
      ...Array.from({ length: 12 }, (_, i) => ({ id: `s${i + 1}`, arrive: 3 + i * 2, total: 2, burst: null }))] }
  };

  // ---------- real-time ----------
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const lcm = (a, b) => (a / gcd(a, b)) * b;
  function checkTasks(tasks) {
    if (!Array.isArray(tasks) || !tasks.length || tasks.some((x) => !Number.isInteger(x.C) || !Number.isInteger(x.T) || x.C < 1 || x.T < 1 || x.C > x.T)) throw new Error("each task needs integer 1 <= C <= T");
  }
  /** Utilization, the two classic bounds, and exact response-time analysis for rate-monotonic priorities (shorter period = higher priority). */
  function rtAnalysis(tasks) {
    checkTasks(tasks);
    const n = tasks.length, U = tasks.reduce((s, x) => s + x.C / x.T, 0);
    const order = tasks.map((x, i) => i).sort((a, b) => tasks[a].T - tasks[b].T || a - b);
    const response = new Array(n).fill(null);
    order.forEach((i, rank) => {
      let r = tasks[i].C;
      for (let iter = 0; iter < 10000; iter++) {
        const next = tasks[i].C + order.slice(0, rank).reduce((s, j) => s + Math.ceil(r / tasks[j].T) * tasks[j].C, 0);
        if (next === r || next > tasks[i].T) { r = next; break; }
        r = next;
      }
      response[i] = r;
    });
    const rmBound = n * (Math.pow(2, 1 / n) - 1);
    return { n, U, rmBound, edfBound: 1, rmSchedulable: response.every((r, i) => r <= tasks[i].T), rmGuaranteedByBound: U <= rmBound + 1e-12, edfSchedulable: U <= 1 + 1e-12, response, hyperperiod: tasks.reduce((h, x) => lcm(h, x.T), 1) };
  }
  /**
   * Run the tasks for `horizon` ticks (default one hyperperiod). Every task releases a job at each multiple of its period, with its deadline at the next one.
   * policy "rm": shorter period wins; policy "edf": earlier absolute deadline wins. Preemptive. A late job keeps running; each late job is recorded once.
   */
  function rtSimulate(tasks, policy, horizon) {
    checkTasks(tasks);
    if (policy !== "rm" && policy !== "edf") throw new Error("policy must be 'rm' or 'edf'");
    const H = horizon === undefined ? tasks.reduce((h, x) => lcm(h, x.T), 1) : horizon;
    if (!Number.isInteger(H) || H < 1 || H > 100000) throw new Error("bad horizon");
    const jobs = [], timeline = [], misses = [];
    for (let t = 0; t < H; t++) {
      tasks.forEach((x, i) => { if (t % x.T === 0) jobs.push({ task: i, release: t, deadline: t + x.T, remaining: x.C, missed: false }); });
      const ready = jobs.filter((j) => j.remaining > 0);
      let pick = null;
      ready.forEach((j) => {
        if (pick === null) { pick = j; return; }
        const better = policy === "rm"
          ? (tasks[j.task].T < tasks[pick.task].T || (tasks[j.task].T === tasks[pick.task].T && (j.task < pick.task || (j.task === pick.task && j.release < pick.release))))
          : (j.deadline < pick.deadline || (j.deadline === pick.deadline && (j.task < pick.task || (j.task === pick.task && j.release < pick.release))));
        if (better) pick = j;
      });
      timeline.push(pick ? pick.task : -1);
      if (pick) pick.remaining--;
      jobs.forEach((j) => { if (!j.missed && j.remaining > 0 && j.deadline === t + 1) { j.missed = true; misses.push({ task: j.task, release: j.release, deadline: j.deadline }); } });
    }
    return { timeline, misses, horizon: H, policy, jobs: jobs.map((j) => ({ ...j })) };
  }
  const rtPresets = {
    classic: { label: "U = 0.97: rate-monotonic misses a deadline, EDF does not", tasks: [{ name: "T1", C: 2, T: 5 }, { name: "T2", C: 4, T: 7 }] },
    easy: { label: "U = 0.69: comfortably schedulable by either", tasks: [{ name: "T1", C: 1, T: 4 }, { name: "T2", C: 2, T: 6 }, { name: "T3", C: 1, T: 12 }] },
    full: { label: "U = 1.00: only EDF can use every tick", tasks: [{ name: "T1", C: 1, T: 2 }, { name: "T2", C: 2, T: 4 }] },
    over: { label: "U > 1: no algorithm can succeed", tasks: [{ name: "T1", C: 3, T: 4 }, { name: "T2", C: 2, T: 5 }] }
  };

  // ---------- multicore ----------
  /**
   * tasks: [{id, work}] (ticks of CPU). place "one": every task starts queued on core 0; "spread": dealt round-robin. policy "static": tasks never move;
   * "steal": a core that is idle with an empty queue takes a waiting task from the end of the longest queue, and pays `penalty` extra ticks (its warm cache is lost).
   */
  function mcSimulate(tasks, cores, opts) {
    const o = opts || {}, policy = o.policy || "static", place = o.place || "one", penalty = o.penalty || 0;
    if (!Number.isInteger(cores) || cores < 1 || cores > 16) throw new Error("cores must be 1 to 16");
    if (policy !== "static" && policy !== "steal") throw new Error("policy must be static or steal");
    if (place !== "one" && place !== "spread") throw new Error("place must be one or spread");
    if (!Number.isInteger(penalty) || penalty < 0 || !tasks.length || tasks.some((x) => !Number.isInteger(x.work) || x.work < 1)) throw new Error("bad tasks");
    const queues = Array.from({ length: cores }, () => []), running = new Array(cores).fill(null);
    const items = tasks.map((x, i) => ({ id: x.id, work: x.work, remaining: x.work, home: place === "one" ? 0 : i % cores, core: null, finish: null, moved: false }));
    items.forEach((x) => queues[x.home].push(x));
    const timeline = Array.from({ length: cores }, () => []);
    let t = 0, migrations = 0, left = items.length;
    while (left > 0) {
      if (t > 100000) throw new Error("simulation did not finish");
      for (let c = 0; c < cores; c++) {
        if (running[c]) continue;
        if (queues[c].length) { running[c] = queues[c].shift(); continue; }
        if (policy === "steal") {
          let v = -1;
          queues.forEach((q, k) => { if (k !== c && q.length && (v < 0 || q.length > queues[v].length)) v = k; });
          if (v >= 0) { const x = queues[v].pop(); x.remaining += penalty; x.moved = true; migrations++; running[c] = x; }
        }
      }
      for (let c = 0; c < cores; c++) {
        const x = running[c];
        timeline[c].push(x ? x.id : null);
        if (!x) continue;
        x.remaining--;
        if (x.remaining === 0) { x.finish = t + 1; running[c] = null; left--; }
      }
      t++;
    }
    const busy = timeline.map((row) => row.filter((v) => v !== null).length);
    return { makespan: t, timeline, busy, migrations, utilization: busy.reduce((a, b) => a + b, 0) / (cores * t), finish: Object.fromEntries(items.map((x) => [x.id, x.finish])), lowerBound: Math.max(Math.ceil(tasks.reduce((s, x) => s + x.work, 0) / cores), Math.max(...tasks.map((x) => x.work))) };
  }
  const mcTasks = (works) => works.map((w, i) => ({ id: "t" + (i + 1), work: w }));

  return { mlfqSimulate, mlfqPresets, rtAnalysis, rtSimulate, rtPresets, mcSimulate, mcTasks };
});
