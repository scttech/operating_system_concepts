/* Side-by-side comparison of two algorithms on one workload: CPU schedulers (Module 6) and page-replacement policies (Module 14). */
(function () {
  "use strict";
  const { h, panel, select, slider } = OSUI;
  const L = OSLib;
  const color = (i) => `var(--c${(((i % 8) + 8) % 8) + 1})`, onColor = (i) => `var(--on-c${(((i % 8) + 8) % 8) + 1})`;

  const WORK = {
    "Textbook (6, 8 and 3 units)": [["P1", 0, 6, 2], ["P2", 0, 8, 1], ["P3", 0, 3, 3]],
    "Convoy effect (one long job first)": [["P1", 0, 24, 3], ["P2", 1, 3, 1], ["P3", 2, 3, 2]],
    "Staggered arrivals": [["P1", 0, 8, 2], ["P2", 1, 4, 1], ["P3", 2, 9, 4], ["P4", 3, 5, 3]],
    "One long job and several short ones": [["P1", 0, 24, 3], ["P2", 0, 3, 1], ["P3", 0, 3, 2], ["P4", 0, 2, 2]]
  };

  OSUI.register("schedvs", (el) => {
    const p = panel(el, "Compare two schedulers on the same workload",
      "Pick two algorithms. Both run the identical processes, so any difference comes from the algorithm alone. The comparison says which is better at what.");
    let work = Object.keys(WORK)[0], A = "FCFS", B = "RR", quantum = 3;
    const algoOpts = Object.entries(L.schedulingAlgos).map(([value, a]) => ({ value, label: a.label }));
    const wSel = select({ label: "Workload", options: Object.keys(WORK), value: work, onChange: (v) => { work = v; update(); } });
    const aSel = select({ label: "Algorithm A", options: algoOpts, value: A, onChange: (v) => { A = v; update(); } });
    const bSel = select({ label: "Algorithm B", options: algoOpts, value: B, onChange: (v) => { B = v; update(); } });
    const qSl = slider({ label: "Time quantum (Round Robin)", min: 1, max: 12, value: quantum, onInput: (v) => { quantum = v; update(); } });
    p.controls.append(wSel.el, aSel.el, bSel.el, qSl.el);
    const strips = h("div", {}), table = h("div", {}), notes = h("ul", { "aria-live": "polite" });
    p.body.append(strips, h("h4", { text: "Result" }), table, notes);

    function strip(label, r, procs) {
      const idx = (pid) => procs.findIndex((x) => x.pid === pid);
      const bar = h("div", { class: "gantt-strip", role: "img", "aria-label": `${label}: ${r.segments.map((s) => `${s.pid || "idle"} ${s.start} to ${s.end}`).join(", ")}` },
        r.segments.map((s) => h("div", { class: "seg", style: `flex:${s.end - s.start};${s.pid ? `background:${color(idx(s.pid))};color:${onColor(idx(s.pid))}` : "background:var(--code-bg);color:var(--muted)"}`, title: `${s.pid || "idle"}: ${s.start}–${s.end}`, text: s.end - s.start > 1 || r.makespan < 30 ? (s.pid || "idle") : "" })));
      const ticks = h("div", { class: "gantt-ticks small", "aria-hidden": "true" }, r.segments.map((s) => h("span", { style: `flex:${s.end - s.start}`, text: s.start })), h("span", { text: r.makespan }));
      return h("div", { class: "gantt-row" }, h("div", { class: "gantt-label", text: label }), bar, ticks);
    }
    function update() {
      const procs = WORK[work].map(([pid, arrival, burst, priority]) => ({ pid, arrival, burst, priority }));
      qSl.el.style.display = A === "RR" || B === "RR" ? "" : "none";
      const c = L.compareSchedules(procs, A, B, { quantum });
      strips.replaceChildren(strip(`A: ${c.labelA}`, c.a, procs), strip(`B: ${c.labelB}`, c.b, procs));
      const fmt = (r, v) => (r.key === "switches" || r.key === "makespan" ? String(v) : (Math.round(v * 10) / 10).toFixed(1));
      table.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Measure (lower is better)", `A: ${c.labelA}`, `B: ${c.labelB}`, "Better"].map((t) => h("th", { text: t })))),
        h("tbody", {}, c.rows.map((r) => h("tr", {}, h("td", { text: r.label }), h("td", { style: r.better === "a" ? "font-weight:700" : "", text: fmt(r, r.a) }), h("td", { style: r.better === "b" ? "font-weight:700" : "", text: fmt(r, r.b) }),
          h("td", { text: r.better === "tie" ? "equal" : r.better === "a" ? "A" : "B" }))))));
      notes.replaceChildren(...c.summary.map((t) => h("li", { text: t })));
    }
    update();

    // Shareable link (see js/lib/share.js).
    if (L.share) {
      const S = L.share;
      OSUI.shareControls(p, "schedvs", {
        work: { ctl: wSel, apply: (v) => { work = v; } }, a: { ctl: aSel, apply: (v) => { A = v; } }, b: { ctl: bSel, apply: (v) => { B = v; } }, q: { ctl: qSl, apply: (v) => { quantum = v; } }
      }, update);
    }
  });

  const STRINGS = {
    "Classic textbook string": "7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1",
    "Belady's anomaly string": "1 2 3 4 1 2 5 1 2 3 4 5",
    "Strong locality": "1 2 1 2 3 1 2 1 3 2 1 4 5 4 5 4 1 5 4 5",
    "A loop slightly larger than memory": "1 2 3 4 1 2 3 4 1 2 3 4 1 2 3 4"
  };

  OSUI.register("pagevs", (el) => {
    const p = panel(el, "Compare two page-replacement policies on the same references",
      "Both policies see the same reference string and the same number of frames. A <b>red</b> column is a page fault. A column with a <b>heavy outline</b> is one where the two policies disagree: only one of them faulted.");
    let key = "Classic textbook string", frames = 3, A = "FIFO", B = "LRU";
    const opts = Object.entries(L.pageAlgos).map(([value, label]) => ({ value, label }));
    const sSel = select({ label: "Reference string", options: Object.keys(STRINGS), value: key, onChange: (v) => { key = v; update(); } });
    const fSl = slider({ label: "Frames", min: 1, max: 6, value: frames, onInput: (v) => { frames = v; update(); } });
    const aSel = select({ label: "Policy A", options: opts, value: A, onChange: (v) => { A = v; update(); } });
    const bSel = select({ label: "Policy B", options: opts, value: B, onChange: (v) => { B = v; update(); } });
    p.controls.append(sSel.el, fSl.el, aSel.el, bSel.el);
    const grids = h("div", {}), notes = h("ul", { "aria-live": "polite" });
    p.body.append(grids, notes);

    function grid(title, run, other, refs, onlyHere) {
      const cols = refs.map((r, i) => {
        const st = run.steps[i];
        return h("td", { class: `pg ${st.fault ? "fault" : "hit"}${onlyHere.includes(i) ? " differs" : ""}`, title: st.fault ? `reference ${i + 1} (page ${r}) faults` : `reference ${i + 1} (page ${r}) hits` });
      });
      const head = h("tr", {}, h("th", { text: "Reference" }), refs.map((r, i) => h("th", { class: onlyHere.includes(i) ? "differs" : "", text: r })));
      const body = Array.from({ length: frames }, (_, f) => h("tr", {}, h("th", { text: `frame ${f}` }), run.steps.map((st, i) => h("td", { class: `pg ${st.fault ? "fault" : "hit"}${onlyHere.includes(i) ? " differs" : ""}`, text: st.frames[f] === null ? "" : st.frames[f] }))));
      const result = h("tr", {}, h("th", { text: "Result" }), run.steps.map((st) => h("td", { class: "small", text: st.fault ? "F" : "·" })));
      return h("div", { class: "table-scroll" }, h("table", { class: "compact pagegrid", "aria-label": `${title}: ${run.faults} page faults` }, h("caption", { text: `${title}: ${run.faults} faults, ${refs.length - run.faults} hits` }), h("thead", {}, head), h("tbody", {}, body, result)));
    }
    function update() {
      const refs = STRINGS[key].split(" ").map(Number), c = L.comparePaging(refs, frames, A, B);
      grids.replaceChildren(grid(`A: ${c.labelA}`, c.a, c.b, refs, c.onlyA), grid(`B: ${c.labelB}`, c.b, c.a, refs, c.onlyB));
      notes.replaceChildren(...c.summary.map((t) => h("li", { text: t })), ...(A === "FIFO" || B === "FIFO" ? [h("li", { class: "small", text: "Try the Belady's anomaly string with FIFO and 3, then 4 frames." })] : []));
    }
    update();

    // Shareable link (see js/lib/share.js).
    if (L.share) {
      const S = L.share;
      OSUI.shareControls(p, "pagevs", {
        refs: { ctl: sSel, apply: (v) => { key = v; } }, frames: { ctl: fSl, apply: (v) => { frames = v; } }, a: { ctl: aSel, apply: (v) => { A = v; } }, b: { ctl: bSel, apply: (v) => { B = v; } }
      }, update);
    }
  });
})();
