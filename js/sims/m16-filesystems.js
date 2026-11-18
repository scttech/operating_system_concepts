/* Module 16: file allocation methods and inode capacity */
(function () {
  "use strict";
  const { h, panel, select, slider, svg } = OSUI;
  const L = OSLib;

  const human = (b) => { const u = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]; let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; } return `${b.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${u[i]}`; };

  OSUI.register("alloc", (el) => {
    const p = panel(el, "File allocation methods",
      "A 48-block disk holds a file. See where each method places the blocks and which disk blocks must be read to reach block <i>k</i> of the file (outlined in orange).");
    const lenSl = slider({ label: "File length (blocks)", min: 2, max: 12, value: 7, onInput: draw });
    const kSl = slider({ label: "Read file block k", min: 0, max: 11, value: 5, onInput: draw });
    p.controls.append(lenSl.el, kSl.el);
    const host = h("div", { class: "row", style: "align-items:flex-start" }), table = h("div", {});
    p.body.append(host, table);

    // Deterministic scattered layout so the picture is stable between redraws
    const scatter = [5, 17, 9, 31, 22, 40, 13, 27, 36, 24, 38, 7];   // free blocks used when a method scatters the file
    const taken = new Set([0, 1, 2, 3, 18, 19, 28, 29, 30, 44, 45, 46]); // blocks belonging to other files
    function layouts(len) {
      const contiguous = Array.from({ length: len }, (_, i) => 6 + i); // free run 4..17
      const chain = scatter.slice(0, len);
      return { contiguous, linked: chain, indexed: chain.slice().reverse(), fat: chain.slice(), index: 23 };
    }

    function draw() {
      const len = lenSl.get(), kIn = Math.min(kSl.get(), len - 1);
      kSl.el.querySelector("input").max = len - 1;
      const lay = layouts(len);
      const methods = [
        { key: "contiguous", title: "Contiguous", blocks: lay.contiguous, reads: lay.contiguous.slice(kIn, kIn + 1), note: "Directory stores start + length. Block k is at start + k: 1 read." },
        { key: "linked", title: "Linked list", blocks: lay.linked, reads: lay.linked.slice(0, kIn + 1), note: "Each block stores a pointer to the next. To reach block k you read k + 1 blocks." },
        { key: "indexed", title: "Indexed (index block)", blocks: lay.indexed, reads: [lay.index, lay.indexed[kIn]], extra: [lay.index], note: "An index block lists all data blocks. Read the index, then block k: 2 reads." },
        { key: "fat", title: "FAT (table in memory)", blocks: lay.fat, reads: lay.fat.slice(kIn, kIn + 1), note: "Chain pointers live in an in-memory table, so following them is fast. Only the data block is read from disk." }
      ];
      host.replaceChildren(...methods.map((m) => {
        const box = h("div", { style: "min-width:230px" }, h("strong", { text: m.title, style: "display:block;margin-bottom:.25rem" }));
        const cell = 30, cols = 8, W = cols * cell + 4, H = 6 * cell + 4;
        const s = svg(box, W, H, `${m.title} allocation on a 48-block disk`);
        s.selectAll("g").data(d3.range(48)).join("g").each(function (b) {
          const g = d3.select(this), x = (b % cols) * cell + 2, y = Math.floor(b / cols) * cell + 2;
          const idx = m.blocks.indexOf(b), isIndex = m.extra && m.extra.includes(b), other = taken.has(b) && idx < 0 && !isIndex;
          g.append("rect").attr("x", x).attr("y", y).attr("width", cell - 2).attr("height", cell - 2).attr("rx", 3)
            .style("fill", idx >= 0 ? "var(--c1)" : isIndex ? "var(--c4)" : other ? "var(--c8)" : "var(--card)").attr("opacity", other ? 0.45 : 1)
            .style("stroke", m.reads.includes(b) ? "var(--c6)" : "var(--border)").attr("stroke-width", m.reads.includes(b) ? 3.5 : 1);
          g.append("text").attr("x", x + (cell - 2) / 2).attr("y", y + 19).attr("text-anchor", "middle").style("font-size", "10px").style("fill", idx >= 0 ? "var(--on-c1)" : isIndex ? "var(--on-c4)" : "var(--muted)").text(idx >= 0 ? idx : isIndex ? "idx" : b);
        });
        box.append(h("p", { class: "small", style: "max-width:240px", text: m.note }));
        return box;
      }));
      host.append(h("p", { class: "small", style: "flex-basis:100%", html: "Legend: <b style='color:var(--c1t)'>blue</b> = file block (label = block number within the file); <b style='color:var(--c4t)'>pink</b> = index block; gray = other files; white = free (label = disk block number)." }));
      const readsOf = (key) => methods.find((m) => m.key === key).reads.length; // same blocks that are outlined in the pictures
      table.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Method", `Disk reads to reach block ${kIn}`, "Random access", "Fragmentation / growth"].map((t) => h("th", { text: t })))),
        h("tbody", {},
          [["Contiguous", "contiguous", "excellent", "external fragmentation; hard to grow"],
            ["Linked", "linked", "poor", "no external fragmentation; pointer overhead"],
            ["Indexed", "indexed", "good", "no external fragmentation; index block overhead"],
            ["FAT", "fat", "good (table cached)", "table must fit in memory"]]
            .map(([n, k, ra, fr]) => h("tr", {}, h("td", { text: n }), h("td", { text: readsOf(k) }), h("td", { text: ra }), h("td", { text: fr }))))));
    }
    draw();
  });

  OSUI.register("inode", (el) => {
    const p = panel(el, "Inode capacity calculator",
      "A classic Unix-style inode holds some <b>direct</b> block pointers plus single-, double- and triple-<b>indirect</b> pointers. How big can a file get?");
    const bs = select({ label: "Block size", options: [1024, 2048, 4096, 8192].map((v) => ({ value: v, label: human(v) })), value: 4096, onChange: draw });
    const ps = select({ label: "Pointer size", options: [{ value: 4, label: "4 bytes" }, { value: 8, label: "8 bytes" }], value: 4, onChange: draw });
    const dSl = slider({ label: "Direct pointers", min: 0, max: 15, value: 12, onInput: draw });
    const boxes = ["single", "double", "triple"].map((k, i) => { const cb = h("input", { type: "checkbox", checked: i < 2, onchange: draw }); return { k, cb, el: h("label", { style: "flex-direction:row;align-items:center;gap:.4rem" }, cb, `${k} indirect`) }; });
    p.controls.append(bs.el, ps.el, dSl.el, ...boxes.map((b) => b.el));
    const metrics = h("div", { class: "metrics", "aria-live": "polite" }), tableHost = h("div", {}), chart = h("div", { class: "chart" });
    p.body.append(metrics, tableHost, chart);

    function draw() {
      const B = +bs.get(), P = +ps.get(), D = dSl.get(), k = Math.floor(B / P);
      const on = Object.fromEntries(boxes.map((b) => [b.k, b.cb.checked]));
      // A higher level of indirection requires the lower ones in a real inode; enforce for clarity
      if (on.triple && !on.double) { boxes[1].cb.checked = true; on.double = true; }
      if (on.double && !on.single) { boxes[0].cb.checked = true; on.single = true; }
      const parts = [
        { name: "Direct", blocks: D }, { name: "Single indirect", blocks: on.single ? k : 0 },
        { name: "Double indirect", blocks: on.double ? k * k : 0 }, { name: "Triple indirect", blocks: on.triple ? k ** 3 : 0 }
      ];
      const total = L.maxFileSize({ blockSize: B, ptrSize: P, direct: D, single: +on.single, double: +on.double, triple: +on.triple });
      metrics.replaceChildren(...[[k.toLocaleString(), "pointers per indirect block"], [human(total), "maximum file size"]].map(([v, kk]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: kk }))));
      tableHost.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Level", "Data blocks addressed", "Capacity", "Disk reads to reach a block (inode in memory)"].map((t) => h("th", { text: t })))),
        h("tbody", {}, parts.map((q, i) => h("tr", {}, h("td", { text: q.name }), h("td", { text: q.blocks.toLocaleString() }), h("td", { text: human(q.blocks * B) }), h("td", { text: q.blocks ? i + 1 : "—" }))))));
      const W = 720, H = 150, m = { l: 150, r: 20, t: 10, b: 30 };
      d3.select(chart).selectAll("*").remove();
      const s = svg(chart, W, H, "Capacity contributed by each level on a log scale");
      const shown = parts.filter((q) => q.blocks > 0);
      const x = d3.scaleLog().domain([B, Math.max(total, B * 10)]).range([m.l, W - m.r]);
      const y = d3.scaleBand().domain(shown.map((q) => q.name)).range([m.t, H - m.b]).padding(0.25);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6, "~s").tickFormat((d) => human(d)));
      s.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).tickSize(0));
      s.selectAll("rect").data(shown).join("rect").attr("x", m.l).attr("y", (d) => y(d.name)).attr("height", y.bandwidth()).attr("width", (d) => Math.max(1, x(Math.max(d.blocks * B, B)) - m.l)).style("fill", (d, i) => `var(--c${i + 1})`);
    }
    draw();
  });
})();
