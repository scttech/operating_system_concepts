/* Module 1: system call walkthrough */
(function () {
  "use strict";
  const { h, panel, select, button, svg, ticker } = OSUI;

  const CALLS = {
    read: { sig: "read(fd, buf, 4096)", work: "Finds the file's data (page cache or disk driver), blocks the process if the data isn't cached yet, then copies bytes into the caller's buffer." },
    write: { sig: "write(fd, buf, 512)", work: "Copies the user's bytes into kernel buffers (page cache) and schedules the device driver to write them out later." },
    fork: { sig: "fork()", work: "Allocates a new PCB and PID, duplicates the page tables copy-on-write, and puts the child on the ready queue." },
    open: { sig: "open(\"/etc/hosts\", O_RDONLY)", work: "Walks the path through directory entries, checks permissions on each directory and the file, allocates a file descriptor." },
    getpid: { sig: "getpid()", work: "Reads the PID out of the PCB. This is a very short kernel path, but it still pays the mode-switch cost." }
  };

  const LANES = ["Application", "C library wrapper", "Kernel", "Hardware"];
  const steps = (c) => [
    { lane: 0, mode: "user", text: `The application calls <code>${c.sig}</code>. This is an ordinary function call in user mode.` },
    { lane: 1, mode: "user", text: "The library wrapper places the <b>system-call number</b> and arguments into registers, then executes a <b>trap</b> instruction (e.g., <code>syscall</code> / <code>svc</code>)." },
    { lane: 2, mode: "kernel", text: "The CPU <b>switches to kernel mode</b> and jumps to a fixed entry point chosen by the kernel. The user program cannot pick where it lands." },
    { lane: 2, mode: "kernel", text: "The kernel <b>validates</b> the call number and arguments (is the pointer valid? does the process have permission?)." },
    { lane: 3, mode: "kernel", text: `The kernel does the real work. ${c.work}` },
    { lane: 2, mode: "kernel", text: "The kernel stores the <b>return value</b> (or an error code such as <code>-EACCES</code>) in the saved user registers." },
    { lane: 1, mode: "user", text: "A <b>return-from-trap</b> instruction restores user mode and resumes the wrapper right after the trap." },
    { lane: 0, mode: "user", text: "The wrapper returns to the application, which continues with the result." }
  ];

  OSUI.register("syscall", (el) => {
    const p = panel(el, "System call walkthrough",
      "Step through what happens when a program asks the kernel for a service. Note where the CPU mode changes.");
    let idx = 0, list = steps(CALLS.read);
    const callSel = select({ label: "System call", options: Object.keys(CALLS), value: "read", onChange: (v) => { list = steps(CALLS[v]); idx = 0; draw(); } });
    const auto = ticker(() => { if (idx < list.length - 1) { idx++; draw(); } else { auto.stop(); autoBtn.textContent = "Auto-play"; } }, 1400);
    const autoBtn = button("Auto-play", () => { if (auto.running) { auto.stop(); autoBtn.textContent = "Auto-play"; } else { if (idx >= list.length - 1) idx = 0; auto.start(); autoBtn.textContent = "Pause"; draw(); } }, true);
    p.controls.append(callSel.el,
      button("◀ Back", () => { idx = Math.max(0, idx - 1); draw(); }, true),
      button("Next ▶", () => { idx = Math.min(list.length - 1, idx + 1); draw(); }),
      autoBtn, button("Reset", () => { idx = 0; draw(); }, true));

    const W = 700, laneH = 62, H = laneH * 4 + 10;
    const chart = h("div", { class: "chart" });
    const badge = h("p", { class: "metrics", "aria-live": "polite" });
    const text = h("p", { "aria-live": "polite" });
    p.body.append(chart, badge, text);
    const s = svg(chart, W, H, "System call flow across application, library, kernel and hardware");
    const g = s.append("g");

    function draw() {
      g.selectAll("*").remove();
      const kernelTop = laneH * 2 + 5;
      g.append("rect").attr("x", 0).attr("y", 5).attr("width", W).attr("height", laneH * 2).style("fill", "var(--c1)").attr("opacity", 0.08);
      g.append("rect").attr("x", 0).attr("y", kernelTop).attr("width", W).attr("height", laneH * 2).style("fill", "var(--c6)").attr("opacity", 0.1);
      g.append("line").attr("x1", 0).attr("x2", W).attr("y1", kernelTop).attr("y2", kernelTop).style("stroke", "var(--muted)").attr("stroke-dasharray", "6 4");
      g.append("text").attr("x", W - 8).attr("y", 20).attr("text-anchor", "end").attr("class", "muted").style("font-size", "12px").text("USER SPACE (user mode)");
      g.append("text").attr("x", W - 8).attr("y", kernelTop + 16).attr("text-anchor", "end").attr("class", "muted").style("font-size", "12px").text("KERNEL SPACE (kernel mode)");
      LANES.forEach((name, i) => {
        const active = list[idx].lane === i;
        const visited = list.slice(0, idx + 1).some((st) => st.lane === i);
        g.append("rect").attr("x", 20).attr("y", 5 + i * laneH + 10).attr("width", 220).attr("height", laneH - 20).attr("rx", 8)
          .style("fill", active ? "var(--accent)" : "var(--card)").style("stroke", visited ? "var(--accent)" : "var(--border)").attr("stroke-width", active ? 3 : 1.5);
        g.append("text").attr("x", 130).attr("y", 5 + i * laneH + laneH / 2 + 5).attr("text-anchor", "middle")
          .style("fill", active ? "var(--accent-fg)" : "var(--fg)").style("font-weight", 600).text(name);
      });
      // path of arrows between visited steps
      for (let i = 1; i <= idx; i++) {
        const a = list[i - 1].lane, b = list[i].lane;
        if (a === b) continue;
        const x = 260 + (i * 55) % 380;
        g.append("line").attr("x1", x).attr("x2", x).attr("y1", 5 + a * laneH + laneH / 2).attr("y2", 5 + b * laneH + laneH / 2)
          .style("stroke", b > a ? "var(--c6)" : "var(--c3)").attr("stroke-width", 3).attr("marker-end", "none");
        g.append("circle").attr("cx", x).attr("cy", 5 + b * laneH + laneH / 2).attr("r", 5).style("fill", b > a ? "var(--c6)" : "var(--c3)");
        g.append("text").attr("x", x + 8).attr("y", 5 + ((a + b) / 2) * laneH + laneH / 2 + 4).style("font-size", "11px").attr("class", "muted").text(`step ${i + 1}`);
      }
    }
    const origDraw = draw;
    draw = function () {
      origDraw();
      const st = list[idx];
      badge.replaceChildren(
        h("span", { class: "metric" }, h("b", { text: st.mode === "kernel" ? "KERNEL MODE" : "USER MODE", class: st.mode === "kernel" ? "status-bad" : "status-ok" }), h("span", { text: "current CPU mode" })),
        h("span", { class: "metric" }, h("b", { text: `${idx + 1} / ${list.length}` }), h("span", { text: "step" })));
      text.innerHTML = st.text;
    };
    draw();
  });
})();
