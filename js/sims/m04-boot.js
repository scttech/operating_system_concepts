/* Module 4: the boot process */
(function () {
  "use strict";
  const { h, panel, select, slider, button, svg, player } = OSUI;
  const L = OSLib;

  const group = (actor) => (/^Hardware|^Firmware/.test(actor) ? "firmware" : /^Boot loader/.test(actor) ? "loader" : /^Kernel/.test(actor) ? "kernel" : "user");
  const GROUPS = { firmware: ["Firmware", "var(--c8)", "var(--on-c8)"], loader: ["Boot loader", "var(--c2)", "var(--on-c2)"], kernel: ["Kernel", "var(--c1)", "var(--on-c1)"], user: ["User space", "var(--c3)", "var(--on-c3)"] };

  // ---------- step-through ----------
  OSUI.register("bootseq", (el) => {
    const p = panel(el, "From power button to login prompt",
      "Each stage loads and trusts the next, getting a little more capable each time. Pick a firmware type, optionally break something, and step through. Notice <b>who is in charge</b> at every moment.");
    let kind = "bios", failure = "none", run = L.bootRun(kind, failure);
    const kindSel = select({ label: "Firmware and disk", options: Object.entries(L.bootStages).map(([value, s]) => ({ value, label: s.name })), value: kind, onChange: (v) => { kind = v; update(); } });
    const failSel = select({ label: "What goes wrong?", options: Object.entries(L.bootFailures).map(([value, f]) => ({ value, label: f.label })), value: failure, onChange: (v) => { failure = v; update(); } });
    p.controls.append(kindSel.el, failSel.el);
    const strip = h("div", { class: "chart" }), info = h("div", { class: "callout", "aria-live": "polite" }), outcome = h("p", { "aria-live": "polite" });
    const pl = player({ total: () => run.steps.length, onFrame: (i) => draw(i), label: (i, n) => `stage ${i} of ${n}` });
    p.body.append(pl.el, strip, info, outcome);
    function update() { run = L.bootRun(kind, failure); pl.reset(); pl.goto(0); }
    function draw(i) {
      const steps = run.steps, n = steps.length, W = 720, rowH = 30, H = n * rowH + 8;
      d3.select(strip).selectAll("*").remove();
      const s = svg(strip, W, H, `Boot stages: ${steps.map((x, k) => `${k + 1} ${x.title}`).join("; ")}`);
      steps.forEach((st, k) => {
        const g = GROUPS[group(st.actor)], y = 4 + k * rowH, shown = k < i, active = k === i - 1;
        s.append("rect").attr("x", 4).attr("y", y).attr("width", W - 8).attr("height", rowH - 4).attr("rx", 5).style("fill", shown ? g[1] : "var(--card)").style("stroke", active ? "var(--fg)" : "var(--border)").attr("stroke-width", active ? 3 : 1).attr("opacity", shown ? 1 : 0.55);
        s.append("text").attr("x", 14).attr("y", y + 18).style("font-size", "13px").style("fill", shown ? g[2] : "var(--fg)").attr("font-weight", active ? 700 : 400).text(`${k + 1}. ${st.title}`);
        s.append("text").attr("x", W - 14).attr("y", y + 18).attr("text-anchor", "end").style("font-size", "12px").style("fill", shown ? g[2] : "var(--muted)").text(st.actor.length > 34 ? st.actor.slice(0, 32) + "…" : st.actor);
      });
      const cur = steps[Math.max(0, i - 1)];
      if (i === 0) info.replaceChildren(h("p", { text: "The machine is off. Press Play or Step to power it on." }));
      else info.replaceChildren(h("p", {}, h("b", { text: cur.title }), ` (${GROUPS[group(cur.actor)][0]})`), h("p", { class: "small" }, h("b", { text: "Running: " }), cur.actor, h("b", { text: "   CPU mode: " }), cur.mode, h("b", { text: "   Code lives in: " }), cur.where), h("p", { text: cur.text }));
      const last = i >= n;
      outcome.replaceChildren(last ? h("span", { class: run.outcome === "booted" ? "status-ok" : run.outcome === "recovery" ? "" : "status-bad", text: (run.outcome === "booted" ? "Booted. " : run.outcome === "recovery" ? "Partly booted. " : "Boot stopped. ") + run.message }) : "");
    }
    update();
  });

  // ---------- master boot record ----------
  OSUI.register("mbrview", (el) => {
    const p = panel(el, "The master boot record: 512 bytes",
      "The first sector of a classic disk. <b>446 bytes</b> of boot code, then <b>four 16-byte partition entries</b>, then the two-byte signature <b>55 AA</b>. Edit a partition and watch the bytes change. Multi-byte numbers are stored <em>least significant byte first</em> (little-endian).");
    const typeOpts = Object.entries(L.MBR_TYPES).filter(([k]) => +k !== 0).map(([k, v]) => ({ value: String(k), label: `0x${(+k).toString(16).padStart(2, "0")} ${v}` }));
    const parts = [{ active: true, type: 0x83, start: 2048, sectors: 1048576 }, { active: false, type: 0x82, start: 1050624, sectors: 2097152 }, { active: false, type: 0, start: 0, sectors: 0 }, { active: false, type: 0, start: 0, sectors: 0 }];
    let signatureOk = true;
    const rows = h("div", {});
    parts.forEach((q, i) => {
      const used = h("input", { type: "checkbox", checked: q.type !== 0, onchange: () => { if (used.checked && q.type === 0) { q.type = 0x83; q.start = i ? 4194304 : 2048; q.sectors = 204800; } if (!used.checked) q.type = 0; draw(); sync(); } });
      const typ = select({ label: `Type`, options: typeOpts, value: String(q.type || 0x83), onChange: (v) => { q.type = +v; used.checked = true; draw(); } });
      const act = h("input", { type: "checkbox", checked: q.active, onchange: () => { q.active = act.checked; draw(); } });
      const start = h("input", { type: "number", min: 0, max: 4294967295, value: q.start, "aria-label": `Partition ${i + 1} start sector`, oninput: () => { if (start.value !== "") { q.start = Math.min(4294967295, Math.max(0, Math.floor(+start.value))); draw(); } } });
      const size = h("input", { type: "number", min: 0, max: 2097151, value: Math.floor(q.sectors / 2048), "aria-label": `Partition ${i + 1} size in MiB`, oninput: () => { if (size.value !== "") { q.sectors = Math.min(4294967295, Math.max(0, Math.floor(+size.value) * 2048)); draw(); } } });
      function sync() { start.value = q.start; size.value = Math.floor(q.sectors / 2048); typ.set(String(q.type || 0x83)); act.checked = q.active; }
      rows.append(h("fieldset", { class: "controls", style: "border:1px solid var(--border);border-radius:8px;margin:.3rem 0" }, h("legend", { text: `Partition ${i + 1}` }),
        h("label", {}, h("span", { text: "In use" }), used), typ.el, h("label", {}, h("span", { text: "Bootable (active)" }), act), h("label", {}, h("span", { text: "Start (sector number, LBA)" }), start), h("label", {}, h("span", { text: "Size (MiB)" }), size)));
    });
    const sigCb = h("input", { type: "checkbox", onchange: () => { signatureOk = !sigCb.checked; draw(); } });
    const dump = h("div", { class: "chart code-scroll" }), decoded = h("pre", { "aria-live": "polite", style: "white-space:pre-wrap" }), verdict = h("p", { "aria-live": "polite" });
    p.body.append(rows, h("label", { class: "small" }, sigCb, " damage the signature (last byte becomes 00)"), h("h4", { text: "The bytes" }), dump, verdict, h("h4", { text: "What a program reads from them" }), decoded);
    const hx = (n) => n.toString(16).toUpperCase().padStart(2, "0");
    function draw() {
      let b;
      try { b = L.mbrBuild(parts.map((q) => ({ ...q }))); } catch (e) { verdict.textContent = e.message; return; }
      parts.forEach((q, i) => { if (q.type === 0) b.fill(0, 446 + 16 * i, 462 + 16 * i); });   // an unused entry is all zeros
      if (!signatureOk) b[511] = 0;
      const span = (text, color, title) => h("span", { style: `background:${color};color:var(--fg);border-radius:3px;padding:0 2px`, title }, text);
      const col = { boot: "color-mix(in srgb, var(--c8) 20%, transparent)", state: "color-mix(in srgb, var(--c2) 28%, transparent)", chs: "color-mix(in srgb, var(--c8) 20%, transparent)", type: "color-mix(in srgb, var(--c6) 28%, transparent)", lba: "color-mix(in srgb, var(--c1) 28%, transparent)", len: "color-mix(in srgb, var(--c3) 28%, transparent)", sig: "color-mix(in srgb, var(--c4) 30%, transparent)" };
      const bytes = (from, to) => Array.from(b.slice(from, to), hx);
      const lines = [h("div", {}, h("span", { class: "small", text: "0000  " }), span(bytes(0, 8).join(" ") + " … (446 bytes of boot code, shown as zeros here)", col.boot, "boot code")), h("div", {}, " ")];
      for (let i = 0; i < 4; i++) {
        const o = 446 + 16 * i;
        lines.push(h("div", { style: "white-space:nowrap" }, h("span", { class: "small", text: `${o.toString(16).toUpperCase().padStart(4, "0")}  ` }),
          span(bytes(o, o + 1).join(" "), col.state, "80 = bootable, 00 = not"), " ", span(bytes(o + 1, o + 4).join(" "), col.chs, "old CHS start address"), " ", span(bytes(o + 4, o + 5).join(" "), col.type, "partition type"), " ",
          span(bytes(o + 5, o + 8).join(" "), col.chs, "old CHS end address"), " ", span(bytes(o + 8, o + 12).join(" "), col.lba, "start sector, little-endian"), " ", span(bytes(o + 12, o + 16).join(" "), col.len, "size in sectors, little-endian")));
      }
      lines.push(h("div", {}, h("span", { class: "small", text: "01FE  " }), span(bytes(510, 512).join(" "), col.sig, "boot signature")));
      dump.replaceChildren(h("pre", { style: "margin:0;overflow:visible" }, ...lines), h("p", { class: "small" }, "Colors: ", span("state", col.state), " ", span("old CHS", col.chs), " ", span("type", col.type), " ", span("start (LBA)", col.lba), " ", span("size (sectors)", col.len), " ", span("signature", col.sig)));
      const m = L.mbrParse(b);
      decoded.textContent = L.mbrLines(m).join("\n");
      verdict.replaceChildren(m.valid ? h("span", { class: "status-ok", text: "The BIOS would accept this sector and run its boot code." }) : h("span", { class: "status-bad", text: "The last two bytes are not 55 AA: the BIOS skips this disk (“No bootable device”)." }),
        m.valid && !m.partitions.some((q) => q.active) ? h("span", { text: " No partition is marked active, so a generic boot-code stub would have nothing to load." }) : "");
    }
    draw();
  });

  // ---------- service start order ----------
  OSUI.register("initorder", (el) => {
    const p = panel(el, "Starting services in the right order",
      "An init system such as systemd starts each service as soon as everything it depends on has finished, so independent services start <b>together</b>. Change a duration and see which one decides the total boot time.");
    const base = [{ name: "local-fs", dur: 2, after: [] }, { name: "network", dur: 3, after: ["local-fs"] }, { name: "logging", dur: 1, after: ["local-fs"] }, { name: "database", dur: 4, after: ["network", "logging"] }, { name: "web", dur: 2, after: ["database", "network"] }, { name: "cron", dur: 1, after: ["logging"] }, { name: "ssh", dur: 1, after: ["network"] }];
    const units = base.map((u) => ({ ...u, after: u.after.slice() }));
    let cycle = false;
    base.forEach((u, i) => p.controls.append(slider({ label: `${u.name} takes`, min: 1, max: 9, value: u.dur, onInput: (v) => { units[i].dur = v; draw(); } }).el));
    const cb = h("input", { type: "checkbox", onchange: () => { cycle = cb.checked; draw(); } });
    p.controls.append(h("label", {}, h("span", { text: "Mistake" }), h("span", {}, cb, " make the network wait for the web server")));
    const metrics = h("div", { class: "metrics", "aria-live": "polite" }), chart = h("div", { class: "chart" }), note = h("p", { "aria-live": "polite" });
    p.body.append(metrics, note, chart);
    function draw() {
      const us = units.map((u) => ({ ...u, after: u.name === "network" && cycle ? [...u.after, "web"] : u.after.slice() }));
      const r = L.bootOrder(us);
      d3.select(chart).selectAll("*").remove();
      if (r.cycle) {
        metrics.replaceChildren(h("div", { class: "metric" }, h("b", { text: "never" }), h("span", { text: "boot completes" })));
        note.replaceChildren(h("span", { class: "status-bad", text: `Dependency cycle: ${r.cycle.join(", ")} each wait for something that is waiting for them. A real init system detects this and breaks the loop by dropping a job, usually leaving a service down.` }));
        return;
      }
      metrics.replaceChildren(...[[r.total, "time until all services are up"], [r.serial, "time if one at a time"], [(r.serial / r.total).toFixed(1) + "×", "speed-up from starting in parallel"]].map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));
      note.replaceChildren(h("span", {}, "Critical path (the chain that decides the total): ", h("b", { text: r.critical.join(" → ") }), ". Making any service on it faster speeds up boot; speeding up one off it changes nothing."));
      const W = 720, rowH = 26, m = { l: 80, r: 14, t: 26 }, H = m.t + r.schedule.length * rowH + 6;
      const s = svg(chart, W, H, `Start schedule: ${r.schedule.map((x) => `${x.name} from ${x.start} to ${x.end}`).join("; ")}`);
      const x = d3.scaleLinear().domain([0, r.total]).range([m.l, W - m.r]);
      s.append("g").attr("class", "axis").attr("transform", `translate(0,${m.t - 6})`).call(d3.axisTop(x).ticks(Math.min(r.total, 20)));
      r.schedule.forEach((u, i) => {
        const y = m.t + i * rowH, crit = r.critical.includes(u.name);
        s.append("text").attr("x", 6).attr("y", y + 16).style("font-size", "12px").text(u.name);
        s.append("rect").attr("x", x(u.start)).attr("y", y + 3).attr("width", x(u.end) - x(u.start)).attr("height", 18).attr("rx", 3).style("fill", crit ? "var(--c6)" : "var(--c1)").append("title").text(`${u.name}: ${u.start} to ${u.end}`);
        s.append("text").attr("x", x(u.start) + 4).attr("y", y + 16).style("font-size", "11px").style("fill", crit ? "var(--on-c6)" : "var(--on-c1)").text(u.dur > 1 ? `${u.dur}` : "");
      });
    }
    draw();
  });

  // ---------- chain of trust ----------
  OSUI.register("trustchain", (el) => {
    const p = panel(el, "Secure Boot: a chain of trust",
      "Each link verifies the next before running it. Tick a component to pretend an attacker modified it, and see where the chain breaks. Everything <i>after</i> the break is untrusted, even if it is unchanged.");
    const tampered = new Set();
    const list = h("div", {}), out = h("p", { "aria-live": "polite" });
    L.bootChain.forEach((c) => {
      if (c.signedBy === null) return;
      p.controls.append(h("label", {}, h("span", { text: "Tamper with" }), h("span", {}, h("input", { type: "checkbox", onchange: (e) => { if (e.target.checked) tampered.add(c.name); else tampered.delete(c.name); draw(); } }), ` ${c.name}`)));
    });
    p.body.append(list, out);
    function draw() {
      const r = L.verifyChain(tampered);
      list.replaceChildren(h("ol", { style: "padding-left:1.4rem" }, L.bootChain.map((c) => {
        const ok = r.verified.includes(c.name), refused = r.refused.includes(c.name);
        return h("li", { style: refused ? "color:var(--bad)" : ok ? "" : "", class: refused ? "" : "" }, h("b", { text: c.name }), refused ? (c.name === r.failedAt ? " — signature check FAILS: not run" : " — never reached") : " — verified and run", h("div", { class: "small", style: "color:var(--muted)", text: c.role }));
      })));
      out.replaceChildren(r.failedAt ? h("span", { class: "status-bad", text: `The chain breaks at “${r.failedAt}”. The machine halts or refuses to continue, rather than running modified code.` }) : h("span", { class: "status-ok", text: "Every link verified: the system boots." }));
    }
    draw();
  });
})();
