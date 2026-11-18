/* Exam mode: choosing and shuffling questions, and scoring the answers. Pure logic; the page supplies the random numbers and the clock. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /** Fisher-Yates shuffle with the caller's random source (rnd() in [0, 1)). Returns a new array. */
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /**
   * Pick `count` questions from the chosen modules, spread as evenly as the question bank allows (a round-robin across modules),
   * then shuffle both the questions and each question's choices. Each item is { q: the question, order: choice indexes in the order shown }.
   */
  function buildExam(quizzes, opts) {
    const o = opts || {}, rnd = o.rnd || Math.random;
    const mods = (o.mods && o.mods.length ? o.mods : [...new Set(quizzes.map((q) => q.mod))]).slice().sort((a, b) => a - b);
    const pools = mods.map((m) => shuffle(quizzes.filter((q) => q.mod === m), rnd)).filter((p) => p.length);
    const available = pools.reduce((a, p) => a + p.length, 0);
    if (!available) throw new Error("no questions for those modules");
    const count = Math.max(1, Math.min(o.count || 10, available));
    const picked = [];
    for (let round = 0; picked.length < count; round++) {
      shuffle(pools, rnd).forEach((p) => { if (picked.length < count && round < p.length) picked.push(p[round]); });
    }
    const items = shuffle(picked, rnd).map((q) => ({ q, order: shuffle(q.choices.map((_, i) => i), rnd) }));
    return { items, mods: [...new Set(items.map((it) => it.q.mod))].sort((a, b) => a - b) };
  }

  /** answers[i] is the ORIGINAL choice index picked for item i, or null/undefined if left blank. */
  function scoreExam(exam, answers) {
    const byModule = {}, misses = [];
    let correct = 0, unanswered = 0;
    exam.items.forEach((it, i) => {
      const a = answers[i], blank = a === null || a === undefined, ok = !blank && a === it.q.answer;
      const m = byModule[it.q.mod] || (byModule[it.q.mod] = { correct: 0, total: 0 });
      m.total++;
      if (ok) { correct++; m.correct++; } else { misses.push({ item: it, chosen: blank ? null : a }); }
      if (blank) unanswered++;
    });
    return { correct, total: exam.items.length, unanswered, wrong: exam.items.length - correct - unanswered, percent: Math.round((correct / exam.items.length) * 100), byModule, misses };
  }

  /** A sensible time limit: about 75 seconds a question. */
  const suggestedSeconds = (count) => Math.max(60, Math.round((count * 75) / 30) * 30);

  const formatClock = (sec) => { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  return { buildExam, scoreExam, examShuffle: shuffle, suggestedSeconds, formatClock };
});
