/* Module 6: race condition lab and bounded buffer */
(function () {
  "use strict";
  const { h, panel, slider, button, ticker, svg } = OSUI;
  const L = OSLib;

  OSUI.register("race", (el) => {
    const p = panel(el, "Race condition lab: two threads, one counter",
      "Each thread runs <code>counter++</code> several times. In machine code that is three steps: <b>LOAD</b> into a register, <b>ADD</b> 1, <b>STORE</b> back. Interleave the threads by hand and see how an update gets lost.");
    let useLock = false, iters = 2, s = L.newRace(iters, useLock);
    const lockCb = h("input", { type: "checkbox", onchange: () => { useLock = lockCb.checked; reset(); } });
    const itSl = slider({ label: "Increments per thread", min: 1, max: 5, value: iters, onInput: (v) => { iters = v; reset(); } });
    p.controls.append(h("label", {}, h("span", { text: "Protection" }), h("span", {}, lockCb, " use a mutex around the increment")), itSl.el);
    const cols = h("div", { class: "row", style: "align-items:flex-start" });
    const counterEl = h("p", { "aria-live": "polite" });
    const verdict = h("p", { "aria-live": "polite" });
    const stats = h("p", { class: "small" });
    const btns = [button("Step thread 1", () => step(0)), button("Step thread 2", () => step(1))];
    // Animated run: a random scheduler picks one runnable thread every tick, so students can watch an interleaving unfold.
    const autoT = ticker(() => {
      const able = [0, 1].filter((t) => L.raceRunnable(s, t));
      if (!able.length) { stopAuto(); return; }
      step(able[Math.floor(Math.random() * able.length)]);
    }, 450);
    const autoBtn = button("▶ Auto-run (random schedule)", () => { if (autoT.running) stopAuto(); else { if (L.raceDone(s, 0) && L.raceDone(s, 1)) reset(); autoT.start(); autoBtn.textContent = "⏸ Pause"; } });
    function stopAuto() { autoT.stop(); autoBtn.textContent = "▶ Auto-run (random schedule)"; }
    p.body.append(h("div", { class: "row" }, btns, autoBtn, button("Run randomly to the end", () => { stopAuto(); L.raceRandomRun(s, Math.random); draw(); }, true), button("Reset", reset, true)),
      counterEl, cols, verdict, h("h4", { text: "How often does it go wrong?" }),
      h("div", { class: "row" }, button("Run 1000 random schedules", trials, true)), stats);

    function step(t) { L.raceStep(s, t); draw(); }
    function reset() { stopAuto(); s = L.newRace(iters, useLock); draw(); }
    function trials() {
      let wrong = 0;
      for (let i = 0; i < 1000; i++) if (L.raceRandomRun(L.newRace(iters, useLock), Math.random) !== 2 * iters) wrong++;
      stats.innerHTML = `With <b>${useLock ? "a mutex" : "no protection"}</b>: ${wrong} of 1000 random schedules produced the wrong answer (expected counter = ${2 * iters}).`;
    }
    function draw() {
      counterEl.innerHTML = `Shared <code>counter</code> = <b style="font-size:1.4rem">${s.counter}</b> ${useLock ? ` &nbsp; mutex: ${s.holder === null ? "free" : "held by thread " + (s.holder + 1)}` : ""}`;
      cols.replaceChildren(...s.threads.map((th, t) => {
        const state = L.raceDone(s, t) ? "finished" : L.raceBlocked(s, t) ? "BLOCKED on mutex" : "ready";
        return h("div", { class: "callout", style: "min-width:210px" }, h("strong", { text: `Thread ${t + 1}` }), h("div", { class: "small", text: `${state} — register = ${th.reg === null ? "?" : th.reg}` }),
          h("ol", { style: "margin:.4rem 0 0; padding-left:1.6rem; font-family:ui-monospace,monospace; font-size:.85rem" },
            th.ops.map((op, i) => h("li", { style: i === th.pc ? "background:var(--accent);color:var(--accent-fg);border-radius:4px;font-weight:700" : (i < th.pc ? "opacity:.45" : ""), text: op }))));
      }));
      btns.forEach((b, t) => { b.disabled = !L.raceRunnable(s, t); b.title = L.raceBlocked(s, t) ? "Blocked: waiting for the mutex" : ""; });
      const finished = L.raceDone(s, 0) && L.raceDone(s, 1);
      verdict.innerHTML = finished ? (s.counter === 2 * iters ? `<span class="status-ok">Correct: ${s.counter} = ${2 * iters}.</span>` : `<span class="status-bad">Wrong: expected ${2 * iters} but got ${s.counter}. ${2 * iters - s.counter} update(s) were lost.</span>`) : "";
    }
    draw();
  });

  OSUI.register("boundedbuffer", (el) => {
    const p = panel(el, "Producer–consumer with semaphores",
      "A producer adds items to a bounded buffer and a consumer removes them. <code>empty</code> counts free slots, <code>full</code> counts filled slots. Change the speeds and watch who blocks.");
    let b = L.newBuffer(6);
    const nSl = slider({ label: "Buffer size N", min: 1, max: 10, value: 6, onInput: (v) => { b = L.newBuffer(v); draw({}); } });
    const pSl = slider({ label: "Producer speed", min: 1, max: 10, value: 7, format: (v) => `${v}/10` });
    const cSl = slider({ label: "Consumer speed", min: 1, max: 10, value: 4, format: (v) => `${v}/10` });
    const msSl = slider({ label: "Tick (ms)", min: 100, max: 800, step: 50, value: 350, onInput: (v) => tk.setMs(v) });
    const tk = ticker(() => { const r = L.bufferTick(b, pSl.get() / 10, cSl.get() / 10, Math.random); draw(r); }, 350);
    const playBtn = button("▶ Run", () => { if (tk.running) { tk.stop(); playBtn.textContent = "▶ Run"; } else { tk.start(); playBtn.textContent = "⏸ Pause"; } });
    p.controls.append(nSl.el, pSl.el, cSl.el, msSl.el, playBtn, button("Single tick", () => draw(L.bufferTick(b, pSl.get() / 10, cSl.get() / 10, Math.random)), true), button("Reset", () => { b = L.newBuffer(nSl.get()); draw({}); }, true));
    const chart = h("div", { class: "chart" });
    const sem = h("div", { class: "metrics", "aria-live": "off" });
    const status = h("p", { "aria-live": "polite" });
    p.body.append(chart, sem, status);

    function draw(r) {
      const W = 720, H = 150, slot = Math.min(60, (W - 220) / b.N);
      d3.select(chart).selectAll("*").remove();
      const s = svg(chart, W, H, `Buffer with ${b.full} of ${b.N} slots filled`);
      const x0 = (W - slot * b.N) / 2;
      s.selectAll("rect.slot").data(b.slots).join("rect").attr("x", (d, i) => x0 + i * slot).attr("y", 50).attr("width", slot - 4).attr("height", 50).attr("rx", 6)
        .style("fill", (d) => (d === null ? "var(--card)" : "var(--c3)")).style("stroke", "var(--border)").attr("stroke-width", 2);
      s.selectAll("text.item").data(b.slots).join("text").attr("x", (d, i) => x0 + i * slot + slot / 2 - 2).attr("y", 81).attr("text-anchor", "middle").style("fill", "var(--on-c3)").style("font-weight", 700).text((d) => (d === null ? "" : d));
      const arrow = (i, label, color) => {
        s.append("text").attr("x", x0 + i * slot + slot / 2 - 2).attr("y", label === "in" ? 40 : 122).attr("text-anchor", "middle").style("fill", color).style("font-weight", 700).style("font-size", "12px").text(label === "in" ? "▼ in" : "▲ out");
      };
      arrow(b.in, "in", "var(--c1)"); arrow(b.out, "out", "var(--c6)");
      s.append("text").attr("x", 8).attr("y", 20).style("fill", "var(--c1t)").style("font-weight", 600).text(`Producer: ${r.prod === "blocked" ? "BLOCKED (wait(empty))" : r.prod === "produced" ? `inserted item ${r.produced}` : "…"}`);
      s.append("text").attr("x", W - 8).attr("y", 20).attr("text-anchor", "end").style("fill", "var(--c6t)").style("font-weight", 600).text(`Consumer: ${r.cons === "blocked" ? "BLOCKED (wait(full))" : r.cons === "consumed" ? `removed item ${r.consumed}` : "…"}`);
      sem.replaceChildren(...[["empty", b.empty], ["full", b.full], ["produced", b.produced], ["consumed", b.consumed], ["producer blocked ticks", b.prodBlocked], ["consumer blocked ticks", b.consBlocked]]
        .map(([k, v]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      status.textContent = r.prod === "blocked" ? "The buffer is full: the producer must wait for the consumer." : r.cons === "blocked" ? "The buffer is empty: the consumer must wait for the producer." : "";
    }
    draw({});
  });
})();
