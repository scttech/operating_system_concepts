/* Printable handouts page. What goes on each sheet is decided in js/lib/handouts.js; this file draws it and runs the controls. */
(function () {
  "use strict";
  const { h } = OSUI;
  const L = OSLib, $ = (id) => document.getElementById(id);
  const form = $("setup"), sheet = $("sheet");

  // ----- module checkboxes grouped by part (as on the exam page) -----
  const boxes = [];
  OSData.parts.forEach((part, i) => {
    const group = h("fieldset", { class: "exam-part" }, h("legend", { text: `Part ${i + 1}: ${part.title}` }));
    part.modules.forEach((n) => {
      const m = OSData.modules.find((x) => x.n === n);
      const cb = h("input", { type: "checkbox", value: n, checked: true });
      boxes.push(cb);
      group.append(h("label", { class: "pick" }, cb, ` ${m.n}. ${m.title}`));
    });
    $("modules").append(group);
  });

  const kind = () => form.elements.kind.value;
  const chosen = () => boxes.filter((b) => b.checked).map((b) => +b.value);
  const ruledLine = (label) => h("p", { class: "fill" }, `${label} `, h("span", { class: "rule" }));

  function guide() {
    const blocks = L.studyGuide(OSData.modules, OSData.study, chosen(), OSData.readingOrder);
    return [h("h2", { text: "Study guide" }), ...blocks.map((b) => h("section", { class: "handout-module" },
      h("h3", { text: `Module ${b.n}: ${b.title}` }),
      h("p", { class: "small", text: b.summary }),
      h("h4", { text: "After this module I can…" }),
      h("ul", { class: "checks" }, b.objectives.map((o) => h("li", { text: o }))),
      h("h4", { text: "Ideas to remember" }),
      h("ul", {}, b.takeaways.map((t) => h("li", { text: t })))))];
  }

  function questions() {
    return L.questionList(OSData.modules, OSData.quizzes, chosen(), OSData.readingOrder, +$("count").value);
  }

  function worksheet() {
    const list = L.worksheet(questions());
    const out = [h("h2", { text: "Worksheet" }), h("div", { class: "fills" }, ruledLine("Name"), ruledLine("Date")),
      h("p", { class: "small", text: "Circle the letter of the best answer." })];
    let mod = null;
    list.forEach((x) => {
      if (x.mod !== mod) { mod = x.mod; out.push(h("h3", { text: `Module ${x.mod}: ${x.title}` })); }
      out.push(h("div", { class: "wq" }, h("p", { class: "stem" }, h("b", { text: `${x.number}. ` }), x.q),
        h("ol", { class: "letters", type: "A" }, x.choices.map((c) => h("li", { text: c.text })))));
    });
    return out;
  }

  function key() {
    const list = L.answerKey(questions());
    const out = [h("h2", { text: "Answer key" }), h("p", { class: "small", text: "Numbers match the worksheet printed with the same module choice and the same number of questions per module." })];
    let mod = null;
    list.forEach((x) => {
      if (x.mod !== mod) { mod = x.mod; out.push(h("h3", { text: `Module ${x.mod}: ${x.title}` })); }
      out.push(h("p", { class: "ak" }, h("b", { text: `${x.number}. ${x.answer}. ` }), `${x.text} `, h("span", { class: "small", text: x.explain })));
    });
    return out;
  }

  function prompts() {
    const out = [h("h2", { text: "Discussion and journal prompts" }), h("div", { class: "fills" }, ruledLine("Name"), ruledLine("Date"))];
    L.promptSheet(OSData, chosen(), OSData.readingOrder).forEach((b) => {
      out.push(h("h3", { text: `Module ${b.n}: ${b.title}` }));
      b.prompts.forEach((p, i) => out.push(h("div", { class: "wq" }, h("p", { class: "stem" }, h("b", { text: `${i + 1}. ${p.kind}: ` }), p.text),
        h("div", { class: "lines", "aria-hidden": "true" }, h("span", {}), h("span", {}), h("span", {})))));
    });
    return out;
  }

  function glossary() {
    const groups = L.glossarySheet(OSData.glossary);
    return [h("h2", { text: "Glossary" }), h("div", { class: "gloss" }, groups.map((g) => h("section", {},
      h("h3", { text: g.cat }), h("dl", {}, g.terms.flatMap((t) => [h("dt", { text: t.term }), h("dd", { text: t.def })])))))];
  }

  function render() {
    const k = kind();
    $("mod-set").hidden = k === "glossary";
    $("count-label").hidden = k !== "worksheet" && k !== "key";
    $("print").disabled = false;
    const needs = k !== "glossary" && !chosen().length;
    $("setup-msg").textContent = needs ? "Choose at least one module." : "";
    if (needs) { sheet.replaceChildren(); $("print").disabled = true; return; }
    sheet.replaceChildren(...({ guide, worksheet, key, prompts, glossary }[k])());
    sheet.dataset.kind = k;
  }

  form.addEventListener("change", render);
  $("all").addEventListener("click", () => { boxes.forEach((b) => { b.checked = true; }); render(); });
  $("none").addEventListener("click", () => { boxes.forEach((b) => { b.checked = false; }); render(); });
  $("print").addEventListener("click", () => window.print());
  form.addEventListener("submit", (e) => e.preventDefault());
  render();
})();
