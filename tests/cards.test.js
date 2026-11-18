/* Flashcards: deck building and the weighted choice of the next card. */
(function () {
  "use strict";
  let L, D;
  if (typeof require !== "undefined") {
    globalThis.window = globalThis;
    delete globalThis.OSData;
    delete require.cache[require.resolve("../js/data/glossary.js")];
    require("../js/data/glossary.js");
    L = require("../js/lib/cards.js");
  } else L = window.OSLib;
  D = window.OSData;
  const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  QUnit.module("flashcards");

  QUnit.test("Decks come from the glossary, optionally by topic", (assert) => {
    const all = L.buildDeck(D.glossary);
    assert.equal(all.length, D.glossary.length);
    const cats = [...new Set(D.glossary.map((g) => g.cat))];
    assert.equal(cats.map((c) => L.buildDeck(D.glossary, { cat: c }).length).reduce((a, b) => a + b, 0), all.length, "topics partition the deck");
    assert.true(L.buildDeck(D.glossary, { cat: "Scheduling" }).every((c) => c.cat === "Scheduling"));
    assert.deepEqual(L.buildDeck(D.glossary, { cat: "No such topic" }), []);
    assert.deepEqual(Object.keys(all[0]).sort(), ["cat", "def", "term"]);
  });

  QUnit.test("Studyable cards leave out the well-known ones unless asked", (assert) => {
    const deck = [{ term: "A" }, { term: "B" }, { term: "C" }], cards = { A: { box: 3, seen: 5 }, B: { box: 1, seen: 1 } };
    assert.deepEqual(L.studyableCards(deck, cards, false).map((c) => c.term), ["B", "C"]);
    assert.equal(L.studyableCards(deck, cards, true).length, 3);
    assert.equal(L.studyableCards(deck, undefined, false).length, 3, "no progress yet means everything is new");
  });

  QUnit.test("Next card: never the same one twice in a row, null when empty, and the only card repeats", (assert) => {
    const deck = [{ term: "A" }, { term: "B" }, { term: "C" }];
    const r = rng(3);
    let last = null, repeat = 0;
    for (let i = 0; i < 500; i++) { const c = L.pickCard(deck, {}, last, r); if (c.term === last) repeat++; last = c.term; }
    assert.equal(repeat, 0);
    assert.equal(L.pickCard([], {}, null, r), null);
    assert.equal(L.pickCard([{ term: "Only" }], {}, "Only", r).term, "Only");
  });

  QUnit.test("Cards you are still learning come up more often, in the stated proportions", (assert) => {
    const deck = ["new", "b1", "b2", "b3"].map((term) => ({ term })), cards = { b1: { box: 1 }, b2: { box: 2 }, b3: { box: 3 } };
    const r = rng(99), n = { new: 0, b1: 0, b2: 0, b3: 0 };
    for (let i = 0; i < 30000; i++) n[L.pickCard(deck, cards, null, r).term]++;
    const total = 8 + 4 + 2 + 1;
    [["new", 8], ["b1", 4], ["b2", 2], ["b3", 1]].forEach(([k, w]) => assert.ok(Math.abs(n[k] / 30000 - w / total) < 0.012, `${k} is chosen about ${w}/${total} of the time (${(n[k] / 300).toFixed(1)}%)`));
  });

  QUnit.test("Deck statistics", (assert) => {
    const deck = [{ term: "A" }, { term: "B" }, { term: "C" }, { term: "D" }];
    assert.deepEqual(L.deckStats(deck, { A: { box: 3 }, B: { box: 3 }, C: { box: 1 } }), { total: 4, boxes: [1, 1, 0, 2], known: 2, learning: 2 });
    assert.deepEqual(L.deckStats([], {}), { total: 0, boxes: [0, 0, 0, 0], known: 0, learning: 0 });
  });
})();
