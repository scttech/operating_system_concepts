/* Flashcards from the glossary: building a deck and choosing the next card so that cards you are still learning come up more often.
 * Pure logic. The boxes (0 = still learning ... 3 = well known) are kept in the learner's progress. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const WEIGHT = [8, 4, 2, 1];   // how likely a card is to be chosen, by box

  /** Cards from glossary entries ({term, cat, def}), optionally one category. */
  function buildDeck(glossary, opts) {
    const o = opts || {};
    return glossary.filter((g) => !o.cat || g.cat === o.cat).map((g) => ({ term: g.term, cat: g.cat, def: g.def }));
  }

  const boxOf = (cards, term) => (cards && Object.prototype.hasOwnProperty.call(cards, term) ? cards[term].box : 0);

  /** Cards still worth studying: everything below the top box, or the whole deck when `includeKnown`. */
  function studyable(deck, cards, includeKnown) {
    return deck.filter((c) => includeKnown || boxOf(cards, c.term) < WEIGHT.length - 1);
  }

  /**
   * Choose the next card at random, weighted by box. rnd() returns a number in [0, 1). The card shown last time is avoided unless it is the only one.
   * Returns null for an empty deck.
   */
  function pickCard(deck, cards, lastTerm, rnd) {
    if (!deck.length) return null;
    const pool = deck.length > 1 ? deck.filter((c) => c.term !== lastTerm) : deck;
    const weights = pool.map((c) => WEIGHT[Math.min(boxOf(cards, c.term), WEIGHT.length - 1)]);
    let r = rnd() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r < 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  /** Counts per box for a deck, for the "how am I doing" line. */
  function deckStats(deck, cards) {
    const boxes = [0, 0, 0, 0];
    deck.forEach((c) => { boxes[Math.min(boxOf(cards, c.term), 3)]++; });
    return { total: deck.length, boxes, known: boxes[3], learning: deck.length - boxes[3] };
  }

  return { buildDeck, pickCard, studyableCards: studyable, deckStats, CARD_WEIGHTS: WEIGHT };
});
