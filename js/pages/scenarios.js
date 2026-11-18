/* Scenario questions: pick a situation, choose an approach, read why each option is or is not right. */
(function () {
  "use strict";
  const base = document.body.dataset.root || "";
  const { h } = OSUI;
  const host = document.getElementById("scenario"), topic = document.getElementById("topic");
  const topics = [...new Set(OSData.scenarios.map((s) => s.topic))].sort();
  topic.append(h("option", { value: "", text: "All topics" }), ...topics.map((t) => h("option", { value: t, text: t })));
  let current = null, shuffleOrder = [];

  const pool = () => OSData.scenarios.filter((s) => !topic.value || s.topic === topic.value);
  function pick() {
    const p = pool();
    if (!p.length) { host.replaceChildren(h("p", { text: "No scenarios in this topic." })); return; }
    const others = p.length > 1 ? p.filter((s) => !current || s.id !== current.id) : p;
    current = others[Math.floor(Math.random() * others.length)];
    show();
  }
  function show() {
    const s = current, m = OSData.modules.find((x) => x.n === s.mod);
    shuffleOrder = OSQuiz.shuffled(s.options.map((_, i) => i));
    const explain = h("div", { class: "explain", hidden: true, role: "status" });
    const buttons = shuffleOrder.map((i) => h("button", { type: "button", class: "choice", "data-i": i, text: s.options[i], onclick: () => answer(i) }));
    function answer(chosen) {
      buttons.forEach((b) => { b.disabled = true; if (+b.dataset.i === s.answer) b.classList.add("correct"); else if (+b.dataset.i === chosen) b.classList.add("wrong"); });
      explain.hidden = false;
      explain.replaceChildren(h("p", {}, h("strong", { text: chosen === null ? "Best fit: " : chosen === s.answer ? "Right. " : "Not the best fit. " }), s.notes[s.answer]),
        h("h3", { text: "Why each option does or does not fit" }),
        h("ul", {}, shuffleOrder.map((i) => h("li", {}, h("b", { text: s.options[i] + (i === s.answer ? " (best fit)" : "") + ": " }), s.notes[i]))),
        h("p", { class: "small" }, "Learn more: ", h("a", { href: base + `modules/${m.slug}.html`, text: `Module ${m.n}: ${m.title}` }), "."));
      explain.focus && explain.setAttribute("tabindex", "-1");
    }
    const reveal = h("button", { type: "button", class: "btn secondary", text: "Just show the answer", onclick: () => { answer(null); reveal.hidden = true; } });
    host.replaceChildren(h("div", { class: "q" },
      h("p", {}, h("span", { class: "tag", text: s.topic }), " ", h("span", { class: "small", text: `Module ${s.mod}` })),
      h("p", { class: "stem", text: s.situation }), h("p", { class: "stem" }, h("b", { text: s.question })),
      h("ul", {}, buttons.map((b) => h("li", {}, b))), reveal, explain));
  }
  topic.addEventListener("change", () => { current = null; pick(); });
  document.getElementById("next").addEventListener("click", pick);
  pick();
})();
