/* Quiz renderer. Answers are available immediately: click a choice for feedback, or reveal. */
(function () {
  "use strict";
  const { h } = window.OSUI;

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** A question with no choices (short answer): think first, then reveal the model answer. */
  function renderShort(q, idx, onAnswer) {
    const stemId = window.OSUI.nextId("q");
    const explain = h("div", { class: "explain", hidden: true, role: "status" }, h("strong", { text: "Answer: " }), h("span", { text: q.explain }));
    const reveal = h("button", { type: "button", class: "btn secondary reveal", text: "Show answer", onclick: () => { explain.hidden = false; reveal.hidden = true; if (onAnswer) onAnswer(); } });
    return h("div", { class: "q short" }, h("p", { class: "stem", id: stemId, text: `${idx + 1}. ${q.q}` }), h("p", { class: "small", text: "Short answer: write your own, then compare." }), reveal, explain);
  }

  function renderQuestion(q, idx, opts, onAnswer) {
    if (!q.choices) return renderShort(q, idx, onAnswer);
    let order = q.choices.map((_, i) => i);
    if (opts.shuffleChoices !== false) order = shuffled(order); // shuffled by default so the answer position can't be guessed
    const stemId = window.OSUI.nextId("q");
    const buttons = [];
    let answered = false;
    const explain = h("div", { class: "explain", hidden: true, role: "status" });
    const modTitle = (window.OSData.modules.find((m) => m.n === q.mod) || {}).title;

    function reveal(chosen) {
      if (answered && chosen !== null) return;
      const first = !answered;
      answered = true;
      buttons.forEach((b) => {
        b.disabled = true;
        if (+b.dataset.i === q.answer) b.classList.add("correct");
        else if (+b.dataset.i === chosen) b.classList.add("wrong");
      });
      explain.hidden = false;
      explain.replaceChildren(
        h("strong", { text: chosen === null ? "Answer: " : (chosen === q.answer ? "Correct. " : "Not quite. ") }),
        h("span", { text: (chosen === null || chosen !== q.answer ? `The answer is “${q.choices[q.answer]}”. ` : "") + q.explain }));
      if (first && onAnswer) onAnswer(chosen === q.answer, chosen === null);
      revealBtn.hidden = true;
    }

    const list = h("ul", { "aria-labelledby": stemId },
      order.map((ci) => {
        const b = h("button", { type: "button", class: "choice", "data-i": ci, text: q.choices[ci], onclick: () => reveal(ci) });
        buttons.push(b);
        return h("li", {}, b);
      }));
    const revealBtn = h("button", { type: "button", class: "btn secondary reveal", text: "Show answer", onclick: () => reveal(null) });

    return h("div", { class: "q" },
      h("p", { class: "stem", id: stemId },
        `${idx + 1}. ${q.q} `,
        opts.showModule && modTitle ? h("span", { class: "meta", text: `(Module ${q.mod}: ${modTitle})` }) : null),
      list, revealBtn, explain);
  }

  function render(container, questions, opts = {}) {
    container.replaceChildren();
    let right = 0, done = 0;
    const score = h("p", { class: "score", "aria-live": "polite" });
    let update = () => {};
    container.append(score);
    const graded = questions.filter((q) => q.choices).length;
    update = () => { score.textContent = done ? `Score: ${right} / ${done} answered (${graded === questions.length ? questions.length + " questions" : graded + " multiple-choice questions"})` : `${questions.length} questions`; };
    update();
    questions.forEach((q, i) => container.append(renderQuestion(q, i, opts, (ok, revealed) => {
      if (!q.choices) return;   // short answers are not scored
      done++; if (ok) right++; update();
      if (!revealed && opts.record !== false && window.OSProgress) window.OSProgress.answer(q.mod, q.q, ok);
    })));
    if (!questions.length) container.append(h("p", { text: "No questions match this filter." }));
  }

  window.OSQuiz = { render, shuffled };

  // Hands-on labs: <div data-handson-quiz="2"> shows that lab's knowledge checks. They are not recorded in the progress record, which tracks the modules.
  document.querySelectorAll("[data-handson-quiz]").forEach((el) => {
    const n = +el.dataset.handsonQuiz;
    el.classList.add("quiz");
    render(el, (window.OSData.handsonChecks || []).filter((q) => q.lab === n), { record: false });
  });

  document.querySelectorAll("[data-quiz]").forEach((el) => {
    const n = +el.dataset.quiz;
    const qs = (window.OSData.quizzes || []).filter((q) => q.mod === n);
    el.classList.add("quiz");
    render(el, qs, {});
  });
})();
