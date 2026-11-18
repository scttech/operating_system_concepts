(function () {
  "use strict";
  const base = document.body.dataset.root || "";
  const { h, fill } = OSUI;
  const L = OSLib;
  const kinds = L.problemKinds, byId = Object.fromEntries(kinds.map((k) => [k.id, k]));
  const mods = Object.fromEntries(OSData.modules.map((m) => [m.n, m]));
  const host = document.getElementById("problem"), topicSel = document.getElementById("topic"), levelSel = document.getElementById("level"), newBtn = document.getElementById("new"), scoreEl = document.getElementById("score");

  topicSel.append(h("option", { value: "any", text: "Any topic (random)" }), ...kinds.map((k) => h("option", { value: k.id, text: k.title })));

  let problem = null, attempts = 0, revealed = false, solved = false;
  const stats = { shown: 0, firstTry: 0, streak: 0 };

  const randomSeed = () => Math.floor(Math.random() * 2147483647);
  function updateScore() {
    scoreEl.textContent = stats.shown ? `This visit: ${stats.firstTry} of ${stats.shown} problem${stats.shown > 1 ? "s" : ""} solved on the first try${stats.streak > 1 ? ` · current streak ${stats.streak}` : ""}` : "";
  }
  function setHash(code) {
    try { history.replaceState(null, "", `#p=${code}`); } catch (e) { /* e.g. some file:// contexts */ }
  }

  function show(next, fromLink = false) {
    problem = next; attempts = 0; revealed = false; solved = false;
    stats.shown++;
    setHash(problem.code);
    // Only a link changes the pickers. Otherwise "Any topic" would turn into whatever topic was picked at random.
    if (fromLink) { topicSel.value = problem.kind; levelSel.value = String(problem.level); }
    render(); updateScore();
  }
  function newProblem() {
    const kind = topicSel.value === "any" ? kinds[Math.floor(Math.random() * kinds.length)].id : topicSel.value;
    show(L.generateProblem(kind, randomSeed(), +levelSel.value));
  }

  function render() {
    const p = problem, m = mods[p.module];
    const result = h("div", { class: "explain", role: "status", "aria-live": "polite", hidden: true });
    const steps = h("div", { class: "explain", hidden: true }, h("strong", { text: "Worked solution" }),
      h("ol", {}, p.steps.map((s) => h("li", { html: s }))));
    const hint = h("p", { class: "small", hidden: true, text: `Hint: ${p.hint}` });
    let answerInput = null;
    const answerArea = p.answerType === "choice"
      ? h("fieldset", { style: "border:0;padding:0;margin:.5rem 0" }, h("legend", { text: "Your answer" }),
        p.choices.map((c, i) => h("label", { style: "display:inline-flex;align-items:center;gap:.4rem;margin-right:1rem" }, h("input", { type: "radio", name: "choice", value: i }), c)))
      : h("label", { style: "display:block;margin:.5rem 0" }, h("span", { text: `Your answer${p.unit ? ` (${p.unit})` : ""}` }),
        answerInput = h("input", { type: "text", inputmode: p.answerType === "number" ? "decimal" : "text", autocomplete: "off", spellcheck: "false", "aria-describedby": "result" , size: 18 }));
    result.id = "result";

    const getInput = () => (p.answerType === "choice" ? (host.querySelector('input[name="choice"]:checked') || {}).value : answerInput.value);
    function doCheck() {
      const r = L.checkProblemAnswer(p, getInput());
      result.hidden = false;
      if (r.empty || r.invalid) { result.className = "explain"; result.textContent = r.message; return; }
      attempts++;
      if (r.correct) {
        if (!solved) { solved = true; if (attempts === 1 && !revealed) { stats.firstTry++; stats.streak++; } else stats.streak = 0; }
        result.className = "explain"; result.innerHTML = `<b class="status-ok">✓ Correct.</b> ${esc(r.expected)}.${attempts === 1 && !revealed ? " Solved on the first try." : ""}`;
        steps.hidden = false;
      } else {
        stats.streak = attempts === 1 ? 0 : stats.streak;
        result.className = "explain"; result.innerHTML = `<b class="status-bad">✗ ${esc(r.message)}</b> You can try again, ask for a hint, or show the solution steps.`;
      }
      updateScore();
    }
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    if (answerInput) answerInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doCheck(); } });

    const buttons = h("div", { class: "row" },
      h("button", { type: "button", class: "btn", text: "Check answer", onclick: doCheck }),
      h("button", { type: "button", class: "btn secondary", text: "Hint", onclick: () => { hint.hidden = false; } }),
      h("button", { type: "button", class: "btn secondary", text: "Show solution steps", onclick: () => { if (!solved) revealed = true; steps.hidden = false; result.hidden = false; result.innerHTML = `<b>Answer:</b> ${esc(p.answerText)}${p.unit ? " " + esc(p.unit) : ""}`; stats.streak = 0; updateScore(); } }),
      h("button", { type: "button", class: "btn secondary", id: "copy-link", text: "Copy link to this problem", onclick: copyLink }));
    const info = h("p", { class: "small", style: "margin-top:.75rem" }, `Problem code: `, h("code", { text: p.code }), " · ", h("a", { href: base + `modules/${m.slug}.html` }, `Review Module ${m.n}: ${m.title}`));
    function copyLink(e) {
      const url = `${location.href.split("#")[0]}#p=${p.code}`, btn = e.currentTarget;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => { btn.textContent = "Link copied"; }, () => { btn.textContent = "Copy the address bar"; });
      setTimeout(() => { btn.textContent = "Copy link to this problem"; }, 2200);
    }

    fill(host, h("h2", { style: "margin-top:0", text: `${p.topic}: ${p.title}` }), h("div", { class: "prompt", html: p.prompt }), answerArea, buttons, hint, result, steps, info);
  }

  newBtn.addEventListener("click", newProblem);
  topicSel.addEventListener("change", newProblem);
  levelSel.addEventListener("change", newProblem);

  // Start from a link (#p=kind:seed:level), a topic link from a lesson (#topic=kind), or a random problem
  const hash = OSSite.safeDecode(location.hash || "");
  const code = /^#p=(.+)$/.exec(hash), topic = /^#topic=([a-z]+)$/.exec(hash);
  const parsed = code && L.parseProblemCode(code[1]);
  if (parsed) show(L.generateProblem(parsed.kind, parsed.seed, parsed.level), true);
  else {
    if (topic && Object.prototype.hasOwnProperty.call(byId, topic[1])) topicSel.value = topic[1];
    newProblem();
  }
})();
