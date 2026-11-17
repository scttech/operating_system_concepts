(function () {
  "use strict";
  const { h } = OSUI;
  const mod = document.getElementById("mod"), num = document.getElementById("num"), go = document.getElementById("go"), host = document.getElementById("quiz");
  mod.append(h("option", { value: "all", text: "All modules" }), ...OSData.modules.map((m) => h("option", { value: m.n, text: `${m.n}. ${m.title}` })));
  function build() {
    let qs = OSData.quizzes.filter((q) => mod.value === "all" || q.mod === +mod.value);
    qs = OSQuiz.shuffled(qs);
    if (num.value !== "all") qs = qs.slice(0, +num.value);
    OSQuiz.render(host, qs, { shuffleChoices: true, showModule: true });
  }
  go.addEventListener("click", build);
  mod.addEventListener("change", build); num.addEventListener("change", build);
  build();
})();
