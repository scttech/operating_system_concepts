/* Printable handouts: what goes on each sheet. Pure logic; js/pages/handouts.js draws it.
 *
 *   studyGuide  one block per chosen module: objectives and takeaways
 *   worksheet   the quiz questions for the chosen modules, numbered, with lettered choices (no answers)
 *   answerKey   the matching key: the same numbers, the correct letter and the explanation
 *   glossarySheet  every term grouped by topic
 *
 * The worksheet and its key come from one function (questionList), so question 7 on one is question 7 on the other. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /** Module numbers to print: the chosen ones that exist, in course reading order (or numeric order without one). */
  function chosenModules(modules, chosen, order) {
    const have = new Set(modules.map((m) => m.n));
    const want = new Set(chosen);
    const seq = (order && order.length ? order : modules.map((m) => m.n)).filter((n) => have.has(n));
    return seq.filter((n) => want.has(n));
  }

  /** One block per chosen module: {n, title, objectives, takeaways}. Modules without study notes still appear, with empty lists. */
  function studyGuide(modules, study, chosen, order) {
    return chosenModules(modules, chosen, order).map((n) => {
      const m = modules.find((x) => x.n === n), s = (study && study[n]) || {};
      return { n, title: m.title, summary: m.summary || "", objectives: (s.objectives || []).slice(), takeaways: (s.takeaways || []).slice() };
    });
  }

  /**
   * The numbered questions for the chosen modules: [{number, mod, title, q, choices:[{letter, text}], answer (letter), explain}].
   * perModule limits how many questions each module contributes (the first ones in the bank); 0 or undefined means all.
   */
  function questionList(modules, quizzes, chosen, order, perModule) {
    const out = [];
    chosenModules(modules, chosen, order).forEach((n) => {
      const m = modules.find((x) => x.n === n);
      let qs = quizzes.filter((q) => q.mod === n);
      if (perModule > 0) qs = qs.slice(0, perModule);
      qs.forEach((q) => out.push({
        number: out.length + 1, mod: n, title: m.title, q: q.q,
        choices: q.choices.map((text, i) => ({ letter: LETTERS[i], text })),
        answer: LETTERS[q.answer], explain: q.explain
      }));
    });
    return out;
  }

  /** The worksheet: the questions without any answer. Same objects as the key, with the answer fields removed. */
  function worksheet(list) {
    return list.map(({ number, mod, title, q, choices }) => ({ number, mod, title, q, choices }));
  }

  /** The answer key: {number, mod, answer, text of the correct choice, explain}. */
  function answerKey(list) {
    return list.map((x) => ({ number: x.number, mod: x.mod, title: x.title, answer: x.answer, text: x.choices.find((c) => c.letter === x.answer).text, explain: x.explain }));
  }

  /** Glossary terms grouped by topic, topics and terms alphabetical: [{cat, terms:[{term, def}]}]. */
  function glossarySheet(glossary) {
    const by = new Map();
    glossary.forEach((g) => { if (!by.has(g.cat)) by.set(g.cat, []); by.get(g.cat).push({ term: g.term, def: g.def }); });
    const cmp = (a, b) => a.localeCompare(b, "en", { sensitivity: "base" });
    return [...by.keys()].sort(cmp).map((cat) => ({ cat, terms: by.get(cat).sort((a, b) => cmp(a.term, b.term)) }));
  }

  return { chosenModules, studyGuide, questionList, worksheet, answerKey, glossarySheet };
});
