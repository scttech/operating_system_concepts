/* Module 17: advanced scheduling (multilevel feedback queue, real time, multicore) */
(function () {
  "use strict";
  const { h, panel, select, slider, button, svg, player } = OSUI;
  const L = OSLib;
  const LEVEL = ["var(--c1)", "var(--c2)", "var(--c6)", "var(--c4)"], ON = ["var(--on-c1)", "var(--on-c2)", "var(--on-c6)", "var(--on-c4)"];

  // ---------- multilevel feedback queue ----------
  OSUI.register("mlfq", (el) => {
    const p = panel(el, "Multilevel feedback queue",
      "New jobs start at the <b>top</b> queue (blue). A job that uses its whole time slice drops a level (yellow, then orange); a job that gives up the CPU early (to wait for the keyboard or disk) keeps its level. The highest non-empty queue always runs. A <b>priority boost</b> periodically sends everything back to the top.");
    let preset = "mixed", jobs = L.mlfqPresets[preset].jobs, q = [2, 4, 8], boost = 0, cur = null, clip = null, x = null;
    const presetSel = select({ label: "Workload", options: Object.entries(L.mlfqPresets).map(([value, v]) => ({ value, label: v.label })), value: preset, onChange: (v) => { preset = v; jobs = L.mlfqPresets[v].jobs; update(); } });
    const qs = q.map((v, i) => slider({ label: `Time slice, level ${i + 1}`, min: 1, max: 16, value: v, onInput: (n) => { q[i] = n; if (q.some((a, k) => k && a < q[k - 1])) { /* allow any order, but note it */ } update(); } }));
    const bs = slider({ label: "Priority boost every", min: 0, max: 30, value: boost, format: (v) => (v === 0 ? "never" : `${v} ticks`), onInput: (v) => { boost = v; update(); } });
    p.controls.append(presetSel.el, ...qs.map((s) => s.el), bs.el);
    const metrics = h("div", { class: "metrics", "aria-live": "polite" }), chart = h("div", { class: "chart" }), tbl = h("div", {}), note = h("p", { class: "small" });
    const pl = player({ total: () => (cur ? cur.end : 0), onFrame: (t) => paint(t), label: (i, n) => `time ${i} of ${n}` });
    p.body.append(metrics, pl.el, chart, note, tbl);
    const W = 720, rowH = 26, m = { l: 62, r: 12, t: 28 };
    function update() {
      const r = cur = L.mlfqSimulate(jobs, { quanta: q.slice(), boost });
      const worst = r.jobs.reduce((a, j) => (j.longestWait > a.longestWait ? j : a), r.jobs[0]);
      metrics.replaceChildren(...[[(r.jobs.reduce((a, j) => a + j.response, 0) / r.jobs.length).toFixed(1), "mean response time"], [(r.jobs.reduce((a, j) => a + j.turnaround, 0) / r.jobs.length).toFixed(1), "mean turnaround"], [`${worst.id}: ${worst.longestWait}`, "longest wait for the CPU in one stretch"], [r.end, "all done at"]]
        .map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      d3.select(chart).selectAll("*").remove();
      const H = m.t + r.jobs.length * rowH + 8, s = svg(chart, W, H, `Timeline of ${r.jobs.map((j) => j.id).join(", ")} under a ${q.length}-level feedback queue`);
      x = d3.scaleLinear().domain([0, r.end]).range([m.l, W - m.r]);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${m.t - 6})`).call(d3.axisTop(x).ticks(Math.min(r.end, 20)));
      const id = "mlfqclip-" + Math.random().toString(36).slice(2, 7);
      clip = s.append("defs").append("clipPath").attr("id", id).append("rect").attr("x", 0).attr("y", 0).attr("height", H).attr("width", x(r.end) + 4);
      const g = s.append("g").attr("clip-path", `url(#${id})`);
      r.jobs.forEach((j, i) => {
        const y = m.t + i * rowH;
        s.append("text").attr("x", 6).attr("y", y + 16).style("font-size", "12px").text(j.id);
        g.append("line").attr("x1", x(j.arrive)).attr("x2", x(j.finish)).attr("y1", y + 12).attr("y2", y + 12).style("stroke", "var(--border)");
        r.timeline.forEach((tk) => { if (tk.id === j.id) g.append("rect").attr("x", x(tk.t)).attr("y", y + 3).attr("width", Math.max(1, x(tk.t + 1) - x(tk.t) - 0.5)).attr("height", 18).style("fill", LEVEL[Math.min(tk.level, 3)]).append("title").text(`${j.id} runs at level ${tk.level + 1} (tick ${tk.t})`); });
      });
      r.boosts.forEach((b) => g.append("line").attr("x1", x(b)).attr("x2", x(b)).attr("y1", m.t - 4).attr("y2", H - 4).style("stroke", "var(--ok)").attr("stroke-dasharray", "4 3").attr("stroke-width", 2).append("title").text(`priority boost at ${b}`));
      note.textContent = `Colour = queue level (${q.map((v, i) => `level ${i + 1}: ${v}-tick slice`).join(", ")}). Dashed green lines are priority boosts.${q.some((a, k) => k && a < q[k - 1]) ? " Note: lower queues normally get longer slices than higher ones." : ""}`;
      tbl.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Job", "Arrives", "CPU needed", "First ran", "Finished", "Response", "Turnaround", "Waited", "Longest stretch"].map((t) => h("th", { text: t })))),
        h("tbody", {}, r.jobs.map((j) => h("tr", {}, [j.id, j.arrive, j.total, j.firstRun, j.finish, j.response, j.turnaround, j.wait, j.longestWait].map((v) => h("td", { text: v })))))));
      pl.reset(); paint(pl.index);
    }
    function paint(t) { if (clip) clip.attr("width", x(Math.min(t, cur.end)) + (t >= cur.end ? 4 : 0)); }
    update();
  });

  // ---------- real time ----------
  OSUI.register("rtsched", (el) => {
    const p = panel(el, "Real-time scheduling: meet every deadline",
      "Each task releases a job every <i>T</i> ticks that needs <i>C</i> ticks of CPU and must finish before the next release. <b>Rate-monotonic</b> gives the shortest period the highest fixed priority; <b>earliest-deadline-first</b> always runs the job whose deadline is nearest. Edit the tasks and see which one survives.");
    let preset = "classic", tasks = L.rtPresets[preset].tasks.map((x) => ({ ...x })), policy = "rm", ctl = [];
    const presetSel = select({ label: "Task set", options: Object.entries(L.rtPresets).map(([value, v]) => ({ value, label: v.label })), value: preset, onChange: (v) => { preset = v; tasks = L.rtPresets[v].tasks.map((x) => ({ ...x })); syncCtl(); update(); } });
    const polSel = select({ label: "Algorithm", options: [{ value: "rm", label: "Rate-monotonic (fixed priorities)" }, { value: "edf", label: "Earliest deadline first" }], value: policy, onChange: (v) => { policy = v; update(); } });
    p.controls.append(presetSel.el, polSel.el);
    const rows = h("div", {});
    for (let i = 0; i < 3; i++) {
      const on = h("input", { type: "checkbox", "aria-label": `Use task ${i + 1}`, checked: i < tasks.length, onchange: () => { if (on.checked && !tasks[i]) tasks[i] = { name: `T${i + 1}`, C: 1, T: 6 }; if (!on.checked) { if (i < tasks.length) tasks.splice(i, 1); } fixNames(); syncCtl(); update(); } });
      const cs = slider({ label: "C (CPU time)", min: 1, max: 12, value: (tasks[i] || { C: 1 }).C, onInput: (v) => { if (tasks[i]) { tasks[i].C = Math.min(v, tasks[i].T); cs.set(tasks[i].C); update(); } } });
      const ts = slider({ label: "T (period = deadline)", min: 2, max: 12, value: (tasks[i] || { T: 6 }).T, onInput: (v) => { if (tasks[i]) { tasks[i].T = v; tasks[i].C = Math.min(tasks[i].C, v); cs.set(tasks[i].C); update(); } } });
      ctl.push({ on, cs, ts });
      rows.append(h("fieldset", { class: "controls", style: "border:1px solid var(--border);border-radius:8px;margin:.3rem 0" }, h("legend", { text: `Task ${i + 1}` }), h("label", {}, h("span", { text: "Include" }), on), cs.el, ts.el));
    }
    function fixNames() { tasks.forEach((x, i) => { x.name = `T${i + 1}`; }); }
    function syncCtl() { ctl.forEach((c, i) => { c.on.checked = i < tasks.length; if (tasks[i]) { c.cs.set(tasks[i].C); c.ts.set(tasks[i].T); } }); }
    p.body.append(rows);
    const verdict = h("p", { "aria-live": "polite" }), info = h("div", {}), chart = h("div", { class: "chart" });
    p.body.append(verdict, info, chart);
    const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)"], ONC = ["var(--on-c1)", "var(--on-c2)", "var(--on-c3)"];
    function update() {
      if (!tasks.length) { verdict.textContent = "Include at least one task."; return; }
      const a = L.rtAnalysis(tasks), r = L.rtSimulate(tasks, policy), shown = Math.min(r.horizon, 60);
      const ok = r.misses.length === 0;
      verdict.replaceChildren(ok ? h("span", { class: "status-ok", text: `No deadline missed in ${r.horizon} ticks (the whole repeating pattern).` }) : h("span", { class: "status-bad", text: `${r.misses.length} deadline${r.misses.length === 1 ? "" : "s"} missed in ${r.horizon} ticks; the first is ${tasks[r.misses[0].task].name}'s job released at ${r.misses[0].release} (due ${r.misses[0].deadline}).` }));
      info.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Check", "Result"].map((t) => h("th", { text: t })))),
        h("tbody", {},
          h("tr", {}, h("td", { text: "CPU utilization U = Σ C/T" }), h("td", { text: a.U.toFixed(3) })),
          h("tr", {}, h("td", { text: `Rate-monotonic guarantee: U ≤ n(2^(1/n) − 1) = ${a.rmBound.toFixed(3)}` }), h("td", { text: a.rmGuaranteedByBound ? "met: schedulable for sure" : "not met: it may still work (the test is sufficient, not necessary)" })),
          h("tr", {}, h("td", { text: "Rate-monotonic, exact (worst response time ≤ T)" }), h("td", { text: a.rmSchedulable ? "schedulable" : "NOT schedulable" })),
          h("tr", {}, h("td", { text: "Response times (RM)" }), h("td", { text: a.response.map((v, i) => `${tasks[i].name}: ${v}${v > tasks[i].T ? " (> " + tasks[i].T + ")" : ""}`).join(", ") })),
          h("tr", {}, h("td", { text: "EDF: schedulable if and only if U ≤ 1" }), h("td", { text: a.edfSchedulable ? "schedulable" : "NOT schedulable" })))));
      d3.select(chart).selectAll("*").remove();
      const W = 720, cw = Math.max(8, Math.min(24, (W - 70) / shown)), rowH = 34, H = 22 + tasks.length * rowH + 16, Wd = 60 + shown * cw + 12;
      const s = svg(chart, Wd, H, `${policy === "rm" ? "Rate-monotonic" : "Earliest-deadline-first"} schedule of ${tasks.map((x) => `${x.name} (C=${x.C}, T=${x.T})`).join(", ")} for ${shown} ticks`);
      for (let t = 0; t < shown; t++) if (t % 5 === 0) s.append("text").attr("x", 60 + t * cw + 1).attr("y", 14).style("font-size", "10px").style("fill", "var(--muted)").text(t);
      tasks.forEach((tk, i) => {
        const y = 20 + i * rowH;
        s.append("text").attr("x", 6).attr("y", y + 20).style("font-size", "12px").text(`${tk.name} (${tk.C}/${tk.T})`);
        s.append("line").attr("x1", 60).attr("x2", 60 + shown * cw).attr("y1", y + 26).attr("y2", y + 26).style("stroke", "var(--border)");
        for (let t = 0; t < shown; t++) {
          if (r.timeline[t] === i) s.append("rect").attr("x", 60 + t * cw).attr("y", y + 4).attr("width", cw - 1).attr("height", 20).style("fill", COLORS[i]).append("title").text(`${tk.name} runs at tick ${t}`);
          if (t % tk.T === 0) s.append("path").attr("d", `M${60 + t * cw},${y + 2} l-4,-5 l8,0 z`).style("fill", "var(--fg)").append("title").text(`${tk.name} released at ${t}`);
        }
        r.misses.filter((ms) => ms.task === i && ms.deadline <= shown).forEach((ms) => s.append("path").attr("d", `M${60 + ms.deadline * cw - 5},${y + 4} l10,16 m0,-16 l-10,16`).style("stroke", "var(--bad)").attr("stroke-width", 3).style("fill", "none").append("title").text(`${tk.name} missed its deadline at ${ms.deadline}`));
      });
      info.append(h("p", { class: "small", text: `Triangles mark releases; a red ✕ marks a missed deadline. ${r.horizon > shown ? `Showing the first ${shown} of ${r.horizon} ticks.` : ""}` }));
    }
    update();
  });

  // ---------- multicore ----------
  OSUI.register("multicore", (el) => {
    const p = panel(el, "Several cores: load balancing and cache affinity",
      "Tasks are waiting in per-core queues. With <b>no balancing</b> a core whose queue empties just sits idle. With <b>work stealing</b> an idle core takes a waiting task from the longest queue, but a migrated task starts with a cold cache and needs extra ticks to warm it up.");
    const WORK = { equal: ["Eight equal tasks", [6, 6, 6, 6, 6, 6, 6, 6]], skew: ["One big task and many small ones", [14, 2, 2, 2, 2, 2, 2, 2, 2, 2]], random: ["Random sizes", null] };
    let wk = "equal", works = WORK.equal[1].slice(), cores = 4, place = "one", policy = "steal", penalty = 1;
    const wkSel = select({ label: "Workload", options: Object.entries(WORK).map(([value, v]) => ({ value, label: v[0] })), value: wk, onChange: (v) => { wk = v; works = v === "random" ? randomWorks() : WORK[v][1].slice(); update(); } });
    const coreSl = slider({ label: "Cores", min: 1, max: 8, value: cores, onInput: (v) => { cores = v; update(); } });
    const placeSel = select({ label: "Where tasks start", options: [{ value: "one", label: "All queued on core 0 (new work starts where its parent ran)" }, { value: "spread", label: "Dealt out evenly" }], value: place, onChange: (v) => { place = v; update(); } });
    const polSel = select({ label: "Balancing", options: [{ value: "static", label: "None: tasks stay where they are" }, { value: "steal", label: "Work stealing by idle cores" }], value: policy, onChange: (v) => { policy = v; update(); } });
    const penSl = slider({ label: "Cost of moving a task", min: 0, max: 6, value: penalty, format: (v) => `${v} extra tick${v === 1 ? "" : "s"}`, onInput: (v) => { penalty = v; update(); } });
    p.controls.append(wkSel.el, coreSl.el, placeSel.el, polSel.el, penSl.el, button("New random workload", () => { wk = "random"; wkSel.set("random"); works = randomWorks(); update(); }, true));
    const metrics = h("div", { class: "metrics", "aria-live": "polite" }), chart = h("div", { class: "chart" }), cmp = h("div", {});
    p.body.append(metrics, chart, h("h4", { text: "All four combinations on this workload" }), cmp);
    function randomWorks() { return Array.from({ length: 6 + Math.floor(Math.random() * 7) }, () => 1 + Math.floor(Math.random() * 12)); }
    function update() {
      const tasks = L.mcTasks(works), r = L.mcSimulate(tasks, cores, { policy, place, penalty });
      metrics.replaceChildren(...[[r.makespan, "ticks until everything is done"], [`${Math.round(r.utilization * 100)}%`, "average core utilization"], [r.migrations, "tasks moved"], [r.lowerBound, "best possible (lower bound)"]].map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      d3.select(chart).selectAll("*").remove();
      const W = 720, rowH = 28, m = { l: 56, r: 12, t: 26 }, H = m.t + cores * rowH + 6, s = svg(chart, W, H, `Cores ${r.timeline.map((row, c) => `core ${c}: busy ${r.busy[c]} of ${r.makespan} ticks`).join("; ")}`);
      const x = d3.scaleLinear().domain([0, r.makespan]).range([m.l, W - m.r]);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${m.t - 6})`).call(d3.axisTop(x).ticks(Math.min(r.makespan, 20)));
      const idx = Object.fromEntries(tasks.map((tk, i) => [tk.id, i]));
      r.timeline.forEach((row, c) => {
        const y = m.t + c * rowH;
        s.append("text").attr("x", 6).attr("y", y + 17).style("font-size", "12px").text(`core ${c}`);
        s.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y + 24).attr("y2", y + 24).style("stroke", "var(--border)");
        let t = 0;
        while (t < row.length) {
          const id = row[t]; let e = t;
          while (e < row.length && row[e] === id) e++;
          if (id !== null) {
            const k = idx[id] % 8;
            s.append("rect").attr("x", x(t)).attr("y", y + 3).attr("width", Math.max(1, x(e) - x(t) - 1)).attr("height", 18).attr("rx", 2).style("fill", `var(--c${k + 1})`).append("title").text(`${id} on core ${c} from ${t} to ${e}`);
            if (x(e) - x(t) > 18) s.append("text").attr("x", x(t) + 3).attr("y", y + 16).style("font-size", "10px").style("fill", `var(--on-c${k + 1})`).text(id);
          }
          t = e;
        }
      });
      const all = [["static", "one"], ["static", "spread"], ["steal", "one"], ["steal", "spread"]].map(([pol, pl2]) => [pol, pl2, L.mcSimulate(tasks, cores, { policy: pol, place: pl2, penalty })]);
      cmp.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Balancing", "Start", "Ticks", "Utilization", "Tasks moved"].map((t) => h("th", { text: t })))),
        h("tbody", {}, all.map(([pol, pl2, a]) => h("tr", { style: pol === policy && pl2 === place ? "font-weight:700" : "" }, h("td", { text: pol === "static" ? "none" : "work stealing" }), h("td", { text: pl2 === "one" ? "all on core 0" : "dealt evenly" }), h("td", { text: a.makespan }), h("td", { text: `${Math.round(a.utilization * 100)}%` }), h("td", { text: a.migrations }))))),
        h("p", { class: "small", text: "Dealing tasks out evenly is free but can be unlucky when sizes differ. Stealing adapts, at the price of cold caches. With a high cost per move, stealing a tiny task is not worth it, but the simulation keeps it simple and steals anyway; real schedulers also weigh the cost." }));
    }
    update();
  });
})();
