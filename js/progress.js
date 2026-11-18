/* Keeps the student's progress in their own browser (localStorage) and nowhere else. If storage is blocked (private windows, some
 * settings), progress still works until the page is closed, and the progress page says so. Logic lives in js/lib/progress.js. */
(function () {
  "use strict";
  const L = window.OSLib, KEY = "osc-progress";
  let state = L.newProgress(), stored = true;

  try {
    const text = localStorage.getItem(KEY);
    if (text) { const r = L.parseProgress(text); if (r.ok) state = r.progress; }
  } catch (e) { stored = false; }

  function save() {
    try { localStorage.setItem(KEY, L.serializeProgress(state)); stored = true; } catch (e) { stored = false; }
  }
  function today() {
    const d = new Date(), pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const counts = () => { const c = {}; ((window.OSData && window.OSData.quizzes) || []).forEach((q) => { c[q.mod] = (c[q.mod] || 0) + 1; }); return c; };

  window.OSProgress = {
    get stored() { return stored; },
    get state() { return state; },
    visit(n) { try { L.markVisited(state, n, today()); save(); } catch (e) { /* ignore a bad module number */ } },
    answer(mod, questionText, correct) { try { L.recordAnswer(state, mod, L.questionId(questionText), !!correct); save(); } catch (e) { /* ignore */ } },
    card(term, knew) { try { L.gradeCard(state, term, !!knew); save(); } catch (e) { /* ignore */ } },
    exam(e) { try { L.recordExam(state, Object.assign({ date: today() }, e)); save(); } catch (err) { /* ignore */ } },
    summary() { return L.summarize(state, (window.OSData && window.OSData.modules) || [], counts()); },
    exportText() { return L.serializeProgress(state); },
    /** Replace everything with imported text. Returns { ok, error }. */
    importText(text) { const r = L.parseProgress(text); if (r.ok) { state = r.progress; save(); } return { ok: r.ok, error: r.error }; },
    clear() { state = L.newProgress(); try { localStorage.removeItem(KEY); stored = true; } catch (e) { stored = false; } }
  };

  const mod = document.body && document.body.dataset.module ? +document.body.dataset.module : 0;
  if (mod) window.OSProgress.visit(mod);
})();
