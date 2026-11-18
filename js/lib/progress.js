/* Learner progress: what a student has visited, answered and reviewed. Pure logic, no DOM and no storage; js/progress.js keeps it in the
 * student's own browser. Nothing here is ever sent anywhere. The state is plain data so it can be exported, imported and cleared.
 *
 *   visited : { "<module>": "YYYY-MM-DD" }                    the day a module page was first opened
 *   quiz    : { "<module>": { answered, correct, q: { "<id>": 0|1 } } }   q holds the latest result for each question
 *   cards   : { "<term>": { box: 0..3, seen } }               flashcard boxes (0 = still learning, 3 = well known)
 *   exams   : [ { date, mods, total, correct, seconds } ]     the last 20 exams
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = 1, MAX_BOX = 3, MAX_EXAMS = 20, MAX_TEXT = 200000;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;

  const newProgress = () => ({ v: VERSION, visited: {}, quiz: {}, cards: {}, exams: [] });

  /** A short stable id for a question, from its text (FNV-1a), so results survive reordering and added questions. */
  function questionId(text) {
    let h = 0x811c9dc5;
    for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }

  const isModule = (n) => Number.isInteger(n) && n >= 1 && n <= 999;

  function markVisited(p, mod, day) {
    if (!isModule(mod) || !DAY.test(day)) throw new Error("bad module or day");
    if (!p.visited[mod]) p.visited[mod] = day;
    return p;
  }

  /** Record one answered question. id is questionId(text). The latest result per question is what counts toward mastery. */
  function recordAnswer(p, mod, id, correct) {
    if (!isModule(mod) || typeof id !== "string" || !id) throw new Error("bad answer");
    const m = p.quiz[mod] || (p.quiz[mod] = { answered: 0, correct: 0, q: {} });
    m.answered++;
    if (correct) m.correct++;
    m.q[id] = correct ? 1 : 0;
    return p;
  }

  /** Flashcard result: a card you knew moves up a box, one you did not goes back to box 0. */
  function gradeCard(p, term, knew) {
    if (typeof term !== "string" || !term) throw new Error("bad card");
    const c = p.cards[term] || (p.cards[term] = { box: 0, seen: 0 });
    c.seen++;
    c.box = knew ? Math.min(MAX_BOX, c.box + 1) : 0;
    return p;
  }

  function recordExam(p, e) {
    if (!DAY.test(e.date) || !Array.isArray(e.mods) || !e.mods.every(isModule) || !Number.isInteger(e.total) || e.total < 1 || !Number.isInteger(e.correct) || e.correct < 0 || e.correct > e.total || !Number.isInteger(e.seconds) || e.seconds < 0) throw new Error("bad exam");
    p.exams.push({ date: e.date, mods: e.mods.slice(), total: e.total, correct: e.correct, seconds: e.seconds });
    if (p.exams.length > MAX_EXAMS) p.exams.splice(0, p.exams.length - MAX_EXAMS);
    return p;
  }

  /**
   * Per-module and overall summary. questionCounts: { "<module>": number of questions in the quiz bank }.
   * mastered = questions whose latest answer was right; percent is of all questions in the module (unanswered ones count as not yet mastered).
   */
  function summarize(p, modules, questionCounts) {
    const rows = modules.map((m) => {
      const q = p.quiz[m.n], total = questionCounts[m.n] || 0, mastered = q ? Object.values(q.q).filter((v) => v === 1).length : 0;
      return { n: m.n, title: m.title, visited: p.visited[m.n] || null, answered: q ? q.answered : 0, correct: q ? q.correct : 0, mastered: Math.min(mastered, total), total, percent: total ? Math.round((Math.min(mastered, total) / total) * 100) : 0 };
    });
    const cards = Object.values(p.cards), known = cards.filter((c) => c.box >= MAX_BOX).length;
    return {
      rows,
      visitedCount: rows.filter((r) => r.visited).length, moduleCount: rows.length,
      mastered: rows.reduce((a, r) => a + r.mastered, 0), questions: rows.reduce((a, r) => a + r.total, 0),
      cards: { seen: cards.length, known, learning: cards.length - known },
      exams: p.exams.slice()
    };
  }

  /** Export as text. */
  const serialize = (p) => JSON.stringify(p, null, 1);

  /**
   * Read exported text back. The text is untrusted, so it is rebuilt field by field: wrong types are rejected, unknown keys dropped, sizes limited.
   * Returns { ok: true, progress } or { ok: false, error }.
   */
  function parse(text) {
    if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Nothing to import." };
    if (text.length > MAX_TEXT) return { ok: false, error: "That file is too large to be a progress export." };
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, error: "That is not valid progress data (it could not be read as JSON)." }; }
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.v !== VERSION) return { ok: false, error: "That is not a progress export from this site (wrong version or shape)." };
    const p = newProgress();
    const own = (o) => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o).filter((k) => Object.prototype.hasOwnProperty.call(o, k)) : []);
    for (const k of own(raw.visited)) { if (isModule(+k) && String(+k) === k && typeof raw.visited[k] === "string" && DAY.test(raw.visited[k])) p.visited[k] = raw.visited[k]; }
    for (const k of own(raw.quiz)) {
      const m = raw.quiz[k];
      if (!(isModule(+k) && String(+k) === k) || !m || !Number.isInteger(m.answered) || !Number.isInteger(m.correct) || m.answered < 0 || m.correct < 0 || m.correct > m.answered) continue;
      const q = {};
      for (const id of own(m.q).slice(0, 500)) if (/^[a-z0-9]{1,8}$/.test(id) && (m.q[id] === 0 || m.q[id] === 1)) q[id] = m.q[id];
      p.quiz[k] = { answered: m.answered, correct: m.correct, q };
    }
    for (const t of own(raw.cards).slice(0, 1000)) {
      const c = raw.cards[t];
      if (t !== "__proto__" && t.length <= 100 && c && Number.isInteger(c.box) && c.box >= 0 && c.box <= MAX_BOX && Number.isInteger(c.seen) && c.seen >= 0) p.cards[t] = { box: c.box, seen: c.seen };
    }
    if (Array.isArray(raw.exams)) raw.exams.slice(-MAX_EXAMS).forEach((e) => { try { recordExam(p, e || {}); } catch (err) { /* skip a bad entry */ } });
    return { ok: true, progress: p };
  }

  return { newProgress, questionId, markVisited, recordAnswer, gradeCard, recordExam, summarize, serializeProgress: serialize, parseProgress: parse, PROGRESS_MAX_BOX: MAX_BOX };
});
