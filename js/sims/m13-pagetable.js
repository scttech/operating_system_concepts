/* Module 13: multi-level page-table walk with a TLB */
(function () {
  "use strict";
  const { h, fill, panel, select, slider, button, player } = OSUI;
  const L = OSLib;

  const hex = (n, w = 1) => n.toString(16).toUpperCase().padStart(w, "0");
  const humanBytes = (b) => {
    const u = ["bytes", "KiB", "MiB", "GiB", "TiB"]; let i = 0, v = b;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v >= 100 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
  };
  const bin = (n, w) => n.toString(2).padStart(w, "0");

  OSUI.register("ptwalk", (el) => {
    const p = panel(el, "Page-table walk with a TLB",
      "Type a virtual address (in hex) or pick an example, choose a TLB size, and follow the translation one table at a time. Use a sequence of accesses and press Play to watch the TLB fill up, hit and evict.");
    let presetName = "teach16", addrHex = "0012", seqName = "single";
    let run = null, table = null, addrs = [], inputError = "";

    const presetSel = select({ label: "Address layout", options: Object.entries(L.ptPresets).map(([value, v]) => ({ value, label: v.label })), value: presetName, onChange: (v) => { presetName = v; seqName = "single"; addrHex = hex(L.ptPresets[v].examples[0][1]); addrInput.value = addrHex; build(); } });
    const tlbSel = select({ label: "TLB entries", options: [{ value: 0, label: "No TLB" }, { value: 2, label: "2" }, { value: 4, label: "4" }, { value: 8, label: "8" }], value: 4, onChange: () => build() });
    const polSel = select({ label: "TLB replacement", options: [{ value: "LRU", label: "LRU" }, { value: "FIFO", label: "FIFO" }], value: "LRU", onChange: () => build() });
    const memSl = slider({ label: "Memory access", min: 50, max: 200, step: 10, value: 100, format: (v) => `${v} ns`, onInput: () => render() });
    const tlbSl = slider({ label: "TLB lookup", min: 1, max: 10, value: 1, format: (v) => `${v} ns`, onInput: () => render() });
    const addrInput = h("input", { type: "text", value: addrHex, size: 14, autocomplete: "off", spellcheck: "false", "aria-label": "Virtual address in hexadecimal" });
    addrInput.addEventListener("input", () => { addrHex = addrInput.value.replace(/^0x/i, "").trim(); seqName = "single"; seqSel.set("single"); build(); });
    const seqSel = select({ label: "Accesses", options: [], value: "single", onChange: (v) => { seqName = v; build(); } });
    p.controls.append(presetSel.el, h("label", {}, h("span", { text: "Virtual address (hex)" }), addrInput), seqSel.el, tlbSel.el, polSel.el, memSl.el, tlbSl.el);

    const examples = h("div", { class: "row", role: "group", "aria-label": "Example addresses" });
    const msg = h("p", { class: "status-bad", "aria-live": "polite", style: "margin:.25rem 0;min-height:1.2em" });
    const pl = player({ total: () => (run ? run.steps.length : 0), onFrame: () => render(), label: (i, n) => `access ${i} of ${n}` });
    const bits = h("div", { class: "ptbits", "aria-live": "polite" }), walkHost = h("div", {}), metrics = h("div", { class: "metrics", "aria-live": "polite" });
    const tlbHost = h("div", {}), memHost = h("div", {}), tablesHost = h("details", {});
    p.body.append(examples, msg, h("h4", { text: "Watch it run" }), pl.el, bits, walkHost, metrics, h("div", { class: "row", style: "align-items:flex-start;gap:2rem" }, tlbHost, memHost), tablesHost);

    function sequences() {
      const pr = L.ptPresets[presetName], size = 2 ** pr.cfg.offsetBits, maps = L.ptPresetMappings(presetName);
      const code = pr.regions[0], heap = pr.regions[1], stack = pr.regions[pr.regions.length - 1];
      const at = (vpn, off) => vpn * size + (off % size);
      const heapScan = []; for (let k = 0; k < heap.pages; k++) for (const o of [0x10, 0x20, 0x30]) heapScan.push(at(heap.vpn + k, o));
      const loop = []; for (let r = 0; r < 5; r++) loop.push(at(code.vpn, 0x24), at(heap.vpn, 0x24), at(stack.vpn + stack.pages - 1, 0x24));
      const cycle = []; for (let r = 0; r < 3; r++) maps.slice(0, 6).forEach((m) => cycle.push(at(m.vpn, 0x08)));
      const mixed = [...pr.examples.map((e) => e[1]), pr.examples[0][1], pr.examples[1][1]];
      return { heapscan: ["Scan the heap (three accesses per page)", heapScan], loop: ["Tight loop over three pages", loop], cycle: ["Cycle through six pages (is the TLB big enough?)", cycle], mixed: ["Mixed, including unmapped addresses", mixed] };
    }

    function build() {
      const pr = L.ptPresets[presetName];
      table = L.ptPresetTable(presetName);
      const seqs = sequences();
      seqSel.el.querySelector("select").replaceChildren(h("option", { value: "single", text: "Just the address typed here" }), ...Object.entries(seqs).map(([k, v]) => h("option", { value: k, text: v[0] })));
      seqSel.set(seqName in seqs || seqName === "single" ? seqName : "single");
      inputError = "";
      if (seqName === "single") {
        const v = /^[0-9a-f]{1,13}$/i.test(addrHex) ? parseInt(addrHex, 16) : NaN;
        if (Number.isNaN(v)) { inputError = "Type the address as hexadecimal digits, for example 1034."; addrs = []; } else addrs = [v];
      } else addrs = seqs[seqName][1];
      examples.replaceChildren(h("strong", { text: "Try:" }), ...pr.examples.map(([label, a]) => button(`${label}: 0x${hex(a, pr.cfg.vaBits / 4)}`, () => { seqName = "single"; addrHex = hex(a); addrInput.value = addrHex; build(); }, true)));
      run = addrs.length ? L.ptRunSequence(table, addrs, { entries: +tlbSel.get(), policy: polSel.get() }) : { steps: [], hits: 0, misses: 0, faults: 0, totalMemRefs: 0 };
      pl.reset(); render(); drawTables();
    }

    function fieldBits(sp, cfg) {
      const parts = [];
      cfg.levelBits.forEach((b, i) => parts.push({ text: bin(sp.indices[i], b), style: `background:var(--c${(i % 4) + 1});color:var(--on-c${(i % 4) + 1})`, title: `${(cfg.names && cfg.names[i]) || "Level " + (i + 1)} index = ${sp.indices[i]}` }));
      parts.push({ text: bin(sp.offset, cfg.offsetBits), style: "background:var(--c8);color:var(--on-c8)", title: `Offset = ${sp.offset}` });
      return h("div", { class: "ptfields" }, parts.map((q) => h("span", { class: "ptf", style: q.style, title: q.title, text: q.text })));
    }

    function render() {
      const pr = L.ptPresets[presetName], cfg = pr.cfg, k = pl.index, n = run.steps.length, size = 2 ** cfg.offsetBits;
      msg.textContent = inputError;
      if (!n) { fill(bits, h("p", { class: "small", text: "Enter an address to begin." })); fill(walkHost); fill(metrics); fill(tlbHost); fill(memHost); return; }
      const upto = run.steps.slice(0, k), s = k ? run.steps[k - 1] : null;
      const hits = upto.filter((x) => x.tlbHit).length, misses = upto.filter((x) => !x.tlbHit && !x.fault).length, faults = upto.filter((x) => x.fault).length, refs = upto.reduce((a, x) => a + x.memRefs, 0);

      if (!s) { fill(bits, h("p", { class: "small", text: `Press Play or Step to run the ${n} access${n > 1 ? "es" : ""}.` })); fill(walkHost); }
      else {
        const sp = s.split;
        fill(bits, h("p", { style: "margin:.3rem 0" }, h("b", { text: `Access ${k}: virtual address 0x${hex(s.addr, cfg.vaBits / 4)}` }), ` = ${cfg.vaBits} bits split as ${cfg.levelBits.join(" + ")} + ${cfg.offsetBits}`), fieldBits(sp, cfg),
          h("p", { class: "small", style: "margin:.2rem 0" }, `Page number 0x${hex(sp.vpn)} · offset 0x${hex(sp.offset)} (page size ${humanBytes(size)})`));
        const items = [];
        if (!sp.inRange) items.push(h("li", { class: "bad" }, h("b", { text: "Outside the address space." }), ` An address must be below 2^${cfg.vaBits}. The hardware raises a fault.`));
        else {
          if (+tlbSel.get() > 0) items.push(h("li", { class: s.tlbHit ? "good" : "" }, h("b", { text: "TLB lookup: " }), s.tlbHit ? `page 0x${hex(sp.vpn)} is cached, frame 0x${hex(s.frame)}. The table walk is skipped, so only the data access remains (1 memory reference).` : `page 0x${hex(sp.vpn)} is not cached (miss), so the page tables must be walked.`));
          if (!s.tlbHit) {
            s.walk.steps.forEach((st) => {
              const last = st.level === cfg.levelBits.length - 1;
              items.push(h("li", { class: st.present ? "" : "bad" }, h("b", { text: `${st.name}, table #${st.tableId}: ` }), `entry ${st.index} `,
                st.present ? (last ? `holds frame 0x${hex(st.frame)}.` : `points to the next table.`) : "is not present: PAGE FAULT. The page is not mapped here, and everything below it does not exist either."));
            });
          }
          if (!s.fault) items.push(h("li", { class: "good" }, h("b", { text: "Physical address = " }), `frame 0x${hex(s.frame)} × ${size} + offset 0x${hex(sp.offset)} = `, h("b", { text: `0x${hex(s.physical)}` }), ` (${s.memRefs} memory reference${s.memRefs > 1 ? "s" : ""}${s.tlbHit ? "" : `: ${s.walk.steps.length} table read${s.walk.steps.length > 1 ? "s" : ""} + the data access`})`));
          if (s.evicted !== null && s.evicted !== undefined) items.push(h("li", {}, h("b", { text: "TLB: " }), `page 0x${hex(sp.vpn)} was added and page 0x${hex(s.evicted)} was evicted (${polSel.get()}).`));
        }
        fill(walkHost, h("ol", { class: "ptwalk" }, items));
      }

      const translated = hits + misses, ratio = translated ? hits / translated : 0, levels = cfg.levelBits.length;
      const noTlb = levels * +memSl.get() + +memSl.get();
      const eat = +tlbSel.get() > 0 && translated ? L.eatWithTLB({ hit: ratio, tlbNs: +tlbSl.get(), memNs: +memSl.get(), levels }) : null;
      fill(metrics, ...[[hits, "TLB hits"], [misses, "TLB misses (walks)"], [faults, "page faults"], [refs, "memory references so far"],
        [+tlbSel.get() > 0 && translated ? `${Math.round(ratio * 100)}%` : "–", "TLB hit ratio"], [eat === null ? `${noTlb} ns` : `${eat.toFixed(1)} ns`, eat === null ? "access time with no TLB" : "effective access time (measured hit ratio)"]]
        .map(([v, lab]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: lab }))));

      // TLB contents after the current access
      const tlbNow = s ? s.tlb : [];
      fill(tlbHost, h("h4", { style: "margin:.2rem 0", text: `TLB (${tlbSel.get()} entries, ${polSel.get()})` }),
        +tlbSel.get() === 0 ? h("p", { class: "small", text: "There is no TLB: every access walks all the tables." }) :
          h("table", { class: "compact" }, h("thead", {}, h("tr", {}, h("th", { text: "Slot" }), h("th", { text: "Page" }), h("th", { text: "Frame" }))),
            h("tbody", {}, Array.from({ length: +tlbSel.get() }, (_, i) => { const e = tlbNow[i]; return h("tr", { class: e && s && e.vpn === s.split.vpn ? "hl" : "" }, h("td", { text: i + 1 }), h("td", { text: e ? `0x${hex(e.vpn)}` : "empty" }), h("td", { text: e ? `0x${hex(e.frame)}` : "" })); }))),
        h("p", { class: "small", text: `TLB reach: ${tlbSel.get()} × ${humanBytes(size)} = ${humanBytes(L.tlbReach(+tlbSel.get(), size))} of memory covered at once.` }));

      const mem = L.ptMemory(table);
      fill(memHost, h("h4", { style: "margin:.2rem 0", text: "Memory used by the page tables" }),
        h("table", { class: "compact" }, h("thead", {}, h("tr", {}, h("th", { text: "Level" }), h("th", { text: "Tables" }), h("th", { text: "Size" }))),
          h("tbody", {}, mem.perLevel.map((l) => h("tr", {}, h("td", { text: l.name }), h("td", { text: `${l.tables} × ${l.entriesEach} entries` }), h("td", { text: humanBytes(l.bytes) }))),
            h("tr", { style: "font-weight:700" }, h("td", { text: "Total" }), h("td", {}), h("td", { text: humanBytes(mem.total) })))),
        h("p", { class: "small" }, `One flat table covering the whole ${cfg.vaBits}-bit address space would need ${mem.flatEntries.toLocaleString("en-US")} entries × ${cfg.pteBytes} bytes = `, h("b", { text: humanBytes(mem.flatBytes) }), `. The multi-level tables use ${(100 * mem.savedFraction).toFixed(mem.savedFraction > 0.999 ? 4 : 1)}% less, because tables for unused regions are never created.`));
    }

    function drawTables() {
      const cfg = L.ptPresets[presetName].cfg;
      const rows = []; table.levels.forEach((nodes, lvl) => nodes.forEach((node) => {
        const ents = [...node.entries.entries()].sort((a, b) => a[0] - b[0]);
        rows.push(h("li", {}, h("b", { text: `${(cfg.names && cfg.names[lvl]) || "Level " + (lvl + 1)}, table #${node.id}` }), " (only the entries in use): ",
          ents.map(([i, e], j) => `${j ? "; " : ""}[${i}] → ${e.next ? `table #${e.next.id}` : `frame 0x${hex(e.frame)}`}`).join("")));
      }));
      fill(tablesHost, h("summary", { text: `Show the tables that exist (${table.levels.reduce((a, l) => a + l.length, 0)} tables for ${table.mappedPages} mapped pages)` }), h("ul", {}, rows));
    }

    build();
  });
})();
