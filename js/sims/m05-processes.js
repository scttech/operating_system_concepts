/* Module 5: process state machine and fork tree */
(function () {
  "use strict";
  const { h, panel, slider, button, svg } = OSUI;
  const L = OSLib;

  const STATES = {
    new: { x: 70, y: 70, label: "New" }, ready: { x: 290, y: 70, label: "Ready" },
    running: { x: 510, y: 70, label: "Running" }, waiting: { x: 400, y: 200, label: "Waiting (blocked)" },
    terminated: { x: 650, y: 200, label: "Terminated" }
  };
  const TRANSITIONS = [
    { from: "new", to: "ready", label: "admit" },
    { from: "ready", to: "running", label: "dispatch" },
    { from: "running", to: "ready", label: "timeout / preempt" },
    { from: "running", to: "waiting", label: "I/O or event wait" },
    { from: "waiting", to: "ready", label: "I/O or event done" },
    { from: "running", to: "terminated", label: "exit" }
  ];

  OSUI.register("procstates", (el) => {
    const p = panel(el, "Process state diagram",
      "Create processes, then use the buttons to move them along legal transitions. The single CPU can run only one process at a time.");
    let procs = [], nextId = 1;
    const chart = h("div", { class: "chart" });
    const table = h("div", {});
    const log = h("div", { class: "log", role: "log", "aria-live": "polite" });
    let lastMoved = null;
    const create = () => { if (procs.length < 8) { procs.push({ id: nextId++, state: "new" }); lastMoved = nextId - 1; say(`P${nextId - 1} created (New).`); draw(); } };
    // Auto-play: the system makes plausible random choices so students can just watch processes flow through the states.
    const auto = OSUI.ticker(() => {
      const live = procs.filter((q) => q.state !== "terminated");
      if (live.length < 3 && procs.length < 8) { create(); return; }
      const moves = [];
      live.forEach((q) => TRANSITIONS.filter((t) => t.from === q.state && !(t.to === "running" && running())).forEach((t) => moves.push({ q, t, w: t.to === "terminated" ? 0.35 : 1 })));
      if (!moves.length) { stopAuto(); return; }
      let r = Math.random() * moves.reduce((a, m) => a + m.w, 0);
      const pick = moves.find((m) => (r -= m.w) < 0) || moves[0];
      move(pick.q, pick.t.to, pick.t.label);
    }, 900);
    const autoBtn = button("▶ Auto-play", () => { if (auto.running) stopAuto(); else { auto.start(); autoBtn.textContent = "⏸ Pause"; } });
    function stopAuto() { auto.stop(); autoBtn.textContent = "▶ Auto-play"; }
    p.controls.append(button("+ New process", create), autoBtn,
      button("Reset", () => { stopAuto(); procs = []; nextId = 1; lastMoved = null; log.replaceChildren(); draw(); }, true));
    p.body.append(chart, table, log);
    const W = 760, H = 270;
    const s = svg(chart, W, H, "Process state diagram");
    s.append("defs").append("marker").attr("id", "arr").attr("viewBox", "0 0 10 10").attr("refX", 9).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse")
      .append("path").attr("d", "M0,0 L10,5 L0,10 z").style("fill", "var(--muted)");
    const g = s.append("g");
    function say(msg) { log.prepend(h("div", { text: msg })); }
    const running = () => procs.find((q) => q.state === "running");

    function move(proc, to, label) {
      if (to === "running" && running()) return;
      say(`P${proc.id}: ${proc.state} → ${to}  (${label})`); proc.state = to; lastMoved = proc.id; draw();
    }
    function draw() {
      g.selectAll("*").remove();
      TRANSITIONS.forEach((t) => {
        const a = STATES[t.from], b = STATES[t.to];
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        const off = t.from === "running" && t.to === "ready" ? 14 : (t.from === "ready" && t.to === "running" ? -14 : 0);
        const nx = (-dy / len) * off, ny = (dx / len) * off;
        const x1 = a.x + (dx / len) * 52 + nx, y1 = a.y + (dy / len) * 30 + ny, x2 = b.x - (dx / len) * 52 + nx, y2 = b.y - (dy / len) * 30 + ny;
        g.append("line").attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2).style("stroke", "var(--muted)").attr("stroke-width", 1.5).attr("marker-end", "url(#arr)");
        g.append("text").attr("x", (x1 + x2) / 2 + (off < 0 ? -2 : 0)).attr("y", (y1 + y2) / 2 + (off > 0 ? 16 : -6)).attr("text-anchor", "middle").style("font-size", "11px").attr("class", "muted").text(t.label);
      });
      Object.entries(STATES).forEach(([k, st]) => {
        const here = procs.filter((q) => q.state === k);
        g.append("rect").attr("x", st.x - 52).attr("y", st.y - 30).attr("width", 104).attr("height", 60).attr("rx", 10)
          .style("fill", "var(--card)").style("stroke", k === "running" && here.length ? "var(--accent)" : "var(--border)").attr("stroke-width", 2);
        g.append("text").attr("x", st.x).attr("y", st.y - 36).attr("text-anchor", "middle").style("font-size", "12px").style("font-weight", 600).text(st.label);
        here.forEach((q, i) => {
          const cx = st.x - 36 + (i % 4) * 24, cy = st.y - 8 + Math.floor(i / 4) * 24;
          g.append("circle").attr("class", q.id === lastMoved ? "pop" : null).attr("cx", cx).attr("cy", cy).attr("r", 10).style("fill", `var(--c${(q.id - 1) % 8 + 1})`);
          g.append("text").attr("x", cx).attr("y", cy + 4).attr("text-anchor", "middle").style("font-size", "10px").style("fill", `var(--on-c${(q.id - 1) % 8 + 1})`).style("font-weight", 700).text(q.id);
        });
      });
      table.replaceChildren(procs.length ? h("table", { class: "compact" },
        h("thead", {}, h("tr", {}, h("th", { text: "Process" }), h("th", { text: "State" }), h("th", { text: "Actions" }))),
        h("tbody", {}, procs.map((q) => h("tr", {}, h("td", { text: `P${q.id}` }), h("td", { text: STATES[q.state].label }),
          h("td", {}, TRANSITIONS.filter((t) => t.from === q.state).map((t) => {
            const b = button(t.label + " → " + STATES[t.to].label, () => move(q, t.to, t.label), true);
            if (t.to === "running" && running()) { b.disabled = true; b.title = "CPU is busy"; }
            return b;
          }), q.state === "terminated" ? h("span", { class: "small", text: "done" }) : null))))) : h("p", { class: "small", text: "No processes yet. Click “New process”." }));
    }
    draw();
  });

  OSUI.register("forktree", (el) => {
    const p = panel(el, "How many processes does fork() create?",
      "A program calls <code>fork()</code> <em>n</em> times in a row, unconditionally. The original process is the root; each node is a process.");
    const out = h("p", { "aria-live": "polite" });
    const chart = h("div", { class: "chart" });
    const sl = slider({ label: "Number of fork() calls (n)", min: 0, max: 5, value: 3, onInput: () => { pl.reset(); draw(); } });
    const pl = OSUI.player({ total: () => sl.get(), onFrame: () => draw(), label: (i, n) => `fork() call ${i} of ${n}` });
    const live = h("p", { "aria-live": "polite", style: "margin:.25rem 0" });
    p.controls.append(sl.el); p.body.append(out, pl.el, live, chart);
    function draw() {
      const n = sl.get(), tree = L.forkTree(n), k = pl.index; // k = fork() calls executed so far
      out.innerHTML = `<b>2<sup>${n}</sup> = ${L.forkCount(n)}</b> processes in total (${L.forkCount(n) - 1} new children plus the original).`;
      live.innerHTML = k === 0 ? "Before any fork(): just the original process." : `After fork() call #${k}: <b>${L.forkCount(k)}</b> processes. Every process that exists runs the next fork() too, so the count doubles.`;
      const root = d3.hierarchy(tree);
      const leaves = root.leaves().length;
      const W = Math.max(500, leaves * 34), H = 70 + n * 70;
      d3.select(chart).selectAll("*").remove();
      const s = svg(chart, W, H, `Process tree after ${n} forks`);
      d3.tree().size([W - 50, H - 70])(root);
      const g = s.append("g").attr("transform", "translate(25,30)");
      g.selectAll("path").data(root.links()).join("path").attr("fill", "none").style("stroke", "var(--muted)").attr("opacity", (d) => (d.target.data.step <= k ? 1 : 0.08))
        .attr("d", d3.linkVertical().x((d) => d.x).y((d) => d.y));
      const node = g.selectAll("g.n").data(root.descendants()).join("g").attr("class", (d) => (d.data.step === k && k > 0 ? "n pop" : "n")).attr("opacity", (d) => (d.data.step <= k ? 1 : 0.1))
        .attr("transform", (d) => `translate(${d.x},${d.y})`);
      node.append("circle").attr("r", 11).style("fill", (d) => (d.depth === 0 ? "var(--accent)" : "var(--c3)"));
      node.append("text").attr("text-anchor", "middle").attr("dy", 4).style("font-size", "10px").style("fill", (d) => (d.depth === 0 ? "var(--accent-fg)" : "var(--on-c3)")).style("font-weight", 700).text((d) => d.data.id);
    }
    draw();

    // Shareable link (see js/lib/share.js).
    if (L.share) {
      const S = L.share;
      OSUI.shareControls(p, "forktree", { n: { ctl: sl } }, () => { pl.reset(); draw(); });
    }
  });
})();
