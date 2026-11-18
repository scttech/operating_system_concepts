/* Module 12: inter-process communication. A pipe / message-queue explorer and a cost comparison. */
(function () {
  "use strict";
  const { h, panel, select, slider, button, svg } = OSUI;
  const L = OSLib;

  const EXPLAIN = {
    wrote: (e, kind) => kind === "pipe" ? `write: ${e.n} byte${e.n === 1 ? "" : "s"} ("${e.data}") copied into the kernel's pipe buffer.` : `send: the message "${e.data}" was queued.`,
    "write-blocked": (e, kind) => kind === "pipe" ? `The buffer is full, so the writer goes to sleep with ${e.remaining} byte${e.remaining === 1 ? "" : "s"} still to write. It uses no CPU while it waits.` : "The queue is full, so the sender goes to sleep until a message is received.",
    "write-resumed": (e, kind) => kind === "pipe" ? `The reader made room, so the sleeping writer was woken and its next ${e.n} byte${e.n === 1 ? "" : "s"} moved in${e.done ? "; its write is complete" : "; it still has more to write"}.` : `The reader made room, so the sleeping sender's message "${e.data}" was queued.`,
    read: (e, kind) => `${e.woke ? "The sleeping reader was woken: " : ""}read returned ${kind === "pipe" ? `${e.data.length} byte${e.data.length === 1 ? "" : "s"}` : "one whole message"}: "${e.data}".`,
    "read-blocked": () => "Nothing to read yet, and a writer still has the pipe open, so the reader goes to sleep until data arrives.",
    eof: (e) => `${e.woke ? "The sleeping reader was woken: " : ""}read returned 0 bytes: end of file. Every writer has closed and everything was read.`,
    closed: (e) => `The ${e.end} end was closed.`,
    broken: (e) => `${e.woke ? "The sleeping writer was woken with an error: " : "write failed: "}${e.note}.`.replace("..", "."),
    busy: (e) => `Not possible now: ${e.note}.`,
    invalid: (e) => `Not allowed: ${e.note}.`
  };

  OSUI.register("ipc", (el) => {
    const p = panel(el, "Pipe and message-queue explorer",
      "A writer process and a reader process share a buffer that lives <b>inside the kernel</b>. Write and read to see when each side must <b>wait</b>, and what closing an end means. Switch between a pipe (a stream of bytes) and a message queue (whole messages).");
    let kind = "pipe", cap = 6, text = "hello", readN = 4, c = L.newChannel(kind, cap);
    const log = [];
    const kindSel = select({ label: "Mechanism", options: [{ value: "pipe", label: "Pipe (byte stream)" }, { value: "queue", label: "Message queue (whole messages)" }], value: kind, onChange: (v) => { kind = v; capSl.el.querySelector("output").textContent = capText(cap); reset(); } });
    const capText = (v) => (kind === "pipe" ? `${v} byte${v === 1 ? "" : "s"}` : `${v} message${v === 1 ? "" : "s"}`);
    const capSl = slider({ label: "Buffer capacity", min: 1, max: 12, value: cap, format: capText, onInput: (v) => { cap = v; reset(); } });
    const input = h("input", { type: "text", size: 14, value: text, maxlength: 24, "aria-label": "Text the writer sends", oninput: () => { text = input.value; } });
    const readSl = slider({ label: "Reader asks for", min: 1, max: 8, value: readN, format: (v) => `${v} byte${v === 1 ? "" : "s"}`, onInput: (v) => { readN = v; } });
    p.controls.append(kindSel.el, capSl.el, h("label", {}, h("span", { text: "Writer sends" }), input), readSl.el);
    const bWrite = button("Writer: write", () => act(L.chanWrite(c, text)));
    const bRead = button("Reader: read", () => act(L.chanRead(c, readN)));
    const bCW = button("Writer: close its end", () => act(L.closeWriteEnd(c)), true);
    const bCR = button("Reader: close its end", () => act(L.closeReadEnd(c)), true);
    const status = h("p", { "aria-live": "polite", class: "small", style: "min-height:2.6em" });
    const chart = h("div", { class: "chart" });
    const logEl = h("ol", { class: "small", "aria-live": "polite", style: "max-height:12rem;overflow:auto;padding-left:1.4rem;margin:.4rem 0" });
    const scenarios = h("div", { class: "row" },
      button("Scenario: writer outruns reader", () => run(["w:abcdefghijklmnop"]), true),
      button("Scenario: reader waits for data", () => run(["r", "w:hi"]), true),
      button("Scenario: end of file", () => run(["w:bye", "cw", "r", "r"]), true),
      button("Scenario: broken pipe", () => run(["cr", "w:x"]), true));
    p.body.append(h("div", { class: "row" }, bWrite, bRead, bCW, bCR, button("Reset", reset, true)), scenarios, status, chart, h("h4", { text: "What happened" }), logEl);

    function reset() { c = L.newChannel(kind, cap); log.length = 0; draw(); status.textContent = "Empty buffer. Both ends are open."; }
    function run(ops) {
      reset();
      const sample = kind === "pipe" ? ["abcdefghijklmnop".slice(0, Math.max(cap + 3, 4))] : ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu"];
      ops.forEach((op) => {
        if (op.startsWith("w:")) {
          if (kind === "pipe") act(L.chanWrite(c, op === "w:abcdefghijklmnop" ? sample[0] : op.slice(2)), true);
          else if (op === "w:abcdefghijklmnop") sample.slice(0, cap + 1).forEach((m) => act(L.chanWrite(c, m), true));
          else act(L.chanWrite(c, op.slice(2)), true);
        } else if (op === "r") act(L.chanRead(c, readN), true);
        else if (op === "cw") act(L.closeWriteEnd(c), true);
        else if (op === "cr") act(L.closeReadEnd(c), true);
      });
      draw();
      status.textContent = "Scenario played. Read the list below, then keep experimenting with the buttons.";
    }
    function act(events, quiet) {
      events.forEach((e) => log.push({ e, text: (EXPLAIN[e.type] || (() => e.type))(e, kind) }));
      if (!quiet) { draw(true); const last = events[events.length - 1]; if (last) status.textContent = log[log.length - 1].text; }
    }

    const W = 720, H = 210, boxW = 130;
    function draw(animate) {
      d3.select(chart).selectAll("*").remove();
      const s = svg(chart, W, H, `${kind === "pipe" ? "Pipe" : "Message queue"} with ${c.buf.length} of ${c.capacity} slots used. Writer: ${c.writeOpen ? (c.writerBlocked !== null ? "asleep" : "running") : "closed"}. Reader: ${c.readOpen ? (c.readerBlocked !== null ? "asleep" : "running") : "closed"}.`);
      const party = (x, name, open, asleep, color) => {
        const g = s.append("g");
        g.append("rect").attr("x", x).attr("y", 40).attr("width", boxW).attr("height", 110).attr("rx", 8).style("fill", open ? (asleep ? "var(--card)" : color) : "var(--card)").style("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", open ? null : "5 4");
        g.append("text").attr("x", x + boxW / 2).attr("y", 72).attr("text-anchor", "middle").attr("font-weight", 700).style("fill", open && !asleep ? (color === "var(--c1)" ? "var(--on-c1)" : "var(--on-c3)") : "var(--fg)").text(name);
        g.append("text").attr("x", x + boxW / 2).attr("y", 98).attr("text-anchor", "middle").style("font-size", "13px").style("fill", open && !asleep ? (color === "var(--c1)" ? "var(--on-c1)" : "var(--on-c3)") : "var(--fg)").text(!open ? "end closed" : asleep ? "asleep (waiting)" : "running");
        return g;
      };
      const wg = party(10, "Writer", c.writeOpen, c.writerBlocked !== null, "var(--c1)");
      if (c.writerBlocked !== null) wg.append("text").attr("x", 75).attr("y", 124).attr("text-anchor", "middle").style("font-size", "12px").text(c.kind === "pipe" ? `still holds "${c.writerBlocked.length > 9 ? c.writerBlocked.slice(0, 8) + "…" : c.writerBlocked}"` : `holds "${c.writerBlocked.slice(0, 9)}"`);
      const rg = party(W - 10 - boxW, "Reader", c.readOpen, c.readerBlocked !== null, "var(--c3)");
      if (c.readerBlocked !== null) rg.append("text").attr("x", W - 10 - boxW / 2).attr("y", 124).attr("text-anchor", "middle").style("font-size", "12px").text(c.kind === "pipe" ? `wants ${c.readerBlocked} byte${c.readerBlocked === 1 ? "" : "s"}` : "wants a message");
      // the kernel buffer
      const bx = 175, bw = W - 2 * 175, cw = Math.min(c.kind === "pipe" ? 40 : 80, bw / c.capacity);
      s.append("rect").attr("x", bx - 6).attr("y", 20).attr("width", bw + 12).attr("height", 150).attr("rx", 10).style("fill", "var(--code-bg)").style("stroke", "var(--border)");
      s.append("text").attr("x", W / 2).attr("y", 40).attr("text-anchor", "middle").attr("font-weight", 700).text("kernel");
      s.append("text").attr("x", W / 2).attr("y", 158).attr("text-anchor", "middle").style("font-size", "12px").text(`${c.buf.length} of ${c.capacity} ${c.kind === "pipe" ? "bytes" : "messages"} used`);
      const x0 = W / 2 - (cw * c.capacity) / 2;
      const cells = d3.range(c.capacity);
      const cg = s.selectAll("g.cell").data(cells).join("g").attr("class", "cell");
      cg.append("rect").attr("x", (i) => x0 + i * cw).attr("y", 70).attr("width", cw - 2).attr("height", 44).attr("rx", 4)
        .style("fill", (i) => (i < c.buf.length ? "var(--c2)" : "var(--card)")).style("stroke", "var(--border)");
      cg.filter((i) => i < c.buf.length).append("text").attr("x", (i) => x0 + i * cw + (cw - 2) / 2).attr("y", 98).attr("text-anchor", "middle").style("fill", "var(--on-c2)").style("font-size", c.kind === "pipe" ? "16px" : "11px").attr("font-family", "ui-monospace,monospace")
        .text((i) => (c.kind === "pipe" ? c.buf[i] : c.buf[i].length > 9 ? c.buf[i].slice(0, 8) + "…" : c.buf[i]));
      if (animate) cg.filter((i) => i < c.buf.length).attr("opacity", 0).transition().duration(350).attr("opacity", 1);
      // arrows
      const arrow = (x1, x2, label) => { s.append("line").attr("x1", x1).attr("x2", x2).attr("y1", 92).attr("y2", 92).style("stroke", "var(--muted)").attr("stroke-width", 2).attr("marker-end", "url(#ipc-arrow)"); };
      s.append("defs").append("marker").attr("id", "ipc-arrow").attr("viewBox", "0 0 10 10").attr("refX", 8).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto").append("path").attr("d", "M0,0 L10,5 L0,10 z").style("fill", "var(--muted)");
      arrow(142, bx - 8); arrow(W - 175 + 8, W - 10 - boxW - 4);
      s.append("text").attr("x", 158).attr("y", 84).attr("text-anchor", "middle").style("font-size", "11px").text("write");
      s.append("text").attr("x", W - 158).attr("y", 84).attr("text-anchor", "middle").style("font-size", "11px").text("read");
      bWrite.disabled = false; bRead.disabled = false;
      logEl.replaceChildren(...log.map((x) => h("li", { text: x.text })));
      logEl.scrollTop = logEl.scrollHeight;
    }
    reset();
  });

  OSUI.register("ipccost", (el) => {
    const p = panel(el, "What does it cost to move data between processes?",
      "Count the system calls and the copies the <i>kernel</i> has to make to move the same data with each mechanism. Shared memory wins on speed, but the two processes must then <b>coordinate themselves</b> (a mutex or semaphore), because nothing is stopping both from writing at once.");
    let transfers = 1000, bytes = 64;
    const tSl = slider({ label: "Transfers", min: 1, max: 100000, step: 1, value: transfers, format: (v) => v.toLocaleString(), onInput: (v) => { transfers = v; draw(); } });
    const bSl = slider({ label: "Bytes per transfer", min: 1, max: 65536, step: 1, value: bytes, format: (v) => v.toLocaleString(), onInput: (v) => { bytes = v; draw(); } });
    p.controls.append(tSl.el, bSl.el, button("Small messages", () => { transfers = 100000; bytes = 16; tSl.set(transfers); bSl.set(bytes); draw(); }, true), button("One big transfer", () => { transfers = 1; bytes = 65536; tSl.set(1); bSl.set(65536); draw(); }, true));
    const out = h("div", {});
    p.body.append(out);
    const NAMES = { pipe: "Pipe", queue: "Message queue", socket: "Local socket", shm: "Shared memory" };
    function draw() {
      const rows = L.ipcMechanisms.map((m) => [m, L.ipcCost(m, transfers, bytes)]);
      out.replaceChildren(h("table", { class: "compact" },
        h("thead", {}, h("tr", {}, ["Mechanism", "System calls", "Kernel copies", "Bytes copied", "Needs its own locking?"].map((t) => h("th", { text: t })))),
        h("tbody", {}, rows.map(([m, r]) => h("tr", {}, h("td", { text: NAMES[m] }), h("td", { text: r.syscalls.toLocaleString() }), h("td", { text: r.copies.toLocaleString() }), h("td", { text: r.bytesCopied.toLocaleString() }), h("td", { text: r.needsSync ? "yes" : "no: the kernel orders the operations" }))))),
        h("p", { class: "small", text: "Each pipe, queue or socket transfer is one write plus one read system call, and the data is copied into the kernel and then out again. Shared memory needs two set-up calls (one per process) and then none, but it is only faster when the saved calls and copies are worth the extra care. For a handful of tiny messages a pipe is simpler and just as fast." }));
    }
    draw();
  });
})();
