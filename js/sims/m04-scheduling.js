/* Module 4: CPU scheduling simulator */
(function () {
  "use strict";
  const { h, panel, select, slider, button, svg, player } = OSUI;
  const L = OSLib;

  const PRESETS = {
    "Textbook (FCFS vs SJF)": { procs: [["P1", 0, 6, 2], ["P2", 0, 8, 1], ["P3", 0, 3, 3]], algo: "FCFS", q: 4 },
    "Convoy effect": { procs: [["P1", 0, 24, 3], ["P2", 1, 3, 1], ["P3", 2, 3, 2]], algo: "FCFS", q: 4 },
    "Staggered arrivals (SRTF)": { procs: [["P1", 0, 8, 2], ["P2", 1, 4, 1], ["P3", 2, 9, 4], ["P4", 3, 5, 3]], algo: "SRTF", q: 4 },
    "Round Robin example": { procs: [["P1", 0, 24, 3], ["P2", 0, 3, 1], ["P3", 0, 3, 2]], algo: "RR", q: 4 },
    "Idle gap": { procs: [["P1", 2, 3, 1], ["P2", 9, 2, 1]], algo: "FCFS", q: 2 }
  };
  const color = (i) => `var(--c${(((i % 8) + 8) % 8) + 1})`;
  const onColor = (i) => `var(--on-c${(((i % 8) + 8) % 8) + 1})`;

  OSUI.register("scheduling", (el) => {
    const p = panel(el, "CPU scheduling simulator",
      "Edit arrival time, CPU burst and priority (lower number = higher priority), pick an algorithm, and watch the Gantt chart and metrics update. Times are whole time units.");
    let procs = PRESETS["Textbook (FCFS vs SJF)"].procs.map(([pid, arrival, burst, priority]) => ({ pid, arrival, burst, priority }));
    let algo = "FCFS", quantum = 4;

    const algoSel = select({ label: "Algorithm", options: Object.entries(L.schedulingAlgos).map(([value, a]) => ({ value, label: a.label })), value: algo, onChange: (v) => { algo = v; qSl.el.style.display = v === "RR" ? "" : "none"; update(); } });
    const qSl = slider({ label: "Time quantum", min: 1, max: 12, value: quantum, onInput: (v) => { quantum = v; update(); } });
    qSl.el.style.display = "none";
    const presetSel = select({ label: "Preset", options: Object.keys(PRESETS), value: "Textbook (FCFS vs SJF)", onChange: (k) => {
      const pr = PRESETS[k]; procs = pr.procs.map(([pid, arrival, burst, priority]) => ({ pid, arrival, burst, priority }));
      algo = pr.algo; quantum = pr.q; algoSel.set(algo); qSl.set(quantum); qSl.el.style.display = algo === "RR" ? "" : "none"; buildTable(); update();
    } });
    p.controls.append(presetSel.el, algoSel.el, qSl.el);

    const tableHost = h("div", {});
    const metrics = h("div", { class: "metrics", "aria-live": "polite" });
    const chart = h("div", { class: "chart" });
    const strip = h("div", { class: "cpu-strip", "aria-live": "polite" });
    let last = null;
    const pl = player({ total: () => (last ? last.makespan : 0), onFrame: () => render(), label: (i, n) => `time ${i} / ${n}` });
    const statsHost = h("div", {});
    const compareHost = h("div", {});
    p.body.append(tableHost, h("div", { class: "row" }, button("+ Add process", () => { if (procs.length < 10) { procs.push({ pid: "P" + (procs.length + 1), arrival: 0, burst: 4, priority: 1 }); buildTable(); update(); } }, true)),
      metrics, h("h4", { text: "Watch it run" }), pl.el, strip, chart, statsHost, h("h4", { text: "Compare all algorithms on this workload" }), compareHost);

    function buildTable() {
      tableHost.replaceChildren(h("table", { class: "compact data" },
        h("thead", {}, h("tr", {}, ["Process", "Arrival", "Burst", "Priority", ""].map((t) => (t ? h("th", { text: t }) : h("th", {}, h("span", { class: "sr-only", text: "Remove" })))))),
        h("tbody", {}, procs.map((pr, i) => {
          const num = (key, min) => { const inp = h("input", { type: "number", min, value: pr[key], "aria-label": `${pr.pid} ${key}`, oninput: () => { if (inp.value !== "") { pr[key] = Math.max(min, Math.floor(+inp.value)); update(); } } }); return h("td", {}, inp); };
          return h("tr", {}, h("td", {}, h("span", { style: `color:${color(i)};font-weight:700`, text: "■ " }), pr.pid), num("arrival", 0), num("burst", 1), num("priority", 0),
            h("td", {}, procs.length > 1 ? h("button", { type: "button", class: "btn secondary", "aria-label": `Remove ${pr.pid}`, text: "✕", onclick: () => { procs.splice(i, 1); buildTable(); update(); } }) : null));
        }))));
    }

    function update() {
      const r = L.simulateScheduling(procs, algo, { quantum });
      metrics.replaceChildren(...[["Avg waiting", r.avg.waiting.toFixed(2)], ["Avg turnaround", r.avg.turnaround.toFixed(2)], ["Avg response", r.avg.response.toFixed(2)],
        ["Context switches", r.contextSwitches], ["CPU utilization", `${(100 * (r.makespan - r.idle) / r.makespan).toFixed(0)}%`]]
        .map(([k, v]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      last = r; pl.reset(); render();
      const statsTable = h("table", { class: "compact" },
        h("thead", {}, h("tr", {}, ["Process", "Arrival", "Burst", "Completion", "Turnaround", "Waiting", "Response"].map((t) => h("th", { text: t })))),
        h("tbody", {}, r.stats.map((s) => h("tr", {}, [s.pid, s.arrival, s.burst, s.completion, s.turnaround, s.waiting, s.response].map((v) => h("td", { text: v }))))));
      statsHost.replaceChildren(statsTable, OSUI.exportBar(statsTable, "scheduling results"));
      const all = Object.keys(L.schedulingAlgos).map((a) => ({ a, r: L.simulateScheduling(procs, a, { quantum }) }));
      const best = Math.min(...all.map((x) => x.r.avg.waiting));
      const cmpTable = h("table", { class: "compact" },
        h("thead", {}, h("tr", {}, ["Algorithm", "Avg waiting", "Avg turnaround", "Avg response", "Context switches"].map((t) => h("th", { text: t })))),
        h("tbody", {}, all.map((x) => h("tr", { style: x.a === algo ? "font-weight:700" : "" },
          h("td", { text: L.schedulingAlgos[x.a].label + (x.r.avg.waiting === best ? "  ★" : "") }), h("td", { text: x.r.avg.waiting.toFixed(2) }), h("td", { text: x.r.avg.turnaround.toFixed(2) }), h("td", { text: x.r.avg.response.toFixed(2) }), h("td", { text: x.r.contextSwitches })))));
      compareHost.replaceChildren(cmpTable, OSUI.exportBar(cmpTable, "scheduling comparison"),
        h("p", { class: "small", text: "★ = lowest average waiting time. Round Robin uses the quantum above; priority uses the Priority column." }));
    }

    function render() { drawStrip(L.stateAt(last, pl.index)); drawGantt(last, pl.index); }

    /** CPU box + ready queue + remaining burst at time t. */
    function drawStrip(st) {
      const idx = (pid) => procs.findIndex((q) => q.pid === pid);
      const chip = (pid, cls, text) => h("span", { class: `chip ${cls || ""}`, style: cls ? "" : `background:${color(idx(pid))};color:${onColor(idx(pid))}`, title: `${pid}: ${st.remaining[pid]} time units of CPU still needed`, text: text || `${pid} · ${st.remaining[pid]}` });
      OSUI.fill(strip,
        h("strong", { text: "CPU:" }),
        st.running ? h("span", { class: "cpu-box", style: `background:${color(idx(st.running))};color:${onColor(idx(st.running))}` }, `${st.running} · ${st.remaining[st.running]} left`) : h("span", { class: "cpu-box idle", text: pl.index >= last.makespan ? "finished" : "idle" }),
        h("strong", { text: "Ready queue →" }),
        ...(st.ready.length ? st.ready.map((pid) => chip(pid)) : [h("span", { class: "small", text: "(empty)" })]),
        st.notArrived.length ? h("strong", { text: "Not arrived:" }) : null, ...st.notArrived.map((pid) => chip(pid, "faded")),
        st.done.length ? h("strong", { text: "Done:" }) : null, ...st.done.map((pid) => chip(pid, "done", pid)));
    }

    function drawGantt(r, t) {
      d3.select(chart).selectAll("*").remove();
      const m = { l: 10, r: 10, t: 24, b: 34 }, unit = Math.max(14, Math.min(40, 880 / r.makespan));
      const W = m.l + m.r + unit * r.makespan, H = 100;
      const s = svg(chart, W, H, `Gantt chart. Order: ${r.segments.map((x) => `${x.pid || "idle"} from ${x.start} to ${x.end}`).join(", ")}`);
      const x = d3.scaleLinear().domain([0, r.makespan]).range([m.l, W - m.r]);
      const defs = s.append("defs");
      defs.append("pattern").attr("id", "idle").attr("width", 6).attr("height", 6).attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)")
        .append("rect").attr("width", 3).attr("height", 6).style("fill", "var(--muted)").attr("opacity", 0.5);
      const idx = (pid) => procs.findIndex((q) => q.pid === pid);
      // faint outline of the whole schedule, then the part that has happened by time t
      s.selectAll("rect.ghost").data(r.segments).join("rect").attr("class", "ghost").attr("x", (d) => x(d.start)).attr("y", m.t).attr("width", (d) => x(d.end) - x(d.start)).attr("height", 36)
        .style("fill", "none").style("stroke", "var(--border)").attr("stroke-dasharray", "3 3");
      const shown = r.segments.filter((d) => d.start < t).map((d) => ({ ...d, end: Math.min(d.end, t) }));
      const seg = s.selectAll("g.seg").data(shown).join("g").attr("class", "seg");
      seg.append("rect").attr("x", (d) => x(d.start)).attr("y", m.t).attr("width", (d) => x(d.end) - x(d.start)).attr("height", 36)
        .style("fill", (d) => (d.pid === null ? "url(#idle)" : color(idx(d.pid)))).style("stroke", "var(--bg)").attr("stroke-width", 1.5)
        .append("title").text((d) => `${d.pid || "idle"}: ${d.start}–${d.end}`);
      seg.append("text").attr("x", (d) => (x(d.start) + x(d.end)) / 2).attr("y", m.t + 23).attr("text-anchor", "middle").style("fill", (d) => (d.pid === null ? "var(--fg)" : onColor(idx(d.pid)))).style("font-weight", 700).style("font-size", "12px")
        .text((d) => (d.pid && x(d.end) - x(d.start) > 18 ? d.pid : ""));
      const ticks = [...new Set(r.segments.flatMap((d) => [d.start, d.end]))];
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${m.t + 36})`).call(d3.axisBottom(x).tickValues(ticks).tickSizeOuter(0));
      if (t < r.makespan) { // time cursor
        s.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", m.t - 8).attr("y2", m.t + 44).style("stroke", "var(--bad)").attr("stroke-width", 2);
        s.append("text").attr("x", x(t)).attr("y", m.t - 10).attr("text-anchor", "middle").style("font-size", "11px").style("fill", "var(--bad)").text(`t=${t}`);
      }
    }

    buildTable(); update();
  });
})();
