/* Module 17: storage reliability. RAID, rebuild risk, SSD write amplification and journaling. */
(function () {
  "use strict";
  const { h, panel, select, slider, button, svg } = OSUI;
  const L = OSLib;

  // ---------- RAID ----------
  OSUI.register("raid", (el) => {
    const p = panel(el, "RAID: what survives, and what it costs",
      "Several disks act as one. Choose a level and a number of disks, then <b>click disks to fail them</b> and see whether the data survives. Capacity and the cost of a small write come from the level, not the disks.");
    let level = "5", n = 5, size = 8, failed = new Set();
    const lvSel = select({ label: "RAID level", options: Object.entries(L.raidLevels).map(([value, v]) => ({ value, label: v.name })), value: level, onChange: (v) => { level = v; failed.clear(); draw(); } });
    const nSl = slider({ label: "Disks", min: 2, max: 10, value: n, onInput: (v) => { n = v; failed.clear(); draw(); } });
    const sSl = slider({ label: "Size of each disk", min: 1, max: 20, value: size, format: (v) => `${v} TB`, onInput: (v) => { size = v; draw(); } });
    p.controls.append(lvSel.el, nSl.el, sSl.el, button("Replace all failed disks", () => { failed.clear(); draw(); }, true));
    const metrics = h("div", { class: "metrics", "aria-live": "polite" }), disks = h("div", { class: "row", role: "group", "aria-label": "Disks. Press one to fail or repair it." }), verdict = h("p", { "aria-live": "polite", style: "font-weight:700" }), note = h("p", { class: "small" });
    p.body.append(metrics, disks, verdict, note);
    function draw() {
      const i = L.raidInfo(level, n, size);
      metrics.replaceChildren(...[[i.valid ? `${i.usable} TB` : "n/a", "usable of " + n * size + " TB"], [i.valid ? `${Math.round(i.efficiency * 100)}%` : "n/a", "usable share"], [i.valid ? i.guaranteed : "n/a", "failures always survived"], [i.valid ? i.bestCase : "n/a", "failures survived at best"], [i.valid ? i.smallWriteIOs : "n/a", "disk operations per small write"]]
        .map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      disks.replaceChildren(...Array.from({ length: n }, (_, d) => {
        const bad = failed.has(d);
        return h("button", { type: "button", class: "btn " + (bad ? "" : "secondary"), "aria-pressed": String(bad), style: bad ? "background:var(--bad);color:var(--on-bad);border-color:var(--bad)" : "", "aria-label": `Disk ${d + 1}${level === "10" ? `, mirror pair ${Math.floor(d / 2) + 1}` : ""}: ${bad ? "failed. Press to replace" : "working. Press to fail"}`, text: `Disk ${d + 1}${bad ? " ✕" : ""}${level === "10" ? ` (pair ${Math.floor(d / 2) + 1})` : ""}`,
          onclick: () => { if (failed.has(d)) failed.delete(d); else failed.add(d); draw(); } });
      }));
      if (!i.valid) { verdict.replaceChildren(h("span", { class: "status-bad", text: i.note })); note.textContent = ""; return; }
      const ok = L.raidSurvives(level, n, [...failed]);
      verdict.replaceChildren(failed.size === 0 ? h("span", { class: "status-ok", text: "All disks working." }) : ok ? h("span", { class: "status-ok", text: `${failed.size} failed, data safe${failed.size > 0 && level !== "0" ? " (running degraded: a spare disk should be rebuilt now)" : ""}.` }) : h("span", { class: "status-bad", text: `${failed.size} failed: DATA LOST.` }));
      note.textContent = { "0": "No redundancy at all: a failure of any one disk loses everything. Used for speed.", "1": "Every disk holds a full copy, so any single working disk keeps all the data. Costly in capacity.",
        "5": "One disk's worth of space holds parity. Any one disk can fail; a second failure loses everything. A small write must read the old data and old parity and write both: 4 operations.",
        "6": "Two parity blocks per stripe. Any two disks can fail. A small write costs 6 operations.", "10": "Disks are mirrored in pairs, and the pairs are striped. Survives one failure for sure, and more if they fall in different pairs. Fast and simple, at half the capacity." }[level];
    }
    draw();
  });

  OSUI.register("raidparity", (el) => {
    const p = panel(el, "Parity: how one extra disk can replace any lost one",
      "The parity block is the <b>XOR</b> of the data blocks: each bit is 1 if an odd number of the data bits are 1. Change the data, pick a disk to lose, and rebuild it from what remains.");
    const vals = [12, 200, 77, 143];
    const inputs = vals.map((v, i) => h("input", { type: "number", min: 0, max: 255, value: v, "aria-label": `Data on disk ${i + 1} (0 to 255)`, oninput: () => { if (inputs[i].value !== "") { vals[i] = Math.min(255, Math.max(0, Math.floor(+inputs[i].value))); draw(); } } }));
    let lost = 2;
    const lostSel = select({ label: "Which data disk fails?", options: vals.map((_, i) => ({ value: String(i), label: `Disk ${i + 1}` })), value: String(lost), onChange: (v) => { lost = +v; draw(); } });
    p.controls.append(...inputs.map((inp, i) => h("label", {}, h("span", { text: `Disk ${i + 1} (0–255)` }), inp)), lostSel.el);
    const out = h("div", { "aria-live": "polite" });
    p.body.append(out);
    const bin = (x) => x.toString(2).padStart(8, "0");
    function draw() {
      const blocks = vals.map((v) => Uint8Array.of(v)), parity = L.xorBlocks(blocks)[0], survivors = blocks.filter((_, i) => i !== lost), rebuilt = L.rebuildBlock(survivors, Uint8Array.of(parity))[0];
      const row = (label, v, cls) => h("tr", { class: cls || "" }, h("td", { text: label }), h("td", { text: v }), h("td", {}, h("code", { text: bin(v) })));
      out.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Disk", "Value", "Bits"].map((t) => h("th", { text: t })))),
        h("tbody", {}, vals.map((v, i) => row(`Disk ${i + 1}${i === lost ? " (FAILED)" : ""}`, v, i === lost ? "status-bad" : "")), row("Parity disk", parity), row(`Rebuilt disk ${lost + 1}`, rebuilt, "status-ok"))),
        h("p", { class: rebuilt === vals[lost] ? "status-ok" : "status-bad", text: `XOR of the parity and the three surviving disks is ${rebuilt}, which ${rebuilt === vals[lost] ? "equals" : "does not equal"} what disk ${lost + 1} held (${vals[lost]}).` }),
        h("p", { class: "small", text: "It works because x XOR x = 0: XOR-ing everything, including the parity, gives zero, so the missing value is the XOR of all the others. With two disks missing there is one equation and two unknowns, so RAID 5 cannot recover. RAID 6 adds a second, different parity to solve for two." }));
    }
    draw();
  });

  OSUI.register("raidrisk", (el) => {
    const p = panel(el, "Rebuilding is the dangerous time",
      "After a disk fails, the array reads the surviving disks <b>completely</b> to rebuild the spare. Drives occasionally cannot read a sector (an <i>unrecoverable read error</i>). Without remaining redundancy, one such error during the rebuild loses data. Figures are probabilities from the drive's specified error rate: illustrative, not a prediction for your disks.");
    let size = 8, n = 6, ure = 1e14;
    const sSl = slider({ label: "Disk size", min: 1, max: 30, value: size, format: (v) => `${v} TB`, onInput: (v) => { size = v; draw(); } });
    const nSl = slider({ label: "Disks in the array", min: 4, max: 12, value: n, format: (v) => `${v}`, onInput: (v) => { n = v; draw(); } });
    const uSel = select({ label: "Drive's error rate", options: [{ value: "1e14", label: "1 error per 10^14 bits (typical consumer drive)" }, { value: "1e15", label: "1 error per 10^15 bits (typical enterprise drive)" }], value: "1e14", onChange: (v) => { ure = +v; draw(); } });
    p.controls.append(sSl.el, nSl.el, uSel.el);
    const out = h("div", { "aria-live": "polite" });
    p.body.append(out);
    function draw() {
      const rows = [["1", 2], ["5", n], ["6", n], ["10", n % 2 ? n - 1 : n]].map(([lv, nn]) => ({ lv, nn, i: L.raidInfo(lv, nn, size), r: L.rebuildRisk(lv, nn, size, ure) }));
      out.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Level", "Disks", "Data read to rebuild", "Chance of losing data during the rebuild"].map((t) => h("th", { text: t })))),
        h("tbody", {}, rows.map(({ lv, nn, r }) => h("tr", {}, h("td", { text: L.raidLevels[lv].name }), h("td", { text: nn }), h("td", { text: `${(r.bitsRead / 8e12).toFixed(0)} TB` }),
          h("td", { class: r.covered ? "status-ok" : r.probability > 0.2 ? "status-bad" : "", text: r.covered ? `about 0 (a read error can still be corrected; raw chance ${(r.rawProbability * 100).toFixed(0)}%)` : `${(r.probability * 100).toFixed(1)}%` }))))),
        h("p", { class: "small", text: "This is why large RAID 5 arrays of big consumer disks are considered risky, and why RAID 6, mirrors with three copies, and checksummed file systems are preferred. RAID also does not protect against deleting a file, a bug, ransomware or a fire: that is what backups are for." }));
    }
    draw();
  });

  // ---------- SSD ----------
  OSUI.register("ssdwear", (el) => {
    const p = panel(el, "Why a flash drive writes more than you asked it to",
      "Flash can only be erased in whole <b>blocks</b>, and a page can only be written once between erases. Overwriting data therefore writes a <i>new</i> page and leaves the old one stale. When space runs low, the drive copies the still-valid pages out of a block and erases it. Those extra copies are <b>write amplification</b>, and each erase wears the flash.");
    let op = 0.07, fill = 0.9, pattern = "random", separate = true;
    const opSl = slider({ label: "Hidden spare space (over-provisioning)", min: 3, max: 40, value: Math.round(op * 100), format: (v) => `${v}%`, onInput: (v) => { op = v / 100; draw(); } });
    const fSl = slider({ label: "How full the drive is", min: 20, max: 100, value: Math.round(fill * 100), format: (v) => `${v}%`, onInput: (v) => { fill = v / 100; draw(); } });
    const pSel = select({ label: "Writes", options: [{ value: "random", label: "Random overwrites" }, { value: "sequential", label: "Sequential (like a log or a video)" }, { value: "hotcold", label: "Hot and cold (80% of writes hit 20% of the data)" }], value: pattern, onChange: (v) => { pattern = v; draw(); } });
    const cb = h("input", { type: "checkbox", checked: true, onchange: () => { separate = cb.checked; draw(); } });
    p.controls.append(opSl.el, fSl.el, pSel.el, h("label", {}, h("span", { text: "Drive feature" }), h("span", {}, cb, " keep frequently and rarely changed data in separate blocks")));
    const metrics = h("div", { class: "metrics", "aria-live": "polite" }), chart = h("div", { class: "chart" }), cmp = h("div", {}), warn = h("p", { class: "status-bad", "aria-live": "polite" });
    p.body.append(warn, metrics, h("h4", { text: "Erases per block (wear)" }), chart, h("h4", { text: "The same workload with more or less spare space" }), cmp);
    function run(o) { return L.ssdSimulate(Object.assign({ overProvision: op, fill, pattern, separate, writes: 20000, seed: 7 }, o)); }
    function draw() {
      let r;
      try { r = run({}); warn.textContent = ""; } catch (e) { warn.textContent = "That much data does not fit with so little spare space: the drive needs a few blocks of spare room to work at all. Lower the fill or raise the spare space."; metrics.replaceChildren(); chart.replaceChildren(); cmp.replaceChildren(); return; }
      const mean = r.erasesTotal / r.erases.length;
      metrics.replaceChildren(...[[r.hostWrites.toLocaleString(), "pages the host wrote"], [r.flashWrites.toLocaleString(), "pages the flash wrote"], [r.wa.toFixed(2) + "×", "write amplification"], [mean.toFixed(0), "average erases per block"], [`${r.minErase}–${r.maxErase}`, "fewest–most erases"]].map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      d3.select(chart).selectAll("*").remove();
      const W = 720, H = 140, m = { l: 36, r: 8, t: 8, b: 22 }, s = svg(chart, W, H, `Erase counts of the ${r.erases.length} blocks, from ${r.minErase} to ${r.maxErase}`);
      const x = d3.scaleBand().domain(r.erases.map((_, i) => i)).range([m.l, W - m.r]).padding(0.15), y = d3.scaleLinear().domain([0, Math.max(1, r.maxErase)]).range([H - m.b, m.t]);
      s.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4));
      s.selectAll("rect").data(r.erases).join("rect").attr("x", (d, i) => x(i)).attr("y", (d) => y(d)).attr("width", x.bandwidth()).attr("height", (d) => H - m.b - y(d)).style("fill", "var(--c1)").append("title").text((d, i) => `block ${i}: ${d} erases`);
      s.append("text").attr("x", W / 2).attr("y", H - 4).attr("text-anchor", "middle").style("font-size", "11px").text("each bar is one block");
      const rows = [0.07, 0.12, 0.28].map((o2) => { try { return [o2, run({ overProvision: o2 })]; } catch (e) { return [o2, null]; } });
      cmp.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Hidden spare space", "Write amplification", "Average erases per block"].map((t) => h("th", { text: t })))),
        h("tbody", {}, rows.map(([o2, rr]) => h("tr", { style: Math.abs(o2 - op) < 0.005 ? "font-weight:700" : "" }, h("td", { text: `${Math.round(o2 * 100)}%` }), h("td", { text: rr ? rr.wa.toFixed(2) + "×" : "does not fit" }), h("td", { text: rr ? (rr.erasesTotal / rr.erases.length).toFixed(0) : "" }))))),
        h("p", { class: "small", text: "More spare space means garbage collection finds emptier blocks to clean, so it copies fewer pages. A drive that is nearly full, handling random writes, amplifies the most. The operating system helps by telling the drive which blocks are free (TRIM), which turns stale-looking space back into spare space." }));
    }
    draw();
  });

  // ---------- journaling ----------
  OSUI.register("journal", (el) => {
    const p = panel(el, "Crash in the middle of an update",
      "Appending to a file needs three separate writes: the <b>free-space bitmap</b>, the file's <b>inode</b> and the <b>data block</b>. The power can fail between any two. Choose how the file system is protected, slide the crash point, and see what is left on disk.");
    let mode = "none", order = "metadata-first", crash = 1;
    const modeSel = select({ label: "File system", options: Object.entries(L.journalModes).map(([value, label]) => ({ value, label })), value: mode, onChange: (v) => { mode = v; crash = Math.min(crash, L.journalSteps(mode, order).steps.length); crSl.set(crash); sync(); draw(); } });
    const orderSel = select({ label: "Order of the in-place writes (no journal)", options: [{ value: "metadata-first", label: "bitmap, inode, data" }, { value: "data-first", label: "data, bitmap, inode" }, { value: "inode-first", label: "inode, data, bitmap" }], value: order, onChange: (v) => { order = v; draw(); } });
    const crSl = slider({ label: "Crash after this many steps", min: 0, max: 3, value: crash, onInput: (v) => { crash = v; draw(); } });
    p.controls.append(modeSel.el, orderSel.el, crSl.el);
    const steps = h("ol", {}), disk = h("div", { class: "row", style: "align-items:flex-start" }), verdict = h("p", { "aria-live": "polite", style: "font-weight:700" }), recovery = h("p", { "aria-live": "polite" }), all = h("div", {});
    p.body.append(h("h4", { text: "The steps of the append" }), steps, h("div", { class: "row" }, h("div", {}, h("h4", { text: "On disk at the crash" }), disk)), verdict, recovery, h("h4", { text: "Every possible crash point" }), all);
    function sync() {
      const max = L.journalSteps(mode, order).steps.length;
      const input = crSl.el.querySelector("input"); input.max = max; crSl.set(Math.min(crash, max));
      orderSel.el.style.display = mode === "none" ? "" : "none";
    }
    const box = (name, on) => h("div", { class: "callout", style: "min-width:8.5rem" }, h("strong", { text: name }), h("div", { class: on ? "status-ok" : "small", text: on ? "updated" : "old" }));
    function draw() {
      sync();
      const r = L.journalCrash(mode, order, crash);
      steps.replaceChildren(...r.steps.map((s, i) => h("li", { style: i < crash ? "" : "color:var(--muted)" }, `${i < crash ? "✓ " : "✗ "}${s.text}`, r.steps[i].id === "commit" ? h("b", { text: "  ← the commit point" }) : null)));
      disk.replaceChildren(box("Free-space bitmap", r.atCrash.bitmap), box("File's inode", r.atCrash.inode), box("Data block", r.atCrash.data));
      const bad = r.beforeRecovery;
      const word = (x) => (x.consistent ? (x.state === "old" ? "consistent, as before the append" : "consistent, with the append complete") : x.severe ? "CORRUPT" : "inconsistent (a leaked block)");
      verdict.replaceChildren(...[h("span", { class: bad.consistent ? "status-ok" : "status-bad", text: `At the crash: ${word(bad)}.` }), " ", mode === "none" ? null : h("span", { class: r.consistent ? "status-ok" : "status-bad", text: `After recovery: ${word(r)}.` })].filter(Boolean));
      recovery.replaceChildren(h("span", { text: r.recovery + " " }), ...(mode === "none" ? r.problems : []).map((q) => h("div", { class: q.severe ? "status-bad" : "", text: q.text })));
      all.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Crash after", "Result" + (mode === "none" ? "" : " after recovery")].map((t) => h("th", { text: t })))),
        h("tbody", {}, r.steps.concat([null]).map((_, k) => { const q = L.journalCrash(mode, order, k); return h("tr", { style: k === crash ? "font-weight:700" : "" }, h("td", { text: k === 0 ? "nothing written" : `step ${k}` }), h("td", { class: q.consistent ? "" : q.severe ? "status-bad" : "", text: q.consistent ? (q.state === "old" ? "old state: the append is lost, nothing is damaged" : "new state: the append is complete") : q.severe ? "CORRUPT: " + q.problems.map((x) => x.kind).join(" and ") : "inconsistent: leaked block" })); }))),
        h("p", { class: "small", text: mode === "none" ? "Without a journal, the file system must scan everything at the next start (fsck) to find and repair damage, and some damage cannot be repaired. The order of the writes decides how bad a crash can be: writing the data first never makes a file point at garbage." : "With a journal, the new state is written to the log first and made official by a single commit record. A crash before it means nothing happened; a crash after it means the update is replayed. The disk always ends up all-old or all-new." }));
    }
    sync(); draw();
  });
})();
