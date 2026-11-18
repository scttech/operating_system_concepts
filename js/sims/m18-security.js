/* Module 18: security in depth. Stack smashing and its defenses, password guessing and hashing, and a STRIDE exercise. */
(function () {
  "use strict";
  const { h, panel, select, slider, button } = OSUI;
  const L = OSLib;

  // ---------- stack attack ----------
  OSUI.register("stackattack", (el) => {
    const p = panel(el, "Overflow a buffer and see what it reaches",
      "A function copies your input into a 16-byte buffer <b>without checking its length</b>. Above the buffer, on the stack, sit the saved state the function needs to return. Slide the input length up, then switch defenses on. The frame is drawn with the highest address at the top.");
    const o = { inputLen: 8, crafted: false, canary: false, nx: false, aslr: false, leak: false, target: "shellcode" };
    const lenSl = slider({ label: "Input length (bytes)", min: 0, max: 32, value: o.inputLen, format: (v) => `${v} byte${v === 1 ? "" : "s"}`, onInput: (v) => { o.inputLen = v; draw(); } });
    const cb = (key, label) => { const c = h("input", { type: "checkbox", onchange: () => { o[key] = c.checked; draw(); } }); return { c, el: h("label", {}, h("span", { text: label.split(":")[0] }), h("span", {}, c, ` ${label.split(":").slice(1).join(":").trim()}`)) }; };
    const crafted = cb("crafted", "Attacker: writes a chosen address over the return address (not just filler)");
    const canary = cb("canary", "Defense: stack canary");
    const nx = cb("nx", "Defense: non-executable stack (NX)");
    const aslr = cb("aslr", "Defense: address-space layout randomization (ASLR)");
    const leak = cb("leak", "Attacker: has an information leak (knows the canary and addresses)");
    const targetSel = select({ label: "Attacker wants to jump to", options: [{ value: "shellcode", label: "code the attacker put in the input" }, { value: "reuse", label: "code that already exists (existing library functions)" }], value: o.target, onChange: (v) => { o.target = v; draw(); } });
    const presets = h("div", { class: "row" },
      button("Fits in the buffer", () => set({ inputLen: 12 }), true), button("Plain overflow", () => set({ inputLen: 28 }), true),
      button("Real attack, no defenses", () => set({ inputLen: 24, crafted: true }), true), button("All three defenses", () => set({ inputLen: 28, crafted: true, canary: true, nx: true, aslr: true }), true),
      button("Defenses and an information leak", () => set({ inputLen: 28, crafted: true, canary: true, nx: true, aslr: true, leak: true, target: "reuse" }), true));
    p.controls.append(lenSl.el, crafted.el, canary.el, nx.el, aslr.el, leak.el, targetSel.el);
    const verdict = h("p", { "aria-live": "polite", style: "font-weight:700" }), steps = h("ol", { "aria-live": "polite" }), frame = h("div", { class: "stack-frame", role: "img" });
    p.body.append(presets, frame, verdict, steps);

    function set(v) {
      Object.assign(o, { inputLen: 8, crafted: false, canary: false, nx: false, aslr: false, leak: false, target: "shellcode" }, v);
      lenSl.set(o.inputLen); crafted.c.checked = o.crafted; canary.c.checked = o.canary; nx.c.checked = o.nx; aslr.c.checked = o.aslr; leak.c.checked = o.leak; targetSel.set(o.target);
      draw();
    }
    function draw() {
      const r = L.stackAttack(o), segs = r.layout.segs.slice().reverse();
      frame.setAttribute("aria-label", `Stack frame, ${r.layout.size} bytes: ${r.layout.segs.map((s) => s.name).join(", ")}. Outcome: ${L.stackOutcomes[r.outcome]}.`);
      frame.replaceChildren(...segs.map((s) => {
        const mine = r.cells.filter((c) => c.seg === s.name), over = mine.filter((c) => c.state === "written").length;
        return h("div", { class: "stack-seg" }, h("div", { class: "stack-name" }, h("b", { text: s.name }), h("span", { class: "small", text: s.name === "buffer" ? ` ${s.len} bytes, address ${s.start}` : ` address ${s.start}${over ? ": overwritten" : ""}` })),
          h("div", { class: "stack-cells" }, mine.map((c) => h("span", { class: `cell ${c.state} ${s.name === "canary" ? "canary" : s.name === "return address" ? "ret" : ""}`, title: `byte ${c.offset}: ${c.state === "written" ? "written by the input" : c.state === "empty" ? "not written" : "untouched"}`, text: c.state === "written" ? "A" : c.state === "empty" ? "" : s.name === "canary" ? "?" : "·" }))));
      }));
      const good = r.outcome === "safe" || r.outcome === "canary-abort" || r.outcome === "blocked-nx";
      verdict.className = r.outcome === "hijacked" ? "status-bad" : good ? "status-ok" : "";
      verdict.textContent = `${L.stackOutcomes[r.outcome]}.`;
      steps.replaceChildren(...r.steps.map((t) => h("li", { text: t })));
    }
    draw();
  });

  // ---------- passwords ----------
  OSUI.register("pwcrack", (el) => {
    const p = panel(el, "How long does guessing a password take?",
      "Attackers do not type guesses: they try millions per second. This estimates the <b>average</b> time to find a password, by how it was chosen and what the attacker has. The speeds are round illustrative figures, not measurements.");
    let length = 8, charset = "lower", how = "random";
    const lenSl = slider({ label: "Length", min: 4, max: 24, value: length, format: (v) => `${v} characters`, onInput: (v) => { length = v; draw(); } });
    const setSel = select({ label: "Characters used", options: Object.entries(L.charsets).map(([value, c]) => ({ value, label: `${c[0]} (${c[1]})` })), value: charset, onChange: (v) => { charset = v; draw(); } });
    const howSel = select({ label: "How was it chosen?", options: [{ value: "random", label: "Randomly, character by character" }, { value: "human", label: "A common word with digits added, the way people usually do it" }], value: how, onChange: (v) => { how = v; draw(); } });
    p.controls.append(lenSl.el, setSel.el, howSel.el);
    const summary = h("p", { "aria-live": "polite" }), table = h("div", {});
    p.body.append(summary, table);
    const HUMAN = 100000 * 100 * 2;   // roughly: 100,000 common words x two digits x capitalized or not
    function draw() {
      const space = how === "random" ? L.passwordSpace(length, L.charsets[charset][1]) : HUMAN, bits = L.entropyBits(space);
      lenSl.el.querySelector("input").disabled = setSel.el.querySelector("select").disabled = how !== "random";   // a human-chosen password ignores both
      summary.textContent = how === "random" ? `${length} characters from an alphabet of ${L.charsets[charset][1]}: about ${space.toExponential(1)} possibilities, ${bits.toFixed(0)} bits of entropy.`
        : `A common word with digits has only about ${HUMAN.toLocaleString()} likely forms (${bits.toFixed(0)} bits), however long it looks, because attackers try words and habits first.`;
      table.replaceChildren(h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Attacker", "Guesses per second", "Average time to find it"].map((t) => h("th", { text: t })))),
        h("tbody", {}, Object.values(L.attackers).map((a) => { const t = L.crackSeconds(space, a.rate); return h("tr", {}, h("td", { text: a.label }), h("td", { text: a.rate.toLocaleString("en-US", { notation: "compact" }) }), h("td", { class: t < 86400 * 30 ? "status-bad" : t > 31557600 * 100 ? "status-ok" : "", text: L.humanTime(t) })); }))),
        h("p", { class: "small", text: "Red: under a month. Green: over a century. The slow, salted hash turns the same password into a task ten million times harder than a fast unsalted one." }));
    }
    draw();
  });

  OSUI.register("hashdemo", (el) => {
    const p = panel(el, "What a salt and repetition do to a stored password",
      "Two users, Alice and Bob, choose the <b>same password</b>. See what a system that stores only a plain hash reveals, and what changes with a random salt and with repeating the hash. The hash is SHA-256, computed here in your browser: nothing you type leaves it.");
    let pw = "correct horse", rounds = 1000, salts = ["a1b2c3d4", "9f8e7d6c"];
    const input = h("input", { type: "text", value: pw, size: 24, maxlength: 40, "aria-label": "Password", oninput: () => { pw = input.value; draw(); } });
    const rSl = slider({ label: "Times the hash is repeated", min: 1, max: 5000, value: rounds, format: (v) => v.toLocaleString(), onInput: (v) => { rounds = v; draw(); } });
    const rand = () => Array.from({ length: 8 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    p.controls.append(h("label", {}, h("span", { text: "Both users' password" }), input), rSl.el, button("New random salts", () => { salts = [rand(), rand()]; draw(); }, true));
    const out = h("div", { "aria-live": "polite" });
    p.body.append(out);
    function draw() {
      const short = (x) => x.slice(0, 24) + "…";
      const rows = [["No salt", L.plainHash(pw), L.plainHash(pw), "Identical: anyone who reads the file can see that Alice and Bob share a password, and one cracked hash cracks both. A precomputed table of hashes works against every site."],
        ["Salted", L.saltedHash(salts[0], pw), L.saltedHash(salts[1], pw), "Different, so each user must be attacked separately, and precomputed tables are useless."],
        [`Salted, repeated ${rounds.toLocaleString()} times`, L.stretchedHash(salts[0], pw, rounds), L.stretchedHash(salts[1], pw, rounds), `Also different. Now every guess costs ${rounds.toLocaleString()} hashes, for the attacker (and for you, once per login).`]];
      out.replaceChildren(h("p", { class: "small" }, `Salts: Alice ${salts[0]}, Bob ${salts[1]} (stored next to the hash; they are not secret).`),
        h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["How it is stored", "Alice's stored hash", "Bob's stored hash", "Same?"].map((t) => h("th", { text: t })))),
          h("tbody", {}, rows.map(([k, a, b]) => h("tr", {}, h("td", { text: k }), h("td", {}, h("code", { text: short(a), title: a })), h("td", {}, h("code", { text: short(b), title: b })), h("td", { class: a === b ? "status-bad" : "status-ok", text: a === b ? "identical" : "different" }))))),
        h("ul", {}, rows.map(([k, , , note]) => h("li", {}, h("b", { text: k + ": " }), note))));
    }
    draw();
  });

  // ---------- threat modeling ----------
  OSUI.register("threatmodel", (el) => {
    const p = panel(el, "Threat-modeling exercise: classify the threats with STRIDE",
      "Threat modeling means asking, before attackers do, what could go wrong. <b>STRIDE</b> is a checklist of six kinds of threat. Read each threat, choose the category that fits best, then check your answers.");
    let sys = OSData.threatSystems[0], answers = {}, checked = false;
    const sysSel = select({ label: "System", options: OSData.threatSystems.map((s) => ({ value: s.id, label: s.name })), value: sys.id, onChange: (v) => { sys = OSData.threatSystems.find((s) => s.id === v); answers = {}; checked = false; draw(); } });
    p.controls.append(sysSel.el);
    const key = h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Letter", "Threat", "In plain words"].map((t) => h("th", { text: t })))),
      h("tbody", {}, Object.keys(L.stride).map((k) => h("tr", {}, h("td", { text: k }), h("td", { text: L.stride[k] }), h("td", { text: L.strideAsks[k] })))));
    const body = h("div", {}), score = h("p", { "aria-live": "polite", style: "font-weight:700" });
    p.body.append(h("details", {}, h("summary", { text: "The six STRIDE categories" }), key), body, h("div", { class: "row" }, button("Check my answers", () => { checked = true; draw(); }), button("Show all answers", () => { sys.threats.forEach((t, i) => { answers[i] = t.cat; }); checked = true; draw(); }, true), button("Start over", () => { answers = {}; checked = false; draw(); }, true)), score);
    function draw() {
      const r = L.scoreThreats(sys, answers);
      body.replaceChildren(h("p", { text: sys.description }), h("p", { class: "small", text: `Parts of the system: ${sys.components.join(", ")}.` }),
        h("ol", {}, sys.threats.map((t, i) => {
          const res = r.results[i];
          const sel = h("select", { "aria-label": `Category for threat ${i + 1}`, onchange: () => { answers[i] = sel.value || undefined; if (!sel.value) delete answers[i]; checked = false; draw(); } },
            h("option", { value: "", text: "Choose…" }), Object.entries(L.stride).map(([k, name]) => h("option", { value: k, selected: answers[i] === k, text: `${k}: ${name}` })));
          return h("li", { style: "margin:.7rem 0" }, h("div", { text: t.text }), h("div", { class: "row" }, sel,
            checked && res.answered ? h("span", { class: res.correct ? "status-ok" : "status-bad", text: res.correct ? "Correct" : `Not quite. The best fit is ${t.cat}: ${L.stride[t.cat]}.` }) : null),
            checked && res.answered ? h("div", { class: "small" }, h("div", { text: t.why }), h("div", {}, h("b", { text: "A usual defense: " }), t.fix)) : null);
        })));
      score.textContent = checked ? `You answered ${r.answered} of ${r.total}, and ${r.correct} are right.` : "";
    }
    draw();
  });
})();
