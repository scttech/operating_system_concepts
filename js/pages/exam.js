/* Exam mode page. Selection and scoring are in js/lib/exam.js; results are recorded through OSProgress. */
(function () {
  "use strict";
  const base = document.body.dataset.root || "";
  const { h } = OSUI;
  const L = OSLib, P = window.OSProgress, $ = (id) => document.getElementById(id);
  const now = () => (typeof window.OSExamNow === "function" ? window.OSExamNow() : Date.now());
  let exam = null, answers = [], endsAt = null, startedAt = 0, timer = null, announced = {};

  // ----- setup: module checkboxes grouped by part -----
  const boxes = [];
  OSData.parts.forEach((part, i) => {
    const group = h("fieldset", { class: "exam-part" }, h("legend", { text: `Part ${i + 1}: ${part.title}` }));
    part.modules.forEach((n) => {
      const m = OSData.modules.find((x) => x.n === n), count = OSData.quizzes.filter((q) => q.mod === n).length;
      const cb = h("input", { type: "checkbox", value: n, checked: true });
      boxes.push(cb);
      group.append(h("label", { class: "pick" }, cb, ` ${m.n}. ${m.title} `, h("span", { class: "small", text: `(${count} questions)` })));
    });
    $("modules").append(group);
  });
  $("all").addEventListener("click", () => boxes.forEach((b) => { b.checked = true; }));
  $("none").addEventListener("click", () => boxes.forEach((b) => { b.checked = false; }));

  $("setup").addEventListener("submit", (e) => {
    e.preventDefault();
    const mods = boxes.filter((b) => b.checked).map((b) => +b.value);
    if (!mods.length) { $("setup-msg").textContent = "Choose at least one module."; return; }
    $("setup-msg").textContent = "";
    start(mods, +$("count").value, +$("time").value);
  });

  // ----- running -----
  function start(mods, count, timeFactor) {
    exam = L.buildExam(OSData.quizzes, { mods, count });
    answers = exam.items.map(() => null);
    startedAt = now();
    announced = {};
    const seconds = timeFactor ? L.suggestedSeconds(exam.items.length) * (timeFactor === 2 ? 2 : 1) : 0;
    endsAt = seconds ? startedAt + seconds * 1000 : null;
    $("setup").hidden = true; $("results").hidden = true; $("exam").hidden = false;
    $("questions").replaceChildren(...exam.items.map((it, i) => {
      const name = `q${i}`, stem = `stem${i}`;
      return h("fieldset", { class: "exam-q" },
        h("legend", { id: stem, text: `${i + 1}. ${it.q.q}` }),
        ...it.order.map((ci) => h("label", { class: "choice-line" }, h("input", { type: "radio", name, value: ci, onchange: () => { answers[i] = ci; refresh(); } }), ` ${it.q.choices[ci]}`)));
    }));
    refresh();
    clearInterval(timer);
    timer = setInterval(check, 1000);
    $("exam").scrollIntoView && $("exam").scrollIntoView();
  }
  function refresh() {
    const n = answers.filter((a) => a !== null).length;
    $("answered").textContent = `${n} of ${answers.length} answered`;
    if (endsAt === null) $("clock").textContent = "No time limit";
    else $("clock").textContent = L.formatClock((endsAt - now()) / 1000);
  }
  function say(t) { $("alerts").textContent = t; }
  /** Called every second (and by tests): updates the clock, warns at 5 minutes, 1 minute and 30 seconds, and submits when time is up. */
  function check() {
    if (!exam || !$("results").hidden) return;
    refresh();
    if (endsAt === null) return;
    const left = (endsAt - now()) / 1000;
    [[300, "5 minutes left."], [60, "1 minute left."], [30, "30 seconds left."]].forEach(([t, msg]) => { if (left <= t && !announced[t] && left > 0) { announced[t] = true; say(msg); } });
    $("exam-bar").classList.toggle("low", left <= 60);
    if (left <= 0) { say("Time is up. Your answers were submitted."); submit(true); }
  }

  // ----- results -----
  function submit(timedOut) {
    if (!exam) return;
    clearInterval(timer); timer = null;
    const s = L.scoreExam(exam, answers), seconds = Math.max(0, Math.round((now() - startedAt) / 1000));
    exam.items.forEach((it, i) => { if (answers[i] !== null && P) P.answer(it.q.mod, it.q.q, answers[i] === it.q.answer); });
    if (P) P.exam({ mods: exam.mods, total: s.total, correct: s.correct, seconds });
    $("exam").hidden = true; $("results").hidden = false;
    const mods = Object.keys(s.byModule).map(Number).sort((a, b) => a - b);
    $("results").replaceChildren(
      h("h2", { id: "score", text: `Score: ${s.correct} of ${s.total} (${s.percent}%)` }),
      h("p", {}, `${s.wrong} wrong, ${s.unanswered} left blank. Time used: ${L.formatClock(seconds)}.${timedOut ? " The time limit ended the exam." : ""}`),
      h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Module", "Right", "Of"].map((t) => h("th", { text: t })))),
        h("tbody", {}, mods.map((n) => h("tr", {}, h("td", {}, h("a", { href: base + `modules/${OSData.modules.find((m) => m.n === n).slug}.html`, text: `${n}. ${OSData.modules.find((m) => m.n === n).title}` })), h("td", { text: s.byModule[n].correct }), h("td", { text: s.byModule[n].total }))))),
      s.misses.length ? h("h3", { text: `Review: ${s.misses.length} to look at again` }) : h("p", { class: "status-ok", text: "Every question was right." }),
      ...s.misses.map(({ item, chosen }) => h("div", { class: "q review" },
        h("p", { class: "stem", text: item.q.q }),
        h("p", {}, chosen === null ? h("em", { text: "You left this blank. " }) : h("span", {}, "You chose: ", h("span", { class: "status-bad", text: item.q.choices[chosen] }), ". "), "Correct answer: ", h("strong", { class: "status-ok", text: item.q.choices[item.q.answer] }), "."),
        h("p", { class: "small", text: item.q.explain }),
        h("p", { class: "small" }, "Module: ", h("a", { href: base + `modules/${OSData.modules.find((m) => m.n === item.q.mod).slug}.html`, text: `${item.q.mod}. ${OSData.modules.find((m) => m.n === item.q.mod).title}` })))),
      h("div", { class: "row" }, h("button", { class: "btn", id: "again", type: "button", text: "New exam" }), h("a", { class: "btn secondary", href: "progress.html", text: "My progress" })));
    $("again").addEventListener("click", () => { $("results").hidden = true; $("setup").hidden = false; exam = null; window.scrollTo && window.scrollTo(0, 0); });
    $("score").setAttribute("tabindex", "-1"); $("score").focus();
  }
  $("submit").addEventListener("click", () => submit(false));
  $("submit2").addEventListener("click", () => submit(false));
  window.OSExam = { check };
})();
