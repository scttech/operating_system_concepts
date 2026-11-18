/* Flashcards page. The choice of card is in js/lib/cards.js; boxes are stored through OSProgress. */
(function () {
  "use strict";
  const { h } = OSUI;
  const L = OSLib, P = window.OSProgress, $ = (id) => document.getElementById(id);
  const cat = $("cat"), dir = $("dir"), known = $("known"), host = $("card"), flip = $("flip"), knew = $("knew"), learning = $("learning");
  cat.append(h("option", { value: "", text: "All topics" }), ...[...new Set(OSData.glossary.map((g) => g.cat))].sort().map((c) => h("option", { value: c, text: c })));
  let current = null, last = null, revealed = false;

  const deck = () => L.buildDeck(OSData.glossary, { cat: cat.value });
  function stats() {
    const d = deck(), s = L.deckStats(d, P.state.cards);
    $("stats").textContent = `${s.total} cards in this set: ${s.known} known, ${s.learning} still learning (${s.boxes[0]} new or missed, ${s.boxes[1]} seen once, ${s.boxes[2]} nearly there).`;
  }
  function where(term) {
    const e = (OSData.glossaryIndex || {})[term], m = e && e[0] && OSData.modules.find((x) => x.n === e[0].m);
    if (!m) return null;
    return h("a", { href: `modules/${m.slug}.html${e[0].kind === "dfn" ? "#" + e[0].id : ""}`, text: `Module ${m.n}: ${m.title}` });
  }
  function show() {
    revealed = false;
    const pool = L.studyableCards(deck(), P.state.cards, known.value === "mix");
    current = L.pickCard(pool, P.state.cards, last, Math.random);
    stats();
    flip.hidden = false; knew.hidden = true; learning.hidden = true;
    if (!current) { host.replaceChildren(h("p", {}, "Nothing to review here: every card in this set is marked known. Choose “Mix them in”, or another topic.")); flip.hidden = true; return; }
    const first = dir.value === "term" ? current.term : current.def;
    host.replaceChildren(h("div", { class: "face front" }, h("span", { class: "tag", text: current.cat }), h("p", { class: "big", text: first })), h("div", { class: "face back", id: "answer", hidden: true }));
    flip.textContent = "Show answer";
  }
  function reveal() {
    if (!current || revealed) return;
    revealed = true;
    const back = $("answer"), second = dir.value === "term" ? current.def : current.term, w = where(current.term);
    back.replaceChildren(h("p", { class: "big", text: second }), w ? h("p", { class: "small" }, "Discussed in ", w) : null);
    back.hidden = false; flip.hidden = true; knew.hidden = false; learning.hidden = false; knew.focus();
  }
  function grade(ok) {
    if (!current || !revealed) return;
    P.card(current.term, ok);
    last = current.term;
    show();
  }
  flip.addEventListener("click", reveal);
  knew.addEventListener("click", () => grade(true));
  learning.addEventListener("click", () => grade(false));
  [cat, dir, known].forEach((el) => el.addEventListener("change", () => { last = null; show(); }));
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target || {}).tagName || "")) return;
    if (e.key === " " && !revealed) { e.preventDefault(); reveal(); }
    else if (revealed && /^[kK]$/.test(e.key)) grade(true);
    else if (revealed && /^[lL]$/.test(e.key)) grade(false);
  });
  show();
})();
