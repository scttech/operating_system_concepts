/* Module 15: monitors, condition variables and readers-writers */
(function () {
  "use strict";
  const { h, panel, select, button, svg, player } = OSUI;
  const L = OSLib;

  // ---------- read-write lock timeline ----------
  OSUI.register("rwsim", (el) => {
    const p = panel(el, "Readers and writers sharing one lock",
      "<b>R</b> requests only read, so any number of them may overlap. <b>W</b> requests change the data and need the lock alone. Light bars are time spent <em>waiting</em>; solid bars are time holding the lock. Change the policy and look at who waits.");
    let preset = "stream", policy = "reader", reqs = L.rwPresets[preset].requests, cur = null;
    const presetSel = select({ label: "Workload", options: [...Object.entries(L.rwPresets).map(([value, x]) => ({ value, label: x.label })), { value: "random", label: "Random workload" }], value: preset,
      onChange: (v) => { preset = v; reqs = v === "random" ? randomReqs() : L.rwPresets[v].requests; update(); } });
    const polSel = select({ label: "Policy", options: Object.entries(L.rwPolicies).map(([value, label]) => ({ value, label })), value: policy, onChange: (v) => { policy = v; update(); } });
    p.controls.append(presetSel.el, polSel.el, button("New random workload", () => { preset = "random"; presetSel.set("random"); reqs = randomReqs(); update(); }, true));
    const metrics = h("div", { class: "metrics", "aria-live": "polite" }), verdict = h("p", { "aria-live": "polite" }), chart = h("div", { class: "chart" }), cmp = h("div", {});
    const pl = player({ total: () => (cur ? cur.end : 0), onFrame: (t) => paint(t), label: (i, n) => `time ${i} of ${n}` });
    p.body.append(metrics, verdict, pl.el, chart, h("h4", { text: "The same workload under every policy" }), cmp);

    function randomReqs() {
      const n = 8 + Math.floor(Math.random() * 5);
      return Array.from({ length: n }, (_, i) => ({ id: `${i % 4 === 3 ? "W" : "R"}${i + 1}`, kind: i % 4 === 3 || Math.random() < 0.15 ? "W" : "R", arrive: Math.floor(Math.random() * 14), dur: 1 + Math.floor(Math.random() * 4) }))
        .map((r, i) => ({ ...r, id: `${r.kind}${i + 1}` }));
    }
    let clip = null, x = null;
    const W = 720, rowH = 24, m = { l: 48, r: 14, t: 28, b: 6 };
    function update() {
      const r = cur = L.rwSimulate(reqs, policy);
      metrics.replaceChildren(...[[r.maxReaderWait, "longest reader wait"], [r.maxWriterWait, "longest writer wait"], [r.meanWait.toFixed(1), "mean wait"], [r.end, "all done at"]]
        .map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      const w = r.worst, ratio = w.wait / w.dur;
      verdict.replaceChildren(ratio >= 4 ? h("span", { class: "status-bad", text: `${w.id} waited ${w.wait} ticks for a job that needs only ${w.dur}: that is starvation in practice. ` }) : h("span", { class: "status-ok", text: "Nobody waited disproportionately long. " }),
        h("span", { class: "small", text: ` Worst wait relative to length: ${w.id} (${w.wait} waited, ${w.dur} needed).` }));
      const H = m.t + m.b + rows(r) * rowH;
      d3.select(chart).selectAll("*").remove();
      const s = svg(chart, W, H, `Timeline under ${L.rwPolicies[policy]}: ${r.rows.map((q) => `${q.id} waits ${q.wait}`).join(", ")}`);
      x = d3.scaleLinear().domain([0, r.end]).range([m.l, W - m.r]);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${m.t - 6})`).call(d3.axisTop(x).ticks(Math.min(r.end, 20)));
      const id = "rwclip-" + Math.random().toString(36).slice(2, 7);
      clip = s.append("defs").append("clipPath").attr("id", id).append("rect").attr("x", 0).attr("y", 0).attr("height", H).attr("width", x(r.end) + 4);
      const g = s.append("g").attr("clip-path", `url(#${id})`);
      r.rows.forEach((q, i) => {
        const y = m.t + i * rowH;
        s.append("text").attr("x", 6).attr("y", y + 15).style("font-size", "12px").text(q.id);
        g.append("rect").attr("x", x(q.arrive)).attr("y", y + 3).attr("width", Math.max(0, x(q.start) - x(q.arrive))).attr("height", 16).style("fill", "var(--code-bg)").style("stroke", "var(--muted)").attr("stroke-dasharray", "3 2").append("title").text(`${q.id} waits from ${q.arrive} to ${q.start}`);
        g.append("rect").attr("x", x(q.start)).attr("y", y + 3).attr("width", x(q.end) - x(q.start)).attr("height", 16).attr("rx", 3).style("fill", q.kind === "R" ? "var(--c3)" : "var(--c6)").append("title").text(`${q.id} holds the lock from ${q.start} to ${q.end}`);
        g.append("text").attr("x", x(q.start) + 4).attr("y", y + 15).style("font-size", "11px").style("fill", q.kind === "R" ? "var(--on-c3)" : "var(--on-c6)").text(q.kind === "R" ? "read" : "write");
      });
      const all = Object.keys(L.rwPolicies).map((k) => [k, L.rwSimulate(reqs, k)]);
      cmp.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Policy", "Longest reader wait", "Longest writer wait", "Mean wait", "Worst relative wait"].map((t) => h("th", { text: t })))),
        h("tbody", {}, all.map(([k, a]) => h("tr", { style: k === policy ? "font-weight:700" : "" }, h("td", { text: L.rwPolicies[k] }), h("td", { text: a.maxReaderWait }), h("td", { text: a.maxWriterWait }), h("td", { text: a.meanWait.toFixed(1) }), h("td", { text: `${a.worst.id}: ${a.worst.wait} for ${a.worst.dur}` }))))),
        h("p", { class: "small", text: "Reader preference maximizes sharing but can starve a writer. Writer preference keeps data fresh but can starve readers. First come, first served is fair, and a little slower for the readers who could have slipped in." }));
      pl.reset(); paint(pl.index);
    }
    const rows = (r) => r.rows.length;
    function paint(t) { if (clip) clip.attr("width", x(Math.min(t, cur.end)) - 0 + (t >= cur.end ? 4 : 0)); }
    update();
  });

  // ---------- Mesa monitor ----------
  OSUI.register("mesa", (el) => {
    const p = panel(el, "Why a condition variable needs a while loop",
      "Consumers C1 and C2 take items from a buffer; producer P1 adds one. A <b>signal</b> only makes the sleeper <em>ready</em>: it must win the lock back first. Step through the same interleaving with an <code>if</code> and with a <code>while</code>.");
    let mode = "if", s = L.monitorNew(mode, 2, 1), at = 0;
    const modeSel = select({ label: "How the consumer waits", options: [{ value: "if", label: "if (empty) wait()" }, { value: "while", label: "while (empty) wait()" }], value: mode, onChange: (v) => { mode = v; reset(); } });
    p.controls.append(modeSel.el);
    const state = h("div", { class: "row", style: "align-items:flex-start", "aria-live": "polite" }), logEl = h("ol", { class: "small", style: "padding-left:1.4rem;margin:.4rem 0", "aria-live": "polite" }), verdict = h("p", { "aria-live": "polite" }), stats = h("p", { class: "small" });
    const stepBtn = button("Step ▶", step);
    p.body.append(h("div", { class: "row" }, stepBtn, button("Run all steps", () => { while (at < L.monitorScript.length) step(); }, true), button("Reset", reset, true)), state, verdict, h("h4", { text: "What happened" }), logEl,
      h("h4", { text: "Is it just this one interleaving?" }), h("div", { class: "row" }, button("Run 3000 random interleavings of each", trials, true)), stats);
    function reset() { s = L.monitorNew(mode, 2, 1); at = 0; draw(); }
    function step() {
      if (at >= L.monitorScript.length) return;
      const name = L.monitorScript[at++], r = L.monitorStep(s, name);
      if (!r.ran) s.log.push(`${name}: cannot run (${thread(name).status === "waiting" ? "it is asleep on the condition variable" : "it is finished or the lock is held"}), so the scheduler moves on.`);
      draw();
    }
    const thread = (n) => s.threads.find((t) => t.name === n);
    function draw() {
      const card = (t) => h("div", { class: "callout", style: "min-width:150px" }, h("strong", { text: t.name }), h("div", { class: "small", text: `${t.status}${t.status === "ready" || t.status === "waiting" ? ", next: " + t.pc : ""}` }), t.bug ? h("div", { class: "status-bad small", text: "took from an empty buffer!" }) : null);
      state.replaceChildren(h("div", { class: "callout", style: "min-width:210px" }, h("strong", { text: "Shared state" }), h("div", { class: "small", text: `items in buffer: ${s.count}` }), h("div", { class: "small", text: `lock held by: ${s.holder || "nobody"}` }), h("div", { class: "small", text: `asleep on condition: ${s.cond.join(", ") || "nobody"}` })), s.threads.map(card));
      logEl.replaceChildren(...s.log.map((l) => h("li", { text: l })));
      stepBtn.disabled = at >= L.monitorScript.length;
      verdict.replaceChildren(s.errors.length ? h("span", { class: "status-bad", text: s.errors[0] + ". " }) : at >= L.monitorScript.length ? h("span", { class: "status-ok", text: "No error: the consumer re-checked, saw the buffer was empty again, and went back to sleep. " }) : "",
        at >= L.monitorScript.length && s.errors.length ? h("span", { text: "The signal was a hint that the condition might be true, not a promise that it still is." }) : "");
    }
    function trials() {
      let bad = { if: 0, while: 0 };
      for (const m of ["if", "while"]) for (let i = 0; i < 3000; i++) if (L.monitorRandom(m, 3, 2, Math.random).errors.length) bad[m]++;
      stats.textContent = `With "if": ${bad.if} of 3000 random schedules took from an empty buffer. With "while": ${bad.while} of 3000.`;
    }
    draw();
  });
})();
