/* Module 8: contiguous allocation and paging address translation */
(function () {
  "use strict";
  const { h, panel, select, number, slider, button, svg } = OSUI;
  const L = OSLib;

  OSUI.register("memalloc", (el) => {
    const p = panel(el, "Contiguous allocation: first-fit, best-fit, worst-fit",
      "Memory is 1000 KB. Allocate and free processes and watch free space break into holes. The fragmentation meter compares the largest hole to the total free memory.");
    const START = () => [{ start: 0, size: 100, pid: "OS" }, { start: 100, size: 900, pid: null }];
    const FRAG = () => {
      let b = START(); const spec = [["P1", 120], ["P2", 60], ["P3", 200], ["P4", 80], ["P5", 150], ["P6", 90], ["P7", 100]];
      spec.forEach(([n, sz]) => { b = L.allocate(b, n, sz, "first").blocks; });
      ["P2", "P4", "P6"].forEach((n) => { b = L.release(b, n); });
      return b; // holes of 60, 80, 90 and 100 KB: 330 KB free, largest hole 100 KB
    };
    let blocks = START(), strategy = "first", counter = 0, lastPlaced = null; // lastPlaced: block that "pops" when drawn
    let ops = []; // what the learner did, as short commands (a100 = allocate 100 KB, f3 = free P3, c = compact, x = fragmented example, Sb = best-fit): this is what a shared link replays
    const stratSel = select({ label: "Placement strategy", options: [{ value: "first", label: "First-fit" }, { value: "best", label: "Best-fit" }, { value: "worst", label: "Worst-fit" }], value: strategy, onChange: (v) => { strategy = v; ops.push("S" + v[0]); } });
    const sizeIn = number({ label: "Request size (KB)", min: 1, max: 900, value: 100 });
    const msg = h("p", { "aria-live": "polite" });
    p.controls.append(stratSel.el, sizeIn.el,
      button("Allocate", () => alloc(sizeIn.get())),
      button("Compact memory", () => { blocks = L.compact(blocks); ops.push("c"); lastPlaced = null; msg.textContent = "Compaction moved all processes to the bottom of memory."; draw(); }, true),
      button("Load fragmented example", () => { blocks = FRAG(); counter = 7; ops.push("x"); msg.textContent = "P2, P4 and P6 were freed, leaving several small holes."; draw(); }, true),
      button("Reset", () => { blocks = START(); counter = 0; ops = []; msg.textContent = ""; draw(); }, true));
    const chart = h("div", { class: "chart" }), freeBtns = h("div", { class: "row" }), meter = h("div", { class: "metrics", "aria-live": "polite" });
    p.body.append(chart, meter, h("div", {}, h("strong", { text: "Free a process: " }), freeBtns), msg);

    function alloc(sz) {
      if (!(sz > 0)) return;
      const name = "P" + ++counter;
      const r = L.allocate(blocks, name, sz, strategy);
      if (r.ok) { blocks = r.blocks; lastPlaced = name; ops.push(Number.isInteger(sz) && sz <= 999 ? "a" + sz : "?"); msg.innerHTML = `<span class="status-ok">${name} (${sz} KB) placed.</span>`; }
      else {
        counter--; const f = L.fragmentation(blocks);
        msg.innerHTML = `<span class="status-bad">No single hole can hold ${sz} KB.</span> ${f.free >= sz ? `There are ${f.free} KB free in total, but the largest hole is only ${f.largest} KB. <b>This is external fragmentation.</b> Try compaction.` : "Not enough free memory in total."}`;
      }
      draw();
    }
    function draw() {
      d3.select(chart).selectAll("*").remove();
      const W = 740, H = 120, x = d3.scaleLinear().domain([0, 1000]).range([10, W - 10]);
      const s = svg(chart, W, H, "Memory map: " + blocks.map((b) => `${b.pid || "free"} ${b.size}K`).join(", "));
      const names = [...new Set(blocks.filter((b) => b.pid && b.pid !== "OS").map((b) => b.pid))];
      const g = s.selectAll("g").data(blocks).join("g").attr("class", (d) => (d.pid !== null && d.pid === lastPlaced ? "pop" : null));
      g.append("rect").attr("x", (d) => x(d.start)).attr("y", 20).attr("width", (d) => Math.max(1, x(d.start + d.size) - x(d.start) - 1)).attr("height", 60)
        .style("fill", (d) => (d.pid === null ? "var(--card)" : d.pid === "OS" ? "var(--c8)" : `var(--c${(parseInt(d.pid.slice(1), 10) - 1) % 8 + 1})`))
        .style("stroke", (d) => (d.pid === null ? "var(--muted)" : "var(--bg)")).attr("stroke-dasharray", (d) => (d.pid === null ? "4 3" : null)).attr("stroke-width", 1.5);
      g.append("text").attr("x", (d) => (x(d.start) + x(d.start + d.size)) / 2).attr("y", 48).attr("text-anchor", "middle").style("font-weight", 700).style("font-size", "12px")
        .style("fill", (d) => (d.pid === null ? "var(--muted)" : `var(--on-c${d.pid === "OS" ? 8 : (parseInt(d.pid.slice(1), 10) - 1) % 8 + 1})`)).text((d) => (x(d.start + d.size) - x(d.start) > 34 ? (d.pid || "free") : ""));
      g.append("text").attr("x", (d) => (x(d.start) + x(d.start + d.size)) / 2).attr("y", 65).attr("text-anchor", "middle").style("font-size", "11px")
        .style("fill", (d) => (d.pid === null ? "var(--muted)" : `var(--on-c${d.pid === "OS" ? 8 : (parseInt(d.pid.slice(1), 10) - 1) % 8 + 1})`)).text((d) => (x(d.start + d.size) - x(d.start) > 34 ? d.size + "K" : ""));
      s.append("g").attr("class", "axis").attr("transform", "translate(0,84)").call(d3.axisBottom(x).tickValues(d3.range(0, 1001, 100)).tickFormat((d) => d + "K"));
      const f = L.fragmentation(blocks);
      meter.replaceChildren(...[[f.free + " KB", "total free"], [f.largest + " KB", "largest hole"], [f.holes, "holes"], [`${(f.external * 100).toFixed(0)}%`, "external fragmentation = 1 − largest/free"]]
        .map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      freeBtns.replaceChildren(...(names.length ? names.map((n) => button(`${n} (${blocks.find((b) => b.pid === n).size}K)`, () => { blocks = L.release(blocks, n); ops.push("f" + n.slice(1)); lastPlaced = null; msg.textContent = `${n} freed.`; draw(); }, true)) : [h("span", { class: "small", text: "(none allocated)" })]));
    }
    draw();

    /** Starts from an empty memory and repeats a list of commands (see ops). Commands that cannot apply (a failed allocation) are skipped. */
    function replay(tokens) {
      blocks = START(); counter = 0; lastPlaced = null; ops = []; strategy = "first";
      tokens.forEach((t) => {
        if (t[0] === "a") { const name = "P" + (counter + 1), r = L.allocate(blocks, name, +t.slice(1), strategy); if (r.ok) { counter++; blocks = r.blocks; lastPlaced = name; ops.push(t); } }
        else if (t[0] === "f") { if (blocks.some((b) => b.pid === "P" + t.slice(1))) { blocks = L.release(blocks, "P" + t.slice(1)); lastPlaced = null; ops.push(t); } }
        else if (t === "c") { blocks = L.compact(blocks); lastPlaced = null; ops.push(t); }
        else if (t === "x") { blocks = FRAG(); counter = 7; lastPlaced = null; ops.push(t); }
        else if (t[0] === "S") { strategy = { f: "first", b: "best", w: "worst" }[t[1]]; ops.push(t); }
      });
      stratSel.set(strategy);
      msg.textContent = `Replayed ${ops.length} step${ops.length === 1 ? "" : "s"} from the link.`;
      draw();
    }

    // Shareable link: everything done so far, replayed from an empty memory.
    if (L.share) {
      const S = L.share;
      OSUI.shareable(p, "memalloc", {
        spec: { ops: S.tokens("a[0-9]{1,3}|f[0-9]{1,2}|c|x|S[fbw]", 60) },
        get: () => ({ ops }),
        set: (s) => { if (s.ops) replay(s.ops); }
      });
    }
  });

  OSUI.register("paging", (el) => {
    const p = panel(el, "Paging address translation",
      "A 12-bit logical address space (4096 bytes) and 8192 bytes of physical memory. Pick a page size, edit the page table, and translate any logical address.");
    let pageSize = 256, addr = 1300;
    let table = {};
    const defaultTable = () => { const pages = 4096 / pageSize, frames = 8192 / pageSize; table = {}; for (let i = 0; i < pages; i++) table[i] = (i * 5 + 3) % frames; };
    defaultTable();
    const psSel = select({ label: "Page size", options: [128, 256, 512, 1024].map((v) => ({ value: v, label: v + " B" })), value: pageSize, onChange: (v) => { pageSize = +v; defaultTable(); addr = Math.min(addr, 4095); build(); update(); } });
    const aSl = slider({ label: "Logical address", min: 0, max: 4095, value: addr, onInput: (v) => { addr = v; update(); } });
    const aIn = number({ label: "…or type it", min: 0, max: 4095, value: addr, onInput: (v) => { addr = Math.max(0, Math.min(4095, Math.floor(v))); aSl.set(addr); update(); } });
    p.controls.append(psSel.el, aSl.el, aIn.el, button("Reset page table", () => { defaultTable(); build(); update(); }, true));
    const bits = h("div", {}), out = h("p", { "aria-live": "polite" }), tableHost = h("div", {}), info = h("p", { class: "small" });
    p.body.append(info, bits, out, h("h4", { text: "Page table (blank = invalid / not mapped)" }), tableHost);

    function build() {
      const pages = 4096 / pageSize, frames = 8192 / pageSize;
      info.textContent = `${pages} pages × ${pageSize} B logical; ${frames} frames × ${pageSize} B physical. Offset = ${L.log2(pageSize)} bits, page number = ${12 - L.log2(pageSize)} bits.`;
      tableHost.replaceChildren(h("div", { class: "row", style: "gap:.4rem" }, Array.from({ length: pages }, (_, i) => {
        const inp = h("input", { type: "number", min: 0, max: frames - 1, value: table[i] ?? "", "aria-label": `Frame for page ${i}`,
          oninput: () => { table[i] = inp.value === "" ? null : Math.max(0, Math.min(frames - 1, Math.floor(+inp.value))); update(); } });
        return h("label", { id: `pt-${i}`, class: "small", style: "display:flex;flex-direction:column;border:1px solid var(--border);border-radius:6px;padding:.15rem .3rem" }, `page ${i}`, inp);
      })));
    }
    const bin = (v, n) => v.toString(2).padStart(n, "0");
    function update() {
      aIn.set(addr);
      const off = L.log2(pageSize), pn = 12 - off;
      const t = L.translate(addr, pageSize, table);
      const span = (txt, c) => `<span style="background:var(--${c});color:var(--on-${c});padding:.1rem .35rem;border-radius:4px;font-family:ui-monospace,monospace">${txt}</span>`;
      const b = bin(addr, 12);
      bits.innerHTML = `<p>Logical <b>${addr}</b> = ${span(b.slice(0, pn), "c1")}${span(b.slice(pn), "c6")} <span class="small">(${span("page number", "c1")} ${span("offset", "c6")})</span></p>`;
      document.querySelectorAll("#pt-0, [id^=pt-]").forEach((n) => { n.style.outline = ""; });
      const row = document.getElementById(`pt-${t.page}`); if (row) row.style.outline = "3px solid var(--c1)";
      out.innerHTML = t.valid
        ? `Page <b>${t.page}</b> → frame <b>${t.frame}</b>. Physical = ${t.frame} × ${pageSize} + ${t.offset} = <b>${t.physical}</b> = ${span(bin(t.frame, 13 - off), "c3")}${span(bin(t.offset, off), "c6")}`
        : `<span class="status-bad">Page fault / invalid reference:</span> page ${t.page} has no frame in the page table.`;
    }
    build(); update();

    // Shareable link: the page size, the whole page table and the address being translated.
    if (L.share) {
      const S = L.share;
      OSUI.shareable(p, "paging", {
        spec: { ps: S.oneOf([128, 256, 512, 1024]), table: S.ints(-1, 63, 4, 32), addr: S.int(0, 4095) },
        get: () => ({ ps: pageSize, table: Array.from({ length: 4096 / pageSize }, (_, i) => (table[i] === null || table[i] === undefined ? -1 : table[i])), addr }),
        set: (s) => {
          if (s.ps) { pageSize = +s.ps; psSel.set(String(pageSize)); defaultTable(); }
          const pages = 4096 / pageSize, frames = 8192 / pageSize;
          if (s.table && s.table.length === pages && s.table.every((v) => v < frames)) { table = {}; s.table.forEach((v, i) => { table[i] = v < 0 ? null : v; }); }
          if (s.addr !== undefined) addr = s.addr;
          addr = Math.min(addr, 4095); aSl.set(addr);
          build(); update();
        }
      });
    }
  });
})();
