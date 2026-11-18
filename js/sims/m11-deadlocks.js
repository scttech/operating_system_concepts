/* Module 7: Banker's algorithm and dining philosophers */
(function () {
  "use strict";
  const { h, panel, select, button, ticker, svg, slider } = OSUI;
  const L = OSLib;

  const PRESETS = {
    "Safe state (textbook)": { available: [3, 3, 2], alloc: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]], max: [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]] },
    "Unsafe state": { available: [0, 0, 2], alloc: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [3, 3, 2]], max: [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]] }
  };
  const RES = ["A", "B", "C"];

  OSUI.register("banker", (el) => {
    const p = panel(el, "Banker's algorithm",
      "Edit the matrices (5 processes, 3 resource types). The tool computes Need = Max − Allocation, searches for a safe sequence, and decides whether a new request can safely be granted.");
    let st = JSON.parse(JSON.stringify(PRESETS["Safe state (textbook)"]));
    const presetSel = select({ label: "Preset", options: Object.keys(PRESETS), value: "Safe state (textbook)", onChange: (k) => { st = JSON.parse(JSON.stringify(PRESETS[k])); build(); run(); } });
    p.controls.append(presetSel.el);
    const host = h("div", {}), safety = h("div", { "aria-live": "polite" }), reqHost = h("div", {});
    // Animation of the safety search: the "work" vector grows as each process finishes and releases its resources.
    let run_ = null; // latest safety result
    const bankPl = OSUI.player({ total: () => (run_ ? run_.steps.length : 0), onFrame: () => drawBank(), label: (i, n) => (n ? `${i} of ${n} processes finished` : "no safe sequence to animate") });
    const bankChart = h("div", { class: "chart" }), bankText = h("p", { "aria-live": "polite", style: "margin:.25rem 0" });
    const bankBox = h("div", {}, h("h4", { text: "Watch the safety check" }), bankPl.el, bankText, bankChart);
    p.body.append(host, safety, bankBox, reqHost);

    function drawBank() {
      if (!run_) return;
      const k = bankPl.index, r = run_, total = RES.map((_, j) => st.available[j] + st.alloc.reduce((a, row) => a + row[j], 0));
      const work = k === 0 ? st.available : r.steps[k - 1].workAfter;
      d3.select(bankChart).selectAll("*").remove();
      const W = 520, H = 130, s = svg(bankChart, W, H, `Work vector ${work.join(", ")}`), mx = Math.max(1, ...total);
      const x = d3.scaleLinear().domain([0, mx]).range([70, W - 20]);
      RES.forEach((nm, j) => {
        const y = 12 + j * 36;
        s.append("text").attr("x", 62).attr("y", y + 16).attr("text-anchor", "end").style("font-size", "12px").text(`Resource ${nm}`);
        s.append("rect").attr("x", x(0)).attr("y", y).attr("width", x(total[j]) - x(0)).attr("height", 24).style("fill", "none").style("stroke", "var(--border)").attr("stroke-dasharray", "3 3");
        s.append("rect").attr("x", x(0)).attr("y", y).attr("width", Math.max(0, x(work[j]) - x(0))).attr("height", 24).style("fill", "var(--c3)").attr("opacity", 0.9);
        s.append("text").attr("x", x(work[j]) + 6).attr("y", y + 16).style("font-size", "12px").text(`${work[j]} of ${total[j]} free`);
      });
      bankText.textContent = k === 0 ? "Start: only the Available resources are free. Which process could finish with these?"
        : `P${r.steps[k - 1].pid} can finish (its Need fits in the work vector), so it runs to completion and returns its allocation. Work is now (${work.join(", ")}).`;
      safety.querySelectorAll("tbody tr").forEach((tr, i) => tr.classList.toggle("hl", i === k - 1));
    }

    const reqPid = h("select", { "aria-label": "Requesting process" }, [0, 1, 2, 3, 4].map((i) => h("option", { value: i, text: `P${i}` })));
    reqPid.value = "1";
    const reqIn = [1, 0, 2].map((v, i) => h("input", { type: "number", min: 0, value: v, "aria-label": `Request for resource ${RES[i]}` }));
    const reqOut = h("p", { "aria-live": "polite" });
    reqHost.append(h("h4", { text: "Make a request" }), h("div", { class: "controls" }, h("label", {}, h("span", { text: "Process" }), reqPid),
      ...reqIn.map((inp, i) => h("label", {}, h("span", { text: `Resource ${RES[i]}` }), inp)),
      button("Check request", () => {
        const r = L.requestResources(+reqPid.value, reqIn.map((i) => Math.max(0, +i.value || 0)), st.available, st.alloc, st.max);
        reqOut.innerHTML = `<span class="${r.granted ? "status-ok" : "status-bad"}">${r.reason}</span>` + (r.safety ? ` Safe sequence: ${r.safety.safe ? r.safety.sequence.map((i) => "P" + i).join(" → ") : "none"}.` : "");
      })), reqOut);

    function matrix(title, key, rowLabels) {
      return h("div", {}, h("strong", { text: title }), h("table", { class: "compact data" },
        h("thead", {}, h("tr", {}, h("th", {}, h("span", { class: "sr-only", text: "Process" })), RES.map((r) => h("th", { text: r })))),
        h("tbody", {}, st[key].map((row, i) => h("tr", {}, h("th", { scope: "row", text: rowLabels[i] }), row.map((v, j) => {
          const inp = h("input", { type: "number", min: 0, value: v, "aria-label": `${title} ${rowLabels[i]} ${RES[j]}`, oninput: () => { st[key][i][j] = Math.max(0, +inp.value || 0); run(); } });
          return h("td", {}, inp);
        }))))));
    }
    function build() {
      const names = [0, 1, 2, 3, 4].map((i) => `P${i}`);
      const availRow = h("div", {}, h("strong", { text: "Available" }), h("table", { class: "compact data" },
        h("thead", {}, h("tr", {}, RES.map((r) => h("th", { text: r })))),
        h("tbody", {}, h("tr", {}, st.available.map((v, j) => { const inp = h("input", { type: "number", min: 0, value: v, "aria-label": `Available ${RES[j]}`, oninput: () => { st.available[j] = Math.max(0, +inp.value || 0); run(); } }); return h("td", {}, inp); })))));
      host.replaceChildren(h("div", { class: "row", style: "align-items:flex-start;gap:1.5rem" }, matrix("Allocation", "alloc", names), matrix("Max", "max", names), h("div", { id: "need-host" }), availRow));
    }
    function run() {
      const need = L.needMatrix(st.alloc, st.max);
      const bad = need.some((r) => r.some((v) => v < 0));
      const nh = host.querySelector("#need-host");
      nh.replaceChildren(h("strong", { text: "Need = Max − Allocation" }), h("table", { class: "compact" },
        h("thead", {}, h("tr", {}, h("th", {}, h("span", { class: "sr-only", text: "Process" })), RES.map((r) => h("th", { text: r })))),
        h("tbody", {}, need.map((r, i) => h("tr", {}, h("th", { scope: "row", text: `P${i}` }), r.map((v) => h("td", { text: v, style: v < 0 ? "color:var(--bad);font-weight:700" : "" })))))));
      if (bad) { run_ = null; bankBox.hidden = true; safety.innerHTML = '<p class="status-bad">Some Max values are smaller than Allocation (negative need). Fix the inputs.</p>'; return; }
      const r = run_ = L.isSafe(st.available, st.alloc, st.max);
      bankBox.hidden = false; bankPl.reset();
      OSUI.fill(safety, h("p", { html: r.safe ? `<span class="status-ok">SAFE.</span> One safe sequence: <b>${r.sequence.map((i) => "P" + i).join(" → ")}</b>` : `<span class="status-bad">UNSAFE.</span> Only ${r.sequence.length} of 5 processes can be guaranteed to finish${r.sequence.length ? ": " + r.sequence.map((i) => "P" + i).join(" → ") : ""}.` }),
        r.steps.length ? h("details", {}, h("summary", { text: "Show the algorithm step by step" }),
          h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Run", "Work before", "+ Allocation", "Work after"].map((t) => h("th", { text: t })))),
            h("tbody", {}, r.steps.map((s) => h("tr", {}, h("td", { text: `P${s.pid}` }), h("td", { text: `(${s.workBefore})` }), h("td", { text: `(${st.alloc[s.pid]})` }), h("td", { text: `(${s.workAfter})` })))))) : null);
      drawBank();
    }
    build(); run();

    // Shareable link: the three matrices, and the request to check (which is checked again when the link opens).
    if (L.share) {
      const S = L.share;
      OSUI.shareable(p, "banker", {
        spec: { alloc: S.matrix(5, 3, 0, 99), max: S.matrix(5, 3, 0, 99), avail: S.ints(0, 99, 3, 3), pid: S.int(0, 4), req: S.ints(0, 99, 3, 3) },
        get: () => ({ alloc: st.alloc, max: st.max, avail: st.available, pid: +reqPid.value, req: reqIn.map((i) => Math.max(0, +i.value || 0)) }),
        set: (s) => {
          if (s.alloc) st.alloc = s.alloc.map((r) => r.slice());
          if (s.max) st.max = s.max.map((r) => r.slice());
          if (s.avail) st.available = s.avail.slice();
          build(); run();
          if (s.pid !== undefined) reqPid.value = String(s.pid);
          if (s.req) {
            s.req.forEach((v, i) => { reqIn[i].value = v; });
            const check = [...reqHost.querySelectorAll("button")].find((b) => b.textContent === "Check request");
            if (check) check.click();
          }
        }
      });
    }
  });

  OSUI.register("philosophers", (el) => {
    const p = panel(el, "Dining philosophers",
      "Five philosophers alternate between thinking and eating. Each needs the forks on both sides. Run each strategy and see which ones can deadlock.");
    const N = 5;
    let strategy = "naive", seed = 1, t = L.newTable(N, strategy, seed), done = false;
    const stratSel = select({ label: "Strategy", options: Object.entries(L.PHIL_STRATEGIES).map(([value, label]) => ({ value, label })), value: strategy, onChange: (v) => { strategy = v; reset(); } });
    const seedSl = slider({ label: "Random seed", min: 1, max: 30, value: seed, onInput: (v) => { seed = v; reset(); } });
    const tk = ticker(() => { stepOnce(); }, 250);
    const playBtn = button("▶ Run", () => { if (tk.running) { tk.stop(); playBtn.textContent = "▶ Run"; } else { tk.start(); playBtn.textContent = "⏸ Pause"; } });
    p.controls.append(stratSel.el, seedSl.el, playBtn, button("Step", stepOnce, true), button("Reset", reset, true));
    const chart = h("div", { class: "chart" }), banner = h("p", { "aria-live": "assertive" }), log = h("div", { class: "log", role: "log" });
    p.body.append(chart, banner, log);

    function reset() { tk.stop(); playBtn.textContent = "▶ Run"; t = L.newTable(N, strategy, seed); done = false; log.replaceChildren(); draw(); }
    function stepOnce() {
      const msg = L.stepTable(t);
      if (msg === null) { tk.stop(); playBtn.textContent = "▶ Run"; done = true; } else { log.prepend(h("div", { text: `${t.steps}. ${msg}` })); while (log.childNodes.length > 60) log.lastChild.remove(); }
      draw();
    }
    const colorOf = { thinking: "var(--c8)", hungry: "var(--c2)", hasFirst: "var(--c6)", eating: "var(--c3)" };
    const onOf = { thinking: "var(--on-c8)", hungry: "var(--on-c2)", hasFirst: "var(--on-c6)", eating: "var(--on-c3)" };
    const labelOf = { thinking: "thinking", hungry: "hungry", hasFirst: "holds 1 fork", eating: "EATING" };
    function draw() {
      d3.select(chart).selectAll("*").remove();
      const W = 520, H = 360, cx = W / 2, cy = H / 2 + 5, R = 120;
      const s = svg(chart, W, H, "Dining philosophers table");
      s.append("circle").attr("cx", cx).attr("cy", cy).attr("r", R - 28).style("fill", "var(--code-bg)");
      const ang = (i) => (-Math.PI / 2) + (i * 2 * Math.PI) / N;
      // forks: fork i sits between philosopher i and i+1
      for (let i = 0; i < N; i++) {
        const a = ang(i) + Math.PI / N, owner = t.fork[i];
        let x = cx + (R - 36) * Math.cos(a), y = cy + (R - 36) * Math.sin(a);
        if (owner !== null) { const oa = ang(owner); x = x * 0.55 + (cx + (R - 6) * Math.cos(oa)) * 0.45; y = y * 0.55 + (cy + (R - 6) * Math.sin(oa)) * 0.45; }
        s.append("line").attr("x1", x - 9 * Math.cos(a + Math.PI / 2)).attr("y1", y - 9 * Math.sin(a + Math.PI / 2)).attr("x2", x + 9 * Math.cos(a + Math.PI / 2)).attr("y2", y + 9 * Math.sin(a + Math.PI / 2))
          .style("stroke", owner === null ? "var(--muted)" : "var(--c4)").attr("stroke-width", 5).attr("stroke-linecap", "round");
        s.append("text").attr("x", cx + (R - 62) * Math.cos(a)).attr("y", cy + (R - 62) * Math.sin(a) + 4).attr("text-anchor", "middle").style("font-size", "11px").attr("class", "muted").text(`f${i}`);
      }
      t.phil.forEach((ph, i) => {
        const x = cx + (R + 38) * Math.cos(ang(i)), y = cy + (R + 38) * Math.sin(ang(i));
        s.append("circle").attr("cx", x).attr("cy", y).attr("r", 26).style("fill", colorOf[ph.s]).style("stroke", "var(--bg)").attr("stroke-width", 3);
        s.append("text").attr("x", x).attr("y", y - 2).attr("text-anchor", "middle").style("fill", onOf[ph.s]).style("font-weight", 700).text(`P${i}`);
        s.append("text").attr("x", x).attr("y", y + 12).attr("text-anchor", "middle").style("fill", onOf[ph.s]).style("font-size", "9px").text(`${ph.meals} meals`);
      });
      s.append("text").attr("x", 8).attr("y", H - 8).style("font-size", "11px").attr("class", "muted").text("Legend: gray thinking · amber hungry · orange holds one fork · green eating");
      banner.innerHTML = done || L.isDeadlocked(t) ? `<span class="status-bad">DEADLOCK after ${t.steps} steps.</span> Every philosopher is waiting for a fork held by a neighbor: ${t.phil.map((q, i) => `P${i} (${labelOf[q.s]})`).join(", ")}.` : `<span class="small">Steps: ${t.steps} · total meals: ${t.phil.reduce((a, q) => a + q.meals, 0)}</span>`;
    }
    draw();
  });
})();
