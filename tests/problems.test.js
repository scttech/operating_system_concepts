/* Practice problems: every generated answer is verified by an independent re-computation, plus textbook cases. */
(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/problems.js") : window.OSLib;
  const M = typeof require !== "undefined" ? require("../js/lib/misc.js") : window.OSLib;
  const gen = L.generateProblem, from = L.problemFromParams, check = L.checkProblemAnswer;
  const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 3);
  const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

  // ======== independent implementations (deliberately written differently from js/lib) ========
  function indepSchedule(procs, algo, q) {
    const P = procs.map((p, i) => ({ ...p, i, rem: p.burst, end: 0 }));
    let t = 0, left = P.length, cur = null, slice = 0; const queue = [], queued = new Set();
    const order = (a, b) => a.arrival - b.arrival || a.i - b.i;
    while (left && t < 10000) {
      P.filter((p) => p.arrival <= t && !queued.has(p.i)).sort(order).forEach((p) => { queued.add(p.i); queue.push(p); });
      if (algo === "RR") { if (!cur && queue.length) { cur = queue.shift(); slice = q; } }
      else if (algo === "SRTF") {
        const ready = P.filter((p) => p.arrival <= t && p.rem > 0);
        const best = ready.slice().sort((a, b) => a.rem - b.rem || order(a, b))[0];
        cur = best && cur && cur.rem > 0 && cur.rem === best.rem ? cur : (best || null);   // the running process keeps the CPU on a tie
      } else if (!cur || cur.rem === 0) {
        const ready = P.filter((p) => p.arrival <= t && p.rem > 0);
        cur = ready.sort((a, b) => (algo === "SJF" ? a.burst - b.burst : 0) || order(a, b))[0] || null;
      }
      if (!cur) { t++; continue; }
      cur.rem--; t++;
      if (cur.rem === 0) { cur.end = t; left--; cur = null; }
      else if (algo === "RR" && --slice === 0) {
        P.filter((p) => p.arrival <= t && !queued.has(p.i)).sort(order).forEach((p) => { queued.add(p.i); queue.push(p); });
        queue.push(cur); cur = null;
      }
    }
    const turn = P.map((p) => p.end - p.arrival), wait = P.map((p, i) => turn[i] - p.burst);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    return { waiting: mean(wait), turnaround: mean(turn) };
  }
  function indepFaults(refs, n, algo) {
    let mem = [], faults = 0; const last = {};
    refs.forEach((r, i) => {
      if (mem.includes(r)) { last[r] = i; return; }
      faults++;
      if (mem.length === n) {
        let victim;
        if (algo === "FIFO") victim = mem[0];
        else if (algo === "LRU") victim = mem.reduce((a, b) => (last[b] < last[a] ? b : a));
        else victim = mem.reduce((a, b) => { const na = refs.indexOf(a, i + 1), nb = refs.indexOf(b, i + 1); return (nb === -1 ? Infinity : nb) > (na === -1 ? Infinity : na) ? b : a; });
        mem = mem.filter((m) => m !== victim);
      }
      mem.push(r); last[r] = i;
    });
    return faults;
  }
  function indepDisk(reqs, head, algo, dir, max) {
    if (algo === "FCFS") return [head, ...reqs].slice(1).reduce((s, r, i) => s + Math.abs(r - [head, ...reqs][i]), 0);
    if (algo === "SSTF") { let cur = head, tot = 0; const left = reqs.slice(); while (left.length) { left.sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur)); const nx = left.shift(); tot += Math.abs(nx - cur); cur = nx; } return tot; }
    const mirror = dir === "down", h = mirror ? max - head : head, rq = reqs.map((r) => (mirror ? max - r : r)).sort((a, b) => a - b);
    const above = rq.filter((r) => r >= h), below = rq.filter((r) => r < h), hiA = above[above.length - 1], hiB = below[below.length - 1], loB = below[0];
    if (algo === "SCAN") return (max - h) + (below.length ? max - loB : 0);
    if (algo === "LOOK") return above.length ? (hiA - h) + (below.length ? hiA - loB : 0) : (below.length ? h - loB : 0);
    if (algo === "CSCAN") return (max - h) + (below.length ? max + hiB : 0);
    if (algo === "CLOOK") return above.length ? (hiA - h) + (below.length ? (hiA - loB) + (hiB - loB) : 0) : (below.length ? (h - loB) + (hiB - loB) : 0);
    throw new Error(algo);
  }
  function perms(arr) { return arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])); }
  function indepSafe(avail, alloc, max) {
    const need = max.map((r, i) => r.map((v, j) => v - alloc[i][j]));
    return perms(alloc.map((_, i) => i)).some((order) => {
      let w = avail.slice();
      for (const i of order) { if (need[i].some((v, j) => v > w[j])) return false; w = w.map((v, j) => v + alloc[i][j]); }
      return true;
    });
  }
  function indepGrant(pid, req, avail, alloc, max) {
    if (req.some((v, j) => v > max[pid][j] - alloc[pid][j]) || req.some((v, j) => v > avail[j])) return false;
    return indepSafe(avail.map((v, j) => v - req[j]), alloc.map((r, i) => (i === pid ? r.map((v, j) => v + req[j]) : r)), max);
  }
  function indepHole(holes, requests, strategy) {
    const free = holes.slice(); let chosen = 0;
    requests.forEach((req) => {
      const fits = free.map((s, k) => [s, k]).filter(([s]) => s >= req);
      if (!fits.length) { chosen = 0; return; }
      const [, k] = strategy === "first" ? fits[0] : fits.reduce((a, b) => ((strategy === "best" ? b[0] < a[0] : b[0] > a[0]) ? b : a));
      free[k] -= req; chosen = k + 1;
    });
    return chosen;
  }

  QUnit.module("practice problems: answers verified independently");

  QUnit.test("CPU scheduling: answers match an independent simulator (FCFS, SJF, SRTF, RR)", (assert) => {
    let n = 0, bad = null;
    for (const level of [1, 2]) for (const seed of SEEDS) {
      const p = gen("scheduling", seed, level), { algo, procs, quantum, metric } = p.params;
      const want = indepSchedule(procs, algo, quantum)[metric];
      if (!near(p.answer, want, 1e-9)) { bad = bad || `${p.code} ${algo}: lib ${p.answer} vs independent ${want}`; }
      n++;
    }
    assert.strictEqual(bad, null, bad || `${n} problems agree`);
  });

  QUnit.test("Page replacement: fault counts match independent FIFO / LRU / OPT", (assert) => {
    let bad = null;
    for (const level of [1, 2]) for (const seed of SEEDS) {
      const p = gen("pagerepl", seed, level), { algo, frames, refs } = p.params;
      if (p.answer !== indepFaults(refs, frames, algo)) bad = bad || `${p.code}: ${p.answer} vs ${indepFaults(refs, frames, algo)}`;
    }
    assert.strictEqual(bad, null, bad || "all agree");
  });

  QUnit.test("Disk scheduling: totals match closed-form / independent calculations for all six algorithms, both directions", (assert) => {
    let bad = null; const seen = new Set();
    for (const level of [1, 2]) for (const seed of SEEDS) {
      const p = gen("disk", seed, level), { algo, head, reqs, dir, max } = p.params;
      seen.add(algo);
      const want = indepDisk(reqs, head, algo, dir, max);
      if (p.answer !== want) bad = bad || `${p.code} ${algo} ${dir}: ${p.answer} vs ${want}`;
      assert.equal(new Set([head, ...reqs]).size, reqs.length + 1, "requests are distinct and differ from the head");
    }
    assert.strictEqual(bad, null, bad || "all agree");
    assert.equal(seen.size, 6, "every algorithm appears");
  });

  QUnit.test("Disk scheduling: SSTF problems never contain ties", (assert) => {
    let sstf = 0;
    for (const seed of SEEDS) for (const level of [1, 2]) {
      const p = gen("disk", seed, level);
      if (p.params.algo !== "SSTF") continue;
      sstf++;
      let cur = p.params.head; const left = p.params.reqs.slice();
      while (left.length) { const d = left.map((r) => Math.abs(r - cur)), m = Math.min(...d); if (d.filter((x) => x === m).length > 1) { assert.ok(false, p.code + " has a tie"); return; } cur = left.splice(d.indexOf(m), 1)[0]; }
    }
    assert.ok(sstf > 10, `${sstf} SSTF problems checked, none ambiguous`);
  });

  QUnit.test("Paging, EAT, inode, Amdahl and permissions match closed-form formulas", (assert) => {
    let bad = null;
    for (const level of [1, 2]) for (const seed of SEEDS) {
      let p = gen("paging", seed, level), q = p.params;
      const want = q.pt[Math.floor(q.addr / q.pageSize)] * q.pageSize + (q.addr % q.pageSize);
      if (p.answer !== want) bad = bad || `paging ${p.code}`;
      p = gen("eat", seed, level); q = p.params;
      const eat = q.variant === "fault" ? (1 - q.p) * q.memNs + q.p * q.faultMs * 1e6 : q.hit * (q.tlbNs + q.memNs) + (1 - q.hit) * (q.tlbNs + 2 * q.memNs);
      if (!near(p.answer, eat, 1e-6)) bad = bad || `eat ${p.code}`;
      p = gen("inode", seed, level); q = p.params;
      const k = q.blockSize / q.ptrSize, blocks = q.direct + k + (q.levels >= 2 ? k * k : 0);
      if (p.answer !== (blocks * q.blockSize) / 1024) bad = bad || `inode ${p.code}`;
      p = gen("amdahl", seed, level); q = p.params;
      const sp = q.variant === "limit" ? 1 / (1 - q.p) : 1 / (1 - q.p + q.p / q.n);
      if (!near(p.answer, sp, 1e-9)) bad = bad || `amdahl ${p.code}`;
      p = gen("perms", seed, level); q = p.params;
      const sym = (m) => [...m].map((d) => [4, 2, 1].map((b, i) => (+d & b ? "rwx"[i] : "-")).join("")).join("");
      const expected = q.variant === "o2s" ? sym(q.mode) : q.variant === "s2o" ? q.mode : ((parseInt(q.base, 8) & ~parseInt(q.umask, 8)) & 0o777).toString(8).padStart(3, "0");
      if (p.answer !== expected) bad = bad || `perms ${p.code}: ${p.answer} vs ${expected}`;
    }
    assert.strictEqual(bad, null, bad || "all agree");
  });

  QUnit.test("Banker's algorithm: safe/unsafe and grant/deny answers match a brute-force search over all orderings", (assert) => {
    let bad = null, safe = 0, unsafe = 0, granted = 0, denied = 0;
    for (const level of [1, 2]) for (const seed of SEEDS) {
      const p = gen("banker", seed, level), { kind, state, pid, request } = p.params;
      if (kind === "safe") {
        const want = indepSafe(state.available, state.alloc, state.max);
        if ((p.answer === 0) !== want) bad = bad || `${p.code}`;
        want ? safe++ : unsafe++;
      } else {
        const want = indepGrant(pid, request, state.available, state.alloc, state.max);
        if ((p.answer === 0) !== want) bad = bad || `${p.code} request`;
        want ? granted++ : denied++;
      }
      assert.ok(state.max.every((r, i) => r.every((v, j) => v >= state.alloc[i][j])), "Max ≥ Allocation");
    }
    assert.strictEqual(bad, null, bad || "all agree");
    assert.ok(safe > 5 && unsafe > 5, `both safe (${safe}) and unsafe (${unsafe}) states appear`);
    assert.ok(granted > 0 && denied > 0, `requests are both granted (${granted}) and denied (${denied})`);
  });

  QUnit.test("Memory allocation: the chosen hole matches an independent first/best/worst-fit", (assert) => {
    let bad = null; const strategies = new Set(), zero = [];
    for (const level of [1, 2]) for (const seed of SEEDS) {
      const p = gen("memalloc", seed, level), { holes, requests, strategy } = p.params;
      strategies.add(strategy);
      if (p.answer !== indepHole(holes, requests, strategy)) bad = bad || `${p.code}`;
      assert.equal(new Set(holes).size, holes.length, "hole sizes are distinct (no ties)");
      if (p.answer === 0) zero.push(p.code);
    }
    assert.strictEqual(bad, null, bad || "all agree");
    assert.equal(strategies.size, 3);
  });

  QUnit.module("practice problems: textbook cases (golden answers)");

  QUnit.test("scheduling", (assert) => {
    const P = (pid, arrival, burst) => ({ pid, arrival, burst });
    const s = (algo, procs, metric = "waiting", quantum = 4) => from("scheduling", { algo, procs, quantum, metric }).answerText;
    const three = [P("P1", 0, 6), P("P2", 0, 8), P("P3", 0, 3)];
    assert.equal(s("FCFS", three), "6.67"); assert.equal(s("SJF", three), "4.00"); assert.equal(s("FCFS", three, "turnaround"), "12.33");
    assert.equal(s("RR", [P("P1", 0, 24), P("P2", 0, 3), P("P3", 0, 3)]), "5.67");
    assert.equal(s("SRTF", [P("P1", 0, 8), P("P2", 1, 4), P("P3", 2, 9), P("P4", 3, 5)]), "6.50");
  });
  QUnit.test("page replacement", (assert) => {
    const refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
    assert.deepEqual(["FIFO", "LRU", "OPT"].map((algo) => from("pagerepl", { algo, frames: 3, refs }).answer), [15, 12, 9]);
    assert.equal(from("pagerepl", { algo: "FIFO", frames: 4, refs: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5] }).answer, 10, "Belady's anomaly string");
  });
  QUnit.test("disk", (assert) => {
    const t = (algo, dir = "up") => from("disk", { algo, head: 53, reqs: [98, 183, 37, 122, 14, 124, 65, 67], dir, max: 199 }).answer;
    assert.deepEqual(["FCFS", "SSTF", "SCAN", "CSCAN", "LOOK", "CLOOK"].map((a) => t(a)), [640, 236, 331, 382, 299, 322]);
    assert.deepEqual([t("SCAN", "down"), t("LOOK", "down")], [236, 208]);
  });
  QUnit.test("paging, EAT, inode, Amdahl and permissions", (assert) => {
    assert.equal(from("paging", { pageSize: 1024, pt: [7, 3, 2, 9, 1], addr: 5000 }).answer, 1928);
    assert.equal(from("eat", { variant: "fault", memNs: 100, faultMs: 8, p: 0.001 }).answerText, "8099.9");
    assert.equal(from("eat", { variant: "tlb", tlbNs: 1, memNs: 100, hit: 0.98 }).answerText, "103.0");
    assert.equal(from("inode", { blockSize: 4096, ptrSize: 4, direct: 12, levels: 1 }).answer, 4144);
    assert.equal(from("inode", { blockSize: 4096, ptrSize: 4, direct: 12, levels: 2 }).answer, 4198448);
    assert.equal(from("inode", { blockSize: 1024, ptrSize: 4, direct: 10, levels: 1 }).answer, 266);
    assert.equal(from("amdahl", { variant: "speedup", p: 0.9, n: 8 }).answerText, "4.71");
    assert.equal(from("amdahl", { variant: "limit", p: 0.5, n: 8 }).answerText, "2.00");
    assert.equal(from("perms", { variant: "o2s", mode: "754" }).answer, "rwxr-xr--");
    assert.equal(from("perms", { variant: "s2o", mode: "640" }).answer, "640");
    assert.equal(from("perms", { variant: "umask", umask: "022", base: "666", mode: "644" }).answer, "644");
    assert.equal(from("perms", { variant: "umask", umask: "027", base: "777", mode: "644" }).answer, "750");
  });
  QUnit.test("Banker's algorithm", (assert) => {
    const alloc = [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]], max = [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]];
    const state = { available: [3, 3, 2], alloc, max };
    assert.equal(from("banker", { kind: "safe", state }).answerText, "Safe");
    assert.equal(from("banker", { kind: "safe", state: { available: [0, 0, 2], alloc: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [3, 3, 2]], max } }).answerText, "Unsafe");
    assert.equal(from("banker", { kind: "request", state, pid: 1, request: [1, 0, 2] }).answerText, "Granted");
    assert.equal(from("banker", { kind: "request", state, pid: 4, request: [3, 3, 0] }).answerText, "Denied");
    assert.ok(/safe sequence: P1 → P3 → P4 → P0 → P2/i.test(from("banker", { kind: "safe", state }).steps.join(" ").replace(/<[^>]+>/g, "")), "worked steps name the textbook sequence");
  });
  QUnit.test("memory allocation", (assert) => {
    const h = (strategy, requests) => from("memalloc", { holes: [100, 500, 200, 300, 600], requests, strategy }).answer;
    assert.deepEqual(["first", "best", "worst"].map((s) => h(s, [212])), [2, 4, 5]);
    assert.deepEqual(["first", "best", "worst"].map((s) => h(s, [212, 417])), [5, 2, 2]);
    assert.equal(h("first", [700]), 0, "no hole is big enough");
  });

  QUnit.module("practice problems: framework");

  QUnit.test("every kind generates at both levels, deterministically, with steps, text and a correct self-check", (assert) => {
    assert.equal(L.problemKinds.length, 10);
    for (const k of L.problemKinds) for (const level of [1, 2]) for (const seed of [0, 1, 42, 99999, 4294967295]) {
      const a = gen(k.id, seed, level), b = gen(k.id, seed, level);
      assert.deepEqual(JSON.stringify(a), JSON.stringify(b), `${k.id}:${seed}:${level} is reproducible`);
      assert.ok(a.prompt.length > 40 && a.steps.length >= 2 && a.hint && a.title && a.module, `${a.code} is complete`);
      assert.true(check(a, a.answerType === "choice" ? String(a.answer) : a.answerText).correct, `${a.code}: the stated answer is accepted`);
      assert.ok(a.steps.join(" ").length > 60);
    }
  });

  QUnit.test("different seeds give different problems (variety)", (assert) => {
    for (const k of L.problemKinds) {
      const prompts = new Set(SEEDS.slice(0, 40).map((s) => gen(k.id, s, 1).prompt));
      assert.ok(prompts.size >= 12, `${k.id}: ${prompts.size} distinct prompts in 40 seeds`);
    }
  });

  QUnit.test("link codes: parse valid codes, reject everything else", (assert) => {
    assert.deepEqual(L.parseProblemCode("scheduling:123:2"), { kind: "scheduling", seed: 123, level: 2 });
    ["", null, undefined, "nope:1:1", "scheduling:1:3", "scheduling:-1:1", "scheduling:99999999999:1", "scheduling:1", "scheduling:1:1:1", "<script>:1:1", "constructor:1:1", "__proto__:1:1"].forEach((c) => assert.strictEqual(L.parseProblemCode(c), null, `rejects ${JSON.stringify(c)}`));
    assert.throws(() => gen("bogus", 1, 1), /unknown problem kind/);
    assert.equal(gen("amdahl", 5, 7).level, 1, "an unknown level falls back to 1");
  });

  QUnit.test("link stability: fixed seeds keep producing the same answers (shared links must not change)", (assert) => {
    const got = L.problemKinds.map((k) => `${k.id}=${gen(k.id, 1, 1).answerText}/${gen(k.id, 7, 2).answerText}`).join(" ");
    assert.equal(got, SNAPSHOT, "if you intentionally changed a generator, update this snapshot (old shared links will change meaning)");
  });

  QUnit.test("answer checking: tolerance, rounding, text normalization, choices and bad input", (assert) => {
    const num = from("scheduling", { algo: "FCFS", procs: [{ pid: "P1", arrival: 0, burst: 6 }, { pid: "P2", arrival: 0, burst: 8 }, { pid: "P3", arrival: 0, burst: 3 }], quantum: 4, metric: "waiting" });
    assert.true(check(num, "6.67").correct); assert.true(check(num, " 6.667 ").correct); assert.true(check(num, "6.66").correct, "within 0.01");
    assert.false(check(num, "6.7").correct); assert.true(check(num, "6.7").close, "a near miss is flagged as close");
    assert.false(check(num, "20").close); assert.true(check(num, "abc").invalid); assert.true(check(num, "").empty); assert.true(check(num, null).empty);
    const exact = from("disk", { algo: "FCFS", head: 53, reqs: [98, 183, 37, 122, 14, 124, 65, 67], dir: "up", max: 199 });
    assert.true(check(exact, "640").correct); assert.true(check(exact, "1,0".replace("1,0", "6,40")).correct, "thousands separators are ignored"); assert.false(check(exact, "641").correct);
    const txt = from("perms", { variant: "o2s", mode: "754" });
    assert.true(check(txt, "rwxr-xr--").correct); assert.true(check(txt, "  RWXR-XR--").correct); assert.true(check(txt, "-rwxr-xr--").correct, "a leading file-type character is accepted"); assert.false(check(txt, "rwxr-xr-x").correct);
    const ch = from("banker", { kind: "safe", state: { available: [3, 3, 2], alloc: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]], max: [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]] } });
    assert.true(check(ch, "0").correct); assert.false(check(ch, "1").correct); assert.equal(check(ch, "1").expected, "Safe");
  });

  QUnit.test("worked steps contain the final answer (so the explanation agrees with the checker)", (assert) => {
    for (const level of [1, 2]) for (const seed of SEEDS.slice(0, 60)) for (const k of L.problemKinds) {
      const p = gen(k.id, seed, level);
      if (p.answerType === "choice") continue;
      const text = p.steps.join(" ").replace(/<[^>]+>/g, "");
      assert.ok(text.includes(p.answerText) || text.includes(String(p.answer)), `${p.code}: steps mention ${p.answerText}`);
    }
  });

  const SNAPSHOT = "scheduling=13.33/10.25 pagerepl=5/8 disk=265/219 paging=2893/5352 eat=5099.9/5099.9 banker=Unsafe/Safe memalloc=5/3 inode=271/138 amdahl=1.33/1.60 perms=rw-------/r--r--r-x";
})();
