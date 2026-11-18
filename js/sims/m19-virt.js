/* Module 19: virtualization and containers */
(function () {
  "use strict";
  const { h, panel, select, slider, button, svg } = OSUI;
  const L = OSLib;

  // ---------- layer stacks ----------
  OSUI.register("virtstack", (el) => {
    const p = panel(el, "What runs on what?",
      "Pick a way of running applications and add more of them. The coloured <b>kernel</b> layers matter most: every kernel is a whole operating system to boot, patch and pay memory for. Containers share one; virtual machines each bring their own.");
    let key = "container", units = 3;
    const sel = select({ label: "Approach", options: Object.entries(L.virtStacks).map(([value, s]) => ({ value, label: s.name })), value: key, onChange: (v) => { key = v; draw(); } });
    const sl = slider({ label: "Applications started", min: 1, max: 4, value: units, onInput: (v) => { units = v; draw(); } });
    p.controls.append(sel.el, sl.el);
    const metric = h("div", { class: "metrics", "aria-live": "polite" }), chart = h("div", { class: "chart" }), note = h("p", { class: "small", "aria-live": "polite" });
    p.body.append(metric, chart, note);
    const W = 720, rowH = 38, gap = 4;
    function draw() {
      const s = L.virtStacks[key], k = L.virtKernelCount(key, units);
      metric.replaceChildren(...[[k, k === 1 ? "kernel running" : "kernels running"], [units, units === 1 ? "application" : "applications"], [(k / units).toFixed(2).replace(/\.?0+$/, ""), "kernels per application"]]
        .map(([v, t]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: t }))));
      const rows = 1 + s.base.length + s.unit.length, H = rows * (rowH + gap) + 8;
      d3.select(chart).selectAll("*").remove();
      const g = svg(chart, W, H, `${s.name}: ${k} kernel${k === 1 ? "" : "s"} for ${units} application${units === 1 ? "" : "s"}`);
      let y = H - rowH - 4;
      const box = (x, w, yy, label, cls) => {
        const kernel = cls === "kernel", hw = cls === "hw";
        g.append("rect").attr("x", x).attr("y", yy).attr("width", w).attr("height", rowH).attr("rx", 5).style("fill", kernel ? "var(--c2)" : hw ? "var(--c8)" : cls === "app" ? "var(--c3)" : "var(--c5)").style("stroke", "var(--bg)").attr("stroke-width", 2);
        g.append("text").attr("x", x + w / 2).attr("y", yy + rowH / 2 + 5).attr("text-anchor", "middle").style("font-size", w < 150 ? "11px" : "13px").style("fill", kernel ? "var(--on-c2)" : hw ? "var(--on-c8)" : cls === "app" ? "var(--on-c3)" : "var(--on-c5)").text(w < 120 && label.length > 18 ? label.slice(0, 16) + "…" : label);
      };
      box(8, W - 16, y, "Hardware", "hw"); y -= rowH + gap;
      s.base.forEach((layer) => { box(8, W - 16, y, layer.label, layer.kernel ? "kernel" : "layer"); y -= rowH + gap; });
      const colW = (W - 16 - (units - 1) * 8) / units;
      for (let u = 0; u < units; u++) {
        let yy = y;
        s.unit.forEach((layer) => { box(8 + u * (colW + 8), colW, yy, layer.label, layer.kernel ? "kernel" : layer.label === "Application" ? "app" : "layer"); yy -= rowH + gap; });
      }
      note.textContent = s.note;
    }
    draw();
  });

  // ---------- namespaces ----------
  OSUI.register("nsview", (el) => {
    const p = panel(el, "Namespaces: what can this process see?",
      "A container is an ordinary process that was started with some <b>namespaces</b>. Each namespace gives it a private view of one kind of thing. Tick the namespaces and see what common commands would print <i>inside</i> the process.");
    const flags = {};
    const boxes = L.nsNames.map((n) => {
      const cb = h("input", { type: "checkbox", onchange: () => { flags[n.key] = cb.checked; draw(); } });
      return { n, cb, el: h("label", { class: "check" }, cb, h("span", {}, h("b", { text: ` ${n.label}` }), ` (${n.what})`)) };
    });
    p.controls.append(h("div", { class: "row", style: "flex-wrap:wrap" }, boxes.map((b) => b.el)),
      button("Ordinary process", () => preset(false), true), button("Only PID", () => { preset(false); set("pid", true); }, true), button("Full container", () => preset(true), true));
    const out = h("div", { "aria-live": "polite" });
    p.body.append(out);
    function set(k, v) { flags[k] = v; boxes.find((b) => b.n.key === k).cb.checked = v; draw(); }
    function preset(all) { boxes.forEach((b) => { flags[b.n.key] = all; b.cb.checked = all; }); draw(); }
    function draw() {
      const view = L.nsView(flags), n = view.filter((v) => v.isolated).length;
      const table = h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Command", "What it prints", "Whose view?"].map((t) => h("th", { text: t })))),
        h("tbody", {}, view.map((v) => h("tr", {}, h("td", {}, h("code", { text: v.command })), h("td", {}, h("pre", { style: "margin:0;white-space:pre-wrap", text: v.output })), h("td", { text: v.isolated ? `private (${v.label} namespace)` : "the host's" })))));
      const parts = [h("p", { class: "small", text: n === 0 ? "No private namespaces: this process sees exactly what any program on the host sees." : n === 7 ? "All seven: this is what a container sees. Same kernel, completely different picture." : `${n} of 7 namespaces are private. Everything else still shows the host.` }), table];
      if (flags.pid) {
        const map = L.pidTranslate([4150, 4188]);
        parts.push(h("p", { class: "small" }, "The same two processes have two numbers. The host sees ", h("b", { text: map.map((m) => `${m.host}`).join(" and ") }), "; inside the PID namespace they are ", h("b", { text: map.map((m) => `${m.inside}`).join(" and ") }), ". Process 1 inside is the container's init: if it exits, the kernel ends every other process in that namespace."));
      }
      out.replaceChildren(...parts);
    }
    draw();
  });

  OSUI.register("isolation", (el) => {
    const p = panel(el, "Process, container or virtual machine?", "What each technology isolates. A tick means the answer is yes.");
    const mark = (v) => (v ? "yes" : "no");
    p.body.append(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["What is isolated", "Ordinary process", "Container", "Virtual machine"].map((t) => h("th", { text: t })))),
      h("tbody", {}, L.isolationMatrix.map((r) => h("tr", {}, h("td", { title: r.note, text: r.aspect }), L.isolationTech.map((t) => h("td", { class: r[t] ? "status-ok" : "", text: mark(r[t]) })))))),
      h("details", {}, h("summary", { text: "Why each answer?" }), h("ul", {}, L.isolationMatrix.map((r) => h("li", {}, h("b", { text: r.aspect + ": " }), r.note)))));
  });

  // ---------- control groups ----------
  OSUI.register("cgcpu", (el) => {
    const p = panel(el, "Control groups: sharing the CPU",
      "A <b>weight</b> says how the CPU is shared when groups compete. A <b>cap</b> is a hard ceiling even when the machine is idle. Change the numbers and watch who is held back, and why.");
    let cpus = 4;
    const groups = [{ name: "web", weight: 200, demand: 3, cap: null }, { name: "database", weight: 100, demand: 3, cap: null }, { name: "batch job", weight: 100, demand: 4, cap: 1 }];
    const coresSl = slider({ label: "CPU cores in the machine", min: 1, max: 8, value: cpus, onInput: (v) => { cpus = v; draw(); } });
    p.controls.append(coresSl.el);
    const rows = h("div", {}), table = h("div", {});
    p.body.append(rows, table);
    groups.forEach((g) => {
      const capOut = (v) => (v === 0 ? "none" : `${v / 2} cores`);
      const w = slider({ label: "weight", min: 10, max: 500, step: 10, value: g.weight, onInput: (v) => { g.weight = v; draw(); } });
      const d = slider({ label: "demand (cores)", min: 0, max: 8, step: 0.5, value: g.demand, onInput: (v) => { g.demand = v; draw(); } });
      const c = slider({ label: "cap", min: 0, max: 16, value: g.cap === null ? 0 : g.cap * 2, format: capOut, onInput: (v) => { g.cap = v === 0 ? null : v / 2; draw(); } });
      rows.append(h("fieldset", { class: "controls", style: "border:1px solid var(--border);border-radius:8px;margin:.4rem 0" }, h("legend", { text: g.name }), w.el, d.el, c.el));
    });
    function draw() {
      const r = L.cgAllocate(groups, cpus), W = 720, rowH = 30;
      d3.select(table).selectAll("*").remove();
      const s = svg(table, W, r.length * rowH + 34, `CPU allocation: ${r.map((x) => `${x.name} ${x.alloc.toFixed(2)} of ${x.demand} cores`).join("; ")}`);
      const x = d3.scaleLinear().domain([0, cpus]).range([110, W - 150]);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,20)`).call(d3.axisTop(x).ticks(Math.min(cpus, 8)));
      r.forEach((g, i) => {
        const y = 28 + i * rowH;
        s.append("text").attr("x", 8).attr("y", y + 17).text(g.name);
        s.append("rect").attr("x", x(0)).attr("y", y + 4).attr("width", Math.max(0, x(Math.min(g.demand, cpus)) - x(0))).attr("height", 18).style("fill", "none").style("stroke", "var(--muted)").attr("stroke-dasharray", "4 3");
        s.append("rect").attr("x", x(0)).attr("y", y + 4).attr("width", Math.max(0, x(g.alloc) - x(0))).attr("height", 18).style("fill", g.state === "satisfied" ? "var(--c3)" : g.state === "capped" ? "var(--c6)" : "var(--c2)");
        s.append("text").attr("x", W - 140).attr("y", y + 17).style("font-size", "12px").text(`${g.alloc.toFixed(2)} of ${g.demand} cores${g.state === "capped" ? " (cap)" : g.state === "squeezed" ? " (contention)" : ""}`);
      });
      table.append(h("p", { class: "small", text: "Dashed outline = what the group asked for. Green: fully served. Orange: held back by its cap. Yellow: held back because others also want the CPU. If a group asks for less than its share, the rest goes to the others." }));
    }
    draw();
  });

  OSUI.register("cgmem", (el) => {
    const p = panel(el, "Control groups: a memory limit",
      "A group's processes together may not exceed its memory limit. When they do and nothing can be reclaimed, the kernel kills a process <b>inside that group</b>, largest first. Processes outside the group are untouched, which is why one runaway container cannot take down the host.");
    let limit = 512;
    const procs = [{ name: "database", mib: 300 }, { name: "web server", mib: 120 }, { name: "cache", mib: 150 }];
    const limSl = slider({ label: "Group memory limit", min: 100, max: 1024, step: 10, value: limit, format: (v) => `${v} MiB`, onInput: (v) => { limit = v; draw(); } });
    p.controls.append(limSl.el);
    const rows = h("div", { class: "controls" }), out = h("div", { "aria-live": "polite" });
    procs.forEach((q) => rows.append(slider({ label: q.name, min: 0, max: 600, step: 10, value: q.mib, format: (v) => `${v} MiB`, onInput: (v) => { q.mib = v; draw(); } }).el));
    p.body.append(rows, out);
    function draw() {
      const r = L.oomKill(procs, limit), total = procs.reduce((s, q) => s + q.mib, 0);
      out.replaceChildren(
        h("p", {}, `Together the processes want ${total} MiB; the limit is ${limit} MiB. `, r.killed.length ? h("span", { class: "status-bad", text: `Out of memory: killed ${r.killed.join(", then ")}. ` }) : h("span", { class: "status-ok", text: "Everything fits. " }), `Now using ${r.total} MiB.`),
        h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Process", "Wanted", "Result"].map((t) => h("th", { text: t })))),
          h("tbody", {}, procs.map((q) => h("tr", {}, h("td", { text: q.name }), h("td", { text: `${q.mib} MiB` }), h("td", { class: r.killed.includes(q.name) ? "status-bad" : "status-ok", text: r.killed.includes(q.name) ? "killed (OOM)" : "running" }))))),
        h("p", { class: "small", text: "The real kernel scores processes by memory use and some adjustable settings, so “largest first” is a simplification. Many runtimes also set a softer limit (memory.high) that makes the group slow down and reclaim before it ever reaches the kill." }));
    }
    draw();
  });

  // ---------- VM exits ----------
  OSUI.register("vmexits", (el) => {
    const p = panel(el, "Why do VMs need special I/O? Counting VM exits",
      "Whenever a guest does something only the hypervisor may do, the CPU stops the guest and switches to the hypervisor: a <b>VM exit</b>. It costs thousands of cycles. This counts the exits needed to send packets three ways. <i>The numbers per device are illustrative, but the pattern is real.</i>");
    let packets = 1000, batch = 32, cost = 2000;
    const pk = slider({ label: "Packets sent", min: 1, max: 100000, value: packets, format: (v) => v.toLocaleString(), onInput: (v) => { packets = v; draw(); } });
    const bt = slider({ label: "Virtio batch size", min: 1, max: 256, value: batch, onInput: (v) => { batch = v; draw(); } });
    const cs = slider({ label: "Cost of one exit", min: 500, max: 5000, step: 100, value: cost, format: (v) => `${v.toLocaleString()} cycles`, onInput: (v) => { cost = v; draw(); } });
    p.controls.append(pk.el, bt.el, cs.el);
    const out = h("div", {});
    p.body.append(out);
    function draw() {
      const rows = Object.keys(L.vmModes).map((m) => [m, L.vmExits(packets, batch, m, cost)]), max = Math.max(...rows.map((r) => r[1].exits), 1);
      out.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Way of doing I/O", "VM exits", "Overhead per packet", "Relative number of exits"].map((t) => h("th", { text: t })))),
        h("tbody", {}, rows.map(([m, r]) => h("tr", {}, h("td", { text: L.vmModes[m] }), h("td", { text: r.exits.toLocaleString() }), h("td", { text: `${Math.round(r.perPacket).toLocaleString()} cycles` }),
          h("td", {}, h("div", { style: `height:.9rem;background:var(--c1);border-radius:3px;width:${Math.max(1, Math.round((r.exits / max) * 160))}px`, role: "img", "aria-label": `${r.exits} exits` })))))),
        h("p", { class: "small", text: "Emulated: the guest's driver pokes pretend registers, and each poke exits. Virtio: guest and hypervisor agree on shared queues, so the guest queues many packets and exits once to say “go”. Passthrough (for example SR-IOV): the guest talks to a slice of the real device, and the IOMMU keeps it inside its own memory. That is fastest but ties the VM to the hardware, which makes it harder to move." }));
    }
    draw();
  });
})();
