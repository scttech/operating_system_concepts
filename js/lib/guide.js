/* Study paths, discussion prompts and teaching notes: turning the data in js/data/{paths,prompts,teaching}.js into links and lists.
 * Pure logic, so the tests can check every link without a browser. Paths returned are relative to the site's root folder. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const PROMPT_KIND = { discuss: "Discuss", write: "Write", try: "Try it", design: "Design" };
  const STEP_KIND = { read: "Read", try: "Try", lab: "Lab", practice: "Practice", review: "Review" };

  /**
   * Where a target points, as a path from the site root, or null if it does not name anything.
   *   { mod, id? }        a module page (and a heading on it)
   *   { lab }             a lab page
   *   { page, hash? }     a page in pages/ (give its file name), optionally with a #hash
   * A target without mod takes defaultMod, so a prompt can link to its own module with only an id.
   */
  function targetPath(to, defaultMod, data) {
    if (!to || typeof to !== "object") return null;
    const frag = (s) => (s ? "#" + s : "");
    if (to.lab !== undefined) { const lab = (data.labs || []).find((l) => l.n === to.lab); return lab ? `labs/${lab.slug}.html` : null; }
    if (to.page) return /^[a-z0-9-]+\.html$/.test(to.page) ? "pages/" + to.page + frag(to.hash) : null;
    const n = to.mod !== undefined ? to.mod : defaultMod, m = data.modules.find((x) => x.n === n);
    return m ? `modules/${m.slug}.html${frag(to.id)}` : null;
  }

  /** The prompts for one module, ready to show: kind label, text, link (or null) and what to listen for (from the teaching notes, or ""). */
  function promptsFor(n, data) {
    const list = (data.prompts && data.prompts[n]) || [], listen = (data.teaching && data.teaching[n] && data.teaching[n].listen) || [];
    return list.map((p, i) => ({ k: p.k, kind: PROMPT_KIND[p.k] || p.k, text: p.text, href: p.to ? targetPath(p.to, n, data) : null, label: p.label || "", listen: listen[i] || "" }));
  }

  /** One step of a path with its link resolved. */
  function resolveStep(step, data) {
    return { kind: STEP_KIND[step.t] || step.t, t: step.t, label: step.label, note: step.note, href: targetPath(step.to, undefined, data) };
  }

  /** Modules a path visits, in order, without repeats; and the minutes the labs on it take (from the lab list). */
  function pathSummary(path, data) {
    const mods = [], labs = [];
    path.steps.forEach((s) => {
      if (s.to.mod !== undefined && !mods.includes(s.to.mod)) mods.push(s.to.mod);
      if (s.to.lab !== undefined && !labs.includes(s.to.lab)) labs.push(s.to.lab);
    });
    return { modules: mods, labs, labMinutes: labs.reduce((t, n) => { const l = (data.labs || []).find((x) => x.n === n); return t + (l ? l.minutes : 0); }, 0) };
  }

  /** The prompts for the chosen modules, in reading order: [{n, title, prompts}] (the prompt sheet for the handouts page). */
  function promptSheet(data, chosen, order) {
    const want = new Set(chosen);
    return (order || data.modules.map((m) => m.n)).filter((n) => want.has(n)).map((n) => ({ n, title: data.modules.find((m) => m.n === n).title, prompts: promptsFor(n, data) }));
  }

  return { PROMPT_KIND, STEP_KIND, targetPath, promptsFor, resolveStep, pathSummary, promptSheet };
});
