/* Module 12: operating-system family tree and compare tool */
(function () {
  "use strict";
  const { h, panel, select, button, svg } = OSUI;
  const D = OSData;
  const byId = Object.fromEntries(D.osList.map((o) => [o.id, o]));
  const MAX = 5;
  const reveal = (node, opts) => { if (node && node.scrollIntoView) node.scrollIntoView(opts); }; // not available in every environment

  // ---------- Family tree ----------
  OSUI.register("oslineage", (el) => {
    const p = panel(el, "Family tree of operating systems",
      "Where did each system come from? Lines show what was inherited or reused; dashed lines show influence rather than shared code. Click or press Enter on any system for details.");
    const chart = h("div", { class: "chart" }), info = h("div", { class: "callout", "aria-live": "polite" }, h("p", { text: "Select a system on the timeline." }));
    p.body.append(chart, info);
    const lanes = D.osLanes, nodes = D.osTree.nodes, byNode = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const W = 1000, laneH = 84, m = { l: 150, r: 40, t: 30, b: 8 }, H = m.t + m.b + lanes.length * laneH;
    const s = svg(chart, W, H, "Timeline of operating-system lineages from 1966 to 2021").attr("role", "group"); // not "img": it contains focusable nodes
    const x = d3.scaleLinear().domain([1965, 2023]).range([m.l, W - m.r]);
    const y = (lane) => m.t + lane * laneH + laneH / 2;
    s.append("g").attr("class", "axis").attr("transform", `translate(0,${m.t - 6})`).call(d3.axisTop(x).tickValues(d3.range(1970, 2021, 10)).tickFormat(d3.format("d")));
    s.selectAll("line.gridv").data(d3.range(1970, 2021, 10)).join("line").attr("class", "gridline").attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", m.t - 6).attr("y2", H - m.b);
    lanes.forEach((name, i) => {
      s.append("line").attr("class", "gridline").attr("x1", m.l - 10).attr("x2", W - m.r).attr("y1", y(i)).attr("y2", y(i)).attr("stroke-dasharray", "2 4");
      s.append("text").attr("x", m.l - 16).attr("y", y(i) + 4).attr("text-anchor", "end").style("font-size", "12px").style("font-weight", 600).style("fill", `var(--c${(i % 8) + 1}t)`).text(name);
    });
    const pos = (n) => ({ x: x(n.year), y: y(n.lane) });
    const link = d3.linkHorizontal().x((d) => d.x).y((d) => d.y);
    const edgeSel = s.append("g").selectAll("path").data(D.osTree.edges).join("path").attr("fill", "none").style("stroke", "var(--muted)").attr("stroke-width", 1.8).attr("opacity", 0.6)
      .attr("stroke-dasharray", (e) => (e[3] ? "5 4" : null)).attr("d", (e) => link({ source: pos(byNode[e[0]]), target: pos(byNode[e[1]]) }));
    edgeSel.append("title").text((e) => `${byNode[e[0]].label} → ${byNode[e[1]].label}: ${e[2]}`);
    const lanePos = {};
    nodes.forEach((n) => { (lanePos[n.lane] = lanePos[n.lane] || []).push(n); });
    Object.values(lanePos).forEach((arr) => arr.sort((a, b) => a.year - b.year).forEach((n, i) => { n.where = n.pos || (i % 2 ? "a" : "b"); }));
    const g = s.append("g").selectAll("g").data(nodes).join("g").attr("transform", (n) => `translate(${pos(n).x},${pos(n).y})`)
      .attr("tabindex", 0).attr("role", "button").attr("aria-label", (n) => `${n.label}, ${n.year}`).style("cursor", "pointer").attr("data-node", (n) => n.id);
    g.append("circle").attr("r", 8).style("fill", (n) => `var(--c${(n.lane % 8) + 1})`).style("stroke", "var(--bg)").attr("stroke-width", 2.5);
    g.append("circle").attr("class", "hit").attr("r", 17).style("fill", "transparent"); // larger touch target
    g.append("text").attr("text-anchor", "middle").attr("y", (n) => ({ a: -14, b: 24, c: 40 }[n.where])).style("font-size", "11px").style("font-weight", 600).text((n) => n.label)
      .append("tspan").attr("class", "muted").style("font-weight", 400).style("font-size", "10px").text((n) => `  ${n.year}`);

    function choose(n) {
      g.select("circle").attr("stroke-width", (d) => (d === n ? 4 : 2.5)).style("stroke", (d) => (d === n ? "var(--fg)" : "var(--bg)"));
      const os = n.osId && byId[n.osId];
      const kin = D.osTree.edges.filter((e) => e[0] === n.id || e[1] === n.id).map((e) => (e[0] === n.id ? `→ ${byNode[e[1]].label} (${e[2]})` : `← ${byNode[e[0]].label} (${e[2]})`));
      edgeSel.attr("opacity", (e) => (e[0] === n.id || e[1] === n.id ? 1 : 0.2)).attr("stroke-width", (e) => (e[0] === n.id || e[1] === n.id ? 3 : 1.8));
      OSUI.fill(info, h("h4", { style: "margin:.2rem 0", text: `${n.label} (${n.year})` }), h("p", { text: n.info || (os ? os.tagline : "") }),
        kin.length ? h("p", { class: "small", text: `Lineage: ${kin.join("; ")}` }) : null,
        os ? h("button", { type: "button", class: "btn", text: `Add ${os.name} to the comparison`, onclick: () => window.dispatchEvent(new CustomEvent("os-compare-add", { detail: { id: os.id } })) }) : null);
    }
    g.on("click", (ev, n) => choose(n)).on("keydown", (ev, n) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); choose(n); } });
  });

  // ---------- Compare tool ----------
  OSUI.register("oscompare", (el) => {
    const p = panel(el, "Compare operating systems",
      `Press <b>＋ Compare</b> on up to ${MAX} systems, then read them side by side. Show or hide sections of the table to focus on what you are studying.`);
    let sel = [];
    const shownSections = new Set(D.osSections.map((s) => s.id));

    const presets = {
      "Windows, macOS, Linux": ["windows", "macos", "linux"],
      "Unix family": ["macos", "freebsd", "linux"],
      "Linux in four disguises": ["linux", "android", "chromeos", "rpi"],
      "Phone operating systems": ["android", "ios"],
      "Mainframe and midrange": ["zos", "zvse", "ibmi"],
      "Mainframe vs. PC": ["zos", "windows", "linux"],
      "Real-time vs. general-purpose": ["freertos", "qnx", "linux"],
      "Three security philosophies": ["qubes", "ios", "freebsd"],
      "Microkernels in practice": ["qnx", "minix3", "fuchsia"],
      "Security first": ["openbsd", "freebsd", "qubes"],
      "Mainframe virtualization and transactions": ["zvm", "ztpf", "zos"],
      "Unix and its heirs": ["solaris", "plan9", "openbsd"],
      "Phones beyond Android and iOS": ["harmonyos", "android", "ios"]
    };
    const presetSel = select({ label: "Quick comparisons", options: [{ value: "", label: "Choose…" }, ...Object.keys(presets).map((k) => ({ value: k, label: k }))], value: "", onChange: (v) => { if (v) { sel = presets[v].slice(); presetSel.set(""); refresh(true); } } });
    p.controls.append(presetSel.el, button("Clear all", () => { sel = []; refresh(); }, true));

    const msg = h("p", { class: "status-bad", "aria-live": "polite", style: "min-height:1.4em;margin:.25rem 0" });
    const tray = h("div", { class: "row", "aria-label": "Systems selected for comparison", role: "group" });
    const cards = h("div", { class: "os-cards" });
    const sections = h("div", { class: "row", role: "group", "aria-label": "Table sections to show" });
    const tableHost = h("div", { class: "compare-wrap" });
    const goBtn = button("Compare selected ▼", () => { if (!sel.length) { msg.textContent = "Choose at least one system first."; return; } msg.textContent = ""; reveal(tableHost, { behavior: "smooth", block: "start" }); tableHost.focus({ preventScroll: true }); });
    p.body.append(msg, h("div", { class: "row" }, h("strong", { text: "Selected:" }), tray, goBtn), cards,
      h("h4", { id: "compare-table-heading", text: "Side by side" }), sections, tableHost);

    D.osSections.forEach((s) => {
      const cb = h("input", { type: "checkbox", checked: true, "aria-label": `Show section ${s.label}`, onchange: () => { cb.checked ? shownSections.add(s.id) : shownSections.delete(s.id); drawTable(); } });
      sections.append(h("label", { style: "flex-direction:row;align-items:center;gap:.3rem;color:var(--fg)" }, cb, s.label));
    });

    function toggle(id) {
      if (sel.includes(id)) sel = sel.filter((x) => x !== id);
      else if (sel.length >= MAX) { msg.textContent = `You can compare up to ${MAX} systems at once. Remove one first.`; return; }
      else sel.push(id);
      refresh();
    }

    D.osGroups.forEach((gname) => {
      const list = D.osList.filter((o) => o.group === gname);
      if (!list.length) return;
      cards.append(h("h4", { class: "os-group", text: gname }));
      list.forEach((o) => {
        const btn = h("button", { type: "button", class: "btn secondary", "data-os": o.id, "aria-pressed": "false", onclick: () => toggle(o.id) });
        cards.append(h("article", { class: "os-card", "data-card": o.id },
          h("h5", { text: o.name }), h("p", { class: "tagline", text: o.tagline }),
          h("p", { class: "small", text: o.first }),
          h("div", { class: "row" }, btn),
          h("details", {}, h("summary", { text: "Full profile" }),
            h("dl", { class: "profile" }, D.osSections.flatMap((s) => s.rows).flatMap(([k, label]) => [h("dt", { text: label }), h("dd", { text: o[k] })])))));
      });
    });

    function refresh(scroll) {
      msg.textContent = "";
      cards.querySelectorAll("button[data-os]").forEach((b) => {
        const on = sel.includes(b.dataset.os);
        b.setAttribute("aria-pressed", String(on));
        b.textContent = on ? "✓ In comparison" : "＋ Compare";
        b.classList.toggle("on", on);
        b.setAttribute("aria-label", `${on ? "In comparison" : "Compare"}: ${byId[b.dataset.os].name}`); // starts with the visible text
      });
      tray.replaceChildren(...(sel.length ? sel.map((id) => h("span", { class: "chip", style: "background:var(--accent);color:var(--accent-fg)" }, byId[id].name, " ",
        h("button", { type: "button", "aria-label": `Remove ${byId[id].name}`, style: "background:none;border:0;color:inherit;cursor:pointer;font-weight:700", text: "×", onclick: () => toggle(id) }))) : [h("span", { class: "small", text: "none yet" })]));
      drawTable();
      try { history.replaceState(null, "", sel.length ? `#compare=${sel.join(",")}` : location.pathname + location.search); } catch (e) { /* e.g. file:// in some browsers */ }
      if (scroll) reveal(tableHost, { behavior: "smooth", block: "nearest" });
    }

    function drawTable() {
      if (!sel.length) { tableHost.replaceChildren(h("p", { class: "small", text: "Nothing selected yet. Choose systems above or pick a quick comparison." })); return; }
      const systems = sel.map((id) => byId[id]);
      const head = h("tr", {}, h("th", { scope: "col" }, h("span", { class: "sr-only", text: "Attribute" })), systems.map((o) => h("th", { scope: "col" }, o.name)));
      const body = [];
      D.osSections.filter((s) => shownSections.has(s.id)).forEach((s) => {
        body.push(h("tr", { class: "section-row" }, h("th", { colspan: systems.length + 1, scope: "colgroup", text: s.label })));
        s.rows.forEach(([k, label]) => body.push(h("tr", { "data-row": k }, h("th", { scope: "row", text: label }), systems.map((o) => h("td", { text: o[k] })))));
      });
      OSUI.fill(tableHost, h("table", { class: "compare", "aria-labelledby": "compare-table-heading" }, h("thead", {}, head), h("tbody", {}, body)),
        systems.length === 1 ? h("p", { class: "small", text: "Add another system to see how they differ." }) : null);
    }

    window.addEventListener("os-compare-add", (e) => { if (!sel.includes(e.detail.id)) toggle(e.detail.id); reveal(cards.closest(".sim"), { behavior: "smooth", block: "start" }); });

    // Shareable links: #compare=windows,zos
    const m = /compare=([\w,-]+)/.exec(location.hash || "");
    if (m) sel = m[1].split(",").filter((id) => byId[id]).slice(0, MAX);
    // A link such as #compare=a,b on this same page changes only the hash, so listen for it.
    window.addEventListener("hashchange", () => {
      const h2 = /compare=([a-z0-9,-]+)/.exec(location.hash || "");
      if (h2) { sel = h2[1].split(",").filter((id) => byId[id]).slice(0, MAX); refresh(true); }
    });
    refresh();
  });
})();
