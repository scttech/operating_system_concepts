/* Small UI helpers shared by simulations (no framework). */
(function () {
  "use strict";

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  let uid = 0;
  const nextId = (p) => `${p || "id"}-${++uid}`;

  /** Labelled range slider. Returns {el, get, set}. */
  function slider({ label, min, max, step = 1, value, format = (v) => v, onInput }) {
    const input = h("input", { type: "range", min, max, step, value });
    const out = h("output", { text: format(+value) });
    const el = h("label", {}, h("span", {}, label + ": ", out), input);
    input.addEventListener("input", () => { out.textContent = format(+input.value); onInput && onInput(+input.value); });
    return { el, get: () => +input.value, set: (v) => { input.value = v; out.textContent = format(+v); } };
  }

  /** Labelled <select>. options: [{value,label}] or strings. */
  function select({ label, options, value, onChange }) {
    const sel = h("select", {}, options.map((o) => {
      const opt = typeof o === "string" ? { value: o, label: o } : o;
      return h("option", { value: opt.value, selected: opt.value === value, text: opt.label });
    }));
    sel.addEventListener("change", () => onChange && onChange(sel.value));
    return { el: h("label", {}, h("span", { text: label }), sel), get: () => sel.value, set: (v) => { sel.value = v; } };
  }

  /** Labelled number input. */
  function number({ label, min, max, step = 1, value, onInput }) {
    const input = h("input", { type: "number", min, max, step, value });
    input.addEventListener("input", () => { if (input.value !== "") onInput && onInput(+input.value); });
    return { el: h("label", {}, h("span", { text: label }), input), get: () => +input.value, set: (v) => { input.value = v; } };
  }

  function button(text, onClick, secondary) {
    return h("button", { type: "button", class: "btn" + (secondary ? " secondary" : ""), onclick: onClick, text });
  }

  /** Build a standard simulation panel inside container; returns {root, controls, body}. */
  function panel(container, title, desc) {
    const controls = h("div", { class: "controls" });
    const body = h("div", {});
    const root = h("section", { class: "sim", "aria-label": title },
      h("h3", { text: title }), desc ? h("p", { class: "desc", html: desc }) : null, controls, body);
    container.append(root);
    return { root, controls, body };
  }

  function svg(parent, w, h_, label) {
    // Shrinks with its container, but never below 75% of its natural size: past that the chart scrolls inside its own box,
    // so labels stay legible on phones instead of being scaled down to a few pixels.
    return d3.select(parent).append("svg")
      .attr("viewBox", `0 0 ${w} ${h_}`).attr("width", w).attr("role", "img").attr("aria-label", label || "chart")
      .style("min-width", `${Math.round(w * 0.75)}px`);
  }

  /** Simple repeating timer with start/stop; returns controller. */
  function ticker(fn, ms) {
    let id = null;
    return {
      get running() { return id !== null; },
      start() { if (id === null) id = setInterval(fn, ms); },
      stop() { if (id !== null) { clearInterval(id); id = null; } },
      setMs(m) { ms = m; if (id !== null) { clearInterval(id); id = setInterval(fn, ms); } }
    };
  }

  /**
   * Playback controls for step-by-step animations.
   * total(): number of frames; onFrame(i): redraw the simulation at frame i (0..total()).
   * The simulation normally shows its finished state (i = total()). "Play" restarts from 0 and animates to the end.
   * Call reset() whenever the underlying data changes, then redraw.
   */
  const SPEEDS = { Slow: 1100, Normal: 600, Fast: 250 };
  function player({ total, onFrame, speed = "Normal", label }) {
    let i = total(), timer = null, ms = SPEEDS[speed];
    const info = h("span", { class: "small", "aria-live": "off" });
    const playBtn = h("button", { type: "button", class: "btn", text: "▶ Play" });
    const showInfo = () => { info.textContent = label ? label(i, total()) : `frame ${i} / ${total()}`; };
    function stop() { if (timer !== null) { clearInterval(timer); timer = null; } playBtn.textContent = "▶ Play"; }
    function goto(n) { i = Math.max(0, Math.min(total(), n)); showInfo(); onFrame(i); }
    function tick() { if (i >= total()) { stop(); return; } goto(i + 1); if (i >= total()) stop(); }
    playBtn.addEventListener("click", () => {
      if (timer !== null) { stop(); return; }
      if (i >= total()) goto(0);
      playBtn.textContent = "⏸ Pause";
      timer = setInterval(tick, ms);
    });
    const speedSel = h("select", { "aria-label": "Animation speed" }, Object.keys(SPEEDS).map((k) => h("option", { value: k, text: k, selected: k === speed })));
    speedSel.addEventListener("change", () => { ms = SPEEDS[speedSel.value]; if (timer !== null) { clearInterval(timer); timer = setInterval(tick, ms); } });
    const el = h("div", { class: "row player", role: "group", "aria-label": "Animation controls" },
      button("⟲ Restart", () => { stop(); goto(0); }, true),
      button("◀ Back", () => { stop(); goto(i - 1); }, true),
      playBtn,
      button("Step ▶", () => { stop(); goto(i + 1); }, true),
      speedSel, info);
    showInfo();
    return {
      el, stop, goto,
      get index() { return i; },
      get ms() { return ms; },
      get playing() { return timer !== null; },
      /** Data changed: stop, jump to the finished state and refresh the label (the caller redraws). */
      reset() { stop(); i = total(); showInfo(); }
    };
  }

  /**
   * A region that scrolls sideways must be reachable by keyboard (WCAG 2.1.1). Sets tabindex="0" only while the content really
   * overflows, so it does not add needless tab stops. Re-checks when the box resizes or its content changes.
   */
  function watchScroll(el) {
    if (!el || el.__watchScroll) return;
    el.__watchScroll = true;
    const authored = el.hasAttribute("tabindex");
    let queued = false;
    const check = () => {
      queued = false;
      const ox = getComputedStyle(el).overflowX, scrolls = (ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1;
      if (authored) return;
      if (scrolls) el.setAttribute("tabindex", "0"); else el.removeAttribute("tabindex");
    };
    const later = () => { if (!queued) { queued = true; (window.requestAnimationFrame || setTimeout)(check); } };
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(later).observe(el);
    if (typeof MutationObserver !== "undefined") new MutationObserver(later).observe(el, { childList: true, subtree: true });
    check();
  }

  /** Like parent.replaceChildren(...) but skips null/undefined/false (the DOM method would print them as text). */
  function fill(parent, ...kids) { parent.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false)); }

  // Simulation registry: pages declare <div data-sim="name"></div>; sims call OSUI.register("name", fn(container)).
  const registry = {};
  function register(name, fn) { registry[name] = fn; }
  function mountAll() {
    document.querySelectorAll("[data-sim]").forEach((el) => {
      const fn = registry[el.dataset.sim];
      if (!fn) { el.textContent = `Unknown simulation “${el.dataset.sim}”.`; return; }
      try { fn(el); el.dataset.mounted = "true"; } catch (e) {
        console.error(e);
        el.textContent = `This simulation failed to load: ${e.message}`;
        el.dataset.mounted = "error";
      }
    });
    if (window.OSSite && OSSite.enhance) OSSite.enhance(document); // glossary tooltips inside simulations
    if (window.OSSite && OSSite.focusHash) OSSite.focusHash();       // simulations changed the page height: re-aim at #term-…
    document.querySelectorAll(".sim, .chart, .compare-wrap, .table-scroll").forEach(watchScroll);
  }
  document.addEventListener("DOMContentLoaded", mountAll);

  /**
   * "Copy as CSV" and "Download CSV" buttons for a results table, so the numbers can go into a spreadsheet, journal or report.
   * Reads the table's text as it is when the button is pressed. If the browser will not copy or download (some embedded or older
   * browsers), the CSV text is shown in a box to select and copy by hand. Needs js/lib/csv.js.
   */
  function exportBar(table, name) {
    const status = h("span", { class: "small", "aria-live": "polite" });
    const box = h("textarea", { readonly: "", rows: 5, "aria-label": "Results as CSV text", hidden: true, style: "width:100%" });
    const rows = () => [...table.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()));
    const csv = () => window.OSLib.toCSV(rows());
    function manual(text, why) { box.value = text; box.hidden = false; box.focus(); box.select(); status.textContent = why; }
    const copy = h("button", { type: "button", class: "btn secondary", text: "Copy as CSV", onclick: () => {
      const text = csv();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => { status.textContent = "Copied. Paste it into a spreadsheet."; }, () => manual(text, "Copying was blocked. Select the text below and copy it."));
      else manual(text, "Select the text below and copy it.");
    } });
    const save = h("button", { type: "button", class: "btn secondary", text: "Download CSV", onclick: () => {
      const text = csv();
      if (window.Blob && window.URL && URL.createObjectURL) {
        const a = h("a", { href: URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" })), download: window.OSLib.csvFileName(name) });
        document.body.append(a); a.click(); a.remove();
        status.textContent = `Saved ${window.OSLib.csvFileName(name)}.`;
      } else manual(text, "Downloads are not available here. Select the text below and copy it.");
    } });
    return h("div", { class: "export-bar" }, h("div", { class: "row" }, copy, save, status), box);
  }

  /**
   * Makes a simulation shareable: a "Copy link to this setup" button, and applying a link's settings when the page opens (or the address changes).
   *   panel  the object returned by panel()
   *   name   the simulation's short name, the prefix of its keys in the address
   *   cfg    { spec, get(), set(state) }: spec as in js/lib/share.js; get() returns the current inputs; set(state) applies the valid ones
   * Reading and writing the address is done by OSLib.share, which accepts only well-formed values inside their limits.
   */
  function shareable(panel, name, cfg) {
    const S = window.OSLib && window.OSLib.share;
    if (!S) return null;
    const status = h("span", { class: "small", "aria-live": "polite" });
    const box = h("input", { type: "text", readonly: "", hidden: true, "aria-label": "Link to this setup", style: "width:100%" });
    function manual(url, why) { box.value = url; box.hidden = false; box.focus(); box.select(); status.textContent = why; }
    const btn = h("button", { type: "button", class: "btn secondary", text: "Copy link to this setup", onclick: () => {
      const url = S.linkFor(location.href, name, cfg.spec, cfg.get());
      try { history.replaceState(null, "", url.slice(url.indexOf("#"))); } catch (e) { /* some file:// contexts */ }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => { status.textContent = "Link copied. Anyone who opens it sees this setup."; }, () => manual(url, "Copying was blocked. Select the link below and copy it."));
      else manual(url, "Select the link below and copy it.");
    } });
    panel.body.append(h("div", { class: "share-bar" }, h("div", { class: "row" }, btn, status), box));
    let first = true;
    function apply() {
      const { state, ignored } = S.fromHash(name, cfg.spec, location.hash);
      if (!Object.keys(state).length && !ignored.length) return;
      if (Object.keys(state).length) cfg.set(state);
      status.textContent = ignored.length ? `Link loaded. Ignored values that were not valid: ${ignored.join(", ")}.` : "Setup loaded from the link.";
      if (first && Object.keys(state).length && panel.root.scrollIntoView) { try { panel.root.scrollIntoView({ block: "start" }); } catch (e) { /* ignore */ } }
      first = false;
    }
    window.addEventListener("hashchange", apply);
    apply();
    return { apply, button: btn, status };
  }

  window.OSUI = { h, fill, slider, select, number, button, panel, svg, ticker, player, nextId, register, mountAll, watchScroll, exportBar, shareable };
})();
