/* Randomized practice problems with worked solutions. Pure logic: works in the browser and in Node.
 *
 *   generate(kind, seed, level)  -> a problem (same arguments always give the same problem, so a problem can be shared as a link)
 *   fromParams(kind, params)     -> a problem built from explicit numbers (used by the tests with textbook cases)
 *   check(problem, input)        -> {correct, close, message, expected}
 *
 * Problem: {kind, seed, level, title, module, prompt (HTML), answerType: "number"|"choice"|"text", answer, answerText,
 *           tolerance, unit, choices, steps: [HTML], params}
 */
(function (root, factory) {
  const deps = typeof module === "object" && module.exports
    ? ["scheduling", "paging", "disk", "banker", "memory", "misc"].reduce((a, n) => Object.assign(a, require(`./${n}.js`)), {})
    : root.OSLib;
  const api = factory(deps);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function (L) {
  "use strict";

  // ---------- helpers ----------
  const rint = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  function shuffle(rng, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const sample = (rng, arr, k) => shuffle(rng, arr).slice(0, k);
  const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
  const fmt = (x, d = 2) => round(x, d).toFixed(d);
  const vec = (v) => `(${v.join(", ")})`;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const table = (head, rows) => `<table class="compact"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const KIB = 1024;

  // ---------- 1. CPU scheduling ----------
  const SCHED_NAMES = { FCFS: "First-Come, First-Served (FCFS)", SJF: "non-preemptive Shortest Job First (SJF)", SRTF: "Shortest Remaining Time First (SRTF, preemptive SJF)", RR: "Round Robin" };
  const scheduling = {
    title: "CPU scheduling", module: 6,
    random(rng, level) {
      const algo = pick(rng, level === 1 ? ["FCFS", "SJF"] : ["FCFS", "SJF", "SRTF", "RR"]);
      const n = level === 1 ? 3 : 4;
      const procs = Array.from({ length: n }, (_, i) => ({ pid: `P${i + 1}`, arrival: level === 1 ? 0 : rint(rng, 0, 5), burst: rint(rng, 1, level === 1 ? 8 : 9) }));
      if (level === 2 && procs.every((p) => p.arrival > 0)) procs[0].arrival = 0;
      return { algo, procs, quantum: rint(rng, 2, 4), metric: pick(rng, ["waiting", "turnaround"]) };
    },
    build({ algo, procs, quantum, metric }) {
      const r = L.simulateScheduling(procs, algo, { quantum });
      const avg = r.avg[metric], label = metric === "waiting" ? "waiting" : "turnaround";
      const rule = algo === "RR" ? `Use a time quantum of <b>${quantum}</b>. A process that arrives at the same moment another's quantum expires joins the queue first.`
        : algo === "SRTF" ? "If a waiting process ties with the running one, the running process keeps the CPU." : "";
      const steps = [
        `<b>Schedule</b> (Gantt chart): ${r.segments.map((s) => `${s.pid || "idle"} ${s.start}–${s.end}`).join(" | ")}`,
        `<b>Per process:</b> turnaround = completion − arrival; waiting = turnaround − burst.` + table(["Process", "Arrival", "Burst", "Completion", "Turnaround", "Waiting"],
          r.stats.map((s) => [s.pid, s.arrival, s.burst, s.completion, s.turnaround, s.waiting])),
        `<b>Average ${label} time</b> = (${r.stats.map((s) => s[metric === "waiting" ? "waiting" : "turnaround"]).join(" + ")}) / ${procs.length} = <b>${fmt(avg)}</b>`
      ];
      return {
        title: `${SCHED_NAMES[algo].split(" (")[0]} scheduling`, answerType: "number", answer: avg, answerText: fmt(avg), tolerance: 0.01, unit: "time units",
        prompt: `<p>Processes arrive and run on one CPU using <b>${SCHED_NAMES[algo]}</b>. ${rule}</p>` + table(["Process", "Arrival time", "CPU burst"], procs.map((p) => [p.pid, p.arrival, p.burst])) +
          `<p>Ties are broken by arrival time, then by process number. What is the <b>average ${label} time</b>? (Round to 2 decimal places.)</p>`,
        steps, hint: metric === "waiting" ? "Waiting time = turnaround − burst." : "Turnaround = completion − arrival."
      };
    }
  };

  // ---------- 2. Page replacement ----------
  const pagerepl = {
    title: "Page replacement", module: 14,
    random(rng, level) {
      const algo = pick(rng, level === 1 ? ["FIFO", "LRU"] : ["FIFO", "LRU", "OPT"]);
      const frames = level === 1 ? 3 : pick(rng, [3, 4]);
      const len = level === 1 ? 10 : 14, range = level === 1 ? 5 : 7;
      let refs;
      do refs = Array.from({ length: len }, () => rint(rng, 0, range - 1)); while (new Set(refs).size <= frames);
      return { algo, frames, refs };
    },
    build({ algo, frames, refs }) {
      const r = L.replacePages(refs, frames, algo);
      const name = { FIFO: "FIFO", LRU: "LRU (least recently used)", OPT: "the optimal (OPT) algorithm" }[algo];
      const rule = { FIFO: "evict the page that has been in memory the longest", LRU: "evict the page that was used least recently", OPT: "evict the page whose next use is farthest in the future (or never)" }[algo];
      const steps = [
        `<b>Rule:</b> on a fault with no free frame, ${rule}.`,
        `<b>Trace</b> (frames after each reference; “—” = empty):` + table(["#", "Page", "Frames", "Result"], r.steps.map((s, i) => [i + 1, s.ref, s.frames.map((f) => (f === null ? "—" : f)).join(" "), s.fault ? `FAULT${s.evicted !== null ? ` (evict ${s.evicted})` : ""}` : "hit"])),
        `<b>Count the faults:</b> ${r.faults} of ${refs.length} references are faults.`
      ];
      return {
        title: `${algo} page replacement`, answerType: "number", answer: r.faults, answerText: String(r.faults), tolerance: 0, unit: "page faults",
        prompt: `<p>A process uses <b>${frames} frames</b>, initially empty, with <b>${name}</b>. The page reference string is:</p><p><code>${refs.join(" ")}</code></p><p>How many <b>page faults</b> occur? (Filling an empty frame counts as a fault.)</p>`,
        steps, hint: "Draw the frames after every reference and mark each fault."
      };
    }
  };

  // ---------- 3. Disk scheduling ----------
  function sstfHasTie(reqs, head) {
    const left = reqs.slice(); let cur = head;
    while (left.length) {
      const d = left.map((r) => Math.abs(r - cur)), m = Math.min(...d);
      if (d.filter((x) => x === m).length > 1) return true;
      cur = left.splice(d.indexOf(m), 1)[0];
    }
    return false;
  }
  const DISK_NAMES = { FCFS: "FCFS", SSTF: "SSTF (shortest seek time first)", SCAN: "SCAN (elevator)", CSCAN: "C-SCAN", LOOK: "LOOK", CLOOK: "C-LOOK" };
  const disk = {
    title: "Disk scheduling", module: 15,
    random(rng, level) {
      const algo = pick(rng, level === 1 ? ["FCFS", "SSTF"] : ["FCFS", "SSTF", "SCAN", "CSCAN", "LOOK", "CLOOK"]);
      const n = level === 1 ? 6 : 8;
      for (let tries = 0; tries < 200; tries++) {
        const head = rint(rng, 5, 194), reqs = sample(rng, Array.from({ length: 200 }, (_, i) => i).filter((c) => c !== head), n);
        if (algo === "SSTF" && sstfHasTie(reqs, head)) continue;
        return { algo, head, reqs, dir: pick(rng, ["up", "down"]), max: 199 };
      }
      throw new Error("could not generate a disk problem");
    },
    build({ algo, head, reqs, dir, max }) {
      const r = L.scheduleDisk(reqs, head, algo, { max, dir });
      const sweep = ["SCAN", "CSCAN", "LOOK", "CLOOK"].includes(algo);
      const hops = r.path.slice(1).map((p, i) => ({ from: r.path[i].pos, to: p.pos, d: Math.abs(p.pos - r.path[i].pos), jump: p.jump }));
      const notes = { SCAN: "The head goes to the very end of the disk before reversing.", CSCAN: "After the last request the head goes to the end, then jumps to cylinder 0 (the return trip counts as head movement) and continues.",
        LOOK: "The head reverses at the last request in the current direction (it does not travel to the disk end).", CLOOK: "After the last request in the current direction the head jumps to the lowest pending request (the return trip counts as head movement)." };
      const steps = [
        `<b>Order of service / path:</b> ${r.path.map((p) => p.pos).join(" → ")}`,
        `<b>Head movement per hop:</b> ${hops.map((h) => `|${h.from} − ${h.to}| = ${h.d}${h.jump ? " (return trip)" : ""}`).join(", ")}`,
        `<b>Total</b> = ${hops.map((h) => h.d).join(" + ")} = <b>${r.total}</b> cylinders`
      ];
      return {
        title: `${DISK_NAMES[algo].split(" (")[0]} disk scheduling`, answerType: "number", answer: r.total, answerText: String(r.total), tolerance: 0, unit: "cylinders",
        prompt: `<p>A disk has cylinders 0–${max}. The head is at cylinder <b>${head}</b>${sweep ? `, moving toward ${dir === "up" ? "<b>higher</b>" : "<b>lower</b>"} cylinders` : ""}. The request queue (in arrival order) is:</p><p><code>${reqs.join(", ")}</code></p>` +
          `<p>Using <b>${DISK_NAMES[algo]}</b>${sweep ? `. ${notes[algo]}` : ""} What is the <b>total head movement</b> in cylinders?</p>`,
        steps, hint: "Write down the order the requests are served, then add up the distances between consecutive stops."
      };
    }
  };

  // ---------- 4. Paging address translation ----------
  const paging = {
    title: "Paging", module: 13,
    random(rng, level) {
      const pageSize = pick(rng, [256, 512, 1024]), pages = level === 1 ? 6 : 8;
      const pt = sample(rng, Array.from({ length: 16 }, (_, i) => i), pages);   // page table: page i -> frame pt[i]
      return { pageSize, pt, addr: rint(rng, 0, pages * pageSize - 1) };
    },
    build({ pageSize, pt, addr }) {
      const t = L.translate(addr, pageSize, pt), frame = t.frame;
      const steps = [
        `<b>Split the address:</b> page number = ⌊${addr} / ${pageSize}⌋ = <b>${t.page}</b>; offset = ${addr} mod ${pageSize} = <b>${t.offset}</b>.`,
        `<b>Look up the page table:</b> page ${t.page} → frame <b>${frame}</b>.`,
        `<b>Physical address</b> = frame × page size + offset = ${frame} × ${pageSize} + ${t.offset} = <b>${t.physical}</b>.`
      ];
      return {
        title: "Logical to physical address", answerType: "number", answer: t.physical, answerText: String(t.physical), tolerance: 0, unit: "bytes",
        prompt: `<p>The page size is <b>${pageSize} bytes</b>. The page table maps pages to frames:</p>` + table(["Page", ...pt.map((_, i) => i)], [["Frame", ...pt]]) + `<p>What <b>physical address</b> (in decimal) does logical address <b>${addr}</b> map to?</p>`,
        steps, hint: "Divide the address by the page size: the quotient is the page number and the remainder is the offset."
      };
    }
  };

  // ---------- 5. Effective access time ----------
  const eat = {
    title: "Effective access time", module: 14,
    random(rng, level) {
      const variant = level === 1 ? "fault" : pick(rng, ["fault", "tlb"]);
      if (variant === "fault") return { variant, memNs: pick(rng, [100, 200]), faultMs: pick(rng, [5, 8, 10]), p: pick(rng, [0.001, 0.0005, 0.002, 0.0001]) };
      return { variant, tlbNs: pick(rng, [1, 2, 5]), memNs: pick(rng, [50, 100, 200]), hit: pick(rng, [0.9, 0.95, 0.98, 0.99]) };
    },
    build(prm) {
      if (prm.variant === "fault") {
        const { memNs, faultMs, p } = prm, faultNs = faultMs * 1e6, ans = L.effectiveAccessTime(memNs, faultNs, p);
        return {
          title: "EAT with page faults", answerType: "number", answer: ans, answerText: fmt(ans, 1), tolerance: Math.max(0.15, ans * 0.001), unit: "ns",
          prompt: `<p>A memory access takes <b>${memNs} ns</b>. A page fault takes <b>${faultMs} ms</b> to service. The page-fault rate is <b>${p}</b> (${p * 100}% of accesses). What is the <b>effective access time</b> in nanoseconds? (1 ms = 1,000,000 ns.)</p>`,
          steps: [`<b>Formula:</b> EAT = (1 − p) × memory time + p × fault time.`, `Fault time = ${faultMs} ms = ${faultNs.toLocaleString("en-US")} ns.`,
            `EAT = (1 − ${p}) × ${memNs} + ${p} × ${faultNs.toLocaleString("en-US")} = ${fmt((1 - p) * memNs, 3)} + ${fmt(p * faultNs, 3)} = <b>${fmt(ans, 1)} ns</b>`],
          hint: "Convert the fault time to nanoseconds first."
        };
      }
      const { tlbNs, memNs, hit } = prm, ans = hit * (tlbNs + memNs) + (1 - hit) * (tlbNs + 2 * memNs);
      return {
        title: "EAT with a TLB", answerType: "number", answer: ans, answerText: fmt(ans, 1), tolerance: Math.max(0.15, ans * 0.001), unit: "ns",
        prompt: `<p>A paged system has a TLB lookup time of <b>${tlbNs} ns</b> and a memory access time of <b>${memNs} ns</b>. The TLB hit ratio is <b>${hit * 100}%</b>. On a TLB hit the access needs one memory reference. On a miss it needs two (page table, then data). What is the <b>effective access time</b> in nanoseconds?</p>`,
        steps: [`<b>Hit:</b> TLB + memory = ${tlbNs} + ${memNs} = ${tlbNs + memNs} ns. <b>Miss:</b> TLB + 2 × memory = ${tlbNs} + ${2 * memNs} = ${tlbNs + 2 * memNs} ns.`,
          `EAT = ${hit} × ${tlbNs + memNs} + ${fmt(1 - hit, 2)} × ${tlbNs + 2 * memNs} = ${fmt(hit * (tlbNs + memNs), 3)} + ${fmt((1 - hit) * (tlbNs + 2 * memNs), 3)} = <b>${fmt(ans, 1)} ns</b>`],
        hint: "Weight the hit time and the miss time by their probabilities."
      };
    }
  };

  // ---------- 6. Banker's algorithm ----------
  function bankerState(rng, n, m, wantSafe) {
    for (let tries = 0; tries < 400; tries++) {
      const total = Array.from({ length: m }, () => rint(rng, 6, 10));
      const alloc = Array.from({ length: n }, () => Array(m).fill(0));
      for (let j = 0; j < m; j++) { let left = rint(rng, Math.max(2, total[j] - 3), total[j]); while (left > 0) { alloc[rint(rng, 0, n - 1)][j]++; left--; } }
      const available = total.map((t, j) => t - alloc.reduce((s, r) => s + r[j], 0));
      const max = alloc.map((row) => row.map((a, j) => Math.min(total[j], a + rint(rng, 0, 4))));
      if (max.every((row, i) => row.every((v, j) => v === alloc[i][j]))) continue;
      if (L.isSafe(available, alloc, max).safe === wantSafe) return { available, alloc, max };
    }
    throw new Error("could not generate a Banker's state");
  }
  const bankerTables = (s) => table(["Process", "Allocation (A B C)", "Max (A B C)"], s.alloc.map((row, i) => [`P${i}`, row.join(" "), s.max[i].join(" ")])) + `<p>Available = <b>${vec(s.available)}</b></p>`;
  const banker = {
    title: "Banker's algorithm", module: 11,
    random(rng, level) {
      const n = pick(rng, level === 1 ? [4] : [4, 5]), kind = level === 2 && rng() < 0.5 ? "request" : "safe";
      const state = bankerState(rng, n, 3, rng() < 0.5);
      const prm = { kind, state };
      if (kind === "request") {
        const need = L.needMatrix(state.alloc, state.max), cand = need.map((r, i) => i).filter((i) => need[i].some((v) => v > 0));
        const pid = pick(rng, cand.length ? cand : [0]);
        prm.pid = pid; prm.request = need[pid].map((v, j) => Math.min(v, rint(rng, 0, Math.max(1, Math.min(v, state.available[j] + 1)))));
        if (prm.request.every((v) => v === 0)) prm.request[need[pid].findIndex((v) => v > 0)] = 1;
      }
      return prm;
    },
    build({ kind, state, pid, request }) {
      const safety = L.isSafe(state.available, state.alloc, state.max), need = safety.need;
      const needTable = table(["Process", "Need = Max − Allocation"], need.map((r, i) => [`P${i}`, vec(r)]));
      const trace = safety.steps.map((s) => `P${s.pid} can finish (need ${vec(need[s.pid])} ≤ work ${vec(s.workBefore)}), so work becomes ${vec(s.workAfter)}`);
      if (kind === "safe") {
        return {
          title: "Is the state safe?", answerType: "choice", choices: ["Safe", "Unsafe"], answer: safety.safe ? 0 : 1, answerText: safety.safe ? "Safe" : "Unsafe", tolerance: 0, unit: "",
          prompt: `<p>A system has three resource types (A, B, C) and five or fewer processes. Is the current state <b>safe</b>?</p>` + bankerTables(state),
          steps: [`<b>Compute Need</b> = Max − Allocation:` + needTable, `<b>Search for a safe sequence</b> starting with Work = Available = ${vec(state.available)}:<ol>${trace.map((t) => `<li>${t}</li>`).join("")}</ol>`,
            safety.safe ? `Every process can finish, so the state is <b>safe</b>. Safe sequence: <b>${safety.sequence.map((i) => "P" + i).join(" → ")}</b>.`
              : `After those steps no remaining process has Need ≤ Work, so not everyone can be guaranteed to finish: the state is <b>unsafe</b>.`],
          hint: "Compute Need first, then repeatedly look for a process whose Need fits in the current Work."
        };
      }
      const res = L.requestResources(pid, request, state.available, state.alloc, state.max);
      const reasons = { granted: "Pretend to grant it: the new state is safe, so it can be granted.", denied: res.reason };
      return {
        title: "Can the request be granted?", answerType: "choice", choices: ["Granted", "Denied"], answer: res.granted ? 0 : 1, answerText: res.granted ? "Granted" : "Denied", tolerance: 0, unit: "",
        prompt: `<p>Process <b>P${pid}</b> requests <b>${vec(request)}</b>. Using the Banker's algorithm, should the request be <b>granted</b> or <b>denied</b>?</p>` + bankerTables(state),
        steps: [`<b>Check 1:</b> request ≤ Need? P${pid}'s Need is ${vec(need[pid])}. ${request.every((v, j) => v <= need[pid][j]) ? "Yes." : "No: the request exceeds its declared maximum, so it is an error and is denied."}`,
          `<b>Check 2:</b> request ≤ Available ${vec(state.available)}? ${request.every((v, j) => v <= state.available[j]) ? "Yes." : "No: the process must wait, so the request is denied for now."}`,
          `<b>Check 3:</b> pretend to grant it and test whether the resulting state is safe. ${res.safety ? (res.safety.safe ? `Safe sequence: ${res.safety.sequence.map((i) => "P" + i).join(" → ")}.` : "No safe sequence exists, so the new state is unsafe.") : "(Not needed: an earlier check already decided.)"}`,
          `<b>Decision:</b> ${res.granted ? reasons.granted : `Denied. ${reasons.denied}`}`],
        hint: "Three checks in order: within Need, within Available, and the resulting state must stay safe."
      };
    }
  };

  // ---------- 7. Memory allocation ----------
  const POLICY = { first: "first-fit", best: "best-fit", worst: "worst-fit" };
  const memalloc = {
    title: "Memory allocation", module: 13,
    random(rng, level) {
      const sizes = sample(rng, [100, 150, 200, 250, 300, 350, 400, 500, 600, 700], 5);
      const biggest = Math.max(...sizes);
      // the first request of a two-request problem always fits somewhere, so the question about the last request is meaningful
      const requests = level === 1 ? [rint(rng, 5, 45) * 10] : [Math.min(rint(rng, 5, 30) * 10, biggest), rint(rng, 5, 45) * 10];
      return { holes: sizes, requests, strategy: pick(rng, ["first", "best", "worst"]) };
    },
    build({ holes, requests, strategy }) {
      let blocks = [], pos = 0;
      const ranges = holes.map((s) => { blocks.push({ start: pos, size: s, pid: null }); const r = [pos, pos + s]; pos += s; blocks.push({ start: pos, size: 10, pid: "os" }); pos += 10; return r; });
      const steps = [`<b>Policy:</b> ${POLICY[strategy]} ${{ first: "takes the first hole (lowest address) that is big enough", best: "takes the smallest hole that is big enough", worst: "takes the largest hole" }[strategy]}.`];
      let answer = 0, free = holes.slice();
      requests.forEach((req, i) => {
        const fits = free.map((s, k) => ({ s, k })).filter((x) => x.s >= req);
        const r = L.allocate(blocks, `P${i + 1}`, req, strategy);
        if (!r.ok) { answer = 0; steps.push(`<b>Request ${i + 1} (${req} KB):</b> no hole is big enough (${free.join(", ")}), so it cannot be placed.`); return; }
        blocks = r.blocks;
        const start = blocks.find((b) => b.pid === `P${i + 1}`).start, k = ranges.findIndex(([a, b]) => start >= a && start < b);
        answer = k + 1;
        steps.push(`<b>Request ${i + 1} (${req} KB):</b> holes that fit: ${fits.map((x) => `hole ${x.k + 1} (${x.s} KB)`).join(", ")}. ${POLICY[strategy]} chooses <b>hole ${k + 1}</b>, leaving ${free[k] - req} KB.`);
        free[k] -= req;
      });
      const last = requests[requests.length - 1];
      return {
        title: `${POLICY[strategy][0].toUpperCase() + POLICY[strategy].slice(1)} placement`, answerType: "number", answer: answer, answerText: String(answer), tolerance: 0, unit: "hole number",
        prompt: `<p>Free memory consists of these holes, listed from lowest to highest address:</p>` + table(["Hole", ...holes.map((_, i) => i + 1)], [["Size (KB)", ...holes]]) +
          `<p>Using <b>${POLICY[strategy]}</b>, ${requests.length === 1 ? `a request for <b>${last} KB</b> arrives.` : `requests for <b>${requests.join(" KB</b>, then <b>")} KB</b> arrive in that order (the first one is placed before the second).`} Which <b>hole number</b> receives ${requests.length === 1 ? "it" : "the last request"}? Enter <b>0</b> if it cannot be placed.</p>`,
        steps, hint: "List the holes that are big enough, then apply the policy."
      };
    }
  };

  // ---------- 8. Inode maximum file size ----------
  const inode = {
    title: "File size with inodes", module: 16,
    random(rng, level) {
      return { blockSize: pick(rng, [512, 1024, 2048, 4096, 8192]), ptrSize: level === 1 ? 4 : pick(rng, [4, 8]), direct: pick(rng, [8, 10, 12, 15]), levels: level === 1 ? 1 : pick(rng, [1, 2]) };
    },
    build({ blockSize, ptrSize, direct, levels }) {
      const k = Math.floor(blockSize / ptrSize);
      const bytes = L.maxFileSize({ blockSize, ptrSize, direct, single: 1, double: levels >= 2 ? 1 : 0, triple: 0 });
      const kib = bytes / KIB;
      const blocks = direct + k + (levels >= 2 ? k * k : 0);
      return {
        title: "Maximum file size", answerType: "number", answer: kib, answerText: kib.toLocaleString("en-US"), tolerance: 0, unit: "KiB",
        prompt: `<p>A file system uses <b>${blockSize.toLocaleString("en-US")}-byte</b> blocks and <b>${ptrSize}-byte</b> block pointers. Each inode has <b>${direct} direct</b> pointers, <b>one single-indirect</b> pointer${levels >= 2 ? ", and <b>one double-indirect</b> pointer" : ""}. What is the <b>maximum file size</b> in <b>KiB</b> (1 KiB = 1,024 bytes)?</p>`,
        steps: [`<b>Pointers per block:</b> ${blockSize} / ${ptrSize} = <b>${k}</b>.`,
          `<b>Data blocks reachable:</b> ${direct} (direct) + ${k} (single)${levels >= 2 ? ` + ${k} × ${k} = ${(k * k).toLocaleString("en-US")} (double)` : ""} = <b>${blocks.toLocaleString("en-US")}</b>.`,
          `<b>Size</b> = ${blocks.toLocaleString("en-US")} × ${blockSize} bytes = ${bytes.toLocaleString("en-US")} bytes = <b>${kib.toLocaleString("en-US")} KiB</b>.`],
        hint: "First find how many pointers fit in one block."
      };
    }
  };

  // ---------- 9. Amdahl's law ----------
  const amdahl = {
    title: "Amdahl's law", module: 7,
    random(rng, level) {
      return { variant: level === 2 && rng() < 0.4 ? "limit" : "speedup", p: pick(rng, [0.5, 0.6, 0.75, 0.8, 0.9, 0.95]), n: pick(rng, [2, 4, 8, 16]) };
    },
    build({ variant, p, n }) {
      if (variant === "limit") {
        const ans = L.amdahlLimit(p);
        return { title: "Amdahl speedup limit", answerType: "number", answer: ans, answerText: fmt(ans), tolerance: 0.01, unit: "×",
          prompt: `<p><b>${p * 100}%</b> of a program can be parallelized. What is the <b>maximum possible speedup</b> no matter how many cores are used? (2 decimal places.)</p>`,
          steps: [`With infinitely many cores the parallel part takes no time, leaving only the serial fraction (1 − p) = ${fmt(1 - p)}.`, `Maximum speedup = 1 / (1 − p) = 1 / ${fmt(1 - p)} = <b>${fmt(ans)}×</b>.`], hint: "Only the serial fraction limits the speedup." };
      }
      const ans = L.amdahl(p, n);
      return { title: "Amdahl speedup", answerType: "number", answer: ans, answerText: fmt(ans), tolerance: 0.01, unit: "×",
        prompt: `<p><b>${p * 100}%</b> of a program can be parallelized perfectly. What is the <b>speedup</b> on <b>${n} cores</b>? (2 decimal places.)</p>`,
        steps: [`<b>Formula:</b> speedup = 1 / ((1 − p) + p / N).`, `= 1 / (${fmt(1 - p)} + ${p} / ${n}) = 1 / (${fmt(1 - p)} + ${fmt(p / n, 4)}) = 1 / ${fmt(1 - p + p / n, 4)} = <b>${fmt(ans)}×</b>.`], hint: "The serial part stays the same; only the parallel part is divided by N." };
    }
  };

  // ---------- 10. Unix permissions ----------
  const perms = {
    title: "Unix permissions", module: 2,
    random(rng, level) {
      const octal = () => `${rint(rng, 4, 7)}${pick(rng, [0, 4, 5, 6, 7])}${pick(rng, [0, 4, 5])}`;
      const variant = level === 1 ? "o2s" : pick(rng, ["o2s", "s2o", "umask"]);
      return { variant, mode: octal(), umask: pick(rng, ["022", "027", "077", "002"]), base: pick(rng, ["666", "777"]) };
    },
    build({ variant, mode, umask, base }) {
      const sym = L.bitsToSymbolic(L.octalToBits(mode));
      if (variant === "o2s") return { title: "Octal to symbolic", answerType: "text", answer: sym, answerText: sym, tolerance: 0, unit: "",
        prompt: `<p>A file has mode <b><code>${mode}</code></b>. Write its permissions in symbolic form (nine characters made of r, w, x and -, such as <code>rw-r--r--</code>).</p>`,
        steps: [`Convert each octal digit to bits (r = 4, w = 2, x = 1):`, `${mode.split("").map((d, i) => `${["owner", "group", "others"][i]}: ${d} = ${L.bitsToSymbolic(L.octalToBits("0" + "0" + d).slice(6))}`).join("; ")}`, `Together: <b>${sym}</b>`], hint: "7 = rwx, 6 = rw-, 5 = r-x, 4 = r--, 0 = ---." };
      if (variant === "s2o") return { title: "Symbolic to octal", answerType: "text", answer: mode, answerText: mode, tolerance: 0, unit: "",
        prompt: `<p>A file has permissions <b><code>${sym}</code></b>. What is its octal mode (three digits)?</p>`,
        steps: [`Split into owner, group and others: ${sym.match(/.{3}/g).join(" | ")}`, `Add r = 4, w = 2, x = 1 within each group: ${sym.match(/.{3}/g).map((g) => [...g].reduce((s, c, i) => s + (c === "-" ? 0 : [4, 2, 1][i]), 0)).join(" ")}`, `Octal mode: <b>${mode}</b>`], hint: "Add 4 for r, 2 for w and 1 for x in each of the three groups." };
      const res = L.applyUmask(base, umask), what = base === "666" ? "a new file (default mode 666)" : "a new directory (default mode 777)";
      return { title: "umask", answerType: "text", answer: res, answerText: res, tolerance: 0, unit: "",
        prompt: `<p>A process whose <code>umask</code> is <b><code>${umask}</code></b> creates ${what}. What is the resulting octal mode?</p>`,
        steps: [`The umask <em>removes</em> permission bits: mode = default AND NOT umask.`, `${base} AND NOT ${umask} → digit by digit: ${base.split("").map((d, i) => `default ${d} with umask digit ${umask[i]} cleared → ${res[i]}`).join("; ")}`, `Result: <b>${res}</b> (${L.bitsToSymbolic(L.octalToBits(res))}).`], hint: "Clear in the default mode every bit that is set in the umask." };
    }
  };

  const KINDS = { scheduling, pagerepl, disk, paging, eat, banker, memalloc, inode, amdahl, perms };
  const kindList = Object.entries(KINDS).map(([id, k]) => ({ id, title: k.title, module: k.module }));

  const isKind = (k) => Object.prototype.hasOwnProperty.call(KINDS, k);   // own properties only: "constructor" and "__proto__" are not problem kinds
  const hashKind = (kind) => [...kind].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  function rngFor(kind, seed, level) { return L.mulberry32(((Math.imul(seed + 1, 2654435761) ^ hashKind(kind) ^ Math.imul(level, 40503)) >>> 0)); }

  function finish(kind, params, extra) {
    const built = KINDS[kind].build(params);
    return { kind, module: KINDS[kind].module, topic: KINDS[kind].title, params, ...built, ...extra };
  }
  function generate(kind, seed, level = 1) {
    if (!isKind(kind)) throw new Error(`unknown problem kind "${kind}"`);
    seed = Math.floor(seed) >>> 0; level = level === 2 ? 2 : 1;
    const params = KINDS[kind].random(rngFor(kind, seed, level), level);
    return finish(kind, params, { seed, level, code: `${kind}:${seed}:${level}` });
  }
  const fromParams = (kind, params) => finish(kind, params, { seed: null, level: null, code: null });

  /** Parse "kind:seed:level" (from a link). Returns null for anything invalid. */
  function parseCode(code) {
    const m = /^([a-z]+):(\d{1,10}):([12])$/.exec(String(code || ""));
    if (!m || !isKind(m[1]) || +m[2] > 4294967295) return null;
    return { kind: m[1], seed: +m[2], level: +m[3] };
  }

  const normText = (s) => String(s).trim().toLowerCase().replace(/^[-d](?=[rwx-]{9}$)/, "").replace(/\s+/g, "");
  /** input: a string typed by the student (number/text) or a choice index. */
  function check(problem, input) {
    const shown = `${problem.answerText}${problem.unit ? " " + problem.unit : ""}`;
    if (input === null || input === undefined || String(input).trim() === "") return { correct: false, close: false, empty: true, message: "Enter an answer first.", expected: shown };
    if (problem.answerType === "choice") {
      const ok = +input === problem.answer;
      return { correct: ok, close: false, message: ok ? "Correct." : "Not quite.", expected: problem.choices[problem.answer] };
    }
    if (problem.answerType === "text") {
      const ok = normText(input) === normText(problem.answer);
      return { correct: ok, close: false, message: ok ? "Correct." : "Not quite.", expected: shown };
    }
    const x = Number(String(input).replace(/[,\s_]/g, ""));
    if (!Number.isFinite(x)) return { correct: false, close: false, invalid: true, message: "That is not a number.", expected: shown };
    const diff = Math.abs(x - problem.answer), ok = diff <= problem.tolerance + 1e-9;
    const close = !ok && diff <= Math.max(Math.abs(problem.answer) * 0.05, 0.5, problem.tolerance * 5);
    return { correct: ok, close, message: ok ? "Correct." : close ? "Close, but not quite. Check your arithmetic and rounding." : "Not quite.", expected: shown };
  }

  return { problemKinds: kindList, generateProblem: generate, problemFromParams: fromParams, checkProblemAnswer: check, parseProblemCode: parseCode };
});
