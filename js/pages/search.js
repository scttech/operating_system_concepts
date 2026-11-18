/* Site-wide search page: reads the query from the box or from the link (search.html?q=… or #q=…), shows ranked results with the matches highlighted. */
(function () {
  "use strict";
  const { h } = OSUI;
  const L = OSLib, root = document.body.dataset.root || "";
  const docs = L.buildDocs(OSData);
  const input = document.getElementById("q"), kindSel = document.getElementById("kind"), status = document.getElementById("status"), list = document.getElementById("results");
  const GROUPS = [["", "Everything"], ["Lesson", "Lessons"], ["Module", "Module overviews"], ["Glossary", "Glossary"], ["FAQ", "FAQ"], ["Lab", "Labs"], ["Operating system", "Operating systems"], ["Cheat sheet", "Cheat sheet"], ["Study path", "Study paths"], ["Prompt", "Discussion prompts"], ["Teaching note", "Teaching notes"], ["Study tool", "Study tools"]];
  GROUPS.forEach(([v, label]) => kindSel.append(h("option", { value: v, text: label })));

  /** Text with <mark> around the matches, built from text nodes only (nothing from a page or a query is ever parsed as HTML). */
  const marked = (segments) => segments.map((s) => (s.match ? h("mark", { text: s.text }) : document.createTextNode(s.text)));
  const safe = (s) => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch (e) { return s; } };
  function fromLink() {
    const m = /[?#&]q=([^&#]*)/.exec(location.search + location.hash);
    return m ? safe(m[1]).slice(0, 200) : "";
  }

  function render() {
    const q = input.value, kind = kindSel.value, r = L.searchDocs(docs, q, { kinds: kind ? [kind] : [] });
    list.replaceChildren();
    if (!r.words.length) { status.textContent = "Type one or more words to search."; return; }
    if (!r.total) { status.textContent = `No results for “${q.trim()}”. Try fewer or shorter words, or a different spelling.`; return; }
    status.textContent = `${r.total} result${r.total === 1 ? "" : "s"} for “${q.trim()}”${r.total > r.results.length ? `, showing the best ${r.results.length}` : ""}.`;
    r.results.forEach(({ doc }) => {
      list.append(h("li", { class: "result" },
        h("div", {}, h("span", { class: "tag", text: doc.kind }), " ", h("a", { href: root + doc.url }, ...marked(L.highlightMatches(doc.title, r.words)))),
        doc.where ? h("div", { class: "small where", text: doc.where }) : null,
        h("p", { class: "snippet" }, ...marked(L.searchSnippet(doc, r.words)))));
    });
  }
  function remember() {
    try { history.replaceState(null, "", input.value.trim() ? `?q=${encodeURIComponent(input.value.trim())}` : location.pathname); } catch (e) { /* not available from file:// in some browsers */ }
  }

  input.value = fromLink();
  input.addEventListener("input", () => { render(); remember(); });
  kindSel.addEventListener("change", render);
  document.getElementById("search-form").addEventListener("submit", (e) => { e.preventDefault(); render(); remember(); });
  render();
})();
