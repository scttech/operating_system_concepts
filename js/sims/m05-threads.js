/* Module 5: Amdahl's law and context-switch overhead */
(function () {
  "use strict";
  const { h, panel, slider, svg } = OSUI;
  const L = OSLib;

  function frame(chart, W, H, label) {
    d3.select(chart).selectAll("*").remove();
    return svg(chart, W, H, label);
  }

  OSUI.register("amdahl", (el) => {
    const p = panel(el, "Amdahl's law explorer",
      "How much faster does a program run with more cores? The serial portion of the program limits the speedup, no matter how many cores you add.");
    const pSl = slider({ label: "Parallel fraction p", min: 0, max: 0.99, step: 0.01, value: 0.9, format: (v) => `${(v * 100).toFixed(0)}%`, onInput: draw });
    const nSl = slider({ label: "Cores shown (max)", min: 2, max: 128, step: 1, value: 32, onInput: draw });
    const cSl = slider({ label: "Your core count N", min: 1, max: 128, step: 1, value: 8, onInput: draw });
    p.controls.append(pSl.el, cSl.el, nSl.el);
    const metrics = h("div", { class: "metrics", "aria-live": "polite" });
    const chart = h("div", { class: "chart" });
    const tl = h("div", { class: "chart" }), tlStatus = h("p", { class: "small", "aria-live": "polite", style: "margin:.25rem 0" });
    const FRAMES = 40;
    const pl = OSUI.player({ total: () => FRAMES, onFrame: () => drawTimeline(), label: (i) => `${Math.round((i / FRAMES) * 100)}% of the single-core run time` });
    p.body.append(metrics, chart,
      h("p", { class: "small", html: "Dashed gray line = ideal linear speedup. Faint lines are reference curves for other parallel fractions. The horizontal dotted line is the theoretical limit 1 / (1 − p)." }),
      h("h4", { text: "Watch the work spread across cores" }),
      h("p", { class: "small", html: "<b style='color:var(--c6t)'>Orange</b> = serial work (only one core can do it). <b style='color:var(--c1t)'>Blue</b> = parallel work, split evenly among the cores. Both runs start together; the time axis is measured in single-core run times." }),
      pl.el, tlStatus, tl);

    /** Timeline of one core vs. N cores executing the same program. */
    function drawTimeline() {
      const pf = pSl.get(), N = cSl.get(), shown = Math.min(N, 12), t = pl.index / FRAMES;
      const serial = 1 - pf, tN = serial + pf / N;
      const W = 720, labelW = 80, rowH = 20, H = 30 + (shown + 1) * rowH + 24;
      d3.select(tl).selectAll("*").remove();
      const s = frame(tl, W, H, `Timeline: one core takes 1.0 time units; ${N} cores take ${tN.toFixed(2)}`);
      const x = d3.scaleLinear().domain([0, 1]).range([labelW, W - 20]);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(5));
      const lane = (i, label, segs) => {
        const y = 12 + i * rowH;
        s.append("text").attr("x", labelW - 6).attr("y", y + 13).attr("text-anchor", "end").style("font-size", "11px").text(label);
        segs.forEach(([a, b, c]) => {
          s.append("rect").attr("x", x(a)).attr("y", y).attr("width", Math.max(0, x(b) - x(a))).attr("height", rowH - 4).style("fill", "none").style("stroke", "var(--border)");
          const end = Math.min(b, t);
          if (end > a) s.append("rect").attr("x", x(a)).attr("y", y).attr("width", x(end) - x(a)).attr("height", rowH - 4).style("fill", c);
        });
      };
      lane(0, "1 core", [[0, serial, "var(--c6)"], [serial, 1, "var(--c1)"]]);
      for (let k = 0; k < shown; k++) lane(k + 1, k === 0 ? `core 1 of ${N}` : `core ${k + 1}`, k === 0 ? [[0, serial, "var(--c6)"], [serial, tN, "var(--c1)"]] : [[serial, tN, "var(--c1)"]]);
      if (shown < N) s.append("text").attr("x", W - 20).attr("y", H - 28).attr("text-anchor", "end").style("font-size", "10px").attr("class", "muted").text(`… and ${N - shown} more cores doing the same`);
      s.append("line").attr("x1", x(tN)).attr("x2", x(tN)).attr("y1", 6).attr("y2", H - 22).style("stroke", "var(--c3)").attr("stroke-dasharray", "4 3").attr("stroke-width", 2);
      if (t < 1) s.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", 6).attr("y2", H - 22).style("stroke", "var(--bad)").attr("stroke-width", 2);
      tlStatus.textContent = t >= tN ? `The ${N}-core run finished at ${tN.toFixed(2)} (speedup ${(1 / tN).toFixed(2)}×)${t < 1 ? "; the single-core run is still going." : "."}`
        : t < serial ? "Serial phase: only one core can make progress while the others sit idle." : "Parallel phase: all cores work at once.";
    }

    function draw() {
      pl.reset(); drawTimeline();
      const pf = pSl.get(), N = Math.min(cSl.get(), nSl.get()), maxN = nSl.get();
      const s1 = L.amdahl(pf, N), lim = L.amdahlLimit(pf);
      metrics.replaceChildren(...[[`${s1.toFixed(2)}×`, `speedup on ${N} core${N > 1 ? "s" : ""}`], [`${(100 * s1 / N).toFixed(0)}%`, "parallel efficiency"],
        [lim === Infinity ? "∞" : `${lim.toFixed(1)}×`, "limit with infinite cores"], [`${L.gustafson(pf, N).toFixed(2)}×`, "Gustafson (scaled) speedup"]]
        .map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      const W = 720, H = 380, m = { l: 48, r: 20, t: 14, b: 40 };
      const s = frame(chart, W, H, `Speedup versus cores for parallel fraction ${(pf * 100).toFixed(0)} percent`);
      const x = d3.scaleLinear().domain([1, maxN]).range([m.l, W - m.r]);
      const yMax = Math.min(maxN, Math.max(4, L.amdahl(Math.max(pf, 0.9), maxN) * 1.1));
      const y = d3.scaleLinear().domain([1, yMax]).range([H - m.b, m.t]).nice();
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(8));
      s.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(8));
      s.append("text").attr("x", W / 2).attr("y", H - 6).attr("text-anchor", "middle").style("font-size", "12px").text("Number of cores");
      s.append("text").attr("transform", `translate(12,${H / 2}) rotate(-90)`).attr("text-anchor", "middle").style("font-size", "12px").text("Speedup");
      const pts = d3.range(1, maxN + 1);
      const line = (f) => d3.line().x((n) => x(n)).y((n) => y(Math.min(f(n), y.domain()[1]))).curve(d3.curveMonotoneX)(pts);
      s.append("path").attr("d", line((n) => n)).attr("fill", "none").style("stroke", "var(--muted)").attr("stroke-dasharray", "5 4");
      [0.5, 0.75, 0.9, 0.95, 0.99].forEach((q) => {
        s.append("path").attr("d", line((n) => L.amdahl(q, n))).attr("fill", "none").style("stroke", "var(--c8)").attr("opacity", 0.35);
        s.append("text").attr("x", W - m.r - 2).attr("y", y(Math.min(L.amdahl(q, maxN), y.domain()[1])) - 3).attr("text-anchor", "end").style("font-size", "10px").attr("class", "muted").text(`${q * 100}%`);
      });
      if (lim !== Infinity && lim <= y.domain()[1]) {
        s.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(lim)).attr("y2", y(lim)).style("stroke", "var(--c6)").attr("stroke-dasharray", "2 3");
      }
      s.append("path").attr("d", line((n) => L.amdahl(pf, n))).attr("fill", "none").style("stroke", "var(--c1)").attr("stroke-width", 3);
      s.append("circle").attr("cx", x(N)).attr("cy", y(Math.min(s1, y.domain()[1]))).attr("r", 6).style("fill", "var(--c2)").style("stroke", "var(--bg)").attr("stroke-width", 2);
    }
    draw();
  });

  OSUI.register("switchcost", (el) => {
    const p = panel(el, "Context-switch overhead vs. time quantum",
      "A small quantum gives snappy response but wastes time switching. A large quantum is efficient but sluggish for interactive users.");
    const qSl = slider({ label: "Time quantum q", min: 1, max: 100, value: 10, format: (v) => `${v} ms`, onInput: draw });
    const sSl = slider({ label: "Switch cost s", min: 0.1, max: 5, step: 0.1, value: 1, format: (v) => `${v.toFixed(1)} ms`, onInput: draw });
    const nSl = slider({ label: "Runnable processes n", min: 2, max: 50, value: 10, onInput: draw });
    p.controls.append(qSl.el, sSl.el, nSl.el);
    const metrics = h("div", { class: "metrics", "aria-live": "polite" });
    const chart = h("div", { class: "chart" });
    p.body.append(metrics, chart);

    function draw() {
      const q = qSl.get(), sc = sSl.get(), n = nSl.get();
      const eff = L.switchEfficiency(q, sc), worst = (n - 1) * (q + sc);
      metrics.replaceChildren(...[[`${(eff * 100).toFixed(1)}%`, "CPU time spent on real work"], [`${((1 - eff) * 100).toFixed(1)}%`, "lost to switching"], [`${worst.toFixed(0)} ms`, `worst-case wait to run again (n−1)(q+s)`]]
        .map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      const W = 720, H = 300, m = { l: 48, r: 48, t: 14, b: 40 };
      const s = frame(chart, W, H, "Efficiency and worst-case response time versus time quantum");
      const x = d3.scaleLinear().domain([1, 100]).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
      const qs = d3.range(1, 101);
      const yR = d3.scaleLinear().domain([0, (n - 1) * (100 + sc)]).range([H - m.b, m.t]);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(10));
      s.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));
      s.append("g").attr("class", "axis").attr("transform", `translate(${W - m.r},0)`).call(d3.axisRight(yR).ticks(5));
      s.append("text").attr("x", W / 2).attr("y", H - 6).attr("text-anchor", "middle").style("font-size", "12px").text("Time quantum q (ms)");
      s.append("path").attr("d", d3.line().x((v) => x(v)).y((v) => y(L.switchEfficiency(v, sc)))(qs)).attr("fill", "none").style("stroke", "var(--c1)").attr("stroke-width", 3);
      s.append("path").attr("d", d3.line().x((v) => x(v)).y((v) => yR((n - 1) * (v + sc)))(qs)).attr("fill", "none").style("stroke", "var(--c6)").attr("stroke-width", 3);
      s.append("circle").attr("cx", x(q)).attr("cy", y(eff)).attr("r", 6).style("fill", "var(--c2)").style("stroke", "var(--bg)").attr("stroke-width", 2);
      s.append("circle").attr("cx", x(q)).attr("cy", yR(worst)).attr("r", 6).style("fill", "var(--c2)").style("stroke", "var(--bg)").attr("stroke-width", 2);
      s.append("text").attr("x", m.l + 8).attr("y", m.t + 12).style("fill", "var(--c1t)").style("font-size", "12px").style("font-weight", 600).text("■ CPU efficiency (left axis)");
      s.append("text").attr("x", m.l + 8).attr("y", m.t + 28).style("fill", "var(--c6t)").style("font-size", "12px").style("font-weight", 600).text("■ Worst-case wait, ms (right axis)");
    }
    draw();
  });
})();
