/* Module 9: page replacement and effective access time */
(function () {
  "use strict";
  const { h, panel, select, slider, button, svg, player } = OSUI;
  const L = OSLib;

  const PRESETS = {
    "Classic textbook string": "7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1",
    "Belady's anomaly string": "1 2 3 4 1 2 5 1 2 3 4 5",
    "Strong locality": "1 2 1 2 3 1 2 1 3 2 1 4 5 4 5 4 1 5 4 5",
    "Sequential scan (loop)": "1 2 3 4 5 1 2 3 4 5 1 2 3 4 5"
  };
  const ALGO_COLORS = { FIFO: "var(--c1)", LRU: "var(--c3)", OPT: "var(--c2)", CLOCK: "var(--c4)" };

  OSUI.register("pagerepl", (el) => {
    const p = panel(el, "Page-replacement simulator",
      "Enter a reference string (numbers separated by spaces or commas), choose the number of frames and an algorithm. Red columns are page faults.");
    let refs = PRESETS["Belady's anomaly string"].split(" ").map(Number), frames = 3, algo = "FIFO";
    const presetSel = select({ label: "Preset", options: Object.keys(PRESETS), value: "Belady's anomaly string", onChange: (k) => { text.value = PRESETS[k]; parse(); } });
    const algoSel = select({ label: "Algorithm", options: Object.entries(L.pageAlgos).map(([value, label]) => ({ value, label })), value: algo, onChange: (v) => { algo = v; update(); } });
    const fSl = slider({ label: "Frames", min: 1, max: 8, value: frames, onInput: (v) => { frames = v; update(); } });
    const text = h("input", { type: "text", value: refs.join(" "), size: 42, "aria-label": "Reference string", oninput: parse });
    p.controls.append(presetSel.el, h("label", {}, h("span", { text: "Reference string" }), text), algoSel.el, fSl.el);
    const err = h("p", { class: "status-bad", "aria-live": "polite" }), metrics = h("div", { class: "metrics", "aria-live": "polite" });
    const grid = h("div", { class: "chart" }), cmp = h("div", { class: "chart" });
    let cur = null;
    const status = h("p", { "aria-live": "polite", style: "min-height:1.6em;margin:.25rem 0" });
    const pl = player({ total: () => refs.length, onFrame: () => drawGrid(), label: (i, n) => `${i} of ${n} references` });
    p.body.append(err, metrics, h("h4", { text: "Watch it run" }), pl.el, status, grid, h("h4", { text: "Page faults vs. number of frames (all algorithms)" }), cmp,
      h("p", { class: "small", html: "If the FIFO line ever <b>rises</b> as frames increase, that is Belady's anomaly. Try the “Belady's anomaly string” preset." }));

    function parse() {
      const toks = text.value.split(/[\s,]+/).filter(Boolean), nums = toks.map(Number);
      if (!toks.length || nums.some((n) => !Number.isInteger(n) || n < 0) || toks.length > 60) { err.textContent = toks.length > 60 ? "Please use at most 60 references." : "Reference strings must be non-negative integers separated by spaces or commas."; return; }
      err.textContent = ""; refs = nums; update();
    }
    function update() {
      cur = L.replacePages(refs, frames, algo);
      metrics.replaceChildren(...[[cur.faults, "page faults"], [refs.length - cur.faults, "hits"], [`${((1 - cur.faults / refs.length) * 100).toFixed(0)}%`, "hit ratio"]]
        .map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      pl.reset(); drawGrid(); drawCompare();
    }
    /** Draws the frame table up to the number of references processed so far (pl.index). */
    function drawGrid() {
      const r = cur, k = pl.index;
      const cell = 34, W = 90 + cell * refs.length, H = 40 + cell * (frames + 1) + 10;
      d3.select(grid).selectAll("*").remove();
      const s = svg(grid, W, H, `${L.pageAlgos[algo]} with ${frames} frames: ${r.faults} faults`);
      s.append("text").attr("x", 4).attr("y", 24).style("font-size", "12px").attr("class", "muted").text("reference →");
      const so = r.steps.slice(0, k).reduce((n, st) => n + (st.fault ? 1 : 0), 0);
      if (k > 0 && k < refs.length) {
        const st = r.steps[k - 1];
        status.textContent = `Reference ${k} of ${refs.length}: page ${st.ref} → ${st.fault ? `PAGE FAULT${st.evicted !== null ? `, evicts page ${st.evicted}` : " (a frame was free)"}` : "hit"}. Faults so far: ${so}.`;
      } else status.textContent = k === 0 ? "Press Play or Step to watch the algorithm process each reference." : "";
      r.steps.forEach((st, i) => {
        const x = 90 + i * cell, visible = i < k, current = i === k - 1 && k < refs.length;
        const g = s.append("g").attr("opacity", visible ? 1 : 0.18);
        g.append("rect").attr("x", x).attr("y", 6).attr("width", cell - 2).attr("height", 26).attr("rx", 4).style("fill", !visible ? "var(--muted)" : st.fault ? "var(--bad)" : "var(--ok)").attr("opacity", 0.9);
        g.append("text").attr("x", x + cell / 2 - 1).attr("y", 24).attr("text-anchor", "middle").style("fill", !visible ? "var(--on-c8)" : st.fault ? "var(--on-bad)" : "var(--on-ok)").style("font-weight", 700).text(st.ref);
        if (current) g.append("rect").attr("class", "pop").attr("x", x - 2).attr("y", 4).attr("width", cell + 2).attr("height", 40 + cell * frames - 4).attr("rx", 6).style("fill", "none").style("stroke", "var(--accent)").attr("stroke-width", 3);
        if (!visible) return;
        st.frames.forEach((f, j) => {
          const y = 40 + j * cell, isNew = st.fault && j === st.slot;
          g.append("rect").attr("x", x).attr("y", y).attr("width", cell - 2).attr("height", cell - 2).attr("rx", 4).style("fill", isNew ? "color-mix(in srgb, var(--bad) 25%, var(--card))" : "var(--card)").style("stroke", "var(--border)");
          if (f !== null) g.append("text").attr("x", x + cell / 2 - 1).attr("y", y + cell / 2 + 4).attr("text-anchor", "middle").style("font-weight", isNew ? 700 : 400).text(f);
          if (algo === "CLOCK" && f !== null && st.refbits[j]) g.append("text").attr("x", x + cell - 7).attr("y", y + 11).attr("text-anchor", "end").style("font-size", "8px").attr("class", "muted").text("●");
          if (algo === "CLOCK" && st.hand === j) g.append("text").attr("x", x + 4).attr("y", y + 11).style("font-size", "9px").style("fill", "var(--c6t)").text("➤");
        });
      });
      for (let j = 0; j < frames; j++) s.append("text").attr("x", 4).attr("y", 40 + j * cell + cell / 2 + 4).style("font-size", "12px").attr("class", "muted").text(`frame ${j}`);
      s.append("text").attr("x", 4).attr("y", H - 4).style("font-size", "11px").attr("class", "muted").text(algo === "CLOCK" ? "● = reference bit set, ➤ = clock hand" : "Highlighted cell = page just loaded");
    }
    function drawCompare() {
      const maxF = 8, W = 720, H = 300, m = { l: 44, r: 20, t: 30, b: 38 };
      const data = Object.keys(L.pageAlgos).map((a) => ({ a, pts: L.faultsByFrames(refs, a, maxF) }));
      d3.select(cmp).selectAll("*").remove();
      const s = svg(cmp, W, H, "Page faults versus frames for FIFO, LRU, OPT and Clock");
      const x = d3.scaleLinear().domain([1, maxF]).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d3.max(d.pts, (q) => q.faults)) + 1]).range([H - m.b, m.t]);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(maxF).tickFormat(d3.format("d")));
      s.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("d")));
      s.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", H - 4).attr("text-anchor", "middle").style("font-size", "12px").text("Number of frames");
      data.forEach((d) => {
        s.append("path").attr("d", d3.line().x((q) => x(q.frames)).y((q) => y(q.faults))(d.pts)).attr("fill", "none").style("stroke", ALGO_COLORS[d.a])
          .attr("stroke-width", d.a === algo ? 4 : 2).attr("stroke-dasharray", d.a === "CLOCK" ? "7 4" : null).attr("opacity", d.a === algo ? 1 : 0.8);
        s.selectAll(null).data(d.pts).join("circle").attr("cx", (q) => x(q.frames)).attr("cy", (q) => y(q.faults)).attr("r", 3).style("fill", ALGO_COLORS[d.a])
          .append("title").text((q) => `${d.a}, ${q.frames} frames: ${q.faults} faults`);
      });
      // legend (end-of-line labels collide because the curves converge once memory is large enough)
      Object.keys(L.pageAlgos).forEach((a, i) => {
        const lx = W - m.r - 4 - (3 - i) * 78;
        s.append("line").attr("x1", lx - 24).attr("x2", lx - 4).attr("y1", 12).attr("y2", 12).style("stroke", ALGO_COLORS[a]).attr("stroke-width", 3).attr("stroke-dasharray", a === "CLOCK" ? "5 3" : null);
        s.append("text").attr("x", lx).attr("y", 16).style("font-size", "12px").style("font-weight", a === algo ? 700 : 400).text(a);
      });
      const f = data.find((d) => d.a === "FIFO").pts;
      const anomalies = f.filter((q, i) => i > 0 && q.faults > f[i - 1].faults);
      if (anomalies.length) s.append("text").attr("x", m.l + 8).attr("y", m.t + 14).style("fill", "var(--bad)").style("font-weight", 700).style("font-size", "12px")
        .text(`Belady's anomaly: FIFO gets worse going to ${anomalies.map((q) => q.frames).join(", ")} frames`);
    }
    update();
  });

  OSUI.register("eat", (el) => {
    const p = panel(el, "Effective access time with page faults",
      "<code>EAT = (1 − p) × memory time + p × fault service time</code>. Even a tiny fault rate p dominates, because a fault is about 100,000× slower than a memory access.");
    const mSl = slider({ label: "Memory access", min: 10, max: 300, step: 10, value: 100, format: (v) => `${v} ns`, onInput: draw });
    const fSl = slider({ label: "Fault service time", min: 0.1, max: 12, step: 0.1, value: 8, format: (v) => `${v.toFixed(1)} ms`, onInput: draw });
    const pSl = slider({ label: "Fault rate p (log scale)", min: -8, max: -1, step: 0.1, value: -3, format: (v) => `1 in ${Math.round(10 ** -v).toLocaleString()}`, onInput: draw });
    p.controls.append(mSl.el, fSl.el, pSl.el);
    const metrics = h("div", { class: "metrics", "aria-live": "polite" }), chart = h("div", { class: "chart" });
    p.body.append(metrics, chart);
    function draw() {
      const mem = mSl.get(), fault = fSl.get() * 1e6, pr = 10 ** pSl.get();
      const eat = L.effectiveAccessTime(mem, fault, pr), slow = eat / mem;
      const target = 0.1 * mem / (fault - mem);
      metrics.replaceChildren(...[[`${eat.toLocaleString(undefined, { maximumFractionDigits: 1 })} ns`, "effective access time"], [`${slow.toFixed(2)}×`, "slowdown vs. no faults"],
        [`1 in ${Math.round(1 / target).toLocaleString()}`, "fault rate for ≤ 10% slowdown"]].map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      const W = 720, H = 300, m = { l: 62, r: 20, t: 14, b: 40 };
      d3.select(chart).selectAll("*").remove();
      const s = svg(chart, W, H, "Effective access time versus page-fault rate");
      const x = d3.scaleLinear().domain([-8, -1]).range([m.l, W - m.r]);
      const y = d3.scaleLog().domain([mem, fault]).range([H - m.b, m.t]);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(7).tickFormat((d) => `10^${d}`));
      s.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6, "~s"));
      s.append("text").attr("x", W / 2).attr("y", H - 4).attr("text-anchor", "middle").style("font-size", "12px").text("Page-fault rate p");
      s.append("text").attr("transform", `translate(14,${H / 2}) rotate(-90)`).attr("text-anchor", "middle").style("font-size", "12px").text("EAT (ns, log)");
      const pts = d3.range(-8, -1 + 0.01, 0.1);
      s.append("path").attr("d", d3.line().x((v) => x(v)).y((v) => y(L.effectiveAccessTime(mem, fault, 10 ** v)))(pts)).attr("fill", "none").style("stroke", "var(--c1)").attr("stroke-width", 3);
      s.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(mem * 1.1)).attr("y2", y(mem * 1.1)).style("stroke", "var(--c3)").attr("stroke-dasharray", "4 4");
      s.append("text").attr("x", W - m.r - 4).attr("y", y(mem * 1.1) - 5).attr("text-anchor", "end").style("font-size", "11px").style("fill", "var(--c3t)").text("10% slowdown");
      s.append("circle").attr("cx", x(pSl.get())).attr("cy", y(eat)).attr("r", 6).style("fill", "var(--c2)").style("stroke", "var(--bg)").attr("stroke-width", 2);
    }
    draw();
  });
})();
