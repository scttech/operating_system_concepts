/* The progress page: summary of the stored progress, and export, import and clear. Everything stays in this browser. */
(function () {
  "use strict";
  const base = document.body.dataset.root || "";
  const { h } = OSUI;
  const P = window.OSProgress, $ = (id) => document.getElementById(id);

  function bar(percent, label) {
    return h("div", { class: "bar", role: "img", "aria-label": label }, h("div", { class: "fill", style: `width:${percent}%` }));
  }

  function render() {
    const s = P.summary();
    const note = $("storage-note");
    note.hidden = P.stored;
    if (!P.stored) note.textContent = "This browser is not letting the site store anything (a private window or a privacy setting). Your progress works while this page stays open and will be lost afterwards. Export it if you want to keep it.";

    $("overview").replaceChildren(...[[`${s.visitedCount} of ${s.moduleCount}`, "modules visited"], [`${s.mastered} of ${s.questions}`, "quiz questions mastered"], [String(s.exams.length), "exams taken"], [String(s.cards.known), "flashcards known"]]
      .map(([v, k]) => h("div", { class: "metric" }, h("b", { text: v }), h("span", { text: k }))));

    const byNum = Object.fromEntries(s.rows.map((r) => [r.n, r]));
    $("modules").replaceChildren(...OSData.parts.map((part, i) => h("section", { class: "part" },
      h("h2", { text: `Part ${i + 1}: ${part.title}` }),
      h("div", { class: "table-scroll" }, h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Module", "First visited", "Questions mastered", "Right of answered"].map((t) => h("th", { text: t })))),
        h("tbody", {}, part.modules.map((n) => {
          const r = byNum[n], m = OSData.modules.find((x) => x.n === n);
          return h("tr", {}, h("td", {}, h("a", { href: base + `modules/${m.slug}.html`, text: `${m.n}. ${m.title}` })), h("td", { text: r.visited || "not yet" }),
            h("td", {}, bar(r.percent, `${r.mastered} of ${r.total} mastered`), h("span", { class: "small", text: ` ${r.mastered} of ${r.total}` })),
            h("td", { text: r.answered ? `${r.correct} of ${r.answered}` : "none yet" }));
        })))))));

    $("cards-summary").replaceChildren(s.cards.seen ? `You have seen ${s.cards.seen} cards: ${s.cards.known} known, ${s.cards.learning} still learning. ` : "No flashcards reviewed yet. ", h("a", { href: "flashcards.html", text: "Practice flashcards" }), ".");
    $("exams").replaceChildren(s.exams.length
      ? h("div", { class: "table-scroll" }, h("table", { class: "compact" }, h("thead", {}, h("tr", {}, ["Date", "Modules", "Score", "Time"].map((t) => h("th", { text: t })))),
        h("tbody", {}, s.exams.slice().reverse().map((e) => h("tr", {}, h("td", { text: e.date }), h("td", { text: e.mods.join(", ") }), h("td", { text: `${e.correct} of ${e.total} (${Math.round((e.correct / e.total) * 100)}%)` }), h("td", { text: `${Math.floor(e.seconds / 60)}:${String(e.seconds % 60).padStart(2, "0")}` }))))))
      : h("p", {}, "No exams yet. ", h("a", { href: "exam.html", text: "Take a timed exam" }), "."));
    document.querySelectorAll(".table-scroll").forEach((t) => OSUI.watchScroll(t));
  }

  const say = (t, ok) => { const m = $("message"); m.textContent = t; m.className = "small " + (ok ? "status-ok" : "status-bad"); };

  $("export").addEventListener("click", () => {
    const text = P.exportText();
    $("export-text").value = text; $("export-box").hidden = false; $("export-text").focus(); $("export-text").select();
    if (window.URL && URL.createObjectURL && window.Blob) { const a = $("download"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.hidden = false; }
    say("Export text is ready below. Keep it somewhere safe.", true);
  });
  $("clear").addEventListener("click", () => { $("clear-confirm").hidden = false; $("clear-no").focus(); });
  $("clear-no").addEventListener("click", () => { $("clear-confirm").hidden = true; $("clear").focus(); });
  $("clear-yes").addEventListener("click", () => { P.clear(); $("clear-confirm").hidden = true; $("export-box").hidden = true; render(); say("Your progress was cleared from this browser.", true); });
  function doImport(text) {
    const r = P.importText(text);
    if (r.ok) { render(); say("Imported. This replaced the progress that was here.", true); $("import-text").value = ""; } else say(r.error, false);
  }
  $("import").addEventListener("click", () => doImport($("import-text").value));
  $("import-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 200000) { say("That file is too large to be a progress export.", false); return; }
    const reader = new FileReader();
    reader.onload = () => doImport(String(reader.result));
    reader.onerror = () => say("The file could not be read.", false);
    reader.readAsText(f);
  });

  render();
})();
