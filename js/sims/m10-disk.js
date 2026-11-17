/* Module 10: disk scheduling, with an animated disk arm */
(function () {
  "use strict";
  const { h, panel, select, slider, button, svg, number, player } = OSUI;
  const L = OSLib;

  OSUI.register("disk", (el) => {
    const p = panel(el, "Disk-arm scheduling",
      "Requests are cylinder numbers. The chart shows the head's path down the page: each row is one move. Dashed lines are the long return trip of C-SCAN / C-LOOK. Press Play to watch the arm move.");
    let reqs = [98, 183, 37, 122, 14, 124, 65, 67], head = 53, max = 199, algo = "FCFS", dir = "up", seekMs = 0.2;
    let cur = null, scale = null, ov = null, prevFrame = -1;
    const text = h("input", { type: "text", size: 36, value: reqs.join(" "), "aria-label": "Request queue", oninput: parse });
    const err = h("p", { class: "status-bad", "aria-live": "polite" });
    const algoSel = select({ label: "Algorithm", options: Object.entries(L.diskAlgos).map(([value, label]) => ({ value, label })), value: algo, onChange: (v) => { algo = v; dirSel.el.style.display = ["SCAN", "CSCAN", "LOOK", "CLOOK"].includes(v) ? "" : "none"; update(); } });
    const dirSel = select({ label: "Initial direction", options: [{ value: "up", label: "toward higher cylinders" }, { value: "down", label: "toward lower cylinders" }], value: dir, onChange: (v) => { dir = v; update(); } });
    dirSel.el.style.display = "none";
    const headSl = slider({ label: "Head starts at", min: 0, max, value: head, onInput: (v) => { head = v; update(); } });
    const maxIn = number({ label: "Highest cylinder", min: 50, max: 999, value: max, onInput: (v) => { max = Math.floor(v); headSl.el.querySelector("input").max = max; head = Math.min(head, max); headSl.set(head); parse(); } });
    const msSl = slider({ label: "Seek cost / cylinder", min: 0.01, max: 1, step: 0.01, value: seekMs, format: (v) => `${v.toFixed(2)} ms`, onInput: (v) => { seekMs = v; update(); } });
    p.controls.append(h("label", {}, h("span", { text: "Request queue (cylinders)" }), text), algoSel.el, dirSel.el, headSl.el, maxIn.el, msSl.el,
      button("Random queue", () => { reqs = Array.from({ length: 8 }, () => Math.floor(Math.random() * (max + 1))); text.value = reqs.join(" "); update(); }, true),
      button("Textbook queue", () => { max = 199; maxIn.set(199); head = 53; headSl.set(53); reqs = [98, 183, 37, 122, 14, 124, 65, 67]; text.value = reqs.join(" "); update(); }, true));
    const metrics = h("div", { class: "metrics", "aria-live": "polite" }), chart = h("div", { class: "chart" }), cmp = h("div", {});
    const status = h("p", { "aria-live": "polite", style: "min-height:1.6em;margin:.25rem 0" });
    const pl = player({
      total: () => (cur ? cur.path.length - 1 : 0),
      onFrame: (i) => { drawOverlay(i, i === prevFrame + 1); prevFrame = i; },
      label: (i, n) => `move ${i} of ${n}`
    });
    p.body.append(err, metrics, pl.el, status, chart, h("h4", { text: "All algorithms on this queue" }), cmp);

    function parse() {
      const toks = text.value.split(/[\s,]+/).filter(Boolean), nums = toks.map(Number);
      if (!toks.length || toks.length > 30 || nums.some((n) => !Number.isInteger(n) || n < 0 || n > max)) { err.textContent = `Enter 1–30 whole numbers between 0 and ${max}.`; return; }
      err.textContent = ""; reqs = nums; update();
    }

    const W = 720, rowH = 28, m = { l: 16, r: 16, t: 28, b: 8 };
    const yAt = (i) => m.t + i * rowH + 8;

    function update() {
      const r = cur = L.scheduleDisk(reqs, head, algo, { max, dir });
      metrics.replaceChildren(...[[r.total, "cylinders moved"], [`${(r.total * seekMs).toFixed(1)} ms`, "total seek time"], [(r.total / reqs.length).toFixed(1), "avg. movement per request"]]
        .map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      const H = m.t + m.b + rowH * (r.path.length - 1) + 14;
      d3.select(chart).selectAll("*").remove();
      const s = svg(chart, W, H, `Head path for ${L.diskAlgos[algo]}: ${r.path.map((q) => q.pos).join(", ")}`);
      const x = scale = d3.scaleLinear().domain([0, max]).range([m.l + 10, W - m.r - 10]);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${m.t - 6})`).call(d3.axisTop(x).ticks(10));
      s.selectAll("line.gridv").data(x.ticks(10)).join("line").attr("class", "gridline").attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", m.t - 6).attr("y2", H - m.b);
      // faint "preview" of the entire path, so students can see where the arm is going
      r.path.forEach((pt, i) => {
        if (i === 0) return;
        const prev = r.path[i - 1];
        s.append("line").attr("x1", x(prev.pos)).attr("y1", yAt(i - 1)).attr("x2", x(pt.pos)).attr("y2", yAt(i)).style("stroke", "var(--muted)").attr("opacity", 0.3).attr("stroke-width", 1.5).attr("stroke-dasharray", pt.jump ? "6 4" : null);
      });
      r.path.forEach((pt, i) => {
        if (i === 0) return;
        s.append("circle").attr("cx", x(pt.pos)).attr("cy", yAt(i)).attr("r", 3).style("fill", "none").style("stroke", "var(--muted)").attr("opacity", 0.5);
      });
      ov = s.append("g").attr("class", "overlay");
      const all = Object.keys(L.diskAlgos).map((a) => ({ a, t: L.scheduleDisk(reqs, head, a, { max, dir }).total }));
      const best = Math.min(...all.map((x) => x.t));
      cmp.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Algorithm", "Cylinders moved", "Seek time"].map((t) => h("th", { text: t })))),
        h("tbody", {}, all.map((x) => h("tr", { style: x.a === algo ? "font-weight:700" : "" }, h("td", { text: L.diskAlgos[x.a] + (x.t === best ? "  ★" : "") }), h("td", { text: x.t }), h("td", { text: `${(x.t * seekMs).toFixed(1)} ms` }))))),
        h("p", { class: "small", text: "★ = least head movement. Remember: the lowest total is not the only goal. SSTF can starve distant requests; C-SCAN gives more uniform waiting times." }));
      pl.reset(); prevFrame = pl.index; drawOverlay(pl.index, false);
    }

    /** Draw the arm's progress after k moves. If animate, the latest move slides in. */
    function drawOverlay(k, animate) {
      const r = cur, x = scale, dur = Math.max(120, pl.ms * 0.8);
      ov.selectAll("*").remove();
      const done = animate ? k - 1 : k; // moves drawn instantly
      for (let i = 1; i <= done; i++) {
        const a = r.path[i - 1], b = r.path[i];
        ov.append("line").attr("x1", x(a.pos)).attr("y1", yAt(i - 1)).attr("x2", x(b.pos)).attr("y2", yAt(i)).style("stroke", b.jump ? "var(--c6)" : "var(--c1)").attr("stroke-width", 2.5).attr("stroke-dasharray", b.jump ? "6 4" : null);
      }
      const dot = (i) => {
        const pt = r.path[i];
        ov.append("circle").attr("cx", x(pt.pos)).attr("cy", yAt(i)).attr("r", i === 0 ? 7 : 5).style("fill", i === 0 ? "var(--c2)" : pt.served ? "var(--c3)" : "var(--card)").style("stroke", pt.served || i === 0 ? "var(--bg)" : "var(--muted)").attr("stroke-width", 2)
          .append("title").text(i === 0 ? "starting position" : pt.served ? `serve request at ${pt.pos}` : `head passes ${pt.pos} (no request)`);
        ov.append("text").attr("x", x(pt.pos) + (x(pt.pos) > W - 60 ? -10 : 10)).attr("y", yAt(i) - 8).attr("text-anchor", x(pt.pos) > W - 60 ? "end" : "start").style("font-size", "11px").text(i === 0 ? `start ${pt.pos}` : pt.pos);
      };
      for (let i = 0; i <= done; i++) dot(i);
      let moved = 0;
      for (let i = 1; i <= k; i++) moved += Math.abs(r.path[i].pos - r.path[i - 1].pos);
      if (animate && k >= 1) {
        const a = r.path[k - 1], b = r.path[k];
        ov.append("line").attr("x1", x(a.pos)).attr("y1", yAt(k - 1)).attr("x2", x(a.pos)).attr("y2", yAt(k - 1)).style("stroke", b.jump ? "var(--c6)" : "var(--c1)").attr("stroke-width", 2.5).attr("stroke-dasharray", b.jump ? "6 4" : null)
          .transition().duration(dur).ease(d3.easeCubicInOut).attr("x2", x(b.pos)).attr("y2", yAt(k));
        const head_ = ov.append("circle").attr("cx", x(a.pos)).attr("cy", yAt(k - 1)).attr("r", 7).style("fill", "var(--c2)").style("stroke", "var(--bg)").attr("stroke-width", 2);
        head_.transition().duration(dur).ease(d3.easeCubicInOut).attr("cx", x(b.pos)).attr("cy", yAt(k));
        ov.append("text").attr("x", x(b.pos) + (x(b.pos) > W - 60 ? -10 : 10)).attr("y", yAt(k) - 8).attr("text-anchor", x(b.pos) > W - 60 ? "end" : "start").style("font-size", "11px").text(b.pos);
      } else if (k >= 1 && k < r.path.length - 1) {
        ov.append("circle").attr("cx", x(r.path[k].pos)).attr("cy", yAt(k)).attr("r", 8).style("fill", "none").style("stroke", "var(--c2)").attr("stroke-width", 3);
      }
      const at = r.path[k];
      status.textContent = k === 0 ? `Head at cylinder ${r.path[0].pos}. Press Play or Step to start.`
        : k < r.path.length - 1 || pl.playing ? `Move ${k}: ${r.path[k - 1].pos} → ${at.pos}${at.jump ? " (return trip)" : ""}. Cylinders moved so far: ${moved} of ${r.total}.`
        : `Finished: ${r.total} cylinders moved in total.`;
    }
    update();
  });
})();
