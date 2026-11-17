/* Page replacement simulation. Pure logic. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const ALGOS = { FIFO: "FIFO", LRU: "LRU", OPT: "Optimal (OPT)", CLOCK: "Clock (second chance)" };

  /** Returns {faults, steps:[{ref, frames, fault, evicted, slot, hand, refbits}]} */
  function replacePages(refs, nFrames, algo) {
    const frames = Array(nFrames).fill(null);
    const refbit = Array(nFrames).fill(0);
    const lastUse = new Map();
    let fifo = 0, hand = 0, faults = 0;
    const steps = [];
    refs.forEach((r, i) => {
      let slot = frames.indexOf(r), fault = false, evicted = null;
      if (slot >= 0) {
        if (algo === "CLOCK") refbit[slot] = 1;
      } else {
        fault = true; faults++;
        const empty = frames.indexOf(null);
        if (empty >= 0) {
          slot = empty;
          if (algo === "CLOCK") hand = (slot + 1) % nFrames;
        } else if (algo === "FIFO") {
          slot = fifo; fifo = (fifo + 1) % nFrames;
        } else if (algo === "LRU") {
          slot = 0;
          frames.forEach((f, s) => { if (lastUse.get(f) < lastUse.get(frames[slot])) slot = s; });
        } else if (algo === "OPT") {
          let far = -1; slot = 0;
          frames.forEach((f, s) => {
            let next = refs.indexOf(f, i + 1);
            if (next < 0) next = Infinity;
            if (next > far) { far = next; slot = s; }
          });
        } else { // CLOCK
          while (refbit[hand]) { refbit[hand] = 0; hand = (hand + 1) % nFrames; }
          slot = hand; hand = (hand + 1) % nFrames;
        }
        evicted = frames[slot];
        frames[slot] = r;
        if (algo === "CLOCK") refbit[slot] = 1;
      }
      lastUse.set(r, i);
      steps.push({ ref: r, frames: frames.slice(), fault, evicted, slot, hand, refbits: refbit.slice() });
    });
    return { faults, steps };
  }

  function faultsByFrames(refs, algo, maxFrames) {
    const out = [];
    for (let f = 1; f <= maxFrames; f++) out.push({ frames: f, faults: replacePages(refs, f, algo).faults });
    return out;
  }

  /** Effective access time in ns. p = page-fault probability. */
  function effectiveAccessTime(memNs, faultNs, p) { return (1 - p) * memNs + p * faultNs; }

  return { pageAlgos: ALGOS, replacePages, faultsByFrames, effectiveAccessTime };
});
