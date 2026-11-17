/* Module 2: Unix permission calculator and access control matrix */
(function () {
  "use strict";
  const { h, panel, select, number, button } = OSUI;
  const L = OSLib;

  OSUI.register("perms", (el) => {
    const p = panel(el, "Unix permission calculator",
      "Tick the boxes or type an octal mode. Then see what a <code>umask</code> does to newly created files.");
    let bits = L.octalToBits("754");
    const boxes = [];
    const octalIn = h("input", { type: "text", value: "754", maxlength: 3, size: 4, "aria-label": "Octal mode" });
    const sym = h("code", { text: "" });
    const who = ["Owner (u)", "Group (g)", "Other (o)"], ops = ["Read (4)", "Write (2)", "Execute (1)"];
    const table = h("table", { class: "compact" },
      h("thead", {}, h("tr", {}, h("th", {}, h("span", { class: "sr-only", text: "Who" })), ops.map((o) => h("th", { text: o })), h("th", { text: "Digit" }))),
      h("tbody", {}, who.map((w, r) => h("tr", {}, h("th", { scope: "row", text: w }),
        [0, 1, 2].map((c) => {
          const cb = h("input", { type: "checkbox", "aria-label": `${w} ${ops[c]}`, onchange: () => { bits[r * 3 + c] = cb.checked; sync(); } });
          boxes[r * 3 + c] = cb; return h("td", {}, cb);
        }), h("td", { class: "digit", text: "" })))));
    octalIn.addEventListener("input", () => { if (/^[0-7]{3}$/.test(octalIn.value)) { bits = L.octalToBits(octalIn.value); sync(true); } });

    const maskSel = select({ label: "umask", options: ["000", "002", "022", "027", "077"], value: "022", onChange: () => sync() });
    const baseSel = select({ label: "Created as", options: [{ value: "666", label: "file (default 666)" }, { value: "777", label: "directory / executable (777)" }], value: "666", onChange: () => sync() });
    const umaskOut = h("p", {});
    const testOut = h("ul", {});
    const whoSel = select({ label: "Who", options: [{ value: "owner", label: "owner" }, { value: "group", label: "group member" }, { value: "other", label: "other user" }], value: "other", onChange: () => sync() });
    const opSel = select({ label: "Operation", options: [{ value: "r", label: "read" }, { value: "w", label: "write" }, { value: "x", label: "execute" }], value: "r", onChange: () => sync() });
    const verdict = h("p", { "aria-live": "polite" });

    p.controls.append(h("label", {}, h("span", { text: "Octal mode" }), octalIn), h("label", {}, h("span", { text: "Symbolic" }), h("div", {}, h("code", { text: "-" }), sym)));
    p.body.append(table, h("h4", { text: "Can they do it?" }), h("div", { class: "controls" }, whoSel.el, opSel.el), verdict,
      h("h4", { text: "umask" }), h("div", { class: "controls" }, baseSel.el, maskSel.el), umaskOut,
      h("p", { class: "small", html: "Directories need <b>x</b> to be entered/searched and <b>w</b> (together with x) to create or delete entries." }));

    function sync(fromOctal) {
      boxes.forEach((b, i) => { b.checked = bits[i]; });
      if (!fromOctal) octalIn.value = L.bitsToOctal(bits);
      sym.textContent = L.bitsToSymbolic(bits);
      table.querySelectorAll("td.digit").forEach((td, r) => { td.textContent = L.bitsToOctal(bits).charAt(r); });
      const ok = L.allowed(bits, whoSel.get(), opSel.get());
      verdict.innerHTML = `The <b>${whoSel.get() === "group" ? "group member" : whoSel.get()}</b> ${ok ? '<span class="status-ok">is allowed</span>' : '<span class="status-bad">is denied</span>'} to <b>${{ r: "read", w: "write", x: "execute" }[opSel.get()]}</b>.`;
      const res = L.applyUmask(baseSel.get(), maskSel.get());
      umaskOut.innerHTML = `${baseSel.get()} &amp; ~${maskSel.get()} = <b><code>${res}</code></b> (<code>${L.bitsToSymbolic(L.octalToBits(res))}</code>)`;
    }
    sync();
  });

  OSUI.register("acm", (el) => {
    const p = panel(el, "Access control matrix: ACLs vs. capabilities",
      "Edit the rights in any cell (letters r, w, x). The same matrix can be stored by column (an <dfn data-term=\"Access control list (ACL)\">ACL</dfn> per object) or by row (a capability list per subject).");
    const subjects = ["Alice", "Bob", "Carol"], objects = ["report.txt", "payroll.db", "printer"];
    const m = [["rw", "", "w"], ["r", "rw", "w"], ["", "r", ""]];
    const grid = h("table", { class: "compact" });
    const lists = h("div", { class: "row" });
    const result = h("p", { "aria-live": "polite" });
    const sSel = select({ label: "Subject", options: subjects, value: "Carol", onChange: check });
    const oSel = select({ label: "Object", options: objects, value: "payroll.db", onChange: check });
    const rSel = select({ label: "Right", options: ["r", "w", "x"], value: "r", onChange: check });

    function build() {
      grid.replaceChildren(h("thead", {}, h("tr", {}, h("th", {}, h("span", { class: "sr-only", text: "Subject" })), objects.map((o) => h("th", { scope: "col", text: o })))),
        h("tbody", {}, subjects.map((s, i) => h("tr", {}, h("th", { scope: "row", text: s }), objects.map((o, j) => {
          const inp = h("input", { type: "text", size: 3, maxlength: 3, value: m[i][j], "aria-label": `${s} rights on ${o}`,
            oninput: () => { m[i][j] = [...new Set(inp.value.toLowerCase().split("").filter((c) => "rwx".includes(c)))].join(""); lists_(); check(); } });
          return h("td", {}, inp);
        })))));
    }
    function fmt(a) { return a.length ? a.join(", ") : "(none)"; }
    function lists_() {
      lists.replaceChildren(
        h("div", { class: "callout" }, h("strong", { text: "ACLs (stored with each object)" }),
          h("ul", {}, objects.map((o, j) => h("li", { html: `<b>${o}</b>: ${fmt(subjects.map((s, i) => m[i][j] && `${s}:${m[i][j]}`).filter(Boolean))}` })))),
        h("div", { class: "callout" }, h("strong", { text: "Capability lists (held by each subject)" }),
          h("ul", {}, subjects.map((s, i) => h("li", { html: `<b>${s}</b>: ${fmt(objects.map((o, j) => m[i][j] && `${o}:${m[i][j]}`).filter(Boolean))}` })))));
    }
    function check() {
      const i = subjects.indexOf(sSel.get()), j = objects.indexOf(oSel.get()), r = rSel.get();
      const ok = m[i][j].includes(r);
      result.innerHTML = `${subjects[i]} ${ok ? '<span class="status-ok">may</span>' : '<span class="status-bad">may not</span>'} <b>${r}</b> ${objects[j]}.`;
    }
    p.body.append(grid, lists, h("h4", { text: "Check a request" }), h("div", { class: "controls" }, sSel.el, rSel.el, oSel.el), result,
      h("p", { class: "small", text: "Trade-off: ACLs make it easy to answer “who can access this object?” and to revoke access to an object. Capability lists make it easy to answer “what can this subject do?”" }));
    build(); lists_(); check();
  });
})();
